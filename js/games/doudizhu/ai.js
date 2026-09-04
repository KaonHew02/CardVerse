/**
 * CardVerse — the 斗地主 opponents.
 *
 * Everything this player knows is on the table: its own seventeen cards, how
 * many cards everyone else is holding, and what is down. It never reads a
 * hand it was not dealt, and it does not count what has gone.
 *
 * Three habits are what make it read as a person rather than a filter:
 *
 *  - It keeps its shape. `decompose` splits the hand into runs, airplanes and
 *    pairs, and it leads a whole group rather than shedding one card at a
 *    time, so a straight is not quietly dismantled into five singles.
 *  - It knows who its partner is. A Farmer does not beat the other Farmer's
 *    play, which is the single most obvious tell when a bot gets it wrong.
 *  - It holds its bombs. They come out to stop someone going out, or when
 *    nothing else answers — not to win a trick worth one card.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const D  = CV.DDZ;

    /** Cards left in an opponent's hand before it is worth spending a bomb. */
    const DANGER = 2;

    /** A partner this close to going out gets fed the lead. */
    const FEED_AT = 4;

    /** A trick this big is worth a bomb to take away. */
    const BOMB_WORTH = 4;

    class DouDiZhuAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            if (e.phase === 'bid')  return { type: 'bid', seat, bid: this.bidFor(seat) };
            if (e.phase !== 'play') return null;

            const cards = this.choose(seat);
            if (!cards) return { type: 'pass', seat };
            return { type: 'play', seat, cards: cards.map((c) => c.id) };
        }

        /* ---- bidding --------------------------------------------------------- */

        /**
         * How much this hand is worth wanting. The top of the deck is what
         * decides a game of 斗地主, so that is what is counted: the jokers,
         * the bombs, the twos and the aces, with a nod to long runs.
         */
        appetite(cards) {
            const m = D.groups(cards);
            const has = (r) => m.has(r);
            const n = (r) => (m.get(r) ? m.get(r).length : 0);

            let score = 0;
            if (has(D.BIG_JOKER))   score += 3;
            if (has(D.SMALL_JOKER)) score += 2;
            if (has(D.BIG_JOKER) && has(D.SMALL_JOKER)) score += 4;   // 王炸
            for (const [, list] of m) if (list.length === 4) score += 5;
            score += n(15) * 2;      // twos
            score += n(14);          // aces

            // A hand that comes apart into few pieces plays itself.
            const pieces = D.decompose(cards).length;
            if (pieces <= 7) score += 3;
            else if (pieces <= 9) score += 1;

            return score >= 12 ? 3 : score >= 8 ? 2 : score >= 5 ? 1 : 0;
        }

        bidFor(seat) {
            const e = this.engine;
            const want = this.appetite(e.seats[seat].cards);
            return want > e.highBid ? want : 0;
        }

        /* ---- playing --------------------------------------------------------- */

        /** True when someone on the other side is one or two cards from out. */
        pressure(seat) {
            const e = this.engine;
            return e.seats.some((s, i) => i !== seat && !this.sameSide(seat, i)
                && s.cards.length <= DANGER);
        }

        sameSide(a, b) {
            const L = this.engine.landlord;
            return (a === L) === (b === L);
        }

        /** The other Farmer, or -1 if this seat is the Landlord. */
        partnerOf(seat) {
            const e = this.engine;
            if (seat === e.landlord) return -1;
            return [0, 1, 2].find((i) => i !== seat && i !== e.landlord);
        }

        choose(seat) {
            const e = this.engine;
            const hand = e.seats[seat].cards;
            if (!e.trick) return this.lead(seat, hand);

            const options = D.find(hand, e.trick.combo);
            if (!options.length) return null;

            // Going out ends the round on the spot. Nothing outranks that.
            const finish = options.find((o) => o.length === hand.length);
            if (finish) return finish;

            // Never beat your own partner. The lead comes back to them.
            if (this.sameSide(seat, e.trick.by)) return null;

            const urgent = this.pressure(seat);
            const plain = options.filter((o) => {
                const c = D.parse(o);
                return c && c.type !== 'bomb' && c.type !== 'rocket';
            });

            if (plain.length) return urgent ? plain[plain.length - 1] : this.best(plain, hand);

            // Only a bomb answers. Spend one to stop someone going out, or to
            // break a long run — a player who is dumping five cards a turn
            // will not be caught by waiting for a better moment.
            const bulk = e.trick.cards.length >= BOMB_WORTH;
            if (urgent || bulk) return options[options.length - 1];
            return null;
        }

        /**
         * The play that leaves the tidiest hand.
         *
         * `decompose` says how many turns a hand still needs if nobody
         * interferes, so the play that leaves the fewest groups is the play
         * that gets you out soonest. It is also what stops a bot pulling a
         * card out of a pair to win a trick with a four, which is the most
         * visible way a machine plays worse than a person.
         *
         * Ties go to the bigger dump, then to the lower card.
         */
        best(options, hand) {
            let pick = options[0], low = Infinity;
            for (const cards of options) {
                const ids = new Set(cards.map((c) => c.id));
                const rest = hand.filter((c) => !ids.has(c.id));
                const combo = D.parse(cards);
                const cost = D.decompose(rest).length * 100 - cards.length * 3 + (combo ? combo.key : 0);
                if (cost < low) { low = cost; pick = cards; }
            }
            return pick;
        }

        /**
         * Leading. Two habits: get out in as few turns as possible, and — as
         * a Farmer — hand the lead to whichever of you is closer to finishing
         * by leading something small they can take.
         */
        lead(seat, hand) {
            const e = this.engine;
            const groups = D.decompose(hand);

            // One group left that is the whole hand: play it and win.
            const all = groups.find((g) => g.cards.length === hand.length);
            if (all) return all.cards;

            // 送牌. Two Farmers only need one of them home, so the one who
            // is further from it stops racing and starts feeding: a low
            // single the partner can take, and the lead with it.
            //
            // Only to your 下家 — the seat that answers first. Feeding the
            // player who acts after the Landlord just hands the Landlord a
            // cheap trick.
            const mate = this.partnerOf(seat);
            if (mate >= 0 && (seat + 1) % 3 === mate) {
                const theirs = e.seats[mate].cards.length;
                if (theirs < hand.length && (theirs <= FEED_AT || hand.length - theirs >= 3)) {
                    const single = groups.find((g) => g.cards.length === 1 && !g.keep);
                    if (single) return single.cards;
                }
            }

            const options = D.leads(hand);
            const plain = options.filter((cards) => {
                const c = D.parse(cards);
                return c && c.type !== 'bomb' && c.type !== 'rocket';
            });
            return this.best(plain.length ? plain : options, hand);
        }
    }

    CV.DouDiZhuAI = DouDiZhuAI;
})();
