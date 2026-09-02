/**
 * CardVerse — how an action reaches the engine.
 *
 * This file is the seam that online play will slot into, and the reason it
 * exists now rather than later. Nothing in the UI ever calls `engine.apply()`
 * directly; it hands an action to a Transport, and the Transport decides
 * whether that means "apply it here" or "send it to whoever is running this
 * table". Adding real multiplayer is then a new Transport plus a lobby screen,
 * not a rewrite of seven games.
 *
 * The contract:
 *
 *     send(action)          deliver a seat's decision toward the authority
 *     onApplied(fn)         called after the authority has accepted one
 *     isAuthority           true when this browser owns the engine
 *     close()
 *
 * `LocalTransport` is the authority itself, which covers AI tables and
 * pass-the-device play. `PeerTransport` at the bottom sketches the online
 * shape precisely enough that writing it does not require re-deciding
 * anything — see the note there before starting it.
 */

(() => {
    'use strict';

    class Transport {
        constructor() {
            this.handlers = [];
            this.isAuthority = true;
        }
        onApplied(fn) { this.handlers.push(fn); return this; }
        fire(action, ok) {
            for (const fn of this.handlers) {
                try { fn(action, ok); } catch (err) { console.error('[transport]', err); }
            }
        }
        send(_action) { throw new Error('send() not implemented'); }
        close() {}
    }

    /**
     * One browser, one engine, no network. Every seat — you, the AI, and any
     * other human sharing the device — posts here and is answered immediately.
     */
    class LocalTransport extends Transport {
        constructor(engine) {
            super();
            this.engine = engine;
            this.isAuthority = true;
        }
        send(action) {
            const ok = this.engine.apply(action);
            this.fire(action, ok);
            return ok;
        }
    }

    /**
     * NOT BUILT — the shape online play takes, recorded while the reasons are
     * fresh so the decisions do not have to be made twice.
     *
     * Host authority, not lockstep. One browser holds the only engine; the
     * others hold no engine at all and render from snapshots it broadcasts.
     * That is why `GameEngine.snapshot()` returns plain JSON and why every
     * engine keeps `log` — a late joiner or a reconnect replays the log, and a
     * suspicious client can be checked against it.
     *
     * Why not lockstep-with-a-shared-seed, which the deterministic RNG would
     * allow: it hands every player the shuffled deck, so any peer could read
     * the other hands out of memory. Fine for chess, fatal for cards. The seed
     * stays with the host; peers learn a card when they are dealt it.
     *
     * What remains to decide is only the pipe (WebRTC via a signalling broker,
     * or a small WebSocket server), not the model above.
     */
    class PeerTransport extends Transport {
        constructor() {
            super();
            throw new Error('Online play is not built yet — see the note in transport.js.');
        }
    }

    window.CV = window.CV || {};
    window.CV.Transport      = Transport;
    window.CV.LocalTransport = LocalTransport;
    window.CV.PeerTransport  = PeerTransport;
})();
