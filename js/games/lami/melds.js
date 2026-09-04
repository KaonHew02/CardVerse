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
        jokers: 2,        // how many jokers
        hand: 14,         // tiles dealt to each player
        minRun: 3,        // shortest run
        minSet: 3,        // shortest set
        maxSet: 4,        // a set cannot outgrow the four suits
        wrap: false,      // may a run pass K and come back to 1
        jokerPoints: 30,  // what a joker left in hand costs
        openWith: 0,      // points needed for a first meld; 0 turns it off
    };

    const SUITS = ['C', 'D', 'H', 'S'];
    const SUIT_SYMBOL = { C: '♣', D: '♦', H: '♥', S: '♠' };
    const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K' };

    const TOP = 13;

    const isJoker = (tile) => !!tile.joker;
    const rankLabel = (r) => RANK_LABEL[r] || String(r);
    const name = (tile) => (isJoker(tile) ? '🃏' : rankLabel(tile.r) + SUIT_SYMBOL[tile.s]);

    /** Face value, and a joker costs whatever the table says it costs. */
    const points = (tile) => (isJoker(tile) ? RULES.jokerPoints : tile.r);

    /** The whole box: `copies` of every tile, plus the jokers. */
    function build(opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        const out = [];
        for (let c = 0; c < cfg.copies; c++) {
            for (const s of SUITS) {
                for (let r = 1; r <= TOP; r++) out.push({ r, s, id: `${s}${r}-${c}` });
            }
        }
        for (let j = 0; j < cfg.jokers; j++) out.push({ joker: true, id: 'J' + j });
        return out;
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
     * that contain every real tile, and that window has to fit between 1 and
     * 13 — which is what stops `♠Q ♠K 🃏` from running off the end.
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
        if (!cfg.wrap && outside > (lo - 1) + (TOP - hi)) return null;
        if (n > TOP) return null;
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
        for (let r = 1; r <= TOP; r++) {
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

    /** Could `tiles` be added to `existing` and still be a meld? */
    function extends_(existing, tiles, opts) {
        return meld(existing.concat(tiles), opts);
    }

    window.CV = window.CV || {};
    window.CV.Lami = {
        RULES, SUITS, SUIT_SYMBOL, TOP,
        isJoker, rankLabel, name, points, handPoints,
        build, sort, meld, asRun, asSet, findMelds, extend: extends_,
    };
})();
