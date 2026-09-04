/**
 * CardVerse — the 射龙门 opponents.
 *
 * A seat makes two decisions and no more: what to stake before its posts are
 * turned, and — only when the posts match — whether to call 大过 or 小过.
 *
 * **The stake is chosen before the gate exists**, which is the honest order:
 * the posts are drawn in `openGate()` after the bet is taken, so there is
 * nothing about this gate to know yet and no way to bet on one. These seats
 * put up a slice of what they are holding and leave it there.
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

    class DragonGateAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            const pick = options.find((o) => o.type === 'pick');
            if (pick) return this.call(seat, options);

            const opt = options[0];
            const s = e.seats[seat];
            const rng = e.rng;
            const want = Math.round(s.coins * (SLICE[0] + rng.next() * (SLICE[1] - SLICE[0])));
            return {
                type: 'bet', seat,
                amount: Math.max(opt.min, Math.min(opt.max, want)),
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
