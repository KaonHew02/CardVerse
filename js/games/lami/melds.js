/**
 * CardVerse — Lami tiles, and what makes a meld.
 *
 * Rummy played with mahjong-style tiles: four suits, 1 to 13, and jokers.
 * Nothing traditional about mahjong applies — no chow, no pung, no 番 — and
 * none of that code is reachable from here.
 *
 * Two shapes, and only two:
 *
 *     run   same suit, consecutive, three or more   ♣3 ♣4 ♣5
 *     set   same number, different suits            ♣7 ♦7 ♥7
 *
 * A joker stands in for whatever the meld is missing. It is never free: the
 * meld it completes has to be a real one, so `♥8 ♥9 🃏` is a run to the ten
 * and `♣5 ♦5 🃏` is a set of fives, but three jokers together are nothing.
 *
 * **The rules leave a lot open, so everything open is one named constant.**
 * `RULES` below holds every one of them — the minimum length of a meld,
 * whether a run may wrap past the king, what a tile is worth when it is left
 * in your hand. They are set to the ordinary rummy answers and marked, so
 * changing one is an edit rather than a rewrite.
 */

(() => {
    'use strict';

    /**
     * Every open question from the rules, in one place.
     *
     * These are defaults, not decisions. Each is what the game is normally
     * played with; none of them came from the rules as written.
     */
    const RULES = {
        copies: 2,        // how many of each tile in the box
        jokers: 12,       // how many jokers
        hand: 20,         // tiles dealt to each player
        minRun: 3,        // shortest run
        minSet: 3,        // shortest set
        maxSet: 4,        // a set cannot outgrow the four suits
        wrap: false,      // may a run pass A and come back to 2
        jokerPoints: 15,  // what a joker left in hand costs — an ace's worth
        openWith: 0,      // points needed for a first meld; 0 turns it off
        // What the hand pays, in order of finish behind the winner: the seat
        // closest to them is 小哥 and pays the first of these, and the seat
        // holding the most is 大哥 and pays the last.
        rankRatio: [1, 2, 3],   // 小哥 : 二哥 : 大哥
        outRatio: 5,            // going out — everybody pays this, flat
        heavenRatio: 10,        // 天胡 — twenty tiles dealt in melds
        pieceRatio: 0.5,        // stakes per piece of difference, head to head
        partitionBudget: 20000, // how hard to look for a 天胡 before giving up
    };

    const SUITS = ['C', 'D', 'H', 'S'];
    const SUIT_SYMBOL = { C: '♣', D: '♦', H: '♥', S: '♠' };
    const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

    /**
     * **The ace is high, and there is no 1.**
     *
     * The house table scores an ace at 15 against a king's 10, which only
     * makes sense at the top of the ladder — and it settles a side count of
     * its own (see `pieces`), which a rank that also doubled as the bottom of
     * every run would make a mess of. So the box runs 2 to A, thirteen ranks,
     * and Q-K-A is a run while A-2-3 is not.
     */
    const LOW = 2;
    const TOP = 14;
    const RANKS = TOP - LOW + 1;

    const isJoker = (tile) => !!tile.joker;
    const isAce = (tile) => !isJoker(tile) && tile.r === TOP;
    const rankLabel = (r) => RANK_LABEL[r] || String(r);
    const name = (tile) => (isJoker(tile) ? '🃏' : rankLabel(tile.r) + SUIT_SYMBOL[tile.s]);

    /**
     * What a tile left in your hand costs you.
     *
     * Face value up to the ten, ten for each of the court cards, fifteen for
     * an ace — and the same fifteen for a joker, which is the one number the
     * rules did not name. A joker is the most useful tile in the box, so
     * being caught with one should not be cheap.
     */
    function points(tile) {
        if (isJoker(tile)) return RULES.jokerPoints;
        if (tile.r === TOP) return 15;              // A
        if (tile.r >= 11) return 10;                // J Q K
        return tile.r;
    }

    /** The whole box: `copies` of every tile, plus the jokers. */
    function build(opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        const out = [];
        for (let c = 0; c < cfg.copies; c++) {
            for (const s of SUITS) {
                for (let r = LOW; r <= TOP; r++) out.push({ r, s, id: `${s}${r}-${c}` });
            }
        }
        for (let j = 0; j < cfg.jokers; j++) out.push({ joker: true, id: 'J' + j });
        return out;
    }

    /**
     * **The side count: jokers and aces, in pieces.**
     *
     * Settled apart from the hand and apart from the ranking, head to head
     * with every other player — whoever is holding more collects the
     * difference from whoever is holding fewer, at half a stake a piece. It
     * is its own little game running underneath the round, and it is why an
     * ace is worth hanging on to even when the points say throw it.
     *
     *     a joker or an ace          1 piece each
     *     both copies of one ace     1 piece on top, per pair
     *     all four suits of the ace  4 pieces on top
     *
     * The two bonuses stack: a hand holding all eight aces is 8 for the
     * tiles, 4 for the four pairs and 8 for the two four-of-a-kinds.
     */
    function pieces(tiles) {
        let n = 0;
        const bySuit = new Map();
        for (const x of tiles) {
            if (isJoker(x)) { n++; continue; }
            if (!isAce(x)) continue;
            n++;
            bySuit.set(x.s, (bySuit.get(x.s) || 0) + 1);
        }
        // Both copies of the same ace, once per pair.
        for (const [, count] of bySuit) n += Math.floor(count / 2);
        // Four of a kind — one ace of every suit, as many times over as the
        // thinnest suit allows.
        if (bySuit.size === SUITS.length) n += 4 * Math.min(...bySuit.values());
        return n;
    }

    /** Suit order, then rank — the way a rack is arranged before you look at it. */
    const ORDER = { C: 0, D: 1, H: 2, S: 3 };
    const sort = (tiles) => tiles.slice().sort((a, b) => {
        if (isJoker(a) !== isJoker(b)) return isJoker(a) ? 1 : -1;
        if (isJoker(a)) return 0;
        return ORDER[a.s] - ORDER[b.s] || a.r - b.r;
    });

    /* ---- what is a meld ---------------------------------------------------- */

    /**
     * A run: one suit, consecutive, jokers filling the holes.
     *
     * The test is a window. `n` tiles have to sit in `n` consecutive ranks
     * that contain every real tile, and that window has to fit between the
     * two and the ace — which is what stops `♠K ♠A 🃏` running off the end.
     */
    function asRun(tiles, cfg) {
        const real = tiles.filter((x) => !isJoker(x));
        const jokers = tiles.length - real.length;
        if (!real.length || tiles.length < cfg.minRun) return null;

        const suit = real[0].s;
        if (!real.every((x) => x.s === suit)) return null;
        const ranks = real.map((x) => x.r).sort((a, b) => a - b);
        for (let i = 1; i < ranks.length; i++) if (ranks[i] === ranks[i - 1]) return null;

        const lo = ranks[0], hi = ranks[ranks.length - 1];
        const span = hi - lo + 1;
        const n = tiles.length;
        if (span > n) return null;
        const outside = n - span;
        // Room to place the leftover jokers on one end or the other.
        if (!cfg.wrap && outside > (lo - LOW) + (TOP - hi)) return null;
        if (n > RANKS) return null;
        return { type: 'run', suit, lo, hi, size: n, jokers };
    }

    /** A set: one number, four suits at most, no suit twice. */
    function asSet(tiles, cfg) {
        const real = tiles.filter((x) => !isJoker(x));
        const jokers = tiles.length - real.length;
        if (!real.length || tiles.length < cfg.minSet || tiles.length > cfg.maxSet) return null;

        const rank = real[0].r;
        if (!real.every((x) => x.r === rank)) return null;
        if (new Set(real.map((x) => x.s)).size !== real.length) return null;
        if (jokers > cfg.maxSet - real.length) return null;
        return { type: 'set', rank, size: tiles.length, jokers };
    }

    /** What these tiles are, or null. A run is tried first; both are checked. */
    function meld(tiles, opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        if (!Array.isArray(tiles) || tiles.length < Math.min(cfg.minRun, cfg.minSet)) return null;
        return asRun(tiles, cfg) || asSet(tiles, cfg);
    }

    /** Points left in a hand, which is what a round is scored on. */
    const handPoints = (tiles) => tiles.reduce((n, x) => n + points(x), 0);

    /* ---- finding melds ------------------------------------------------------ */

    /**
     * Every meld worth playing out of `tiles`, longest first.
     *
     * Not every subset — that is 2^14 — but every run inside each suit and
     * every set of each rank, which is where melds actually live. Jokers are
     * offered to a meld only when it cannot be made without them, so they
     * are not spent on a hand that did not need them.
     */
    function findMelds(tiles, opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        const jokers = tiles.filter(isJoker);
        const real = tiles.filter((x) => !isJoker(x));
        const out = [];

        // Runs: walk each suit, and try every window that has enough tiles.
        for (const suit of SUITS) {
            const bySuit = real.filter((x) => x.s === suit).sort((a, b) => a.r - b.r);
            for (let i = 0; i < bySuit.length; i++) {
                const picked = [bySuit[i]];
                for (let j = i + 1; j < bySuit.length; j++) {
                    if (bySuit[j].r === picked[picked.length - 1].r) continue;   // a duplicate copy
                    picked.push(bySuit[j]);
                    for (let w = 0; w <= jokers.length; w++) {
                        const cards = picked.concat(jokers.slice(0, w));
                        if (meld(cards, cfg)) { out.push(cards.slice()); break; }
                    }
                }
            }
        }

        // Sets: one rank at a time, one tile per suit.
        for (let r = LOW; r <= TOP; r++) {
            const bySuit = new Map();
            for (const x of real) if (x.r === r && !bySuit.has(x.s)) bySuit.set(x.s, x);
            const picked = [...bySuit.values()];
            for (let take = cfg.minSet; take <= Math.min(cfg.maxSet, picked.length + jokers.length); take++) {
                const useReal = Math.min(picked.length, take);
                const cards = picked.slice(0, useReal).concat(jokers.slice(0, take - useReal));
                if (cards.length === take && meld(cards, cfg)) out.push(cards);
            }
        }

        return out.sort((a, b) => b.length - a.length
            || a.filter(isJoker).length - b.filter(isJoker).length);
    }

    /**
     * **Do these tiles lie entirely in melds, with nothing left over?**
     *
     * This is the 天胡 test, and it is a set-cover: twenty tiles have to be
     * cut into runs and sets with no remainder. Backtracking over the melds
     * `findMelds` can see, always placing the lowest tile still uncovered —
     * every partition has to account for that tile somehow, so branching on
     * it and nothing else is complete without being exhaustive.
     *
     * `budget` caps the search. A hand that cannot be shown to partition
     * within it is reported as not partitioning, which is the safe way to be
     * wrong: the worst case is a 天胡 that pays as an ordinary hand, never a
     * hand that pays ten times over because a search ran long.
     *
     * @returns {Array[]|null} the melds, or null
     */
    function partition(tiles, opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        let budget = cfg.partitionBudget || 20000;

        const walk = (left) => {
            if (!left.length) return [];
            if (budget-- <= 0) return null;
            // The first tile has to be covered by something, so only melds
            // containing it are worth trying.
            const first = left[0];
            for (const cards of findMelds(left, cfg)) {
                if (!cards.includes(first)) continue;
                const ids = new Set(cards.map((x) => x.id));
                const rest = walk(left.filter((x) => !ids.has(x.id)));
                if (rest) return [cards].concat(rest);
                if (budget <= 0) return null;
            }
            return null;
        };
        return walk(sort(tiles));
    }

    /** Could `tiles` be added to `existing` and still be a meld? */
    function extends_(existing, tiles, opts) {
        return meld(existing.concat(tiles), opts);
    }

    window.CV = window.CV || {};
    window.CV.Lami = {
        RULES, SUITS, SUIT_SYMBOL, LOW, TOP, RANKS,
        isJoker, isAce, rankLabel, name, points, handPoints, pieces,
        build, sort, meld, asRun, asSet, findMelds, partition, extend: extends_,
    };
})();
