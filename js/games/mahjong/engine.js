/**
 * CardVerse — 麻将.
 *
 * Two modes, and they are two games rather than one game with a switch:
 *
 *     four seats   136 tiles   东 南 西 北
 *                              no flowers, no fly, no minimum
 *     three seats  72 + fly    东 南 西 — dots, winds, dragons and eight
 *                              flowers. No characters and no bamboo at all.
 *                              2番 to declare, and 爆番 over ten.
 *
 * `MODES` below is the whole difference, in the shape the rules give it, and
 * nothing outside it branches on the seat count. That is deliberate: the
 * three-player fly must never be able to reach the four-player game.
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

    /**
     * One configuration per mode, laid out the way the rules do.
     *
     * `flyUnit` is here and unused. The rules fix a fly at RM0.50 but leave
     * who pays it, when, and to whom still to be decided, and say plainly not
     * to assume — so it is carried and not spent. When the settlement arrives
     * it goes into `pay.js` beside the fan table.
     */
    const MODES = {
        3: {
            mode: '3P', players: 3,
            flyEnabled: true, dunFlyEnabled: true,
            flowers: 8,
            // **七对子 is not played here.** Not "scored at zero" — not a
            // hand. See `MJWin.isWin`: a table that leaves the shape in and
            // takes it out of the fan table lets a player declare a hand
            // worth nothing and then refuses it at the floor, with nothing
            // on screen to say why their seven pairs were not a win.
            shapes: { pairs: false, orphans: true },
            // The floor, and it is the pay profile's floor: `minFan` is what
            // the screen prints and `MJPay.canWin` is what actually refuses a
            // declaration, so the two disagreeing would show a player a
            // number the table does not go by. The smoke test holds them
            // together. 5番, against a table where an ordinary hand with a
            // triplet in it is 鸡胡 1番 — the floor is what makes 平胡,
            // 碰碰胡 and the flowers worth building towards. See fan.js.
            minimumFan: 5, baoFanThreshold: 10, baoFanPayment: 20,
            flyUnit: 5,        // coins, the shape of RM0.50 — not yet settled
        },
        4: {
            mode: '4P', players: 4,
            flyEnabled: false, dunFlyEnabled: false,
            flowers: 0,
            shapes: { pairs: true, orphans: true },
            minimumFan: 0, baoFanThreshold: 10, baoFanPayment: 20,
            flyUnit: 0,
        },
    };

    class MahjongEngine extends CV.GameEngine {

        static get code() { return 'mahjong'; }
        static get publicConfig() { return ['room', 'unitStep', 'players', 'manualDraw']; }

        static get defaults() {
            // unitStep multiplies the room's base stake: 2, 5 or 10, which is
            // the 0.20 / 0.50 / 1.00 shape the table is normally played at.
            return { room: 'beginner', shoe: null, keepDealerOnDraw: true, unitStep: 2, manualDraw: 0 };
        }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.players = this.seats.length;
            this.mode = Object.assign({}, MODES[this.players] || MODES[4], this.config.mode || {});
            this.pool = MJ.keysFor(this.players);
            /** Which non-standard hands this table plays. See `MJWin.isWin`. */
            this.shapes = this.mode.shapes || { pairs: true, orphans: true };
            /** Whether a seat played from this browser draws its own tile. */
            this.manualDraw = !!this.config.manualDraw;
            this.profile = CV.MJPay.profileFor(this.players);
            // One fan table per mode, because the two modes are played out of
            // different boxes: 混一色 describes the three-player box rather
            // than a hand, so that table does not hold it. See fan.js.
            this.fanTable = CV.MJFan.tableFor(this.players);
            /** Coins one fan is worth at this table. */
            this.unit = CV.MJPay.unitFor(this.players, room.bet[0], this.config.unitStep);
            this.stake = this.unit;
            this.bao = false;
            this.payFan = 0;

            this.wall = [];
            this.lastDiscard = null;     // { tile, from }
            this.drew = null;            // the tile the seat in play just drew
            this.winTile = null;         // the tile the hand went out on
            this.pending = [];           // claimants still to be asked
            this.claimAt = 0;
            this.claimed = false;        // this seat took the tile, it did not draw
            this.robbing = null;         // 抢杠 in progress: { seat, key }
            this.robbed = false;         // the hand was won off somebody's 加杠
            this.winner = -1;
            this.winFrom = -1;
            this.winHand = null;
            this.fan = null;
            this.drawn = false;          // 流局
            this.cached = null;

            const carried = this.config.shoe;
            this.dealer = carried && Number.isInteger(carried.dealer)
                ? carried.dealer % this.players : 0;
            /**
             * **连庄** — how many hands running this seat has held the deal.
             *
             * 1 is the first hand of a new dealer. It is carried between
             * hands rather than counted here, because an engine only ever
             * sees one hand: the streak is the one thing about the dealer
             * that a single hand cannot know, and it is exactly the thing
             * the table talks about.
             */
            this.dealerRun = carried && Number.isInteger(carried.run) ? carried.run : 1;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.hand = [];
                s.melds = [];
                s.discards = [];
                s.flowers = [];
                s.lastAction = null;
            }
        }

        /** The floor a hand has to clear before it may be declared at all. */
        get minFan() { return this.mode.minimumFan; }

        /**
         * The three numbers a screen needs off the mode, as flat values.
         *
         * A guest's engine is a snapshot wearing the engine's read surface,
         * and a snapshot carries values, not the mode object. Reading them
         * through a getter here and sending the same names on the wire means
         * the table screen asks the same question of both.
         */
        get flyOn()  { return !!this.mode.flyEnabled; }
        get baoAt()  { return this.mode.baoFanThreshold; }
        get baoPay() { return this.mode.baoFanPayment; }

        /** Flies in a seat's hand — wild at three seats, absent at four. */
        wildsIn(seat) { return this.mode.flyEnabled ? MJ.split(this.seats[seat].hand).wilds : 0; }

        /** The wind this seat is sitting on, as an index into 东南西北. */
        windOf(seat) { return (seat - this.dealer + this.players) % this.players; }

        /**
         * **A flower belongs to a wind, and pays the seat sitting on it.**
         *
         * The eight flowers are two suits of four — 春夏秋冬 and 梅兰菊竹 —
         * and both suits are numbered for the same four winds: 春 and 梅 are
         * East's, 夏 and 兰 are South's, 秋 and 菊 are West's, 冬 and 竹 are
         * North's. Drawing somebody else's flower is not a bonus, it is a
         * replacement tile and a piece of information for the table.
         *
         * A wind **no seat is sitting on** belongs to nobody, so it pays
         * whoever turns it: at three seats there is no North, and North's two
         * flowers would otherwise be two tiles in the box that could never be
         * worth anything to anyone.
         *
         * `flowerFanFor` counts the ones that pay. The raw `flowers.length`
         * is still what 无花 is about — a box full of other people's flowers
         * is not an empty box.
         */
        flowerFanFor(seat) {
            const wind = this.windOf(seat);
            return this.seats[seat].flowers.filter((f) => {
                const owner = (f.n - 1) % 4;
                return owner >= this.players || owner === wind;
            }).length;
        }

        /**
         * East keeps the seat if East wins; otherwise it moves on — and the
         * 连庄 count goes with it, one longer for a seat that held on and
         * back to one for a seat that has just taken over.
         */
        get shoeState() {
            const keep = this.winner === this.dealer
                || (this.drawn && this.config.keepDealerOnDraw);
            return {
                dealer: keep ? this.dealer : (this.dealer + 1) % this.players,
                run: keep ? this.dealerRun + 1 : 1,
            };
        }

        get wallLeft() { return this.wall.length; }

        /* ---- the deal ---------------------------------------------------------- */

        start() {
            this.wall = MJ.build(this.players, {
                fly: this.mode.flyEnabled ? MJ.FLY_COUNT : 0,
                flowers: this.mode.flowers,
            });
            this.rng.shuffle(this.wall);

            for (let k = 0; k < HAND; k++) {
                for (let i = 0; i < this.players; i++) {
                    this.seats[(this.dealer + i) % this.players].hand.push(this.wall.pop());
                }
            }
            // East takes one more and throws first.
            this.seats[this.dealer].hand.push(this.wall.pop());
            for (let i = 0; i < this.players; i++) this.clearFlowers(i);
            // East's fourteenth tile — or whatever replaced it, if it turned
            // out to be a flower. A dealt hand can already be a win, and with
            // flies in the box that is not even rare; without this the tile
            // the hand went out on was recorded as nothing at all.
            const east = this.seats[this.dealer].hand;
            this.drew = east[east.length - 1] || null;
            for (const s of this.seats) s.hand = MJ.sort(s.hand);

            this.phase = 'discard';
            this.turn = this.dealer;
            this.round = 1;
            // How many tiles have been thrown this hand. 天胡 is the dealer
            // going out on none, 地胡 is anybody else going out on the
            // dealer's first — the two hands that are over before the game
            // has really started, and neither can be read off the tiles.
            this.plays = 0;
            this.emit('deal', { dealer: this.dealer, players: this.players, wall: this.wall.length });
            this.emit('turn', { seat: this.turn, drew: null });
        }

        counts(seat) { return MJ.counts(this.seats[seat].hand); }

        /**
         * A flower is never part of a hand, so it is set aside and replaced.
         *
         * The rules put eight flowers in the three-player set and say nothing
         * about what they do, and a tile that sat in a hand doing nothing
         * would make the game unwinnable — so this is the universal handling
         * and nothing more: set aside, draw again, score nothing.
         */
        clearFlowers(seat) {
            const s = this.seats[seat];
            for (;;) {
                const idx = s.hand.findIndex(MJ.isFlower);
                if (idx < 0) return true;
                s.flowers.push(s.hand.splice(idx, 1)[0]);
                if (!this.wall.length) return false;
                s.hand.push(this.wall.pop());
                this.emit('flower', { seat, n: s.flowers.length });
            }
        }

        /* ---- what a seat may do -------------------------------------------------- */

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];
            const s = this.seats[seat];

            if (this.phase === 'discard') {
                const out = [];
                // 自摸 — the hand is complete AND worth enough to declare.
                //
                // Only off a tile this seat drew. A 碰 or a 吃 can finish a
                // hand too, and the seat is then sitting on fourteen tiles
                // that read as a win — but it is not a self draw, it is a
                // hand that should have said 胡 to the discard instead of
                // 碰. Scoring it as 自摸 paid the wrong 番 out of the wrong
                // pockets, and at a table with a floor it laundered a hand
                // that had just been refused: 胡 denied at 1番, take the 碰,
                // declare the same tiles as 自摸 for 2番. A kong is not a
                // claim in this sense — it draws a replacement, and going
                // out on that is 杠上开花.
                const mine = this.claimed ? null : this.winFor(seat, null);
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

            // Manual draw: one thing to do, and the hand cannot be thrown
            // from until it is done. Listing the tiles here would offer a
            // discard off thirteen.
            if (this.phase === 'draw') return [{ type: 'draw', label: t('mj.draw') }];
            return [];
        }

        /**
         * Kongs this seat could declare on its own turn.
         *
         * None at all once the wall is dry: a kong takes four tiles off the
         * table and draws one back, and there is nothing to draw. Offering it
         * anyway made 杠 a button that ended the hand in 流局 on the spot,
         * which is a way out for a seat about to lose rather than a move.
         */
        kongKeys(seat) {
            if (!this.wall.length) return [];
            const s = this.seats[seat];
            const cnt = this.counts(seat);
            const out = [];
            for (const [key, n] of cnt) if (n === 4) out.push(key);          // concealed
            for (const meld of s.melds) {                                     // added to a pung
                // Not onto a 碰 that was made with a fly: the result is a
                // kong with a wild in it, which is the thing a fly may not
                // be part of however it got there.
                if (meld.type !== 'pung' || meld.tiles.some(MJ.isFly)) continue;
                if ((cnt.get(meld.key) || 0) >= 1) out.push(meld.key);
            }
            return [...new Set(out)];
        }

        handle(action) {
            const seat = action.seat;
            if (this.phase === 'draw') {
                if (action.type !== 'draw' || seat !== this.turn) return false;
                return this.takeTile(seat);
            }
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
            this.plays++;
            // The turn this seat took off a claim is over. Left standing, the
            // flag would describe a seat that is no longer in play, and the
            // next reader of it would be reading the wrong seat's history.
            this.claimed = false;
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
         * Who could take a thrown 飞, and as what.
         *
         * A wild in the pool has no key of its own, so unlike every other
         * claim the *meld* has to be named: "碰 中" and "碰 发" are two
         * different claims on the same tile, and the seat picks. That is why
         * these options carry a `key` and a label that says which tile they
         * would make.
         *
         * The rest of the hand has to be real. A 碰 wants two genuine copies
         * and a 吃 two genuine neighbours — the seat's own flies are not
         * spent here, because a meld made of a thrown wild and a held wild is
         * two wild cards buying one meld, and both of them were worth more as
         * the tiles the hand was actually missing.
         *
         * No 杠: a kong is four real tiles wherever it comes from.
         */
        flyClaims(tile, from) {
            if (!this.mode.flyEnabled) return [];
            const out = [];
            for (let step = 1; step < this.players; step++) {
                const i = (from + step) % this.players;
                const s = this.seats[i];
                const cnt = MJ.counts(s.hand);
                const options = [];
                const named = (key) => MJ.name(MJ.parse(key));

                const hu = this.winFor(i, tile);
                if (hu && hu.ok) options.push({ type: 'win', label: t('mj.win') });

                // 碰 — every pair in hand is a different claim on this tile.
                for (const [key, n] of cnt) {
                    if (n >= 2) options.push({ type: 'pung', key, label: t('mj.pung') + ' ' + named(key) });
                }

                // 吃 — the seat after the thrower, and only in a numbered
                // suit. The fly fills the one rung of the run it is missing.
                if (step === 1) {
                    for (const suit of ['m', 's', 'p']) {
                        for (let lo = 1; lo + 2 <= 9; lo++) {
                            const run = [lo, lo + 1, lo + 2].map((x) => suit + x);
                            if (!this.pool.includes(run[0])) break;
                            const short = run.filter((k) => !(cnt.get(k) || 0));
                            if (short.length !== 1) continue;
                            // Named by the run, not by the rung the fly
                            // fills: 1-2-3 and 2-3-4 are both short a 2筒
                            // from a hand holding 3筒 4筒, and two buttons
                            // reading "吃 2筒" are two different melds
                            // wearing one name.
                            options.push({ type: 'chow', low: suit + lo,
                                           label: t('mj.chow') + ' ' + lo + (lo + 1)
                                                  + named(suit + (lo + 2)) });
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

        /**
         * Who could take this tile, strongest claim first. 吃 is only offered
         * to the seat immediately after the thrower, which is also the only
         * seat that loses nothing by taking it.
         */
        findClaims(tile, from) {
            // **A thrown 飞 is claimable**, because it is still wild lying in
            // the pool. It used to fall through the `isPlaying` guard below
            // and offer nothing at all, which made the most useful tile in
            // the box the one tile nobody could take: a seat one tile from
            // home watched a wild card go past and was not asked. It is the
            // same claim as any other, with the fly standing in for whatever
            // the meld is short of — 顿飞.
            if (MJ.isFly(tile)) return this.flyClaims(tile, from);
            if (!MJ.isPlaying(tile)) return [];
            const key = MJ.key(tile);
            const suit = tile.suit, n = tile.n;
            const out = [];

            for (let step = 1; step < this.players; step++) {
                const i = (from + step) % this.players;
                const s = this.seats[i];
                const cnt = MJ.counts(s.hand);
                const held = cnt.get(key) || 0;
                // 飞 stands in for any tile the set holds, and a claim is no
                // exception: 中 and a fly take a thrown 中. It counted in a
                // finished hand and nowhere else, so a player holding the
                // pair the tile completed was told the claim was not there.
                const wilds = this.wildsIn(i);
                const options = [];

                const hu = this.winFor(i, tile);
                if (hu && hu.ok) options.push({ type: 'win', label: t('mj.win') });
                // **A 杠 is four real tiles.** A fly may stand in for a tile
                // in a 碰 and in a finished hand, but not here: a kong is a
                // claim on all four copies of one tile, and three copies plus
                // a wild is a claim on three. It also pays — a kong draws a
                // replacement and counts towards 四杠子 — so a fly that could
                // be spent on it would be worth more as a kong than as
                // whatever the hand actually needed, which is backwards for a
                // tile whose whole job is to be the tile you are missing.
                //
                // A kong also needs a replacement tile to come back, so the
                // last few throws of a hand cannot be konged either.
                if (held >= 3 && this.wall.length) options.push({ type: 'kong', label: t('mj.kong') });
                if (held + wilds >= 2) options.push({ type: 'pung', label: t('mj.pung') });

                if (step === 1 && suit !== 'z') {
                    for (const lo of [n - 2, n - 1, n]) {
                        if (lo < 1 || lo + 2 > 9) continue;
                        const need = [lo, lo + 1, lo + 2].filter((x) => x !== n);
                        const short = need.filter((x) => !(cnt.get(suit + x) || 0)).length;
                        if (short <= wilds) {
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
                this.emit('claimable', {
                    seat: this.turn, tile: this.lastDiscard.tile, rob: !!this.robbing,
                });
                return true;
            }
            const from = this.lastDiscard.from;
            this.pending = [];
            // Nobody robbed it, so the kong stands and the seat carries on.
            if (this.robbing) {
                const { seat, key } = this.robbing;
                this.robbing = null;
                this.lastDiscard = null;
                return this.addKong(seat, key);
            }
            return this.drawFor((from + 1) % this.players);
        }

        doClaim(seat, action) {
            const { tile, from } = this.lastDiscard;
            if (action.type === 'win') return this.declareWin(seat, from);

            const s = this.seats[seat];
            /**
             * The tiles this seat puts down for the claim: its own copies
             * first, then a fly for each one it is short — which is what the
             * claim was offered on in the first place.
             *
             * `wild` is false for a 杠, which takes four real tiles and
             * nothing else. `findClaims` will not offer one that needs a
             * fly, so this is the same rule said twice on purpose: the
             * action can arrive from a guest's screen, and a rule enforced
             * only where the buttons are drawn is not enforced.
             */
            const take = (key, howMany, wild) => {
                const got = [];
                for (let i = s.hand.length - 1; i >= 0 && got.length < howMany; i--) {
                    if (MJ.key(s.hand[i]) === key) got.push(s.hand.splice(i, 1)[0]);
                }
                if (wild !== false) {
                    for (let i = s.hand.length - 1; i >= 0 && got.length < howMany; i--) {
                        if (MJ.isFly(s.hand[i])) got.push(s.hand.splice(i, 1)[0]);
                    }
                }
                // Anything taken and not used goes back, or a refused claim
                // costs the seat the tiles it was about to lay down.
                if (got.length === howMany) return got;
                for (const x of got) s.hand.push(x);
                return null;
            };

            // A thrown 飞 has no key of its own, so the claim names the meld
            // it is being taken for — and the rest of that meld has to be
            // real, which is why nothing here falls back on the seat's own
            // flies when the tile on offer is already one.
            const wild = MJ.isFly(tile);

            let meld;
            if (action.type === 'pung' || action.type === 'kong') {
                const kong = action.type === 'kong';
                if (kong && wild) return false;          // a 杠 is four real tiles
                const key = wild ? action.key : MJ.key(tile);
                if (!key || !this.pool.includes(key)) return false;
                const mine = take(key, kong ? 3 : 2, !kong && !wild);
                if (!mine) return false;
                meld = { type: action.type, key, tiles: mine.concat([tile]),
                         concealed: false, from };
            } else if (action.type === 'chow') {
                /**
                 * **The two tiles that go down are the player's to name.**
                 *
                 * One thrown tile can be the bottom, the middle or the top
                 * of a run, and with a 飞 in hand it can be several of each
                 * — which is why a hand sitting on half a suit used to be
                 * offered three identical 吃 buttons and no way to tell them
                 * apart. The screen now asks for the tiles instead, and the
                 * claim arrives carrying them: `tiles` is two ids out of
                 * this seat's hand, and they are the two that are spent.
                 *
                 * A bare 吃 with no ids still works and is taken the way it
                 * always was — own copies first, a fly for anything short.
                 * The AI sends one, and so does a screen that predates this.
                 */
                // The claim names the run it is for, and it can arrive from
                // a guest's screen — so it is read, not trusted.
                if (typeof action.low !== 'string') return false;
                const suit = action.low[0], lo = Number(action.low.slice(1));
                const want = Array.isArray(action.tiles) ? action.tiles : null;
                const idx = [];
                if (want) {
                    if (want.length !== 2) return false;
                    for (const id of want) {
                        const at = s.hand.findIndex((x, j) => x.id === id && !idx.includes(j));
                        if (at < 0) return false;
                        idx.push(at);
                    }
                } else {
                    for (let x = lo; x <= lo + 2; x++) {
                        const k = suit + x;
                        if (!wild && k === MJ.key(tile)) continue;
                        // Real copies only while a wild is on offer: the fly
                        // in the pool takes the one rung the seat is missing,
                        // and a second wild has no rung left to take.
                        let at = s.hand.findIndex((y, j) => MJ.key(y) === k && !idx.includes(j));
                        if (at < 0 && !wild) {
                            at = s.hand.findIndex((y, j) => MJ.isFly(y) && !idx.includes(j));
                        }
                        if (at >= 0) idx.push(at);
                    }
                }
                // Nothing has left the hand yet, so a run that does not come
                // out needs nothing put back.
                const tiles = MJ.chowFill(action.low, idx.map((j) => s.hand[j]), tile);
                if (!tiles) return false;
                for (const j of idx.slice().sort((a, b) => b - a)) s.hand.splice(j, 1);
                meld = { type: 'chow', key: action.low, tiles, concealed: false, from };
            } else return false;

            // Only now does the tile leave the thrower's pile — a claim that
            // could not be assembled has to leave the pool exactly as it was,
            // and a 杠 that a fly is no longer allowed to fill is a claim
            // that can now fail this late.
            this.seats[from].discards.pop();
            s.melds.push(meld);
            s.lastAction = action.type;
            this.pending = [];
            // A claim ends with this seat on discard without having drawn:
            // it throws next, and it may not go out until it has drawn.
            // `replacement` clears this again for a kong.
            this.claimed = true;
            this.drew = null;
            this.emit('meld', { seat, meld });

            if (meld.type === 'kong') return this.replacement(seat);
            this.phase = 'discard';
            this.turn = seat;
            this.emit('turn', { seat, drew: null });
            return true;
        }

        /* ---- drawing --------------------------------------------------------------- */

        /**
         * **摸牌, by hand or by itself.**
         *
         * On auto the tile is simply taken and the seat is asked to throw —
         * which is the right default and the wrong feel: the draw is half of
         * playing mahjong, and a hand where fourteen tiles keep appearing is
         * a hand you are only ever tidying. On manual the seat is put in
         * front of the wall and left there, with the tile taken when it says
         * so. Nothing else changes: the same tile comes off the same wall in
         * the same order, so the mode is a matter of who presses the button
         * and never of what is drawn.
         *
         * Only for seats this browser plays by hand — an AI is never left
         * waiting on a button nobody is going to press, and a remote seat's
         * draw belongs to whoever is sitting at it.
         */
        drawFor(seat) {
            if (!this.wall.length) return this.exhausted();
            if (this.manualDraw && this.seats[seat].isHuman) {
                this.claimed = false;
                this.phase = 'draw';
                this.turn = seat;
                this.emit('turn', { seat, drew: null, wall: this.wall.length });
                return true;
            }
            return this.takeTile(seat);
        }

        /** The tile actually leaves the wall. */
        takeTile(seat) {
            if (!this.wall.length) return this.exhausted();
            const tile = this.wall.pop();
            this.seats[seat].hand.push(tile);
            if (!this.clearFlowers(seat)) return this.exhausted();
            this.seats[seat].hand = MJ.sort(this.seats[seat].hand);
            this.drew = tile;
            this.claimed = false;
            this.phase = 'discard';
            this.turn = seat;
            this.emit('turn', { seat, drew: tile, wall: this.wall.length });
            return true;
        }

        /** A kong takes four tiles off the table, so one comes back. */
        replacement(seat) {
            if (!this.wall.length) return this.exhausted();
            const tile = this.wall.pop();
            this.seats[seat].hand.push(tile);
            if (!this.clearFlowers(seat)) return this.exhausted();
            this.seats[seat].hand = MJ.sort(this.seats[seat].hand);
            this.drew = tile;
            // The replacement is a draw like any other, so a hand that goes
            // out on it is 自摸 — 杠上开花.
            this.claimed = false;
            this.phase = 'discard';
            this.turn = seat;
            this.emit('replace', { seat, tile, wall: this.wall.length });
            return true;
        }

        /**
         * 抢杠 — the seats that may take the fourth tile off a 加杠.
         *
         * Adding a tile to a pung already on the table puts it in the open
         * for a moment, and anyone whose hand that tile finishes may take it
         * as a discard would be taken. Without this a player waiting on the
         * one tile is simply never asked, and the hand they were owed is
         * swallowed by somebody else's kong. It applies to the added kong
         * only: a concealed kong is never robbed.
         */
        robbers(tile, from) {
            const out = [];
            for (let step = 1; step < this.players; step++) {
                const i = (from + step) % this.players;
                const hu = this.winFor(i, tile);
                if (hu && hu.ok) {
                    out.push({ seat: i, step, rank: PRIORITY.win,
                               options: [{ type: 'win', label: t('mj.win') }] });
                }
            }
            return out.sort((a, b) => a.step - b.step);
        }

        doKong(seat, key) {
            const s = this.seats[seat];
            const cnt = this.counts(seat);
            const pung = s.melds.find((m) => m.type === 'pung' && m.key === key);

            if (pung && (cnt.get(key) || 0) >= 1) {
                // 加杠, and it is offered around before it is made.
                const idx = s.hand.findIndex((x) => MJ.key(x) === key);
                const tile = s.hand[idx];
                const rob = this.robbers(tile, seat);
                if (rob.length) {
                    this.robbing = { seat, key };
                    this.lastDiscard = { tile, from: seat };
                    this.pending = rob;
                    this.claimAt = 0;
                    // The tile is on offer to the table now, so the turn this
                    // seat took off a claim is over — the same clearing
                    // `doDiscard` does, and for the same reason: the flag
                    // describes the seat in play, and the seat in play is
                    // about to be somebody else.
                    this.claimed = false;
                    this.phase = 'claim';
                    this.turn = rob[0].seat;
                    this.emit('claimable', { seat: this.turn, tile, rob: true });
                    return true;
                }
                return this.addKong(seat, key);
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

        /** The fourth tile joins a pung already on the table. */
        addKong(seat, key) {
            const s = this.seats[seat];
            const pung = s.melds.find((m) => m.type === 'pung' && m.key === key);
            const idx = s.hand.findIndex((x) => MJ.key(x) === key);
            if (!pung || idx < 0) return false;
            pung.tiles.push(s.hand.splice(idx, 1)[0]);
            pung.type = 'kong';
            s.lastAction = 'kong';
            this.emit('meld', { seat, meld: pung, added: true });
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
            const parts = MJ.split(tiles);
            const wilds = this.mode.flyEnabled ? parts.wilds : 0;
            if (!this.mode.flyEnabled && parts.wilds) return null;
            const shape = W.isWin(parts.counts, s.melds.length, wilds, this.pool, this.shapes);
            if (!shape) return null;

            const melds = s.melds.map((m) => ({ type: m.type, key: m.key })).concat(shape.melds || []);
            const hand = {
                shape: shape.shape,
                melds,
                pair: shape.pair,
                // Read from the hand as it resolved, not from the tiles as
                // they lie: a fly counts as whatever it was played as, which
                // is what decides 清一色 and the rest.
                keys: this.handKeys(shape, s.melds, melds),
                selfDraw: !tile,
                menzen: s.melds.every((m) => m.concealed),
                quad: !!shape.quad,
                // Flowers pay by the tile at three seats, but only the ones
                // numbered for this seat's wind — and holding none at all
                // pays as 无花, which is a different count. They are never in
                // the hand itself either way.
                flowers: this.flowerFanFor(seat),
                flowersHeld: s.flowers.length,
                // 中/发/白 pay everybody; a wind pays the seat sitting on it,
                // and a wind nobody is sitting on pays whoever collects it.
                // The scorer cannot work either out from the tiles alone.
                seatWind: this.windOf(seat),
                players: this.players,
                // 天胡: the dealer, on the tiles they were dealt, nothing
                // thrown yet. 地胡: anybody else on the dealer's first throw,
                // and only if they have not acted — a seat that melded is
                // not going out on the opening discard any more.
                heaven: seat === this.dealer && !tile && this.plays === 0,
                earth: seat !== this.dealer && !!tile && this.plays === 1
                    && this.lastDiscard && this.lastDiscard.from === this.dealer
                    && !s.melds.length,
                // A plain fly adds nothing. 顿飞 may one day — see MJ.isDun.
                wilds,
                dun: this.mode.dunFlyEnabled ? parts.dun : 0,
            };
            const fan = CV.MJFan.calculateFan(hand, this.fanTable);
            return { shape, hand, fan, tiles, wilds, ok: CV.MJPay.canWin(this.players, fan.totalFan) };
        }

        /**
         * The hand `seat` would go out on, group by group — or null if it is
         * not a winning hand at all.
         *
         * **This is the answer to "why can I 胡?".** The button appears and
         * the tiles sit in a row of fourteen, and at three seats up to four
         * of them are flies standing in for something the player never chose.
         * Told nothing, they press it and find out afterwards from the score.
         * So the melds are handed back already cut apart, each fly marked
         * with the tile it turned into, and the screen lays them out.
         *
         * `ok` is the same `ok` as `winFor`: the shape is finished, but the
         * table may still not allow it to be declared.
         *
         * @param {number} seat
         * @param {object|null} [tile] the tile on offer, or null for a self draw
         */
        explain(seat, tile) {
            // The panel answers "why may I 胡" and must never answer it for
            // a hand the table will not accept a declaration on.
            if (!tile && this.claimed && seat === this.turn) return null;
            const got = this.winFor(seat, tile || null);
            if (!got) return null;

            return {
                ok: got.ok, fan: got.fan, shape: got.shape.shape,
                groups: this.readGroups(seat, got.shape),
                need: this.minFan, selfDraw: !tile,
            };
        }

        /**
         * A winning hand cut into the melds it was **read** as.
         *
         * Not the tiles as they lie: a 飞 counts as whatever it was played
         * as, and a row of fourteen cannot say which. Every group comes back
         * as keys with the wild ones flagged, so the screen can draw a fly as
         * the tile it turned into and ring it.
         *
         * Kept apart from `explain` because the recap needs it too, and by
         * the time the recap is drawn the hand is over: the tiles have been
         * taken off the pool and `explain` would have nothing to read. The
         * winner's reading is therefore taken once, as the hand is declared.
         */
        readGroups(seat, shape) {
            const s = this.seats[seat];
            const groups = [];
            /** `n` copies of one key, the last `wild` of them played by a fly. */
            const copies = (key, n, wild) =>
                Array.from({ length: n }, (_, i) => ({ key, wild: i >= n - (wild || 0) }));

            // What is already on the table, in the order it was laid down.
            for (const m of s.melds) {
                if (m.type === 'chow') {
                    const suit = m.key[0], lo = Number(m.key.slice(1));
                    groups.push({ type: 'chow', open: !m.concealed,
                        tiles: m.tiles.map((x, i) => ({ key: suit + (lo + i), wild: MJ.isFly(x) })) });
                } else {
                    groups.push({ type: m.type, open: !m.concealed,
                        tiles: m.tiles.map((x) => ({ key: m.key, wild: MJ.isFly(x) })) });
                }
            }

            if (shape.shape === 'sevenPairs') {
                for (const g of (shape.groups || [])) {
                    groups.push({ type: 'pair', tiles: copies(g.key, 2, g.wild) });
                }
            } else if (shape.shape === 'thirteenOrphans') {
                groups.push({ type: 'orphans',
                    tiles: MJ.ORPHAN_KEYS.concat([shape.pair]).map((k) => ({ key: k, wild: false })) });
            } else {
                for (const m of (shape.melds || [])) {
                    if (m.type === 'chow') {
                        const suit = m.key[0], lo = Number(m.key.slice(1));
                        const missing = new Set(m.wildKeys || []);
                        groups.push({ type: 'chow', tiles: [0, 1, 2].map((i) => ({
                            key: suit + (lo + i), wild: missing.has(suit + (lo + i)) })) });
                    } else {
                        groups.push({ type: 'pung', tiles: copies(m.key, 3, m.wild) });
                    }
                }
                groups.push({ type: 'pair', tiles: copies(shape.pair, 2, shape.pairWild) });
            }
            return groups;
        }

        /** Every tile the finished hand is made of, wilds resolved. */
        handKeys(shape, exposed, melds) {
            // A meld is read as what it is, not as the tiles in it: a 碰
            // completed with a fly is still three 中, and dropping the fly
            // would leave the suit count a tile short.
            const out = [];
            for (const m of exposed) {
                if (m.type === 'chow') {
                    const suit = m.key[0], lo = Number(m.key.slice(1));
                    out.push(suit + lo, suit + (lo + 1), suit + (lo + 2));
                } else {
                    for (let i = 0; i < m.tiles.length; i++) out.push(m.key);
                }
            }
            if (shape.shape === 'sevenPairs') {
                for (const k of shape.pairs) out.push(k, k);
                return out;
            }
            if (shape.shape === 'thirteenOrphans') {
                return out.concat(MJ.ORPHAN_KEYS, [shape.pair]);
            }
            for (const m of (shape.melds || [])) {
                if (m.type === 'chow') {
                    const suit = m.key[0], n = Number(m.key.slice(1));
                    out.push(suit + n, suit + (n + 1), suit + (n + 2));
                } else out.push(m.key, m.key, m.key);
            }
            out.push(shape.pair, shape.pair);
            return out;
        }

        declareWin(seat, from) {
            const selfDraw = from === null;
            const got = this.winFor(seat, selfDraw ? null : this.lastDiscard.tile);
            if (!got || !got.ok) return false;
            // A hand may only be declared off a tile this seat drew, or off
            // one somebody put in the open. Not off a 碰 — see legalActions.
            if (selfDraw && this.claimed) return false;

            if (!selfDraw) {
                if (this.robbing) {
                    // 抢杠: the tile never reached a discard pile, it was on
                    // its way into a kong. It leaves the hand it was in.
                    const owner = this.seats[from];
                    const at = owner.hand.findIndex((x) => x.id === this.lastDiscard.tile.id);
                    if (at >= 0) owner.hand.splice(at, 1);
                    this.robbed = true;
                    this.robbing = null;
                } else this.seats[from].discards.pop();
            }

            this.winner = seat;
            this.winFrom = selfDraw ? -1 : from;
            this.winTiles = got.tiles;
            // The tile the hand went out on, kept for the recap. It cannot be
            // read back off the table afterwards: a claimed discard has been
            // taken out of the pool, and a drawn one has been sorted into the
            // hand like any other.
            this.winTile = selfDraw ? this.drew : this.lastDiscard.tile;
            this.winHand = got.hand;
            // Taken now, not at recap time: `finish` clears the pool and the
            // hand, and a fly drawn as a plain 飞 in the recap is the one
            // thing the winner cannot work out afterwards.
            this.winRead = this.readGroups(seat, got.shape);
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
                    // A seat that was robbed did not throw the tile — it was
                    // taken off the kong it was making, which is not the same
                    // mistake and should not be reported as one.
                    : i === this.winFrom ? t(this.robbed ? 'mj.robbedOff' : 'mj.dealtIn')
                    : t('mj.lost'),
                // The shared recap draws playing cards, and a tile is not
                // one — so tiles travel in their own field and result.js
                // draws them with the same tile face the table uses.
                //
                // Every seat's hand is in it, not just the winner's: the
                // overlay covers the table, and "what were the others
                // holding" is most of why a hand ended the way it did.
                hands: [],
                tiles: {
                    melds: s.melds.map((m) => ({ type: m.type, concealed: !!m.concealed, tiles: m.tiles })),
                    hand: MJ.sort(i === this.winner && this.winTiles ? this.winTiles : s.hand),
                    flowers: s.flowers.slice(),
                    win: i === this.winner ? this.winTile || null : null,
                    // The winning hand as it was read — melds cut apart, each
                    // fly marked with the tile it stood for. Only the winner
                    // has one; everybody else's tiles are just tiles.
                    read: i === this.winner ? (this.winRead || null) : null,
                },
                // What the 番 were, pattern by pattern. The names are the
                // ones the table uses and half of them explain nothing on
                // their own — 门清 is a word, not a description — so the
                // screen glosses each one.
                fan: i === this.winner && this.fan
                    ? this.fan.patterns.map((p) => ({ name: p.name, fan: p.fan }))
                    : null,
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
                    mjFlowers: s.flowers.length,
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
                        how: t(this.winFrom < 0 ? 'mj.selfDraw'
                            : this.robbed ? 'mj.robWin' : 'mj.byDiscard'),
                        n: this.fan.totalFan,
                    }) + (this.bao ? ' · ' + t('mj.bao', { n: this.payFan }) : ''),
            });
            return this.cached;
        }

        /* ---- state --------------------------------------------------------------- */

        snapshot() {
            return Object.assign(super.snapshot(), {
                dealer: this.dealer,
                dealerRun: this.dealerRun,
                players: this.players,
                mode: this.mode.mode,
                flyOn: this.flyOn, baoAt: this.baoAt, baoPay: this.baoPay,
                wall: this.wall.length, wallLeft: this.wall.length,
                lastDiscard: this.lastDiscard && {
                    tile: this.lastDiscard.tile, from: this.lastDiscard.from,
                },
                winner: this.winner, winFrom: this.winFrom, drawn: this.drawn,
                fan: this.fan, bao: this.bao, unit: this.unit, minFan: this.minFan,
                // A guest's screen says "this is a 抢杠" from this, and its
                // table view reads `claimed` the same way the host's does.
                robbing: !!this.robbing, robbed: this.robbed, claimed: this.claimed,
            });
        }

        /** Concealed tiles are concealed — until the hand is over. */
        redactSeat(seat, index, viewer) {
            if (index === viewer) return seat;
            const open = this.over;
            return Object.assign({}, seat, {
                hand: open ? seat.hand.slice() : seat.hand.map(() => null),
            });
        }
    }

    CV.MahjongEngine = MahjongEngine;
})();
