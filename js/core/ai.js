/**
 * CardVerse — the base for computer players.
 *
 * **There are no difficulty tiers.** Every AI plays the same way: correct
 * play for the cards it can see, and nothing else. The variation between
 * hands is the deal — which is the only thing that should vary at a card
 * table.
 *
 * Two rules that follow, and both matter:
 *
 * - **No AI reads a card it has not been dealt.** An opponent that wins by
 *   knowing the shoe is not a better opponent, it is a broken one, and
 *   players work that out quickly.
 * - **No AI counts.** Counting is real skill, but it gives the machine
 *   information the player at the same table does not have, which reads as
 *   the house cheating rather than as a worthy opponent.
 *
 * So: luck from the cards, skill and probability from the book, nothing up
 * anyone's sleeve.
 */

(() => {
    'use strict';

    /** How long a seat appears to think. Long enough to be seen deciding. */
    const THINK = [420, 1050];

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

        /** Milliseconds before this seat acts. */
        thinkTime() {
            return this.engine.rng.range(THINK[0], THINK[1]);
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
    window.CV.AIPlayer = AIPlayer;
})();
