/**
 * CardVerse — the 麻将 opponents.
 *
 * A seat sees its own tiles, everyone's melds and everyone's discards. It
 * does not see another concealed hand and it does not know the wall.
 *
 * The whole player is one idea: **throw the tile that leaves the hand
 * closest to ready.** `shanten` answers that, so a discard is thirteen
 * questions and the best answer wins. Ties go to the tile that is least use
 * — a lone honour before a lone terminal, a lone terminal before a middle
 * tile — which is what a person does without thinking about it.
 *
 * Claims work the same way: take the tile only if the hand it makes is
 * closer to ready than the hand without it. 胡 is never declined.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const MJ = CV.MJ;
    const W  = CV.MJWin;

    class MahjongAI extends CV.AIPlayer {

        decide(seat) {
            const e = this.engine;
            const options = e.legalActions(seat);
            if (!options.length) return null;

            // Winning is never turned down.
            const win = options.find((o) => o.type === 'win');
            if (win) return { type: 'win', seat };

            if (e.phase === 'claim') return this.claim(seat, options);
            return this.discard(seat, options);
        }

        get pool() { return MJ.keysFor(this.engine.players); }

        /* ---- your own turn ------------------------------------------------------ */

        discard(seat, options) {
            const e = this.engine;
            const s = e.seats[seat];
            const exposed = s.melds.length;

            // A concealed kong costs nothing when the hand does not need the
            // fourth tile as part of something else, which shanten will say.
            const kong = options.find((o) => o.type === 'kong');
            if (kong && this.kongIsFree(seat, kong.key)) return { type: 'kong', seat, key: kong.key };

            const tiles = options.filter((o) => o.type === 'discard');
            let best = null, bestSt = 99, bestJunk = -1;
            const seen = new Set();

            for (const opt of tiles) {
                const tile = s.hand.find((x) => x.id === opt.tile);
                const key = MJ.key(tile);
                if (seen.has(key)) continue;      // two copies throw the same
                seen.add(key);

                const cnt = MJ.counts(s.hand);
                cnt.set(key, cnt.get(key) - 1);
                const st = W.shanten(cnt, exposed, this.pool);
                const junk = this.junk(seat, tile);
                if (st < bestSt || (st === bestSt && junk > bestJunk)) {
                    best = opt; bestSt = st; bestJunk = junk;
                }
            }
            return { type: 'discard', seat, tile: (best || tiles[0]).tile };
        }

        /** How little this tile is worth keeping. Higher is more throwable. */
        junk(seat, tile) {
            const s = this.engine.seats[seat];
            const cnt = MJ.counts(s.hand);
            const held = cnt.get(MJ.key(tile)) || 0;
            if (held >= 2) return 0;                       // a pair is a start
            if (MJ.isHonour(tile)) return 5;               // an orphan honour goes first
            const near = [tile.n - 2, tile.n - 1, tile.n + 1, tile.n + 2]
                .filter((n) => n >= 1 && n <= 9)
                .reduce((sum, n) => sum + (cnt.get(tile.suit + n) || 0), 0);
            if (near) return 1;
            return (tile.n === 1 || tile.n === 9) ? 4 : 3;
        }

        /** Does taking the kong leave the hand no further from ready? */
        kongIsFree(seat, key) {
            const e = this.engine;
            const s = e.seats[seat];
            const before = W.shanten(MJ.counts(s.hand), s.melds.length, this.pool);
            const cnt = MJ.counts(s.hand);
            const take = Math.min(cnt.get(key) || 0, 4);
            cnt.set(key, (cnt.get(key) || 0) - take);
            const melds = s.melds.some((m) => m.key === key && m.type === 'pung')
                ? s.melds.length : s.melds.length + 1;
            return W.shanten(cnt, melds, this.pool) <= before;
        }

        /* ---- somebody else's discard --------------------------------------------- */

        claim(seat, options) {
            const e = this.engine;
            const s = e.seats[seat];
            const tile = e.lastDiscard.tile;
            const key = MJ.key(tile);
            const before = W.shanten(MJ.counts(s.hand), s.melds.length, this.pool);

            let best = null, bestSt = before;
            for (const opt of options) {
                if (opt.type === 'pass') continue;
                const cnt = MJ.counts(s.hand);
                let melds = s.melds.length + 1;

                if (opt.type === 'pung')      cnt.set(key, cnt.get(key) - 2);
                else if (opt.type === 'kong') cnt.set(key, cnt.get(key) - 3);
                else {
                    const suit = opt.low[0], lo = Number(opt.low.slice(1));
                    for (let x = lo; x <= lo + 2; x++) {
                        const k = suit + x;
                        if (k !== key) cnt.set(k, (cnt.get(k) || 0) - 1);
                    }
                }
                const st = W.shanten(cnt, melds, this.pool);
                if (st < bestSt) { bestSt = st; best = opt; }
            }
            if (!best) return { type: 'pass', seat };
            const out = { type: best.type, seat };
            if (best.low) out.low = best.low;
            return out;
        }
    }

    CV.MahjongAI = MahjongAI;
})();
