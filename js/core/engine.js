/**
 * CardVerse — the base every game engine extends.
 *
 * The contract is small on purpose, because it has to hold for a blackjack
 * hand, a 斗地主 round and eventually a mahjong wall:
 *
 *     start()               deal, seat, and put the table in its first state
 *     legalActions(seat)    what this seat may do right now, as data
 *     apply(action)         validate, mutate, log events, return true/false
 *     isOver()              has the round finished
 *     result()              ranks, scores and payouts, once it has
 *
 * Three rules the whole hub depends on, and which every new engine must keep:
 *
 * 1. **The engine never touches the DOM.** It produces state and events; the
 *    UI reads them. This is what lets the same engine run headless in a test,
 *    under an AI, or one day inside a host browser deciding for everyone.
 *
 * 2. **Randomness comes only from `this.rng`.** See rng.js.
 *
 * 3. **`legalActions` is the single source of truth for legality.** The UI
 *    greys buttons from it and `apply` refuses anything absent from it, so a
 *    tampered client and a mis-drawn button are the same bug, caught once.
 */

(() => {
    'use strict';

    /** Seats are engine-agnostic: a chair, who is in it, and how they decide. */
    class Seat {
        constructor(i, opts = {}) {
            this.index  = i;
            this.id     = opts.id     || `seat${i}`;
            this.name   = opts.name   || `Player ${i + 1}`;
            this.avatar = opts.avatar || '🙂';
            this.kind   = opts.kind   || 'ai';        // 'human' | 'ai' | 'remote'
            this.level  = opts.level  || 'normal';    // AI difficulty
            this.coins  = opts.coins  || 0;
            this.isYou  = !!opts.isYou;
            this.out    = false;                      // eliminated / sitting out
        }
        get isHuman() { return this.kind === 'human'; }
    }

    class GameEngine {
        /**
         * @param {object} opts
         * @param {CV.RNG} opts.rng    the table's random stream
         * @param {Array}  opts.seats  seat descriptors, in seating order
         * @param {object} opts.config game-specific rules (room stakes, variants)
         */
        constructor(opts = {}) {
            this.rng     = opts.rng || new window.CV.RNG();
            this.config  = Object.assign({}, this.constructor.defaults, opts.config || {});
            this.seats   = (opts.seats || []).map((s, i) => (s instanceof Seat ? s : new Seat(i, s)));
            this.events  = [];
            this.phase   = 'idle';
            this.turn    = 0;      // seat index whose decision the table waits on
            this.round   = 0;
            this.log     = [];     // every applied action, in order — the replay
            this.over     = false;
        }

        static get defaults() { return {}; }

        /** Seat index of the human whose screen this is, or -1 at an AI-only table. */
        get youSeat() {
            const i = this.seats.findIndex((s) => s.isYou);
            return i;
        }

        /* ---- events ---------------------------------------------------- */

        /**
         * Engines announce what happened rather than how it should look.
         * `emit('deal', {seat, card})`, not `emit('slideCardFromLeft')`.
         */
        emit(type, data = {}) {
            const event = Object.assign({ type, at: this.events.length }, data);
            this.events.push(event);
            return event;
        }

        /** Events since `from`, so a UI can animate only what it has not drawn. */
        since(from) {
            return this.events.slice(from);
        }

        /* ---- the contract ---------------------------------------------- */

        start()             { throw new Error('start() not implemented'); }
        legalActions(_seat) { return []; }
        isOver()            { return this.over; }
        result()            { return { ranks: [] }; }

        /**
         * Run one action. Subclasses implement `handle`; this wrapper does the
         * part that must never be forgotten — refusing anything the seat is not
         * currently allowed to do, and recording what was allowed.
         */
        apply(action) {
            if (this.over) return false;
            if (!action || typeof action.type !== 'string') return false;

            const seat = (action.seat === undefined) ? this.turn : action.seat;
            if (!this.isLegal(seat, action)) return false;

            this.log.push(Object.assign({}, action, { seat }));
            const ok = this.handle(Object.assign({}, action, { seat }));
            if (ok !== false && this.isOver() && this.phase !== 'over') this.finish();
            return ok !== false;
        }

        handle(_action) { return false; }

        /** Membership test against `legalActions`, matched on type plus any key the descriptor pins. */
        isLegal(seat, action) {
            const allowed = this.legalActions(seat);
            return allowed.some((a) => {
                if (a.type !== action.type) return false;
                for (const key of Object.keys(a)) {
                    if (key === 'type' || key === 'label' || key === 'hint' || key === 'min' || key === 'max') continue;
                    if (a[key] !== action[key]) return false;
                }
                // Wagers are ranges, not fixed values.
                if (a.min !== undefined && (action.amount < a.min || action.amount > a.max)) return false;
                return true;
            });
        }

        finish() {
            this.over  = true;
            this.phase = 'over';
            this.emit('gameOver', { result: this.result() });
        }

        /* ---- state ------------------------------------------------------ */

        /**
         * The host's complete state — every hidden card and the RNG seed.
         *
         * **Never send this to another player.** `rng` is `{seed, calls}`,
         * which is not a detail: mulberry32 is deterministic, so a seed and a
         * call count reproduce the entire shoe — the hole card, and every card
         * still to come. Use it for saving, tests and debugging only.
         * `snapshotFor()` is the one that goes on a wire.
         */
        snapshot() {
            return {
                phase: this.phase,
                turn:  this.turn,
                round: this.round,
                over:  this.over,
                rng:   this.rng.snapshot(),
                seats: this.seats.map((s) => ({ ...s })),
                log:   this.log.slice(),
            };
        }

        /**
         * What one seat is allowed to see — the **only** thing a host may
         * broadcast once online play lands.
         *
         * Drops the RNG for the reason above, then asks the game to hide the
         * cards this viewer has no business knowing. The base class hides
         * nothing beyond the seed, because in a face-up game like Blackjack
         * there is nothing else to hide; a game with concealed hands (斗地主,
         * 锄大D, mahjong) **must** override `redactSeat`, and its absence is a
         * bug that hands every opponent's cards to every client.
         *
         * @param {number} viewer seat index the snapshot is destined for, or
         *                        -1 for a spectator
         */
        snapshotFor(viewer) {
            const view = this.snapshot();
            delete view.rng;
            view.viewer = viewer;
            view.game = this.constructor.code || null;
            // Rules are public — everyone at a table can read the felt. But the
            // config is whitelisted rather than copied, because a game may park
            // private state on it: Blackjack carries the carried-over `shoe`,
            // and sending that would post every remaining card to the table.
            view.rules = {};
            for (const key of (this.constructor.publicConfig || [])) view.rules[key] = this.config[key];
            view.seats = view.seats.map((seat, i) => {
                const out = this.redactSeat(seat, i, viewer);
                // `isYou` and `kind` are written from the *recipient's* point of
                // view, not copied from the host's. Left alone, every guest is
                // told the host's chair is theirs — the seat highlight, the
                // "(you)" label and the pass-the-device wording all follow
                // isYou, so the table reads as someone else's game.
                out.isYou = (i === viewer);
                if (i === viewer) out.kind = 'human';
                else if (out.kind === 'human') out.kind = 'remote';
                return out;
            });
            view.options = this.legalActions(viewer);
            return view;
        }

        /**
         * Hide what `viewer` must not see on `seat`. Return a copy — mutating
         * the argument would corrupt the host's own state, since `snapshot()`
         * shallow-copies the seat objects.
         *
         * Convention for concealed hands: replace each card with `null` rather
         * than dropping it, so the count stays visible. Everyone at a real
         * table can see how many cards you are holding.
         */
        redactSeat(seat, _index, _viewer) {
            return seat;
        }
    }

    /**
     * One finished round, in the shape the shared result screen reads.
     * Every engine returns this so the screen never learns a game's rules.
     */
    class GameResult {
        constructor({ ranks = [], detail = '', draw = false } = {}) {
            this.ranks  = ranks;   // [{ seat, name, rank, score, coins, note }]
            this.detail = detail;  // one line of game-specific colour
            this.draw   = draw;
        }
        get winners() { return this.ranks.filter((r) => r.rank === 1); }
        forSeat(i)    { return this.ranks.find((r) => r.seat === i) || null; }
        youWon(seat)  { const r = this.forSeat(seat); return !!r && r.rank === 1; }
    }

    window.CV = window.CV || {};
    window.CV.Seat       = Seat;
    window.CV.GameEngine = GameEngine;
    window.CV.GameResult = GameResult;
})();
