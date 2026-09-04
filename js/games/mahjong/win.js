/**
 * CardVerse — is this hand won, and if not, how far off is it.
 *
 * Three winning shapes:
 *
 *     standard          four melds and a pair
 *     七对子             seven pairs
 *     十三幺             the thirteen terminals and honours, one of them twice
 *
 * `isWin` is exact: it decomposes the concealed tiles into melds by search,
 * counting whatever has already been melded on the table towards the four.
 * `waits` is exact too, and is just `isWin` asked once for every tile that
 * could be drawn.
 *
 * `shanten` — how many tiles away from ready — is exact where it matters and
 * a heuristic beyond it. A won hand is -1 and a ready hand is 0 because both
 * are answered by `isWin` and `waits` rather than by a formula; deeper hands
 * get a block count, which is only ever used to order one discard against
 * another.
 *
 * Everything here works on counts, not on tile objects, so it never has to
 * care which copy of 3萬 is which.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const MJ = CV.MJ;

    /** Every tile key there is, in decomposition order. */
    const ALL_KEYS = (() => {
        const out = [];
        for (const suit of ['m', 's', 'p']) for (let n = 1; n <= 9; n++) out.push(suit + n);
        for (let n = 1; n <= 7; n++) out.push('z' + n);
        return out;
    })();

    const at = (cnt, k) => cnt.get(k) || 0;
    const add = (cnt, k, d) => cnt.set(k, at(cnt, k) + d);

    function firstKey(cnt) {
        for (const k of ALL_KEYS) if (at(cnt, k) > 0) return k;
        return null;
    }

    /**
     * Pull `need` melds out of `cnt`, leaving nothing behind. Returns the
     * melds or null. Working from the lowest tile up makes the search
     * complete without needing to try every order: whatever the lowest tile
     * is, it is either in a pung or in a chow that starts on it.
     */
    function meldsFrom(cnt, need, acc) {
        if (need === 0) return firstKey(cnt) === null ? acc : null;
        const k = firstKey(cnt);
        if (!k) return null;
        const suit = k[0], n = Number(k.slice(1));

        if (at(cnt, k) >= 3) {
            add(cnt, k, -3);
            const got = meldsFrom(cnt, need - 1, acc.concat([{ type: 'pung', key: k }]));
            add(cnt, k, 3);
            if (got) return got;
        }
        if (suit !== 'z' && n <= 7) {
            const k1 = suit + (n + 1), k2 = suit + (n + 2);
            if (at(cnt, k1) > 0 && at(cnt, k2) > 0) {
                add(cnt, k, -1); add(cnt, k1, -1); add(cnt, k2, -1);
                const got = meldsFrom(cnt, need - 1, acc.concat([{ type: 'chow', key: k }]));
                add(cnt, k, 1); add(cnt, k1, 1); add(cnt, k2, 1);
                if (got) return got;
            }
        }
        return null;
    }

    /** Four melds and a pair, counting melds already on the table. */
    function standard(cnt, exposed) {
        for (const k of ALL_KEYS) {
            if (at(cnt, k) < 2) continue;
            add(cnt, k, -2);
            const melds = meldsFrom(cnt, 4 - exposed, []);
            add(cnt, k, 2);
            if (melds) return { shape: 'standard', melds, pair: k };
        }
        return null;
    }

    /**
     * Seven pairs. Four of a kind counts as two pairs of it — that is the
     * hand the fan table calls 豪华七对子, so it has to be allowed here.
     */
    function sevenPairs(cnt, exposed) {
        if (exposed) return null;                    // nothing may have been melded
        let pairs = 0, tiles = 0, quad = false;
        for (const k of ALL_KEYS) {
            const c = at(cnt, k);
            if (!c) continue;
            tiles += c;
            if (c % 2) return null;
            pairs += c / 2;
            if (c === 4) quad = true;
        }
        if (tiles !== 14 || pairs !== 7) return null;
        return { shape: 'sevenPairs', quad };
    }

    /** The thirteen orphans, one of them twice. */
    function thirteenOrphans(cnt, exposed) {
        if (exposed) return null;
        let tiles = 0, pair = null;
        for (const k of ALL_KEYS) {
            const c = at(cnt, k);
            if (!c) continue;
            if (!MJ.ORPHAN_KEYS.includes(k)) return null;
            tiles += c;
            if (c === 2) { if (pair) return null; pair = k; }
            else if (c !== 1) return null;
        }
        if (tiles !== 14 || !pair) return null;
        if (!MJ.ORPHAN_KEYS.every((k) => at(cnt, k) > 0)) return null;
        return { shape: 'thirteenOrphans', pair };
    }

    /**
     * Is this a winning hand? `cnt` is the concealed tiles including the
     * winning one; `exposed` is how many melds are already on the table.
     */
    function isWin(cnt, exposed) {
        return thirteenOrphans(cnt, exposed) || sevenPairs(cnt, exposed) || standard(cnt, exposed);
    }

    /** Which tiles would complete this hand, as keys. */
    function waits(cnt, exposed, pool) {
        const out = [];
        for (const k of (pool || ALL_KEYS)) {
            if (at(cnt, k) >= 4) continue;
            add(cnt, k, 1);
            if (isWin(cnt, exposed)) out.push(k);
            add(cnt, k, -1);
        }
        return out;
    }

    /* ---- how far off ------------------------------------------------------ */

    /** Best (sets, partials, pair) split of what is left, by search. */
    function blocks(cnt) {
        let best = { sets: -1, partials: 0, pair: false };
        const score = (s, p, h) => s * 10 + p * 2 + (h ? 1 : 0);

        const walk = (from, sets, partials, pair) => {
            let i = from;
            while (i < ALL_KEYS.length && at(cnt, ALL_KEYS[i]) === 0) i++;
            if (i >= ALL_KEYS.length || sets + partials >= 5) {
                if (score(sets, partials, pair) > score(best.sets, best.partials, best.pair)) {
                    best = { sets, partials, pair };
                }
                return;
            }
            const k = ALL_KEYS[i];
            const suit = k[0], n = Number(k.slice(1));
            const k1 = suit + (n + 1), k2 = suit + (n + 2);

            if (at(cnt, k) >= 3) {
                add(cnt, k, -3); walk(i, sets + 1, partials, pair); add(cnt, k, 3);
            }
            if (suit !== 'z' && n <= 7 && at(cnt, k1) > 0 && at(cnt, k2) > 0) {
                add(cnt, k, -1); add(cnt, k1, -1); add(cnt, k2, -1);
                walk(i, sets + 1, partials, pair);
                add(cnt, k, 1); add(cnt, k1, 1); add(cnt, k2, 1);
            }
            if (at(cnt, k) >= 2) {
                if (!pair) { add(cnt, k, -2); walk(i, sets, partials, true); add(cnt, k, 2); }
                add(cnt, k, -2); walk(i, sets, partials + 1, pair); add(cnt, k, 2);
            }
            if (suit !== 'z' && n <= 8 && at(cnt, k1) > 0) {
                add(cnt, k, -1); add(cnt, k1, -1); walk(i, sets, partials + 1, pair);
                add(cnt, k, 1); add(cnt, k1, 1);
            }
            if (suit !== 'z' && n <= 7 && at(cnt, k2) > 0) {
                add(cnt, k, -1); add(cnt, k2, -1); walk(i, sets, partials + 1, pair);
                add(cnt, k, 1); add(cnt, k2, 1);
            }
            add(cnt, k, -1); walk(i, sets, partials, pair); add(cnt, k, 1);
        };
        walk(0, 0, 0, false);
        return best;
    }

    function pairShanten(cnt) {
        let pairs = 0, kinds = 0;
        for (const k of ALL_KEYS) {
            const c = at(cnt, k);
            if (!c) continue;
            kinds++;
            if (c >= 2) pairs++;
        }
        return 6 - pairs + Math.max(0, 7 - kinds);
    }

    function orphanShanten(cnt) {
        let kinds = 0, pair = false;
        for (const k of MJ.ORPHAN_KEYS) {
            const c = at(cnt, k);
            if (c > 0) kinds++;
            if (c >= 2) pair = true;
        }
        return 13 - kinds - (pair ? 1 : 0);
    }

    /**
     * Tiles still needed. -1 is won, 0 is ready, and anything above that is
     * the block count — good enough to choose between two discards, which is
     * all it is asked to do.
     */
    function shanten(cnt, exposed, pool) {
        if (isWin(cnt, exposed)) return -1;

        const b = blocks(cnt);
        const sets = b.sets + exposed;
        const partials = Math.min(b.partials, Math.max(0, 4 - sets));
        let st = 8 - 2 * sets - partials - (b.pair ? 1 : 0);
        if (!exposed) st = Math.min(st, pairShanten(cnt), orphanShanten(cnt));
        st = Math.max(1, st);

        // Only a hand the count thinks is close is worth asking exactly, and
        // "ready" is a question worth asking exactly.
        if (st <= 1 && waits(cnt, exposed, pool).length) return 0;
        return st;
    }

    CV.MJWin = { ALL_KEYS, isWin, waits, shanten, standard, sevenPairs, thirteenOrphans, blocks };
})();
