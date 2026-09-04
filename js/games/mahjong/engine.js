/**
 * CardVerse — 麻将.
 *
 * Two modes, and they are two games rather than one game with a switch:
 *
 *     four seats   136 tiles   东 南 西 北
 *     three seats  108 tiles   东 南 西, and the characters are cut to 1 and 9
 *
 * Thirteen tiles each, fourteen for the dealer, and the dealer throws first.
 * Draw, claim, discard, until somebody's hand is four melds and a pair — or
 * one of the two special shapes — or the wall runs out and it is 流局.
 *
 * The parts worth reading:
 *
 *  - **Claims are resolved by priority, not by who shouted first.** 胡 beats
 *    碰 and 杠, which beat 吃, and 吃 is only ever available to the seat whose
 *    turn it would have been anyway. The engine walks the claimants in that
 *    order and asks each in turn.
 *  - **A kong draws a replacement.** Four tiles leave the hand and one comes
 *    back, which is why a hand with kongs still counts out correctly.
 *  - **番 and payment are separate.** `fan.js` says what the hand contained;
 *    `pay.js` says what that is worth. Neither knows about the other.
 *
 * Virtual chips only, and no seat can be taken below zero.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const MJ = CV.MJ;
    const W  = CV.MJWin;

    const HAND = 13;

    /** 胡 first, then 杠 and 碰 together, then 吃. */
    const PRIORITY = { win: 3, kong: 2, pung: 2, chow: 1 };

    class MahjongEngine extends CV.GameEngine {

        static get code() { return 'mahjong'; }
        static get publicConfig() { return ['room', 'unitStep', 'players']; }

        static get defaults() {
            // unitStep multiplies the room's base stake: 2, 5 or 10, which is
            // the 0.20 / 0.50 / 1.00 shape the table is normally played at.
            return { room: 'beginner', shoe: null, keepDealerOnDraw: true, unitStep: 2 };
        }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.players = this.seats.length;
            this.profile = CV.MJPay.profileFor(this.players);
            /** Coins one fan is worth at this table. */
            this.unit = CV.MJPay.unitFor(this.players, room.bet[0], this.config.unitStep);
            this.stake = this.unit;
            this.bao = false;
            this.payFan = 0;

            this.wall = [];
            this.lastDiscard = null;     // { tile, from }
            this.pending = [];           // claimants still to be asked
            this.claimAt = 0;
            this.winner = -1;
            this.winFrom = -1;
            this.winHand = null;
            this.fan = null;
            this.drawn = false;          // 流局
            this.cached = null;

            const carried = this.config.shoe;
            this.dealer = carried && Number.isInteger(carried.dealer)
                ? carried.dealer % this.players : 0;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.hand = [];
                s.melds = [];
                s.discards = [];
                s.lastAction = null;
            }
        }

        /** The floor a hand has to clear before it may be declared at all. */
        get minFan() { return this.profile.minFan; }

        /** East keeps the seat if East wins; otherwise it moves on. */
        get shoeState() {
            const keep = this.winner === this.dealer
                || (this.drawn && this.config.keepDealerOnDraw);
            return { dealer: keep ? this.dealer : (this.dealer + 1) % this.players };
        }

        get wallLeft() { return this.wall.length; }

        /* ---- the deal ---------------------------------------------------------- */

        start() {
            this.wall = MJ.build(this.players);
            this.rng.shuffle(this.wall);

            for (let k = 0; k < HAND; k++) {
                for (let i = 0; i < this.players; i++) {
                    this.seats[(this.dealer + i) % this.players].hand.push(this.wall.pop());
                }
            }
            // East takes one more and throws first.
            this.seats[this.dealer].hand.push(this.wall.pop());
            for (const s of this.seats) s.hand = MJ.sort(s.hand);

            this.phase = 'discard';
            this.turn = this.dealer;
            this.round = 1;
            this.emit('deal', { dealer: this.dealer, players: this.players, wall: this.wall.length });
            this.emit('turn', { seat: this.turn, drew: null });
        }

        counts(seat) { return MJ.counts(this.seats[seat].hand); }

        /* ---- what a seat may do -------------------------------------------------- */

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];
            const s = this.seats[seat];

            if (this.phase === 'discard') {
                const out = [];
                // 自摸 — the hand is complete AND worth enough to declare.
                const mine = this.winFor(seat, null);
                if (mine && mine.ok) out.push({ type: 'win', label: t('mj.win') });
                for (const key of this.kongKeys(seat)) out.push({ type: 'kong', key, label: t('mj.kong') });
                // Every tile is a legal throw, so every tile is listed.
                for (const tile of s.hand) out.push({ type: 'discard', tile: tile.id });
                return out;
            }

            if (this.phase === 'claim') {
                const entry = this.pending[this.claimAt];
                if (!entry || entry.seat !== seat) return [];
                return entry.options.concat([{ type: 'pass', label: t('mj.pass') }]);
            }
            return [];
        }

        /** Kongs this seat could declare on its own turn. */
        kongKeys(seat) {
            const s = this.seats[seat];
            const cnt = this.counts(seat);
            const out = [];
            for (const [key, n] of cnt) if (n === 4) out.push(key);          // concealed
            for (const meld of s.melds) {                                     // added to a pung
                if (meld.type === 'pung' && (cnt.get(meld.key) || 0) >= 1) out.push(meld.key);
            }
            return [...new Set(out)];
        }

        handle(action) {
            const seat = action.seat;
            if (this.phase === 'discard') {
                if (action.type === 'win')     return this.declareWin(seat, null);
                if (action.type === 'kong')    return this.doKong(seat, action.key);
                if (action.type === 'discard') return this.doDiscard(seat, action.tile);
                return false;
            }
            if (this.phase === 'claim') {
                if (action.type === 'pass') return this.nextClaimant();
                return this.doClaim(seat, action);
            }
            return false;
        }

        /* ---- discarding and claiming ---------------------------------------------- */

        doDiscard(seat, id) {
            const s = this.seats[seat];
            const idx = s.hand.findIndex((x) => x.id === id);
            if (idx < 0) return false;
            const tile = s.hand.splice(idx, 1)[0];
            s.discards.push(tile);
            s.lastAction = 'discard';
            this.lastDiscard = { tile, from: seat };
            this.emit('discard', { seat, tile });

            this.pending = this.findClaims(tile, seat);
            if (!this.pending.length) return this.drawFor((seat + 1) % this.players);
            this.phase = 'claim';
            this.claimAt = 0;
            this.turn = this.pending[0].seat;
            this.emit('claimable', { seat: this.turn, tile });
            return true;
        }

        /**
         * Who could take this tile, strongest claim first. 吃 is only offered
         * to the seat immediately after the thrower, which is also the only
         * seat that loses nothing by taking it.
         */
        findClaims(tile, from) {
            const key = MJ.key(tile);
            const suit = tile.suit, n = tile.n;
            const out = [];

            for (let step = 1; step < this.players; step++) {
                const i = (from + step) % this.players;
                const s = this.seats[i];
                const cnt = MJ.counts(s.hand);
                const held = cnt.get(key) || 0;
                const options = [];

                const hu = this.winFor(i, tile);
                if (hu && hu.ok) options.push({ type: 'win', label: t('mj.win') });
                if (held >= 3) options.push({ type: 'kong', label: t('mj.kong') });
                if (held >= 2) options.push({ type: 'pung', label: t('mj.pung') });

                if (step === 1 && suit !== 'z') {
                    for (const lo of [n - 2, n - 1, n]) {
                        if (lo < 1 || lo + 2 > 9) continue;
                        const need = [lo, lo + 1, lo + 2].filter((x) => x !== n);
                        if (need.every((x) => (cnt.get(suit + x) || 0) > 0)) {
                            options.push({ type: 'chow', low: suit + lo, label: t('mj.chow') });
                        }
                    }
                }
                if (options.length) {
                    out.push({
                        seat: i, options,
                        rank: Math.max(...options.map((o) => PRIORITY[o.type])),
                        step,
                    });
                }
            }
            return out.sort((a, b) => b.rank - a.rank || a.step - b.step);
        }

        nextClaimant() {
            this.claimAt++;
            if (this.claimAt < this.pending.length) {
                this.turn = this.pending[this.claimAt].seat;
                this.emit('claimable', { seat: this.turn, tile: this.lastDiscard.tile });
                return true;
            }
            const from = this.lastDiscard.from;
            this.pending = [];
            return this.drawFor((from + 1) % this.players);
        }

        doClaim(seat, action) {
            const { tile, from } = this.lastDiscard;
            if (action.type === 'win') return this.declareWin(seat, from);

            const s = this.seats[seat];
            const take = (key, howMany) => {
                const got = [];
                for (let i = s.hand.length - 1; i >= 0 && got.length < howMany; i--) {
                    if (MJ.key(s.hand[i]) === key) got.push(s.hand.splice(i, 1)[0]);
                }
                return got;
            };

            // The tile leaves the thrower's pile — it is on the table now.
            this.seats[from].discards.pop();

            let meld;
            if (action.type === 'pung') {
                meld = { type: 'pung', key: MJ.key(tile), tiles: take(MJ.key(tile), 2).concat([tile]), concealed: false, from };
            } else if (action.type === 'kong') {
                meld = { type: 'kong', key: MJ.key(tile), tiles: take(MJ.key(tile), 3).concat([tile]), concealed: false, from };
            } else if (action.type === 'chow') {
                const suit = action.low[0], lo = Number(action.low.slice(1));
                const tiles = [];
                for (let x = lo; x <= lo + 2; x++) {
                    const k = suit + x;
                    if (k === MJ.key(tile)) tiles.push(tile);
                    else tiles.push(take(k, 1)[0]);
                }
                if (tiles.some((x) => !x)) return false;
                meld = { type: 'chow', key: action.low, tiles, concealed: false, from };
            } else return false;

            s.melds.push(meld);
            s.lastAction = action.type;
            this.pending = [];
            this.emit('meld', { seat, meld });

            if (meld.type === 'kong') return this.replacement(seat);
            this.phase = 'discard';
            this.turn = seat;
            this.emit('turn', { seat, drew: null });
            return true;
        }

        /* ---- drawing --------------------------------------------------------------- */

        drawFor(seat) {
            if (!this.wall.length) return this.exhausted();
            const tile = this.wall.pop();
            this.seats[seat].hand = MJ.sort(this.seats[seat].hand.concat([tile]));
            this.phase = 'discard';
            this.turn = seat;
            this.emit('turn', { seat, drew: tile, wall: this.wall.length });
            return true;
        }

        /** A kong takes four tiles off the table, so one comes back. */
        replacement(seat) {
            if (!this.wall.length) return this.exhausted();
            const tile = this.wall.pop();
            this.seats[seat].hand = MJ.sort(this.seats[seat].hand.concat([tile]));
            this.phase = 'discard';
            this.turn = seat;
            this.emit('replace', { seat, tile, wall: this.wall.length });
            return true;
        }

        doKong(seat, key) {
            const s = this.seats[seat];
            const cnt = this.counts(seat);
            const pung = s.melds.find((m) => m.type === 'pung' && m.key === key);

            if (pung && (cnt.get(key) || 0) >= 1) {
                // 加杠 — the fourth tile joins a pung already on the table.
                const idx = s.hand.findIndex((x) => MJ.key(x) === key);
                pung.tiles.push(s.hand.splice(idx, 1)[0]);
                pung.type = 'kong';
                this.emit('meld', { seat, meld: pung, added: true });
            } else if ((cnt.get(key) || 0) === 4) {
                const tiles = [];
                for (let i = s.hand.length - 1; i >= 0; i--) {
                    if (MJ.key(s.hand[i]) === key) tiles.push(s.hand.splice(i, 1)[0]);
                }
                const meld = { type: 'kong', key, tiles, concealed: true, from: seat };
                s.melds.push(meld);
                this.emit('meld', { seat, meld });
            } else return false;

            s.lastAction = 'kong';
            return this.replacement(seat);
        }

        /* ---- the end ---------------------------------------------------------------- */

        exhausted() {
            this.drawn = true;
            this.phase = 'over';
            this.emit('exhausted', {});
            this.finish();
            return true;
        }

        /**
         * @param {number} seat the winner
         * @param {number|null} from the seat that threw the tile, null for 自摸
         */
        /**
         * What `seat` would hold if it took `tile` — or what it holds now, for
         * a self draw. `ok` is false when the shape wins but the hand does not
         * clear the table's minimum, which is a real state the screen has to
         * show: a winning hand you are not allowed to declare.
         */
        winFor(seat, tile) {
            const s = this.seats[seat];
            const tiles = tile ? s.hand.concat([tile]) : s.hand;
            const shape = W.isWin(MJ.counts(tiles), s.melds.length);
            if (!shape) return null;

            const hand = {
                shape: shape.shape,
                melds: s.melds.map((m) => ({ type: m.type, key: m.key })).concat(shape.melds || []),
                pair: shape.pair,
                keys: tiles.map(MJ.key).concat(s.melds.flatMap((m) => m.tiles.map(MJ.key))),
                selfDraw: !tile,
                menzen: s.melds.every((m) => m.concealed),
                quad: !!shape.quad,
            };
            const fan = CV.MJFan.calculateFan(hand);
            return { shape, hand, fan, tiles, ok: CV.MJPay.canWin(this.players, fan.totalFan) };
        }

        declareWin(seat, from) {
            const selfDraw = from === null;
            const got = this.winFor(seat, selfDraw ? null : this.lastDiscard.tile);
            if (!got || !got.ok) return false;

            if (!selfDraw) this.seats[from].discards.pop();

            this.winner = seat;
            this.winFrom = selfDraw ? -1 : from;
            this.winTiles = got.tiles;
            this.winHand = got.hand;
            this.fan = got.fan;

            // Fan first, then what it is worth. The two never meet.
            const paid = CV.MJPay.settle({
                players: this.players, winner: seat, from: this.winFrom,
                fan: this.fan.totalFan, unit: this.unit,
            });
            this.bao = paid.bao;
            this.payFan = paid.payFan;
            const net = CV.MJPay.clamp(paid.deltas, this.seats.map((x) => x.coins), seat);
            this.seats.forEach((x, i) => { x.net = net[i]; x.coins = x.startCoins + net[i]; });

            this.phase = 'over';
            this.emit('hu', {
                seat, from: this.winFrom, fan: this.fan,
                bao: this.bao, payFan: this.payFan, tiles: got.tiles,
            });
            this.finish();
            return true;
        }

        result() {
            if (this.cached) return this.cached;
            const rows = this.seats.map((s, i) => ({
                seat: i,
                name: s.name,
                coins: s.net,
                stake: this.stake * (this.fan ? this.fan.totalFan : 0),
                score: i === this.winner ? Math.min(500, (this.fan ? this.fan.totalFan : 0) * 25) : 0,
                ratio: s.net,
                outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                note: this.drawn ? t('mj.drawn')
                    : i === this.winner ? this.fan.patterns.map((p) => p.name).join(' · ')
                    : i === this.winFrom ? t('mj.dealtIn') : t('mj.lost'),
                // The shared recap draws playing cards, and a tile is not
                // one. The winning hand is named in `note` and stays on the
                // table behind the overlay.
                hands: [],
                extra: {
                    mjRounds: 1,
                    mjWins: i === this.winner ? 1 : 0,
                    mjSelfDraw: (i === this.winner && this.winFrom < 0) ? 1 : 0,
                    mjDealtIn: i === this.winFrom ? 1 : 0,
                    mjDraws: this.drawn ? 1 : 0,
                    mjFan: i === this.winner ? this.fan.totalFan : 0,
                    mjBig: (i === this.winner && this.fan.totalFan >= 8) ? 1 : 0,
                    mjBao: (i === this.winner && this.bao) ? 1 : 0,
                    mjKongs: s.melds.filter((m) => m.type === 'kong').length,
                    forfeits: 0,
                },
            }));

            rows.sort((a, b) => b.coins - a.coins);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.coins !== last) { place = idx + 1; last = r.coins; } r.rank = place; });

            this.cached = new CV.GameResult({
                ranks: rows,
                draw: this.drawn,
                detail: this.drawn
                    ? t('mj.detailDraw')
                    : t('mj.detailWin', {
                        name: this.seats[this.winner].name,
                        how: t(this.winFrom < 0 ? 'mj.selfDraw' : 'mj.byDiscard'),
                        n: this.fan.totalFan,
                    }) + (this.bao ? ' · ' + t('mj.bao', { n: this.payFan }) : ''),
            });
            return this.cached;
        }

        /* ---- state --------------------------------------------------------------- */

        snapshot() {
            return Object.assign(super.snapshot(), {
                dealer: this.dealer,
                players: this.players,
                wall: this.wall.length,
                lastDiscard: this.lastDiscard && {
                    tile: this.lastDiscard.tile, from: this.lastDiscard.from,
                },
                winner: this.winner, winFrom: this.winFrom, drawn: this.drawn,
                fan: this.fan, bao: this.bao, unit: this.unit, minFan: this.minFan,
            });
        }

        /** Concealed tiles are concealed. Melds and discards are on the table. */
        redactSeat(seat, index, viewer) {
            if (index === viewer) return seat;
            const open = this.over && index === this.winner;
            return Object.assign({}, seat, {
                hand: open ? seat.hand.slice() : seat.hand.map(() => null),
            });
        }
    }

    CV.MahjongEngine = MahjongEngine;
})();
