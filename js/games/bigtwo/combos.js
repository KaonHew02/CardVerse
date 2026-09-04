/**
 * CardVerse — 锄大D combinations.
 *
 * `detect()` says what a set of cards is; `beats()` says whether one answers
 * another. Nothing else — no state, no RNG, no DOM — because the engine, the
 * opponents, the hint button and (later) the host's validation all have to
 * agree, and the only way to guarantee that is to have one copy of the rules.
 *
 * **Suits matter here, and they did not in 斗地主.** A card's strength is its
 * rank first and its suit second:
 *
 *     3 4 5 6 7 8 9 10 J Q K A 2        ♦ < ♣ < ♥ < ♠
 *
 * so 3♠ > 3♥ > 3♣ > 3♦, and 4♦ > 3♠ because rank is compared first. The 2 is
 * the top rank and can never appear in a straight.
 *
 * **Straights are the eight windows and no others**: 3-4-5-6-7 up to
 * 10-J-Q-K-A. No wrap. `J Q K A 2`, `A 2 3 4 5` and everything else that
 * crosses the top are not straights, which falls out of the 2 ranking above
 * the ace rather than being special-cased.
 *
 * Five-card hands rank Straight < Flush < Full House < Four+1 < Straight
 * Flush, and a five-card hand only ever answers another five-card hand — a
 * four-of-a-kind does not beat a pair here the way a bomb does elsewhere.
 */

(() => {
    'use strict';

    /** ♦ ♣ ♥ ♠ — the order the rules give, lowest first. */
    const SUIT_VALUE = { D: 1, C: 2, H: 3, S: 4 };

    /** The deck stores a deuce as 2; here it is the highest rank of all. */
    const rankValue = (card) => (card.r === 2 ? 15 : card.r);

    /** Rank first, suit second — the number two singles are compared by. */
    const cardValue = (card) => rankValue(card) * 10 + SUIT_VALUE[card.s];

    /** The top rank a straight may reach. The 2 sits above it, so it is out. */
    const RUN_TOP = 14;

    /** Five-card categories, weakest to strongest. */
    const CAT = { STRAIGHT: 1, FLUSH: 2, FULL_HOUSE: 3, FOUR: 4, STRAIGHT_FLUSH: 5 };

    const NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    const rankName = (v) => NAMES[v] || String(v);

    const byValue = (cards) => cards.slice().sort((a, b) => cardValue(a) - cardValue(b));

    /** Phase 3 of the rules: rank, then suit. */
    const sortHand = (cards) => byValue(cards);

    function counts(cards) {
        const m = new Map();
        for (const c of cards) {
            const r = rankValue(c);
            if (!m.has(r)) m.set(r, []);
            m.get(r).push(c);
        }
        return m;
    }

    const combo = (type, cat, key, size) => ({ type, cat, key, size });

    /** Consecutive ranks that stop at the ace. A 2 anywhere fails the top test. */
    function isRun(values) {
        if (values[values.length - 1] > RUN_TOP) return false;
        for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1] + 1) return false;
        return true;
    }

    /**
     * A flush is compared by its highest card, then the next, and so on. Two
     * flushes can hold the same five ranks in different suits, which the
     * cascade cannot separate, so the suit is the last word — otherwise the
     * comparison would have no answer.
     */
    function flushKey(sorted) {
        let key = 0;
        for (let i = sorted.length - 1; i >= 0; i--) key = key * 16 + rankValue(sorted[i]);
        return key * 8 + SUIT_VALUE[sorted[0].s];
    }

    /**
     * What these cards are, or null. One, two, three or five cards only —
     * four cards is not a play in this game, and neither is six.
     */
    function detect(cards) {
        if (!Array.isArray(cards) || !cards.length) return null;
        const n = cards.length;
        const sorted = byValue(cards);
        const m = counts(cards);
        const ranks = [...m.keys()].sort((a, b) => a - b);
        const top = sorted[n - 1];

        if (n === 1) return combo('SINGLE', 0, cardValue(top), 1);
        if (n === 2) return ranks.length === 1 ? combo('PAIR', 0, ranks[0], 2) : null;
        if (n === 3) return ranks.length === 1 ? combo('TRIPLE', 0, ranks[0], 3) : null;
        if (n !== 5) return null;

        const values = sorted.map(rankValue);
        const run = isRun(values);
        const flush = sorted.every((c) => c.s === sorted[0].s);

        if (run && flush) return combo('STRAIGHT_FLUSH', CAT.STRAIGHT_FLUSH, cardValue(top), 5);

        // Four of a kind plus any fifth card. The quad is what is compared.
        const quad = ranks.find((r) => m.get(r).length === 4);
        if (quad !== undefined) return combo('FOUR_OF_A_KIND', CAT.FOUR, quad, 5);

        // Full house: a triple and a pair, and nothing else.
        if (ranks.length === 2) {
            const three = ranks.find((r) => m.get(r).length === 3);
            const two   = ranks.find((r) => m.get(r).length === 2);
            if (three !== undefined && two !== undefined) return combo('FULL_HOUSE', CAT.FULL_HOUSE, three, 5);
            return null;
        }

        if (flush) return combo('FLUSH', CAT.FLUSH, flushKey(sorted), 5);
        if (run && ranks.length === 5) return combo('STRAIGHT', CAT.STRAIGHT, cardValue(top), 5);
        return null;
    }

    /**
     * Does `a` answer `b`? A missing `b` is a free lead.
     *
     * The count must match, always. Within five cards the category decides
     * first and the key only breaks a tie inside one category — a flush of
     * threes beats a straight to the ace.
     */
    function beats(a, b) {
        if (!a) return false;
        if (!b) return true;
        if (a.size !== b.size) return false;
        if (a.size === 5 && a.cat !== b.cat) return a.cat > b.cat;
        if (a.size !== 5 && a.type !== b.type) return false;
        return a.key > b.key;
    }

    /** The reading of `cards` if it legally answers `required`, else null. */
    function canBeat(cards, required) {
        const c = detect(cards);
        return (c && beats(c, required)) ? c : null;
    }

    /* ---- finding plays in a hand ----------------------------------------- */

    const lowestOf = (list, n) => byValue(list).slice(0, n);

    /** Every straight in the hand, cheapest first, one candidate per window. */
    function straights(m) {
        const out = [];
        for (let lo = 3; lo + 4 <= RUN_TOP; lo++) {
            const window = [];
            for (let r = lo; r <= lo + 4; r++) {
                const list = m.get(r);
                if (!list) { window.length = 0; break; }
                window.push(list);
            }
            if (window.length !== 5) continue;
            // The lowest card of each rank makes the weakest straight in that
            // window, which is the one worth offering first.
            out.push(window.map((list) => lowestOf(list, 1)[0]));
            // The top card decides, so a stronger version of the same window
            // is worth having when the weak one does not answer.
            const topList = byValue(window[4]);
            if (topList.length > 1) {
                out.push(window.slice(0, 4).map((l) => lowestOf(l, 1)[0]).concat([topList[topList.length - 1]]));
            }
        }
        return out;
    }

    const bySuit = (cards) => {
        const m = new Map();
        for (const c of cards) {
            if (!m.has(c.s)) m.set(c.s, []);
            m.get(c.s).push(c);
        }
        return m;
    };

    /** Every five-card flush, and every straight flush inside them. */
    function flushes(cards) {
        const out = [], runs = [];
        for (const [, list] of bySuit(cards)) {
            const sorted = byValue(list);
            if (sorted.length < 5) continue;
            for (let i = 0; i + 5 <= sorted.length; i++) {
                const five = sorted.slice(i, i + 5);
                if (isRun(five.map(rankValue))) runs.push(five);
            }
            // Enumerating every five of a flush is how the weakest one that
            // still wins gets offered. Nine cards of a suit is 126 hands; a
            // longer one falls back to sliding windows rather than 1,287.
            if (sorted.length <= 9) combinations(sorted, 5, (five) => { out.push(five); });
            else for (let i = 0; i + 5 <= sorted.length; i++) out.push(sorted.slice(i, i + 5));
        }
        return { flushes: out, straightFlushes: runs };
    }

    function combinations(list, k, fn, start = 0, acc = []) {
        if (acc.length === k) return fn(acc.slice());
        for (let i = start; i < list.length; i++) {
            acc.push(list[i]);
            combinations(list, k, fn, i + 1, acc);
            acc.pop();
        }
    }

    function fullHouses(m) {
        const out = [];
        const ranks = [...m.keys()].sort((a, b) => a - b);
        for (const t of ranks) {
            if (m.get(t).length < 3) continue;
            for (const p of ranks) {
                if (p === t || m.get(p).length < 2) continue;
                out.push(lowestOf(m.get(t), 3).concat(lowestOf(m.get(p), 2)));
            }
        }
        return out;
    }

    function quads(m, cards) {
        const out = [];
        for (const [r, list] of m) {
            if (list.length !== 4) continue;
            const rest = byValue(cards.filter((c) => rankValue(c) !== r));
            if (rest.length) out.push(list.concat([rest[0]]));
        }
        return out;
    }

    /** Every five-card hand worth offering, weakest kind first. */
    function fives(cards) {
        const m = counts(cards);
        const f = flushes(cards);
        return [].concat(straights(m), f.flushes, fullHouses(m), quads(m, cards), f.straightFlushes);
    }

    /**
     * Every play in `hand` that answers `required`, cheapest first. `must`, if
     * given, is a card id every candidate has to contain — which is how the
     * opening play is held to the 3♦.
     */
    function find(hand, required, must) {
        const m = counts(hand);
        const out = [];
        const keep = (cards) => {
            if (must && !cards.some((c) => c.id === must)) return;
            if (!canBeat(cards, required)) return;
            out.push(cards);
        };

        if (!required || required.size === 1) for (const c of byValue(hand)) keep([c]);
        if (!required || required.size === 2) {
            for (const [, list] of m) if (list.length >= 2) keep(lowestOf(list, 2));
        }
        if (!required || required.size === 3) {
            for (const [, list] of m) if (list.length >= 3) keep(lowestOf(list, 3));
        }
        if (!required || required.size === 5) for (const five of fives(hand)) keep(five);

        // A pair or a triple could also be made from the high suits of a rank,
        // but the rank is what is compared, so the lowest cards of that rank
        // always do the same job and keep the good suits back.
        return cheapestFirst(out);
    }

    /** Sort without calling detect() inside the comparator. */
    function cheapestFirst(plays) {
        return plays
            .map((cards) => ({ cards, k: rankFor(cards) }))
            .sort((a, b) => a.k - b.k)
            .map((x) => x.cards);
    }

    function rankFor(cards) {
        const c = detect(cards);
        if (!c) return Infinity;
        return (c.size === 5 ? c.cat * 1e9 : 0) + c.key;
    }

    /**
     * A greedy split of a hand into the groups it would rather play whole:
     * the five-card hands it can make, then triples, pairs and singles. Not
     * optimal — optimal is a search — but it stops a straight being shed one
     * card at a time, which is what bad play looks like from across the table.
     */
    function decompose(hand) {
        const left = byValue(hand);
        const out = [];
        const drop = (cards) => {
            const ids = new Set(cards.map((c) => c.id));
            for (let i = left.length - 1; i >= 0; i--) if (ids.has(left[i].id)) left.splice(i, 1);
        };

        // Five-card hands first, strongest kind last so the cheap ones go out
        // before the straight flush is broken up for parts.
        for (;;) {
            const options = fives(left);
            if (!options.length) break;
            const pick = cheapestFirst(options)[0];
            out.push({ cards: pick });
            drop(pick);
        }
        const m = counts(left);
        for (const r of [...m.keys()].sort((a, b) => a - b)) {
            const list = byValue(m.get(r));
            while (list.length >= 3) out.push({ cards: list.splice(0, 3) });
            if (list.length === 2) out.push({ cards: list.splice(0, 2) });
            if (list.length === 1) out.push({ cards: list.splice(0, 1) });
        }
        return out;
    }

    /** What a seat might open with: whole groups, plus every single card. */
    function leads(hand, must) {
        const out = decompose(hand).map((g) => g.cards);
        for (const c of byValue(hand)) out.push([c]);
        return cheapestFirst(out.filter((cards) =>
            detect(cards) && (!must || cards.some((c) => c.id === must))));
    }

    window.CV = window.CV || {};
    window.CV.B2 = {
        SUIT_VALUE, CAT, RUN_TOP,
        rankValue, cardValue, rankName, sortHand, counts,
        detect, beats, canBeat, find, fives, leads, decompose,
    };
})();
