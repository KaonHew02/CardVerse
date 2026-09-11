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

    /**
     * A joker drawn as the card it is standing in for.
     *
     * `🃏` on its own is the one tile on the table that says nothing about
     * what it is doing there, and in a run it is doing something exact. So a
     * preview draws it as that card with a ring and a 🃏 badge, the same way
     * the mahjong table draws a 飞 as the tile it became.
     */
    let ghostId = 0;
    const ghost = (s, r, opts) => tileHtml({ s, r, id: 'g' + (ghostId++) },
        Object.assign({}, opts, { cls: 'lami-ghost' + (opts && opts.cls ? ' ' + opts.cls : '') }));

    /** A run laid out from `lo`, with every joker drawn as its rank. */
    function runHtml(tiles, rules, lo) {
        const laid = L.layout(tiles, rules, lo);
        const real = laid.find((x) => !L.isJoker(x));
        if (!real) return laid.map((x) => tileHtml(x, { small: true })).join('');
        return laid.map((x, i) => (L.isJoker(x)
            ? ghost(real.s, lo + i, { small: true })
            : tileHtml(x, { small: true }))).join('');
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
                // A folded seat is still at the table and its rack still
                // counts at the end, so it stays on screen — dimmed, and
                // said out loud, because a seat being skipped in turn order
                // with no explanation looks like the game losing track.
                return `
                    <div class="seat lami-seat${turn ? ' is-turn' : ''}${s.folded ? ' is-folded' : ''}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <span class="who"><span class="name">${esc(s.name)}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span></span>
                            <span class="tag lami-count">${s.rack.length}</span>
                        </div>
                        <div class="play-pass">${esc(s.folded ? t('lami.fold') : did)}</div>
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
                host.innerHTML = `<span class="you">${esc(t('lami.yourTurn'))}</span>`;
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
                    <span class="seat-count">${esc(L.pieces(s.rack)
                        ? t('lami.pieces', { n: L.pieces(s.rack) })
                        : t('lami.piecesNone'))}</span>
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
            const joker = options.find((o) => o.type === 'joker');
            const fold = options.find((o) => o.type === 'fold');
            // Until a seat has opened, a set it could otherwise lay is not a
            // legal move — so the button says why rather than just refusing.
            const shut = asMeld && !e.seats[this.you].opened && asMeld.type !== 'run';

            // **What is the joker?** A run that could start on more than one
            // rank is a real choice — ♥J ♥Q 🃏 is 10-J-Q or J-Q-K — and one
            // button reading 打出 was the screen making it silently. One
            // button per reading, each drawn as the run it lays.
            const ways = (!asMeld || shut) ? [] : L.runWindows(sel, e.rules);
            const addTiles = canAdd ? e.table[this.target].tiles.concat(sel) : null;
            const addWays = canAdd ? L.runWindows(addTiles, e.rules) : [];

            const lay = (act, low, tiles, label) =>
                `<button class="btn primary lami-run" data-act="${act}" data-lo="${low}">
                    <span class="lami-run-tiles">${runHtml(tiles, e.rules, low)}</span>
                    <span class="lami-run-label">${esc(label)}</span>
                 </button>`;

            const playBtns = ways.length > 1
                ? ways.map((low) => lay('play', low, sel, t('lami.play'))).join('')
                : `<button class="btn primary big" data-act="play" ${asMeld && !shut ? '' : 'disabled'}>
                        ${esc(t('lami.play'))}${asMeld ? ` · ${esc(t('lami.' + asMeld.type))}` : ''}</button>`;
            const addBtns = addWays.length > 1
                ? addWays.map((low) => lay('add', low, addTiles, t('lami.add'))).join('')
                : `<button class="btn" data-act="add" ${canAdd ? '' : 'disabled'}>${esc(t('lami.add'))}</button>`;

            const note = shut ? t('lami.mustRun')
                : (ways.length > 1 || addWays.length > 1) ? t('lami.jokerPick')
                : sel.length && !asMeld && this.target < 0 ? t('lami.notAMeld')
                : t('lami.hint');

            host.innerHTML = `
                <div class="btn-row lami-run-row">
                    ${playBtns}
                    ${addBtns}
                    ${joker ? `<button class="btn ghost" data-act="joker">${esc(t('lami.jokerOut'))}</button>` : ''}
                    ${fold ? `<button class="btn ghost" data-act="fold">${esc(t('lami.fold'))}</button>` : ''}
                </div>
                <div class="muted small">${esc(note)}</div>`;
        }

        /* ---- input ------------------------------------------------------------ */

        pick(id) {
            const e = this.engine;
            if (e.over || e.turn !== this.you) return;
            if (this.picked.has(id)) this.picked.delete(id); else this.picked.add(id);
            this.reaim();
            this.paintBoard();
            this.paintRack();
            this.paintActions();
        }

        /**
         * **The meld your tiles would go onto, aimed for you.**
         *
         * Picking a tile used to clear the aim, so the sequence that looks
         * obvious — tap the meld you want, then tap the tile — ended with
         * 加上去 greyed out and a meld on the table lit up saying it would
         * take the tile. Two things on screen disagreeing, and the only way
         * through was to do it in the other order.
         *
         * So the aim survives a pick wherever it still fits, and when exactly
         * one meld on the table would take the selection it is aimed without
         * being asked — there is nothing to choose between. Two or more and
         * it waits, because then it is a real question.
         */
        reaim() {
            if (this.target >= 0 && this.fits(this.target)) return;
            const fits = [];
            for (let i = 0; i < this.engine.table.length; i++) if (this.fits(i)) fits.push(i);
            this.target = fits.length === 1 ? fits[0] : -1;
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
            // Which rank the run starts on, when the player picked a reading.
            const lo = el.dataset.lo === undefined ? undefined : Number(el.dataset.lo);

            if (type === 'play')  return void this.table.dispatch({ type: 'play', seat, tiles: ids, lo });
            if (type === 'add')   return void this.table.dispatch({ type: 'extend', seat, at: this.target, tiles: ids, lo });
            if (type === 'joker') return void this.table.dispatch({ type: 'joker', seat });
            if (type === 'fold')  return void this.table.dispatch({ type: 'fold', seat });
        }
    }

    CV.LamiView = LamiView;
    CV.LamiTile = tileHtml;
})();
