/**
 * CardVerse — the 21 AI.
 *
 * Correct play for these rules, which are not any casino's, so the book is
 * not any casino's either. Two things differ from the usual chart:
 *
 *   - **There is no natural**, so there is nothing to check for on the first
 *     two cards. Every hand is played on its total.
 *   - **五龙 is worth chasing.** A fifth card that does not bust wins the hand
 *     outright at 2:1, beating even the dealer's 21 — so on four cards with a
 *     low total, hitting is clearly better than standing on a number that a
 *     dealer 17 would beat anyway.
 *
 * No counting: the machine never sees a card the player cannot.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { pipValue } = CV.Cards;

    /** Four cards at this total or less: hit for 五龙 rather than stand. */
    const CHASE_UNDER = 13;

    class TwentyOneAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;
            const can = (type) => options.some((o) => o.type === type);

            if (e.phase === 'betting') return this.bet(seat, options[0]);
            if (e.phase !== 'playing') return this.fallback(seat);

            const h  = e.hand(seat);
            const up = pipValue(e.dealerUp());
            let type = this.book(h.cards, up, can);
            if (!can(type)) type = can('hit') ? 'hit' : 'stand';
            return { type, seat };
        }

        /** A random slice of the room's range — this is where the luck lives. */
        bet(seat, opt) {
            const e = this.engine;
            const frac = 0.15 + e.rng.next() * 0.5;
            const amount = Math.round((opt.min + (opt.max - opt.min) * frac) / 5) * 5;
            return { type: 'bet', seat, amount: Math.max(opt.min, Math.min(opt.max, amount)) };
        }

        /** The ideal move; the caller degrades it to whatever is legal. */
        book(cards, up, can) {
            const sc = CV.TwentyOneScore(cards);

            // One card from 五龙. Under 12 it cannot bust at all, and up to 13
            // the odds still favour the 2:1 hand that beats everything.
            if (cards.length === 4 && sc.total <= CHASE_UNDER) return 'hit';

            if (can('double') && !sc.soft) {
                if (sc.total === 10 || sc.total === 11) return up < 10 ? 'double' : 'hit';
                if (sc.total === 9 && up >= 3 && up <= 6) return 'double';
            }

            if (sc.soft) return sc.total >= 18 ? 'stand' : 'hit';
            if (sc.total >= 17) return 'stand';
            if (sc.total >= 13) return up <= 6 ? 'stand' : 'hit';
            if (sc.total === 12) return (up >= 4 && up <= 6) ? 'stand' : 'hit';
            return 'hit';
        }
    }

    CV.TwentyOneAI = TwentyOneAI;
})();
