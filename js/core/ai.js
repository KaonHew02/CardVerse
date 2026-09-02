/**
 * CardVerse — the base for computer players.
 *
 * Difficulty is not "how much the AI cheats". No AI in this hub is allowed to
 * look at a card it has not been dealt; an opponent that wins by reading the
 * shoe is not a harder opponent, it is a broken one, and players work that out
 * quickly. Difficulty is how good the *decision* is:
 *
 *   easy    plays legally, often the first thing that works
 *   normal  follows the basic shape of correct play, with lapses
 *   hard    plays the book, and remembers what has been shown
 *   expert  plays the book, counts, and adjusts to the table
 *
 * `blunder()` is how the lower tiers are built: run the strong decision, then
 * spoil it with some probability. Writing four separate strategies instead
 * gives you four things to keep correct, and the weak ones never get tested.
 */

(() => {
    'use strict';

    const LEVELS = {
        easy:   { label: 'Easy',   icon: '🟢', blunder: 0.40, think: [350, 800] },
        normal: { label: 'Normal', icon: '🟡', blunder: 0.18, think: [400, 950] },
        hard:   { label: 'Hard',   icon: '🔴', blunder: 0.05, think: [500, 1100] },
        expert: { label: 'Expert', icon: '👑', blunder: 0.00, think: [550, 1200] },
    };

    /** Table personalities, so four AI seats are not four clones. */
    const PERSONAS = [
        { name: 'Mei',    avatar: '🐱' }, { name: 'Ravi',  avatar: '🦊' },
        { name: 'Siti',   avatar: '🐨' }, { name: 'Wei',   avatar: '🐼' },
        { name: 'Aminah', avatar: '🦉' }, { name: 'Kumar', avatar: '🐯' },
        { name: 'Ah Lok', avatar: '🐸' }, { name: 'Hana',  avatar: '🦄' },
        { name: 'Bala',   avatar: '🐵' }, { name: 'Yuki',  avatar: '🐰' },
    ];

    class AIPlayer {
        constructor(engine) {
            this.engine = engine;
        }

        level(seat) {
            const s = this.engine.seats[seat];
            return LEVELS[(s && s.level) || 'normal'] || LEVELS.normal;
        }

        /** Milliseconds before this seat acts — enough to be seen deciding. */
        thinkTime(seat) {
            const [lo, hi] = this.level(seat.index !== undefined ? seat.index : seat).think;
            return this.engine.rng.range(lo, hi);
        }

        /**
         * True when this seat should throw the point away on purpose.
         * Uses the engine's RNG so a seeded table replays identically.
         */
        blunder(seat) {
            return this.engine.rng.chance(this.level(seat).blunder);
        }

        /** Any legal action, as a floor no subclass should fall through. */
        fallback(seat) {
            const options = this.engine.legalActions(seat);
            if (!options.length) return null;
            const action = Object.assign({}, this.engine.rng.pick(options), { seat });
            if (action.min !== undefined) action.amount = action.min;
            return action;
        }

        /** @returns {object|null} the action to apply for `seat`. */
        decide(seat) {
            return this.fallback(seat);
        }

        /**
         * Draw `n` distinct opponents. Exported here rather than in each game
         * because "who is at my table" is a hub-level question.
         */
        static personas(n, rng) {
            const pool = PERSONAS.slice();
            (rng || new window.CV.RNG()).shuffle(pool);
            return pool.slice(0, n);
        }
    }

    window.CV = window.CV || {};
    window.CV.AIPlayer  = AIPlayer;
    window.CV.AI_LEVELS = LEVELS;
})();
