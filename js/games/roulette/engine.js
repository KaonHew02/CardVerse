/**
 * CardVerse — 轮盘 (Roulette).
 *
 * Seats cover the layout in turn, then one ball settles every bet at the
 * table at once. That is the shape of the real game: nobody here is playing
 * against anybody else, everyone is playing against the wheel, and the same
 * pocket pays all of them or none of them.
 *
 * **The number is drawn when the wheel is spun and not one moment before.**
 * `spin()` takes it from the table's own stream after the last seat has said
 * it is done, so there is nothing for a view to leak and no way for a bet to
 * be quietly matched against a number that already exists. Until then
 * `number` is null, including in every snapshot that goes out.
 *
 * **Stakes come off the moment a chip is placed**, not when the wheel turns,
 * so a seat can never cover more of the layout than it can afford. Clearing
 * hands all of it straight back.
 *
 * The pockets, the prices, and the rule that zero takes the outside bets all
 * live in wheel.js. Nothing about the odds is decided here.
 *
 * Virtual coins only — no purchase, top-up or cash-out, in either direction.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const W = CV.Wheel;

    class RouletteEngine extends CV.GameEngine {

        static get publicConfig() { return ['room']; }

        static get defaults() { return { room: 'beginner' }; }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.minBet = room.bet[0];
            this.maxBet = room.bet[1];

            this.number = null;    // the pocket, once the ball has settled
            this.cached = null;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net    = 0;
                s.bets   = [];     // [{ kind, value, amount, won, back }]
                s.staked = 0;
                s.payout = 0;
                s.done   = false;
                s.out    = s.coins < this.minBet;
            }
        }

        /** Your chair, which is not the same thing as whose turn it is. */
        get seat() { return this.seats[this.youSeat] || this.seats[0]; }

        /** The seat covering the layout right now. */
        get better() { return this.seats[this.turn] || null; }

        get colour() { return this.number === null ? null : W.colourOf(this.number); }

        /* ---- phases ------------------------------------------------------- */

        start() {
            this.round = 1;
            this.phase = 'betting';
            const first = this.seats.findIndex((s) => !s.out);
            if (first < 0) { this.over = true; this.phase = 'over'; return; }
            this.turn = first;
            this.emit('betting', { seat: this.turn });
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn || this.phase !== 'betting') return [];
            const s = this.seats[seat];
            if (!s || s.out || s.done) return [];

            const out = [];
            const max = Math.min(this.maxBet, s.coins);
            if (max >= this.minBet) {
                out.push({ type: 'place', min: this.minBet, max, kinds: W.KINDS, label: t('rl.place') });
            }
            if (s.bets.length) out.push({ type: 'clear', label: t('rl.clear') });
            // Always available: a seat may sit a spin out, and one that has
            // run short of the minimum has nothing else left to do.
            out.push({ type: 'done', label: s.bets.length ? t('rl.spin') : t('rl.pass') });
            return out;
        }

        /**
         * The layout is a combinatorial space — a kind, and for some kinds a
         * value — so there is no affordance per spot for the base class to
         * match against, and its generic field-by-field comparison would
         * refuse every chip. Same pattern as 斗地主 and 麻将:
         * `legalActions` lists what you may do, and this says whether the
         * particular bet in hand is one of them.
         */
        isLegal(seat, action) {
            const at = this.legalActions(seat).find((a) => a.type === action.type);
            if (!at) return false;
            if (action.type !== 'place') return true;
            if (!W.valid(action.bet)) return false;
            const chip = Math.round(action.amount);
            return chip >= at.min && chip <= at.max;
        }

        handle(action) {
            if (action.seat !== undefined && action.seat !== this.turn) return false;
            if (action.type === 'place') return this.place(action.bet, action.amount);
            if (action.type === 'clear') return this.clearBets();
            if (action.type === 'done')  return this.closeSeat();
            return false;
        }

        /* ---- covering the layout ------------------------------------------- */

        /**
         * Put one chip on one spot.
         *
         * Chips already on that spot are added to rather than listed twice, so
         * the table shows one pile per spot the way a real layout does.
         */
        place(bet, amount) {
            if (this.phase !== 'betting') return false;
            const s = this.better;
            if (!s || s.done || !W.valid(bet)) return false;

            const chip = Math.round(amount);
            if (!(chip >= this.minBet) || chip > Math.min(this.maxBet, s.coins)) return false;

            s.coins  -= chip;
            s.net    -= chip;
            s.staked += chip;

            const value = bet.value === undefined ? null : bet.value;
            const key = W.keyOf(bet);
            const at = s.bets.find((b) => W.keyOf(b) === key);
            if (at) at.amount += chip;
            else s.bets.push({ kind: bet.kind, value, amount: chip, won: false, back: 0 });

            this.emit('placed', { seat: this.turn, kind: bet.kind, value, amount: chip });
            return true;
        }

        /** Take it all back. Nothing is risked until the ball drops. */
        clearBets() {
            if (this.phase !== 'betting') return false;
            const s = this.better;
            if (!s || s.done || !s.bets.length) return false;
            s.coins += s.staked;
            s.net   += s.staked;
            s.staked = 0;
            s.bets   = [];
            this.emit('cleared', { seat: this.turn });
            return true;
        }

        /** This seat is finished. When the last one is, the wheel turns. */
        closeSeat() {
            if (this.phase !== 'betting') return false;
            const s = this.better;
            if (!s || s.done) return false;
            s.done = true;
            this.emit('ready', { seat: this.turn, bets: s.bets.length });

            const next = this.seats.findIndex((x, i) => i > this.turn && !x.out && !x.done);
            if (next >= 0) {
                this.turn = next;
                this.emit('betting', { seat: this.turn });
                return true;
            }
            this.spin();
            return true;
        }

        /* ---- the spin ------------------------------------------------------ */

        /** Every pocket equally likely, drawn only once every seat is done. */
        spin() {
            this.phase = 'spinning';
            this.number = W.spin(this.rng);
            this.emit('spin', { number: this.number, colour: W.colourOf(this.number) });
            this.settle();
        }

        /**
         * Pay the table.
         *
         * A winning bet returns its stake alongside its price, which is why
         * the multiplier is `PAYS + 1`: the stake came off when the chip was
         * placed, so paying only the price would quietly keep it.
         */
        settle() {
            for (const s of this.seats) {
                if (s.out) continue;
                let paid = 0;
                for (const b of s.bets) {
                    b.won  = W.wins(b, this.number);
                    b.back = b.won ? b.amount * (W.PAYS[b.kind] + 1) : 0;
                    paid  += b.back;
                }
                s.payout = paid;
                s.coins += paid;
                s.net   += paid;
            }
            this.phase = 'over';
            this.emit('paid', { number: this.number });
            this.finish();
        }

        isOver() { return this.over; }

        /* ---- result --------------------------------------------------------- */

        result() {
            if (this.cached) return this.cached;
            const n = this.number;
            const landed = t('rl.landed', {
                n: n === null ? '?' : n,
                colour: n === null ? '' : t('rl.' + W.colourOf(n)),
            });

            const played = this.seats.filter((s) => !s.out);
            const rows = played.map((s) => {
                const hits = s.bets.filter((b) => b.won).length;
                return {
                    seat: s.index,
                    name: s.name,
                    coins: s.net,
                    stake: s.staked,
                    score: s.payout,
                    ratio: s.staked ? Math.round((s.net / s.staked) * 1000) / 1000 : 0,
                    outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                    note: s.bets.length ? t('rl.note', { n: s.bets.length, hits }) : t('rl.passed'),
                    hands: [],
                    extra: {
                        rlSpins: 1,
                        rlBets: s.bets.length,
                        rlHits: hits,
                        rlStraight: s.bets.filter((b) => b.won && b.kind === 'straight').length,
                        rlZero: n === 0 ? 1 : 0,
                        forfeits: 0,
                    },
                };
            });

            // The wheel sits in the table at a return of zero, the same way the
            // dealer does elsewhere — otherwise everyone at a losing table is
            // still ranked against each other for a gold medal.
            const pot = rows.reduce((a, r) => a + r.coins, 0);
            rows.push({
                seat: -1, name: t('rl.house'), house: true,
                coins: -pot, ratio: 0, score: 0, outcome: 'house',
                note: landed, extra: {},
            });

            rows.sort((a, b) => b.ratio - a.ratio || b.coins - a.coins);
            let place = 0, last = null;
            rows.forEach((r, i) => { if (r.ratio !== last) { place = i + 1; last = r.ratio; } r.rank = place; });

            this.cached = new CV.GameResult({ ranks: rows, detail: landed });
            return this.cached;
        }

        snapshot() {
            // `number` is null until the ball has settled, so there is nothing
            // here to read ahead of the spin.
            return Object.assign(super.snapshot(), {
                number: this.number,
                colour: this.colour,
            });
        }
    }

    CV.RouletteEngine = RouletteEngine;
})();
