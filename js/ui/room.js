/**
 * CardVerse — the online room: hosting one, joining one, and playing in it.
 *
 * The host is an ordinary local table with two additions: every peer action is
 * fed into its engine, and after every change each peer is sent its own
 * `snapshotFor(seat)`. The guests run `RemoteTable`, which wears the engine's
 * read surface over those snapshots, so the same table screen serves everyone.
 *
 * Empty chairs are filled with AI, so a table of two friends is still a table
 * of five if that is what was chosen. A friend who drops out becomes an AI
 * mid-hand rather than freezing the game for everybody else — the alternative
 * is four people waiting on someone whose train went into a tunnel.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { $, esc, fmt } = CV.UI;

    let host = null;      // CV.Net.Host when hosting
    let client = null;    // CV.Net.Client when guesting
    let room = null;      // { code, gameCode, roomId, aiLevel, seats, started }
    let table = null;
    let view = null;

    const GUEST_STACK = 5000;

    /* ------------------------------------------------------------------ *
     * The room screen
     * ------------------------------------------------------------------ */

    function render(params = {}) {
        if (params.mode === 'host') return paintHost();
        if (params.mode === 'join') return paintJoin();
        paintChoice();
    }

    function paintChoice() {
        if (!CV.Net.available()) {
            $('roomBody').innerHTML = `
                <div class="card-panel">
                    <h3>Online play is unavailable</h3>
                    <p class="muted">The peer-to-peer library did not load. Check your connection
                    or whether an extension is blocking it, then reload. Everything else in
                    CardVerse works without it — including pass-and-play, where friends share
                    this device.</p>
                    <div class="btn-row"><button class="btn" data-go="home">Back to lobby</button></div>
                </div>`;
            return;
        }
        $('roomBody').innerHTML = `
            <div class="room-choice">
                <button class="room-big" id="roomHost">
                    <span class="icon">🎲</span>
                    <b>Host a table</b>
                    <small>You deal. Friends join with a 6-digit code.</small>
                </button>
                <button class="room-big" id="roomJoin">
                    <span class="icon">🔑</span>
                    <b>Join a table</b>
                    <small>Type the code your friend gives you.</small>
                </button>
            </div>
            <p class="muted small center">Play goes directly between your devices. Nothing about the
            game passes through CardVerse — only an introduction service that swaps addresses.</p>`;
        $('roomHost').addEventListener('click', () => CV.UI.go('room', { mode: 'host' }));
        $('roomJoin').addEventListener('click', () => CV.UI.go('room', { mode: 'join' }));
    }

    /* ---- hosting -------------------------------------------------------- */

    function paintHost() {
        const games = CV.Registry.playable();
        room = room || { gameCode: games[0].code, roomId: 'beginner', aiLevel: CV.Settings.get().aiLevel, fill: true };

        $('roomBody').innerHTML = `
            <div class="card-panel">
                <h3>Table settings</h3>
                <label class="row-opt"><span>Game</span>
                    <select id="rmGame">${games.map((g) => `<option value="${g.code}" ${room.gameCode === g.code ? 'selected' : ''}>${g.icon} ${esc(g.name)}</option>`).join('')}</select>
                </label>
                <label class="row-opt"><span>Room</span>
                    <select id="rmRoom">${CV.Registry.ROOMS.map((r) => `<option value="${r.id}" ${room.roomId === r.id ? 'selected' : ''}>${r.icon} ${esc(r.name)} — bets ${fmt(r.bet[0])}–${fmt(r.bet[1])}</option>`).join('')}</select>
                </label>
                <label class="row-opt"><span>Fill empty seats with AI</span>
                    <input type="checkbox" id="rmFill" ${room.fill ? 'checked' : ''}>
                </label>
                <label class="row-opt"><span>AI difficulty</span>
                    <select id="rmLevel">${Object.entries(CV.AI_LEVELS).map(([k, v]) => `<option value="${k}" ${room.aiLevel === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select>
                </label>
                <div class="btn-row"><button class="btn primary big" id="rmOpen">Open the table</button></div>
            </div>
            <div id="rmLobby"></div>`;

        $('rmGame').addEventListener('change', (e) => { room.gameCode = e.target.value; });
        $('rmRoom').addEventListener('change', (e) => { room.roomId = e.target.value; });
        $('rmLevel').addEventListener('change', (e) => { room.aiLevel = e.target.value; });
        $('rmFill').addEventListener('change', (e) => { room.fill = e.target.checked; });
        $('rmOpen').addEventListener('click', openTable);
    }

    async function openTable(ev) {
        const btn = ev.currentTarget;
        const game = CV.Registry.get(room.gameCode);
        const roomDef = CV.Registry.room(room.roomId);
        const p = CV.Profile.get();

        if (p.coins < roomDef.entry + roomDef.bet[0]) {
            return CV.UI.say('Not enough coins',
                `Sitting in the ${esc(roomDef.name)} needs ${fmt(roomDef.entry + roomDef.bet[0])} coins.`);
        }

        CV.UI.flash(btn, '⏳ Opening…', 25000);
        try {
            host = new CV.Net.Host();
            const code = await host.open(game.players[1]);
            room.code = code;
            room.started = false;
            btn.disabled = true;

            host.on('join', () => { paintLobby(); CV.UI.toast('Someone joined the table', 'ok'); });
            host.on('roster', paintLobby);
            host.on('leave', (entry) => { onLeave(entry); paintLobby(); });
            host.on('action', (action) => { if (table) table.dispatch(action); });
            host.on('error', (err) => CV.UI.toast(err.message, 'warn', 4000));

            paintLobby();
        } catch (err) {
            btn.disabled = false;
            CV.UI.say('Could not open the table', esc(err.message));
            if (host) { host.close(); host = null; }
        }
    }

    function paintLobby() {
        if (!host || !room.code) return;
        const game = CV.Registry.get(room.gameCode);
        const people = host.roster();
        const max = game.players[1];

        $('rmLobby').innerHTML = `
            <div class="card-panel">
                <h3>Room code</h3>
                <div class="room-code" id="rmCode" title="Click to copy">${room.code.split('').map((d) => `<span>${d}</span>`).join('')}</div>
                <p class="muted small center">Read this out, or tap it to copy. Keep this tab open —
                the table lives in it.</p>
            </div>
            <div class="card-panel">
                <h3>At the table <small class="muted">${people.length} of ${max}</small></h3>
                ${people.map((pl) => `
                    <div class="room-player">
                        <span class="avatar">${pl.avatar}</span>
                        <b>${esc(pl.name)}</b>
                        ${pl.host ? '<span class="tag on">Host</span>' : '<span class="tag">Guest</span>'}
                    </div>`).join('')}
                ${room.fill && people.length < max
                    ? `<p class="muted small">${max - people.length} empty seat${max - people.length === 1 ? '' : 's'} will be filled with AI.</p>`
                    : ''}
                <div class="btn-row">
                    <button class="btn primary big" id="rmStart">${room.started ? 'Next hand' : 'Start playing'}</button>
                    <button class="btn ghost" id="rmClose">Close the table</button>
                </div>
            </div>`;

        $('rmCode').addEventListener('click', () => {
            navigator.clipboard && navigator.clipboard.writeText(room.code)
                .then(() => CV.UI.toast('Code copied', 'ok', 1200))
                .catch(() => CV.UI.toast('Copy failed — read it out instead', 'warn'));
        });
        $('rmStart').addEventListener('click', startHosted);
        $('rmClose').addEventListener('click', () => {
            CV.UI.confirm('Close the table?', 'Everyone is disconnected and the code stops working.',
                'Close it', () => { teardown(); CV.UI.go('home'); }, true);
        });
    }

    /** A guest left. Their seat carries on as an AI rather than stalling everyone. */
    function onLeave(entry) {
        CV.UI.toast(`${entry.name} left the table`, 'warn', 3000);
        if (!table || !table.engine.seats[entry.seat]) return;
        const seat = table.engine.seats[entry.seat];
        seat.kind = 'ai';
        seat.level = room.aiLevel;
        seat.name = seat.name + ' (AI)';
        table.tick();
    }

    /* ---- starting a hosted hand ----------------------------------------- */

    function startHosted() {
        const game = CV.Registry.get(room.gameCode);
        const roomDef = CV.Registry.room(room.roomId);
        const p = CV.Profile.get();
        const people = host.roster();

        if (!room.started && roomDef.entry && !CV.Profile.spend(roomDef.entry)) {
            return CV.UI.say('Not enough coins', 'The table fee could not be taken.');
        }

        // Seat 0 is the host; guests keep the seat they were given; the rest are AI.
        const seats = [];
        const bots = CV.AIPlayer.personas(game.players[1], new CV.RNG());
        for (let i = 0; i < game.players[1]; i++) {
            const person = people.find((pl) => pl.seat === i);
            if (i === 0) {
                seats.push({ kind: 'human', isYou: true, name: p.name, avatar: p.avatar, coins: p.coins });
            } else if (person) {
                seats.push({ kind: 'remote', name: person.name, avatar: person.avatar, coins: GUEST_STACK });
            } else if (room.fill) {
                seats.push({ kind: 'ai', name: bots[i].name, avatar: bots[i].avatar, level: room.aiLevel, coins: roomDef.bet[1] * 30 });
            }
        }

        room.started = true;
        room.session = room.session || { game, gameCode: room.gameCode, room: roomDef, seats, shoe: null, lastBet: null, hands: 0 };
        room.session.seats = seats;

        host.broadcast({ t: 'start', game: room.gameCode, room: room.roomId });
        CV.UI.go('table', { online: true });
    }

    /**
     * Build the host's table. Called from play.js so both online and offline
     * tables come up the same way.
     */
    function buildHostTable(root) {
        // A second hand reuses the room but never the table.
        if (table) { try { table.destroy(); } catch (_) { /* going */ } table = null; }
        if (view)  { try { view.unmount(); } catch (_) { /* going */ } view = null; }

        const session = room.session;
        const p = CV.Profile.get();
        for (const s of session.seats) if (s.isYou) { s.coins = p.coins; s.name = p.name; s.avatar = p.avatar; }

        table = new CV.Table({
            gameCode: room.gameCode,
            seats: session.seats.map((s, i) => new CV.Seat(i, s)),
            config: { room: room.roomId, shoe: session.shoe },
        });
        table.speed = CV.Settings.get().fastAnim ? 0.4 : 1;

        view = new session.game.View(root, table, session);
        view.mount();

        table.onChange((events) => {
            host.sendViews(table.engine);
            const settled = events.find((e) => e.type === 'settled');
            if (settled) {
                host.broadcast({ t: 'over', result: table.engine.result() });
                waitForBoard(() => hostFinished(settled.result));
            }
        });

        table.start();
        host.sendViews(table.engine);
        return { table, view };
    }

    /** Same beat the solo table takes — let the dealer finish turning first. */
    function waitForBoard(done) {
        const speed = (table && table.speed) || 1;
        const tick = () => {
            if (view && view.revealing) return setTimeout(tick, 180);
            setTimeout(done, 1500 * speed);
        };
        tick();
    }

    function hostFinished(summary) {
        room.session.hands++;
        // Carry each seat's stack into the next hand, guests included.
        table.engine.seats.forEach((s, i) => { if (room.session.seats[i]) room.session.seats[i].coins = s.coins; });
        room.session.shoe = table.engine.shoeState;
        CV.UI.header();
        CV.ResultView.show(summary, {
            onAgain: () => { host.broadcast({ t: 'start', game: room.gameCode, room: room.roomId }); CV.Play.redealOnline(); },
            onLobby: () => { teardown(); CV.UI.go('home'); },
        });
    }

    /* ---- joining -------------------------------------------------------- */

    function paintJoin() {
        $('roomBody').innerHTML = `
            <div class="card-panel">
                <h3>Join a table</h3>
                <p class="muted small">Type the six digits your friend read out.</p>
                <input type="text" id="rmJoinCode" class="code-input" inputmode="numeric"
                       pattern="[0-9]*" maxlength="6" placeholder="000000" autocomplete="off">
                <div class="btn-row"><button class="btn primary big" id="rmJoinGo">Join</button></div>
                <p class="muted small" id="rmJoinNote"></p>
            </div>`;
        const input = $('rmJoinCode');
        input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('rmJoinGo').click(); });
        $('rmJoinGo').addEventListener('click', joinTable);
        setTimeout(() => input.focus(), 60);
    }

    async function joinTable(ev) {
        const code = ($('rmJoinCode').value || '').trim();
        if (code.length !== 6) return CV.UI.toast('The code is six digits.', 'warn');

        const btn = ev.currentTarget;
        CV.UI.flash(btn, '⏳ Connecting…', 25000);
        $('rmJoinNote').textContent = 'Looking for the table…';

        try {
            client = new CV.Net.Client();
            await client.join(code);
            room = { code, joined: true };
            $('rmJoinNote').textContent = 'Connected. Waiting for the host to deal…';

            // 'start' announces the hand; the table is built from the first
            // snapshot, not from this message. Navigating on 'start' alone
            // raced the host — the screen arrived before there was anything to
            // draw. A second hand also has to drop the finished table, or the
            // new snapshots would be fed into a RemoteTable that has already
            // settled and will not settle again.
            client.on('start', (msg) => {
                room.gameCode = msg.game;
                room.roomId = msg.room;
                room.awaiting = true;
                if (table) { try { table.destroy(); } catch (_) { /* going */ } table = null; }
                if (view)  { try { view.unmount(); } catch (_) { /* going */ } view = null; }
            });
            client.on('state', (msg) => {
                if (table && table.update) return table.update(msg.view);
                room.pendingView = msg.view;
                if (room.awaiting) {
                    room.awaiting = false;
                    CV.UI.go('table', { online: true, guest: true });
                }
            });
            client.on('over', (msg) => { if (table && table.finish) table.finish(rehydrate(msg.result)); });
            client.on('bye', (msg) => {
                CV.UI.say('The table closed', esc((msg && msg.reason) || 'The host left.'));
                teardown();
                CV.UI.go('home');
            });
            client.on('error', (err) => CV.UI.toast(err.message, 'warn', 4000));

            paintWaiting();
        } catch (err) {
            $('rmJoinNote').textContent = '';
            CV.UI.say('Could not join', esc(err.message));
            if (client) { client.close(); client = null; }
        }
    }

    /** A GameResult arrives as plain JSON; put its helper methods back. */
    function rehydrate(raw) {
        return new CV.GameResult({ ranks: (raw && raw.ranks) || [], detail: (raw && raw.detail) || '', draw: !!(raw && raw.draw) });
    }

    function paintWaiting() {
        $('roomBody').innerHTML = `
            <div class="card-panel center">
                <h3>You are in</h3>
                <div class="room-code">${room.code.split('').map((d) => `<span>${d}</span>`).join('')}</div>
                <p class="muted">Waiting for the host to start the hand. Keep this tab open.</p>
                <div class="btn-row"><button class="btn ghost" id="rmLeave">Leave</button></div>
            </div>`;
        $('rmLeave').addEventListener('click', () => { teardown(); CV.UI.go('home'); });
    }

    /** The guest's table, built from the first snapshot the host sent. */
    function buildGuestTable(root) {
        const game = CV.Registry.get(room.gameCode);
        const first = room.pendingView;
        if (!first) return null;

        const session = { game, gameCode: room.gameCode, room: CV.Registry.room(room.roomId), lastBet: null, hands: 0 };
        table = new CV.RemoteTable({ client, game, view: first, session });
        view = new game.View(root, table, session);
        view.mount();
        room.pendingView = null;

        table.onChange((events) => {
            const settled = events.find((e) => e.type === 'settled');
            if (settled) {
                CV.UI.header();
                waitForBoard(() => CV.ResultView.show(settled.result, {
                    onAgain: () => { CV.UI.toast('Waiting for the host to deal again…', 'info', 2500); },
                    onLobby: () => { teardown(); CV.UI.go('home'); },
                }));
            }
        });
        return { table, view };
    }

    /* ---- teardown ------------------------------------------------------- */

    function teardown() {
        if (table) { try { table.destroy(); } catch (_) { /* going */ } }
        if (view)  { try { view.unmount(); } catch (_) { /* going */ } }
        if (host)   host.close();
        if (client) client.close();
        host = null; client = null; table = null; view = null; room = null;
    }

    CV.Room = {
        render, teardown, buildHostTable, buildGuestTable,
        get isHost()  { return !!host; },
        get isGuest() { return !!client; },
        get active()  { return !!room; },
        get state()   { return room; },
    };

    CV.UI.screen('room', {
        render,
        leave() { /* the table screen takes over; teardown is explicit */ },
    });
})();
