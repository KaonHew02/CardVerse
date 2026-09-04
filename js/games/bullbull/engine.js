/**
 * CardVerse — 斗牛.
 *
 * Everybody bets, everybody gets five cards including the dealer, and every
 * seat is settled against the dealer alone. There is nothing to decide after
 * the bet — which is the game, not an omission.
 *
 * **Reading a hand and pricing it are two jobs.** `hands.js` says what five
 * cards are; this file says what that is worth against the dealer's five and
 * moves the coins. The rules ask for that split and it is worth keeping: the
 * multiplier table can be retuned without going near the evaluator.
 *
 * On the settlement: the rules give the payout as `bet × hand multiplier`
 * and show it from the winner's side. The same multiplier is applied when the
 * dealer is the one who wins, because a table where a player can win five
 * times the bet and never lose more than it is not a table — it is a gift.
 *
 * Virtual coins only, and no seat is taken below zero.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;
    const H = CV.BullHands;

    const CARDS = 5;

    class BullBullEngine extends CV.GameEngine {

        static get code() { return 'bullbull'; }
        static get publicConfig() { return ['room', 'decks']; }

        static get defaults() { return { room: 'beginner', decks: 1, shoe: null }; }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.minBet = room.bet[0];
            this.maxBet = room.bet[1];

            this.deck = new Deck(this.rng, { decks: this.config.decks });
            if (this.config.shoe) this.deck.restore(this.config.shoe);
            else this.deck.shuffle();

            this.dealer = { cards: [], hand: null };
            this.cached = null;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.bet = 0;
                s.cards = [];
                s.hand = null;
                s.payout = 0;
                s.outcome = null;
                s.out = s.coins < this.minBet;
            }
        }

        /** A fresh pack every hand — five cards each runs a 52-card deck down fast. */
        get shoeState() { return null; }

        nextSeat(from) {
            for (let i = from + 1; i < this.seats.length; i++) if (!this.seats[i].out) return i;
            return -1;
        }

        /* ---- betting ------------------------------------------------------- */

        start() {
            this.deck.reset();
            this.round = 1;
            this.phase = 'betting';
            this.turn = this.nextSeat(-1);
            if (this.turn < 0) { this.over = true; this.phase = 'over'; return; }
            this.emit('betting', { seat: this.turn });
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn || this.phase !== 'betting') return [];
            const s = this.seats[seat];
            if (!s || s.out) return [];
            const max = Math.min(this.maxBet, s.coins);
            if (max < this.minBet) return [];
            return [{ type: 'bet', min: this.minBet, max, label: t('act.bet') }];
        }

        handle(action) {
            if (action.type !== 'bet') return false;
            const s = this.seats[action.seat];
            s.bet = Math.round(action.amount);
            s.coins -= s.bet;
            s.net -= s.bet;
            this.emit('bet', { seat: action.seat, amount: s.bet });

            const next = this.nextSeat(action.seat);
            if (next >= 0) { this.turn = next; this.emit('betting', { seat: next }); return true; }
            this.deal();
            return true;
        }

        /* ---- the deal, which decides itself --------------------------------- */

        deal() {
            this.phase = 'dealing';
            this.turn = -1;

            // Round by round, the way they come off the pack at a real table.
            for (let k = 0; k < CARDS; k++) {
                for (const s of this.seats) if (!s.out) s.cards.push(this.deck.draw());
                this.dealer.cards.push(this.deck.draw());
            }
            for (const s of this.seats) if (!s.out) s.hand = H.evaluate(s.cards);
            this.dealer.hand = H.evaluate(this.dealer.cards);
            this.emit('deal', { dealer: this.dealer.cards.slice() });

            this.settle();
        }

        /**
         * Every seat against the dealer, and nobody against anybody else.
         * The winner's multiplier sets the size of the swing; a tie returns
         * the bet untouched.
         */
        settle() {
            const d = this.dealer.hand;
            for (const s of this.seats) {
                if (s.out) continue;
                const cmp = H.compare(s.hand, d);
                if (cmp > 0) {
                    s.outcome = 'win';
                    s.payout = s.bet + s.bet * s.hand.mult;
                } else if (cmp < 0) {
                    s.outcome = 'loss';
                    // Never more than was put up, so a seat cannot go negative
                    // on a hand it has already paid for.
                    const owed = Math.min(s.bet * d.mult, s.bet + s.coins);
                    s.payout = s.bet - owed;
                } else {
                    s.outcome = 'push';
                    s.payout = s.bet;
                }
                s.coins += s.payout;
                s.net += s.payout;
                this.emit('settled', { seat: s.index, outcome: s.outcome, payout: s.payout });
            }
            this.phase = 'over';
            this.finish();
        }

        /* ---- the result ------------------------------------------------------ */

        result() {
            if (this.cached) return this.cached;
            const d = this.dealer.hand;

            const rows = [];
            for (const s of this.seats) {
                if (s.out) continue;
                const win = s.outcome === 'win';
                rows.push({
                    seat: s.index,
                    name: s.name,
                    coins: s.net,
                    stake: s.bet,
                    score: win ? Math.min(500, s.hand.mult * 60) : 0,
                    ratio: s.bet ? Math.round((s.net / s.bet) * 1000) / 1000 : 0,
                    outcome: s.outcome,
                    note: this.handName(s.hand) + ' · ' + t('bb.times', { n: s.hand.mult }),
                    hands: [{ cards: s.cards.slice(), total: null, bet: s.bet, payout: Math.max(0, s.payout) }],
                    extra: {
                        bbRounds: 1,
                        bbWins: win ? 1 : 0,
                        bbBull: s.hand.type === 'BULL_BULL' ? 1 : 0,
                        bbBaby: s.hand.type === 'BABY' ? 1 : 0,
                        bbPicAce: s.hand.type === 'PIC_BLACK_ACE' ? 1 : 0,
                        bbFivePic: s.hand.type === 'FIVE_PIC' ? 1 : 0,
                        bbNoBull: s.hand.type === 'NO_BULL' ? 1 : 0,
                        forfeits: 0,
                    },
                });
            }

            // The dealer sits in the table at a return of zero, so a winner
            // ranks above it and a loser below.
            rows.push({
                seat: -1, name: t('table.dealer'), house: true,
                coins: -rows.reduce((n, r) => n + r.coins, 0),
                ratio: 0, score: 0, outcome: 'house',
                note: this.handName(d) + ' · ' + t('bb.times', { n: d.mult }),
                hands: [{ cards: this.dealer.cards.slice(), total: null, bet: 0, payout: 0 }],
                extra: {},
            });

            rows.sort((a, b) => b.ratio - a.ratio || b.coins - a.coins);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { place = idx + 1; last = r.ratio; } r.rank = place; });

            this.cached = new CV.GameResult({
                ranks: rows,
                detail: t('bb.detail', { hand: this.handName(d) }),
            });
            return this.cached;
        }

        /** "宝宝·牛六", "牛八", "五个 Pic" — what the hand is called. */
        handName(hand) {
            if (!hand) return '';
            if (hand.type === 'BABY') return t('bb.baby', { n: t('bb.bull' + hand.bull) });
            if (hand.type === 'BULL_BULL') return t('bb.bull0');
            if (hand.type === 'NO_BULL') return t('bb.noBull');
            if (hand.type.startsWith('BULL_')) return t('bb.bull' + hand.bull);
            return t('bb.' + hand.type);
        }

        /* ---- state ------------------------------------------------------------ */

        snapshot() {
            return Object.assign(super.snapshot(), {
                dealer: { cards: this.dealer.cards.slice(), hand: this.dealer.hand },
                shoeRemaining: this.deck.remaining,
            });
        }

        /** Nothing is face down once it is dealt; before that there is nothing. */
        snapshotFor(viewer) {
            const view = super.snapshotFor(viewer);
            view.dealer = {
                cards: this.phase === 'betting' ? [] : this.dealer.cards.slice(),
                hand: this.phase === 'betting' ? null : this.dealer.hand,
            };
            return view;
        }

        /** A seat's bet is its own until the cards are out. */
        redactSeat(seat, index, viewer) {
            if (index === viewer || this.phase !== 'betting') return seat;
            return Object.assign({}, seat, { bet: seat.bet ? 'hidden' : 0 });
        }
    }

    CV.BullBullEngine = BullBullEngine;
})();
