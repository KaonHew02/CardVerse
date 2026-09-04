/**
 * CardVerse — mahjong tiles.
 *
 * A tile is `{ suit, n, id }`. `suit` is one of:
 *
 *     m  万子  characters, n 1-9      four-player only
 *     s  索子  bamboo,     n 1-9      four-player only
 *     p  筒子  dots,       n 1-9
 *     z  字牌  honours,    n 1-7 = 东 南 西 北 中 发 白
 *     f  花牌  flowers,    n 1-8      three-player only
 *     F  飞牌  fly,        n 1-…      three-player only, wild
 *
 * `key` is `suit + n` — 'p3', 'z5' — and it is what the rules compare. `id`
 * is unique across the set so the screen can tell one copy of 3筒 from
 * another, the same way the card games do.
 *
 * **The two modes are two different games, not one game with a filter.**
 *
 *     four players   136 tiles   m1-9, s1-9, p1-9, z1-7, four of each.
 *                                No flowers. No fly.
 *     three players  72 + fly    dots, winds, dragons and eight flowers.
 *                                The characters and the bamboo are not in
 *                                the box at all.
 *
 * That difference is why 十三幺 cannot be made at a three-player table: four
 * of its thirteen tiles do not exist. Nothing special-cases it — the hand is
 * simply unreachable, which is what the rules ask for.
 */

(() => {
    'use strict';

    /** Honours in the order the rules list them. */
    const HONOURS = ['东', '南', '西', '北', '中', '发', '白'];
    const HONOUR_EN = ['East', 'South', 'West', 'North', 'Red', 'Green', 'White'];

    const SUIT_MARK = { m: '万', s: '条', p: '筒' };

    /**
     * How many fly tiles a three-player set holds.
     *
     * **Not settled.** The rules say "72 base tiles plus fly" and leave the
     * count open — four, eight, or something else. This is the one number to
     * change when it is decided; nothing else depends on it.
     */
    const FLY_COUNT = 4;

    /** Eight flowers, as the three-player set specifies. */
    const FLOWER_COUNT = 8;

    const key = (tile) => tile.suit + tile.n;
    const isHonour = (tile) => tile.suit === 'z';
    const isWind = (tile) => tile.suit === 'z' && tile.n <= 4;
    const isDragon = (tile) => tile.suit === 'z' && tile.n >= 5;
    const isFlower = (tile) => tile.suit === 'f';
    const isFly = (tile) => tile.suit === 'F';
    /** A tile that is part of a hand — not a flower, not a fly. */
    const isPlaying = (tile) => tile.suit !== 'f' && tile.suit !== 'F';
    /** A terminal is a 1 or a 9; with the honours these are the 幺九 tiles. */
    const isTerminal = (tile) => 'msp'.includes(tile.suit) && (tile.n === 1 || tile.n === 9);
    const isOrphan = (tile) => isHonour(tile) || isTerminal(tile);

    /** The playing tiles a mode uses, in display order. */
    function keysFor(players) {
        const out = [];
        if (players !== 3) {
            for (let n = 1; n <= 9; n++) out.push('m' + n);
            for (let n = 1; n <= 9; n++) out.push('s' + n);
        }
        for (let n = 1; n <= 9; n++) out.push('p' + n);
        for (let n = 1; n <= 7; n++) out.push('z' + n);
        return out;
    }

    const parse = (k) => ({ suit: k[0], n: Number(k.slice(1)) });

    /**
     * The whole set: four of every playing tile the mode uses, plus — at a
     * three-player table — the flowers and the fly.
     *
     * @param {number} players 3 or 4
     * @param {object} [opts] `{ fly, flowers }` to override the counts
     */
    function build(players, opts) {
        const cfg = Object.assign({
            fly: players === 3 ? FLY_COUNT : 0,
            flowers: players === 3 ? FLOWER_COUNT : 0,
        }, opts || {});

        const out = [];
        for (const k of keysFor(players)) {
            const { suit, n } = parse(k);
            for (let c = 0; c < 4; c++) out.push({ suit, n, id: `${k}-${c}` });
        }
        for (let n = 1; n <= cfg.flowers; n++) out.push({ suit: 'f', n, id: `f${n}` });
        // A fly stands in for any tile. `dun` is the 顿飞 state, which the
        // rules have not yet defined a trigger for — see `isDun` below.
        for (let n = 1; n <= cfg.fly; n++) out.push({ suit: 'F', n, wild: true, dun: false, id: `F${n}` });
        return out;
    }

    /**
     * 顿飞. A fly in this state may count towards 番; an ordinary one is only
     * a wild card and adds nothing.
     *
     * **The condition is not defined yet.** The rules are explicit that not
     * every fly is a 顿飞 and that the trigger is still to come, so this
     * returns false and the fan calculator adds nothing for it. When the rule
     * arrives it goes here and nothing else moves.
     */
    const isDun = (tile) => !!(tile && tile.dun);

    /** Characters, bamboo, dots, honours, then flowers and fly. */
    const ORDER = { m: 0, s: 1, p: 2, z: 3, f: 4, F: 5 };
    const sort = (tiles) => tiles.slice().sort((a, b) => ORDER[a.suit] - ORDER[b.suit] || a.n - b.n);

    /** How many of each playing tile, keyed by `key`. Flowers and fly are not in it. */
    function counts(tiles) {
        const m = new Map();
        for (const tile of tiles) {
            if (!isPlaying(tile)) continue;
            m.set(key(tile), (m.get(key(tile)) || 0) + 1);
        }
        return m;
    }

    /** Counts, plus how many wilds are sitting in the hand alongside them. */
    function split(tiles) {
        return {
            counts: counts(tiles),
            wilds: tiles.filter(isFly).length,
            dun: tiles.filter((x) => isFly(x) && isDun(x)).length,
            flowers: tiles.filter(isFlower).length,
        };
    }

    /** "3筒", "东", "飞" — what the tile is called. */
    function name(tile) {
        if (isFly(tile)) return '飞';
        if (isFlower(tile)) return '花' + tile.n;
        if (isHonour(tile)) return HONOURS[tile.n - 1];
        return tile.n + SUIT_MARK[tile.suit];
    }

    function nameEn(tile) {
        if (isFly(tile)) return 'Fly';
        if (isFlower(tile)) return 'Flower ' + tile.n;
        if (isHonour(tile)) return HONOUR_EN[tile.n - 1];
        return `${tile.n} ${{ m: 'Characters', s: 'Bamboo', p: 'Dots' }[tile.suit]}`;
    }

    /** The 13 tiles 十三幺 is built from. Four of them are absent at three seats. */
    const ORPHAN_KEYS = ['m1', 'm9', 's1', 's9', 'p1', 'p9', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];

    window.CV = window.CV || {};
    window.CV.MJ = {
        HONOURS, HONOUR_EN, SUIT_MARK, ORPHAN_KEYS, FLY_COUNT, FLOWER_COUNT,
        key, parse, isHonour, isWind, isDragon, isTerminal, isOrphan,
        isFlower, isFly, isPlaying, isDun,
        keysFor, build, sort, counts, split, name, nameEn,
    };
})();
