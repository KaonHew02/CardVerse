/**
 * CardVerse — the 射龙门 opponents.
 *
 * A seat makes at most three decisions: whether to shoot the gate in front
 * of it at all, how much of the pot to call if it does, and — only when the
 * posts match — whether to call 大过 or 小过.
 *
 * **The gate is on the table before the stake**, so a seat can actually look
 * at what it is being offered, and the arithmetic is honest and small:
 *
 *     call x, get through   →  +x        chance p
 *     call x, land outside  →  −x        chance 1 − p − q
 *     call x, land on a post →  −2x      chance q          (撞柱)
 *
 * so one unit called is worth `2p + q·(−1) − (1 − p − q)·1 − q·1`, which
 * collapses to **2p − 1 − q**. That is the whole model. A gate is worth
 * shooting when that is positive, which in practice means a wide one.
 *
 * These seats are not restricted to that, because a table where four
 * opponents pass every hand is a table where nothing ever happens to the
 * pot. They shoot anything close to fair, size it by how good it is, and
 * take the occasional flier — which is also how the game is actually played.
 *
 * **No counting.** The chance comes from the quote the engine puts on the
 * table, which is the same number the player is looking at.
 *
 * **The 大过/小过 call is arithmetic, not counting.** Ace is 1 and king is 13,
 * so an equal gate on rank r leaves 13 − r ranks above and r − 1 below: call
 * higher under 7, lower over it, and at exactly 7 the two are worth the same
 * six ranks and the seat may as well flip.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** The edge above which a seat shoots for real, per unit called. */
    const GOOD = 0;

    /** How far below fair a seat will still take a flier, and how often. */
    const LOOSE = -0.4;
    const FLIER = 0.45;

    /** The share of the pot a seat calls, from a fair gate to a certain one. */
    const SHARE = [0.25, 1];

    /** At or above this share of the middle, a seat calls the lot. */
    const CLEAR_AT = 0.7;

    /** The rank where 大过 and 小过 are worth exactly the same. */
    const PIVOT = 7;

    /** One unit called, as an expectation: 2p − 1 − q. */
    const edgeOf = (q) => (q ? 2 * q.pct - 1 - q.postPct : -1);

    class DragonGateAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            const pick = options.find((o) => o.type === 'pick');
            if (pick) return this.call(seat, options);

            const s = e.seats[seat];
            const bet = options.find((o) => o.type === 'bet');
            if (!bet) return { type: 'skip', seat };

            // An equal gate is judged on the call this seat would make, not on
            // an average of two calls it will not both take.
            const quote = !s.quote ? null
                : s.quote.one ? s.quote.one
                : (s.gate.low < PIVOT ? s.quote.higher : s.quote.lower);

            // Let go of what cannot be won. A gate with no winning card left
            // pays nothing at all, so shooting it just feeds the middle — and
            // passing costs nothing.
            if (!quote || quote.winners === 0) return { type: 'skip', seat };

            const edge = edgeOf(quote);
            const rng = e.rng;
            if (edge <= GOOD) {
                if (edge < LOOSE || !rng.chance(FLIER)) return { type: 'skip', seat };
                return { type: 'bet', seat, amount: bet.min };
            }

            // Scaled by how good the gate is: an even-money shot calls a
            // quarter of the middle, a near-certain one calls all of it.
            const t = Math.max(0, Math.min(1, edge));
            let want = Math.round(bet.max * (SHARE[0] + (SHARE[1] - SHARE[0]) * t));
            // Anything close to the whole pile is called as the whole pile.
            // Leaving a handful of coins in the middle just to be cautious is
            // not caution, it is another lap for everybody — and clearing it
            // out is the thing the game is trying to get to.
            if (want >= bet.max * CLEAR_AT) want = bet.max;
            return { type: 'bet', seat, amount: Math.max(bet.min, Math.min(bet.max, want)) };
        }

        /** 大过 or 小过 on an equal gate — whichever leaves more ranks open. */
        call(seat, options) {
            const e = this.engine;
            const r = e.seats[seat].gate.low;
            const dir = r < PIVOT ? 'higher'
                : r > PIVOT ? 'lower'
                : (e.rng.chance(0.5) ? 'higher' : 'lower');
            const opt = options.find((o) => o.dir === dir) || options[0];
            return { type: 'pick', seat, dir: opt.dir };
        }
    }

    CV.DragonGateAI = DragonGateAI;
})();
