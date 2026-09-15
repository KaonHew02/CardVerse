/**
 * CardVerse — the Lami opponents.
 *
 * Each seat sees its own rack, the table and everyone's tile count. It never
 * looks at another rack and it does not know the pool.
 *
 * One move a turn, and it is the first move `L.plan` lists: a tile onto a
 * meld already on the table, else a new run, else a new set — and only
 * when none of those can be made without a joker does a joker get spent,
 * in the same order. Nothing at all and the seat buys the turn with a lone
 * joker, or folds.
 *
 * It used to be greedy the other way — the biggest meld in the rack, jokers
 * and all — and a seat would open with 8 🃏 🃏 J 🃏 🃏 A and have nothing to
 * play for the rest of the hand.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const L = CV.Lami;

    class LamiAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;
            const s = e.seats[seat];

            // **Add to the table before laying from the rack, and spend a
            // joker last.** `L.plan` ranks every move the rack allows in
            // that order — an add, a new run, a new set, then the same again
            // with a joker — and the first one is the turn. It only offers
            // what the engine accepts: nothing but a run before the seat has
            // opened, and nothing onto anybody's meld until then either.
            const [move] = L.plan(s.rack, e.table, e.rules, s.opened);
            if (move) {
                const tiles = move.tiles.map((x) => x.id);
                return move.at >= 0
                    ? { type: 'extend', seat, at: move.at, tiles }
                    : { type: 'play', seat, tiles };
            }

            // Nothing goes down at all. A joker spent on nothing buys
            // another turn, and another turn is worth more than the fifteen
            // points the joker costs sitting in the rack — so it goes rather
            // than the hand going.
            if (options.some((o) => o.type === 'joker')) return { type: 'joker', seat };
            return { type: 'fold', seat };
        }
    }

    CV.LamiAI = LamiAI;
})();
