/**
 * CardVerse — the 射龙门 opponents.
 *
 * A seat makes at most three decisions: whether to shoot the gate in front
 * of it at all, what to stake if it does, and — only when the posts match —
 * whether to call 大过 or 小过.
 *
 * **The gate is on the table before the stake**, so a seat can actually look
 * at what it is being offered. These seats pass a gate no card can pass and
 * play everything else for a slice of what they are holding. That is the
 * whole policy, and it is deliberately not cleverer than that: every gate is
 * priced off its own true chance, so there is nothing to choose between the
 * playable ones and an opponent that pretended otherwise would be modelling
 * a superstition.
 *
 * **The 大过/小过 call is arithmetic, not counting.** Ace is 1 and king is 13,
 * so an equal gate on rank r leaves 13 − r ranks above and r − 1 below: call
 * higher under 7, lower over it, and at exactly 7 the two are worth the same
 * six ranks and the seat may as well flip. It does not look at what is left
 * in the pack — that would be card counting, and these are opponents rather
 * than a solved strategy.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** The share of a stack a seat is willing to put on one gate. */
    const SLICE = [0.03, 0.09];

    /** The rank where 大过 and 小过 are worth exactly the same. */
    const PIVOT = 7;

    /** A gate no card can pass, whichever way it might be called. */
    function hopeless(quote) {
        if (!quote) return false;
        if (quote.one) return quote.one.mult === 0;
        return quote.higher.mult === 0 && quote.lower.mult === 0;
    }

    class DragonGateAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            const pick = options.find((o) => o.type === 'pick');
            if (pick) return this.call(seat, options);

            const s = e.seats[seat];
            const bet = options.find((o) => o.type === 'bet');

            // Let go of what cannot be won. A gate with no winning card left
            // pays nothing at all, so staking on it is just handing the
            // money over — and passing costs nothing.
            if (!bet || hopeless(s.quote)) return { type: 'skip', seat };

            const rng = e.rng;
            const want = Math.round(s.coins * (SLICE[0] + rng.next() * (SLICE[1] - SLICE[0])));
            return {
                type: 'bet', seat,
                amount: Math.max(bet.min, Math.min(bet.max, want)),
            };
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
