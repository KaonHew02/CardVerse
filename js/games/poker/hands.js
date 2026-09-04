/**
 * CardVerse — poker hand evaluation.
 *
 * `evaluate(cards)` takes five to seven cards and returns the best five-card
 * hand inside them; `compare(a, b)` orders two of those. Nothing else lives
 * here — no state, no RNG, no DOM — because the engine, the opponents, the
 * showdown and the tests all have to agree on what beats what.
 *
 * **The category is never enough.** Two players with a pair of tens are
 * separated by their kickers, two flushes by their fifth card, and a pot is
 * split only when all five cards match. So every hand carries a tiebreak
 * list, and `compare` walks it.
 *
 * The two rules that are easy to get wrong, and are therefore spelled out:
 *
 *  - **The ace is high everywhere except A-2-3-4-5**, where it plays as a one
 *    and makes the lowest straight there is, a five-high. It never wraps:
 *    `Q K A 2 3` and `K A 2 3 4` are not straights.
 *  - **Suits have no ranking.** Two hands with the same five ranks tie, in
 *    every category, and the pot is split.
 *
 * A player uses the best five of their seven cards. They do not have to use
 * either hole card — a board of `A♠ K♠ Q♠ J♠ 10♠` is a royal flush for
 * everyone still in the hand.
 */

(() => {
    'use strict';

    /** Strongest to weakest, as the rules list them. */
    const CAT = {
        ROYAL_FLUSH: 10, STRAIGHT_FLUSH: 9, FOUR_OF_A_KIND: 8, FULL_HOUSE: 7,
        FLUSH: 6, STRAIGHT: 5, THREE_OF_A_KIND: 4, TWO_PAIR: 3, ONE_PAIR: 2, HIGH_CARD: 1,
    };
    const CAT_NAME = Object.fromEntries(Object.entries(CAT).map(([k, v]) => [v, k]));

    const RANK_NAME = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
    const rankName = (r) => RANK_NAME[r] || String(r);

    /** The wheel, written the way the ranks come out sorted high to low. */
    const WHEEL = '14,5,4,3,2';

    /**
     * Score exactly five cards.
     * @returns {{cat:number, name:string, tie:number[], cards:object[]}}
     */
    function score5(cards) {
        const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
        const flush = cards.every((c) => c.s === cards[0].s);

        const cnt = new Map();
        for (const r of ranks) cnt.set(r, (cnt.get(r) || 0) + 1);
        // Biggest group first, then highest rank — which is the order the
        // tiebreak has to be read in for every paired category.
        const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
        const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]);

        const uniq = [...new Set(ranks)];
        let high = 0;
        if (uniq.length === 5) {
            if (uniq[0] - uniq[4] === 4) high = uniq[0];
            else if (uniq.join() === WHEEL) high = 5;      // the ace plays as a one
        }

        const made = (cat, tie) => ({ cat, name: CAT_NAME[cat], tie, cards: cards.slice() });

        if (flush && high === 14) return made(CAT.ROYAL_FLUSH, []);
        if (flush && high)        return made(CAT.STRAIGHT_FLUSH, [high]);
        if (groups[0][1] === 4)   return made(CAT.FOUR_OF_A_KIND, [groups[0][0], groups[1][0]]);
        if (groups[0][1] === 3 && groups[1][1] === 2)
            return made(CAT.FULL_HOUSE, [groups[0][0], groups[1][0]]);
        if (flush)                return made(CAT.FLUSH, ranks.slice());
        if (high)                 return made(CAT.STRAIGHT, [high]);
        if (groups[0][1] === 3)   return made(CAT.THREE_OF_A_KIND, [groups[0][0], ...kickers]);
        if (groups[0][1] === 2 && groups[1][1] === 2)
            return made(CAT.TWO_PAIR, [groups[0][0], groups[1][0], kickers[0]]);
        if (groups[0][1] === 2)   return made(CAT.ONE_PAIR, [groups[0][0], ...kickers]);
        return made(CAT.HIGH_CARD, ranks.slice());
    }

    /** Positive if `a` is the better hand, negative if `b` is, 0 for a tie. */
    function compare(a, b) {
        if (a.cat !== b.cat) return a.cat - b.cat;
        const n = Math.max(a.tie.length, b.tie.length);
        for (let i = 0; i < n; i++) {
            const d = (a.tie[i] || 0) - (b.tie[i] || 0);
            if (d) return d;
        }
        return 0;      // same five ranks — suits do not break it, so it is a tie
    }

    function combinations(list, k, fn, start = 0, acc = []) {
        if (acc.length === k) return fn(acc);
        for (let i = start; i < list.length; i++) {
            acc.push(list[i]);
            combinations(list, k, fn, i + 1, acc);
            acc.pop();
        }
    }

    /**
     * The best five-card hand in `cards`. Twenty-one subsets of seven is
     * cheap, and picking the winner by brute force is the one way to be sure
     * a clever shortcut has not missed a hand.
     */
    function evaluate(cards) {
        if (!cards || cards.length < 5) return null;
        if (cards.length === 5) return score5(cards);
        let best = null;
        combinations(cards, 5, (five) => {
            const s = score5(five);
            if (!best || compare(s, best) > 0) best = s;
        });
        return best;
    }

    /** "Two pair, kings and sevens" — for the showdown line. */
    function describe(hand) {
        if (!hand) return '';
        const r = hand.tie.map(rankName);
        switch (hand.cat) {
            case CAT.ROYAL_FLUSH:    return window.CV.t('pk.hand.ROYAL_FLUSH');
            case CAT.STRAIGHT_FLUSH: return window.CV.t('pk.hand.STRAIGHT_FLUSH', { r: r[0] });
            case CAT.FOUR_OF_A_KIND: return window.CV.t('pk.hand.FOUR_OF_A_KIND', { r: r[0] });
            case CAT.FULL_HOUSE:     return window.CV.t('pk.hand.FULL_HOUSE', { r: r[0], s: r[1] });
            case CAT.FLUSH:          return window.CV.t('pk.hand.FLUSH', { r: r[0] });
            case CAT.STRAIGHT:       return window.CV.t('pk.hand.STRAIGHT', { r: r[0] });
            case CAT.THREE_OF_A_KIND:return window.CV.t('pk.hand.THREE_OF_A_KIND', { r: r[0] });
            case CAT.TWO_PAIR:       return window.CV.t('pk.hand.TWO_PAIR', { r: r[0], s: r[1] });
            case CAT.ONE_PAIR:       return window.CV.t('pk.hand.ONE_PAIR', { r: r[0] });
            default:                 return window.CV.t('pk.hand.HIGH_CARD', { r: r[0] });
        }
    }

    window.CV = window.CV || {};
    window.CV.PokerHands = { CAT, CAT_NAME, rankName, score5, evaluate, compare, describe, combinations };
})();
