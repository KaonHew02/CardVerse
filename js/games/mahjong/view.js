/**
 * CardVerse — the 麻将 table.
 *
 * Laid out the way a table is laid out, because mahjong is a game about where
 * things are: the seats sit around the felt in turn order, each one's melds
 * next to it and its concealed tiles face down, and everything anybody has
 * thrown goes into the pool in the middle — each seat's discards in front of
 * that seat, which is the only arrangement that lets you read at a glance who
 * threw the tile you want.
 *
 * The wind, the wall count and the stake sit in the centre of the pool, where
 * the dice and the wind indicator sit on a real table.
 *
 * Tiles are drawn in CSS and SVG, the same way the cards are — a face with a
 * drawn suit or an honour's character. See faces.js: a tile that says "1筒"
 * is readable, but it is not a mahjong tile.
 *
 * **Your flowers are shown as flowers.** A count told you how many you had
 * and never which, and 花 is the one part of a three-player hand you cannot
 * work out from anything else on the screen.
 *
 * You discard by tapping a tile. 碰 吃 杠 胡 appear only when they are
 * actually available, which the engine decides, not the screen.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const MJ = CV.MJ;
    const { esc, fmt } = CV.UI;

    /** One tile face. `null` draws a back. */
    function tileHtml(tile, opts = {}) {
        const extra = (opts.cls ? ' ' + opts.cls : '') + (opts.small ? ' tile-sm' : '')
            + (opts.tiny ? ' tile-xs' : '');
        if (!tile) return `<span class="tile tile-back${extra}"></span>`;
        // 飞 is a wild card and reads as one: no number, no suit, its own face.
        if (tile.suit === 'F') {
            return `<span class="tile tile-fly${extra}" data-id="${tile.id}"
                aria-label="Fly"><b>飞</b></span>`;
        }
        // A flower is 春 or 竹, drawn — "花8" is a slot in the box, and a
        // player holding one could not find out what it was.
        if (tile.suit === 'f') {
            return `<span class="tile tile-flower${extra}" data-id="${tile.id}"
                aria-label="${esc(MJ.nameEn(tile))}">${CV.MJFaces.flowerFace(tile.n)}</span>`;
        }
        if (tile.suit === 'z') {
            // 白板 is a blank face inside a frame, not the character 白.
            const face = tile.n === 7 ? CV.MJFaces.whiteDragon()
                : `<b>${MJ.HONOURS[tile.n - 1]}</b>`;
            return `<span class="tile tile-z z${tile.n}${extra}" data-id="${tile.id}"
                aria-label="${esc(MJ.nameEn(tile))}">${face}</span>`;
        }
        // The face is drawn, not written — see faces.js.
        return `<span class="tile tile-${tile.suit}${extra}" data-id="${tile.id}"
            aria-label="${esc(MJ.nameEn(tile))}">${CV.MJFaces.suitFace(tile.suit, tile.n)}</span>`;
    }

    const row = (tiles, opts) => tiles.map((x) => tileHtml(x, opts)).join('');

    /**
     * A tile drawn from a key rather than from a tile — what the hand *reads*
     * as, which is not always what is lying in it. A fly played as 3筒 is
     * drawn as a 3筒 with a ring round it, because "your fly became this" is
     * the one thing a row of fourteen tiles cannot say by itself.
     */
    let keyUid = 0;
    function keyTile(key, wild, opts) {
        const { suit, n } = MJ.parse(key);
        return tileHtml({ suit, n, id: 'k' + (keyUid++) },
            Object.assign({ small: true }, opts, { cls: wild ? 'is-wild' : '' }));
    }

    /** The mark put on a tile an offered action would use. */
    const MARK = { kong: '杠', pung: '碰', chow: '吃' };

    /**
     * Where each opponent sits, by how far round the table they are.
     *
     * At four seats the next player is on your left, the one after that is
     * across, and the last is on your right — turn order runs left, across,
     * right, back to you. At three there is no chair across, so the two
     * opponents take the sides.
     */
    const PLACES = {
        4: ['left', 'top', 'right'],
        3: ['left', 'right'],
    };

    /** Where each seat's discards pile up, by where that seat is sitting. */
    const POOL_CELL = { top: 'mjPoolTop', left: 'mjPoolLeft', right: 'mjPoolRight', bottom: 'mjPoolBottom' };

    /* How long a thrown tile is held up in the middle before it goes home,
     * against the 700–1500ms an opponent takes to think. Long enough to read
     * the tile, short enough that the throw after it does not queue up.
     * `SPOT_PASS` is the shorter beat after a claim you passed on: you have
     * already looked at that tile for as long as you wanted to. */
    const SPOT_HOLD = 820;
    const SPOT_PASS = 160;
    const SPOT_FLY  = 360;

    class MahjongView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
        }

        get you() { return this.engine.youSeat; }

        /**
         * Guests do not hold an engine — they hold `CV.RemoteEngine`, which
         * wears the host's snapshot and answers no questions of its own. The
         * table paints from the snapshot either way; the two things that need
         * the real rules to answer, "may I 胡" and "why", are simply not shown
         * to a guest rather than throwing on the first paint.
         */
        get live() { return typeof this.engine.explain === 'function'; }
        /** The wall, as a count — a getter at the host, a number on the wire. */
        get wallLeft() {
            const e = this.engine;
            return e.wallLeft !== undefined ? e.wallLeft : (e.wall || 0);
        }
        /** The result waits for the felt — including the shuffle. */
        get revealing() { return !!this.shuffling; }

        /** `{ seat, place }` for every chair that is not yours, in turn order. */
        places() {
            const e = this.engine;
            const you = this.you < 0 ? 0 : this.you;
            const spots = PLACES[e.players] || PLACES[4];
            const out = [];
            for (let k = 1; k < e.players; k++) out.push({ seat: (you + k) % e.players, place: spots[k - 1] });
            return out;
        }

        mount() {
            this.root.innerHTML = `
                <div class="mj">
                    <div class="mj-shuffle" id="mjShuffle" hidden>
                        <div class="mj-shuffle-tiles">
                            ${Array.from({ length: 14 }, (_, i) =>
                                `<span class="tile tile-back mj-shuffle-tile"
                                       style="animation-delay:${i * 55}ms"></span>`).join('')}
                        </div>
                        <div class="mj-shuffle-note">${esc(t('mj.shuffling'))}</div>
                    </div>
                    <div class="mj-table">
                        <div class="mj-seat-slot at-top"    id="mjSeatTop"></div>
                        <div class="mj-seat-slot at-left"   id="mjSeatLeft"></div>
                        <div class="mj-seat-slot at-right"  id="mjSeatRight"></div>
                        <div class="mj-pool">
                            <div class="mj-pool-cell at-top"    id="mjPoolTop"></div>
                            <div class="mj-pool-cell at-left"   id="mjPoolLeft"></div>
                            <div class="mj-spot"                id="mjSpot"></div>
                            <div class="mj-pool-cell at-right"  id="mjPoolRight"></div>
                            <div class="mj-pool-cell at-bottom" id="mjPoolBottom"></div>
                        </div>
                        <div class="mj-hub" id="mjHub"></div>
                    </div>
                    <div class="bj-status" id="mjStatus"></div>
                    <div class="mj-why" id="mjWhy"></div>
                    <div class="mj-you" id="mjYou"></div>
                    <div class="bj-actions" id="mjActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            CV.UI.on(this.root, '[data-tile]', (el) => this.discard(el.dataset.tile));
            CV.UI.on(this.root, '[data-sort]', () => this.resort());
            CV.UI.on(this.root, '[data-fantable]', () => this.showFanTable());

            /**
             * Your own order for your own tiles.
             *
             * The engine sorts a hand every time it draws, which is the right
             * default and the wrong thing to be stuck with: half of playing
             * mahjong is keeping the tiles you are working on next to each
             * other. Ids, not indexes — the hand is rebuilt on every paint.
             */
            this.order = [];
            this.onDown = (ev) => this.dragStart(ev);
            this.onMove = (ev) => this.dragMove(ev);
            this.onUp   = (ev) => this.dragEnd(ev);
            this.root.addEventListener('pointerdown', this.onDown);
            window.addEventListener('pointermove', this.onMove, { passive: false });
            window.addEventListener('pointerup', this.onUp);
            window.addEventListener('pointercancel', this.onUp);

            this.table.onChange(() => this.paint());
            this.shuffle();
            this.paint();
        }

        unmount() {
            clearTimeout(this.timer);
            clearTimeout(this.spotTimer);
            window.removeEventListener('pointermove', this.onMove);
            window.removeEventListener('pointerup', this.onUp);
            window.removeEventListener('pointercancel', this.onUp);
            this.root.innerHTML = '';
        }

        /**
         * 洗牌, before the hand starts.
         *
         * Without it a sorted thirteen-tile hand simply exists, dealt by
         * nobody — the round is under way before the player has registered
         * that one began. The table is held while the wall is mixed, so the
         * dealer's first throw is not spent behind the overlay, and your
         * tiles are then dealt in one at a time rather than appearing.
         *
         * An online table is not held: the other seats are real people and
         * their clock is not this browser's to stop.
         */
        shuffle() {
            const host = this.$('mjShuffle');
            const still = window.matchMedia
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!host || still) return;

            const online = !!(CV.Room && CV.Room.active);
            this.shuffling = true;
            host.hidden = false;
            if (!online) this.table.pause();

            this.timer = setTimeout(() => {
                this.shuffling = false;
                this.fresh = true;              // your hand deals in, one by one
                host.hidden = true;
                if (!online) this.table.resume();
                this.paint();
            }, 1150 * (this.table.speed || 1));
        }

        paint() {
            this.paintSeats();
            this.paintPool();
            this.paintSpot();
            this.paintHub();
            this.paintStatus();
            this.paintWhy();
            this.paintYou();
            this.paintActions();
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
            this.fresh = false;      // the deal-in plays once, on the first paint
        }

        /** 东 南 西 北 by distance from the dealer. */
        windOf(i) {
            const e = this.engine;
            return MJ.HONOURS[(i - e.dealer + e.players) % e.players];
        }

        meldHtml(meld, opts) {
            const tiles = meld.concealed && meld.type === 'kong'
                ? [null, meld.tiles[1], meld.tiles[2], null]     // a concealed kong shows its middle
                : meld.tiles;
            return `<span class="mj-meld">${row(tiles, opts || { small: true })}</span>`;
        }

        /**
         * The flowers a seat has turned, as flowers.
         *
         * They are set aside from the hand and pay on their own, so they are
         * shown apart from it — and shown at all, which a count never did.
         */
        flowersHtml(s, opts) {
            if (!s.flowers.length) return '';
            return `<span class="mj-flower-strip">${row(s.flowers, opts || { tiny: true })}</span>`;
        }

        /* ---- the seats around the felt -------------------------------------- */

        seatBox(i, place) {
            const e = this.engine;
            const s = e.seats[i];
            const turn = e.turn === i && !e.over;
            // Every hand turns face up at the end, not just the winner's.
            // What the losers were holding is half of why the hand went the
            // way it did, and it is gone the moment the next one is dealt.
            const open = e.over;
            const upright = place === 'top';
            // A concealed hand is a wall of backs — the count is the
            // information, and it is on the badge as well.
            const hand = (open ? s.hand : s.hand.map(() => null));

            return `
                <div class="mj-seat at-${place}${turn ? ' is-turn' : ''}${open ? ' is-winner' : ''}">
                    <div class="mj-seat-head">
                        <span class="avatar">${s.avatar}</span>
                        <span class="who">
                            <span class="name">${esc(s.name)}</span>
                            <span class="coins">🪙 ${fmt(s.coins)}</span>
                        </span>
                        <span class="tag mj-wind${i === e.dealer ? ' is-dealer' : ''}">${this.windOf(i)}</span>
                        <span class="tag mj-count">${s.hand.length}</span>
                    </div>
                    ${this.flowersHtml(s)}
                    <div class="mj-wall-row${upright ? '' : ' is-side'}">${row(hand, { small: true })}</div>
                    <div class="mj-melds">${s.melds.map((m) => this.meldHtml(m)).join('')}</div>
                    ${this.seatSheet(s)}
                </div>`;
        }

        /**
         * **What this seat has actually done, opened out under them.**
         *
         * The pool shows each seat's throws on that seat's side of the felt,
         * which answers "who threw the tile I want" and nothing else. The
         * question a player asks about an opponent three quarters of the way
         * through a hand is a different one — *what have they been throwing*
         * — and the answer is a wrapped block of small tiles at the edge of
         * the table with no order you can read off it and no numbers.
         *
         * So hovering a seat opens the full account underneath it: every
         * tile it has thrown, in order, numbered every fifth so a long row
         * can be counted; and its flowers, which pay 1番 each and are
         * otherwise a strip of pictures nobody can total. It goes below the
         * seat because that is where the felt is empty — the space under the
         * side seats is the largest unused area on the table.
         *
         * It is hover-and-focus only and `pointer-events: none`, so it can
         * never sit between a player and a tile they meant to click.
         */
        seatSheet(s) {
            const thrown = s.discards.length
                ? `<div class="mj-sheet-row">
                     <span class="mj-sheet-label">${esc(t('mj.sheetThrown', { n: s.discards.length }))}</span>
                     <span class="mj-sheet-tiles">${s.discards.map((tile, i) =>
                        `<span class="mj-sheet-slot${(i + 1) % 5 === 0 ? ' is-fifth' : ''}"
                               data-n="${i + 1}">${tileHtml(tile, { small: true })}</span>`).join('')}</span>
                   </div>`
                : `<div class="mj-sheet-row"><span class="mj-sheet-label">${
                    esc(t('mj.sheetNothing'))}</span></div>`;
            const flowers = s.flowers.length
                ? `<div class="mj-sheet-row">
                     <span class="mj-sheet-label">${esc(t('mj.sheetFlowers', {
                        n: s.flowers.length, fan: s.flowers.length * CV.MJFan.flowerFan(this.engine.players) }))}</span>
                     <span class="mj-sheet-tiles">${row(s.flowers, { small: true })}</span>
                   </div>`
                : '';
            return `<div class="mj-sheet">${thrown}${flowers}</div>`;
        }

        paintSeats() {
            for (const id of ['mjSeatTop', 'mjSeatLeft', 'mjSeatRight']) this.$(id).innerHTML = '';
            for (const { seat, place } of this.places()) {
                const host = this.$('mjSeat' + place[0].toUpperCase() + place.slice(1));
                if (host) host.innerHTML = this.seatBox(seat, place);
            }
        }

        /* ---- the pool in the middle ------------------------------------------ */

        /**
         * Everything a seat has thrown, in the order it was thrown, sitting on
         * that seat's side of the pool. The tile just discarded is marked,
         * because a claim has to be decided on it and it is otherwise lost in
         * a row of twenty.
         */
        discardRow(i) {
            const e = this.engine;
            const s = e.seats[i];
            const last = e.lastDiscard;
            return s.discards.map((tile, idx) => tileHtml(tile, {
                small: true,
                cls: (last && last.from === i && idx === s.discards.length - 1 && !e.over) ? 'is-last' : '',
            })).join('');
        }

        paintPool() {
            const cells = POOL_CELL;
            for (const id of Object.values(cells)) this.$(id).innerHTML = '';
            if (this.you >= 0) this.$(cells.bottom).innerHTML = this.discardRow(this.you);
            for (const { seat, place } of this.places()) {
                this.$(cells[place]).innerHTML = this.discardRow(seat);
            }
        }

        /**
         * **The tile somebody just threw, held up in the middle first.**
         *
         * A discard that appears straight into the row in front of the seat
         * that threw it is a tile that arrived without ever being shown: at
         * three seats the two opponents sit at the edges of the felt, their
         * rows are small, and the one tile the next decision turns on is
         * added to a row of twenty somewhere off to the side. Players end up
         * reading the rows to find out what happened, which is exactly the
         * thing a table is supposed to spare them.
         *
         * So a thrown tile is staged in the centre of the pool, full size and
         * named with the seat that threw it, and only travels back to that
         * seat's row once nobody is going to take it — which is what happens
         * on a real table, where a discard sits in the middle until it is
         * claimed or passed over. If it is yours to claim it stays in the
         * middle until you have decided; it never flies away with a live
         * 碰 on the screen.
         *
         * Your own throws are not staged: you know what you threw.
         */
        paintSpot() {
            const e = this.engine;
            const host = this.$('mjSpot');
            if (!host) return;

            const d = (!e.over && e.lastDiscard) ? e.lastDiscard : null;
            const sig = d ? d.from + ':' + d.tile.id : '';
            // Still claimable by somebody, so it stays out in the middle —
            // which is what a discard does on a real table, and it is also
            // the only correct test. `turn` during a claim is whoever is
            // *first in line* for the tile: a 碰 that is yours to make sits
            // behind an opponent's stronger claim for a beat first, so a
            // tile held only while `turn === you` would fly home during that
            // beat and leave the 碰 button asking about a tile it had just
            // put away.
            const held = !!d && e.phase === 'claim';
            if (sig === this.spotSig && held === this.spotHeld) return;

            // Staged again when the throw is new — or when it turns out to
            // be claimable after it had already set off for home, which no
            // amount of care over the first test can rule out.
            const fresh = sig !== this.spotSig || (held && host.classList.contains('is-home'));
            this.spotSig = sig;
            this.spotHeld = held;
            clearTimeout(this.spotTimer);

            if (!sig || d.from === this.you) { host.innerHTML = ''; host.className = 'mj-spot'; return; }

            if (fresh) {
                // A throw that lands while the one before it is still flying
                // must not drag the box back to the middle on its way in, so
                // the reset is made with the transition switched off.
                host.style.transition = 'none';
                host.style.transform = '';
                host.className = 'mj-spot is-up';
                host.innerHTML = `<span class="mj-spot-who">${esc(e.seats[d.from].name)}</span>
                    ${tileHtml(d.tile, { cls: 'mj-spot-tile' })}`;
                void host.offsetWidth;
                host.style.transition = '';
            }
            if (held) return;
            this.spotTimer = setTimeout(() => this.spotHome(d.from), fresh ? SPOT_HOLD : SPOT_PASS);
        }

        /**
         * The staged tile travelling to the row in front of the seat that
         * threw it, measured rather than guessed: the row is laid out by the
         * grid and the felt changes shape with the window, so the only place
         * the distance can come from is the two boxes themselves.
         */
        spotHome(from) {
            const host = this.$('mjSpot');
            if (!host || !host.firstChild) return;
            const place = (this.places().find((x) => x.seat === from) || {}).place;
            const cell = place ? this.$(POOL_CELL[place]) : null;
            if (cell) {
                const a = host.getBoundingClientRect();
                const b = cell.getBoundingClientRect();
                host.style.transform = `translate(${Math.round(b.left + b.width / 2 - a.left - a.width / 2)}px,`
                    + ` ${Math.round(b.top + b.height / 2 - a.top - a.height / 2)}px) scale(.42)`;
            }
            host.classList.add('is-home');
            this.spotTimer = setTimeout(() => {
                host.innerHTML = '';
                host.className = 'mj-spot';
                host.style.transform = '';
            }, SPOT_FLY);
        }

        /** The wind, the wall and the stake — the centre of a real table. */
        paintHub() {
            const e = this.engine;
            this.$('mjHub').innerHTML = `
                <span class="mj-hub-wind">${esc(this.windOf(this.you < 0 ? 0 : this.you))}</span>
                <span class="mj-hub-wall">${esc(t('mj.wall', { n: this.wallLeft }))}</span>
                <span class="mj-hub-line">${esc(t('mj.mode', { n: e.players }))}</span>
                <span class="mj-hub-line">${esc(t('mj.unit', { n: e.unit }))}</span>
                ${e.flyOn ? `<span class="mj-hub-line">${esc(t('mj.flyOn'))}</span>` : ''}
                ${e.minFan ? `<span class="mj-min">${esc(t('mj.min', { n: e.minFan }))}</span>` : ''}
                <button class="mj-hub-btn" data-fantable>${esc(t('mj.fanTable'))}</button>`;
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('mjStatus');
            if (e.over) {
                host.innerHTML = e.drawn
                    ? `<span class="muted">${esc(t('mj.drawn'))}</span>`
                    : `<span class="you">${esc(t('mj.won', {
                        name: e.seats[e.winner].name, n: e.fan.totalFan }))}</span>`;
                return;
            }
            // Manual draw: nothing has been drawn yet, and the hand is
            // thirteen tiles that cannot be thrown from. Saying "your turn —
            // tap a tile" here would be asking for a move that is not legal.
            if (e.phase === 'draw' && e.turn === this.you) {
                host.innerHTML = `<span class="you">${esc(t('mj.yourDraw', { n: this.wallLeft }))}</span>`;
                return;
            }
            if (e.phase === 'claim' && e.turn === this.you) {
                // 抢杠 is not a discard, and the tile is not in the pool: it
                // is on its way into somebody's kong. Saying so is the only
                // way the moment reads as anything but a stray claim.
                host.innerHTML = `<span class="you">${esc(t(e.robbing ? 'mj.yourRob' : 'mj.yourClaim'))}</span>`;
                return;
            }
            if (e.turn === this.you && this.live) {
                // A hand that wins but does not clear the floor is the one
                // state a player will not work out on their own.
                const mine = e.winFor(this.you, null);
                if (mine && !mine.ok) {
                    host.innerHTML = `<span class="mj-short">${esc(t('mj.short', {
                        have: mine.fan.totalFan, need: e.minFan }))}</span>`;
                    return;
                }
                host.innerHTML = `<span class="you">${esc(t('mj.yourTurn'))}</span>`;
                return;
            }
            host.innerHTML = `<span class="muted">${esc(t('mj.waiting', { name: e.seats[e.turn].name }))}</span>`;
        }

        /**
         * **Why you may 胡.**
         *
         * A finished hand is fourteen tiles in a row and a lit button, and at
         * three seats up to four of those tiles are flies that became
         * something nobody chose. Pressing it and reading the score
         * afterwards is not an explanation. So the hand is laid out here the
         * way it was read — cut into its melds, every fly drawn as the tile
         * it turned into and ringed — with the patterns it scores and what
         * they add up to.
         *
         * It shows for a hand that is finished but too cheap to declare as
         * well. That is the state nobody works out on their own, and it is
         * the one where seeing the melds tells you what to build on.
         */
        paintWhy() {
            const e = this.engine;
            const host = this.$('mjWhy');
            if (!host) return;
            host.innerHTML = '';
            if (this.you < 0 || e.over || e.turn !== this.you || !this.live) return;

            const thrown = e.phase === 'claim' && e.lastDiscard ? e.lastDiscard.tile : null;
            const why = e.explain(this.you, thrown);
            if (!why) {
                // A 碰 or a 吃 can finish a hand too, and the seat is then
                // holding fourteen tiles that plainly read as a win with no
                // 胡 button anywhere. Saying nothing here looks exactly like
                // a bug — so it says what happened instead.
                if (!thrown && e.claimed && e.winFor(this.you, null)) {
                    host.innerHTML = `<div class="mj-why-card is-short">
                        <div class="mj-why-head">
                            <span class="mj-why-title">${esc(t('mj.afterClaim'))}</span>
                        </div>
                        <div class="mj-why-note">${esc(t('mj.afterClaimNote'))}</div>
                    </div>`;
                }
                return;
            }

            const groups = why.groups.map((g) => `<span class="mj-meld${
                g.open ? ' is-open' : ''}">${g.tiles.map((x) => keyTile(x.key, x.wild)).join('')}</span>`).join('');
            const patterns = why.fan.patterns.map((p) =>
                `<span class="mj-why-pat">${esc(p.name)} <b>${p.fan}</b></span>`).join('');
            const wild = why.groups.some((g) => g.tiles.some((x) => x.wild));

            host.innerHTML = `
                <div class="mj-why-card${why.ok ? '' : ' is-short'}">
                    <div class="mj-why-head">
                        <span class="mj-why-title">${esc(why.ok ? t('mj.whyWin') : t('mj.whyShortTitle'))}</span>
                        <span class="mj-why-total">${esc(t('mj.fanN', { n: why.fan.totalFan }))}</span>
                        ${why.ok ? '' : `<span class="mj-why-need">${esc(t('mj.whyShort', {
                            n: why.need - why.fan.totalFan }))}</span>`}
                    </div>
                    <div class="mj-why-groups">${groups}</div>
                    <div class="mj-why-pats">${patterns}</div>
                    ${wild ? `<div class="mj-why-note">${esc(t('mj.whyFly'))}</div>` : ''}
                </div>`;
        }

        /**
         * The 番 this table pays for, what the floor is, and what a fly does.
         *
         * The rules card is read once before the first hand and never again,
         * and 番 are the whole game: a player who has just been told they are
         * 2番 short has nowhere to look up what would have made up the
         * difference. It is built from the table the engine is actually
         * scoring by, so the three-player list is missing 混一色 because that
         * mode genuinely does not pay for it.
         */
        showFanTable() {
            const e = this.engine;
            const table = e.fanTable || CV.MJFan.tableFor(e.players);
            const rows = Object.keys(table)
                .sort((a, b) => table[b] - table[a] || a.localeCompare(b))
                .map((name) => {
                    const key = 'mj.fan.' + name;
                    const gloss = t(key);
                    return `<li><b>${esc(name)}</b>
                        <span class="mj-fan-n">${esc(t('mj.fanN', { n: table[name] }))}</span>
                        <small>${gloss === key ? '' : esc(gloss)}</small></li>`;
                }).join('');

            CV.UI.dialog({
                title: t('mj.fanTable'),
                body: `
                    <p class="muted small">${esc(t('mj.fanTableHead', {
                        n: e.players, min: e.minFan, bao: e.baoAt || 10,
                        paid: e.baoPay || 20, unit: e.unit }))}</p>
                    <ul class="mj-fan-list">${rows}</ul>
                    <p class="muted small">${esc(t(e.flyOn ? 'mj.fanTableFly' : 'mj.fanTableNoFly'))}</p>`,
            });
        }

        /**
         * Which of your tiles each offered action would actually use.
         *
         * The buttons say 杠 and 碰 and nothing about on what. With three
         * melds on the table and a fly in hand, "which tile is the 杠" is a
         * real question, and the tiles are the only place it can be answered
         * — so the ones an action would spend are marked with it.
         */
        hints() {
            const e = this.engine;
            const out = new Map();
            if (this.you < 0 || e.over || e.turn !== this.you) return out;
            const s = e.seats[this.you];
            // A tile can serve more than one offer at once — two 中 and a fly
            // are a 碰 and a 杠 — so the marks add up rather than replace one
            // another. Losing one would point at the wrong tiles.
            const mark = (tiles, type) => {
                for (const x of tiles) {
                    if (!x) continue;
                    const had = out.get(x.id) || '';
                    if (!had.includes(MARK[type])) out.set(x.id, had + MARK[type]);
                }
            };

            // Your own copies first, then a fly for each one short — the same
            // order the engine takes them in when the claim is made.
            const pick = (key, want) => {
                const got = s.hand.filter((x) => MJ.key(x) === key).slice(0, want);
                return got.concat(s.hand.filter(MJ.isFly).slice(0, want - got.length));
            };

            const thrown = e.lastDiscard && e.lastDiscard.tile;
            const claim = e.phase === 'claim' && thrown;
            for (const o of e.legalActions(this.you)) {
                // On your own turn a 杠 is your own four, or the single tile
                // that joins a pung already down. Never a fly: a fly is not
                // offered a kong of its own.
                if (o.type === 'kong' && o.key) {
                    mark(s.hand.filter((x) => MJ.key(x) === o.key), 'kong');
                } else if (!claim) continue;
                else if (o.type === 'pung') mark(pick(MJ.key(thrown), 2), 'pung');
                else if (o.type === 'kong') mark(pick(MJ.key(thrown), 3), 'kong');
                else if (o.type === 'chow') {
                    const suit = o.low[0], lo = Number(o.low.slice(1));
                    for (let x = lo; x <= lo + 2; x++) {
                        if (suit + x !== MJ.key(thrown)) mark(pick(suit + x, 1), 'chow');
                    }
                }
            }
            return out;
        }

        /**
         * **番, counted as you go.**
         *
         * The score arrives once, at the end, on a hand that is already
         * over — and at three seats there is a 2番 floor, so "how much is
         * this worth" is a question that has to be answered while there is
         * still something to do about the answer. A player who finds out on
         * the fourteenth tile that their hand pays 1番 has been building the
         * wrong hand for ten minutes.
         *
         * Two different numbers, and the difference matters:
         *
         *   finished   the real total for the hand as it stands, the same
         *              number the 胡 would pay. `done` is true.
         *   otherwise  what the tiles already carry — see `MJFan.progress`.
         *              Only facts, never a guess at how the hand will close,
         *              so this number never goes down on its own.
         *
         * Flowers are in neither, because flowers score nothing at this
         * table: they are set aside, replaced, and paid for by nobody. The
         * strip beside your hand says so, since a pile of tiles that pays
         * nothing looks exactly like a pile of tiles that pays.
         */
        fanNow() {
            const e = this.engine;
            if (this.you < 0) return null;
            const s = e.seats[this.you];
            if (!s || !s.hand) return null;

            // Fourteen tiles that already win are worth what they are worth.
            const done = (this.live && !e.over && e.turn === this.you) ? e.winFor(this.you, null) : null;
            if (done) return { fan: done.fan, done: true, ok: done.ok };

            const keys = [];
            for (const m of (s.melds || [])) {
                if (m.type === 'chow') {
                    const suit = m.key[0], lo = Number(m.key.slice(1));
                    keys.push(suit + lo, suit + (lo + 1), suit + (lo + 2));
                } else keys.push(m.key);
            }
            // A fly is not in a suit and a flower is not in the hand, so
            // neither one decides 清一色 and neither belongs here.
            for (const x of s.hand) if (x && MJ.isPlaying(x)) keys.push(MJ.key(x));

            const fan = CV.MJFan.progress({
                keys, menzen: (s.melds || []).every((m) => m.concealed),
                flowers: (s.flowers || []).length,
            }, e.fanTable || CV.MJFan.tableFor(e.players));
            return { fan, done: false, ok: fan.totalFan >= (e.minFan || 0) };
        }

        /**
         * What the flowers beside your hand are worth, said out loud.
         *
         * A row of tiles in a chip next to the hand looks like something
         * being scored whether it is or not, and at this table the answer
         * changes with the seat count: three seats pay 1番 a flower and
         * another 1番 for holding none, four seats have no flowers at all.
         * Neither is guessable from the tiles.
         */
        flowerWorth(n) {
            const rate = CV.MJFan.flowerFan(this.engine.players);
            if (!rate) return t('mj.flowerNoFan');
            return n ? t('mj.flowerFan', { n: n * rate }) : t('mj.flowerNone');
        }

        /** The running 番 count, with what it is counting written on it. */
        fanChipHtml() {
            const e = this.engine;
            const now = this.fanNow();
            if (!now) return '';
            const pats = now.fan.patterns
                .map((p) => p.name + (p.n > 1 ? '×' + p.n : '') + ' ' + p.fan).join(' · ');
            const cls = now.done ? (now.ok ? ' is-win' : ' is-short') : (now.ok ? ' is-ok' : ' is-short');
            return `<span class="mj-fan-now${cls}" title="${esc(pats || t('mj.fanNowNone'))}">
                <span class="mj-fan-now-label">${esc(t(now.done ? 'mj.fanDone' : 'mj.fanNow'))}</span>
                <b>${esc(t('mj.fanN', { n: now.fan.totalFan }))}</b>
                ${e.minFan && !now.ok
                    ? `<span class="mj-fan-now-need">${esc(t('mj.fanNeed', {
                        n: e.minFan - now.fan.totalFan }))}</span>`
                    : ''}</span>`;
        }

        paintYou() {
            const e = this.engine;
            const host = this.$('mjYou');
            if (this.you < 0) { host.innerHTML = ''; return; }
            const s = e.seats[this.you];
            const mine = e.turn === this.you && e.phase === 'discard' && !e.over;
            const deal = this.fresh;
            const hint = this.hints();
            // The tile you have just drawn, marked rather than moved: with a
            // hand you have arranged yourself, sorting it into place would
            // hide the one tile the decision is about.
            const drew = mine ? e.drew : null;

            host.innerHTML = `
                <div class="hand-head">
                    <span class="tag mj-wind${this.you === e.dealer ? ' is-dealer' : ''}">${this.windOf(this.you)}</span>
                    ${this.fanChipHtml()}
                    ${s.flowers.length
                        ? `<span class="mj-flowers-mine">
                             <span class="mj-flowers-label">${esc(t('mj.myFlowers', { n: s.flowers.length }))}</span>
                             ${row(s.flowers, { small: true })}
                             <span class="mj-flowers-fan">${esc(this.flowerWorth(s.flowers.length))}</span>
                           </span>`
                        : `<span class="muted small">${esc(t('mj.noFlowers'))} · ${
                            esc(this.flowerWorth(0))}</span>`}
                    <button class="btn tiny" data-sort>${esc(t('mj.sort'))}</button>
                </div>
                <div class="mj-melds mine">${s.melds.map((m) => this.meldHtml(m)).join('')}</div>
                <div class="mj-mine">
                    ${this.mine(s).map((tile, i) => `<button class="mj-pick${deal ? ' is-fresh' : ''}${
                            hint.has(tile.id) ? ' can-act' : ''}${mine ? '' : ' is-locked'}${
                            drew && drew.id === tile.id ? ' is-drawn' : ''}"
                        ${deal ? `style="animation-delay:${i * 40}ms"` : ''}
                        data-tile="${tile.id}">${tileHtml(tile)}${
                            hint.has(tile.id) ? `<span class="mj-hint">${hint.get(tile.id)}</span>` : ''
                        }</button>`).join('')}
                </div>
                <div class="muted small mj-drag-hint">${esc(t('mj.dragHint'))}</div>`;
        }

        /* ---- your tiles, in your order ---------------------------------------- */

        /**
         * Your hand in the order you put it in.
         *
         * Anything you have not moved keeps the engine's sorted order, and a
         * tile that was not there last time is **slid into its place** —
         * before the first tile it sorts ahead of, appended if there is no
         * such tile.
         *
         * A drawn tile used to be parked on the right instead, so that the
         * one tile the decision was about could not be lost in the row. It
         * is not lost: it is ringed green wherever it lands, which was
         * always doing that job on its own. What parking it actually cost
         * was the rest of the hand — the draw sat away from the tiles it
         * belonged with, so the pair it made was two tiles at opposite ends
         * of the row, and when it was thrown or melded the hole it left kept
         * the tile after it out of place for the rest of the game. A hand
         * you have not touched now stays sorted, hand after hand.
         *
         * A hand you *have* touched still keeps your arrangement: the new
         * tile is placed against the order that is actually on screen, not
         * against the engine's sort, so it lands next to its own kind
         * wherever you have put them.
         */
        mine(seat) {
            const byId = new Map(seat.hand.map((x) => [x.id, x]));
            const out = [];
            for (const id of this.order) {
                const tile = byId.get(id);
                if (tile) { out.push(tile); byId.delete(id); }
            }
            for (const tile of seat.hand) {
                if (!byId.has(tile.id)) continue;
                // 飞 is wild and sorts last, which is where it belongs: it is
                // not part of a run and nothing wants to sit next to it.
                const at = out.findIndex((x) => MJ.cmp(x, tile) > 0);
                if (at < 0) out.push(tile); else out.splice(at, 0, tile);
            }
            this.order = out.map((x) => x.id);
            return out;
        }

        /** Give the hand back to the engine's sort. */
        resort() { this.order = []; this.paint(); }

        /**
         * Dragging a tile along the hand moves it; tapping one throws it.
         *
         * The two have to live on the same tile, so they are told apart by
         * distance: nothing happens until the pointer has moved far enough
         * that it cannot have been a tap, and once it has, the tap that
         * would follow on release is swallowed. A locked hand still drags —
         * waiting for the other seats is exactly when you tidy your tiles.
         */
        dragStart(ev) {
            if (ev.button > 0 || this.engine.over) return;
            const el = ev.target.closest && ev.target.closest('.mj-pick');
            if (!el) return;
            this.drag = { id: el.dataset.tile, el, x: ev.clientX, y: ev.clientY, moved: false };
        }

        dragMove(ev) {
            const d = this.drag;
            if (!d) return;
            const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
            if (!d.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            d.moved = true;
            d.el.classList.add('is-dragging');
            d.el.style.transform = `translate(${dx}px, ${dy}px)`;
            // The page must not scroll under a tile that is being carried.
            if (ev.cancelable) ev.preventDefault();
        }

        dragEnd(ev) {
            const d = this.drag;
            this.drag = null;
            if (!d) return;
            d.el.style.transform = '';
            d.el.classList.remove('is-dragging');
            if (!d.moved) return;                 // a tap: let the click throw it
            this.dropped = true;                  // …but a drag must not
            setTimeout(() => { this.dropped = false; }, 0);
            this.dropAt(d.id, ev.clientX, ev.clientY);
        }

        /** Put the dragged tile where the pointer let go of it. */
        dropAt(id, x, y) {
            const host = this.root.querySelector('.mj-mine');
            if (!host) return;
            const picks = [...host.querySelectorAll('.mj-pick')].filter((p) => p.dataset.tile !== id);
            const ids = picks.map((p) => p.dataset.tile);
            // Reading order, because the hand wraps on a narrow screen: a
            // tile on a row below the pointer comes after it whatever the x.
            let insert = ids.length;
            for (let i = 0; i < picks.length; i++) {
                const r = picks[i].getBoundingClientRect();
                if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) { insert = i; break; }
            }
            ids.splice(insert, 0, id);
            this.order = ids;
            this.paint();
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('mjActions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            const buttons = [];
            for (const o of options) {
                if (o.type === 'discard') continue;      // tiles are the buttons
                const cls = o.type === 'win' ? 'btn primary big'
                    : o.type === 'draw' ? 'btn primary big mj-draw-btn' : 'btn';
                const data = o.type === 'kong' && o.key ? ` data-key="${o.key}"` : '';
                const low = o.low ? ` data-low="${o.low}"` : '';
                buttons.push(`<button class="${cls}" data-act="${o.type}"${data}${low}>${esc(o.label)}</button>`);
            }
            const hint = e.phase === 'discard' && !e.over
                ? `<div class="muted small">${esc(t('mj.tapToDiscard'))}</div>` : '';

            host.innerHTML = buttons.length
                ? `<div class="btn-row">${buttons.join('')}</div>${hint}` : hint;
        }

        /* ---- input ------------------------------------------------------------ */

        discard(id) {
            const e = this.engine;
            if (this.dropped) return;             // that was a drag, not a throw
            if (e.over || e.turn !== this.you || e.phase !== 'discard') return;
            this.table.dispatch({ type: 'discard', seat: this.you, tile: id });
        }

        act(el) {
            const type = el.dataset.act;
            const out = { type, seat: this.you };
            if (el.dataset.key) out.key = el.dataset.key;
            if (el.dataset.low) out.low = el.dataset.low;
            this.table.dispatch(out);
        }
    }

    CV.MahjongView = MahjongView;
    CV.MahjongTile = tileHtml;
    /**
     * A tile drawn from a key rather than from a tile, for the recap: a fly
     * has to be shown as what it was counted as, and by the time the overlay
     * is up the hand has been taken off the table.
     */
    CV.MahjongKeyTile = keyTile;
})();
