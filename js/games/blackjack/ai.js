/**
 * CardVerse — the Blackjack AI.
 *
 * Basic strategy, exactly. Every seat plays the correct move for its own
 * two cards against the dealer's up-card, which is the only information a
 * person at that table has. Deliberately **no card counting**: it would give
 * the machine knowledge the player lacks, and a table you cannot beat because
 * the opponents can see further than you is not a fair table.
 *
 * The bet size is the luck: a seat stakes a random slice of the room's range,
 * the way a person with no system does.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { handValue, pipValue } = CV.Cards;

    class BlackjackAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;
            const can = (type) => options.some((o) => o.type === type);

            if (e.phase === 'betting') return this.bet(seat, options[0]);

            // The book says never take insurance, and without a count there is
            // nothing that would change its mind.
            if (e.phase === 'insurance') return { type: 'noInsure', seat };

            if (e.phase !== 'playing') return this.fallback(seat);

            const h  = e.hand(seat);
            const up = pipValue(e.dealerUp());   // 2..11
            let type = this.book(h, up, can);
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

        /**
         * Basic strategy, S17 / DAS / 4–8 decks. Returns the ideal action;
         * the caller degrades it to what is actually legal.
         */
        book(h, up, can) {
            const v = handValue(h.cards);
            const pair = h.cards.length === 2 && pipValue(h.cards[0]) === pipValue(h.cards[1]);

            // Surrender first — it is only ever the first decision.
            if (can('surrender')) {
                if (!v.soft && v.total === 16 && up >= 9) return 'surrender';
                if (!v.soft && v.total === 15 && up === 10) return 'surrender';
            }

            if (pair && can('split')) {
                const r = pipValue(h.cards[0]);
                if (r === 11 || r === 8) return 'split';
                if (r === 9)  return (up <= 9 && up !== 7) ? 'split' : 'stand';
                if (r === 7)  return up <= 7 ? 'split' : 'hit';
                if (r === 6)  return up <= 6 ? 'split' : 'hit';
                if (r === 4)  return (up === 5 || up === 6) ? 'split' : 'hit';
                if (r === 3 || r === 2) return up <= 7 ? 'split' : 'hit';
                // 5s and 10s fall through to the hard-total rules.
            }

            const dbl = can('double');

            if (v.soft) {
                if (v.total >= 19) return 'stand';
                if (v.total === 18) {
                    if (up >= 3 && up <= 6) return dbl ? 'double' : 'stand';
                    if (up === 2 || up === 7 || up === 8) return 'stand';
                    return 'hit';
                }
                if (v.total === 17) return (up >= 3 && up <= 6 && dbl) ? 'double' : 'hit';
                if (v.total >= 15)  return (up >= 4 && up <= 6 && dbl) ? 'double' : 'hit';
                return (up >= 5 && up <= 6 && dbl) ? 'double' : 'hit';   // A2, A3
            }

            const t = v.total;
            if (t >= 17) return 'stand';
            if (t >= 13) return up <= 6 ? 'stand' : 'hit';
            if (t === 12) return (up >= 4 && up <= 6) ? 'stand' : 'hit';
            if (t === 11) return dbl ? 'double' : 'hit';
            if (t === 10) return (up <= 9 && dbl) ? 'double' : 'hit';
            if (t === 9)  return (up >= 3 && up <= 6 && dbl) ? 'double' : 'hit';
            return 'hit';
        }
    }

    CV.BlackjackAI = BlackjackAI;
})();
