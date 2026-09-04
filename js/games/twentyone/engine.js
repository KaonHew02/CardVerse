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

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { handValue } = CV.Cards;

    class TwentyOneEngine extends CV.BlackjackEngine {

        static get publicConfig() {
            return CV.BlackjackEngine.publicConfig.concat(['maBou', 'fiveCard', 'fiveCardPays']);
        }

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

                // House rules, the way 21 is actually dealt around a kitchen
                // table here rather than in a casino.
                maBou: true,            // 孖宝: a starting pair may double the stake
                fiveCard: true,         // 五小: five cards without busting wins outright
                fiveCardPays: 2,        // net per coin staked, so 2:1
            });
        }

        /**
         * The two house rules add one option and one way to win.
         *
         * 孖宝 is not blackjack's double-down: it doubles the money and hands
         * the turn straight back, so the player keeps drawing. That is what
         * makes it a different bet rather than a renamed one.
         */
        legalActions(seat) {
            const out = super.legalActions(seat);
            if (this.phase !== 'playing' || seat !== this.turn) return out;
            const s = this.seats[seat];
            const h = this.hand(seat);
            if (!h || h.done || !this.config.maBou) return out;
            if (h.cards.length !== 2 || h.maBou) return out;
            if (h.cards[0].r !== h.cards[1].r) return out;
            if (s.coins < h.bet) return out;
            return out.concat([{ type: 'mabou', label: t('act.mabou') }]);
        }

        handle(action) {
            if (action.type !== 'mabou') return super.handle(action);
            const s = this.seats[action.seat];
            const h = this.hand(action.seat);
            s.coins -= h.bet;
            s.net   -= h.bet;
            h.bet   *= 2;
            h.maBou  = true;
            this.emit('mabou', { seat: action.seat, bet: h.bet });
            return true;    // the turn stays put — 孖宝 is money, not a card
        }

        /** Five cards without busting ends the hand there and then. */
        doHit(seat) {
            const ok = super.doHit(seat);
            if (!this.config.fiveCard) return ok;
            const s = this.seats[seat];
            const h = s.hands[s.active];
            if (h && !h.done && h.cards.length >= 5 && handValue(h.cards).total <= 21) {
                h.done = true;
                h.fiveCard = true;
                this.emit('fiveCard', { seat, hand: s.active });
                this.advance(seat);
            }
            return ok;
        }

        judge(h, dealer) {
            const v = handValue(h.cards);
            if (v.total > 21)   return { outcome: 'bust',      payout: 0 };
            // 五小 beats everything, including the dealer's own 21.
            if (h.fiveCard)     return { outcome: 'fivecard',  payout: h.bet * (1 + this.config.fiveCardPays) };
            if (v.total === 21) return { outcome: 'twentyone', payout: h.bet * (1 + this.config.exactBonus) };
            if (dealer.total > 21 || v.total > dealer.total) return { outcome: 'win', payout: h.bet * 2 };
            if (v.total < dealer.total) return { outcome: 'loss', payout: 0 };
            return { outcome: 'push', payout: h.bet };
        }

        /** Exact 21s have already won; the dealer only draws against the rest. */
        anyoneLive() {
            return this.seats.some((s) => !s.out && s.hands.some((h) =>
                !h.fiveCard && handValue(h.cards).total < 21));
        }
    }

    CV.TwentyOneEngine = TwentyOneEngine;
})();
