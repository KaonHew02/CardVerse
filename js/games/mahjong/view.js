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
        if (tile.suit === 'f') {
            return `<span class="tile tile-flower${extra}" data-id="${tile.id}"
                aria-label="Flower ${tile.n}"><b>花</b><i>${tile.n}</i></span>`;
        }
        if (tile.suit === 'z') {
            return `<span class="tile tile-z z${tile.n}${extra}" data-id="${tile.id}"
                aria-label="${esc(MJ.nameEn(tile))}"><b>${MJ.HONOURS[tile.n - 1]}</b></span>`;
        }
        // The face is drawn, not written — see faces.js.
        return `<span class="tile tile-${tile.suit}${extra}" data-id="${tile.id}"
            aria-label="${esc(MJ.nameEn(tile))}">${CV.MJFaces.suitFace(tile.suit, tile.n)}</span>`;
    }

    const row = (tiles, opts) => tiles.map((x) => tileHtml(x, opts)).join('');

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

    class MahjongView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
        }

        get you() { return this.engine.youSeat; }
        get revealing() { return false; }

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
                    <div class="mj-table">
                        <div class="mj-seat-slot at-top"    id="mjSeatTop"></div>
                        <div class="mj-seat-slot at-left"   id="mjSeatLeft"></div>
                        <div class="mj-seat-slot at-right"  id="mjSeatRight"></div>
                        <div class="mj-pool">
                            <div class="mj-pool-cell at-top"    id="mjPoolTop"></div>
                            <div class="mj-pool-cell at-left"   id="mjPoolLeft"></div>
                            <div class="mj-hub"                 id="mjHub"></div>
                            <div class="mj-pool-cell at-right"  id="mjPoolRight"></div>
                            <div class="mj-pool-cell at-bottom" id="mjPoolBottom"></div>
                        </div>
                    </div>
                    <div class="bj-status" id="mjStatus"></div>
                    <div class="mj-you" id="mjYou"></div>
                    <div class="bj-actions" id="mjActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            CV.UI.on(this.root, '[data-tile]', (el) => this.discard(el.dataset.tile));
            this.table.onChange(() => this.paint());
            this.paint();
        }

        unmount() { this.root.innerHTML = ''; }

        paint() {
            this.paintSeats();
            this.paintPool();
            this.paintHub();
            this.paintStatus();
            this.paintYou();
            this.paintActions();
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
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
            const open = e.over && i === e.winner;
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
                    <div class="mj-wall-row${upright ? '' : ' is-side'}">${row(hand, { tiny: true })}</div>
                    <div class="mj-melds">${s.melds.map((m) => this.meldHtml(m, { tiny: true })).join('')}</div>
                </div>`;
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
            const cells = { top: 'mjPoolTop', left: 'mjPoolLeft', right: 'mjPoolRight', bottom: 'mjPoolBottom' };
            for (const id of Object.values(cells)) this.$(id).innerHTML = '';
            if (this.you >= 0) this.$(cells.bottom).innerHTML = this.discardRow(this.you);
            for (const { seat, place } of this.places()) {
                this.$(cells[place]).innerHTML = this.discardRow(seat);
            }
        }

        /** The wind, the wall and the stake — the centre of a real table. */
        paintHub() {
            const e = this.engine;
            this.$('mjHub').innerHTML = `
                <span class="mj-hub-wind">${esc(this.windOf(this.you < 0 ? 0 : this.you))}</span>
                <span class="mj-hub-wall">${esc(t('mj.wall', { n: e.wallLeft }))}</span>
                <span class="mj-hub-line">${esc(t('mj.mode', { n: e.players }))}</span>
                <span class="mj-hub-line">${esc(t('mj.unit', { n: e.unit }))}</span>
                ${e.mode.flyEnabled ? `<span class="mj-hub-line">${esc(t('mj.flyOn'))}</span>` : ''}
                ${e.minFan ? `<span class="mj-min">${esc(t('mj.min', { n: e.minFan }))}</span>` : ''}`;
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
            if (e.phase === 'claim' && e.turn === this.you) {
                host.innerHTML = `<span class="you">${esc(t('mj.yourClaim'))}</span>`;
                return;
            }
            if (e.turn === this.you) {
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

        paintYou() {
            const e = this.engine;
            const host = this.$('mjYou');
            if (this.you < 0) { host.innerHTML = ''; return; }
            const s = e.seats[this.you];
            const mine = e.turn === this.you && e.phase === 'discard' && !e.over;

            host.innerHTML = `
                <div class="hand-head">
                    <span class="tag mj-wind${this.you === e.dealer ? ' is-dealer' : ''}">${this.windOf(this.you)}</span>
                    ${s.flowers.length
                        ? `<span class="mj-flowers-mine">
                             <span class="mj-flowers-label">${esc(t('mj.myFlowers', { n: s.flowers.length }))}</span>
                             ${row(s.flowers, { small: true })}
                           </span>`
                        : `<span class="muted small">${esc(t('mj.noFlowers'))}</span>`}
                </div>
                <div class="mj-melds mine">${s.melds.map((m) => this.meldHtml(m)).join('')}</div>
                <div class="mj-mine">
                    ${s.hand.map((tile) => `<button class="mj-pick" ${mine ? '' : 'disabled'}
                        data-tile="${tile.id}">${tileHtml(tile)}</button>`).join('')}
                </div>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('mjActions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            const buttons = [];
            for (const o of options) {
                if (o.type === 'discard') continue;      // tiles are the buttons
                const cls = o.type === 'win' ? 'btn primary big' : 'btn';
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
})();
