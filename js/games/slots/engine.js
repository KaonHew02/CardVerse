/**
 * CardVerse — 老虎机, a classic three-reel, one-payline slot machine.
 *
 * **A round is a session at the machine, not a single pull.** Spins are
 * actions inside it and the round ends when the player cashes out or runs
 * dry. That is deliberate: a slot is played in bursts of twenty, and a result
 * screen between every pull would make auto-spin unusable. The per-spin
 * figures the statistics screen wants — spins, wins, losses, biggest win,
 * jackpots — are accumulated here and reported once at the end.
 *
 * **The RNG decides before anything animates.** `spin()` resolves the reels
 * and the payout in full, and the view is only allowed to reveal what is
 * already true. An animation that decided anything would be a different
 * program with a much worse reputation.
 *
 * Virtual coins only. There is no purchase, top-up or cash-out path in either
 * direction, here or anywhere else in the hub.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;

    /**
     * The reel strip. Every symbol is equally likely on every reel, so the
     * odds are exactly 1 in 8³ for any given triple and 1 in 64 for a win of
     * some kind. See the note on return-to-player in index.js.
     */
    const SYMBOLS = [
        { id: 'cherry',  icon: '🍒', mult: 5 },
        { id: 'lemon',   icon: '🍋', mult: 8 },
        { id: 'orange',  icon: '🍊', mult: 10 },
        { id: 'melon',   icon: '🍉', mult: 15 },
        { id: 'bell',    icon: '🔔', mult: 25 },
        { id: 'star',    icon: '⭐', mult: 40 },
        { id: 'diamond', icon: '💎', mult: 75 },
        { id: 'seven',   icon: '7️⃣', mult: 100 },
    ];

    const JACKPOT = 'seven';
    const REELS = 3;

    class SlotsEngine extends CV.GameEngine {

        static get publicConfig() { return ['room', 'minBet', 'maxBet']; }

        static get defaults() {
            return {
                room: 'beginner',
                // The machine sets its own limits rather than taking the
                // room's — a slot's range is part of the machine.
                minBet: 1,
                maxBet: 1000,
            };
        }

        constructor(opts) {
            super(opts);
            this.minBet = this.config.minBet;
            this.maxBet = this.config.maxBet;

            this.reels   = [];      // the symbols showing right now
            this.last    = null;    // the most recent spin's outcome
            this.history = [];      // newest first
            this.cached  = null;

            this.tally = {
                spins: 0, staked: 0, won: 0,
                biggest: 0, jackpots: 0, wins: 0, losses: 0,
            };

            for (const seat of this.seats) {
                seat.startCoins = seat.coins;
                seat.net = 0;
                seat.out = seat.coins < this.minBet;
            }
        }

        /** The one seat that plays — 老虎机 is a solo machine. */
        get seat() { return this.seats[0]; }

        get canAfford() { return this.seat.coins >= this.minBet; }

        /* ---- phases ------------------------------------------------------- */

        start() {
            this.round = 1;
            this.phase = 'idle';
            this.turn  = 0;
            if (!this.canAfford) { this.finishSession(); return; }
            this.emit('ready', { coins: this.seat.coins });
        }

        legalActions(seat) {
            if (this.over || seat !== 0 || this.phase !== 'idle') return [];
            const out = [];
            const max = Math.min(this.maxBet, this.seat.coins);
            if (max >= this.minBet) {
                out.push({ type: 'spin', min: this.minBet, max, label: t('slots.spin') });
            }
            out.push({ type: 'cashout', label: t('slots.cashout') });
            return out;
        }

        handle(action) {
            if (action.type === 'cashout') { this.finishSession(); return true; }
            if (action.type !== 'spin') return false;
            return this.spin(Math.round(action.amount));
        }

        /* ---- the spin ------------------------------------------------------ */

        /**
         * Resolve one pull completely: take the stake, roll three symbols, pay
         * anything owed, and record it. Nothing here is provisional — the view
         * animates afterwards toward a result that already happened.
         */
        spin(amount) {
            const s = this.seat;
            const bet = Math.max(this.minBet, Math.min(this.maxBet, Math.min(amount, s.coins)));

            s.coins -= bet;
            s.net   -= bet;

            const reels = [];
            for (let i = 0; i < REELS; i++) reels.push(this.rng.pick(SYMBOLS));
            this.reels = reels;

            // Only three of a kind pays. Two matching is nothing.
            const same = reels.every((r) => r.id === reels[0].id);
            const symbol = same ? reels[0] : null;
            const mult = same ? symbol.mult : 0;
            const payout = Math.round(bet * mult);
            const jackpot = same && symbol.id === JACKPOT;

            s.coins += payout;
            s.net   += payout;

            const spinResult = {
                reels: reels.map((r) => r.id),
                icons: reels.map((r) => r.icon),
                bet, payout, mult, jackpot,
                symbol: symbol ? symbol.id : null,
                net: payout - bet,
                at: this.tally.spins + 1,
            };

            this.tally.spins++;
            this.tally.staked += bet;
            this.tally.won    += payout;
            if (payout > 0) {
                this.tally.wins++;
                if (payout > this.tally.biggest) this.tally.biggest = payout;
                if (jackpot) this.tally.jackpots++;
            } else {
                this.tally.losses++;
            }

            this.last = spinResult;
            this.history.unshift(spinResult);
            if (this.history.length > 50) this.history.length = 50;

            this.emit('spin', spinResult);
            if (jackpot) this.emit('jackpot', spinResult);

            // Out of coins is the end of the session, not a stuck screen.
            if (!this.canAfford) {
                this.emit('broke');
                this.finishSession();
            }
            return true;
        }

        /* ---- ending -------------------------------------------------------- */

        finishSession() {
            if (this.over) return;
            this.phase = 'over';
            this.finish();
        }

        isOver() { return this.over; }

        result() {
            if (this.cached) return this.cached;
            const s = this.seat;
            const g = this.tally;
            const rate = g.spins ? (g.wins / g.spins) * 100 : 0;

            this.cached = new CV.GameResult({
                ranks: [{
                    seat: 0,
                    name: s.name,
                    coins: s.net,
                    stake: g.staked,
                    score: g.biggest,
                    ratio: g.staked ? Math.round((s.net / g.staked) * 1000) / 1000 : 0,
                    rank: 1,
                    outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                    note: t('slots.note', { spins: g.spins, rate: rate.toFixed(0) }),
                    // No cards to show; the recap reads the tally instead.
                    hands: [],
                    extra: {
                        slotSpins: g.spins,
                        slotWins: g.wins,
                        slotLosses: g.losses,
                        slotStaked: g.staked,
                        slotWon: g.won,
                        slotJackpots: g.jackpots,
                        forfeits: 0,
                    },
                }],
                detail: t('slots.detail', {
                    spins: g.spins,
                    biggest: CV.UI ? CV.UI.fmt(g.biggest) : g.biggest,
                }),
            });
            return this.cached;
        }

        snapshot() {
            return Object.assign(super.snapshot(), {
                reels: this.reels.map((r) => r.id),
                last: this.last,
                tally: Object.assign({}, this.tally),
            });
        }
    }

    CV.SlotsEngine  = SlotsEngine;
    CV.SlotsSymbols = SYMBOLS;
    CV.SlotsJackpot = JACKPOT;
})();
