/**
 * CardVerse — the 轮盘 opponents.
 *
 * **There is no strategy in roulette and these seats do not pretend there is
 * one.** Every bet on the layout returns exactly −1/37, so no arrangement of
 * chips is better than any other and nothing an opponent could work out would
 * change that. What is left is temperament, and that is what is modelled:
 * most seats put most of their money on the even-money spots and then throw
 * something small at a number, which is what people at a wheel actually do.
 *
 * Nothing here looks at previous spins. A wheel has no memory, and an
 * opponent chasing a colour or a "due" number would be modelling superstition
 * and quietly teaching it.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** How many spots a seat covers on one spin. */
    const SPOTS = [1, 3];

    /** The share of a stack that goes on the layout, across all its chips. */
    const SLICE = [0.02, 0.08];

    /** How often a chip goes on a single number rather than an outside spot. */
    const STRAIGHT_ODDS = 0.28;

    /** The spots that are not single numbers, in the order people reach. */
    const OUTSIDE = ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen', 'column'];

    class RouletteAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            const place = options.find((o) => o.type === 'place');
            const done  = options.find((o) => o.type === 'done');
            const s = e.seats[seat];
            const rng = e.rng;

            // How many spots this seat means to cover, decided once and kept
            // here rather than written onto the seat — an opponent does not
            // get to leave its intentions lying around in engine state.
            this.want = this.want || {};
            if (!this.want[seat]) this.want[seat] = rng.range(SPOTS[0], SPOTS[1]);
            const spots = this.want[seat];

            // Covered enough, or cannot cover any more — let the wheel go.
            if (!place || s.bets.length >= spots) return { type: 'done', seat };

            const bet = rng.chance(STRAIGHT_ODDS)
                ? { kind: 'straight', value: rng.int(37) }
                : this.outside(rng);

            const budget = s.startCoins * (SLICE[0] + rng.next() * (SLICE[1] - SLICE[0]));
            const want = Math.round(budget / spots);
            return {
                type: 'place', seat, bet,
                amount: Math.max(place.min, Math.min(place.max, want)),
            };
        }

        /** One of the outside spots, with a value where the spot needs one. */
        outside(rng) {
            const kind = rng.pick(OUTSIDE);
            if (kind === 'dozen' || kind === 'column') return { kind, value: rng.range(1, 3) };
            return { kind };
        }
    }

    CV.RouletteAI = RouletteAI;
})();
