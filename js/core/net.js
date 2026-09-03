/**
 * CardVerse — the pipe. WebRTC peer-to-peer, with room codes.
 *
 * One browser hosts: it owns the only engine, and it is the only thing that
 * decides anything. Everyone else connects to it, sends the action they want
 * to take, and renders whatever the host sends back. See transport.js for why
 * it is host-authority rather than lockstep — the short version is that a
 * shared seed hands every peer the shuffled deck.
 *
 * The one thing WebRTC cannot do by itself is *introduce* two browsers. That
 * needs a signalling server, so this uses PeerJS's free public broker to swap
 * connection details and nothing else: once the two are talking, the cards go
 * directly between them and the broker sees none of it. It is third-party and
 * occasionally slow, which is why every failure path here ends in a sentence a
 * player can act on rather than a hang.
 *
 * PeerJS is loaded from a CDN with `async defer`, exactly like Google's
 * sign-in library. If it never arrives, `available()` is false and online play
 * says so; everything else in CardVerse carries on working.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** Room ids are namespaced so we never collide with another PeerJS app. */
    const PREFIX = 'cardverse-v1-';
    const CODE_LEN = 6;

    /** How long to wait for the broker before giving up on it. */
    const OPEN_TIMEOUT = 20000;
    const CONNECT_TIMEOUT = 20000;

    const available = () => typeof window.Peer === 'function';

    function requireLib() {
        if (!available()) {
            throw new Error('The peer-to-peer library did not load. Check your internet '
                + 'connection, or whether an extension is blocking unpkg/cdnjs, then reload.');
        }
    }

    /** A 6-digit code. Digits only — it gets read aloud and typed on a phone. */
    function newCode(rng) {
        const r = rng || new CV.RNG();
        let code = '';
        for (let i = 0; i < CODE_LEN; i++) code += r.int(10);
        return code;
    }

    const idFor = (code) => PREFIX + code;

    /**
     * Wrap a PeerJS peer so every path settles exactly once. Left to itself a
     * closed window or a broker that never answers calls no callback at all,
     * and the UI waits for ever.
     */
    function openPeer(id) {
        requireLib();
        return new Promise((resolve, reject) => {
            let done = false;
            const peer = new window.Peer(id, { debug: 0 });
            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                try { peer.destroy(); } catch (_) { /* already gone */ }
                reject(new Error('The matchmaking server did not answer. Try again in a moment.'));
            }, OPEN_TIMEOUT);

            peer.on('open', () => {
                if (done) return;
                done = true; clearTimeout(timer); resolve(peer);
            });
            peer.on('error', (err) => {
                if (done) return;
                done = true; clearTimeout(timer);
                try { peer.destroy(); } catch (_) { /* already gone */ }
                reject(translate(err));
            });
        });
    }

    /** PeerJS error types, said in words a player can act on. */
    function translate(err) {
        const type = (err && err.type) || '';
        if (type === 'unavailable-id')   return new Error('That room code is already taken. Making a new one…');
        if (type === 'peer-unavailable') return new Error('No table with that code. Check the six digits, and that the host still has the tab open.');
        if (type === 'network')          return new Error('Lost contact with the matchmaking server. Check your connection and try again.');
        if (type === 'browser-incompatible') return new Error('This browser cannot do peer-to-peer play.');
        if (type === 'webrtc')           return new Error('The direct connection failed. Some networks block it — a phone hotspot usually works.');
        return new Error((err && err.message) || 'The connection failed.');
    }

    /* ------------------------------------------------------------------ *
     * Host
     * ------------------------------------------------------------------ */

    /**
     * The host holds the room. It assigns seats, keeps the roster, forwards
     * every peer action into the engine, and sends each peer its own redacted
     * view — never one shared broadcast, because each seat is allowed to see
     * different things.
     */
    class Host {
        constructor() {
            this.code = null;
            this.peer = null;
            this.conns = new Map();     // peerId -> { conn, seat, name, avatar, alive }
            this.handlers = {};
            this.closed = false;
            this.seatsTaken = 1;        // seat 0 is the host
        }

        on(event, fn) { (this.handlers[event] = this.handlers[event] || []).push(fn); return this; }

        fire(event, ...args) {
            for (const fn of (this.handlers[event] || [])) {
                try { fn(...args); } catch (err) { console.error('[net:host]', event, err); }
            }
        }

        /** Claim a code. Retries on collision, which is why it takes attempts. */
        async open(maxPlayers) {
            this.maxPlayers = maxPlayers;
            for (let attempt = 0; attempt < 5; attempt++) {
                const code = newCode();
                try {
                    this.peer = await openPeer(idFor(code));
                    this.code = code;
                    break;
                } catch (err) {
                    if (!/already taken/i.test(err.message) || attempt === 4) throw err;
                }
            }
            this.peer.on('connection', (conn) => this.accept(conn));
            this.peer.on('error', (err) => this.fire('error', translate(err)));
            this.peer.on('disconnected', () => {
                // The broker dropped us. Existing peers stay connected; only new
                // joins would fail, so reconnect quietly rather than alarming anyone.
                if (!this.closed) { try { this.peer.reconnect(); } catch (_) { /* nothing to do */ } }
            });
            return this.code;
        }

        accept(conn) {
            if (this.closed) return conn.close();
            if (this.seatsTaken >= this.maxPlayers) {
                conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); });
                return;
            }
            const seat = this.seatsTaken++;
            const entry = { conn, seat, name: 'Player ' + (seat + 1), avatar: '👤', alive: true };
            this.conns.set(conn.peer, entry);

            conn.on('open', () => {
                conn.send({ t: 'welcome', seat, code: this.code });
                this.fire('join', entry);
            });
            conn.on('data', (msg) => this.receive(entry, msg));
            conn.on('close', () => this.drop(entry, 'left the table'));
            conn.on('error', () => this.drop(entry, 'lost connection'));
        }

        receive(entry, msg) {
            if (!msg || typeof msg.t !== 'string') return;
            if (msg.t === 'hello') {
                entry.name = String(msg.name || entry.name).slice(0, 16);
                entry.avatar = String(msg.avatar || entry.avatar).slice(0, 4);
                this.fire('roster');
                return;
            }
            if (msg.t === 'action') {
                // The seat is taken from the connection, never from the message.
                // Otherwise any peer could act for anybody at the table.
                this.fire('action', Object.assign({}, msg.action, { seat: entry.seat }));
                return;
            }
            if (msg.t === 'chat') this.fire('chat', entry, String(msg.text || '').slice(0, 200));
        }

        drop(entry, why) {
            if (!this.conns.has(entry.conn.peer)) return;
            entry.alive = false;
            this.conns.delete(entry.conn.peer);
            this.fire('leave', entry, why);
        }

        send(seat, msg) {
            for (const e of this.conns.values()) {
                if (e.seat === seat && e.alive) { try { e.conn.send(msg); } catch (_) { /* dropping */ } }
            }
        }

        broadcast(msg) {
            for (const e of this.conns.values()) {
                if (e.alive) { try { e.conn.send(msg); } catch (_) { /* dropping */ } }
            }
        }

        /** Each seat gets its own view — the whole point of `snapshotFor`. */
        sendViews(engine) {
            for (const e of this.conns.values()) {
                if (!e.alive) continue;
                try { e.conn.send({ t: 'state', view: engine.snapshotFor(e.seat) }); }
                catch (_) { /* dropping */ }
            }
        }

        roster() {
            const out = [{ seat: 0, name: CV.Profile.get().name, avatar: CV.Profile.get().avatar, host: true, alive: true }];
            for (const e of this.conns.values()) out.push({ seat: e.seat, name: e.name, avatar: e.avatar, host: false, alive: e.alive });
            return out.sort((a, b) => a.seat - b.seat);
        }

        close(reason) {
            this.closed = true;
            try { this.broadcast({ t: 'bye', reason: reason || 'The host closed the table.' }); } catch (_) { /* going anyway */ }
            setTimeout(() => {
                for (const e of this.conns.values()) { try { e.conn.close(); } catch (_) { /* fine */ } }
                try { this.peer && this.peer.destroy(); } catch (_) { /* fine */ }
            }, 200);
        }
    }

    /* ------------------------------------------------------------------ *
     * Client
     * ------------------------------------------------------------------ */

    /** A guest. Holds no engine at all — it renders what the host sends. */
    class Client {
        constructor() {
            this.peer = null;
            this.conn = null;
            this.seat = -1;
            this.handlers = {};
            this.closed = false;
        }

        on(event, fn) { (this.handlers[event] = this.handlers[event] || []).push(fn); return this; }

        fire(event, ...args) {
            for (const fn of (this.handlers[event] || [])) {
                try { fn(...args); } catch (err) { console.error('[net:client]', event, err); }
            }
        }

        async join(code) {
            this.peer = await openPeer(undefined);
            this.peer.on('error', (err) => this.fire('error', translate(err)));

            return new Promise((resolve, reject) => {
                let settled = false;
                const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };

                const conn = this.peer.connect(idFor(code), { reliable: true });
                this.conn = conn;

                const timer = setTimeout(() => {
                    finish(reject, new Error('No table answered that code. Check the six digits, '
                        + 'and that the host still has CardVerse open.'));
                }, CONNECT_TIMEOUT);

                conn.on('open', () => {
                    const p = CV.Profile.get();
                    conn.send({ t: 'hello', name: p.name, avatar: p.avatar });
                });
                conn.on('data', (msg) => {
                    if (!msg || typeof msg.t !== 'string') return;
                    if (msg.t === 'welcome') { this.seat = msg.seat; finish(resolve, msg); }
                    if (msg.t === 'full')    finish(reject, new Error('That table is full.'));
                    this.fire(msg.t, msg);
                });
                conn.on('close', () => {
                    finish(reject, new Error('The host closed the connection.'));
                    if (!this.closed) this.fire('bye', { reason: 'The connection to the host was lost.' });
                });
                conn.on('error', (err) => finish(reject, translate(err)));
                this.peer.on('error', (err) => finish(reject, translate(err)));
            });
        }

        send(msg) {
            try { this.conn && this.conn.send(msg); } catch (_) { /* the close handler reports it */ }
        }

        act(action) { this.send({ t: 'action', action }); }

        close() {
            this.closed = true;
            try { this.conn && this.conn.close(); } catch (_) { /* fine */ }
            try { this.peer && this.peer.destroy(); } catch (_) { /* fine */ }
        }
    }

    CV.Net = { available, newCode, idFor, Host, Client, PREFIX };
})();
