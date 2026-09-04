/**
 * CardVerse — the 斗牛 opponents.
 *
 * There is exactly one decision in this game and it is made before any card
 * is seen, so there is nothing to be clever about. These seats stake a small,
 * steady slice of what they are holding, which is what a table full of
 * people actually looks like — not a table full of maximum bets.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** The share of a stack a seat is willing to put up on one hand. */
    const SLICE = [0.02, 0.08];

    class BullBullAI extends CV.AIPlayer {
        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;
            const bet = options[0];
            const s = e.seats[seat];

            const want = Math.round(s.coins * (SLICE[0] + e.rng.next() * (SLICE[1] - SLICE[0])));
            const amount = Math.max(bet.min, Math.min(bet.max, Math.round(want / bet.min) * bet.min || bet.min));
            return { type: 'bet', seat, amount };
        }
    }

    CV.BullBullAI = BullBullAI;
})();
