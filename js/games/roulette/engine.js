/**
 * CardVerse — Russian Roulette Party.
 *
 * A party game on an abstract six-slot spinner. Everyone starts on three HP,
 * takes a turn to spin and then pull, and drops out at zero. Last one left
 * wins. Nothing here models a weapon; see `chamber.js`.
 *
 * The turn is two steps on purpose: **the result is fixed when you spin and
 * hidden until you pull.** That is what makes the re-spin a decision rather
 * than a redraw of something you have already seen — and it is why the engine
 * never looks at the slot until `pull`.
 *
 * Between rounds one of four things can happen to the seat about to play: a
 * shield, doubled damage, a lucky spin, or the order reversing. They are the
 * events from the rules and they live in one table.
 *
 * Coins are an ante: everyone pays in, the winner takes the pot. The score in
 * the rules is kept separately and drives XP and the stats page, because it
 * measures a different thing.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const R = CV.Roulette;

    /** Scoring, straight from the rules. */
    const SCORE = { win: 100, perHp: 10 };

    /** What happens between rounds, and how often anything does. */
    const EVENT_ODDS = 0.22;
    const EVENTS = ['shield', 'double', 'lucky', 'reverse'];

    class RouletteEngine extends CV.GameEngine {

        static get code() { return 'roulette'; }
        static get publicConfig() { return ['room', 'hp']; }

        static get defaults() { return { room: 'beginner', hp: 3, finalHp: 2 }; }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.ante = room.bet[0];

            this.chamber = new R.Chamber(this.rng);
            this.dir = 1;              // reversed by an event
            this.final = false;        // the last two are playing the final
            this.event = null;         // what happened at the top of this turn
            this.last = null;          // the slot just opened, for the screen
            this.winner = -1;
            this.turns = 0;
            this.cached = null;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.hp = this.config.hp;
                s.score = 0;
                s.alive = true;
                s.shield = false;
                s.doubled = false;
                s.lucky = false;
                s.respins = 1;
                s.out = s.coins < this.ante;
            }
        }

        get alive() { return this.seats.filter((s) => s.alive && !s.out); }

        /* ---- the deal ------------------------------------------------------- */

        start() {
            const playing = this.seats.filter((s) => !s.out);
            for (const s of this.seats) if (s.out) s.alive = false;
            if (playing.length < 2) { this.phase = 'over'; this.over = true; return; }

            // Everyone antes; the pot is what the last one standing takes.
            this.pot = 0;
            for (const s of playing) {
                s.coins -= this.ante;
                s.net -= this.ante;
                this.pot += this.ante;
            }

            this.round = 1;
            this.phase = 'spin';
            this.turn = this.seats.findIndex((s) => s.alive);
            this.chamber.load(this.round, this.final);
            this.emit('start', { hp: this.config.hp, pot: this.pot, slots: this.chamber.left });
            this.beginTurn();
        }

        /* ---- a turn ---------------------------------------------------------- */

        beginTurn() {
            const s = this.seats[this.turn];
            s.respins = 1;
            // `last` is not cleared: the table keeps showing what just
            // happened while the next player is winding up, which is most of
            // what makes a turn readable.
            this.event = this.rollEvent(s);
            this.phase = 'spin';
            this.emit('turn', {
                seat: this.turn, round: this.round, event: this.event,
                slots: this.chamber.left, counts: this.chamber.counts,
            });
        }

        /** One of the four events from the rules, or nothing at all. */
        rollEvent(s) {
            if (this.turns < this.seats.length) return null;   // not on the opening lap
            if (!this.rng.chance(EVENT_ODDS)) return null;
            const kind = this.rng.pick(EVENTS);
            if (kind === 'shield')  s.shield = true;
            if (kind === 'double')  s.doubled = true;
            if (kind === 'lucky')   s.lucky = true;
            if (kind === 'reverse') this.dir = -this.dir;
            this.emit('event', { seat: this.turn, kind });
            return kind;
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];
            const s = this.seats[seat];
            if (!s.alive) return [];
            if (this.phase === 'spin') return [{ type: 'spin', label: t('rr.spin') }];
            if (this.phase === 'pull') {
                const out = [{ type: 'pull', label: t('rr.pull') }];
                if (s.respins > 0) out.push({ type: 'respin', label: t('rr.respin') });
                return out;
            }
            return [];
        }

        handle(action) {
            if (action.type === 'spin')   return this.doSpin(action.seat, false);
            if (action.type === 'respin') return this.doSpin(action.seat, true);
            if (action.type === 'pull')   return this.doPull(action.seat);
            return false;
        }

        /**
         * The device points somewhere and stops. What it points at is decided
         * now and stays hidden until the pull, which is the whole reason a
         * re-spin is a choice.
         */
        doSpin(seat, again) {
            const s = this.seats[seat];
            if (again) {
                if (s.respins <= 0) return false;
                s.respins--;
            }
            const left = this.chamber.spin(this.round, this.final);
            this.phase = 'pull';
            this.emit('spin', { seat, again, slots: left, respins: s.respins });
            return true;
        }

        doPull(seat) {
            const slot = this.chamber.pull();
            if (!slot) return false;
            const s = this.seats[seat];

            let hp = slot.hp;
            let points = slot.points;
            let blocked = false;

            if (hp < 0 && s.doubled) hp *= 2;                 // 双倍伤害
            if (hp < 0 && s.shield) { hp = 0; blocked = true; } // 护盾
            if (slot.key === 'SAFE' && s.lucky) points = 50;   // 幸运一转

            s.shield = false;
            s.doubled = false;
            s.lucky = false;

            s.hp = Math.max(0, s.hp + hp);
            s.score += points;
            this.last = { seat, slot: slot.key, hp, points, blocked };
            this.turns++;
            this.emit('pull', Object.assign({ left: this.chamber.left }, this.last));

            if (s.hp === 0) {
                s.alive = false;
                this.emit('eliminated', { seat });
            }
            return this.advance();
        }

        /* ---- whose turn, and when it stops ------------------------------------ */

        advance() {
            const live = this.alive;
            if (live.length <= 1) {
                this.winner = live.length ? live[0].index : -1;
                return this.finishGame();
            }

            // The last two play the final round on two HP and a meaner device.
            // "The last two remaining" means the field shrank to two — a game
            // that only ever had two players is just the ordinary game, and
            // starting it on the final would be over in half a minute.
            if (!this.final && live.length === 2 && this.seats.filter((x) => !x.out).length > 2) {
                this.final = true;
                for (const s of live) s.hp = this.config.finalHp;
                this.chamber.load(this.round, true);
                this.emit('final', { seats: live.map((s) => s.index), hp: this.config.finalHp });
            }

            const n = this.seats.length;
            let next = this.turn;
            for (let k = 0; k < n; k++) {
                next = (next + this.dir + n) % n;
                if (this.seats[next].alive) break;
            }
            // A full lap of the table is a round.
            if ((this.dir > 0 && next <= this.turn) || (this.dir < 0 && next >= this.turn)) {
                this.round++;
                this.emit('round', { round: this.round });
            }
            this.turn = next;
            this.beginTurn();
            return true;
        }

        finishGame() {
            // The rules' final score: what you collected, plus the win, plus
            // what you had left.
            for (const s of this.seats) {
                if (s.out) continue;
                if (s.index === this.winner) s.score += SCORE.win;
                s.score += s.hp * SCORE.perHp;
            }
            if (this.winner >= 0) {
                this.seats[this.winner].coins += this.pot;
                this.seats[this.winner].net += this.pot;
            }
            this.phase = 'over';
            this.emit('winner', { seat: this.winner, pot: this.pot });
            this.finish();
            return true;
        }

        /* ---- the result -------------------------------------------------------- */

        result() {
            if (this.cached) return this.cached;
            const rows = this.seats.filter((s) => !s.out).map((s) => ({
                seat: s.index,
                name: s.name,
                coins: s.net,
                stake: this.ante,
                score: Math.max(0, Math.min(500, s.score)),
                ratio: s.index === this.winner ? 1000 : s.score,
                outcome: s.index === this.winner ? 'win' : 'loss',
                note: s.index === this.winner
                    ? t('rr.survived', { n: s.score })
                    : t('rr.knockedOut', { n: s.score }),
                hands: [],
                extra: {
                    rrGames: 1,
                    rrWins: s.index === this.winner ? 1 : 0,
                    rrScore: s.score,
                    rrHp: s.hp,
                    rrSpins: 0,
                    forfeits: 0,
                },
            }));

            rows.sort((a, b) => b.ratio - a.ratio);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { place = idx + 1; last = r.ratio; } r.rank = place; });

            const champ = this.seats[this.winner];
            this.cached = new CV.GameResult({
                ranks: rows,
                detail: champ
                    ? t('rr.detail', { name: champ.name, n: this.round, s: champ.score })
                    : t('rr.detailNone'),
            });
            return this.cached;
        }

        /* ---- state -------------------------------------------------------------- */

        snapshot() {
            return Object.assign(super.snapshot(), {
                chamber: this.chamber.snapshot(),
                dir: this.dir,
                final: this.final,
                event: this.event,
                last: this.last,
                winner: this.winner,
                pot: this.pot,
            });
        }

        /**
         * Nothing is hidden from anyone. Everything about this game — the HP,
         * the score, what is left in the device — is on the table by design,
         * and the one thing that is not (which slot the spin is on) is not in
         * the snapshot at all.
         */
        redactSeat(seat) { return seat; }
    }

    CV.RouletteEngine = RouletteEngine;
})();
