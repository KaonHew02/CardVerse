/**
 * CardVerse — the table: engine + transport + the seats that are not you.
 *
 * The UI talks to a Table, never to an engine. The Table's jobs are the ones
 * every game needs and no game should re-implement:
 *
 *   - route a decision through the Transport
 *   - notice when the turn belongs to an AI, and take it after a human pause
 *   - tell the screen that something changed
 *   - hand the finished round to the reward pipeline exactly once
 *
 * The AI pause is not decoration. A table that resolves four AI turns in the
 * same frame reads as a bug, because the player never sees the middle of it.
 */

(() => {
    'use strict';

    class Table {
        /**
         * @param {object} opts
         * @param {string} opts.gameCode  registry key, e.g. 'blackjack'
         * @param {Array}  opts.seats     seat descriptors in seating order
         * @param {object} opts.config    merged room + variant rules
         * @param {number} [opts.seed]    fixed seed, for tests and replays
         */
        constructor(opts = {}) {
            const CV   = window.CV;
            const game = CV.Registry.get(opts.gameCode);
            if (!game) throw new Error(`Unknown game: ${opts.gameCode}`);

            this.game    = game;
            this.rng     = new CV.RNG(opts.seed);
            this.engine  = new game.Engine({ rng: this.rng, seats: opts.seats, config: opts.config });
            this.ai      = game.AI ? new game.AI(this.engine) : null;
            this.transport = new CV.LocalTransport(this.engine);
            this.watchers  = [];
            this.drawn     = 0;        // events already handed to the screen
            this.settled   = false;    // rewards paid — must happen once
            this.paused    = false;
            this.timer     = null;
            this.speed     = 1;        // scaled by the Fast animations setting

            this.transport.onApplied(() => this.afterAction());
        }

        /* ---- watching --------------------------------------------------- */

        /** `fn(events, table)` — new events only, so the UI animates each once. */
        onChange(fn) { this.watchers.push(fn); return this; }

        notify() {
            const fresh = this.engine.since(this.drawn);
            this.drawn  = this.engine.events.length;
            for (const fn of this.watchers) {
                try { fn(fresh, this); } catch (err) { console.error('[table]', err); }
            }
        }

        /* ---- running ---------------------------------------------------- */

        start() {
            this.engine.start();
            this.notify();
            this.tick();
            return this;
        }

        /** A seat's decision, from a button or from the AI. */
        dispatch(action) {
            if (this.paused) return false;
            return this.transport.send(action);
        }

        afterAction() {
            this.notify();
            if (this.engine.isOver()) { this.settle(); return; }
            this.tick();
        }

        /**
         * If the table is waiting on a seat this browser plays for, take the
         * turn after a beat. Human seats simply do nothing here and wait for a
         * button.
         */
        tick() {
            clearTimeout(this.timer);
            if (this.engine.isOver() || this.paused) return;

            const seat = this.engine.seats[this.engine.turn];
            if (!seat || seat.isHuman || seat.kind === 'remote') return;
            if (!this.ai) return;

            const wait = this.ai.thinkTime(seat) * this.speed;
            this.timer = setTimeout(() => {
                if (this.paused || this.engine.isOver()) return;
                const action = this.ai.decide(this.engine.turn);
                if (action) this.dispatch(action);
                else this.notify();   // an AI with no legal move still redraws
            }, wait);
        }

        /** Actions the given seat may take right now. */
        options(seat) {
            return this.engine.legalActions(seat === undefined ? this.engine.turn : seat);
        }

        get youSeat() { return this.engine.youSeat; }

        /** True when the table is waiting on a button from this device. */
        get waitingOnYou() {
            const seat = this.engine.seats[this.engine.turn];
            return !!seat && seat.isHuman && !this.engine.isOver();
        }

        pause()  { this.paused = true; clearTimeout(this.timer); }
        resume() { this.paused = false; this.tick(); }

        destroy() {
            clearTimeout(this.timer);
            this.watchers.length = 0;
            this.transport.close();
        }

        /* ---- finishing --------------------------------------------------- */

        /**
         * Pay out once. `settled` guards it because `afterAction` and a game's
         * own auto-advance can both notice the same ending, and paying a win
         * twice is the kind of bug that only shows up in someone's coin total a
         * week later.
         */
        settle() {
            if (this.settled) return this.lastResult;
            this.settled = true;
            const result = this.engine.result();
            this.lastResult = window.CV.Rewards.settle(this, result);
            for (const fn of this.watchers) {
                try { fn([{ type: 'settled', result: this.lastResult }], this); }
                catch (err) { console.error('[table]', err); }
            }
            return this.lastResult;
        }
    }

    window.CV = window.CV || {};
    window.CV.Table = Table;
})();
