/**
 * CardVerse — 骰子.
 *
 * Everyone backs 大, 小 or 围骰 and puts up a stake; three dice settle the
 * lot. There is nothing to decide after the bet, which is the game.
 *
 * Reading the dice and pricing the bet are two jobs, and `dice.js` does the
 * first. That matters more here than usual: the reading is fixed by the rules
 * and the odds are not settled yet, so the half that is decided is nailed
 * down and the half that is not sits behind one constant.
 *
 * Virtual coins only, and no seat can be taken below zero.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const D = CV.Dice;

    class DiceEngine extends CV.GameEngine {

        static get code() { return 'dice'; }
        static get publicConfig() { return ['room']; }

        static get defaults() { return { room: 'beginner' }; }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.minBet = room.bet[0];
            this.maxBet = room.bet[1];

            this.dice = null;
            this.outcome = null;
            this.cached = null;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.bet = 0;
                s.side = null;
                s.payout = 0;
                s.outcome = null;
                s.out = s.coins < this.minBet;
            }
        }

        /** Nothing carries between rounds — three dice have no memory. */
        get shoeState() { return null; }

        nextSeat(from) {
            for (let i = from + 1; i < this.seats.length; i++) if (!this.seats[i].out) return i;
            return -1;
        }

        /* ---- betting ------------------------------------------------------- */

        start() {
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
            return D.SIDES.map((side) => ({
                type: 'wager', side, min: this.minBet, max, label: t('dice.' + side),
            }));
        }

        handle(action) {
            if (action.type !== 'wager') return false;
            const s = this.seats[action.seat];
            s.side = action.side;
            s.bet = Math.round(action.amount);
            s.coins -= s.bet;
            s.net -= s.bet;
            this.emit('wager', { seat: action.seat, side: s.side, amount: s.bet });

            const next = this.nextSeat(action.seat);
            if (next >= 0) { this.turn = next; this.emit('betting', { seat: next }); return true; }
            this.throwThem();
            return true;
        }

        /* ---- the throw ------------------------------------------------------- */

        throwThem() {
            this.phase = 'rolling';
            this.turn = -1;
            this.dice = D.roll(this.rng);
            this.outcome = D.read(this.dice);
            this.emit('roll', { dice: this.dice.slice(), result: this.outcome });
            this.settle();
        }

        settle() {
            for (const s of this.seats) {
                if (s.out) continue;
                if (D.wins(s.side, this.outcome)) {
                    s.outcome = 'win';
                    s.payout = s.bet + s.bet * D.PAYS[s.side];
                } else {
                    s.outcome = 'loss';
                    s.payout = 0;
                }
                s.coins += s.payout;
                s.net += s.payout;
                this.emit('settled', { seat: s.index, outcome: s.outcome, payout: s.payout });
            }
            this.phase = 'over';
            this.finish();
        }

        /* ---- the result ------------------------------------------------------ */

        /** "围骰 六" or "大 · 14" — what the throw came to. */
        name(result) {
            if (!result) return '';
            if (result.type === 'triple') return t('dice.tripleOf', { n: result.face });
            return t('dice.' + result.type) + ' · ' + result.total;
        }

        result() {
            if (this.cached) return this.cached;
            const rows = [];
            for (const s of this.seats) {
                if (s.out) continue;
                const won = s.outcome === 'win';
                rows.push({
                    seat: s.index,
                    name: s.name,
                    coins: s.net,
                    stake: s.bet,
                    score: won ? Math.min(500, 60 + D.PAYS[s.side] * 40) : 0,
                    ratio: s.bet ? Math.round((s.net / s.bet) * 1000) / 1000 : 0,
                    outcome: s.outcome,
                    note: t('dice.backed', { side: t('dice.' + s.side) }),
                    hands: [],
                    extra: {
                        diceRounds: 1,
                        diceWins: won ? 1 : 0,
                        diceBig: s.side === 'big' ? 1 : 0,
                        diceSmall: s.side === 'small' ? 1 : 0,
                        diceTripleBets: s.side === 'triple' ? 1 : 0,
                        diceTripleHits: (won && s.side === 'triple') ? 1 : 0,
                        diceSeen: this.outcome.type === 'triple' ? 1 : 0,
                        forfeits: 0,
                    },
                });
            }

            // The table sits in the result at a return of zero, so a winner
            // ranks above it and a loser below.
            rows.push({
                seat: -1, name: t('dice.house'), house: true,
                coins: -rows.reduce((n, r) => n + r.coins, 0),
                ratio: 0, score: 0, outcome: 'house',
                note: this.name(this.outcome), hands: [], extra: {},
            });

            rows.sort((a, b) => b.ratio - a.ratio || b.coins - a.coins);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { place = idx + 1; last = r.ratio; } r.rank = place; });

            this.cached = new CV.GameResult({
                ranks: rows,
                detail: t('dice.detail', {
                    dice: this.dice.join(' + '), total: this.outcome.total, what: this.name(this.outcome),
                }),
            });
            return this.cached;
        }

        /* ---- state ------------------------------------------------------------ */

        snapshot() {
            return Object.assign(super.snapshot(), {
                dice: this.dice ? this.dice.slice() : null,
                outcome: this.outcome,
            });
        }

        /** A seat's pick is its own until the dice are thrown. */
        redactSeat(seat, index, viewer) {
            if (index === viewer || this.phase !== 'betting') return seat;
            return Object.assign({}, seat, { side: seat.side ? 'hidden' : null });
        }
    }

    CV.DiceEngine = DiceEngine;
})();
