/**
 * CardVerse — the party opponents.
 *
 * There is one decision in the game and it is a strange one: **a re-spin is
 * another draw from the same slots, so it does not change the odds.** The
 * rules give each player one per turn and cap it there; nothing about it is
 * an edge.
 *
 * So these seats use it the way people do — when the device is looking
 * dangerous and they have something to lose. A seat on its last point of HP
 * facing a device that is half danger will take the re-spin. It changes
 * nothing, and everybody does it anyway.
 *
 * They see what everyone sees: the HP on the table and how many slots of each
 * kind are left, both of which are public.
 */

(() => {
    'use strict';

    const CV = window.CV;

    class RouletteAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            if (options.some((o) => o.type === 'spin')) return { type: 'spin', seat };

            const respin = options.find((o) => o.type === 'respin');
            if (respin && this.nervous(seat)) return { type: 'respin', seat };
            return { type: 'pull', seat };
        }

        /** How bad the device looks, and how much this seat can afford. */
        nervous(seat) {
            const e = this.engine;
            const s = e.seats[seat];
            const counts = e.chamber.counts;
            const left = e.chamber.left || 1;
            const bad = (counts.DANGER + counts.TRAP) / left;

            // A shield makes the next hit free, so there is nothing to flinch at.
            if (s.shield) return false;
            const stakes = s.hp <= 1 ? 1 : s.hp === 2 ? 0.6 : 0.3;
            return e.rng.chance(Math.min(0.85, bad * stakes * 1.6));
        }
    }

    CV.RouletteAI = RouletteAI;
})();
