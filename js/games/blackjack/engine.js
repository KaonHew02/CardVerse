/**
 * CardVerse — Blackjack.
 *
 * Rules as configured (the `defaults` below): six-deck shoe, dealer stands on
 * all 17s, blackjack pays 3:2, double on any two, double after split, split up
 * to three times, split aces get one card, late surrender, insurance offered
 * on a dealer ace, and the dealer peeks for blackjack before anyone plays —
 * so nobody doubles into a hand that was already lost.
 *
 * Phases:  betting → (insurance) → playing → dealer → over
 *
 * Every seat's coins are on the seat. A bet leaves `seat.coins` when placed
 * and the payout returns to it at the end, so `seat.net` is the honest figure
 * for the round and rewards.js reads it. The engine never sees the profile.
 *
 * 21 (twentyone/) is this engine with the advanced options switched off and
 * one payout rule added; see the subclass at the bottom of that folder.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { Deck, handValue, isBlackjack, pipValue } = CV.Cards;

    class BlackjackEngine extends CV.GameEngine {

        static get defaults() {
            return {
                room: 'beginner',
                decks: 6,
                dealerHitsSoft17: false,
                blackjackPays: 1.5,
                insurance: true,
                surrender: true,
                double: true,
                split: true,
                doubleAfterSplit: true,
                maxSplits: 3,
                penetration: 0.75,
                peek: true,
                exactBonus: 0,        // 21's rule: exact 21 pays this instead of 1:1
                shoe: null,           // carried over from the previous hand
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
            this.seen   = [];          // face-up cards, for AIs that count
            this.cached = null;

            for (const seat of this.seats) {
                seat.startCoins = seat.coins;
                seat.net        = 0;
                seat.bet        = 0;
                seat.hands      = [];
                seat.active     = 0;
                seat.insurance  = 0;
                seat.insured    = null;
                seat.out        = seat.coins < this.minBet;
            }
        }

        /* ---- helpers ------------------------------------------------------ */

        get shoeState() { return this.shoe.snapshot(); }

        nextSeat(from) {
            for (let i = from + 1; i < this.seats.length; i++) {
                if (!this.seats[i].out) return i;
            }
            return -1;
        }

        firstSeat() { return this.nextSeat(-1); }

        draw(faceUp = true) {
            const card = this.shoe.draw();
            if (faceUp) this.seen.push(card);
            return card;
        }

        hand(seat, i) {
            const s = this.seats[seat];
            return s.hands[i === undefined ? s.active : i];
        }

        newHand(bet, fromSplit = false) {
            return { cards: [], bet, done: false, doubled: false, surrendered: false,
                     split: fromSplit, outcome: null, payout: 0 };
        }

        dealerUp()    { return this.dealer.cards[0]; }
        dealerValue() { return handValue(this.dealer.cards); }

        /* ---- phases ------------------------------------------------------- */

        start() {
            if (this.shoe.penetration > this.config.penetration) {
                this.shoe.reset();
                this.seen = [];
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
                return [{ type: 'bet', min: this.minBet, max, label: 'Bet' }];
            }

            if (this.phase === 'insurance') {
                const half = Math.floor(s.bet / 2);
                const out = [{ type: 'noInsure', label: 'No insurance' }];
                if (s.coins >= half && half > 0) out.unshift({ type: 'insure', label: 'Insure', hint: `${half} coins` });
                return out;
            }

            if (this.phase === 'playing') {
                const h = this.hand(seat);
                if (!h || h.done) return [];
                const out = [{ type: 'hit', label: 'Hit' }, { type: 'stand', label: 'Stand' }];
                const first = h.cards.length === 2;
                const canAfford = s.coins >= h.bet;

                if (first && this.config.double && canAfford && (this.config.doubleAfterSplit || !h.split)) {
                    out.push({ type: 'double', label: 'Double' });
                }
                if (first && this.config.split && canAfford
                    && pipValue(h.cards[0]) === pipValue(h.cards[1])
                    && s.hands.length <= this.config.maxSplits) {
                    out.push({ type: 'split', label: 'Split' });
                }
                if (first && this.config.surrender && !h.split && s.hands.length === 1) {
                    out.push({ type: 'surrender', label: 'Surrender' });
                }
                return out;
            }
            return [];
        }

        handle(action) {
            switch (action.type) {
                case 'bet':      return this.doBet(action.seat, action.amount);
                case 'insure':   return this.doInsure(action.seat, true);
                case 'noInsure': return this.doInsure(action.seat, false);
                case 'hit':      return this.doHit(action.seat);
                case 'stand':    return this.doStand(action.seat);
                case 'double':   return this.doDouble(action.seat);
                case 'split':    return this.doSplit(action.seat);
                case 'surrender':return this.doSurrender(action.seat);
                default:         return false;
            }
        }

        /* ---- betting ------------------------------------------------------ */

        doBet(seat, amount) {
            const s = this.seats[seat];
            amount = Math.round(amount);
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

        deal() {
            this.phase = 'dealing';
            for (let pass = 0; pass < 2; pass++) {
                for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                    const card = this.draw();
                    this.seats[i].hands[0].cards.push(card);
                    this.emit('deal', { seat: i, hand: 0, card });
                }
                const up = pass === 0;
                const card = this.draw(up);
                this.dealer.cards.push(card);
                this.emit('dealerCard', { card: up ? card : null, hidden: !up });
            }

            const up = this.dealerUp();
            if (this.config.insurance && up.r === 14) {
                this.phase = 'insurance';
                this.turn  = this.firstSeat();
                this.emit('insuranceOffer', { seat: this.turn });
                return;
            }
            this.afterInsurance();
        }

        /* ---- insurance ---------------------------------------------------- */

        doInsure(seat, yes) {
            const s = this.seats[seat];
            if (yes) {
                const half = Math.floor(s.bet / 2);
                s.insurance = half;
                s.coins    -= half;
                s.net      -= half;
            }
            s.insured = yes;
            this.emit(yes ? 'insured' : 'declinedInsurance', { seat, amount: s.insurance });

            const next = this.nextSeat(seat);
            if (next >= 0) { this.turn = next; this.emit('insuranceOffer', { seat: next }); return true; }
            this.afterInsurance();
            return true;
        }

        /**
         * With every bet and insurance decision in, peek. A dealer blackjack
         * ends the round here; otherwise the first seat plays.
         */
        afterInsurance() {
            const up = this.dealerUp();
            const canPeek = this.config.peek && (up.r === 14 || pipValue(up) === 10);
            if (canPeek && isBlackjack(this.dealer.cards)) {
                this.reveal();
                this.emit('dealerBlackjack');
                this.settle();
                return;
            }
            this.phase = 'playing';
            this.turn  = this.firstSeat();
            this.enterSeat();
        }

        /* ---- playing ------------------------------------------------------ */

        /** Land on a seat: skip hands already resolved (a natural), else wait. */
        enterSeat() {
            while (this.turn >= 0) {
                const s = this.seats[this.turn];
                s.active = 0;
                let waiting = false;
                for (let i = 0; i < s.hands.length; i++) {
                    const h = s.hands[i];
                    if (h.done) continue;
                    if (isBlackjack(h.cards) && !h.split) {
                        h.done = true;
                        this.emit('blackjack', { seat: this.turn, hand: i });
                        continue;
                    }
                    s.active = i;
                    waiting = true;
                    break;
                }
                if (waiting) { this.emit('turn', { seat: this.turn, hand: s.active }); return; }
                this.turn = this.nextSeat(this.turn);
            }
            this.dealerPlay();
        }

        /** After a hand resolves, move within the seat, then along the table. */
        advance(seat) {
            const s = this.seats[seat];
            for (let i = s.active + 1; i < s.hands.length; i++) {
                if (!s.hands[i].done) {
                    s.active = i;
                    if (s.hands[i].cards.length < 2) {
                        const card = this.draw();
                        s.hands[i].cards.push(card);
                        this.emit('deal', { seat, hand: i, card });
                    }
                    this.emit('turn', { seat, hand: i });
                    return;
                }
            }
            this.turn = this.nextSeat(seat);
            this.enterSeat();
        }

        doHit(seat) {
            const h = this.hand(seat);
            const card = this.draw();
            h.cards.push(card);
            this.emit('hit', { seat, hand: this.seats[seat].active, card });
            const v = handValue(h.cards);
            if (v.total > 21) {
                h.done = true;
                this.emit('bust', { seat, hand: this.seats[seat].active });
                this.advance(seat);
            } else if (v.total === 21) {
                h.done = true;
                this.advance(seat);
            }
            return true;
        }

        doStand(seat) {
            const h = this.hand(seat);
            h.done = true;
            this.emit('stand', { seat, hand: this.seats[seat].active });
            this.advance(seat);
            return true;
        }

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
            this.emit('double', { seat, hand: s.active, card });
            if (handValue(h.cards).total > 21) this.emit('bust', { seat, hand: s.active });
            this.advance(seat);
            return true;
        }

        doSplit(seat) {
            const s = this.seats[seat];
            const h = this.hand(seat);
            const second = this.newHand(h.bet, true);
            h.split = true;
            second.cards.push(h.cards.pop());
            s.coins -= h.bet;
            s.net   -= h.bet;
            s.hands.splice(s.active + 1, 0, second);
            this.emit('split', { seat, hand: s.active });

            const card = this.draw();
            h.cards.push(card);
            this.emit('deal', { seat, hand: s.active, card });

            // Split aces: one card each, no further play.
            if (h.cards[0].r === 14) {
                h.done = true;
                const c2 = this.draw();
                second.cards.push(c2);
                second.done = true;
                this.emit('deal', { seat, hand: s.active + 1, card: c2 });
                this.advance(seat);
            } else if (handValue(h.cards).total === 21) {
                h.done = true;
                this.advance(seat);
            } else {
                this.emit('turn', { seat, hand: s.active });
            }
            return true;
        }

        doSurrender(seat) {
            const s = this.seats[seat];
            const h = this.hand(seat);
            h.surrendered = true;
            h.done = true;
            this.emit('surrender', { seat, hand: s.active });
            this.advance(seat);
            return true;
        }

        /* ---- dealer ------------------------------------------------------- */

        reveal() {
            if (this.dealer.revealed) return;
            this.dealer.revealed = true;
            this.seen.push(this.dealer.cards[1]);
            this.emit('reveal', { card: this.dealer.cards[1] });
        }

        /** Anyone still standing? If not the dealer just turns the hole card. */
        anyoneLive() {
            return this.seats.some((s) => !s.out && s.hands.some((h) =>
                !h.surrendered && handValue(h.cards).total <= 21 && !(isBlackjack(h.cards) && !h.split)));
        }

        dealerPlay() {
            this.phase = 'dealer';
            this.turn  = -1;
            this.reveal();
            if (this.anyoneLive()) {
                let v = this.dealerValue();
                while (v.total < 17 || (v.total === 17 && v.soft && this.config.dealerHitsSoft17)) {
                    const card = this.draw();
                    this.dealer.cards.push(card);
                    this.emit('dealerHit', { card });
                    v = this.dealerValue();
                }
                if (v.total > 21) this.emit('dealerBust');
            }
            this.settle();
        }

        /* ---- settlement --------------------------------------------------- */

        /**
         * Decide one hand against the dealer.
         * @returns {{outcome:string, payout:number}} payout is what returns to the stack, stake included
         */
        judge(h, dealer, dealerBJ) {
            const v = handValue(h.cards);
            const natural = isBlackjack(h.cards) && !h.split;

            if (h.surrendered)  return { outcome: 'surrender', payout: h.bet / 2 };
            if (v.total > 21)   return { outcome: 'bust',      payout: 0 };
            if (dealerBJ)       return natural ? { outcome: 'push', payout: h.bet } : { outcome: 'loss', payout: 0 };
            if (natural)        return { outcome: 'blackjack', payout: h.bet * (1 + this.config.blackjackPays) };

            // 21's rule: hitting exactly 21 is a win in its own right.
            if (this.config.exactBonus && v.total === 21) {
                return { outcome: 'twentyone', payout: h.bet * (1 + this.config.exactBonus) };
            }

            if (dealer.total > 21)      return { outcome: 'win',  payout: h.bet * 2 };
            if (v.total > dealer.total) return { outcome: 'win',  payout: h.bet * 2 };
            if (v.total < dealer.total) return { outcome: 'loss', payout: 0 };
            return { outcome: 'push', payout: h.bet };
        }

        settle() {
            const dealer   = this.dealerValue();
            const dealerBJ = isBlackjack(this.dealer.cards);

            for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                const s = this.seats[i];
                if (s.insurance) {
                    const pays = dealerBJ ? s.insurance * 3 : 0;
                    s.coins += pays; s.net += pays;
                    this.emit('insurancePaid', { seat: i, amount: pays });
                }
                for (let k = 0; k < s.hands.length; k++) {
                    const h = s.hands[k];
                    const r = this.judge(h, dealer, dealerBJ);
                    h.outcome = r.outcome;
                    h.payout  = Math.round(r.payout);
                    s.coins  += h.payout;
                    s.net    += h.payout;
                    this.emit('handResult', { seat: i, hand: k, outcome: r.outcome, payout: h.payout });
                }
            }
            this.finish();
        }

        isOver() { return this.over; }

        result() {
            if (this.cached) return this.cached;
            const rows = [];
            for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                const s = this.seats[i];
                const outcomes = s.hands.map((h) => h.outcome);
                const best = Math.max(0, ...s.hands
                    .filter((h) => handValue(h.cards).total <= 21)
                    .map((h) => handValue(h.cards).total));
                rows.push({
                    seat: i,
                    name: s.name,
                    coins: s.net,
                    score: best,
                    outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                    note: outcomes.join(' · '),
                    extra: {
                        blackjacks: outcomes.filter((o) => o === 'blackjack').length,
                        twentyones: outcomes.filter((o) => o === 'twentyone').length,
                        busts:      outcomes.filter((o) => o === 'bust').length,
                        doubles:    s.hands.filter((h) => h.doubled).length,
                        splits:     Math.max(0, s.hands.length - 1),
                        dealerBusts: this.dealerValue().total > 21 ? 1 : 0,
                        surrenders: outcomes.filter((o) => o === 'surrender').length,
                    },
                });
            }
            // Everyone plays the dealer, not each other, so rank by return on
            // stake rather than raw coins — a 500 bet that wins is not a
            // better hand than a 50 bet that wins, and three winners tie.
            const ratio = (r) => {
                const staked = this.seats[r.seat].hands.reduce((n, h) => n + h.bet, 0) + this.seats[r.seat].insurance;
                return staked ? r.coins / staked : 0;
            };
            rows.forEach((r) => { r.ratio = Math.round(ratio(r) * 1000) / 1000; });

            // The house sits in the table at a return of exactly zero, so a
            // winner ranks above it, a push ties it and a loser ranks below —
            // nobody gets a gold medal for losing to the dealer.
            const dv = this.dealerValue();
            rows.push({
                seat: -1, name: 'Dealer', house: true,
                coins: -rows.reduce((n, r) => n + r.coins, 0),
                ratio: 0, score: dv.total > 21 ? 0 : dv.total,
                outcome: 'house', note: dv.total > 21 ? 'bust' : String(dv.total), extra: {},
            });

            rows.sort((a, b) => b.ratio - a.ratio || b.coins - a.coins);
            let rank = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { rank = idx + 1; last = r.ratio; } r.rank = rank; });
            this.cached = new CV.GameResult({
                ranks: rows,
                detail: dv.total > 21 ? 'Dealer busts' : `Dealer ${dv.total}`,
            });
            return this.cached;
        }

        snapshot() {
            return Object.assign(super.snapshot(), {
                dealer: { cards: this.dealer.revealed ? this.dealer.cards : [this.dealer.cards[0]], revealed: this.dealer.revealed },
                shoeRemaining: this.shoe.remaining,
            });
        }
    }

    CV.BlackjackEngine = BlackjackEngine;
})();
