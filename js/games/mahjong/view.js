/**
 * CardVerse — the 麻将 table.
 *
 * Tiles are drawn in CSS, the same way the cards are: a face with a number
 * and a suit mark, or an honour's character. No sprite sheet, so a tile skin
 * is a CSS rule and the folder stays copyable.
 *
 * Each opponent shows what is public about them — how many tiles they hold,
 * what they have melded, and everything they have thrown. The tile just
 * thrown is marked, because a claim has to be decided on it and it is
 * otherwise lost in a row of twenty.
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
        const extra = (opts.cls ? ' ' + opts.cls : '') + (opts.small ? ' tile-sm' : '');
        if (!tile) return `<span class="tile tile-back${extra}"></span>`;
        if (tile.suit === 'z') {
            return `<span class="tile tile-z z${tile.n}${extra}" data-id="${tile.id}"
                aria-label="${esc(MJ.nameEn(tile))}"><b>${MJ.HONOURS[tile.n - 1]}</b></span>`;
        }
        return `<span class="tile tile-${tile.suit}${extra}" data-id="${tile.id}"
            aria-label="${esc(MJ.nameEn(tile))}"><b>${tile.n}</b><i>${MJ.SUIT_MARK[tile.suit]}</i></span>`;
    }

    const row = (tiles, opts) => tiles.map((x) => tileHtml(x, opts)).join('');

    class MahjongView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
        }

        get you() { return this.engine.youSeat; }
        get revealing() { return false; }

        mount() {
            this.root.innerHTML = `
                <div class="mj">
                    <div class="mj-seats" id="mjSeats"></div>
                    <div class="mj-centre" id="mjCentre"></div>
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
            this.paintCentre();
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

        meldHtml(meld) {
            const tiles = meld.concealed && meld.type === 'kong'
                ? [null, meld.tiles[1], meld.tiles[2], null]     // a concealed kong shows its middle
                : meld.tiles;
            return `<span class="mj-meld">${row(tiles, { small: true })}</span>`;
        }

        seatBox(i) {
            const e = this.engine;
            const s = e.seats[i];
            const turn = e.turn === i && !e.over;
            const open = e.over && i === e.winner;
            const hand = (i === this.you || open) ? s.hand : s.hand.map(() => null);

            return `
                <div class="seat mj-seat${turn ? ' is-turn' : ''}">
                    <div class="seat-head">
                        <span class="avatar">${s.avatar}</span>
                        <span class="who"><span class="name">${esc(s.name)}</span>
                            <span class="coins">🪙 ${fmt(s.coins)}</span></span>
                        <span class="tag mj-count">${s.hand.length}</span>
                        <span class="tag mj-wind${i === e.dealer ? ' is-dealer' : ''}">${this.windOf(i)}</span>
                    </div>
                    <div class="mj-hand-row">${row(hand, { small: true })}</div>
                    <div class="mj-melds">${s.melds.map((m) => this.meldHtml(m)).join('')}</div>
                    <div class="mj-discards">${this.discardRow(i)}</div>
                </div>`;
        }

        discardRow(i) {
            const e = this.engine;
            const s = e.seats[i];
            const last = e.lastDiscard;
            return s.discards.map((tile, idx) => tileHtml(tile, {
                small: true,
                cls: (last && last.from === i && idx === s.discards.length - 1 && !e.over) ? 'is-last' : '',
            })).join('');
        }

        paintSeats() {
            const e = this.engine;
            const you = this.you < 0 ? -1 : this.you;
            const others = [];
            for (let k = 1; k < e.players; k++) others.push((you + k) % e.players);
            this.$('mjSeats').innerHTML = others.map((i) => this.seatBox(i)).join('');
        }

        paintCentre() {
            const e = this.engine;
            this.$('mjCentre').innerHTML = `
                <span class="pile-label">${esc(t('mj.wall', { n: e.wallLeft }))}</span>
                <span class="mj-mode">${esc(t('mj.mode', { n: e.players }))}</span>
                <span class="mj-mode">${esc(t('mj.unit', { n: e.unit }))}</span>
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
                    <span class="seat-count">${esc(t('mj.wall', { n: e.wallLeft }))}</span>
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
