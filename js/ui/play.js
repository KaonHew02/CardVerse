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

    const CV = window.CV;
    const { $, fmt, esc } = CV.UI;

    let session = null;
    let table   = null;
    let view    = null;

    const GUEST_STACK = 5000;

    function begin({ gameCode, room: roomId, aiCount, aiLevel, guests }) {
        const game = CV.Registry.get(gameCode);
        const room = CV.Registry.room(roomId);
        const p    = CV.Profile.get();

        if (p.coins < room.entry + room.bet[0]) {
            CV.UI.toast(`You need ${fmt(room.entry + room.bet[0])} coins to sit in the ${room.name}.`, 'warn');
            return false;
        }
        if (room.entry && !CV.Profile.spend(room.entry)) return false;

        const rng   = new CV.RNG();
        const bots  = CV.AIPlayer.personas(aiCount, rng);
        const seats = [];
        bots.forEach((b) => seats.push({ kind: 'ai', name: b.name, avatar: b.avatar, level: aiLevel, coins: room.bet[1] * 30 }));
        seats.push({ kind: 'human', isYou: true, name: p.name, avatar: p.avatar, coins: p.coins });
        (guests || []).forEach((name, i) => seats.push({ kind: 'human', name: name || `Guest ${i + 1}`, avatar: '👤', coins: GUEST_STACK }));

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
            CV.UI.say('Out of coins for this table',
                `The ${session.room.name} needs at least ${fmt(session.room.bet[0])} to bet. Claim the daily bonus or drop to a cheaper room.`);
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
            if (settled) setTimeout(() => finish(settled.result), 900 * table.speed);
        });

        $('resultOverlay').hidden = true;
        paintBar();
        table.start();
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
        CV.UI.confirm('Leave this hand?', 'The bet on the table is lost and the hand counts as a loss.', 'Leave', go, true);
    }

    function paintBar() {
        $('tableGame').textContent = `${session.game.icon} ${session.game.name}`;
        $('tableRoom').textContent = `${session.room.icon} ${session.room.name}`;
        $('tableCoins').textContent = fmt(CV.Profile.get().coins);
    }

    CV.UI.screen('table', {
        render() { deal(); },
        leave() {
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

    CV.Play = { begin, deal, leave, get session() { return session; }, get table() { return table; } };
})();
