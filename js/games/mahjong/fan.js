/**
 * CardVerse — 番 detection.
 *
 * `calculateFan(hand)` looks at a finished winning hand and returns every
 * pattern it contains and what they are worth. It knows nothing about who
 * pays whom; that is `pay.js`, deliberately kept apart so the table can be
 * re-priced without touching the rules.
 *
 * **The fan table and the overlap rules are data.** `FAN` is what each
 * pattern is worth and `REPLACES` is which patterns a bigger one swallows,
 * so a regional variant is an edit to two objects rather than a rewrite. The
 * rule the table exists to enforce is that nothing is ever counted twice:
 * 清一色 and 碰碰胡 together are 清碰 and nothing else, 大三元 is not also
 * 小三元, and 豪华七对子 is not also 七对子.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** What each pattern pays. Edit here to re-tune the table. */
    const FAN = {
        '平胡': 1, '自摸': 1, '门清': 1,
        '碰碰胡': 2, '混一色': 3,
        '七对子': 4, '小三元': 4,
        '清一色': 6,
        '豪华七对子': 8, '清七对': 8, '清碰': 8, '字一色': 8, '大三元': 8, '小四喜': 8,
        '大四喜': 16, '四杠子': 16, '十三幺': 16,
    };

    /** Which patterns each one swallows. Applied until nothing changes. */
    const REPLACES = {
        '清碰':      ['清一色', '混一色', '碰碰胡', '平胡'],
        '清七对':    ['清一色', '混一色', '七对子', '豪华七对子', '平胡'],
        '豪华七对子': ['七对子', '平胡'],
        '七对子':    ['平胡'],
        '字一色':    ['混一色', '碰碰胡', '平胡'],
        '大三元':    ['小三元'],
        '大四喜':    ['小四喜'],
        '四杠子':    ['碰碰胡', '平胡'],
        '清一色':    ['混一色', '平胡'],
        '混一色':    ['平胡'],
        '碰碰胡':    ['平胡'],
        '十三幺':    ['平胡'],
    };

    const isDragonKey = (k) => k[0] === 'z' && Number(k.slice(1)) >= 5;
    const isWindKey   = (k) => k[0] === 'z' && Number(k.slice(1)) <= 4;

    /**
     * @param {object} hand
     * @param {string} hand.shape     'standard' | 'sevenPairs' | 'thirteenOrphans'
     * @param {Array}  hand.melds     four melds for a standard hand: { type, key }
     * @param {string} hand.pair      the pair's key
     * @param {string[]} hand.keys    every tile in the hand, melded ones included
     * @param {boolean} hand.selfDraw drew the winning tile
     * @param {boolean} hand.menzen   nothing melded from a discard
     * @param {boolean} hand.quad     seven pairs holding a four of a kind
     */
    function calculateFan(hand) {
        const found = new Set();
        const melds = hand.melds || [];
        const keys = hand.keys || [];

        const suits = new Set(keys.map((k) => k[0]));
        const numbered = [...suits].filter((s) => s !== 'z');
        const honours = suits.has('z');
        const pure = numbered.length === 1 && !honours;
        const half = numbered.length === 1 && honours;
        const allHonours = numbered.length === 0;

        /* --- the shape ---------------------------------------------------- */

        if (hand.shape === 'thirteenOrphans') {
            found.add('十三幺');
        } else if (hand.shape === 'sevenPairs') {
            found.add('七对子');
            if (hand.quad) found.add('豪华七对子');
            if (pure) found.add('清七对');
        } else {
            found.add('平胡');
            const sets = melds.filter((m) => m.type === 'pung' || m.type === 'kong');
            if (sets.length === 4) found.add('碰碰胡');
            if (melds.filter((m) => m.type === 'kong').length === 4) found.add('四杠子');

            // Dragons: three of them is 大三元, two and the pair is 小三元.
            const dragons = sets.filter((m) => isDragonKey(m.key)).length;
            if (dragons === 3) found.add('大三元');
            else if (dragons === 2 && isDragonKey(hand.pair)) found.add('小三元');

            // Winds: the same shape one rank up.
            const winds = sets.filter((m) => isWindKey(m.key)).length;
            if (winds === 4) found.add('大四喜');
            else if (winds === 3 && isWindKey(hand.pair)) found.add('小四喜');
        }

        /* --- the suits ------------------------------------------------------ */

        if (allHonours) found.add('字一色');
        else if (pure) {
            found.add('清一色');
            if (found.has('碰碰胡')) found.add('清碰');
        } else if (half) found.add('混一色');

        /* --- how it was won -------------------------------------------------- */

        if (hand.selfDraw) found.add('自摸');
        if (hand.menzen) found.add('门清');

        /* --- nothing counted twice ------------------------------------------- */

        for (;;) {
            let changed = false;
            for (const name of [...found]) {
                for (const gone of (REPLACES[name] || [])) {
                    if (found.delete(gone)) changed = true;
                }
            }
            if (!changed) break;
        }

        const patterns = [...found]
            .map((name) => ({ name, fan: FAN[name] || 0 }))
            .sort((a, b) => b.fan - a.fan || a.name.localeCompare(b.name));

        return { totalFan: patterns.reduce((n, p) => n + p.fan, 0), patterns };
    }

    CV.MJFan = { FAN, REPLACES, calculateFan };
})();
