/**
 * CardVerse — the Lami table.
 *
 * The melds already down across the middle, the opponents' counts above, and
 * your rack along the bottom. Tap tiles to pick them up, then either lay them
 * as a new meld or add them to one that is already there.
 *
 * The screen never decides what is legal. 出 goes live only when the engine
 * agrees the selection is a meld, and a table meld only lights up when the
 * selection would actually go onto it — which is the difference between a
 * game you can learn by trying things and one you have to be told.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const L = CV.Lami;
    const { esc, fmt } = CV.UI;

    /** One tile face. Suits get their own colour — two reds would be unreadable. */
    function tileHtml(tile, opts = {}) {
        const extra = (opts.cls ? ' ' + opts.cls : '') + (opts.small ? ' tile-sm' : '');
        if (!tile) return `<span class="tile tile-back${extra}"></span>`;
        if (L.isJoker(tile)) {
            return `<span class="tile tile-joker${extra}" data-id="${tile.id}"
                aria-label="Joker"><b>🃏</b></span>`;
        }
        return `<span class="tile lami-${tile.s}${extra}" data-id="${tile.id}"
            aria-label="${esc(L.name(tile))}"><b>${L.rankLabel(tile.r)}</b><i>${L.SUIT_SYMBOL[tile.s]}</i></span>`;
    }

    class LamiView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.picked  = new Set();
            this.target  = -1;      // table meld the selection would join
        }

        get you() { return this.engine.youSeat; }
        get revealing() { return false; }

        mount() {
            this.root.innerHTML = `
                <div class="lami">
                    <div class="lami-seats" id="lamiSeats"></div>
                    <div class="lami-board" id="lamiBoard"></div>
                    <div class="bj-status" id="lamiStatus"></div>
                    <div class="lami-rack" id="lamiRack"></div>
                    <div class="bj-actions" id="lamiActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            CV.UI.on(this.root, '[data-pick]', (el) => this.pick(el.dataset.pick));
            CV.UI.on(this.root, '[data-meld]', (el) => this.aim(Number(el.dataset.meld)));
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() { this.root.innerHTML = ''; }

        onChange(events) {
            for (const e of events) {
                if ((e.type === 'play' || e.type === 'extend') && e.seat === this.you) {
                    this.picked.clear();
                    this.target = -1;
                }
                if (e.type === 'turn') this.target = -1;
            }
            this.paint();
        }

        /* ---- painting -------------------------------------------------------- */

        paint() {
            this.paintSeats();
            this.paintBoard();
            this.paintStatus();
            this.paintRack();
            this.paintActions();
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
        }

        paintSeats() {
            const e = this.engine;
            const you = this.you < 0 ? -1 : this.you;
            const order = e.seats.map((_, i) => i).filter((i) => i !== you);
            this.$('lamiSeats').innerHTML = order.map((i) => {
                const s = e.seats[i];
                const turn = e.turn === i && !e.over;
                const did = s.lastAction ? t('lami.did.' + s.lastAction) : '';
                return `
                    <div class="seat lami-seat${turn ? ' is-turn' : ''}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <span class="who"><span class="name">${esc(s.name)}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span></span>
                            <span class="tag lami-count">${s.rack.length}</span>
                        </div>
                        <div class="play-pass">${esc(did)}</div>
                    </div>`;
            }).join('');
        }

        /** Would the current selection go onto meld `i`? */
        fits(i) {
            const sel = this.selection;
            if (!sel.length || this.engine.turn !== this.you || this.engine.over) return false;
            return !!L.extend(this.engine.table[i].tiles, sel, this.engine.rules);
        }

        paintBoard() {
            const e = this.engine;
            const host = this.$('lamiBoard');
            if (!e.table.length) {
                host.innerHTML = `<div class="lami-empty">${esc(t('lami.emptyTable'))}</div>`;
                return;
            }
            host.innerHTML = e.table.map((m, i) => {
                const can = this.fits(i);
                const on = this.target === i;
                return `<button class="lami-meld${can ? ' can-take' : ''}${on ? ' is-aimed' : ''}"
                    data-meld="${i}" ${can ? '' : 'disabled'}>
                    ${m.tiles.map((x) => tileHtml(x, { small: true })).join('')}
                </button>`;
            }).join('');
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('lamiStatus');
            if (e.over) { host.innerHTML = ''; return; }
            if (e.turn === this.you) {
                host.innerHTML = `<span class="you">${esc(e.played
                    ? t('lami.keepGoing') : t('lami.yourTurn'))}</span>`;
                return;
            }
            host.innerHTML = `<span class="muted">${esc(t('lami.waiting', { name: e.seats[e.turn].name }))}</span>`;
        }

        get selection() {
            if (this.you < 0) return [];
            return this.engine.seats[this.you].rack.filter((x) => this.picked.has(x.id));
        }

        paintRack() {
            const e = this.engine;
            const host = this.$('lamiRack');
            if (this.you < 0) { host.innerHTML = ''; return; }
            const s = e.seats[this.you];
            const mine = e.turn === this.you && !e.over;

            host.innerHTML = `
                <div class="hand-head">
                    <span class="seat-count">${esc(t('lami.yours', { n: s.rack.length, p: L.handPoints(s.rack) }))}</span>
                    <span class="seat-count">${esc(t('lami.pool', { n: e.poolLeft }))}</span>
                </div>
                <div class="lami-tiles">
                    ${s.rack.map((tile) => `<button class="lami-pick${this.picked.has(tile.id) ? ' is-on' : ''}"
                        ${mine ? '' : 'disabled'} data-pick="${tile.id}">${tileHtml(tile)}</button>`).join('')}
                </div>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('lamiActions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            const sel = this.selection;
            const asMeld = sel.length ? L.meld(sel, e.rules) : null;
            const canAdd = this.target >= 0 && this.fits(this.target);
            const draw = options.find((o) => o.type === 'draw');
            const pass = options.find((o) => o.type === 'pass');
            const done = options.find((o) => o.type === 'done');

            host.innerHTML = `
                <div class="btn-row">
                    <button class="btn primary big" data-act="play" ${asMeld ? '' : 'disabled'}>
                        ${esc(t('lami.play'))}${asMeld ? ` · ${esc(t('lami.' + asMeld.type))}` : ''}</button>
                    <button class="btn" data-act="add" ${canAdd ? '' : 'disabled'}>${esc(t('lami.add'))}</button>
                    ${draw ? `<button class="btn ghost" data-act="draw">${esc(t('lami.draw'))}</button>` : ''}
                    ${pass ? `<button class="btn ghost" data-act="pass">${esc(t('lami.pass'))}</button>` : ''}
                    ${done ? `<button class="btn ghost" data-act="done">${esc(t('lami.done'))}</button>` : ''}
                </div>
                <div class="muted small">${esc(sel.length && !asMeld && this.target < 0
                    ? t('lami.notAMeld') : t('lami.hint'))}</div>`;
        }

        /* ---- input ------------------------------------------------------------ */

        pick(id) {
            const e = this.engine;
            if (e.over || e.turn !== this.you) return;
            if (this.picked.has(id)) this.picked.delete(id); else this.picked.add(id);
            this.target = -1;
            this.paintBoard();
            this.paintRack();
            this.paintActions();
        }

        aim(i) {
            this.target = this.target === i ? -1 : i;
            this.paintBoard();
            this.paintActions();
        }

        act(el) {
            const type = el.dataset.act;
            const seat = this.you;
            const ids = this.selection.map((x) => x.id);

            if (type === 'play')  return void this.table.dispatch({ type: 'play', seat, tiles: ids });
            if (type === 'add')   return void this.table.dispatch({ type: 'extend', seat, at: this.target, tiles: ids });
            if (type === 'draw')  return void this.table.dispatch({ type: 'draw', seat });
            if (type === 'pass')  return void this.table.dispatch({ type: 'pass', seat });
            if (type === 'done')  return void this.table.dispatch({ type: 'done', seat });
        }
    }

    CV.LamiView = LamiView;
    CV.LamiTile = tileHtml;
})();
