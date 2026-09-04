/**
 * CardVerse — 锄大D (Big Two).
 *
 * Four seats, 52 cards, thirteen each, no jokers. Whoever holds the 3♦ opens
 * and their first play must contain it. First hand empty wins; the other
 * three lose.
 *
 * Two things separate this from 斗地主, and both are easy to carry over by
 * mistake:
 *
 *  - **Suits decide.** 3♠ beats 3♥ beats 3♣ beats 3♦. There are no bombs
 *    that cut across the card count: a four-of-a-kind is a *five-card* hand
 *    here, and it answers other five-card hands and nothing else.
 *  - **A pass is final for the trick.** A seat that passes is out until the
 *    trick clears, so the turn skips it. When only the seat that last played
 *    is left, the trick ends and that seat leads anything it likes.
 *
 * All the rules about what a set of cards *is* live in `combos.js`.
 *
 * On the stake: the rules do not price a round, so the settlement is the one
 * 锄大D is normally played for — each loser pays for the cards still in their
 * hand, and the winner collects. Virtual coins only, and no seat is taken
 * below zero.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;
    const B = CV.B2;

    const SEATS = 4;
    const HAND  = 13;

    /** The card that opens the game, and must be in the first play. */
    const isOpener = (card) => card.r === 3 && card.s === 'D';

    class BigTwoEngine extends CV.GameEngine {

        static get code() { return 'bigtwo'; }
        static get publicConfig() { return ['room', 'stake']; }

        static get defaults() {
            return {
                room: 'beginner',
                stake: 0,        // coins per card left; 0 means "take it from the room"
            };
        }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.stake = this.config.stake || room.bet[0];

            this.deck    = new Deck(this.rng, { decks: 1 });
            this.trick   = null;          // { by, combo, cards }
            this.passed  = new Set();     // out of this trick until it clears
            this.opening = true;          // the first play must hold the 3♦
            this.winner  = -1;
            this.cached  = null;
            this.plays   = [0, 0, 0, 0];

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.cards = [];
                s.passed = false;
            }
        }

        /* ---- dealing ---------------------------------------------------------- */

        start() {
            this.deck.reset();
            const dealt = this.deck.deal(SEATS, HAND);
            for (let i = 0; i < SEATS; i++) this.seats[i].cards = B.sortHand(dealt[i]);

            // Phase 4: the 3♦ decides who opens, and it has to be played.
            this.turn = this.seats.findIndex((s) => s.cards.some(isOpener));
            this.phase = 'play';
            this.round = 1;
            this.emit('deal', { hands: this.seats.map((s) => s.cards.length), opener: this.turn });
            this.emit('lead', { seat: this.turn, opening: true });
        }

        get openerId() {
            const s = this.seats[this.turn];
            const card = s && s.cards.find(isOpener);
            return card ? card.id : null;
        }

        /** The card id every candidate must contain, or null once it is gone. */
        mustPlay(seat) {
            if (!this.opening || seat !== this.turn) return null;
            const card = this.seats[seat].cards.find(isOpener);
            return card ? card.id : null;
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn || this.phase !== 'play') return [];
            const out = [{ type: 'play', label: t('b2.play') }];
            if (this.trick) out.push({ type: 'pass', label: t('b2.pass') });
            return out;
        }

        /**
         * The action space here is every subset of thirteen cards, so
         * `legalActions` lists the affordances and this does the real check.
         * Nothing reaches `handle()` that has not been through it.
         */
        isLegal(seat, action) {
            if (action.type === 'play') return !!this.validPlay(seat, action.cards);
            return super.isLegal(seat, action);
        }

        validPlay(seat, ids) {
            if (this.over || this.phase !== 'play' || seat !== this.turn) return null;
            if (!Array.isArray(ids) || !ids.length) return null;

            const hand = this.seats[seat].cards;
            const seen = new Set();
            const cards = [];
            for (const id of ids) {
                if (seen.has(id)) return null;
                seen.add(id);
                const card = hand.find((c) => c.id === id);
                if (!card) return null;
                cards.push(card);
            }
            // The opening play has to carry the 3♦ with it.
            if (this.opening && !cards.some(isOpener)) return null;
            return B.canBeat(cards, this.trick ? this.trick.combo : null);
        }

        handle(action) {
            if (action.type === 'play') return this.doPlay(action.seat, action.cards);
            if (action.type === 'pass') return this.doPass(action.seat);
            return false;
        }

        /* ---- the tricks -------------------------------------------------------- */

        doPlay(seat, ids) {
            const combo = this.validPlay(seat, ids);
            if (!combo) return false;

            const s = this.seats[seat];
            const cards = ids.map((id) => s.cards.find((c) => c.id === id));
            s.cards = s.cards.filter((c) => !ids.includes(c.id));
            this.plays[seat]++;
            this.opening = false;

            this.trick = { by: seat, combo, cards };
            this.emit('play', { seat, cards, combo, left: s.cards.length });

            if (!s.cards.length) { this.winner = seat; this.over = true; return true; }
            if (s.cards.length === 1) this.emit('lastCard', { seat });

            this.advance(seat);
            return true;
        }

        doPass(seat) {
            this.passed.add(seat);
            this.seats[seat].passed = true;
            this.emit('pass', { seat });
            this.advance(seat);
            return true;
        }

        /**
         * Next seat still in the trick. A seat that has passed is skipped for
         * the rest of it; when the walk comes back round to whoever last
         * played, everyone else is out and the trick is over.
         */
        advance(from) {
            for (let n = 1; n <= SEATS; n++) {
                const i = (from + n) % SEATS;
                if (this.trick && i === this.trick.by) break;
                if (!this.passed.has(i)) { this.turn = i; return; }
            }
            const lead = this.trick ? this.trick.by : this.turn;
            this.trick = null;
            this.passed.clear();
            for (const s of this.seats) s.passed = false;
            this.turn = lead;
            this.emit('trickEnd', { lead });
        }

        /* ---- settling ---------------------------------------------------------- */

        /**
         * Each loser pays for the cards still in their hand and the winner
         * collects. Nobody is taken below zero, so what the winner takes is
         * what the table could actually pay.
         */
        settleCoins() {
            const owed = this.seats.map((s, i) => (i === this.winner ? 0 : s.cards.length * this.stake));
            let pot = 0;
            for (let i = 0; i < SEATS; i++) {
                if (i === this.winner) continue;
                const paid = Math.min(owed[i], this.seats[i].coins);
                this.seats[i].net = -paid;
                this.seats[i].coins -= paid;
                pot += paid;
            }
            this.seats[this.winner].net = pot;
            this.seats[this.winner].coins += pot;
            return owed;
        }

        result() {
            if (this.cached) return this.cached;
            const owed = this.settleCoins();

            const rows = this.seats.map((s, i) => {
                const won = i === this.winner;
                return {
                    seat: i,
                    name: s.name,
                    coins: s.net,
                    stake: owed[i],
                    score: won ? Math.min(500, 40 + this.plays[i] * 20) : 0,
                    ratio: won ? 1 : -s.cards.length,
                    outcome: won ? 'win' : 'loss',
                    note: won ? t('b2.wentOut') : t('b2.cardsLeft', { n: s.cards.length }),
                    hands: s.cards.length ? [{ cards: s.cards.slice(), total: null, bet: 0, payout: 0 }] : [],
                    extra: {
                        b2Rounds: 1,
                        b2Wins: won ? 1 : 0,
                        b2Clean: (won && this.cardsLeftElsewhere() === (SEATS - 1) * HAND) ? 1 : 0,
                        b2Straights: this.made[i].STRAIGHT || 0,
                        b2Flushes: this.made[i].FLUSH || 0,
                        b2Houses: this.made[i].FULL_HOUSE || 0,
                        b2Quads: this.made[i].FOUR_OF_A_KIND || 0,
                        b2StraightFlushes: this.made[i].STRAIGHT_FLUSH || 0,
                        forfeits: 0,
                    },
                };
            });

            // Best placing is the winner, then whoever is holding least.
            rows.sort((a, b) => b.ratio - a.ratio);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { place = idx + 1; last = r.ratio; } r.rank = place; });

            this.cached = new CV.GameResult({
                ranks: rows,
                detail: t('b2.detail', {
                    name: this.seats[this.winner].name,
                    n: this.seats.reduce((n, s) => n + s.cards.length, 0),
                }),
            });
            return this.cached;
        }

        /** Cards still held by everyone but the winner — a clean sweep is 39. */
        cardsLeftElsewhere() {
            return this.seats.reduce((n, s, i) => n + (i === this.winner ? 0 : s.cards.length), 0);
        }

        /** Five-card hands each seat has actually put down, for the stats page. */
        get made() {
            if (!this._made) {
                this._made = [0, 1, 2, 3].map(() => ({}));
                for (const ev of this.events) {
                    if (ev.type !== 'play' || ev.combo.size !== 5) continue;
                    const box = this._made[ev.seat];
                    box[ev.combo.type] = (box[ev.combo.type] || 0) + 1;
                }
            }
            return this._made;
        }

        /* ---- state -------------------------------------------------------------- */

        snapshot() {
            return Object.assign(super.snapshot(), {
                opening: this.opening,
                passed: [...this.passed],
                trick: this.trick && {
                    by: this.trick.by,
                    combo: this.trick.combo,
                    cards: this.trick.cards.slice(),
                },
            });
        }

        /** Everyone's hand but yours is a count. */
        redactSeat(seat, index, viewer) {
            if (index === viewer) return seat;
            return Object.assign({}, seat, { cards: seat.cards.map(() => null) });
        }
    }

    CV.BigTwoEngine = BigTwoEngine;
    CV.BigTwoOpener = isOpener;
})();
