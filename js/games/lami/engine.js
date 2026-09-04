/**
 * CardVerse — Lami.
 *
 * Rummy with mahjong-style tiles. Lay runs and sets on the table, add to
 * what is already there, and get your rack down to nothing. When the round
 * ends everyone counts what they are still holding, and the smallest number
 * wins.
 *
 * **This game shares no logic with 麻将.** No chow, no pung, no kong, no 番,
 * no discard payment. Its melds are in `melds.js` and nothing else reaches
 * them.
 *
 * A turn is: put tiles down for as long as you can, then stop — or, if you
 * put nothing down, take one tile and pass it on. That is the whole loop.
 *
 * The rules leave most of the numbers open, so every one of them is a named
 * default in `melds.js` under `RULES` and none of them is buried here.
 *
 * Virtual coins only, and no seat can be taken below zero.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const L = CV.Lami;

    /**
     * One full lap with nobody able to move ends the round. Nothing changed
     * during it, so nothing will change on the next lap either.
     *
     * Ending this way is the ordinary outcome, not a failure: the rules'
     * own worked example scores a round where all four players are still
     * holding tiles.
     */
    const STALL = 1;

    class LamiEngine extends CV.GameEngine {

        static get code() { return 'lami'; }
        static get publicConfig() { return ['room', 'rules']; }

        static get defaults() { return { room: 'beginner', shoe: null, rules: null }; }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.stake = room.bet[0];
            this.rules = Object.assign({}, L.RULES, this.config.rules || {});

            this.pool = [];
            this.table = [];        // [{ tiles, meld, by }]
            this.dice = null;       // [{ seat, roll }] from the opening throw
            this.played = 0;        // tiles this seat has put down this turn
            this.passes = 0;
            this.winner = -1;
            this.cached = null;

            const carried = this.config.shoe;
            this.starter = carried && Number.isInteger(carried.starter)
                ? carried.starter % this.seats.length : -1;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.rack = [];
                s.points = 0;
                s.lastAction = null;
            }
        }

        /** The winner opens the next round — the rule the game rides on. */
        get shoeState() { return { starter: this.winner >= 0 ? this.winner : this.starter }; }

        get poolLeft() { return this.pool.length; }

        /* ---- the throw and the deal --------------------------------------- */

        /**
         * Everybody throws, highest starts, and a tie throws again — exactly
         * the procedure in the rules. Only for the first round of a table;
         * after that the previous winner opens.
         */
        rollForStart() {
            const rolls = [];
            let live = this.seats.map((s) => s.index);
            for (let round = 0; round < 8 && live.length > 1; round++) {
                const thrown = live.map((seat) => ({ seat, roll: this.rng.range(1, 6) }));
                rolls.push(thrown);
                const best = Math.max(...thrown.map((x) => x.roll));
                live = thrown.filter((x) => x.roll === best).map((x) => x.seat);
            }
            this.dice = rolls;
            return live[0];
        }

        start() {
            const box = L.build(this.rules);
            this.rng.shuffle(box);

            for (const s of this.seats) s.rack = L.sort(box.splice(0, this.rules.hand));
            this.pool = box;

            this.turn = this.starter >= 0 ? this.starter : this.rollForStart();
            this.starter = this.turn;
            this.phase = 'play';
            this.round = 1;
            this.emit('deal', { starter: this.turn, dice: this.dice, pool: this.pool.length });
            this.emit('turn', { seat: this.turn });
        }

        /* ---- what a seat may do -------------------------------------------- */

        legalActions(seat) {
            if (this.over || seat !== this.turn || this.phase !== 'play') return [];
            const out = [{ type: 'play', label: t('lami.play') }];
            for (let i = 0; i < this.table.length; i++) {
                out.push({ type: 'extend', at: i, label: t('lami.add') });
            }
            if (!this.played) {
                if (this.pool.length) out.push({ type: 'draw', label: t('lami.draw') });
                else out.push({ type: 'pass', label: t('lami.pass') });
            } else {
                out.push({ type: 'done', label: t('lami.done') });
            }
            return out;
        }

        /**
         * A rack of fourteen tiles has more subsets than anyone can list, so
         * `legalActions` gives the affordances and the tiles themselves are
         * checked here. Nothing reaches `handle()` unvalidated either way.
         */
        isLegal(seat, action) {
            if (action.type === 'play')   return !!this.validPlay(seat, action.tiles);
            if (action.type === 'extend') return !!this.validExtend(seat, action.at, action.tiles);
            return super.isLegal(seat, action);
        }

        /** The tiles a seat is holding, by id, or null if any is not theirs. */
        take(seat, ids) {
            if (!Array.isArray(ids) || !ids.length) return null;
            const rack = this.seats[seat].rack;
            const seen = new Set();
            const out = [];
            for (const id of ids) {
                if (seen.has(id)) return null;
                seen.add(id);
                const tile = rack.find((x) => x.id === id);
                if (!tile) return null;
                out.push(tile);
            }
            return out;
        }

        validPlay(seat, ids) {
            if (this.over || seat !== this.turn) return null;
            const tiles = this.take(seat, ids);
            return tiles ? L.meld(tiles, this.rules) : null;
        }

        validExtend(seat, at, ids) {
            if (this.over || seat !== this.turn) return null;
            const spot = this.table[at];
            if (!spot) return null;
            const tiles = this.take(seat, ids);
            if (!tiles) return null;
            return L.extend(spot.tiles, tiles, this.rules);
        }

        handle(action) {
            const seat = action.seat;
            if (action.type === 'play')   return this.doPlay(seat, action.tiles);
            if (action.type === 'extend') return this.doExtend(seat, action.at, action.tiles);
            if (action.type === 'draw')   return this.doDraw(seat);
            if (action.type === 'pass')   return this.endTurn(seat, true);
            if (action.type === 'done')   return this.endTurn(seat, false);
            return false;
        }

        /* ---- putting tiles down --------------------------------------------- */

        pull(seat, ids) {
            const s = this.seats[seat];
            const tiles = ids.map((id) => s.rack.find((x) => x.id === id));
            s.rack = s.rack.filter((x) => !ids.includes(x.id));
            return tiles;
        }

        doPlay(seat, ids) {
            const shape = this.validPlay(seat, ids);
            if (!shape) return false;
            const tiles = this.pull(seat, ids);
            this.table.push({ tiles: L.sort(tiles), meld: shape, by: seat });
            this.played += tiles.length;
            this.seats[seat].lastAction = 'play';
            this.emit('play', { seat, tiles, meld: shape, left: this.seats[seat].rack.length });
            return this.checkOut(seat);
        }

        doExtend(seat, at, ids) {
            const shape = this.validExtend(seat, at, ids);
            if (!shape) return false;
            const tiles = this.pull(seat, ids);
            const spot = this.table[at];
            spot.tiles = L.sort(spot.tiles.concat(tiles));
            spot.meld = shape;
            this.played += tiles.length;
            this.seats[seat].lastAction = 'extend';
            this.emit('extend', { seat, at, tiles, meld: shape, left: this.seats[seat].rack.length });
            return this.checkOut(seat);
        }

        doDraw(seat) {
            if (!this.pool.length) return this.endTurn(seat, true);
            const tile = this.pool.pop();
            const s = this.seats[seat];
            s.rack = L.sort(s.rack.concat([tile]));
            s.lastAction = 'draw';
            this.emit('draw', { seat, tile, pool: this.pool.length });
            return this.endTurn(seat, false);
        }

        /** A rack down to nothing ends the round on the spot. */
        checkOut(seat) {
            if (this.seats[seat].rack.length) return true;
            this.winner = seat;
            this.emit('out', { seat });
            this.finishRound();
            return true;
        }

        endTurn(seat, passed) {
            this.passes = passed ? this.passes + 1 : 0;
            this.played = 0;
            if (passed && this.passes >= this.seats.length * STALL) {
                this.emit('stalled', {});
                this.finishRound();
                return true;
            }
            this.turn = (seat + 1) % this.seats.length;
            this.emit('turn', { seat: this.turn });
            return true;
        }

        /* ---- the count ------------------------------------------------------- */

        /**
         * Everyone pays for what is left in their hand and the smallest hand
         * takes the lot. A player who went out pays nothing and collects
         * everything, which is what "no remaining penalty" means in coins.
         */
        finishRound() {
            for (const s of this.seats) s.points = L.handPoints(s.rack);
            const low = Math.min(...this.seats.map((s) => s.points));
            const best = this.seats.filter((s) => s.points === low).map((s) => s.index);

            let pot = 0;
            for (const s of this.seats) {
                const owed = Math.min(s.points * this.stake, s.coins);
                s.net = -owed;
                s.coins -= owed;
                pot += owed;
            }
            const share = Math.floor(pot / best.length);
            let odd = pot - share * best.length;
            for (const i of best) {
                const take = share + (odd > 0 ? 1 : 0);
                if (odd > 0) odd--;
                this.seats[i].net += take;
                this.seats[i].coins += take;
            }
            if (this.winner < 0 && best.length === 1) this.winner = best[0];

            this.phase = 'over';
            this.emit('scored', { points: this.seats.map((s) => s.points), pot });
            this.finish();
        }

        result() {
            if (this.cached) return this.cached;
            const rows = this.seats.map((s, i) => ({
                seat: i,
                name: s.name,
                coins: s.net,
                stake: s.points * this.stake,
                score: s.points === 0 ? 400 : Math.max(0, 200 - s.points * 4),
                ratio: -s.points,
                outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                note: s.rack.length
                    ? t('lami.left', { n: s.rack.length, p: s.points })
                    : t('lami.wentOut'),
                hands: s.rack.length ? [{ tiles: s.rack.slice(), cards: [], total: null, bet: 0, payout: 0 }] : [],
                extra: {
                    lamiRounds: 1,
                    lamiWins: i === this.winner ? 1 : 0,
                    lamiOut: (i === this.winner && !s.rack.length) ? 1 : 0,
                    lamiPoints: s.points,
                    lamiMelds: this.table.filter((m) => m.by === i).length,
                    forfeits: 0,
                },
            }));

            rows.sort((a, b) => b.ratio - a.ratio);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { place = idx + 1; last = r.ratio; } r.rank = place; });

            const winner = this.seats[this.winner] || null;
            this.cached = new CV.GameResult({
                ranks: rows,
                detail: winner && !winner.rack.length
                    ? t('lami.detailOut', { name: winner.name })
                    : t('lami.detailStall', { name: winner ? winner.name : '', p: winner ? winner.points : 0 }),
            });
            return this.cached;
        }

        /* ---- state ------------------------------------------------------------ */

        snapshot() {
            return Object.assign(super.snapshot(), {
                table: this.table.map((m) => ({ tiles: m.tiles.slice(), meld: m.meld, by: m.by })),
                pool: this.pool.length,
                dice: this.dice,
                starter: this.starter,
                winner: this.winner,
            });
        }

        /** Everyone's rack but yours is a count. The table is public. */
        redactSeat(seat, index, viewer) {
            if (index === viewer || this.over) return seat;
            return Object.assign({}, seat, { rack: seat.rack.map(() => null) });
        }
    }

    CV.LamiEngine = LamiEngine;
})();
