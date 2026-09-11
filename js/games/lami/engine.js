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
            this.spent = [];        // jokers laid alone to buy a turn
            this.dice = null;       // [{ seat, roll }] from the opening throw
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
                s.pieces = 0;       // the joker/ace side count
                s.opened = false;   // has laid its first run
                s.folded = false;   // could not play, and is out of the hand
                s.lastAction = null;
            }
            this.heaven = -1;       // the seat dealt a 天胡, if any
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

        /**
         * **Everything is dealt at the start and there is no draw pile.**
         *
         * Twenty tiles each and the rest of the box is dead — which is the
         * whole shape of this game. Ordinary rummy is a race to improve a
         * hand you keep topping up; here the hand you are dealt is the hand
         * you have, and every turn spends it. `pool` is kept only so the
         * count can be shown; nothing draws from it.
         */
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

            // 天胡 — twenty tiles that already lie in melds with nothing over.
            // It is read off the deal and pays before anybody has played, so
            // it is checked here rather than anywhere a turn could reach.
            for (const s of this.seats) {
                if (!L.partition(s.rack, this.rules)) continue;
                this.heaven = s.index;
                this.winner = s.index;
                s.rack = [];
                this.emit('heaven', { seat: s.index });
                this.finishRound();
                return;
            }
            this.emit('turn', { seat: this.turn });
        }

        /* ---- what a seat may do -------------------------------------------- */

        /**
         * **You put something down every turn, or you are out.**
         *
         * There is nothing to draw, so a turn is not a chance to improve —
         * it is a demand. Lay a meld, add to one on the table, or spend a
         * joker on its own to buy the turn; do none of those and you fold,
         * and your rack is frozen and counted at the end.
         *
         * A seat that has not opened may only lay a run of three or more, and
         * may not add to anybody else's meld. That is the entry fee: until
         * you have shown a run you are not on the table.
         */
        legalActions(seat) {
            if (this.over || seat !== this.turn || this.phase !== 'play') return [];
            const s = this.seats[seat];
            if (s.folded) return [];

            const out = [{ type: 'play', label: t('lami.play') }];
            if (s.opened) {
                for (let i = 0; i < this.table.length; i++) {
                    out.push({ type: 'extend', at: i, label: t('lami.add') });
                }
            }
            // **The opening run is compulsory.** A seat holding a run has to
            // lay it — it cannot fold on it, and it cannot buy the turn with
            // a joker. Everybody is on the table by the end of their first
            // playable turn, which is what makes the opening a race rather
            // than a thing you sit out while your rack gets cheaper.
            if (!this.mustOpen(seat)) {
                // A lone joker buys the turn. It is the one tile that can be
                // spent on nothing, and spending it is better than folding.
                if (s.rack.some(L.isJoker)) out.push({ type: 'joker', label: t('lami.jokerOut') });
                out.push({ type: 'fold', label: t('lami.fold') });
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

        /**
         * A seat that has not opened and is holding a run. It has exactly one
         * legal move — lay the run — and `legalActions` offers nothing else.
         */
        mustOpen(seat) {
            const s = this.seats[seat];
            return !s.opened && !s.folded && L.canOpen(s.rack, this.rules);
        }

        validPlay(seat, ids) {
            if (this.over || seat !== this.turn) return null;
            const tiles = this.take(seat, ids);
            const shape = tiles ? L.meld(tiles, this.rules) : null;
            // The first thing a seat lays has to be a run. Sets come after —
            // and the answer lives here rather than only in `doPlay`, so the
            // legality check, the screen and the move all agree.
            if (shape && !this.seats[seat].opened && shape.type !== 'run') return null;
            return shape;
        }

        validExtend(seat, at, ids) {
            if (this.over || seat !== this.turn) return null;
            // **Until you have opened you are not on the table.** Nothing of
            // yours goes onto anybody else's meld — rule 4, and it was only
            // being enforced by `legalActions` not offering the button, which
            // `isLegal` goes around.
            if (!this.seats[seat].opened) return null;
            const spot = this.table[at];
            if (!spot) return null;
            const tiles = this.take(seat, ids);
            if (!tiles) return null;
            return L.extend(spot.tiles, tiles, this.rules);
        }

        handle(action) {
            const seat = action.seat;
            if (action.type === 'play')   return this.doPlay(seat, action.tiles, action.lo);
            if (action.type === 'extend') return this.doExtend(seat, action.at, action.tiles, action.lo);
            if (action.type === 'joker')  return this.doJoker(seat);
            if (action.type === 'fold')   return this.doFold(seat);
            return false;
        }

        /* ---- putting tiles down --------------------------------------------- */

        pull(seat, ids) {
            const s = this.seats[seat];
            const tiles = ids.map((id) => s.rack.find((x) => x.id === id));
            s.rack = s.rack.filter((x) => !ids.includes(x.id));
            return tiles;
        }

        /**
         * **One meld a turn.** Laying it *is* the turn — a seat used to be
         * able to keep going until it pressed 不要了, and a rack that opened
         * with a run could empty half of itself before anybody else had
         * moved. Everything a seat does now passes the turn on: a meld, an
         * add, a joker spent, a fold.
         *
         * `lo` is the rank the run starts on when the player has chosen one
         * — see `L.runWindows`. It decides nothing about whether the meld is
         * legal; it decides what the joker in it is standing for.
         */
        doPlay(seat, ids, lo) {
            const shape = this.validPlay(seat, ids);
            if (!shape) return false;
            // The first thing a seat lays has to be a run. Sets come after.
            if (!this.seats[seat].opened && shape.type !== 'run') return false;
            this.seats[seat].opened = true;
            const tiles = this.pull(seat, ids);
            // Laid out as the meld reads, not as a rack sorts — a joker sits
            // in the hole it is filling. See `L.layout`.
            this.table.push({ tiles: L.layout(tiles, this.rules, lo), meld: shape, by: seat, lo });
            this.seats[seat].lastAction = 'play';
            this.emit('play', { seat, tiles, meld: shape, left: this.seats[seat].rack.length });
            if (!this.seats[seat].rack.length) return this.checkOut(seat);
            return this.endTurn(seat, false);
        }

        doExtend(seat, at, ids, lo) {
            const shape = this.validExtend(seat, at, ids);
            if (!shape) return false;
            const tiles = this.pull(seat, ids);
            const spot = this.table[at];
            // The meld keeps the reading it was laid down with wherever the
            // new tiles still allow it, so adding a tile never quietly slides
            // somebody else's joker to the other end of the run.
            const want = lo === undefined ? spot.lo : lo;
            spot.tiles = L.layout(spot.tiles.concat(tiles), this.rules, want);
            spot.meld = shape;
            spot.lo = want;
            this.seats[seat].lastAction = 'extend';
            this.emit('extend', { seat, at, tiles, meld: shape, left: this.seats[seat].rack.length });
            if (!this.seats[seat].rack.length) return this.checkOut(seat);
            return this.endTurn(seat, false);
        }

        /**
         * A joker spent on nothing, to buy a turn you could not otherwise
         * take. It leaves the rack — so it stops costing points and stops
         * counting towards the side settlement — and goes face up on the
         * table where everybody can see what it cost.
         */
        doJoker(seat) {
            // Not instead of the opening run. A joker that could be the
            // missing rung of that run is not a joker you may throw away to
            // avoid laying it.
            if (this.mustOpen(seat)) return false;
            const s = this.seats[seat];
            const idx = s.rack.findIndex(L.isJoker);
            if (idx < 0) return false;
            const tile = s.rack.splice(idx, 1)[0];
            this.spent.push({ seat, tile });
            s.lastAction = 'joker';
            this.emit('joker', { seat, tile, left: s.rack.length });
            if (!s.rack.length) return this.checkOut(seat);
            return this.endTurn(seat, false);
        }

        /** Nothing to play. The rack is frozen and counted at the end. */
        doFold(seat) {
            if (this.mustOpen(seat)) return false;      // lay the run first
            const s = this.seats[seat];
            s.folded = true;
            s.lastAction = 'fold';
            this.emit('fold', { seat, left: s.rack.length });
            return this.endTurn(seat, true);
        }

        /** Seats still in the hand, in turn order from `from`. */
        nextLive(from) {
            for (let k = 1; k <= this.seats.length; k++) {
                const i = (from + k) % this.seats.length;
                if (!this.seats[i].folded) return i;
            }
            return -1;
        }

        /** A rack down to nothing ends the round on the spot. */
        checkOut(seat) {
            if (this.seats[seat].rack.length) return true;
            this.winner = seat;
            this.emit('out', { seat });
            this.finishRound();
            return true;
        }

        /**
         * The hand runs until everybody has folded or somebody goes out.
         * There is no stall to detect any more: a seat that cannot move does
         * not sit there passing, it folds and stops being asked.
         */
        endTurn(seat, folded) {
            const next = this.nextLive(seat);
            if (next < 0) {
                this.emit('stalled', {});
                this.finishRound();
                return true;
            }
            this.turn = next;
            this.emit('turn', { seat: this.turn });
            return true;
        }

        /* ---- the count ------------------------------------------------------- */

        /**
         * **Two settlements, and they are not the same game.**
         *
         * The **hand** pays one way: the fewest points left wins, and the
         * three behind pay 3, 2 and 1 stakes to them by how much they are
         * holding — 大哥 the most, then 二哥, then 小哥. A hand that ends
         * early pays flat instead: going out is 5 stakes from everybody, and
         * a 天胡 dealt in one piece is 10. Neither of those is scaled by
         * anybody's points, because neither gave the table a chance to play.
         *
         * The **side count** pays the other way, and it runs whatever the
         * hand did: jokers and aces are counted in pieces (see
         * `Lami.pieces`), every player settles head to head with every
         * other, and whoever holds more collects half a stake for each piece
         * of difference. Somebody can win the hand and lose money on the
         * side, which is the point of it — the ace you were told to throw is
         * the ace that pays you.
         *
         * Nobody ever hands over more than they are sitting on, so the whole
         * thing is trimmed to what is there before a coin moves.
         */
        finishRound() {
            for (const s of this.seats) {
                s.points = L.handPoints(s.rack);
                s.pieces = L.pieces(s.rack);
            }

            const owed = this.seats.map(() => 0);   // negative = pays
            const n = this.seats.length;

            /* --- the hand ---------------------------------------------------- */
            // Going out is paid flat by everybody — it is a bonus for
            // clearing the rack and has nothing to do with what anyone else
            // was holding.
            const flat = this.heaven >= 0 ? this.rules.heavenRatio
                : (this.winner >= 0 && !this.seats[this.winner].rack.length) ? this.rules.outRatio
                : 0;
            if (flat) {
                for (let i = 0; i < n; i++) {
                    if (i === this.winner) continue;
                    owed[i] -= flat * this.stake;
                    owed[this.winner] += flat * this.stake;
                }
            }

            /**
             * **And the ranking runs either way.**
             *
             * Fewest points wins; the rest pay by how much they are holding —
             * 小哥 one stake, 二哥 two, 大哥 three. A tie on points takes the
             * earlier seat, which is arbitrary and has to be *something*.
             *
             * This used to run only in a hand nobody won, so the moment
             * somebody went out the points stopped mattering at all: a seat
             * frozen on 131 points paid exactly what a seat on 41 paid, and
             * being 大哥 cost nothing. The flat rate is for going out; the
             * ranking is for what you are still holding. They are two
             * different questions and a hand can answer both.
             *
             * The seat that went out has an empty rack, so it sorts first and
             * collects — it is skipped rather than assumed to be `ranked[0]`,
             * because 天胡 sets a winner before anybody has played.
             */
            const ranked = this.seats.map((s) => s.index)
                .sort((a, b) => this.seats[a].points - this.seats[b].points || a - b);
            if (!flat) this.winner = ranked[0];
            const RATIO = this.rules.rankRatio;
            let place = 0;
            for (const i of ranked) {
                if (i === this.winner) continue;
                const pay = (RATIO[place] || 0) * this.stake;
                place++;
                owed[i] -= pay;
                owed[this.winner] += pay;
            }

            /* --- the side count ---------------------------------------------- */
            const half = this.rules.pieceRatio;
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const gap = this.seats[i].pieces - this.seats[j].pieces;
                    if (!gap) continue;
                    const pay = Math.round(Math.abs(gap) * half * this.stake);
                    const winner = gap > 0 ? i : j, loser = gap > 0 ? j : i;
                    owed[winner] += pay;
                    owed[loser] -= pay;
                }
            }

            /* --- nobody pays what they do not have --------------------------- */
            const stacks = this.seats.map((s) => s.coins);
            const paid = owed.slice();
            let short = 0;
            for (let i = 0; i < n; i++) {
                if (paid[i] >= 0) continue;
                const can = Math.min(-paid[i], stacks[i]);
                short += -paid[i] - can;
                paid[i] = -can;
            }
            // What could not be paid comes off the winners, largest first, so
            // the table still balances to zero.
            const takers = paid.map((v, i) => i).filter((i) => paid[i] > 0)
                .sort((a, b) => paid[b] - paid[a]);
            for (const i of takers) {
                if (short <= 0) break;
                const cut = Math.min(paid[i], short);
                paid[i] -= cut;
                short -= cut;
            }

            this.seats.forEach((s, i) => { s.net = paid[i]; s.coins = s.startCoins + paid[i]; });

            this.phase = 'over';
            this.emit('scored', {
                points: this.seats.map((s) => s.points),
                pieces: this.seats.map((s) => s.pieces),
                ranked, heaven: this.heaven,
            });
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
                hands: [],
                /**
                 * **What this seat was caught holding, and why it cost that.**
                 *
                 * The recap used to hand the rack over as `hands[0].tiles`,
                 * which the shared result screen draws through `CardView` —
                 * and a lami tile is not a card, so what it drew was nothing
                 * at all. Every seat's row was a name and a number with an
                 * empty space where the reason should be.
                 *
                 * `pieces` is split out rather than counted in place because
                 * it is settled separately and settles *against* the points:
                 * jokers and aces are 15 apiece, the most expensive tiles in
                 * the box, and holding more of them than the next player pays
                 * you. A player looking at one row of tiles cannot see which
                 * of the two numbers each tile landed in — so they go in
                 * their own group, and both counts are on the row.
                 */
                lami: {
                    rack: L.sort(s.rack),
                    pieces: s.rack.filter((x) => L.isJoker(x) || L.isAce(x)),
                    points: s.points,
                    count: s.pieces,
                    folded: !!s.folded,
                    out: !s.rack.length,
                },
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
                table: this.table.map((m) => ({ tiles: m.tiles.slice(), meld: m.meld, by: m.by, lo: m.lo })),
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
