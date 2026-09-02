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
    const { handValue } = CV.Cards;

    class TwentyOneAI extends CV.BlackjackAI {

        trueCount() { return 0; }

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
