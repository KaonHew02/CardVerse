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
 *
 * **There is one table per mode**, because the two modes are played out of
 * different boxes. A pattern that describes the box rather than the hand is
 * not a pattern: see `FAN3` and 混一色.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /**
     * What each pattern pays at **four seats** — the standard 136-tile game.
     *
     * `鸡胡` is the base: four melds and a pair with nothing else to say
     * about it. It used to be called 平胡 here, and was renamed when the
     * three-seat table started paying 平胡 for what the name actually means
     * — a hand of nothing but sequences. Two tables cannot use one name for
     * two different hands, and the base pattern is the one that had to move,
     * because 平胡 = 全顺子 is what the name means everywhere else.
     */
    const FAN = {
        '鸡胡': 1, '自摸': 1, '门清': 1,
        '碰碰胡': 2, '混一色': 3,
        '七对子': 4, '小三元': 4,
        '清一色': 6,
        '豪华七对子': 8, '清七对': 8, '清碰': 8, '字一色': 8, '大三元': 8, '小四喜': 8,
        '大四喜': 16, '四杠子': 16, '十三幺': 16,
    };

    /**
     * **Three seats — the house table**, and it is a different game, not the
     * four-seat list with a row crossed out.
     *
     * Three things make it its own table rather than a tweak:
     *
     *   **平胡 is 全顺子.** Four sequences and a pair, 4番 — the hand the
     *   name has always meant, and the one most hands are actually built
     *   towards. A hand with a pung in it that reaches no pattern is 鸡胡,
     *   1番, and 1番 does not clear the floor on its own.
     *
     *   **Patterns stack; they do not swallow each other.** 清一色 and
     *   碰碰胡 together are 3+3, which is why there is no 清碰 row: it was
     *   a name for the sum. 字一色 is 3 and is always 碰碰胡 as well, so it
     *   pays 6. The only replacements left are the ones a hand cannot hold
     *   twice — 大三元 over 小三元 — and 鸡胡, which is by definition what
     *   you have when you have nothing else.
     *
     *   **No 七对子.** Not scored, and not a winning shape either: see
     *   `MJWin.isWin`, which is told whether the table plays it. Half the
     *   old list was seven-pair variants of a hand this table does not
     *   recognise.
     *
     *   **混一色 is not here** either, for the older reason: that box is
     *   dots and honours only, so one suit plus honours is what every hand
     *   in it already is, and a pattern every hand has is not a pattern.
     *
     * The big hands are all over the 爆番 line on purpose — 大三元, 小四喜
     * and up settle at the cap however they are reached.
     */
    const FAN3 = {
        '鸡胡': 1, '自摸': 1, '门清': 1, '无花': 1,
        '碰碰胡': 3, '清一色': 3, '字一色': 3, '小三元': 3,
        '平胡': 4,
        '大三元': 12, '小四喜': 12,
        '大四喜': 16, '四杠子': 16, '十三幺': 16, '天胡': 16, '地胡': 16,
    };

    /**
     * 花 pays per tile, not per hand, so it cannot live in a name→番 table.
     * One 番 a flower, and 无花 above pays the same 1番 for holding none —
     * without it, drawing no flower all round is the one thing at this table
     * that is worse than drawing one.
     */
    const FLOWER_FAN = { 3: 1, 4: 0 };

    const TABLES = { 3: FAN3, 4: FAN };

    /** The fan table this many seats play by. */
    const tableFor = (players) => TABLES[players] || FAN;
    /** What one flower is worth at this many seats. */
    const flowerFan = (players) => FLOWER_FAN[players] || 0;

    /**
     * Which patterns each one swallows, per table. Applied until nothing
     * changes.
     *
     * 鸡胡 is in almost every list because it is not a pattern — it is the
     * word for having none, so anything at all displaces it.
     */
    const REPLACES = {
        '清碰':      ['清一色', '混一色', '碰碰胡', '鸡胡'],
        '清七对':    ['清一色', '混一色', '七对子', '豪华七对子', '鸡胡'],
        '豪华七对子': ['七对子', '鸡胡'],
        '七对子':    ['鸡胡'],
        '字一色':    ['混一色', '碰碰胡', '鸡胡'],
        '大三元':    ['小三元'],
        '大四喜':    ['小四喜'],
        '四杠子':    ['碰碰胡', '鸡胡'],
        '清一色':    ['混一色', '鸡胡'],
        '混一色':    ['鸡胡'],
        '碰碰胡':    ['鸡胡'],
        '平胡':      ['鸡胡'],
        '十三幺':    ['鸡胡'],
    };

    /** Three seats: everything stacks, so only the impossible pairs go. */
    const REPLACES3 = {
        // The big ones list 鸡胡 too: 大三元 is found *instead of* 小三元,
        // never alongside it, so it cannot reach 鸡胡 through the smaller
        // pattern's own line the way 平胡 and the rest do.
        '大三元': ['小三元', '鸡胡'],
        '大四喜': ['小四喜', '鸡胡'],
        '平胡':   ['鸡胡'],
        '碰碰胡': ['鸡胡'],
        '清一色': ['鸡胡'],
        '字一色': ['鸡胡'],
        '小三元': ['鸡胡'],
        '小四喜': ['鸡胡'],
        '四杠子': ['鸡胡'],
        '十三幺': ['鸡胡'],
        '天胡':   ['鸡胡'],
        '地胡':   ['鸡胡'],
    };

    const OVERLAPS = new Map([[FAN3, REPLACES3]]);
    /** The overlap rules that go with a fan table. */
    const overlapsFor = (table) => OVERLAPS.get(table) || REPLACES;

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
     * @param {number} [hand.flowers] flowers turned — paid per tile, and
     *                                paid as 无花 when there are none
     * @param {boolean} [hand.heaven] the dealer went out on the dealt hand
     * @param {boolean} [hand.earth]  won on the dealer's very first discard
     * @param {object} [table]        the mode's fan table; four seats by default
     */
    function calculateFan(hand, table) {
        const FAN = table || TABLES[4];
        const REPLACES = overlapsFor(FAN);
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
            // The base — what you have when the hand has nothing else to say
            // about it. Every real pattern displaces it; see `REPLACES`.
            found.add('鸡胡');
            const sets = melds.filter((m) => m.type === 'pung' || m.type === 'kong');
            // 平胡 is 全顺子: four sequences and a pair, not one triplet among
            // them. The four-seat table has no row for it, so the filter
            // below drops it there and that table is unchanged.
            if (!sets.length) found.add('平胡');
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
        // 天胡 and 地胡 are about *when* the hand closed rather than what is
        // in it: the dealer going out on the tiles they were dealt, and
        // anybody else going out on the dealer's very first throw.
        if (hand.heaven) found.add('天胡');
        if (hand.earth) found.add('地胡');
        if (!hand.flowers) found.add('无花');

        /* --- nothing this table does not pay for ------------------------------ */

        // Dropped before the overlaps are resolved, not after. 混一色 swallows
        // 平胡, so a table that does not price 混一色 would otherwise let it
        // eat the base pattern on its way out and score the hand at nothing.
        for (const name of [...found]) if (!(FAN[name] > 0)) found.delete(name);

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

        // 花 is the one thing on this table that pays by the tile, so it is
        // appended rather than found above: three flowers is 3番, and no
        // name→番 table can say that.
        const rate = FAN === FAN3 ? FLOWER_FAN[3] : 0;
        if (rate && hand.flowers) {
            patterns.push({ name: '花', fan: hand.flowers * rate, n: hand.flowers });
        }

        return { totalFan: patterns.reduce((n, p) => n + p.fan, 0), patterns };
    }

    /**
     * **番 so far** — what an unfinished hand is already carrying.
     *
     * `calculateFan` answers "what did this win contain", which is the only
     * question that decides money and the wrong question to be asked
     * thirteen tiles in. A player at three seats has a 2番 floor to clear
     * and no way to see where they stand against it until the hand is
     * finished, at which point being short is news that arrives too late to
     * act on.
     *
     * So this counts only the patterns that are **facts about the tiles
     * being held right now** — the suits they are in, and whether anything
     * was claimed from a discard. Nothing about shape: "all my melds are
     * pungs" is not 碰碰胡 until the hand closes, and a counter that pays
     * out 2番 of hope is worse than no counter. The number can therefore
     * only go up when the hand improves, never down because the hand
     * finished differently than the screen guessed.
     *
     * @param {object} hand
     * @param {string[]} hand.keys  every tile held, melds included, flies
     *                              and flowers left out — they are not in a
     *                              suit and decide nothing here
     * @param {boolean} hand.menzen nothing melded from a discard
     * @param {object} [table]      the mode's fan table
     */
    function progress(hand, table) {
        const FAN = table || TABLES[4];
        const REPLACES = overlapsFor(FAN);
        const found = new Set();
        const keys = hand.keys || [];

        const suits = new Set(keys.map((k) => k[0]));
        const numbered = [...suits].filter((s) => s !== 'z');
        const honours = suits.has('z');

        found.add('鸡胡');
        if (keys.length) {
            if (numbered.length === 0) found.add('字一色');
            else if (numbered.length === 1 && !honours) found.add('清一色');
            else if (numbered.length === 1) found.add('混一色');
        }
        if (hand.menzen) found.add('门清');
        // 无花 is a fact about the hand as it stands, and the only one here
        // that can go backwards — the next draw can take it away. It is
        // still worth showing: at a 5番 floor, holding no flower against
        // holding one is the difference between a hand that can be declared
        // and one that cannot, and a player who cannot see it cannot plan
        // around it.
        if (!hand.flowers) found.add('无花');

        // Dropped before the overlaps, exactly as `calculateFan` does it: a
        // pattern this table does not pay for must not eat 鸡胡 on its way
        // out. See the note there.
        for (const name of [...found]) if (!(FAN[name] > 0)) found.delete(name);

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

        // 花 is the one thing on this table that pays by the tile, so it is
        // appended rather than found above: three flowers is 3番, and no
        // name→番 table can say that.
        const rate = FAN === FAN3 ? FLOWER_FAN[3] : 0;
        if (rate && hand.flowers) {
            patterns.push({ name: '花', fan: hand.flowers * rate, n: hand.flowers });
        }

        return { totalFan: patterns.reduce((n, p) => n + p.fan, 0), patterns };
    }

    CV.MJFan = { FAN, FAN3, TABLES, REPLACES, REPLACES3, FLOWER_FAN,
        tableFor, flowerFan, overlapsFor, calculateFan, progress };
})();
