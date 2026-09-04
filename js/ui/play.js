/**
 * CardVerse — sitting down, playing hands, standing up.
 *
 * A *session* is one visit to one table: the game, the room, who is in the
 * chairs and the shoe. A *table* is one hand of it. "Play again" deals the
 * next hand at the same table — same opponents, same stacks, same shoe — so
 * the counting AI can count and a bad run feels like a bad run rather than a
 * sequence of unrelated games.
 *
 * The room fee is paid once, on sitting. Your seat's coins are re-read from
 * the profile before every hand, because the profile is the truth and the
 * seat is a working copy; the AI seats keep theirs and rebuy when broke.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { $, fmt, esc } = CV.UI;

    let session = null;
    let table   = null;
    let view    = null;

    function begin({ gameCode, room: roomId, aiCount }) {
        const game = CV.Registry.get(gameCode);
        const room = CV.Registry.room(roomId);
        const p    = CV.Profile.get();

        if (p.coins < room.entry + room.bet[0]) {
            CV.UI.toast(t('setup.cantAfford', { n: fmt(room.entry + room.bet[0]), room: room.name }), 'warn');
            return false;
        }
        if (room.entry && !CV.Profile.spend(room.entry)) return false;

        const rng   = new CV.RNG();
        const seats = CV.AIPlayer.personas(aiCount, rng)
            .map((b) => ({ kind: 'ai', name: b.name, avatar: b.avatar, coins: room.bet[1] * 30 }));
        seats.push({ kind: 'human', isYou: true, name: p.name, avatar: p.avatar, coins: p.coins });

        session = { game, gameCode, room, seats, shoe: null, lastBet: null, hands: 0, aiStack: room.bet[1] * 30 };
        CV.UI.go('table');
        return true;
    }

    function deal() {
        if (!session) return CV.UI.go('home');
        if (table) { table.destroy(); table = null; }
        if (view)  { view.unmount(); view = null; }

        const p = CV.Profile.get();
        for (const s of session.seats) {
            if (s.isYou) { s.coins = p.coins; s.name = p.name; s.avatar = p.avatar; }
            else if (s.kind === 'ai' && s.coins < session.room.bet[0]) s.coins = session.aiStack;   // rebuy
        }

        const you = session.seats.find((s) => s.isYou);
        if (you.coins < session.room.bet[0]) {
            CV.UI.say(t('table.brokeTitle'),
                t('table.brokeBody', { room: session.room.name, n: fmt(session.room.bet[0]) }));
            return leave(true);
        }

        table = new CV.Table({
            gameCode: session.gameCode,
            seats: session.seats.map((s, i) => new CV.Seat(i, s)),
            config: { room: session.room.id, shoe: session.shoe },
        });
        table.speed = CV.Settings.get().fastAnim ? 0.4 : 1;

        const root = $('tableRoot');
        view = new session.game.View(root, table, session);
        view.mount();

        table.onChange((events) => {
            const settled = events.find((e) => e.type === 'settled');
            if (settled) whenBoardSettles(() => finish(settled.result));
        });

        $('resultOverlay').hidden = true;
        paintBar();
        table.start();
    }

    /**
     * Hold the result back until the table has finished showing what
     * happened. The engine resolves the dealer in one synchronous burst, so
     * without this the overlay lands on top of cards that are still being
     * turned over — which is what made a hand feel like it ended before you
     * could read it.
     */
    function whenBoardSettles(done) {
        const speed = (table && table.speed) || 1;
        const tick = () => {
            if (view && view.revealing) return setTimeout(tick, 180);
            setTimeout(done, 1500 * speed);
        };
        tick();
    }

    function finish(summary) {
        session.hands++;
        // Carry stacks forward — the engine's seats are the working copies.
        table.engine.seats.forEach((s, i) => { session.seats[i].coins = s.coins; });
        session.shoe = table.engine.shoeState;
        CV.UI.header();
        CV.ResultView.show(summary, { onAgain: deal, onLobby: () => leave(true) });
    }

    function leave(force) {
        if (CV.Room && CV.Room.active) {
            const online = () => { CV.Room.teardown(); table = null; view = null; session = null; CV.UI.go('home'); };
            if (force) return online();
            return CV.UI.confirm(t(CV.Room.isHost ? 'room.closeTitle' : 'room.leaveTitle'),
                t(CV.Room.isHost ? 'room.closeBody' : 'room.leaveBody'),
                t(CV.Room.isHost ? 'room.closeGo' : 'table.leaveGo'), online, true);
        }
        const mid = table && !table.engine.isOver() && table.engine.phase !== 'betting';
        const go = () => {
            if (table) {
                if (!table.settled && !table.engine.isOver()) CV.Rewards.forfeit(table);
                table.destroy();
            }
            if (view) view.unmount();
            table = null; view = null; session = null;
            CV.UI.go('home');
        };
        if (force || !mid) return go();
        CV.UI.confirm(t('table.leaveTitle'), t('table.leaveBody'), t('table.leaveGo'), go, true);
    }

    function paintBar(s) {
        const info = s || session;
        if (!info) return;
        $('tableGame').textContent = `${info.game.iconText} ${info.game.name}`.trim();
        $('tableRoom').textContent = `${info.room.icon} ${info.room.name}`;
        $('tableCoins').textContent = fmt(CV.Profile.get().coins);
    }

    /* ---- online ---------------------------------------------------------- */

    /**
     * An online table is built by room.js — the host runs a real Table and
     * forwards snapshots, a guest runs a RemoteTable over them. Both hand back
     * the same pair, so from here on the screen behaves identically.
     */
    function dealOnline(params) {
        const root = $('tableRoot');
        root.innerHTML = '';
        $('resultOverlay').hidden = true;

        const built = params.guest ? CV.Room.buildGuestTable(root) : CV.Room.buildHostTable(root);
        if (!built) {
            CV.UI.say(t('room.notReady'), t('room.notReadyBody'));
            return CV.UI.go('home');
        }
        table = built.table;
        view  = built.view;
        session = built.table.session;
        paintBar(session);
    }

    /** The host dealt another hand at the same online table. */
    function redealOnline() {
        $('resultOverlay').hidden = true;
        dealOnline({ online: true, guest: false });
    }

    CV.UI.screen('table', {
        render(params) {
            if (params && params.online) return dealOnline(params);
            deal();
        },
        leave() {
            // An online table is owned by room.js and survives this screen —
            // the host keeps the room open between hands. Only a solo table is
            // torn down here, and only a solo table can be forfeited, since a
            // guest's coins are settled by the host.
            if (CV.Room && CV.Room.active) { table = null; view = null; session = null; return; }
            if (table) {
                if (!table.settled && !table.engine.isOver()) CV.Rewards.forfeit(table);
                table.destroy();
            }
            if (view) view.unmount();
            table = null; view = null; session = null;
        },
    });

    document.addEventListener('DOMContentLoaded', () => {
        const btn = $('tableLeave');
        if (btn) btn.addEventListener('click', () => leave(false));
    });

    CV.Play = {
        begin, deal, leave, redealOnline,
        get session() { return session; },
        get table() { return table; },
    };
})();
