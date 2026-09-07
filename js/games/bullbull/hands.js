/**
 * CardVerse — reading a 斗牛 hand.
 *
 * Five cards. Find three that add to 10, 20 or 30; the other two give the
 * bull. Nothing here settles anything — what a hand is worth is `engine.js`,
 * kept separate on purpose.
 *
 * **A 3 may be counted as a 6, and a 6 as a 3.** That is a house rule and it
 * is the reason this file is a search rather than a formula. Each 3 and each
 * 6 in the hand is worth either value independently, so five cards can be
 * read up to 2⁵ different ways, and the hand is whichever reading comes out
 * highest — 凑出个最大的数. A reading that turns 无牛 into 牛七 is the whole
 * point of the rule, so the search has to try them all rather than stop at
 * the first split it finds.
 *
 * **Under one fixed reading, the bull does not depend on which three you
 * pick.** If three cards sum to a multiple of ten, the other two sum to the
 * whole hand minus that multiple, so the last digit is the hand's total
 * either way. That is why the inner search only has to find *whether* a split
 * exists — and then look for the particular splits the special hands need.
 * It stops being true across readings, which is exactly why the outer loop
 * exists.
 *
 * Order of reading, which the rules fix and which matters because several of
 * these overlap:
 *
 *     五个 Pic          five picture cards. Also a 宝宝, also 牛牛 — read first.
 *     Pic + Black Ace   a valid split leaving one picture card and A♠ or A♣.
 *     宝宝              a valid split leaving two cards of the same value.
 *     牛牛 … 牛一        the last digit of the two.
 *     无牛              no three cards make a multiple of ten, under any reading.
 *
 * Ranking runs 五个 Pic > Pic + Black Ace > 牛牛 > 宝宝 > 牛九 … 牛一 > 无牛,
 * with a higher bull ranking a 宝宝 above another 宝宝. Two hands that rank
 * the same push.
 */

(() => {
    'use strict';

    /** A = 1, pictures and tens = 10, everything else its face. */
    const value = (card) => (card.r === 14 ? 1 : Math.min(card.r, 10));

    /**
     * What one card may be counted as, best value first.
     *
     * The only cards with a choice are the 3 and the 6, and they swap into
     * each other. Everything else is a one-element list, which keeps the
     * search below written once rather than as a special case.
     */
    const SWAP = { 3: 6, 6: 3 };
    const valuesOf = (card) => {
        const v = value(card);
        return SWAP[v] === undefined ? [v] : [v, SWAP[v]];
    };
    /** Does this card have a second value? Used to explain a hand afterwards. */
    const isFlexible = (card) => SWAP[value(card)] !== undefined;

    const isPic = (card) => card.r >= 11 && card.r <= 13;
    const isBlackAce = (card) => card.r === 14 && (card.s === 'S' || card.s === 'C');

    /** The coin table, straight from the rules. */
    const MULT = {
        FIVE_PIC: 5, PIC_BLACK_ACE: 4, BULL_BULL: 3, BABY: 3,
        BULL_9: 2, BULL_8: 2, BULL_7: 2,
        BULL_6: 1, BULL_5: 1, BULL_4: 1, BULL_3: 1, BULL_2: 1, BULL_1: 1,
        NO_BULL: 1,
    };

    /**
     * One comparable number per hand.
     *
     * The bands are what keeps the order the rules give: every 宝宝 sits
     * under 牛牛 and over 牛九, and inside its band a higher bull wins.
     */
    const RANK = { FIVE_PIC: 100, PIC_BLACK_ACE: 90, BULL_BULL: 80, NO_BULL: 0 };
    const BABY_BAND = 60;
    const BULL_BAND = 40;

    function combos3(cards, fn) {
        for (let a = 0; a < 3; a++) {
            for (let b = a + 1; b < 4; b++) {
                for (let c = b + 1; c < 5; c++) {
                    const rest = [0, 1, 2, 3, 4].filter((i) => i !== a && i !== b && i !== c);
                    fn([a, b, c], rest);
                }
            }
        }
    }

    const made = (type, bull, three, two, swaps) => ({
        type, bull, three: three || null, two: two || null,
        swaps: swaps || [],
        mult: MULT[type] || 1,
        rank: RANK[type] !== undefined ? RANK[type]
            : type === 'BABY' ? BABY_BAND + bull
            : BULL_BAND + bull,
    });

    /**
     * Read the hand under one fixed set of card values.
     *
     * @param {object[]} cards five cards
     * @param {number[]} vals  the value each card is being counted as
     * @returns {object|null} the hand, or null when no three make a ten
     */
    function readAs(cards, vals) {
        const swaps = cards
            .map((c, i) => ({ card: c, from: value(c), to: vals[i] }))
            .filter((x) => x.from !== x.to);

        const splits = [];
        combos3(cards, (three, rest) => {
            if ((vals[three[0]] + vals[three[1]] + vals[three[2]]) % 10 === 0) {
                splits.push({
                    three: three.map((i) => cards[i]),
                    two: rest.map((i) => cards[i]),
                    twoVals: rest.map((i) => vals[i]),
                });
            }
        });
        if (!splits.length) return null;

        // Under this reading the bull is the whole hand's last digit,
        // whichever split is taken.
        const bull = vals.reduce((n, v) => n + v, 0) % 10;

        const pba = splits.find(({ two }) =>
            (isPic(two[0]) && isBlackAce(two[1])) || (isPic(two[1]) && isBlackAce(two[0])));
        if (pba) return made('PIC_BLACK_ACE', bull, pba.three, pba.two, swaps);

        // A 宝宝 is a pair *as counted*: two threes read as two sixes are
        // still a pair, and a three read as six beside a real six is one too.
        const baby = splits.find(({ twoVals }) => twoVals[0] === twoVals[1]);
        if (baby) return made('BABY', bull, baby.three, baby.two, swaps);

        if (bull === 0) return made('BULL_BULL', 0, splits[0].three, splits[0].two, swaps);
        return made('BULL_' + bull, bull, splits[0].three, splits[0].two, swaps);
    }

    /** Every way the flexible cards can be counted, as value arrays. */
    function readings(cards) {
        let out = [[]];
        for (const card of cards) {
            const next = [];
            for (const so_far of out) for (const v of valuesOf(card)) next.push(so_far.concat(v));
            out = next;
        }
        return out;
    }

    /**
     * @param {object[]} cards exactly five
     * @returns {{type:string, bull:number|null, mult:number, rank:number,
     *            three:object[]|null, two:object[]|null,
     *            swaps:{card:object,from:number,to:number}[]}}
     */
    function evaluate(cards) {
        // 五个 Pic beats everything, and it is also a 宝宝 and a 牛牛, so it
        // has to be asked first or it would never be seen. No picture card is
        // a 3 or a 6, so the swap rule cannot reach it.
        if (cards.length === 5 && cards.every(isPic)) {
            return made('FIVE_PIC', null, cards.slice(0, 3), cards.slice(3));
        }

        let best = null;
        for (const vals of readings(cards)) {
            const hand = readAs(cards, vals);
            if (!hand) continue;
            // Highest hand wins; among equals, the one that had to swap least
            // is kept, so a hand that reads fine on its face is not reported
            // as a conversion it did not need.
            if (!best || hand.rank > best.rank
                || (hand.rank === best.rank && hand.swaps.length < best.swaps.length)) best = hand;
        }
        return best || made('NO_BULL', null);
    }

    /** Positive if `a` beats `b`, negative if `b` does, zero for a push. */
    const compare = (a, b) => a.rank - b.rank;

    window.CV = window.CV || {};
    window.CV.BullHands = {
        value, valuesOf, isFlexible, isPic, isBlackAce,
        MULT, RANK, SWAP, evaluate, compare,
    };
})();
