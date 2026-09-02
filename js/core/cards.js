/**
 * CardVerse — the card engine every card game shares.
 *
 * A card is a plain object `{ r, s, id }` and nothing more, so a whole game
 * state stays JSON — savable, sendable, and comparable. Rank is a number
 * (2..14, ace high) rather than a string because every game in the hub has to
 * compare ranks and only some of them care what an ace is called.
 *
 * Games that rank aces low (斗地主 counts 3 as the floor, 锄大D puts 2 on top)
 * apply their own ordering on top; they do not get their own deck.
 */

(() => {
    'use strict';

    const SUITS = ['S', 'H', 'D', 'C'];

    const SUIT_NAME   = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
    const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣', J: '★' };
    const SUIT_COLOR  = { S: 'black', H: 'red', D: 'red', C: 'black', J: 'joker' };

    /** Rank 11..14 print as letters; 15/16 are the two jokers. */
    const RANK_LABEL = {
        11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: 'j', 16: 'J●',
    };

    const rankLabel = (r) => RANK_LABEL[r] || String(r);
    const isJoker   = (card) => card.s === 'J';

    /** Human-readable, for logs and screen readers: "A♠", "Red Joker". */
    function cardName(card) {
        if (isJoker(card)) return card.r === 16 ? 'Big Joker' : 'Small Joker';
        return rankLabel(card.r) + SUIT_SYMBOL[card.s];
    }

    /**
     * Blackjack-family face value. Aces come back as 11 and the caller demotes
     * them; see `handValue`, which is the only place that decision belongs.
     */
    function pipValue(card) {
        if (card.r >= 11 && card.r <= 13) return 10;
        if (card.r === 14) return 11;
        return card.r;
    }

    /**
     * Best total for a blackjack-style hand.
     *
     * Returns `{ total, soft, aces }` — soft meaning an ace is still counted as
     * 11 and could be demoted, which is the whole reason dealer rules and basic
     * strategy need two numbers rather than one.
     */
    function handValue(cards) {
        let total = 0, aces = 0;
        for (const c of cards) {
            const v = pipValue(c);
            total += v;
            if (v === 11) aces++;
        }
        let soft = aces > 0;
        while (total > 21 && aces > 0) { total -= 10; aces--; }
        if (aces === 0) soft = false;
        return { total, soft, aces };
    }

    const isBust      = (cards) => handValue(cards).total > 21;
    const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

    /**
     * A shoe of `decks` 52-card packs, shuffled by the table's RNG.
     *
     * `id` is unique across the shoe so the UI can key DOM nodes by it — two
     * aces of spades in a six-deck shoe are genuinely different cards to the
     * renderer even though they are the same card to the rules.
     */
    class Deck {
        constructor(rng, opts = {}) {
            this.rng     = rng;
            this.decks   = opts.decks || 1;
            this.jokers  = !!opts.jokers;
            this.cards   = [];
            this.dealt   = [];
            this.build();
        }

        build() {
            this.cards = [];
            this.dealt = [];
            for (let d = 0; d < this.decks; d++) {
                for (const s of SUITS) {
                    for (let r = 2; r <= 14; r++) {
                        this.cards.push({ r, s, id: `${d}-${s}${r}` });
                    }
                }
                if (this.jokers) {
                    this.cards.push({ r: 15, s: 'J', id: `${d}-j15` });
                    this.cards.push({ r: 16, s: 'J', id: `${d}-j16` });
                }
            }
            return this;
        }

        shuffle() {
            this.rng.shuffle(this.cards);
            return this;
        }

        /** Fresh pack, shuffled — what a reshuffle actually is. */
        reset() {
            return this.build().shuffle();
        }

        get remaining() { return this.cards.length; }
        get size()      { return this.decks * (52 + (this.jokers ? 2 : 0)); }

        /** Fraction of the shoe already dealt; shoes reshuffle past a cut card. */
        get penetration() {
            return this.dealt.length / this.size;
        }

        /**
         * Take one card. An exhausted shoe reshuffles rather than throwing —
         * a table that dies mid-hand because someone set the cut card badly is
         * a worse outcome than a shuffle nobody announced.
         */
        draw() {
            if (!this.cards.length) this.reset();
            const card = this.cards.pop();
            this.dealt.push(card);
            return card;
        }

        drawMany(n) {
            const out = [];
            for (let i = 0; i < n; i++) out.push(this.draw());
            return out;
        }

        /** Deal `each` cards to `hands` players, round-robin as at a real table. */
        deal(hands, each) {
            const out = Array.from({ length: hands }, () => []);
            for (let i = 0; i < each; i++) {
                for (let h = 0; h < hands; h++) out[h].push(this.draw());
            }
            return out;
        }

        snapshot() { return { cards: this.cards.slice(), dealt: this.dealt.slice() }; }

        restore(snap) {
            this.cards = snap.cards.slice();
            this.dealt = snap.dealt.slice();
            return this;
        }
    }

    /** Ascending by rank, then by the suit order the caller's game uses. */
    function sortCards(cards, suitOrder = ['D', 'C', 'H', 'S']) {
        return cards.slice().sort((a, b) =>
            a.r - b.r || suitOrder.indexOf(a.s) - suitOrder.indexOf(b.s));
    }

    /** `{ rank: count }`, the starting point for nearly every combination check. */
    function countByRank(cards) {
        const out = {};
        for (const c of cards) out[c.r] = (out[c.r] || 0) + 1;
        return out;
    }

    function countBySuit(cards) {
        const out = {};
        for (const c of cards) out[c.s] = (out[c.s] || 0) + 1;
        return out;
    }

    window.CV = window.CV || {};
    window.CV.Cards = {
        SUITS, SUIT_NAME, SUIT_SYMBOL, SUIT_COLOR, RANK_LABEL,
        rankLabel, cardName, isJoker, pipValue, handValue, isBust, isBlackjack,
        sortCards, countByRank, countBySuit, Deck,
    };
})();
