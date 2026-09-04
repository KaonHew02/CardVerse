/**
 * CardVerse — the 百家乐 AI.
 *
 * There is nothing to play, so the only decision is where to put the money.
 * These seats bet the way the maths says: **Banker most of the time**, because
 * it carries the smallest house edge (about 1.06% after the 5% commission,
 * against roughly 1.24% on Player). Player gets the rest, and Tie — a 14%
 * edge, the worst bet on the table — comes up rarely, the way it does with
 * real people who know better and do it anyway.
 *
 * No streak-chasing and no "the shoe is due". A shoe has no memory, and an
 * opponent that pretended otherwise would be modelling superstition rather
 * than skill.
 */

(() => {
    'use strict';

    const CV = window.CV;

    class BaccaratAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            const roll = e.rng.next();
            const side = roll < 0.62 ? 'banker' : roll < 0.95 ? 'player' : 'tie';
            const opt  = options.find((o) => o.side === side) || options[0];

            // Tie is a flutter, not a position — stake it small.
            const span = opt.max - opt.min;
            const frac = side === 'tie' ? e.rng.next() * 0.2 : 0.15 + e.rng.next() * 0.5;
            const amount = Math.round((opt.min + span * frac) / 5) * 5;

            return {
                type: 'wager', seat, side: opt.side,
                amount: Math.max(opt.min, Math.min(opt.max, amount)),
            };
        }
    }

    CV.BaccaratAI = BaccaratAI;
})();
