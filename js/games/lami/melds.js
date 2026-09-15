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
        jokers: 8,        // how many jokers — 104 numbered tiles + 8 = the 112-tile box
        hand: 20,         // tiles dealt to each player
        minRun: 3,        // shortest run
        minSet: 3,        // shortest set
        maxSet: 0,        // how big a set may get; 0 is no limit — the box
                          // holds two of every tile, so eight of a number
                          // is real, and the table does not cap it
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
    /**
     * Where one tile sits against another in a sorted rack. Exported because
     * a rack you have arranged yourself still has to put a *new* tile
     * somewhere, and "where it would have sorted" is the only answer that
     * does not disturb the arrangement.
     */
    const cmp = (a, b) => {
        if (isJoker(a) !== isJoker(b)) return isJoker(a) ? 1 : -1;
        if (isJoker(a)) return 0;
        return ORDER[a.s] - ORDER[b.s] || a.r - b.r;
    };
    const sort = (tiles) => tiles.slice().sort(cmp);

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

    /**
     * **A set: one number, and the suits do not matter.**
     *
     * A set used to want one of each suit — no suit twice — which is the
     * ordinary rummy rule and the wrong one for this table. The box holds
     * *two of every card*, so a rack with three of a number in it usually
     * has two of them in the same suit, and the hand that looks exactly like
     * a set was being refused with no way to see why: ♦2 ♥2 ♠2 sitting on
     * the table and a ♠2 in your hand that cannot join it.
     *
     * Same number is the whole test now — and there is **no ceiling**. A
     * set used to stop at four, one per suit, and a K♠ in hand was refused
     * by K♣ K♣ K♦ K♥ on the table with nothing to say but "full". The box
     * holds two of every tile, so eight of a number is a real thing to
     * hold, and a set takes as many as anyone has. `maxSet` is kept as a
     * rule for a table that wants the cap back; 0 is off.
     */
    function asSet(tiles, cfg) {
        const real = tiles.filter((x) => !isJoker(x));
        const jokers = tiles.length - real.length;
        if (!real.length || tiles.length < cfg.minSet) return null;
        if (cfg.maxSet && tiles.length > cfg.maxSet) return null;

        const rank = real[0].r;
        if (!real.every((x) => x.r === rank)) return null;
        if (cfg.maxSet && jokers > cfg.maxSet - real.length) return null;
        return { type: 'set', rank, size: tiles.length, jokers };
    }

    /**
     * **A meld, in the order it should be looked at.**
     *
     * `sort` arranges a *rack* — suit, then rank, jokers pushed to the end —
     * and a meld on the table was being laid out the same way. That is wrong
     * for a run: `♦2 ♦4 ♦5 🃏` went down exactly like that, with the joker
     * parked on the end, and the tile it was standing in for was the 3 in the
     * hole two places to its left. Every player at the table then has to work
     * out what the joker is, on a meld whose whole job is to say so — and the
     * next person wanting to extend it cannot see which end is open.
     *
     * So a run is laid out **by rank, with each joker in the slot it fills**.
     * Spare jokers — the ones not plugging a hole — hang off the top, because
     * that is the end a run usually grows from; a run already touching the
     * ace can only take them at the bottom, and does.
     *
     * A set has no order to get wrong: one rank, one tile per suit. It keeps
     * `sort`'s arrangement, jokers last.
     */
    function layout(tiles, opts, at) {
        const cfg = Object.assign({}, RULES, opts || {});
        const run = asRun(tiles, cfg);
        if (!run) return sort(tiles);

        const real = tiles.filter((x) => !isJoker(x)).sort((a, b) => a.r - b.r);
        const jokers = tiles.filter(isJoker);
        const n = tiles.length;
        // Where the run starts. The player may have said — `♥J ♥Q 🃏` is
        // 10-J-Q or J-Q-K and only they know which — and otherwise the spare
        // jokers ride on top, which is the end a run usually grows from.
        const windows = runWindows(tiles, cfg);
        const lo = windows.includes(at) ? at : windows[windows.length - 1];
        if (lo === undefined) return sort(tiles);

        const out = [];
        let j = 0;
        for (let r = lo; r < lo + n; r++) {
            const idx = real.findIndex((x) => x.r === r);
            if (idx >= 0) out.push(real[idx]);
            else if (j < jokers.length) out.push(jokers[j++]);
            else return sort(tiles);          // cannot happen; never lose a tile
        }
        return out.length === n ? out : sort(tiles);
    }

    /**
     * **Every rank a joker in this run could be standing for.**
     *
     * Returned as the ranks the run could *start* on, lowest first. A run of
     * `n` tiles has to cover every real tile it holds, so its bottom sits
     * somewhere between "as high as the top tile allows" and "as low as the
     * bottom tile allows", clipped to the 2 and the ace at either end.
     *
     * One entry means the joker has only one thing it can be and there is
     * nothing to ask. More than one and the choice is the player's: `♥J ♥Q
     * 🃏` is 10-J-Q or J-Q-K, the meld is worth the same either way, and
     * which one it is decides what can be added to it later and what the
     * rest of the table is reading. The screen used to pick for them.
     *
     * Empty for anything that is not a run — a joker in a set has no
     * position, only a missing suit, and a set takes any suit it is short.
     */
    function runWindows(tiles, opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        const run = asRun(tiles, cfg);
        if (!run) return [];
        const n = run.size;
        const from = Math.max(LOW, run.hi - n + 1);
        const to = Math.min(run.lo, TOP - n + 1);
        const out = [];
        for (let lo = from; lo <= to; lo++) out.push(lo);
        return out;
    }

    /** What these tiles are, or null. A run is tried first; both are checked. */
    function meld(tiles, opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        if (!Array.isArray(tiles) || tiles.length < Math.min(cfg.minRun, cfg.minSet)) return null;
        return asRun(tiles, cfg) || asSet(tiles, cfg);
    }

    /**
     * **Is there a run in this rack?** — the question the opening turn
     * turns on.
     *
     * Your first lay has to be a run, and it is not optional: a seat holding
     * one has to put it down rather than folding or buying the turn with a
     * joker. So the engine has to be able to answer "could you have opened?"
     * before it will let a seat do anything else.
     *
     * It answers with **the same search the AI plays from**, deliberately.
     * If the engine believed a run was there and the AI could not find it,
     * the AI would offer 不要了, have it refused, and the table would stop
     * with nobody able to move. One search, one answer.
     */
    function canOpen(tiles, opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        return findMelds(tiles, cfg).some((cards) => (meld(cards, cfg) || {}).type === 'run');
    }

    /** Points left in a hand, which is what a round is scored on. */
    const handPoints = (tiles) => tiles.reduce((n, x) => n + points(x), 0);

    /* ---- finding melds ------------------------------------------------------ */

    /**
     * Every meld worth playing out of `tiles`, **thriftiest first**.
     *
     * Not every subset — that is 2^14 — but every run inside each suit and
     * every set of each rank, which is where melds actually live. Jokers are
     * offered to a meld only when it cannot be made without them, so they
     * are not spent on a hand that did not need them.
     *
     * Longest first was the old order, and it was a joker sink: a rack of
     * 8♣ J♣ A♣ and five jokers had "8 🃏 🃏 J 🃏 🃏 A" come up as its best
     * meld, every turn, with 8♣ 8♦ 8♠ sitting right there costing nothing.
     * A joker is the most useful tile in the box and the last one you want
     * to spend, so the order is now: fewest jokers, then most real tiles.
     * And a meld that is more joker than tile is not offered at all — it is
     * still legal to lay by hand, it is just never the suggestion.
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
                    for (let w = 0; w <= Math.min(jokers.length, picked.length); w++) {
                        const cards = picked.concat(jokers.slice(0, w));
                        if (meld(cards, cfg)) { out.push(cards.slice()); break; }
                    }
                }
            }
        }

        // Sets: one rank at a time, every copy of it — a set has no cap
        // and the suits do not matter, so both K♣ go in.
        for (let r = LOW; r <= TOP; r++) {
            const picked = real.filter((x) => x.r === r).sort((a, b) => ORDER[a.s] - ORDER[b.s]);
            const cap = cfg.maxSet || Infinity;
            for (let take = cfg.minSet; take <= Math.min(cap, picked.length + jokers.length); take++) {
                const useReal = Math.min(picked.length, take);
                if (take - useReal > useReal) break;      // more joker than tile
                const cards = picked.slice(0, useReal).concat(jokers.slice(0, take - useReal));
                if (cards.length === take && meld(cards, cfg)) out.push(cards);
            }
        }

        // Two copies of a tile make the same meld twice; show it once.
        const seen = new Set();
        const once = out.filter((cards) => {
            const key = cards.map(name).sort().join(' ');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const jokersIn = (cards) => cards.filter(isJoker).length;
        return once.sort((a, b) => jokersIn(a) - jokersIn(b)
            || (b.length - jokersIn(b)) - (a.length - jokersIn(a)));
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

    /**
     * **The rank a laid run starts on**, read off the tiles as they sit.
     *
     * `layout` puts a run down by rank with each joker in the slot it
     * fills, so the first real tile, less its position, is the bottom of
     * the run — whatever the run was told when it went down. Undefined for
     * a set, or for anything with no real tile in it.
     */
    function readingOf(tiles) {
        const i = tiles.findIndex((x) => !isJoker(x));
        return i < 0 ? undefined : tiles[i].r - i;
    }

    /**
     * Could `tiles` be added to `existing` and still be a meld?
     *
     * **A joker on the table stays what it is.** `2♠ 🃏 4♠ 5♠ 6♠ 7♠` has a
     * joker standing for the 3, and dropping a real 3♠ on it used to be
     * accepted — the meld still read as a run — with the joker then shoved
     * to the far end to become an 8. That is replacing a joker, which is
     * not adding to a meld, and it rewrites what somebody else laid. So a
     * run takes new tiles only *past its ends*: any real tile whose rank the
     * run already covers, joker or not, is refused. A set has no slots to
     * hold, and takes anything of its number.
     */
    function extends_(existing, tiles, opts) {
        const cfg = Object.assign({}, RULES, opts || {});
        const before = meld(existing, cfg);
        const after = meld(existing.concat(tiles), cfg);
        if (!after) return null;
        if (before && before.type === 'run' && after.type === 'run') {
            const lo = readingOf(existing);
            const hi = lo + existing.length - 1;
            // The new real tiles have to run straight on from an end —
            // 7 under an 8, or 7 6 under it — never into the run, and never
            // leaving a hole that a joker already on the table would have
            // to move over and fill. 6♦ under 8♦ 9♦ 10♦ 🃏 Q♦ K♦ 🃏 reads
            // as a run only by turning the top joker into a 7, and that is
            // the slide this is here to stop.
            const ranks = tiles.filter((x) => !isJoker(x)).map((x) => x.r);
            const below = ranks.filter((r) => r < lo).sort((a, b) => b - a);
            const above = ranks.filter((r) => r > hi).sort((a, b) => a - b);
            if (below.length + above.length !== ranks.length) return null;
            if (below.some((r, i) => r !== lo - 1 - i)) return null;
            if (above.some((r, i) => r !== hi + 1 + i)) return null;
            // New jokers hang off the top, or off the bottom once the top
            // is at the ace.
            const spare = tiles.length - ranks.length;
            let top = hi + above.length + spare;
            let bottom = lo - below.length;
            if (top > TOP) { bottom -= top - TOP; top = TOP; }
            if (bottom < LOW) return null;
            after.reading = bottom;      // where the run now starts
        }
        return after;
    }

    /* ---- what to play ------------------------------------------------------- */

    /**
     * **Every move worth making, in the order worth making them.**
     *
     * The scanner used to answer only "what melds are in this rack", and
     * both the AI and the on-screen suggestion took the first of those —
     * which had a rack holding 5♦ 6♦ lay a set of aces while 2♦ 3♦ 4♦ sat
     * on the table waiting for exactly those two tiles. Adding to what is
     * already down is the cheaper move: it spends fewer tiles of yours to
     * shed the same count, keeps your own melds intact for later, and
     * leaves the jokers alone.
     *
     * So the order is:
     *
     *     1. add to a meld on the table, no joker — most tiles first
     *     2. a new run, no joker
     *     3. a new set, no joker
     *     4. a new run that needs a joker — fewest jokers first
     *     5. a new set that needs a joker
     *     6. a joker onto a meld on the table
     *
     * A joker is the last thing to spend. Any move that does without one
     * ranks above every move that needs one, whatever it sheds — the AI
     * that lays 8 🃏 🃏 J 🃏 🃏 A on its first turn has nothing left for the
     * three turns after.
     *
     * Before a seat has opened only new runs are moves at all, so `opened`
     * false leaves just 2 and 4. Each entry is `{ tiles, at }` — `at` is the
     * table index to add to, or -1 for a new meld — which is exactly what
     * `extend` and `play` take.
     */
    function plan(rack, table, opts, opened) {
        const cfg = Object.assign({}, RULES, opts || {});
        const out = [];
        const jokersIn = (cards) => cards.filter(isJoker).length;
        const realIn = (cards) => cards.length - jokersIn(cards);
        const real = rack.filter((x) => !isJoker(x));
        const spare = rack.find(isJoker);

        // 1 and 6: onto the table. Gather everything of yours a meld would
        // take, and take it in one go — 5♦ and 6♦ both onto 2♦ 3♦ 4♦.
        const adds = [];
        const jokerAdds = [];
        if (opened) {
            (table || []).forEach((spot, at) => {
                const laid = spot.tiles || spot;
                const shape = meld(laid, cfg);
                if (!shape) return;
                let tiles = [];
                if (shape.type === 'set') {
                    tiles = real.filter((x) => x.r === shape.rank);
                } else {
                    const lo = readingOf(laid), hi = lo + laid.length - 1;
                    const inSuit = real.filter((x) => x.s === shape.suit);
                    const up = [], down = [];
                    for (let r = hi + 1; r <= TOP; r++) {
                        const x = inSuit.find((y) => y.r === r);
                        if (!x) break;
                        up.push(x);
                    }
                    for (let r = lo - 1; r >= LOW; r--) {
                        const x = inSuit.find((y) => y.r === r);
                        if (!x) break;
                        down.push(x);
                    }
                    tiles = up.concat(down);
                    if (tiles.length && !extends_(laid, tiles, cfg)) tiles = up.length ? up : down;
                }
                if (tiles.length && extends_(laid, tiles, cfg)) adds.push({ tiles, at });
                else for (const x of real) {
                    if (extends_(laid, [x], cfg)) { adds.push({ tiles: [x], at }); break; }
                }
                if (spare && extends_(laid, [spare], cfg)) jokerAdds.push({ tiles: [spare], at });
            });
        }
        adds.sort((a, b) => b.tiles.length - a.tiles.length);
        out.push(...adds);

        // 2 to 5: out of the rack. `findMelds` already runs fewest-jokers
        // first; this splits it by whether a joker is needed at all, and
        // puts runs before sets inside each half.
        const melds = findMelds(rack, cfg)
            .map((tiles) => ({ tiles, at: -1, shape: meld(tiles, cfg) }))
            .filter((m) => m.shape && (opened || m.shape.type === 'run'));
        const tier = (m) => (jokersIn(m.tiles) ? 2 : 0) + (m.shape.type === 'run' ? 0 : 1);
        melds.sort((a, b) => tier(a) - tier(b)
            || jokersIn(a.tiles) - jokersIn(b.tiles)
            || realIn(b.tiles) - realIn(a.tiles));
        out.push(...melds.map(({ tiles, at }) => ({ tiles, at })));

        out.push(...jokerAdds);
        return out;
    }

    window.CV = window.CV || {};
    window.CV.Lami = {
        RULES, SUITS, SUIT_SYMBOL, LOW, TOP, RANKS,
        isJoker, isAce, rankLabel, name, points, handPoints, pieces,
        build, sort, cmp, layout, runWindows, meld, asRun, asSet, findMelds, canOpen,
        partition, extend: extends_, readingOf, plan,
    };
})();
