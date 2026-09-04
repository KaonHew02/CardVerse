/**
 * CardVerse — the Lami opponents.
 *
 * Each seat sees its own rack, the table and everyone's tile count. It never
 * looks at another rack and it does not know the pool.
 *
 * The turn is greedy and that is the right shape for it: put down the biggest
 * meld you can find, look again, and keep going until nothing is left to
 * play. Then add whatever fits onto what is already on the table, because a
 * tile shed is a point saved. If nothing at all goes down, take one and pass
 * it on.
 *
 * Jokers are held back — `findMelds` only offers one when the meld cannot be
 * made without it, so a joker is never spent on a run that was already there.
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
            const rack = e.seats[seat].rack;

            // A meld out of hand. Biggest is the obvious choice and often the
            // wrong one — a five-run can strand two tiles that a three-run and
            // a set would both have taken. So each candidate is tried and the
            // one that leaves the most behind it wins.
            const found = L.findMelds(rack, e.rules);
            if (found.length) {
                let pick = found[0], best = -1;
                for (const cards of found.slice(0, 12)) {
                    const ids = new Set(cards.map((x) => x.id));
                    const rest = rack.filter((x) => !ids.has(x.id));
                    const after = L.findMelds(rest, e.rules);
                    const shed = cards.length + (after.length ? after[0].length : 0);
                    if (shed > best) { best = shed; pick = cards; }
                }
                return { type: 'play', seat, tiles: pick.map((x) => x.id) };
            }

            // Nothing whole — see if a single tile finishes something already
            // on the table. One tile off the rack is one tile less to count.
            const add = this.extension(seat);
            if (add) return { type: 'extend', seat, at: add.at, tiles: [add.tile.id] };

            if (options.some((o) => o.type === 'done')) return { type: 'done', seat };
            if (options.some((o) => o.type === 'draw')) return { type: 'draw', seat };
            return { type: 'pass', seat };
        }

        /** The first tile in hand that legally joins a meld on the table. */
        extension(seat) {
            const e = this.engine;
            const rack = e.seats[seat].rack;
            for (let at = 0; at < e.table.length; at++) {
                const spot = e.table[at];
                for (const tile of rack) {
                    // A joker is worth thirty in the hand, but it is worth more
                    // than that as the tile that finishes a run later on.
                    if (L.isJoker(tile) && rack.length > 1) continue;
                    if (L.extend(spot.tiles, [tile], e.rules)) return { at, tile };
                }
            }
            return null;
        }
    }

    CV.LamiAI = LamiAI;
})();
