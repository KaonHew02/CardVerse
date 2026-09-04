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
 *
 * **A table with a minimum changes the whole game, so it changes the whole
 * player.** Three-player needs 5番 to declare anything, and the fastest hand
 * on the table is usually worth one. So when there is a floor, this player
 * stops racing: it stays 门清 — every 吃 and 碰 throws away a 番 and buys
 * nothing — and it pushes its discards towards one suit, which is where 混一色
 * and 清一色 come from. Slower, and the only way to be allowed to win.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const MJ = CV.MJ;
    const W  = CV.MJWin;

    class MahjongAI extends CV.AIPlayer {

        /** The 番 this table demands before a hand may be declared. */
        get minFan() { return this.engine.minFan || 0; }

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

        /**
         * The suit this hand is drifting towards — the one it holds most of.
         * Honours count for neither, since 混一色 keeps them either way.
         */
        targetSuit(seat) {
            const s = this.engine.seats[seat];
            const tally = { m: 0, s: 0, p: 0 };
            for (const tile of s.hand.concat(s.melds.flatMap((x) => x.tiles))) {
                if (tile.suit !== 'z') tally[tile.suit]++;
            }
            return ['m', 's', 'p'].sort((a, b) => tally[b] - tally[a])[0];
        }

        /** How little this tile is worth keeping. Higher is more throwable. */
        junk(seat, tile) {
            const s = this.engine.seats[seat];
            const cnt = MJ.counts(s.hand);
            const held = cnt.get(MJ.key(tile)) || 0;
            // Off-suit tiles go first when the table wants a big hand.
            const offSuit = (this.minFan && !MJ.isHonour(tile) && tile.suit !== this.targetSuit(seat)) ? 6 : 0;
            if (held >= 2) return offSuit;                 // a pair is a start
            if (MJ.isHonour(tile)) return 5 + offSuit;     // an orphan honour goes first
            const near = [tile.n - 2, tile.n - 1, tile.n + 1, tile.n + 2]
                .filter((n) => n >= 1 && n <= 9)
                .reduce((sum, n) => sum + (cnt.get(tile.suit + n) || 0), 0);
            if (near) return 1 + offSuit;
            return ((tile.n === 1 || tile.n === 9) ? 4 : 3) + offSuit;
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

            // With a floor to clear, 吃 and 碰 cost a 番 and buy nothing.
            // Only a kong is worth taking, and only when it is free.
            const menzen = this.minFan > 0;

            let best = null, bestSt = before;
            for (const opt of options) {
                if (opt.type === 'pass') continue;
                if (menzen && (opt.type === 'chow' || opt.type === 'pung')) continue;
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
