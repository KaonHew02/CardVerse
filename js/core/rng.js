/**
 * CardVerse — deterministic random numbers.
 *
 * Every shuffle and every AI coin-flip goes through one of these, seeded from
 * a number the table records. That is not academic tidiness: it is what makes
 * online play possible later without shipping the whole deck over the wire.
 * A host can send `{seed, actions[]}` and every other browser replays the same
 * hand exactly. `Math.random()` cannot do that, so it is used nowhere below.
 */

(() => {
    'use strict';

    /** mulberry32 — small, fast, and good enough for cards. */
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    class RNG {
        /** @param {number} [seed] omit for a fresh unpredictable table. */
        constructor(seed) {
            this.seed = (seed === undefined || seed === null)
                ? (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0
                : seed >>> 0;
            this.calls = 0;
            this._next = mulberry32(this.seed);
        }

        /** Float in [0, 1). */
        next() {
            this.calls++;
            return this._next();
        }

        /** Integer in [0, n). */
        int(n) {
            return Math.floor(this.next() * n);
        }

        /** Integer in [lo, hi], inclusive both ends. */
        range(lo, hi) {
            return lo + this.int(hi - lo + 1);
        }

        /** One element of a non-empty array. */
        pick(arr) {
            return arr[this.int(arr.length)];
        }

        /** Fisher–Yates, in place, returning the same array. */
        shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = this.int(i + 1);
                const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        }

        /** True with probability p. */
        chance(p) {
            return this.next() < p;
        }

        /**
         * Enough to rebuild this exact stream. `calls` matters: a replay has to
         * fast-forward to where the live table is, not start from the top.
         */
        snapshot() {
            return { seed: this.seed, calls: this.calls };
        }

        static restore(snap) {
            const rng = new RNG(snap.seed);
            for (let i = 0; i < snap.calls; i++) rng.next();
            return rng;
        }
    }

    window.CV = window.CV || {};
    window.CV.RNG = RNG;
})();
