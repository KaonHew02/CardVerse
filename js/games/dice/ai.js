/**
 * CardVerse — the 骰子 opponents.
 *
 * There is one decision and it is made before anything is thrown, so there
 * is nothing to be clever about. These seats back 大 or 小 most of the time
 * and take a flutter on 围骰 now and then, which is what a table full of
 * people does.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** How often a seat takes the long shot, and how often it names one. */
    const TRIPLE_ODDS = 0.08;
    const EXACT_ODDS = 0.3;

    /** The share of a stack a seat is willing to put up on one throw. */
    const SLICE = [0.02, 0.07];

    class DiceAI extends CV.AIPlayer {
        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;
            const s = e.seats[seat];
            const rng = e.rng;

            let side = 'big', face = 0;
            if (rng.chance(TRIPLE_ODDS)) {
                // Most of the long shots are on any triple; now and then a
                // seat picks the number, which is how people play it.
                side = rng.chance(EXACT_ODDS) ? 'exact' : 'triple';
                if (side === 'exact') face = rng.range(1, 6);
            } else side = rng.chance(0.5) ? 'big' : 'small';
            const opt = options.find((o) => o.side === side && (!face || o.face === face)) || options[0];

            const want = Math.round(s.coins * (SLICE[0] + rng.next() * (SLICE[1] - SLICE[0])));
            const step = Math.max(opt.min, Math.round(want / opt.min) * opt.min || opt.min);
            return {
                type: 'wager', seat, side: opt.side, face: opt.face || 0,
                amount: Math.min(opt.max, step),
            };
        }
    }

    CV.DiceAI = DiceAI;
})();
