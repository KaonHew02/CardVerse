/**
 * CardVerse — three dice, and what they come to.
 *
 * Add them up. Three of a kind is 围骰 and nothing else; otherwise 4 to 10 is
 * 小 and 11 to 17 is 大.
 *
 * **围骰 is checked first, and that is the whole rule.** 5+5+5 is fifteen,
 * which is inside 大, and it is still 围骰. It also means 3 and 18 never
 * appear as 小 or 大 at all — the only way to reach either is with three
 * ones or three sixes, and both are already spoken for.
 *
 * Odds are not settled yet, so `PAYS` is one object with a note on it rather
 * than numbers scattered through the engine.
 */

(() => {
    'use strict';

    /** Small is 4 to 10, big is 11 to 17, and nothing else is either. */
    const SMALL = [4, 10];
    const BIG   = [11, 17];

    /**
     * What each bet returns, as a multiple of the stake.
     *
     * **Not settled.** The rules stop at reading the dice and leave the odds
     * for later, so these are the ordinary table numbers and nothing more:
     * 大 and 小 pay evens and both lose to a triple, which is the whole house
     * edge; any 围骰 pays 30 to 1, and naming which one pays 180 to 1.
     *
     * The two triple prices are worth reading together. Any triple is six
     * throws in 216 and pays 30, which is a 13.9% edge to the table. Naming
     * one is a single throw in 216 and pays 180, which is 16.2% — dearer for
     * a much longer shot, the way it usually is.
     */
    const PAYS = { big: 1, small: 1, triple: 30, exact: 180 };

    /** What a player may back. `exact` also carries a face, 1 to 6. */
    const SIDES = ['big', 'small', 'triple', 'exact'];
    const FACES = [1, 2, 3, 4, 5, 6];

    /**
     * @param {number[]} dice three values, 1 to 6
     * @returns {{type:string, total:number, face:number|null}}
     */
    function read(dice) {
        const [d1, d2, d3] = dice;
        const total = d1 + d2 + d3;

        // 围骰 first. Everything else is decided after this has been ruled out.
        if (d1 === d2 && d2 === d3) return { type: 'triple', total, face: d1 };
        if (total >= SMALL[0] && total <= SMALL[1]) return { type: 'small', total, face: null };
        if (total >= BIG[0] && total <= BIG[1]) return { type: 'big', total, face: null };
        return { type: 'unknown', total, face: null };
    }

    /** Roll three, from the table's own stream and nowhere else. */
    const roll = (rng) => [rng.range(1, 6), rng.range(1, 6), rng.range(1, 6)];

    /**
     * Does a bet on `side` win against this reading?
     *
     * 大 and 小 lose to a triple even when the total is inside their range —
     * a fifteen made of three fives is not a 大. A named triple wants that
     * exact face and nothing else: three fives does not pay a bet on threes.
     */
    function wins(side, result, face) {
        if (side === 'exact') return result.type === 'triple' && result.face === face;
        return side === result.type;
    }

    window.CV = window.CV || {};
    window.CV.Dice = { SMALL, BIG, PAYS, SIDES, FACES, read, roll, wins };
})();
