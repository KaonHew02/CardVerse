/**
 * CardVerse — is this hand won, and if not, how far off is it.
 *
 * Three winning shapes:
 *
 *     standard          four melds and a pair
 *     七对子             seven pairs
 *     十三幺             the thirteen terminals and honours, one of them twice
 *
 * **飞 is a wild card, and it is threaded through all three.** A fly stands
 * in for any tile *that exists in this set*, which is why every function here
 * takes a `pool`: at a three-player table there are no characters and no
 * bamboo, so a fly cannot become one, and 十三幺 stays unreachable without
 * anything having to special-case it.
 *
 * A wild is spent, never invented: the search only succeeds when every tile
 * and every fly in the hand has been used. Leftover wilds fail, the same way
 * a leftover tile does.
 *
 * `isWin` is exact. `waits` is exact too, and is just `isWin` asked once for
 * every tile that could arrive. `shanten` — how many tiles from ready — is
 * exact where it matters and a heuristic beyond it: won is -1 and ready is 0
 * because both are answered by `isWin`, while deeper hands get a block count
 * that is only ever used to order one discard against another.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const MJ = CV.MJ;

    /** Every playing tile there is, in decomposition order. */
    const ALL_KEYS = (() => {
        const out = [];
        for (const suit of ['m', 's', 'p']) for (let n = 1; n <= 9; n++) out.push(suit + n);
        for (let n = 1; n <= 7; n++) out.push('z' + n);
        return out;
    })();

    const at = (cnt, k) => cnt.get(k) || 0;
    const add = (cnt, k, d) => cnt.set(k, at(cnt, k) + d);

    /** The keys a fly may become — the tiles this set actually contains. */
    const poolOf = (pool) => (pool && pool.length ? pool : ALL_KEYS);

    // Membership is asked inside the search, so it is a set rather than a
    // scan. One per pool array, kept for as long as the caller keeps it.
    const SETS = new WeakMap();
    function inPool(keys, k) {
        let set = SETS.get(keys);
        if (!set) { set = new Set(keys); SETS.set(keys, set); }
        return set.has(k);
    }

    function firstKey(cnt, keys) {
        for (const k of keys) if (at(cnt, k) > 0) return k;
        return null;
    }

    /**
     * Pull `need` melds out of `cnt`, spending at most `wilds` flies, leaving
     * nothing behind. Returns the melds or null.
     *
     * Working from the lowest tile up makes the search complete without
     * trying every order: whatever the lowest tile is, it is either in a pung
     * or in a chow that starts on it — and with a fly to hand, in a pung or
     * chow that is short a tile.
     */
    function meldsFrom(cnt, need, wilds, keys, spare, acc) {
        if (need === 0) return (firstKey(cnt, keys) === null && wilds === 0) ? acc : null;
        const k = firstKey(cnt, keys);

        if (!k) {
            // Only flies left. Three of them make a meld of anything the set
            // holds; the identity is the hand's own suit, so a pure hand is
            // not broken by the way its wilds were counted.
            if (wilds !== need * 3) return null;
            const out = acc.slice();
            for (let i = 0; i < need; i++) out.push({ type: 'pung', key: spare, wild: 3 });
            return out;
        }

        const suit = k[0], n = Number(k.slice(1));

        // 刻子 — take what is there and buy the rest.
        const have = Math.min(at(cnt, k), 3);
        const buy = 3 - have;
        if (buy <= wilds) {
            add(cnt, k, -have);
            const got = meldsFrom(cnt, need - 1, wilds - buy, keys, spare,
                acc.concat([{ type: 'pung', key: k, wild: buy }]));
            add(cnt, k, have);
            if (got) return got;
        }

        // 顺子 — dots, characters or bamboo, and only where the run fits
        // inside this set. The lowest tile is real by construction, so at
        // most two of the three are ever bought.
        if (suit !== 'z' && n <= 7) {
            const run = [k, suit + (n + 1), suit + (n + 2)];
            if (run.every((x) => inPool(keys, x))) {
                const took = [];
                let cost = 0;
                for (const x of run) {
                    if (at(cnt, x) > 0) took.push(x); else cost++;
                }
                if (cost <= wilds) {
                    for (const x of took) add(cnt, x, -1);
                    const got = meldsFrom(cnt, need - 1, wilds - cost, keys, spare,
                        acc.concat([{ type: 'chow', key: k, wild: cost }]));
                    for (const x of took) add(cnt, x, 1);
                    if (got) return got;
                }
            }
        }
        return null;
    }

    /** Four melds and a pair, counting melds already on the table. */
    function standard(cnt, exposed, wilds, keys) {
        const spare = spareKey(cnt, keys);
        // Every tile that could be the pair, then the flies as a pair of one.
        for (const k of keys) {
            const c = at(cnt, k);
            if (c >= 2) {
                add(cnt, k, -2);
                const melds = meldsFrom(clone(cnt), 4 - exposed, wilds, keys, spare, []);
                add(cnt, k, 2);
                if (melds) return { shape: 'standard', melds, pair: k };
            }
            if (c === 1 && wilds >= 1) {
                add(cnt, k, -1);
                const melds = meldsFrom(clone(cnt), 4 - exposed, wilds - 1, keys, spare, []);
                add(cnt, k, 1);
                if (melds) return { shape: 'standard', melds, pair: k, pairWild: 1 };
            }
        }
        if (wilds >= 2) {
            const melds = meldsFrom(clone(cnt), 4 - exposed, wilds - 2, keys, spare, []);
            if (melds) return { shape: 'standard', melds, pair: spare, pairWild: 2 };
        }
        return null;
    }

    const clone = (cnt) => new Map(cnt);

    /**
     * What an unanchored wild becomes: the suit the hand is already made of,
     * so counting the wilds never breaks a 清一色 that is plainly there.
     */
    function spareKey(cnt, keys) {
        const tally = {};
        for (const k of keys) {
            const c = at(cnt, k);
            if (c) tally[k[0]] = (tally[k[0]] || 0) + c;
        }
        const suit = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
        if (!suit || suit === 'z') return poolOf(keys).find((k) => k[0] !== 'z') || 'p1';
        return suit + '1';
    }

    /**
     * Seven pairs. Four of a kind counts as two pairs of it — that is the
     * hand the fan table calls 豪华七对子. Flies pair with whatever is odd.
     */
    function sevenPairs(cnt, exposed, wilds, keys) {
        if (exposed) return null;
        let tiles = 0, pairs = 0, singles = 0, quad = false;
        const pairKeys = [];
        for (const k of keys) {
            const c = at(cnt, k);
            if (!c) continue;
            tiles += c;
            pairs += Math.floor(c / 2);
            for (let i = 0; i < Math.floor(c / 2); i++) pairKeys.push(k);
            if (c % 2) { singles++; pairKeys.push(k); }
            if (c === 4) quad = true;
        }
        if (tiles + wilds !== 14) return null;

        let left = wilds;
        let made = pairs;
        const withSingles = Math.min(left, singles);
        made += withSingles;
        left -= withSingles;
        if (left % 2) return null;
        made += left / 2;
        if (made !== 7) return null;
        const spare = spareKey(cnt, keys);
        for (let i = 0; i < left / 2; i++) pairKeys.push(spare);
        return { shape: 'sevenPairs', quad, pairs: pairKeys };
    }

    /** The thirteen orphans, one of them twice. */
    function thirteenOrphans(cnt, exposed, wilds, keys) {
        if (exposed) return null;
        // Every one of the thirteen has to exist in this set, or the hand
        // cannot be made however many flies are held.
        if (!MJ.ORPHAN_KEYS.every((k) => inPool(keys, k))) return null;

        let tiles = 0, kinds = 0, pair = null;
        for (const k of keys) {
            const c = at(cnt, k);
            if (!c) continue;
            if (!MJ.ORPHAN_KEYS.includes(k)) return null;
            tiles += c;
            kinds++;
            if (c === 2) { if (pair) return null; pair = k; }
            else if (c !== 1) return null;
        }
        if (tiles + wilds !== 14) return null;
        const missing = 13 - kinds;
        if (missing > wilds) return null;
        const left = wilds - missing;
        if (pair && left !== 0) return null;
        if (!pair && left !== 1) return null;
        return { shape: 'thirteenOrphans', pair: pair || MJ.ORPHAN_KEYS[0] };
    }

    /**
     * Is this a winning hand?
     * @param {Map} cnt      playing tiles held, by key
     * @param {number} exposed melds already on the table
     * @param {number} [wilds] flies in hand
     * @param {string[]} [pool] the keys this set contains
     */
    function isWin(cnt, exposed, wilds, pool) {
        const w = wilds || 0;
        const keys = poolOf(pool);
        return thirteenOrphans(cnt, exposed, w, keys)
            || sevenPairs(cnt, exposed, w, keys)
            || standard(cnt, exposed, w, keys);
    }

    /** Which tiles would complete this hand, as keys. */
    function waits(cnt, exposed, wilds, pool) {
        const keys = poolOf(pool);
        const out = [];
        for (const k of keys) {
            if (at(cnt, k) >= 4) continue;
            add(cnt, k, 1);
            if (isWin(cnt, exposed, wilds, pool)) out.push(k);
            add(cnt, k, -1);
        }
        return out;
    }

    /* ---- how far off ------------------------------------------------------ */

    /** Best (sets, partials, pair) split of what is left, by search. */
    function blocks(cnt, keys) {
        let best = { sets: -1, partials: 0, pair: false };
        const score = (s, p, h) => s * 10 + p * 2 + (h ? 1 : 0);

        const walk = (from, sets, partials, pair) => {
            let i = from;
            while (i < keys.length && at(cnt, keys[i]) === 0) i++;
            if (i >= keys.length || sets + partials >= 5) {
                if (score(sets, partials, pair) > score(best.sets, best.partials, best.pair)) {
                    best = { sets, partials, pair };
                }
                return;
            }
            const k = keys[i];
            const suit = k[0], n = Number(k.slice(1));
            const k1 = suit + (n + 1), k2 = suit + (n + 2);
            const runnable = suit !== 'z' && inPool(keys, k1);

            if (at(cnt, k) >= 3) {
                add(cnt, k, -3); walk(i, sets + 1, partials, pair); add(cnt, k, 3);
            }
            if (runnable && inPool(keys, k2) && at(cnt, k1) > 0 && at(cnt, k2) > 0) {
                add(cnt, k, -1); add(cnt, k1, -1); add(cnt, k2, -1);
                walk(i, sets + 1, partials, pair);
                add(cnt, k, 1); add(cnt, k1, 1); add(cnt, k2, 1);
            }
            if (at(cnt, k) >= 2) {
                if (!pair) { add(cnt, k, -2); walk(i, sets, partials, true); add(cnt, k, 2); }
                add(cnt, k, -2); walk(i, sets, partials + 1, pair); add(cnt, k, 2);
            }
            if (runnable && at(cnt, k1) > 0) {
                add(cnt, k, -1); add(cnt, k1, -1); walk(i, sets, partials + 1, pair);
                add(cnt, k, 1); add(cnt, k1, 1);
            }
            if (runnable && inPool(keys, k2) && at(cnt, k2) > 0) {
                add(cnt, k, -1); add(cnt, k2, -1); walk(i, sets, partials + 1, pair);
                add(cnt, k, 1); add(cnt, k2, 1);
            }
            add(cnt, k, -1); walk(i, sets, partials, pair); add(cnt, k, 1);
        };
        walk(0, 0, 0, false);
        return best;
    }

    function pairShanten(cnt, keys) {
        let pairs = 0, kinds = 0;
        for (const k of keys) {
            const c = at(cnt, k);
            if (!c) continue;
            kinds++;
            if (c >= 2) pairs++;
        }
        return 6 - pairs + Math.max(0, 7 - kinds);
    }

    function orphanShanten(cnt, keys) {
        if (!MJ.ORPHAN_KEYS.every((k) => inPool(keys, k))) return 99;
        let kinds = 0, pair = false;
        for (const k of MJ.ORPHAN_KEYS) {
            const c = at(cnt, k);
            if (c > 0) kinds++;
            if (c >= 2) pair = true;
        }
        return 13 - kinds - (pair ? 1 : 0);
    }

    /**
     * Tiles still needed. -1 is won, 0 is ready, and above that it is the
     * block count — good enough to choose between two discards, which is all
     * it is asked to do. Every fly in hand is a tile already found.
     */
    function shanten(cnt, exposed, wilds, pool) {
        const w = wilds || 0;
        const keys = poolOf(pool);
        if (isWin(cnt, exposed, w, pool)) return -1;

        const b = blocks(cnt, keys);
        const sets = b.sets + exposed;
        const partials = Math.min(b.partials, Math.max(0, 4 - sets));
        let st = 8 - 2 * sets - partials - (b.pair ? 1 : 0);
        if (!exposed) st = Math.min(st, pairShanten(cnt, keys), orphanShanten(cnt, keys));
        st = Math.max(1, st - w);

        // Only a hand the count thinks is close is worth asking exactly, and
        // "ready" is a question worth asking exactly.
        if (st <= 1 && waits(cnt, exposed, w, pool).length) return 0;
        return st;
    }

    CV.MJWin = {
        ALL_KEYS, isWin, waits, shanten, standard, sevenPairs, thirteenOrphans, blocks, spareKey,
    };
})();
