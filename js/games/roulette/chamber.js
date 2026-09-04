/**
 * CardVerse — the spinner.
 *
 * An abstract six-slot arcade device and nothing else. Each slot holds one of
 * four outcomes; a spin points at one of the slots still loaded; a pull opens
 * it and uses it up. When all six are gone the device reloads with a fresh
 * random layout.
 *
 * There is no weapon here and none is modelled. The slots are coloured
 * squares with point values attached, the same way a prize wheel is.
 *
 * **A spin is a uniform draw from whatever is left**, so a re-spin is another
 * uniform draw from the same slots and does not change the odds. The rules
 * give the player one, so the player gets one; it is a nerve button, not an
 * edge, and the cap exists to stop it being pressed forever.
 *
 * **Slots are used up, and that is what paces the game.** One danger in six
 * is a one-in-six chance on the first pull and a certainty by the sixth, so a
 * round of six pulls always costs somebody something.
 */

(() => {
    'use strict';

    /** What a slot can be, and what opening it does. */
    const SLOTS = {
        SAFE:   { key: 'SAFE',   hp: 0,  points: 10,  shout: 'rr.click' },
        BONUS:  { key: 'BONUS',  hp: 0,  points: 30,  shout: 'rr.lucky' },
        TRAP:   { key: 'TRAP',   hp: -1, points: 0,   shout: 'rr.trap' },
        DANGER: { key: 'DANGER', hp: -1, points: -20, shout: 'rr.bang' },
    };

    /**
     * How the device is loaded, and how that changes as a game goes on.
     *
     * **The escalation is a balance decision, not a rule.** The rules give one
     * example layout — four safe, a bonus and a danger — and ask for a match
     * of three to ten minutes. At one damage per six pulls a four-player game
     * takes about eighteen rounds to reach a first elimination, which is far
     * past that, so the device gets meaner as the rounds pass. `STAGES` is the
     * whole of it: change the table, change the pacing.
     */
    const STAGES = [
        { from: 1, slots: ['SAFE', 'SAFE', 'SAFE', 'SAFE', 'BONUS', 'DANGER'] },
        { from: 4, slots: ['SAFE', 'SAFE', 'SAFE', 'TRAP', 'BONUS', 'DANGER'] },
        { from: 7, slots: ['SAFE', 'SAFE', 'TRAP', 'BONUS', 'DANGER', 'DANGER'] },
    ];

    /** The last two standing play this, straight from the rules. */
    const FINAL = ['SAFE', 'SAFE', 'SAFE', 'DANGER', 'DANGER', 'DANGER'];

    const SIZE = 6;

    /** The layout a given round is played on. */
    function layoutFor(round, isFinal) {
        if (isFinal) return FINAL.slice();
        let pick = STAGES[0];
        for (const stage of STAGES) if (round >= stage.from) pick = stage;
        return pick.slots.slice();
    }

    class Chamber {
        /**
         * @param {CV.RNG} rng the table's stream — the only randomness here
         */
        constructor(rng) {
            this.rng = rng;
            this.slots = [];      // what is still loaded, in no particular order
            this.layout = [];     // what the device was loaded with
            this.at = -1;         // the slot a spin is pointing at
            this.spun = false;
        }

        get left() { return this.slots.length; }

        /** How many of each kind are still in there — public, and countable. */
        get counts() {
            const out = {};
            for (const k of Object.keys(SLOTS)) out[k] = 0;
            for (const s of this.slots) out[s]++;
            return out;
        }

        load(round, isFinal) {
            this.layout = layoutFor(round, isFinal);
            this.slots = this.layout.slice();
            this.rng.shuffle(this.slots);
            this.at = -1;
            this.spun = false;
            return this.layout;
        }

        /** Point at one of the slots still loaded. The result stays hidden. */
        spin(round, isFinal) {
            if (!this.slots.length) this.load(round, isFinal);
            this.at = this.rng.int(this.slots.length);
            this.spun = true;
            return this.left;
        }

        /** Open it. The slot is used up either way. */
        pull() {
            if (!this.spun || this.at < 0) return null;
            const key = this.slots.splice(this.at, 1)[0];
            this.at = -1;
            this.spun = false;
            return SLOTS[key];
        }

        snapshot() { return { left: this.left, spun: this.spun, counts: this.counts }; }
    }

    window.CV = window.CV || {};
    window.CV.Roulette = { SLOTS, STAGES, FINAL, SIZE, layoutFor, Chamber };
})();
