/**
 * CardVerse — the Blackjack AI.
 *
 * Expert plays basic strategy for the configured rules and keeps a Hi-Lo
 * running count from cards it has legitimately seen (`engine.seen` — nothing
 * face-down). Hard plays the same book without the count. Normal and Easy
 * play the book and then spoil it at the rate ai.js sets, which is how a
 * Normal opponent stands on a 14 against a 6 and then hits a 16 against a 5:
 * not two rules, one rule and a coin.
 *
 * Counting is the one place an AI adapts across hands, and it is why the
 * shoe is carried between engines rather than reshuffled each deal.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { handValue, pipValue } = CV.Cards;

    /** Hi-Lo tag for one card. */
    const tag = (c) => (c.r >= 2 && c.r <= 6) ? 1 : (c.r >= 10 ? -1 : 0);

    class BlackjackAI extends CV.AIPlayer {

        /** True count: running count per remaining deck, floored to whole decks. */
        trueCount() {
            const e = this.engine;
            const running = e.seen.reduce((n, c) => n + tag(c), 0);
            const decksLeft = Math.max(1, Math.round(e.shoe.remaining / 52));
            return running / decksLeft;
        }

        decide(seat) {
            const e = this.engine;
            const s = e.seats[seat];
            const options = e.legalActions(seat);
            if (!options.length) return null;
            const can = (t) => options.some((o) => o.type === t);
            const lvl = (s.level || 'normal');

            if (e.phase === 'betting') return this.bet(seat, options[0], lvl);

            if (e.phase === 'insurance') {
                // The book says never — unless you are counting and the shoe is rich.
                const take = lvl === 'expert' && can('insure') && this.trueCount() >= 3;
                return { type: take ? 'insure' : 'noInsure', seat };
            }

            if (e.phase !== 'playing') return this.fallback(seat);

            const h  = e.hand(seat);
            const up = pipValue(e.dealerUp());   // 2..11
            let type = this.book(h, up, can, lvl);

            if (this.blunder(seat)) {
                const spoil = ['hit', 'stand'].filter((t) => t !== type && can(t));
                if (spoil.length) type = e.rng.pick(spoil);
            }
            if (!can(type)) type = can('hit') ? 'hit' : 'stand';
            return { type, seat };
        }

        /** Bet sizing: a share of the range by level; expert presses a good count. */
        bet(seat, opt, lvl) {
            const e = this.engine;
            const span = opt.max - opt.min;
            let frac;
            switch (lvl) {
                case 'easy':   frac = e.rng.next() * 0.4; break;
                case 'normal': frac = 0.2 + e.rng.next() * 0.4; break;
                case 'hard':   frac = 0.3 + e.rng.next() * 0.4; break;
                default: {
                    const tc = this.trueCount();
                    frac = tc >= 2 ? Math.min(1, 0.5 + tc * 0.15) : 0.15 + e.rng.next() * 0.2;
                }
            }
            const amount = Math.round((opt.min + span * frac) / 5) * 5;
            return { type: 'bet', seat, amount: Math.max(opt.min, Math.min(opt.max, amount)) };
        }

        /**
         * Basic strategy, S17 / DAS / 4–8 decks. Returns the ideal action;
         * the caller degrades it to what is actually legal.
         */
        book(h, up, can, lvl) {
            const v = handValue(h.cards);
            const pair = h.cards.length === 2 && pipValue(h.cards[0]) === pipValue(h.cards[1]);
            const strong = lvl === 'hard' || lvl === 'expert';

            // Surrender first — it is only ever the first decision.
            if (strong && can('surrender')) {
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
