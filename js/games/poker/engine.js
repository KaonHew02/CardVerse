/**
 * CardVerse — Texas Hold'em.
 *
 * Two to nine seats, two hole cards each, five community cards, four betting
 * rounds. The best five of your seven wins, and you may use both hole cards,
 * one, or neither.
 *
 * The parts that are more than bookkeeping:
 *
 *  - **A betting round is over when everyone left has either matched the
 *    current bet or has no chips to match it with.** That is one predicate,
 *    `nextToAct`, and every round-ending case falls out of it — a check
 *    round, a raise that reopens the action, and a table that is all-in.
 *  - **Uncalled chips come back.** If the last bet was never matched, the
 *    excess is returned before the pot is divided, or a player would be paid
 *    out of their own uncalled raise.
 *  - **Side pots.** Every distinct amount a player has put in is a level, and
 *    each level is its own pot contested only by the players who reached it.
 *    A short all-in cannot win chips it never covered.
 *
 * Everything about which hand beats which lives in `hands.js`.
 *
 * On the stack: you sit down with a hundred big blinds or your whole balance,
 * whichever is smaller — the standard cash-game buy-in, and the reason one
 * bad all-in cannot empty an account. Virtual chips only.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;
    const H = CV.PokerHands;

    /** A seat buys in for this many big blinds, or its balance if smaller. */
    const BUY_IN_BB = 100;

    const STREETS = { preflop: 'flop', flop: 'turn', turn: 'river' };

    class PokerEngine extends CV.GameEngine {

        static get code() { return 'poker'; }
        static get publicConfig() { return ['room', 'sb', 'bb']; }

        static get defaults() { return { room: 'beginner', shoe: null }; }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.bb = room.bet[0];
            this.sb = Math.max(1, Math.round(this.bb / 2));
            this.buyIn = this.bb * BUY_IN_BB;

            this.deck  = new Deck(this.rng, { decks: 1 });
            this.board = [];
            this.pot   = 0;               // chips from rounds already closed
            this.currentBet = 0;
            this.minRaise   = this.bb;
            this.pots    = [];            // built at the end: [{ amount, eligible }]
            this.showing = false;         // did it reach a showdown
            this.cached  = null;

            // The button rides from hand to hand on the same channel every
            // other game uses to carry its shoe.
            const carried = this.config.shoe;
            this.dealer = carried && Number.isInteger(carried.dealer)
                ? carried.dealer % this.seats.length : 0;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.hole = [];
                s.stack = 0;
                s.startStack = 0;
                s.bet = 0;          // put in during the current round
                s.committed = 0;    // put in during the whole hand
                s.folded = false;
                s.allIn = false;
                s.acted = false;
                s.won = 0;
                s.hand = null;
                s.lastAction = null;
            }
        }

        /** What the next hand at this table needs to know. */
        get shoeState() { return { dealer: (this.dealer + 1) % this.seats.length }; }

        get live() { return this.seats.filter((s) => !s.out && !s.folded); }

        /* ---- the deal ---------------------------------------------------------- */

        start() {
            const n = this.seats.length;
            this.deck.reset();

            for (const s of this.seats) {
                s.stack = Math.min(s.coins, this.buyIn);
                s.startStack = s.stack;
                s.out = s.stack <= 0;
            }
            const seated = this.seats.filter((s) => !s.out);
            if (seated.length < 2) { this.phase = 'over'; this.over = true; return; }

            // The button, and the blinds to its left. With two seats the same
            // formula puts the button in the big blind, which is what the
            // rules as written say.
            while (this.seats[this.dealer].out) this.dealer = (this.dealer + 1) % n;
            this.sbSeat = this.nextSeated(this.dealer);
            this.bbSeat = this.nextSeated(this.sbSeat);

            this.post(this.sbSeat, this.sb, 'sb');
            this.post(this.bbSeat, this.bb, 'bb');
            this.currentBet = Math.max(this.seats[this.sbSeat].bet, this.seats[this.bbSeat].bet);
            this.minRaise = this.bb;

            for (let k = 0; k < 2; k++) {
                for (const s of this.seats) if (!s.out) s.hole.push(this.deck.draw());
            }
            this.emit('deal', { dealer: this.dealer, sb: this.sbSeat, bb: this.bbSeat });

            this.phase = 'preflop';
            this.round = 1;
            this.turn = this.nextToAct(this.bbSeat);
            if (this.turn < 0) this.closeRound();
            else this.emit('turn', { seat: this.turn });
        }

        nextSeated(from) {
            const n = this.seats.length;
            for (let k = 1; k <= n; k++) {
                const i = (from + k) % n;
                if (!this.seats[i].out) return i;
            }
            return from;
        }

        post(seat, amount, kind) {
            const s = this.seats[seat];
            const put = Math.min(amount, s.stack);
            s.stack -= put;
            s.bet += put;
            s.committed += put;
            if (s.stack === 0) s.allIn = true;
            this.emit('blind', { seat, amount: put, kind });
            return put;
        }

        /* ---- whose turn ---------------------------------------------------------- */

        /**
         * The next seat that still owes the table a decision: it has not acted
         * this round, or it has and someone has raised since. A folded or
         * all-in seat owes nothing. `-1` ends the round.
         */
        nextToAct(from) {
            const n = this.seats.length;
            for (let k = 1; k <= n; k++) {
                const i = (from + k) % n;
                const s = this.seats[i];
                if (s.out || s.folded || s.allIn) continue;
                if (!s.acted || s.bet < this.currentBet) return i;
            }
            return -1;
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];
            if (!STREETS[this.phase] && this.phase !== 'river') return [];
            const s = this.seats[seat];
            if (s.out || s.folded || s.allIn) return [];

            const need = this.currentBet - s.bet;
            const out = [{ type: 'fold', label: t('pk.fold') }];
            if (need <= 0) out.push({ type: 'check', label: t('pk.check') });
            else out.push({ type: 'call', amount: Math.min(need, s.stack), label: t('pk.call') });

            // A raise is stated as the total this seat's bet becomes, so an
            // all-in and a normal raise are the same action.
            const maxTotal = s.bet + s.stack;
            if (maxTotal > this.currentBet) {
                out.push({
                    type: 'raise',
                    min: Math.min(maxTotal, this.currentBet + this.minRaise),
                    max: maxTotal,
                    label: need > 0 ? t('pk.raise') : t('pk.bet'),
                });
            }
            return out;
        }

        handle(action) {
            const s = this.seats[action.seat];
            if (action.type === 'fold')  { s.folded = true;  s.lastAction = 'fold'; }
            else if (action.type === 'check') { s.lastAction = 'check'; }
            else if (action.type === 'call')  { this.put(action.seat, this.currentBet - s.bet); s.lastAction = 'call'; }
            else if (action.type === 'raise') {
                const size = action.amount - this.currentBet;
                this.put(action.seat, action.amount - s.bet);
                // A raise that is not a full raise (a short all-in) still sets
                // the price, but it does not raise the minimum for the rest.
                if (size >= this.minRaise) this.minRaise = size;
                this.currentBet = Math.max(this.currentBet, s.bet);
                s.lastAction = 'raise';
            } else return false;

            s.acted = true;
            this.emit('act', {
                seat: action.seat, action: s.lastAction,
                amount: s.bet, stack: s.stack, allIn: s.allIn,
            });

            if (this.live.length <= 1) { this.endHand(false); return true; }
            const next = this.nextToAct(action.seat);
            if (next < 0) this.closeRound();
            else { this.turn = next; this.emit('turn', { seat: next }); }
            return true;
        }

        put(seat, amount) {
            const s = this.seats[seat];
            const give = Math.max(0, Math.min(amount, s.stack));
            s.stack -= give;
            s.bet += give;
            s.committed += give;
            if (s.stack === 0) s.allIn = true;
            return give;
        }

        /* ---- streets ------------------------------------------------------------- */

        /** Sweep the round's bets into the pot and move on. */
        closeRound() {
            for (const s of this.seats) { this.pot += s.bet; s.bet = 0; s.acted = false; }
            this.currentBet = 0;
            this.minRaise = this.bb;
            this.emit('pot', { pot: this.pot });

            if (this.live.length <= 1) return this.endHand(false);

            let phase = this.phase;
            for (;;) {
                if (phase === 'river') return this.endHand(true);
                phase = STREETS[phase];
                this.dealStreet(phase);
                this.phase = phase;
                // Nobody left with chips to bet: run the rest of the board out
                // and go straight to the showdown.
                const canAct = this.seats.filter((s) => !s.out && !s.folded && !s.allIn);
                if (canAct.length < 2) continue;
                this.turn = this.nextToAct(this.dealer);
                if (this.turn < 0) continue;
                this.emit('turn', { seat: this.turn });
                return;
            }
        }

        dealStreet(phase) {
            this.deck.draw();                                   // the burn card
            const n = phase === 'flop' ? 3 : 1;
            const cards = [];
            for (let i = 0; i < n; i++) cards.push(this.deck.draw());
            this.board.push(...cards);
            this.emit('street', { phase, cards, board: this.board.slice() });
        }

        /* ---- the end ------------------------------------------------------------- */

        /**
         * Chips nobody matched come back before anything is divided. Without
         * this a player can be paid out of their own uncalled raise.
         */
        returnUncalled() {
            const sorted = this.seats.map((s) => s.committed).slice().sort((a, b) => b - a);
            if (sorted.length < 2 || sorted[0] <= sorted[1]) return;
            const back = sorted[0] - sorted[1];
            const s = this.seats.find((x) => x.committed === sorted[0]);
            s.stack += back;
            s.committed -= back;
            this.pot -= back;
            this.emit('returned', { seat: s.index, amount: back });
        }

        /**
         * One pot per distinct amount anyone put in. A player who is all-in
         * for less contests only the levels they actually reached.
         */
        buildPots() {
            const contrib = this.seats.map((s) => s.committed);
            const levels = [...new Set(contrib.filter((c) => c > 0))].sort((a, b) => a - b);
            const pots = [];
            let prev = 0;
            for (const L of levels) {
                let amount = 0;
                const eligible = [];
                this.seats.forEach((s, i) => {
                    amount += Math.max(0, Math.min(contrib[i], L) - prev);
                    if (contrib[i] >= L && !s.folded && !s.out) eligible.push(i);
                });
                if (amount > 0) pots.push({ amount, eligible });
                prev = L;
            }
            // Levels with the same set of claimants are one pot to a player.
            const merged = [];
            for (const p of pots) {
                const last = merged[merged.length - 1];
                if (last && last.eligible.join() === p.eligible.join()) last.amount += p.amount;
                else merged.push(p);
            }
            return merged;
        }

        endHand(showdown) {
            if (this.over) return;
            this.showing = !!showdown && this.live.length > 1;
            this.returnUncalled();
            this.pot = this.seats.reduce((n, s) => n + s.committed, 0);

            for (const s of this.seats) {
                if (s.out || s.folded) continue;
                s.hand = H.evaluate(s.hole.concat(this.board));
            }

            this.pots = this.buildPots();
            for (const pot of this.pots) {
                const claim = pot.eligible.length ? pot.eligible : this.live.map((s) => s.index);
                pot.winners = this.bestOf(claim);
                const share = Math.floor(pot.amount / pot.winners.length);
                let odd = pot.amount - share * pot.winners.length;
                // An indivisible chip goes to the first winner clockwise from
                // the button, which is the fixed table order the rules ask for.
                const order = pot.winners.slice().sort((a, b) =>
                    ((a - this.dealer + this.seats.length) % this.seats.length)
                    - ((b - this.dealer + this.seats.length) % this.seats.length));
                for (const i of order) {
                    const take = share + (odd > 0 ? 1 : 0);
                    if (odd > 0) odd--;
                    this.seats[i].stack += take;
                    this.seats[i].won += take;
                }
            }

            for (const s of this.seats) {
                s.net = s.stack - s.startStack;
                s.coins = s.startCoins + s.net;
            }
            this.emit('showdown', { showdown: this.showing, pots: this.pots, board: this.board.slice() });
            this.phase = 'over';
            this.finish();
        }

        /** Whose cards may be looked at once the hand is over. */
        shown(i) {
            const s = this.seats[i];
            if (s.out) return false;
            if (i === this.youSeat) return true;
            return this.showing && !s.folded;
        }

        /** Seats holding the best hand among `list`, all of them if they tie. */
        bestOf(list) {
            const rated = list.filter((i) => this.seats[i].hand);
            if (!rated.length) return list.slice(0, 1);
            let best = [rated[0]];
            for (const i of rated.slice(1)) {
                const d = H.compare(this.seats[i].hand, this.seats[best[0]].hand);
                if (d > 0) best = [i];
                else if (d === 0) best.push(i);
            }
            return best;
        }

        result() {
            if (this.cached) return this.cached;

            const rows = this.seats.map((s, i) => ({
                seat: i,
                name: s.name,
                coins: s.net,
                stake: s.committed,
                score: s.won ? Math.min(500, Math.round((s.won / Math.max(1, this.bb)) * 10)) : 0,
                ratio: s.committed ? Math.round((s.net / s.committed) * 1000) / 1000 : 0,
                outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                // A hand that never reached a showdown is not turned up,
                // the winner's included. Your own cards are always yours.
                note: s.out ? t('pk.satOut')
                    : s.folded ? t('pk.folded')
                    : this.shown(i) ? H.describe(s.hand) : t('pk.mucked'),
                hands: (s.out || !this.shown(i)) ? [] : [{
                    cards: s.hole.slice(), total: null, bet: s.committed, payout: s.won,
                }],
                extra: {
                    pkHands: 1,
                    pkWins: s.won > 0 ? 1 : 0,
                    pkShowdowns: this.showing && !s.folded ? 1 : 0,
                    pkFolds: s.folded ? 1 : 0,
                    pkAllIns: (s.allIn && !s.folded) ? 1 : 0,
                    pkBig: (s.hand && s.hand.cat >= H.CAT.FLUSH && this.showing) ? 1 : 0,
                    pkRoyal: (s.hand && s.hand.cat === H.CAT.ROYAL_FLUSH && this.showing) ? 1 : 0,
                    forfeits: 0,
                },
            }));

            rows.sort((a, b) => b.coins - a.coins);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.coins !== last) { place = idx + 1; last = r.coins; } r.rank = place; });

            const top = this.pots.length ? this.pots[this.pots.length - 1] : null;
            this.cached = new CV.GameResult({
                ranks: rows,
                detail: this.showing && top
                    ? t('pk.detailShow', {
                        name: top.winners.map((i) => this.seats[i].name).join(', '),
                        hand: H.describe(this.seats[top.winners[0]].hand),
                    })
                    : t('pk.detailFold', { n: this.pot }),
            });
            return this.cached;
        }

        /* ---- state --------------------------------------------------------------- */

        snapshot() {
            return Object.assign(super.snapshot(), {
                board: this.board.slice(),
                pot: this.pot,
                currentBet: this.currentBet,
                minRaise: this.minRaise,
                dealer: this.dealer, sbSeat: this.sbSeat, bbSeat: this.bbSeat,
                showing: this.showing,
                pots: this.pots,
            });
        }

        /** Hole cards belong to their owner until the showdown turns them up. */
        redactSeat(seat, index, viewer) {
            if (index === viewer) return seat;
            const shown = this.showing && !seat.folded && !seat.out;
            return Object.assign({}, seat, {
                hole: shown ? seat.hole.slice() : seat.hole.map(() => null),
                hand: shown ? seat.hand : null,
            });
        }
    }

    CV.PokerEngine = PokerEngine;
    CV.PokerBuyIn = BUY_IN_BB;
})();
