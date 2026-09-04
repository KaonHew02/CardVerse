/**
 * CardVerse — the 锄大D opponents.
 *
 * Four players, no teams, nobody's friend. Each seat sees its own thirteen
 * cards and everyone's card count, and nothing else.
 *
 * The habits that matter at this table:
 *
 *  - Play the cheapest thing that wins. A 2 spent to take a trick worth one
 *    card is a 2 you do not have at the end, which is where the game is won.
 *  - Keep the shape. `decompose` finds the five-card hands first, so a
 *    straight is not fed out one card at a time.
 *  - Watch the counts. When someone is one or two cards from out, the trick
 *    stops being cheap and it is worth spending the big card to take it away.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const B  = CV.B2;

    /** Cards left in someone else's hand before a trick is worth winning big. */
    const DANGER = 2;

    class BigTwoAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            if (e.phase !== 'play') return null;
            const cards = this.choose(seat);
            if (!cards) return { type: 'pass', seat };
            return { type: 'play', seat, cards: cards.map((c) => c.id) };
        }

        /** True when anyone else is close enough to out to be worth stopping. */
        pressure(seat) {
            return this.engine.seats.some((s, i) => i !== seat && s.cards.length <= DANGER);
        }

        choose(seat) {
            const e = this.engine;
            const hand = e.seats[seat].cards;
            const must = e.mustPlay(seat);

            if (!e.trick) return this.lead(seat, hand, must);

            const options = B.find(hand, e.trick.combo, must);
            if (!options.length) return null;

            // Going out ends it. Nothing is worth more than that.
            const finish = options.find((o) => o.length === hand.length);
            if (finish) return finish;

            // Someone is about to go out — take the trick with the strongest
            // answer rather than the cheapest, and lead from there.
            if (this.pressure(seat)) return options[options.length - 1];
            return this.best(options, hand);
        }

        /**
         * The play that leaves the tidiest hand.
         *
         * `decompose` counts the turns a hand still needs if nobody
         * interferes, so the play that leaves the fewest groups gets you out
         * soonest. It is also what stops a bot pulling a card out of a
         * straight to win a trick with a four.
         *
         * Ties go to the bigger dump, then to the lower card.
         */
        best(options, hand) {
            let pick = options[0], low = Infinity;
            for (const cards of options) {
                const ids = new Set(cards.map((c) => c.id));
                const rest = hand.filter((c) => !ids.has(c.id));
                const combo = B.detect(cards);
                const cost = B.decompose(rest).length * 100 - cards.length * 4
                    + (combo ? (combo.size === 5 ? combo.cat : combo.key / 10) : 0);
                if (cost < low) { low = cost; pick = cards; }
            }
            return pick;
        }

        lead(seat, hand, must) {
            const options = B.leads(hand, must);
            if (!options.length) {
                // Only reachable on the opening play, where the 3♦ alone is
                // always a legal lead.
                const card = hand.find(CV.BigTwoOpener);
                return card ? [card] : [hand[0]];
            }
            const all = options.find((o) => o.length === hand.length);
            if (all) return all;
            return this.best(options, hand);
        }
    }

    CV.BigTwoAI = BigTwoAI;
})();
