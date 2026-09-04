/**
 * CardVerse — reading a 斗牛 hand.
 *
 * Five cards. Find three that add to 10, 20 or 30; the other two give the
 * bull. Nothing here settles anything — what a hand is worth is `engine.js`,
 * kept separate on purpose.
 *
 * **The bull does not depend on which three you pick.** If three cards sum to
 * a multiple of ten, the other two sum to the whole hand minus that multiple,
 * so the last digit is the hand's total either way. That is why the search
 * below only has to find *whether* a split exists — and then look for the
 * particular splits the special hands need.
 *
 * Order of reading, which the rules fix and which matters because several of
 * these overlap:
 *
 *     五个 Pic          five picture cards. Also a 宝宝, also 牛牛 — read first.
 *     Pic + Black Ace   a valid split leaving one picture card and A♠ or A♣.
 *     宝宝              a valid split leaving two cards of the same value.
 *     牛牛 … 牛一        the last digit of the two.
 *     无牛              no three cards make a multiple of ten.
 *
 * Ranking runs 五个 Pic > Pic + Black Ace > 牛牛 > 宝宝 > 牛九 … 牛一 > 无牛,
 * with a higher bull ranking a 宝宝 above another 宝宝. Two hands that rank
 * the same push.
 */

(() => {
    'use strict';

    /** A = 1, pictures and tens = 10, everything else its face. */
    const value = (card) => (card.r === 14 ? 1 : Math.min(card.r, 10));

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
                    fn([cards[a], cards[b], cards[c]], [cards[rest[0]], cards[rest[1]]]);
                }
            }
        }
    }

    /**
     * @param {object[]} cards exactly five
     * @returns {{type:string, bull:number|null, mult:number, rank:number,
     *            three:object[]|null, two:object[]|null, convertedFrom:number|null}}
     */
    function evaluate(cards) {
        const made = (type, bull, three, two, convertedFrom) => ({
            type, bull, three: three || null, two: two || null,
            convertedFrom: convertedFrom === undefined ? null : convertedFrom,
            mult: MULT[type] || 1,
            rank: RANK[type] !== undefined ? RANK[type]
                : type === 'BABY' ? BABY_BAND + bull
                : BULL_BAND + bull,
        });

        // 五个 Pic beats everything, and it is also a 宝宝 and a 牛牛, so it
        // has to be asked first or it would never be seen.
        if (cards.length === 5 && cards.every(isPic)) {
            return made('FIVE_PIC', null, cards.slice(0, 3), cards.slice(3));
        }

        const splits = [];
        combos3(cards, (three, two) => {
            const sum = three.reduce((n, c) => n + value(c), 0);
            if (sum % 10 === 0) splits.push({ three, two });
        });
        if (!splits.length) return made('NO_BULL', null);

        // The bull is the whole hand's last digit, whichever split you take.
        const bull = cards.reduce((n, c) => n + value(c), 0) % 10;

        const pba = splits.find(({ two }) =>
            (isPic(two[0]) && isBlackAce(two[1])) || (isPic(two[1]) && isBlackAce(two[0])));
        if (pba) return made('PIC_BLACK_ACE', bull, pba.three, pba.two);

        const baby = splits.find(({ two }) => value(two[0]) === value(two[1]));
        if (baby) {
            // The 3 ↔ 6 rule. A pair always sums to an even number, so a 宝宝
            // can only ever land on 0, 2, 4, 6 or 8 — a bull of three cannot
            // come up and this never fires. It is written out anyway so the
            // rule is in the code rather than in someone's memory.
            const conv = bull === 3 ? 3 : null;
            return made('BABY', conv ? 6 : bull, baby.three, baby.two, conv);
        }

        if (bull === 0) return made('BULL_BULL', 0, splits[0].three, splits[0].two);
        return made('BULL_' + bull, bull, splits[0].three, splits[0].two);
    }

    /** Positive if `a` beats `b`, negative if `b` does, zero for a push. */
    const compare = (a, b) => a.rank - b.rank;

    window.CV = window.CV || {};
    window.CV.BullHands = { value, isPic, isBlackAce, MULT, RANK, evaluate, compare };
})();
