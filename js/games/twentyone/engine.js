/**
 * CardVerse — 21.
 *
 * The casual cousin of Blackjack: one deck, hit or stand and nothing else,
 * and one rule that makes it its own game — **reaching exactly 21 wins on
 * the spot at 3:2**, whatever the dealer then draws. That is the "reach
 * exactly 21" objective from the spec made literal, and the reason a player
 * sitting on 20 has something to think about.
 *
 * It is the Blackjack engine with the advanced options off and `judge()`
 * replaced. Everything else — betting, dealing, the dealer's draw, the
 * result — is shared, which means a bug fixed in one is fixed in both.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { handValue } = CV.Cards;

    class TwentyOneEngine extends CV.BlackjackEngine {

        static get defaults() {
            return Object.assign({}, CV.BlackjackEngine.defaults, {
                decks: 1,
                insurance: false,
                surrender: false,
                double: false,
                split: false,
                peek: false,
                penetration: 0.6,
                exactBonus: 1.5,        // net win per coin staked — 3:2, like a blackjack
                blackjackPays: 1.5,     // A+10 is just another 21 here
            });
        }

        judge(h, dealer) {
            const v = handValue(h.cards);
            if (v.total > 21)   return { outcome: 'bust',      payout: 0 };
            if (v.total === 21) return { outcome: 'twentyone', payout: h.bet * (1 + this.config.exactBonus) };
            if (dealer.total > 21 || v.total > dealer.total) return { outcome: 'win', payout: h.bet * 2 };
            if (v.total < dealer.total) return { outcome: 'loss', payout: 0 };
            return { outcome: 'push', payout: h.bet };
        }

        /** Exact 21s have already won; the dealer only draws against the rest. */
        anyoneLive() {
            return this.seats.some((s) => !s.out && s.hands.some((h) => handValue(h.cards).total < 21));
        }
    }

    CV.TwentyOneEngine = TwentyOneEngine;
})();
