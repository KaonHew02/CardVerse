/**
 * CardVerse — the 21 AI.
 *
 * With no double, split or surrender the book collapses to one question:
 * hit or stand. Expert plays the correct answer for a single deck; the
 * others spoil it as usual. No count — one deck reshuffled at 60% is not
 * worth counting, and an AI that pretended otherwise would just be slower.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { handValue, pipValue } = CV.Cards;

    class TwentyOneAI extends CV.BlackjackAI {

        /**
         * 孖宝 doubles the money without taking a card, so it is worth it when
         * the hand is already strong or the dealer's up-card is weak — the
         * same two conditions that make any extra stake worth putting up.
         */
        decide(seat) {
            const e = this.engine;
            if (e.phase === 'playing' && e.legalActions(seat).some((o) => o.type === 'mabou')) {
                const h = e.hand(seat);
                const v = handValue(h.cards);
                const up = pipValue(e.dealerUp());
                if (v.total >= 18 || (up >= 4 && up <= 6)) return { type: 'mabou', seat };
            }
            return super.decide(seat);
        }

        book(h, up) {
            const v = handValue(h.cards);
            if (v.soft) return v.total >= 18 ? 'stand' : 'hit';
            if (v.total >= 17) return 'stand';
            if (v.total >= 13) return up <= 6 ? 'stand' : 'hit';
            if (v.total === 12) return (up >= 4 && up <= 6) ? 'stand' : 'hit';
            return 'hit';
        }
    }

    CV.TwentyOneAI = TwentyOneAI;
})();
