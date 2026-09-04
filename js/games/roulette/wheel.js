/**
 * CardVerse — 轮盘, the wheel and what it pays.
 *
 * A single-zero (European) wheel: 37 pockets, 0 to 36. There is no double
 * zero, and adding one would double the house's edge — that is the entire
 * difference between the European and American games, so the pocket count
 * lives here in one place and nothing else is allowed to assume it.
 *
 * **The edge is 1/37 on every bet, and that is not a coincidence.** Each
 * price below is the fair inverse of its own chance with one pocket held
 * back: a straight-up covers 1 pocket in 37 and pays 35, a corner covers 4
 * and pays 8, red covers 18 and pays 1. Work any of them through and the
 * return is −1/37, or −2.70%. If a price here is ever changed, that identity
 * is what breaks, and the audit checks all of them.
 *
 * **Zero is not even, not odd, not red, not black, not low and not high.**
 * It is the house's pocket and it takes every outside bet with it. That one
 * rule *is* the edge on the even-money bets, and softening it (en prison, la
 * partage) would be a different game — those are variants and are not here.
 *
 * Virtual coins only. No purchase, top-up or cash-out in either direction.
 */

(() => {
    'use strict';

    const CV = (window.CV = window.CV || {});

    /** How many pockets. Single zero — see the note above. */
    const POCKETS = 37;

    /**
     * The pockets in the order they sit on a European wheel.
     *
     * This is the physical layout, not 0–36 counting order: reds and blacks
     * alternate and high and low are spread around the rim so no quarter of
     * the wheel is worth more than another. Nothing in the maths depends on
     * it — every pocket is equally likely — but the wheel is drawn from it,
     * and drawing 0–36 in a ring would look nothing like roulette.
     */
    const ORDER = [
        0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
        10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
    ];

    /** The red pockets. Everything else from 1 to 36 is black; 0 is green. */
    const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

    const colourOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

    /**
     * What each bet pays, to one.
     *
     * Inside bets are named for how many pockets they cover: a straight is 1,
     * a split 2, a street 3, a corner 4, a line 6. Outside bets cover 12 or
     * 18. Every price is (37 / covered) − 1 rounded down to the table's
     * conventional number, which is what produces the flat −2.70%.
     */
    const PAYS = {
        straight: 35, split: 17, street: 11, corner: 8, line: 5,
        column: 2, dozen: 2,
        red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1,
    };

    /** How many of the 37 pockets each kind of bet covers. */
    const COVERS = {
        straight: 1, split: 2, street: 3, corner: 4, line: 6,
        column: 12, dozen: 12,
        red: 18, black: 18, odd: 18, even: 18, low: 18, high: 18,
    };

    /** The bets this table takes. Splits, corners and lines are not offered. */
    const KINDS = ['straight', 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen', 'column'];

    /**
     * Does this bet win on `n`?
     *
     * Every branch that could quietly swallow the zero is written out, because
     * the zero is where a roulette implementation goes wrong: it is excluded
     * from odd, even, low, high, the dozens and the columns explicitly rather
     * than by relying on arithmetic to happen to exclude it.
     */
    function wins(bet, n) {
        switch (bet.kind) {
            case 'straight': return n === bet.value;
            case 'red':      return colourOf(n) === 'red';
            case 'black':    return colourOf(n) === 'black';
            case 'odd':      return n !== 0 && n % 2 === 1;
            case 'even':     return n !== 0 && n % 2 === 0;
            case 'low':      return n >= 1 && n <= 18;
            case 'high':     return n >= 19 && n <= 36;
            case 'dozen':    return n >= 1 && n <= 36 && Math.ceil(n / 12) === bet.value;
            case 'column':   return n >= 1 && n <= 36 && ((n - 1) % 3) + 1 === bet.value;
            default:         return false;
        }
    }

    /** A bet is only a bet if the table takes it. */
    function valid(bet) {
        if (!bet || KINDS.indexOf(bet.kind) < 0) return false;
        if (bet.kind === 'straight') return Number.isInteger(bet.value) && bet.value >= 0 && bet.value <= 36;
        if (bet.kind === 'dozen' || bet.kind === 'column') return [1, 2, 3].indexOf(bet.value) >= 0;
        return true;
    }

    /** Spin. Every pocket equally likely, from the table's own stream. */
    const spin = (rng) => rng.int(POCKETS);

    /** A stable key for one betting spot, so stakes on it can be added up. */
    const keyOf = (bet) => (bet.value === undefined || bet.value === null
        ? bet.kind : bet.kind + ':' + bet.value);

    CV.Wheel = {
        POCKETS, ORDER, RED, PAYS, COVERS, KINDS,
        colourOf, wins, valid, spin, keyOf,
    };
})();
