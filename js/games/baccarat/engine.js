/**
 * CardVerse — 百家乐 (Baccarat).
 *
 * Punto banco, the version every casino deals: **nobody makes a playing
 * decision.** You choose a side and a stake, and from there the third-card
 * rules are mechanical — the Player hand draws or stands by a fixed table,
 * then the Banker hand draws or stands by a longer one that depends on what
 * the Player drew. That is the whole game, and its appeal: pure nerve.
 *
 * So this engine has one decision phase (the wager) and then resolves itself.
 * There is no `playing` phase, no hit, no stand.
 *
 * Rules as configured: eight-deck shoe, Banker pays 1:1 less 5% commission,
 * Player pays 1:1, Tie pays 8:1 and pushes the other two.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;

    /** Baccarat pip values: aces 1, faces and tens 0, everything else itself. */
    const pip = (card) => (card.r >= 10 && card.r <= 13) ? 0 : (card.r === 14 ? 1 : card.r);

    /** A hand's total is the last digit of the sum. 7 + 8 is 5, not 15. */
    const total = (cards) => cards.reduce((n, c) => n + pip(c), 0) % 10;

    const SIDES = ['player', 'banker', 'tie'];

    class BaccaratEngine extends CV.GameEngine {

        static get publicConfig() {
            return ['room', 'decks', 'commission', 'tiePays'];
        }

        static get defaults() {
            return {
                room: 'beginner',
                decks: 8,
                commission: 0.05,   // taken from a winning Banker bet
                tiePays: 8,
                penetration: 0.75,
                shoe: null,
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

            this.player = [];      // the Player hand — shared by the whole table
            this.banker = [];
            this.cached = null;
            this.outcome = null;   // 'player' | 'banker' | 'tie'

            for (const seat of this.seats) {
                seat.startCoins = seat.coins;
                seat.net   = 0;
                seat.bet   = 0;
                seat.side  = null;
                seat.payout = 0;
                seat.outcome = null;
                seat.out   = seat.coins < this.minBet;
            }
        }

        get shoeState() { return this.shoe.snapshot(); }

        nextSeat(from) {
            for (let i = from + 1; i < this.seats.length; i++) if (!this.seats[i].out) return i;
            return -1;
        }
        firstSeat() { return this.nextSeat(-1); }

        draw() { return this.shoe.draw(); }

        playerTotal() { return total(this.player); }
        bankerTotal() { return total(this.banker); }

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
            if (this.over || seat !== this.turn || this.phase !== 'betting') return [];
            const s = this.seats[seat];
            if (!s || s.out) return [];
            const max = Math.min(this.maxBet, s.coins);
            if (max < this.minBet) return [];
            return SIDES.map((side) => ({
                type: 'wager', side, min: this.minBet, max,
                label: t('bac.' + side),
            }));
        }

        handle(action) {
            if (action.type !== 'wager') return false;
            const s = this.seats[action.seat];
            s.side   = action.side;
            s.bet    = Math.round(action.amount);
            s.coins -= s.bet;
            s.net   -= s.bet;
            this.emit('wager', { seat: action.seat, side: s.side, amount: s.bet });

            const next = this.nextSeat(action.seat);
            if (next >= 0) { this.turn = next; this.emit('betting', { seat: next }); return true; }
            this.deal();
            return true;
        }

        /* ---- the deal, which decides itself ------------------------------- */

        deal() {
            this.phase = 'dealing';
            this.turn  = -1;

            for (let i = 0; i < 2; i++) {
                this.player.push(this.draw());
                this.emit('card', { hand: 'player', card: this.player[this.player.length - 1] });
                this.banker.push(this.draw());
                this.emit('card', { hand: 'banker', card: this.banker[this.banker.length - 1] });
            }

            const p = this.playerTotal();
            const b = this.bankerTotal();

            // A natural ends it before any drawing rule applies.
            if (p >= 8 || b >= 8) {
                this.emit('natural', { player: p, banker: b });
                return this.settle();
            }

            // The Player hand goes first, and its third card is what the
            // Banker's own rule is written against.
            let third = null;
            if (p <= 5) {
                third = this.draw();
                this.player.push(third);
                this.emit('card', { hand: 'player', card: third, third: true });
            }

            if (this.bankerDraws(this.bankerTotal(), third)) {
                const card = this.draw();
                this.banker.push(card);
                this.emit('card', { hand: 'banker', card, third: true });
            }

            this.settle();
        }

        /**
         * The Banker's drawing table — the one rule in baccarat anybody has to
         * look up. `third` is the Player's third card, or null if it stood.
         *
         *   Player stood      → draw on 0-5, stand on 6-7
         *   Banker 0-2        → draw
         *   Banker 3          → draw on a third card of 0-7, stand on 8-9
         *   Banker 4          → draw on 2-7
         *   Banker 5          → draw on 4-7
         *   Banker 6          → draw on 6-7
         *   Banker 7          → stand
         *   Banker 8-9        → natural, never reaches here
         *
         * Note on the Banker-3 row: this is the house table as specified, and
         * it differs from the casino standard, where a Banker 3 *does* draw
         * against a player third card of 9 and stands only on 8. Deliberate —
         * do not "fix" it back without asking.
         */
        bankerDraws(b, third) {
            if (third === null) return b <= 5;      // same rule the Player used
            const v = pip(third);                    // 10/J/Q/K are 0, A is 1
            if (b <= 2) return true;
            if (b === 3) return v <= 7;
            if (b === 4) return v >= 2 && v <= 7;
            if (b === 5) return v >= 4 && v <= 7;
            if (b === 6) return v === 6 || v === 7;
            return false;                            // 7 stands
        }

        /* ---- settlement --------------------------------------------------- */

        settle() {
            const p = this.playerTotal();
            const b = this.bankerTotal();
            this.outcome = p > b ? 'player' : b > p ? 'banker' : 'tie';
            this.emit('reveal', { player: p, banker: b, outcome: this.outcome });

            for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                const s = this.seats[i];
                let payout = 0;
                let result = 'loss';

                if (s.side === this.outcome) {
                    result = 'win';
                    if (s.side === 'banker') payout = s.bet * (2 - this.config.commission);
                    else if (s.side === 'tie') payout = s.bet * (1 + this.config.tiePays);
                    else payout = s.bet * 2;
                } else if (this.outcome === 'tie' && s.side !== 'tie') {
                    // A tie returns the Player and Banker stakes untouched.
                    result = 'push';
                    payout = s.bet;
                }

                s.payout  = Math.round(payout);
                s.outcome = result;
                s.coins  += s.payout;
                s.net    += s.payout;
                this.emit('paid', { seat: i, outcome: result, payout: s.payout });
            }
            this.finish();
        }

        result() {
            if (this.cached) return this.cached;
            const p = this.playerTotal();
            const b = this.bankerTotal();

            const rows = [];
            for (let i = this.firstSeat(); i >= 0; i = this.nextSeat(i)) {
                const s = this.seats[i];
                rows.push({
                    seat: i,
                    name: s.name,
                    coins: s.net,
                    stake: s.bet,
                    score: s.side === 'banker' ? b : p,
                    outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                    note: t('bac.' + s.side),
                    ratio: s.bet ? Math.round((s.net / s.bet) * 1000) / 1000 : 0,
                    // Everyone shares the two hands, so the recap shows the side
                    // each seat backed rather than a hand of its own.
                    hands: [{
                        cards: (s.side === 'banker' ? this.banker : this.player).slice(),
                        bet: s.bet, payout: s.payout, outcome: s.outcome,
                        total: s.side === 'banker' ? b : p,
                    }],
                    extra: {
                        bacPlayer: s.side === 'player' ? 1 : 0,
                        bacBanker: s.side === 'banker' ? 1 : 0,
                        bacTie:    s.side === 'tie' ? 1 : 0,
                        bacTieHit: (this.outcome === 'tie' && s.side === 'tie') ? 1 : 0,
                    },
                });
            }

            rows.sort((a, b2) => b2.ratio - a.ratio || b2.coins - a.coins);
            let rank = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { rank = idx + 1; last = r.ratio; } r.rank = rank; });

            this.cached = new CV.GameResult({
                ranks: rows,
                detail: t('bac.detail', { p, b, side: t('bac.' + this.outcome) }),
            });
            return this.cached;
        }

        snapshot() {
            return Object.assign(super.snapshot(), {
                player: this.player.slice(),
                banker: this.banker.slice(),
                outcome: this.outcome,
                shoeRemaining: this.shoe.remaining,
            });
        }

        /**
         * Both hands are dealt face up in baccarat, so there is nothing on the
         * table to hide — the base class dropping the RNG is the whole job.
         * The wager each *other* seat placed is hidden until the deal, though:
         * seeing where the table's money went before betting is information
         * nobody at a real table has in time to use.
         */
        redactSeat(seat, index, viewer) {
            if (this.phase !== 'betting' || index === viewer) return seat;
            return Object.assign({}, seat, { side: seat.side ? 'hidden' : null });
        }
    }

    CV.BaccaratEngine = BaccaratEngine;
    CV.BaccaratTotal  = total;
})();
