/**
 * CardVerse — the Hold'em opponents.
 *
 * Each seat sees its own two cards, the board, the pot and what everyone has
 * bet. It never looks at another hand and it does not know what is left in
 * the deck.
 *
 * The decision is the same one a person makes: how good is this hand, and
 * what does it cost to keep playing it. Strength comes from the cards —
 * a starting-hand score before the flop, the made hand after it — and the
 * price comes from the pot. Calling happens when the hand is worth more than
 * the odds being laid; raising when it is worth a lot more; folding when it
 * is not.
 *
 * It does not bluff and it does not read anybody. A bot that bluffs on a
 * schedule is not a better opponent, it is a tell.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const H  = CV.PokerHands;

    /** Roughly how often a made hand of each category holds up. */
    const MADE = {
        1: 0.10,  // high card
        2: 0.36,  // one pair
        3: 0.58,  // two pair
        4: 0.72,  // three of a kind
        5: 0.82,  // straight
        6: 0.88,  // flush
        7: 0.94,  // full house
        8: 0.98,  // four of a kind
        9: 0.99,  // straight flush
        10: 1.00, // royal flush
    };

    class PokerAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            const s = e.seats[seat];
            const rng = e.rng;
            const need = Math.max(0, e.currentBet - s.bet);
            const pot = e.pot + e.seats.reduce((n, x) => n + x.bet, 0);
            const strength = this.strength(seat);

            const fold  = { type: 'fold', seat };
            const check = options.find((o) => o.type === 'check');
            const call  = options.find((o) => o.type === 'call');
            const raise = options.find((o) => o.type === 'raise');

            const bet = (fraction) => {
                if (!raise) return null;
                const want = e.currentBet + Math.max(e.minRaise, Math.round(pot * fraction));
                const amount = Math.max(raise.min, Math.min(raise.max, want));
                return { type: 'raise', seat, amount };
            };

            // Nothing to pay: bet the good hands, look at the rest for free.
            if (!need) {
                if (strength > 0.80) return bet(0.75) || { type: 'check', seat };
                if (strength > 0.58 && rng.chance(0.55)) return bet(0.5) || { type: 'check', seat };
                return check ? { type: 'check', seat } : (call ? Object.assign({ seat }, call) : fold);
            }

            // There is a price. Compare the hand to what the pot is laying,
            // with a margin — a hand that is exactly break-even to call is a
            // hand worth throwing away, and a table that never folds is not
            // playing poker.
            const odds = need / (pot + need);
            const margin = e.board.length ? 0.18 : 0.26;
            if (strength > 0.90 && raise && rng.chance(0.75)) return bet(0.8);
            if (strength > 0.72 && raise && rng.chance(0.35)) return bet(0.6);
            if (!call) return fold;
            if (strength > odds + margin) return Object.assign({ seat }, call);
            // A cheap look is worth taking, but not with anything.
            if (need <= e.bb && strength > (e.board.length ? 0.30 : 0.42)) {
                return Object.assign({ seat }, call);
            }
            return fold;
        }

        /**
         * How good this hand looks right now, from 0 to 1, and then discounted
         * for every extra opponent still in — a hand that beats one player is
         * not the same hand against four.
         */
        strength(seat) {
            const e = this.engine;
            const raw = e.board.length
                ? this.postflop(seat)
                : this.preflop(e.seats[seat].hole);
            const others = Math.max(1, e.live.length - 1);
            return Math.pow(raw, 1 + 0.22 * (others - 1));
        }

        /**
         * Before the flop there is no hand yet, only a shape: how high the
         * cards are, whether they pair, whether they are suited and whether
         * they can make a straight.
         */
        preflop(hole) {
            const [hi, lo] = hole.map((c) => c.r).sort((a, b) => b - a);
            const suited = hole[0].s === hole[1].s;
            let v = (hi / 14) * 0.45 + (lo / 14) * 0.18;
            if (hi === lo) v += 0.28 + hi / 100;
            if (suited) v += 0.06;
            else if (hi !== lo) {
                const gap = hi - lo;
                if (gap === 1) v += 0.05;
                else if (gap === 2) v += 0.02;
                else if (gap > 4) v -= 0.05;
            }
            return Math.max(0.02, Math.min(1, v));
        }

        postflop(seat) {
            const e = this.engine;
            const s = e.seats[seat];
            const mine = H.evaluate(s.hole.concat(e.board));
            let v = MADE[mine.cat] + ((mine.tie[0] || 0) / 14) * 0.04;

            // If the board alone makes the same hand, so does everyone else's.
            if (e.board.length >= 5) {
                const table = H.evaluate(e.board);
                if (table && H.compare(mine, table) === 0) v *= 0.35;
            }
            return Math.max(0.02, Math.min(1, v));
        }
    }

    CV.PokerAI = PokerAI;
})();
