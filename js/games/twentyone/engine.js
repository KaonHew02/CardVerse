/**
 * CardVerse — 21.
 *
 * A standalone engine, written to the house rules exactly as specified. It
 * shares nothing with any casino variant, and the differences are the point
 * rather than details:
 *
 *   - **There is no natural and no special two-card 21.** A + K is 21. So is
 *     10 + 5 + 6. They are the same hand and pay the same. Nothing pays 3:2.
 *   - **五龙 (Five Dragons)** — exactly five cards totalling 21 or less — beats
 *     every normal hand, including a normal 21, and pays 2:1. Reaching five
 *     cards ends the hand; there is no sixth card.
 *   - **The dealer can make 五龙 too**, and it beats a player's normal hand
 *     the same way.
 *   - No insurance, no split, no surrender.
 *
 * Phases:  betting → playing → dealer → over
 *
 * Every seat's coins live on the seat. A bet leaves `seat.coins` when placed
 * and the payout returns to it, so `seat.net` is the honest figure for the
 * round and rewards.js reads it. The engine never touches the profile.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck, handValue } = CV.Cards;

    const FIVE_DRAGONS = 5;

    /**
     * Score one hand.
     *
     * `total` counts an ace as 11 whenever that keeps the hand at 21 or under
     * and as 1 otherwise — `handValue` already does exactly that.
     *
     * `rank` is the comparison key: 五龙 outranks every normal hand, so two
     * hands compare on rank first and total second. That one ordering covers
     * every row of the result table.
     */
    function score(cards) {
        const v = handValue(cards);
        const bust = v.total > 21;
        const dragons = !bust && cards.length >= FIVE_DRAGONS;
        return {
            total: v.total,
            soft: v.soft,
            bust,
            dragons,
            rank: bust ? -1 : (dragons ? 1 : 0),
            cards: cards.length,
        };
    }

    class TwentyOneEngine extends CV.GameEngine {

        /** Safe to put on a wire; `shoe` is deliberately absent. */
        static get publicConfig() {
            return ['room', 'decks', 'dealerStandsOn', 'dragonPays', 'double'];
        }

        static get defaults() {
            return {
                room: 'beginner',
                decks: 1,               // a standard 52-card deck, no jokers
                dealerStandsOn: 17,     // hits on 16 or below
                dragonPays: 2,          // 五龙 wins pay 2:1; a normal win pays 1:1
                double: true,
                penetration: 0.6,
                shoe: null,             // carried between hands at the same table
            };
        }

        constructor(opts) {
            super(opts);
            const room  = CV.Registry.room(this.config.room);
            this.minBet = room.bet[0];
            this.maxBet = room.bet[1];

            this.shoe = new Deck(this.rng, { decks: this.config.decks });
            if (this.config.shoe) this.shoe.restore(this.config.shoe);
            else this.shoe.shuffle();

            this.dealer = { cards: [], revealed: false };
            this.cached = null;

            for (const seat of this.seats) {
                seat.startCoins = seat.coins;
                seat.net    = 0;
                seat.bet    = 0;
                seat.hands  = [];       // always exactly one — there is no split
                seat.active = 0;
                seat.out    = seat.coins < this.minBet;
            }
        }

        /* ---- helpers ------------------------------------------------------ */

        get shoeState() { return this.shoe.snapshot(); }

        nextSeat(from) {
            for (let i = from + 1; i < this.seats.length; i++) if (!this.seats[i].out) return i;
            return -1;
        }
        firstSeat() { return this.nextSeat(-1); }

        draw() { return this.shoe.draw(); }

        hand(seat) { return this.seats[seat].hands[0]; }

        newHand(bet) {
            return { cards: [], bet, done: false, doubled: false, outcome: null, payout: 0 };
        }

        dealerUp()    { return this.dealer.cards[0]; }
        dealerScore() { return score(this.dealer.cards); }

        /* ---- phases ------------------------------------------------------- */

        start() {
            if (this.shoe.penetration > this.config.penetration) {
                this.shoe.reset();
                this.emit('shuffle');
            }
            this.round = 1;
            this.phase = 'betting';
            this.turn  = this.firstSeat();
            if (this.turn < 0) { this.over = true; this.phase = 'over'; return; }
            this.emit('betting', { seat: this.turn });
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];
            const s = this.seats[seat];
            if (!s || s.out) return [];

            if (this.phase === 'betting') {
                const max = Math.min(this.maxBet, s.coins);
                if (max < this.minBet) return [];
                return [{ type: 'bet', min: this.minBet, max, label: t('act.bet') }];
            }

            if (this.phase === 'playing') {
                const h = this.hand(seat);
                if (!h || h.done) return [];
                const out = [
                    { type: 'hit',   label: t('act.hit') },
                    { type: 'stand', label: t('act.stand') },
                ];
                // Double is the opening decision only, and only if the coins
                // are there to match the bet.
                if (this.config.double && h.cards.length === 2 && s.coins >= h.bet) {
                    out.push({ type: 'double', label: t('act.double') });
                }
                return out;
            }
            return [];
        }

        handle(action) {
            switch (action.type) {
                case 'bet':    return this.doBet(action.seat, action.amount);
                case 'hit':    return this.doHit(action.seat);
                case 'stand':  return this.doStand(action.seat);
                case 'double': return this.doDouble(action.seat);
                default:       return false;
            }
        }

        /* ---- betting ------------------------------------------------------ */

        doBet(seat, amount) {
            const s = this.seats[seat];
            amount   = Math.round(amount);
            s.bet    = amount;
            s.coins -= amount;
            s.net   -= amount;
            s.hands  = [this.newHand(amount)];
            s.active = 0;
            this.emit('bet', { seat, amount });

            const next = this.nextSeat(seat);
            if (next >= 0) { this.turn = next; this.emit('betting', { seat: next }); return true; }
            this.deal();
            return true;
        }

        /** Two cards each, the dealer's second face down. */
        deal() {
            this.phase = 'dealing';
            for (let pass = 0; pass < 2; pass++) {
                for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                    const card = this.draw();
                    this.hand(i).cards.push(card);
                    this.emit('deal', { seat: i, card });
                }
                const card = this.draw();
                this.dealer.cards.push(card);
                this.emit('dealerCard', { card: pass === 0 ? card : null, hidden: pass === 1 });
            }
            this.phase = 'playing';
            this.turn  = this.firstSeat();
            this.emit('turn', { seat: this.turn });
        }

        /* ---- playing ------------------------------------------------------ */

        advance(seat) {
            this.turn = this.nextSeat(seat);
            if (this.turn < 0) { this.dealerPlay(); return; }
            this.emit('turn', { seat: this.turn });
        }

        /**
         * One card. Busting ends the hand, and so does reaching five cards
         * without busting — that hand is 五龙 and complete, and the rules are
         * explicit that there is no sixth card.
         */
        doHit(seat) {
            const h = this.hand(seat);
            const card = this.draw();
            h.cards.push(card);
            this.emit('hit', { seat, card });

            const sc = score(h.cards);
            if (sc.bust) {
                h.done = true;
                this.emit('bust', { seat });
                this.advance(seat);
                return true;
            }
            if (sc.dragons) {
                h.done = true;
                this.emit('dragons', { seat, total: sc.total });
                this.advance(seat);
                return true;
            }
            return true;
        }

        doStand(seat) {
            this.hand(seat).done = true;
            this.emit('stand', { seat });
            this.advance(seat);
            return true;
        }

        /** Double the bet, take exactly one card, then stand — win or bust. */
        doDouble(seat) {
            const s = this.seats[seat];
            const h = this.hand(seat);
            s.coins -= h.bet;
            s.net   -= h.bet;
            h.bet   *= 2;
            h.doubled = true;

            const card = this.draw();
            h.cards.push(card);
            h.done = true;
            this.emit('double', { seat, card });
            if (score(h.cards).bust) this.emit('bust', { seat });
            this.advance(seat);
            return true;
        }

        /* ---- dealer ------------------------------------------------------- */

        reveal() {
            if (this.dealer.revealed) return;
            this.dealer.revealed = true;
            this.emit('reveal', { card: this.dealer.cards[1] });
        }

        /** Anyone still standing? If not, the dealer only turns the hole card. */
        anyoneLive() {
            return this.seats.some((s) => !s.out && s.hands.some((h) => !score(h.cards).bust));
        }

        /**
         * Hits on 16 or below, stands on 17 or above — and stops at five cards
         * whatever the total, because that hand is 五龙 and complete.
         */
        dealerPlay() {
            this.phase = 'dealer';
            this.turn  = -1;
            this.reveal();

            if (this.anyoneLive()) {
                let sc = this.dealerScore();
                while (sc.total < this.config.dealerStandsOn && !sc.dragons && !sc.bust) {
                    const card = this.draw();
                    this.dealer.cards.push(card);
                    this.emit('dealerHit', { card });
                    sc = this.dealerScore();
                }
                if (sc.bust) this.emit('dealerBust');
                else if (sc.dragons) this.emit('dealerDragons', { total: sc.total });
            }
            this.settle();
        }

        /* ---- settlement --------------------------------------------------- */

        /**
         * One hand against the dealer's, by the result table:
         *
         *   player bust                → lose
         *   dealer bust, player valid  → win
         *   五龙 vs normal              → 五龙 wins
         *   same category              → higher total wins, equal is a tie
         *
         * `rank` collapses the middle two into a single comparison.
         */
        judge(h, dealer) {
            const p = score(h.cards);
            const win = () => (p.dragons
                ? { outcome: 'dragons', payout: h.bet * (1 + this.config.dragonPays) }
                : { outcome: 'win',     payout: h.bet * 2 });

            if (p.bust)      return { outcome: 'bust', payout: 0 };
            if (dealer.bust) return win();

            if (p.rank > dealer.rank) return win();
            if (p.rank < dealer.rank) return { outcome: 'loss', payout: 0 };

            if (p.total > dealer.total) return win();
            if (p.total < dealer.total) return { outcome: 'loss', payout: 0 };
            return { outcome: 'push', payout: h.bet };
        }

        settle() {
            const dealer = this.dealerScore();
            for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                const s = this.seats[i];
                const h = s.hands[0];
                const r = this.judge(h, dealer);
                h.outcome = r.outcome;
                h.payout  = Math.round(r.payout);
                s.coins  += h.payout;
                s.net    += h.payout;
                this.emit('handResult', { seat: i, outcome: r.outcome, payout: h.payout });
            }
            this.finish();
        }

        result() {
            if (this.cached) return this.cached;
            const dealer = this.dealerScore();
            const rows = [];

            for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                const s = this.seats[i];
                const h = s.hands[0];
                const sc = score(h.cards);
                rows.push({
                    seat: i,
                    name: s.name,
                    coins: s.net,
                    stake: h.bet,
                    score: sc.bust ? 0 : sc.total,
                    outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                    note: t('out.' + h.outcome),
                    ratio: h.bet ? Math.round((s.net / h.bet) * 1000) / 1000 : 0,
                    hands: [{
                        cards: h.cards.slice(), bet: h.bet, payout: h.payout,
                        outcome: h.outcome, total: sc.total,
                        doubled: h.doubled, dragons: sc.dragons,
                    }],
                    extra: {
                        dragons:     sc.dragons ? 1 : 0,
                        dragonWins:  h.outcome === 'dragons' ? 1 : 0,
                        busts:       sc.bust ? 1 : 0,
                        doubles:     h.doubled ? 1 : 0,
                        dealerBusts: dealer.bust ? 1 : 0,
                        exact21:     (!sc.bust && sc.total === 21) ? 1 : 0,
                    },
                });
            }

            // The dealer sits in the table at a return of zero, so a winner
            // ranks above it and a loser below.
            rows.push({
                seat: -1, name: t('table.dealer'), house: true,
                coins: -rows.reduce((n, r) => n + r.coins, 0),
                ratio: 0, score: dealer.bust ? 0 : dealer.total,
                outcome: 'house',
                note: dealer.bust ? t('note.dealerBust')
                    : dealer.dragons ? t('out.dragons')
                    : t('note.dealerStands', { n: dealer.total }),
                hands: [{
                    cards: this.dealer.cards.slice(), bet: 0, payout: 0,
                    outcome: dealer.bust ? 'bust' : 'house',
                    total: dealer.total, dragons: dealer.dragons,
                }],
                extra: {},
            });

            rows.sort((a, b) => b.ratio - a.ratio || b.coins - a.coins);
            let rank = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { rank = idx + 1; last = r.ratio; } r.rank = rank; });

            this.cached = new CV.GameResult({
                ranks: rows,
                detail: dealer.bust ? t('detail.dealerBusts')
                    : dealer.dragons ? t('detail.dealerDragons', { n: dealer.total })
                    : t('detail.dealer', { n: dealer.total }),
            });
            return this.cached;
        }

        /* ---- state -------------------------------------------------------- */

        snapshot() {
            return Object.assign(super.snapshot(), {
                dealer: { cards: this.dealer.cards.slice(), revealed: this.dealer.revealed },
                shoeRemaining: this.shoe.remaining,
            });
        }

        /** The hole card is the only concealed thing on this table. */
        snapshotFor(viewer) {
            const view = super.snapshotFor(viewer);
            view.dealer = {
                cards: this.dealer.revealed ? this.dealer.cards.slice() : this.dealer.cards.slice(0, 1),
                revealed: this.dealer.revealed,
                hidden: this.dealer.revealed ? 0 : Math.max(0, this.dealer.cards.length - 1),
            };
            return view;
        }
    }

    CV.TwentyOneEngine = TwentyOneEngine;
    CV.TwentyOneScore  = score;
})();
