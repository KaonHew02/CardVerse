/**
 * CardVerse — 斗地主 combinations.
 *
 * Everything about what a set of cards *is* and which set beats which lives
 * here, apart from the engine, because it is the part with the most rules and
 * the part worth testing on its own. No state, no RNG, no DOM.
 *
 * **Strength is not the deck's rank.** The deck stores an ace as 14 and a
 * deuce as 2, but 斗地主 puts the 2 above the ace and the jokers above that:
 *
 *     3 4 5 6 7 8 9 10 J Q K A 2 小王 大王
 *     3 4 5 6 7 8 9 10 11 12 13 14 15 16 17
 *
 * `RUN_TOP` is A. A 2 and either joker can never appear in a straight, a run
 * of pairs or an airplane — which is why the run checks test against it and
 * not against the top of the scale.
 *
 * **A hand of cards can read more than one way.** `3 3 3 4 4 4 5 5 5 6 6 6`
 * is four consecutive triples, and it is also three consecutive triples with
 * three singles attached. Which one it is depends on what it has to beat, so
 * `readings()` returns every legal reading and the caller picks. `parse()` is
 * only for naming a play that has already been chosen.
 */

(() => {
    'use strict';

    /** Deck rank → 斗地主 strength. 2 climbs above the ace; jokers top out. */
    const strength = (card) => (
        card.r === 15 ? 16 :        // small joker
        card.r === 16 ? 17 :        // big joker
        card.r === 2  ? 15 :        // the deuce outranks the ace
        card.r                      // 3..14, unchanged
    );

    const SMALL_JOKER = 16;
    const BIG_JOKER   = 17;

    /** The highest card a straight, a run of pairs or an airplane may reach. */
    const RUN_TOP = 14;

    const NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };
    const label = (r) => NAMES[r] || String(r);

    /** Cards by strength, each list in the order given. */
    function groups(cards) {
        const m = new Map();
        for (const c of cards) {
            const r = strength(c);
            if (!m.has(r)) m.set(r, []);
            m.get(r).push(c);
        }
        return m;
    }

    const sortedRanks = (m) => [...m.keys()].sort((a, b) => a - b);

    /** Consecutive, and low enough that no 2 or joker has crept in. */
    function runOk(ranks) {
        if (!ranks.length || ranks[ranks.length - 1] > RUN_TOP) return false;
        for (let i = 1; i < ranks.length; i++) if (ranks[i] !== ranks[i - 1] + 1) return false;
        return true;
    }

    /** Every maximal window of `len` consecutive ranks each holding `min` cards. */
    function windows(m, len, min) {
        const ok = sortedRanks(m).filter((r) => r <= RUN_TOP && m.get(r).length >= min);
        const out = [];
        for (let i = 0; i + len <= ok.length; i++) {
            const slice = ok.slice(i, i + len);
            if (runOk(slice)) out.push(slice);
        }
        return out;
    }

    /* ---- reading a set of cards ----------------------------------------- */

    const combo = (type, key, size, len) => ({ type, key, size, len });

    /**
     * Every legal reading of `cards`, strongest kind first. An empty array
     * means the cards are not a playable combination at all.
     */
    function readings(cards) {
        const out = [];
        const n = cards.length;
        if (!n) return out;

        const m  = groups(cards);
        const rs = sortedRanks(m);
        const at = (r) => (m.get(r) ? m.get(r).length : 0);
        const top = rs[rs.length - 1];

        // 王炸 — the two jokers, and nothing else in the world beats it.
        if (n === 2 && at(SMALL_JOKER) === 1 && at(BIG_JOKER) === 1) {
            out.push(combo('rocket', Infinity, 2, 1));
            return out;                        // it can be read no other way
        }

        // 炸弹
        if (n === 4 && rs.length === 1) out.push(combo('bomb', rs[0], 4, 1));

        if (n === 1) out.push(combo('single', rs[0], 1, 1));
        if (n === 2 && rs.length === 1) out.push(combo('pair', rs[0], 2, 1));
        if (n === 3 && rs.length === 1) out.push(combo('triple', rs[0], 3, 1));

        // 三带一 / 三带二 — the triple is what is compared; the kicker is freight.
        if (n === 4 && rs.length === 2) {
            const t = rs.find((r) => at(r) === 3);
            if (t !== undefined) out.push(combo('triple1', t, 4, 1));
        }
        if (n === 5 && rs.length === 2) {
            const t = rs.find((r) => at(r) === 3);
            const p = rs.find((r) => at(r) === 2);
            if (t !== undefined && p !== undefined) out.push(combo('triple2', t, 5, 1));
        }

        // 顺子 — five or more, single cards, consecutive, no 2 and no joker.
        if (n >= 5 && rs.length === n && runOk(rs)) out.push(combo('straight', top, n, n));

        // 连对 — three or more consecutive pairs.
        if (n >= 6 && n % 2 === 0 && rs.length === n / 2
            && rs.every((r) => at(r) === 2) && runOk(rs)) {
            out.push(combo('pairs', top, n, n / 2));
        }

        // 四带二 / 四带两对.
        if (n === 6) {
            const q = rs.find((r) => at(r) === 4);
            if (q !== undefined) out.push(combo('four2', q, 6, 1));
        }
        if (n === 8) {
            const q = rs.find((r) => at(r) === 4);
            if (q !== undefined) {
                const rest = rs.filter((r) => r !== q);
                if (rest.length === 2 && rest.every((r) => at(r) === 2)) out.push(combo('four2pair', q, 8, 1));
            }
        }

        // 飞机, with and without wings. Every possible body is tried, because
        // the same cards can be a longer airplane or a shorter one carrying
        // its neighbours as wings, and only the play being answered decides.
        for (const body of allBodies(m)) {
            const k = body.length;
            const bodyCards = k * 3;
            const wings = n - bodyCards;
            const bodyTop = body[body.length - 1];
            const spare = new Map(m);
            for (const r of body) {
                const left = at(r) - 3;
                if (left > 0) spare.set(r, m.get(r).slice(0, left)); else spare.delete(r);
            }
            if (wings === 0) out.push(combo('plane', bodyTop, n, k));
            // 飞机带单翅膀 — one loose card per triple.
            if (wings === k && countCards(spare) === k) out.push(combo('plane1', bodyTop, n, k));
            // 飞机带对翅膀 — one pair per triple, and they must be real pairs.
            if (wings === k * 2 && allPairs(spare) && spare.size === k) out.push(combo('plane2', bodyTop, n, k));
        }

        return out;
    }

    /** Every run of two or more consecutive ranks holding a triple. */
    function allBodies(m) {
        const out = [];
        const ok = sortedRanks(m).filter((r) => r <= RUN_TOP && m.get(r).length >= 3);
        for (let i = 0; i < ok.length; i++) {
            for (let j = i + 1; j < ok.length; j++) {
                const slice = ok.slice(i, j + 1);
                if (!runOk(slice)) break;
                out.push(slice);
            }
        }
        return out;
    }

    const countCards = (m) => [...m.values()].reduce((n, list) => n + list.length, 0);
    const allPairs   = (m) => [...m.values()].every((list) => list.length === 2);

    /**
     * One reading, for naming a play that has already been made. Prefers the
     * plainest form — an airplane rather than a shorter airplane with wings —
     * which is what a player would call it.
     */
    const ORDER = ['rocket', 'bomb', 'single', 'pair', 'triple', 'straight', 'pairs',
                   'plane', 'triple1', 'triple2', 'plane1', 'plane2', 'four2', 'four2pair'];

    function parse(cards) {
        const all = readings(cards);
        if (!all.length) return null;
        return all.slice().sort((a, b) => {
            const d = ORDER.indexOf(a.type) - ORDER.indexOf(b.type);
            return d || b.len - a.len;
        })[0];
    }

    /* ---- which beats which ---------------------------------------------- */

    /**
     * `a` answers `b`. A missing `b` is a free lead, which anything valid takes.
     *
     * The general rule is the strict one from the rules: same type, same
     * number of cards, higher body. Bombs and the rocket are the only things
     * that cut across it.
     */
    function beats(a, b) {
        if (!a) return false;
        if (!b) return true;
        // Nothing beats a rocket, another rocket included.
        if (b.type === 'rocket') return false;
        if (a.type === 'rocket') return true;
        if (a.type === 'bomb' && b.type !== 'bomb') return true;
        if (b.type === 'bomb' && a.type !== 'bomb') return false;
        if (a.type !== b.type) return false;
        if (a.size !== b.size) return false;
        return a.key > b.key;
    }

    /**
     * Can this selection legally answer `required`? Returns the reading that
     * does it, so the table can name the play, or null.
     */
    function canBeat(cards, required) {
        let best = null;
        for (const r of readings(cards)) {
            if (!beats(r, required)) continue;
            if (!best || ORDER.indexOf(r.type) < ORDER.indexOf(best.type)) best = r;
        }
        return best;
    }

    /* ---- finding a play in a hand --------------------------------------- */

    /**
     * Cards to spare, cheapest first: lowest rank, and out of the smallest
     * group, so a kicker never comes off a triple while a loose card is going
     * begging. A four-of-a-kind and the jokers are never broken for freight.
     */
    function spareCards(m, used, want, perRank) {
        const picked = [];
        const ranks = sortedRanks(m)
            .filter((r) => !used.has(r) && r < SMALL_JOKER && m.get(r).length !== 4)
            .filter((r) => m.get(r).length >= perRank)
            .sort((a, b) => (m.get(a).length - m.get(b).length) || (a - b));
        for (const r of ranks) {
            if (picked.length >= want) break;
            picked.push(m.get(r).slice(0, perRank));
        }
        return picked.length === want ? picked.flat() : null;
    }

    const take = (m, r, n) => m.get(r).slice(0, n);

    /**
     * Every play in `hand` that answers `required`, cheapest first. A null
     * `required` means the seat is leading, and `leads()` handles that.
     *
     * Bombs and the rocket come last in the list even though they beat
     * everything, so a caller that takes the first option never blows one up
     * on a three.
     */
    function find(hand, required) {
        if (!required) return leads(hand);
        const m = groups(hand);
        const out = [];
        const key = required.key;
        const push = (cards) => { if (cards && cards.length) out.push(cards); };

        const rs = sortedRanks(m);
        const higher = (min) => rs.filter((r) => r > key && m.get(r).length >= min);
        // A four-of-a-kind is never broken up to make a single, a pair or a
        // triple. The bomb is already offered below as an answer to anything,
        // so a hand of nothing but bombs is not left stuck.
        const whole = (min) => higher(min).filter((r) => m.get(r).length !== 4);

        switch (required.type) {
            case 'single':
                for (const r of whole(1)) push(take(m, r, 1));
                break;
            case 'pair':
                for (const r of whole(2)) push(take(m, r, 2));
                break;
            case 'triple':
                for (const r of whole(3)) push(take(m, r, 3));
                break;
            case 'triple1':
                for (const r of whole(3)) {
                    const kick = spareCards(m, new Set([r]), 1, 1);
                    if (kick) push(take(m, r, 3).concat(kick));
                }
                break;
            case 'triple2':
                for (const r of whole(3)) {
                    const kick = spareCards(m, new Set([r]), 1, 2);
                    if (kick) push(take(m, r, 3).concat(kick));
                }
                break;
            case 'straight':
                for (const w of windows(m, required.len, 1)) {
                    if (w[w.length - 1] > key) push(w.map((r) => m.get(r)[0]));
                }
                break;
            case 'pairs':
                for (const w of windows(m, required.len, 2)) {
                    if (w[w.length - 1] > key) push(w.flatMap((r) => take(m, r, 2)));
                }
                break;
            case 'plane':
                for (const w of windows(m, required.len, 3)) {
                    if (w[w.length - 1] > key) push(w.flatMap((r) => take(m, r, 3)));
                }
                break;
            case 'plane1':
            case 'plane2': {
                const per = required.type === 'plane1' ? 1 : 2;
                for (const w of windows(m, required.len, 3)) {
                    if (w[w.length - 1] <= key) continue;
                    const body = w.flatMap((r) => take(m, r, 3));
                    const wings = spareCards(m, new Set(w), required.len, per);
                    if (wings) push(body.concat(wings));
                }
                break;
            }
            case 'four2':
            case 'four2pair': {
                const per = required.type === 'four2' ? 1 : 2;
                for (const r of higher(4)) {
                    const kick = spareCards(m, new Set([r]), 2, per);
                    if (kick) push(take(m, r, 4).concat(kick));
                }
                break;
            }
            case 'bomb':
                for (const r of higher(4)) push(take(m, r, 4));
                break;
            default:
                break;
        }

        // 炸弹 and 王炸 answer anything that is not already one of them.
        if (required.type !== 'bomb' && required.type !== 'rocket') {
            for (const r of rs) if (m.get(r).length === 4) push(take(m, r, 4));
        }
        if (required.type !== 'rocket' && m.has(SMALL_JOKER) && m.has(BIG_JOKER)) {
            push([m.get(SMALL_JOKER)[0], m.get(BIG_JOKER)[0]]);
        }

        return out;
    }

    /**
     * What a seat might open with. The hand is broken into groups it would
     * rather keep together — runs, then airplanes, then pairs of pairs, then
     * what is left — and each group is offered as a lead. Bombs and the
     * rocket are offered too, but last.
     */
    function leads(hand) {
        const out = decompose(hand).map((g) => g.cards);
        // Any single card is always a legal lead, and sometimes the only sane
        // one, so make sure the cheapest few are on the list.
        const m = groups(hand);
        for (const r of sortedRanks(m)) if (m.get(r).length < 4) out.push(take(m, r, 1));
        // Cheapest and largest first; a bomb is a lead of last resort.
        const weight = (cards) => {
            const c = parse(cards);
            if (!c) return 1e9;
            const heavy = (c.type === 'bomb' || c.type === 'rocket') ? 1e6 : 0;
            return heavy + c.key * 10 - cards.length;
        };
        return out.sort((a, b) => weight(a) - weight(b));
    }

    /**
     * A greedy split of a hand into groups worth keeping together. Not
     * optimal — optimal is a search — but it keeps runs and airplanes intact,
     * which is most of what good play looks like from the other side of the
     * table.
     */
    function decompose(hand) {
        const m = groups(hand);
        const left = new Map();
        for (const [r, list] of m) left.set(r, list.slice());
        const out = [];

        const size = (r) => (left.get(r) ? left.get(r).length : 0);
        const pull = (r, n) => {
            const list = left.get(r);
            const got = list.splice(0, n);
            if (!list.length) left.delete(r);
            return got;
        };

        // 王炸 and 炸弹 come out whole and stay out.
        if (size(SMALL_JOKER) && size(BIG_JOKER)) {
            out.push({ cards: pull(SMALL_JOKER, 1).concat(pull(BIG_JOKER, 1)), keep: true });
        }
        for (const r of sortedRanks(left)) if (size(r) === 4) out.push({ cards: pull(r, 4), keep: true });

        // Longest structures first, so a run is not eaten by the pairs pass.
        for (const min of [3, 2, 1]) {
            const need = min === 3 ? 2 : min === 2 ? 3 : 5;
            for (;;) {
                const found = longestWindow(left, need, min);
                if (!found) break;
                out.push({ cards: found.flatMap((r) => pull(r, min)) });
            }
        }

        for (const r of sortedRanks(left)) {
            while (size(r) >= 3) out.push({ cards: pull(r, 3) });
            if (size(r) === 2) out.push({ cards: pull(r, 2) });
            if (size(r) === 1) out.push({ cards: pull(r, 1) });
        }
        return attachWings(out);
    }

    /**
     * Give every triple and airplane its freight.
     *
     * A triple and a loose three are two turns; 三带一 is one. Since the
     * whole point of counting groups is counting turns, the loose cards have
     * to be hung on something before the count means anything. The lowest
     * cards go first — a kicker is a card you are giving away.
     */
    function attachWings(groups) {
        const spare = groups
            .filter((g) => !g.keep && g.cards.length === 1)
            .sort((a, b) => strength(a.cards[0]) - strength(b.cards[0]));
        const used = new Set();

        for (const g of groups) {
            if (g.keep || used.has(g) || g.cards.length % 3 !== 0) continue;
            const bodies = g.cards.length / 3;
            if (!bodies || !parse(g.cards) || parse(g.cards).type === 'bomb') continue;
            const take = [];
            for (const s of spare) {
                if (take.length >= bodies) break;
                if (s === g || used.has(s)) continue;
                take.push(s);
            }
            if (take.length !== bodies) continue;
            const merged = g.cards.concat(take.flatMap((s) => s.cards));
            if (!parse(merged)) continue;             // never invent an illegal group
            take.forEach((s) => used.add(s));
            g.cards = merged;
        }
        return groups.filter((g) => !used.has(g));
    }

    /** The longest run of `min`-deep ranks, at least `need` long, or null. */
    function longestWindow(m, need, min) {
        let best = null;
        for (let len = sortedRanks(m).length; len >= need; len--) {
            const found = windows(m, len, min);
            if (found.length) { best = found[found.length - 1]; break; }
        }
        return best;
    }

    window.CV = window.CV || {};
    window.CV.DDZ = {
        strength, label, RUN_TOP, SMALL_JOKER, BIG_JOKER,
        groups, readings, parse, beats, canBeat, find, leads, decompose,
    };
})();
