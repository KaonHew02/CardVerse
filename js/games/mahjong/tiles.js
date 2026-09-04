/**
 * CardVerse — mahjong tiles.
 *
 * A tile is `{ suit, n, id }`. `suit` is one of:
 *
 *     m  万子  characters, n 1-9
 *     s  索子  bamboo,     n 1-9
 *     p  筒子  dots,       n 1-9
 *     z  字牌  honours,    n 1-7 = 东 南 西 北 中 发 白
 *
 * `key` is `suit + n` — 'm3', 'z5' — and it is what the rules compare. `id`
 * is unique across the set so the screen can tell one copy of 3萬 from
 * another, the same way the card games do.
 *
 * **The two modes are two tile sets, not one set with a filter.**
 *
 *     four players   136 tiles   m1-9, s1-9, p1-9, z1-7, four of each
 *     three players  108 tiles   m1 and m9 only — the rest of the
 *                                characters are out of the game
 *
 * No flowers and no seasons in either.
 */

(() => {
    'use strict';

    const SUITS = ['m', 's', 'p', 'z'];

    /** Honours in the order the rules list them. */
    const HONOURS = ['东', '南', '西', '北', '中', '发', '白'];
    const HONOUR_EN = ['East', 'South', 'West', 'North', 'Red', 'Green', 'White'];

    const SUIT_MARK = { m: '万', s: '条', p: '筒' };

    const key = (tile) => tile.suit + tile.n;
    const isHonour = (tile) => tile.suit === 'z';
    const isWind = (tile) => tile.suit === 'z' && tile.n <= 4;
    const isDragon = (tile) => tile.suit === 'z' && tile.n >= 5;
    /** A terminal is a 1 or a 9; with the honours these are the 幺九 tiles. */
    const isTerminal = (tile) => tile.suit !== 'z' && (tile.n === 1 || tile.n === 9);
    const isOrphan = (tile) => isHonour(tile) || isTerminal(tile);

    /** Every key in a set, in display order. */
    function keysFor(players) {
        const out = [];
        const numbers = players === 3 ? [1, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (const n of numbers) out.push('m' + n);
        for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) out.push('s' + n);
        for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) out.push('p' + n);
        for (const n of [1, 2, 3, 4, 5, 6, 7]) out.push('z' + n);
        return out;
    }

    const parse = (k) => ({ suit: k[0], n: Number(k.slice(1)) });

    /**
     * The whole set, four of every tile the mode uses.
     * @param {number} players 3 or 4
     */
    function build(players) {
        const out = [];
        for (const k of keysFor(players)) {
            const { suit, n } = parse(k);
            for (let c = 0; c < 4; c++) out.push({ suit, n, id: `${k}-${c}` });
        }
        return out;
    }

    /** Characters, then bamboo, then dots, then honours; numbers ascending. */
    const ORDER = { m: 0, s: 1, p: 2, z: 3 };
    const sort = (tiles) => tiles.slice().sort((a, b) => ORDER[a.suit] - ORDER[b.suit] || a.n - b.n);

    /** How many of each key, keyed by `key`. */
    function counts(tiles) {
        const m = new Map();
        for (const tile of tiles) m.set(key(tile), (m.get(key(tile)) || 0) + 1);
        return m;
    }

    /** "3万", "东" — what the tile is called. */
    function name(tile) {
        if (isHonour(tile)) return HONOURS[tile.n - 1];
        return tile.n + SUIT_MARK[tile.suit];
    }

    function nameEn(tile) {
        if (isHonour(tile)) return HONOUR_EN[tile.n - 1];
        return `${tile.n} ${{ m: 'Characters', s: 'Bamboo', p: 'Dots' }[tile.suit]}`;
    }

    /** The 13 tiles 十三幺 is built from: every terminal and every honour. */
    const ORPHAN_KEYS = ['m1', 'm9', 's1', 's9', 'p1', 'p9', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];

    window.CV = window.CV || {};
    window.CV.MJ = {
        SUITS, HONOURS, HONOUR_EN, SUIT_MARK, ORPHAN_KEYS,
        key, parse, isHonour, isWind, isDragon, isTerminal, isOrphan,
        keysFor, build, sort, counts, name, nameEn,
    };
})();
