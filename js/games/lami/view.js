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
            this.order   = [];      // your own arrangement of your own rack
            this.drag    = null;
            this.dropped = false;   // a drag just ended; swallow the click
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

            /**
             * **Carrying a tile, rather than selecting it.**
             *
             * Half of playing rummy is keeping the tiles you are working on
             * next to each other, and the rack was sorted by the engine and
             * stuck that way. It drags now, exactly like the mahjong hand:
             * hold a tile and move it along the rack to reorder, or carry it
             * out onto a meld on the table to add it there.
             *
             * Dropping onto a meld is the same move as 加上去 and goes
             * through the same engine action — it is a second way to say it,
             * not a second rule.
             */
            this.onDown = (ev) => this.dragStart(ev);
            this.onMove = (ev) => this.dragMove(ev);
            this.onUp   = (ev) => this.dragEnd(ev);
            this.root.addEventListener('pointerdown', this.onDown);
            window.addEventListener('pointermove', this.onMove, { passive: false });
            window.addEventListener('pointerup', this.onUp);
            window.addEventListener('pointercancel', this.onUp);

            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() {
            window.removeEventListener('pointermove', this.onMove);
            window.removeEventListener('pointerup', this.onUp);
            window.removeEventListener('pointercancel', this.onUp);
            this.root.innerHTML = '';
        }

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
            const e = this.engine;
            const sel = this.selection;
            if (!sel.length || e.turn !== this.you || e.over) return false;
            // Not on the table yet, so nothing goes onto anybody else's meld.
            if (!e.seats[this.you].opened) return false;
            return !!L.extend(e.table[i].tiles, sel, e.rules);
        }

        /**
         * **Two shelves: 顺子 above, 同点 below.**
         *
         * The table used to be one row in the order things were laid, which
         * by the middle of a hand is a dozen melds of two different kinds
         * mixed together. The question a player actually asks of it is never
         * "what was laid fourth" — it is *where could this tile go*, and the
         * answer depends entirely on which kind of meld it is: a 6♣ looks for
         * a ♣ run, a third 7 looks for a set of sevens. Sorting by kind puts
         * the half you are searching in front of you and the half you are not
         * out of the way.
         *
         * Both shelves stay on screen once anything is down, empty or not, so
         * neither moves under you when the other one grows.
         *
         * `data-meld` carries the index into `engine.table`, which is what
         * every click, aim and drop is addressed by — the shelves are a
         * rearrangement of the screen and of nothing else.
         */
        paintBoard() {
            const e = this.engine;
            const host = this.$('lamiBoard');
            if (!e.table.length) {
                host.innerHTML = `<div class="lami-empty">${esc(t('lami.emptyTable'))}</div>`;
                return;
            }
            host.innerHTML = this.shelfHtml('run', 'lami.shelfRuns')
                           + this.shelfHtml('set', 'lami.shelfSets');
        }

        shelfHtml(type, label) {
            const e = this.engine;
            const rows = e.table
                .map((m, i) => ({ m, i }))
                .filter((x) => x.m.meld && x.m.meld.type === type);
            const melds = rows.map(({ m, i }) => {
                const can = this.fits(i);
                const on = this.target === i;
                return `<button class="lami-meld${can ? ' can-take' : ''}${on ? ' is-aimed' : ''}"
                    data-meld="${i}" ${can ? '' : 'disabled'}>
                    ${m.tiles.map((x) => tileHtml(x, { small: true })).join('')}
                </button>`;
            }).join('');
            return `<div class="lami-shelf">
                <span class="lami-shelf-label">${esc(t(label))}</span>
                <div class="lami-shelf-melds">${melds
                    || `<span class="lami-shelf-none">${esc(t('lami.shelfNone'))}</span>`}</div>
            </div>`;
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('lamiStatus');
            if (e.over) { host.innerHTML = ''; return; }
            if (e.turn === this.you) {
                // A seat that has to open has one move and no way out of it,
                // and a line telling it it may fold would be a lie.
                const must = e.mustOpen(this.you);
                host.innerHTML = `<span class="you">${esc(t(must ? 'lami.mustOpen' : 'lami.yourTurn'))}</span>`;
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

            host.innerHTML = `
                <div class="hand-head">
                    <span class="seat-count">${esc(t('lami.yours', { n: s.rack.length, p: L.handPoints(s.rack) }))}</span>
                    <span class="seat-count">${esc(L.pieces(s.rack)
                        ? t('lami.pieces', { n: L.pieces(s.rack) })
                        : t('lami.piecesNone'))}</span>
                </div>
                <div class="lami-tiles">
                    ${this.rack(s).map((tile) => `<button class="lami-pick${this.picked.has(tile.id) ? ' is-on' : ''}"
                        data-pick="${tile.id}">${tileHtml(tile)}</button>`).join('')}
                </div>
                <div class="muted small lami-drag-hint">${esc(t('lami.dragHint'))}</div>`;
        }

        /* ---- your rack, in your order ----------------------------------------- */

        /**
         * **Your rack in the order you put it in.**
         *
         * The engine sorts by suit then rank, which is the right default and
         * the wrong thing to be stuck with — the whole game is noticing that
         * three tiles belong together, and they are easier to notice next to
         * each other. Anything you have not moved keeps the sorted order, and
         * a tile that was not there last time slides into the place it would
         * have sorted to, so a rack you have arranged is not disturbed by one
         * arriving.
         *
         * Ids, not indexes: the rack is rebuilt on every paint.
         */
        rack(seat) {
            const byId = new Map(seat.rack.map((x) => [x.id, x]));
            const out = [];
            for (const id of this.order) {
                const tile = byId.get(id);
                if (tile) { out.push(tile); byId.delete(id); }
            }
            for (const tile of seat.rack) {
                if (!byId.has(tile.id)) continue;
                const at = out.findIndex((x) => L.cmp(x, tile) > 0);
                if (at < 0) out.push(tile); else out.splice(at, 0, tile);
            }
            this.order = out.map((x) => x.id);
            return out;
        }

        /* ---- dragging ---------------------------------------------------------- */

        /**
         * Dragging a tile moves it; tapping one selects it. The two live on
         * the same tile and are told apart by distance — nothing happens
         * until the pointer has moved further than a tap could, and once it
         * has, the click that follows on release is swallowed.
         *
         * A rack drags on somebody else's turn too. Waiting for the other
         * three is exactly when you tidy your tiles.
         */
        dragStart(ev) {
            if (ev.button > 0 || this.engine.over) return;
            const el = ev.target.closest && ev.target.closest('.lami-pick');
            if (!el) return;
            this.drag = { id: el.dataset.pick, el, x: ev.clientX, y: ev.clientY, moved: false };
        }

        dragMove(ev) {
            const d = this.drag;
            if (!d) return;
            const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
            if (!d.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            if (!d.moved) {
                d.moved = true;
                d.el.classList.add('is-dragging');
                // Light the melds this one tile would join, so carrying it
                // out onto the table is aimed rather than hopeful.
                this.markDrops(d.id, true);
            }
            d.el.style.transform = `translate(${dx}px, ${dy}px)`;
            if (ev.cancelable) ev.preventDefault();
        }

        dragEnd(ev) {
            const d = this.drag;
            this.drag = null;
            if (!d) return;
            d.el.style.transform = '';
            d.el.classList.remove('is-dragging');
            this.markDrops(d.id, false);
            if (!d.moved) return;                 // a tap: let the click select it
            this.dropped = true;                  // …but a drag must not
            setTimeout(() => { this.dropped = false; }, 0);
            this.dropAt(d.id, ev.clientX, ev.clientY);
        }

        /** Which melds on the table would take this one tile. */
        dropTargets(id) {
            const e = this.engine;
            const out = [];
            if (this.you < 0 || e.over || e.turn !== this.you) return out;
            if (!e.seats[this.you].opened) return out;     // not on the table yet
            const tile = e.seats[this.you].rack.find((x) => x.id === id);
            if (!tile) return out;
            for (let i = 0; i < e.table.length; i++) {
                if (L.extend(e.table[i].tiles, [tile], e.rules)) out.push(i);
            }
            return out;
        }

        markDrops(id, on) {
            for (const el of this.root.querySelectorAll('.lami-meld')) el.classList.remove('is-drop');
            if (!on) return;
            // By `data-meld`, not by position: the melds are grouped by kind
            // on screen, so the third button is not the third meld.
            for (const i of this.dropTargets(id)) {
                const el = this.root.querySelector(`.lami-meld[data-meld="${i}"]`);
                if (el) el.classList.add('is-drop');
            }
        }

        /**
         * Where the tile was let go.
         *
         * Over a meld it would join, that is the move — the same action the
         * 加上去 button sends. Anywhere else it is a rearrangement, and the
         * tile takes the place in the rack the pointer left it at.
         */
        dropAt(id, x, y) {
            const over = document.elementFromPoint(x, y);
            const meld = over && over.closest && over.closest('.lami-meld');
            if (meld) {
                const at = Number(meld.dataset.meld);
                if (this.dropTargets(id).includes(at)) {
                    this.picked.clear();
                    this.target = -1;
                    this.table.dispatch({ type: 'extend', seat: this.you, at, tiles: [id] });
                }
                // Dropped on a meld it does not join: the tile goes back
                // where it came from. Falling through to the rearrangement
                // below would read the pointer — which is up on the board,
                // above every tile in the rack — and fling the tile to the
                // front of the rack for missing.
                return;
            }

            const host = this.root.querySelector('.lami-tiles');
            if (!host) return;
            const picks = [...host.querySelectorAll('.lami-pick')].filter((p) => p.dataset.pick !== id);
            const ids = picks.map((p) => p.dataset.pick);
            // Reading order, because the rack wraps: a tile on a row below
            // the pointer comes after it whatever the x.
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
            const host = this.$('lamiActions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            const sel = this.selection;
            const asMeld = sel.length ? L.meld(sel, e.rules) : null;
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

            const lay = (act, low, tiles, label) =>
                `<button class="btn primary lami-run" data-act="${act}" data-lo="${low}">
                    <span class="lami-run-tiles">${runHtml(tiles, e.rules, low)}</span>
                    <span class="lami-run-label">${esc(label)}</span>
                 </button>`;

            const playBtns = ways.length > 1
                ? ways.map((low) => lay('play', low, sel, t('lami.play'))).join('')
                : `<button class="btn primary big" data-act="play" ${asMeld && !shut ? '' : 'disabled'}>
                        ${esc(t('lami.play'))}${asMeld ? ` · ${esc(t('lami.' + asMeld.type))}` : ''}</button>`;
            // 加上去 is no longer a button at all — the meld on the table *is*
            // the button, and clicking it puts the tiles there.

            // **Melds your tiles would join, that you have not aimed at yet.**
            //
            // They light up green on the board; 加上去 stays dead until one of
            // them is chosen, which is correct — the screen must not pick a
            // meld for you — but the line underneath was saying "这几张凑不成
            // 顺子或同点", which is about laying a *new* meld and reads, next
            // to two lit melds and a dead button, as a flat refusal. It is
            // the one place the table says two opposite things at once.
            const openTo = (sel.length && this.target < 0)
                ? e.table.map((_, i) => i).filter((i) => this.fits(i)) : [];

            const note = shut ? t('lami.mustRun')
                : ways.length > 1 ? t('lami.jokerPick')
                : openTo.length ? t('lami.pickMeld')
                : sel.length && !asMeld && this.target < 0 ? this.whyNot(sel)
                : e.mustOpen(this.you) ? t('lami.mustOpen')
                : t('lami.hint');

            host.innerHTML = `
                <div class="btn-row lami-run-row">
                    ${playBtns}
                    ${joker ? `<button class="btn ghost" data-act="joker">${esc(t('lami.jokerOut'))}</button>` : ''}
                    ${fold ? `<button class="btn ghost" data-act="fold">${esc(t('lami.fold'))}</button>` : ''}
                </div>
                <div class="muted small">${esc(note)}</div>`;
        }

        /* ---- input ------------------------------------------------------------ */

        /**
         * **Why these tiles are not a meld** — the reason, not the verdict.
         *
         * "这几张凑不成顺子或同点" is true of every failed selection and
         * useful for none of them. The two ways a player actually gets this
         * wrong are both invisible in a row of tiles: three of one number
         * where two share a suit, and three of one suit where two share a
         * number. The box holds *two of every card*, so both happen
         * constantly — and from the ranks alone J♦ J♦ J♠ looks exactly like
         * the set it very nearly is.
         */
        whyNot(sel) {
            const cfg = this.engine.rules;
            const real = sel.filter((x) => !L.isJoker(x));

            /**
             * **Picking a second card adds to the selection; it does not
             * replace it.**
             *
             * Which is right — you lay three at a time — and is a trap when
             * you are adding one card to a meld. Tap the 2 you cannot place,
             * then tap the K you can, and now you are holding *two* cards
             * that fit nothing together, so nothing lights and the table
             * looks like it has refused the K as well. Tapping a tile again
             * unpicks it, and that is the one thing nobody stuck here thinks
             * to try, so it is said out loud and the card that would have
             * worked is named.
             */
            if (sel.length > 1) {
                const loner = sel.find((x) => this.dropTargets(x.id).length);
                if (loner) return t('lami.oneAlone', { card: L.name(loner) });
            }

            // One or two tiles cannot be a meld on their own — but this only
            // runs when nothing on the table would take them either, and
            // *that* is the thing a player holding one card wants explained.
            // A drag that finds no home just snaps back and says nothing.
            if (sel.length < Math.min(cfg.minRun, cfg.minSet)) {
                return this.engine.table.length ? t('lami.noHome') : t('lami.tooFew');
            }
            if (!real.length) return t('lami.allJokers');

            // One rank throughout: this was meant to be a set.
            if (real.every((x) => x.r === real[0].r)) {
                const suits = real.map((x) => x.s);
                const twice = suits.find((x, i) => suits.indexOf(x) !== i);
                if (twice) return t('lami.setSameSuit', { suit: L.SUIT_SYMBOL[twice] });
                return t('lami.notAMeld');
            }
            // One suit throughout: this was meant to be a run.
            if (real.every((x) => x.s === real[0].s)) {
                const ranks = real.map((x) => x.r).sort((a, b) => a - b);
                const twice = ranks.find((r, i) => i && r === ranks[i - 1]);
                if (twice) return t('lami.runSameRank', { rank: L.rankLabel(twice) });
                return t('lami.runGap');
            }
            return t('lami.notAMeld');
        }

        pick(id) {
            const e = this.engine;
            if (this.dropped) return;             // that was a drag, not a tap
            if (e.over || e.turn !== this.you) return;
            if (this.picked.has(id)) this.picked.delete(id); else this.picked.add(id);
            this.reaim();
            this.paintBoard();
            this.paintRack();
            this.paintActions();
        }

        /**
         * **The meld you aimed at stays aimed.**
         *
         * Picking a tile used to clear the aim, so the sequence that looks
         * obvious — tap the meld you want, then tap the tile — ended with
         * 加上去 greyed out beside a meld lit up saying it would take the
         * tile. Two things on screen disagreeing, and the only way through
         * was to do it in the other order.
         *
         * So an aim survives a pick for as long as it still fits. It is
         * **never made for you**: the screen briefly aimed the only meld that
         * fit, on the grounds that there was nothing to choose between — but
         * a target you did not set is a target you did not notice, and 加上去
         * lighting up pointing at somebody else's meld is the game playing
         * your tile for you. You pick the tiles, you pick the meld, you press
         * the button. The table only ever says what *would* work.
         */
        reaim() {
            if (this.target >= 0 && !this.fits(this.target)) this.target = -1;
        }

        /**
         * **Clicking a meld you can join puts the tiles on it.**
         *
         * This used to only *aim* it: pick the tiles, click the meld, then
         * press 加上去 — three steps, and the third one was a button that sat
         * greyed out until the second had happened. Every way of saying so in
         * the hint line failed, because the screen was showing a meld lit up
         * green next to a dead button and that reads as a refusal however it
         * is captioned.
         *
         * Nothing is decided for you: you chose the tiles, you chose the
         * meld. It is the same commitment as dragging the tile onto it, which
         * has always gone straight through.
         *
         * **And it never asks which reading of the run you meant.** Laying a
         * new meld does — ♥J ♥Q 🃏 is 10-J-Q or J-Q-K and only you know
         * which. Adding is not that question: the meld already has a reading
         * and `doExtend` keeps it, so all that is ever undecided is which end
         * a *spare* joker hangs off, which is a detail nobody is holding a
         * tile over. Asking it turned one click back into two.
         */
        aim(i) {
            if (!this.fits(i)) {
                this.target = -1;
                this.paintBoard();
                this.paintActions();
                return;
            }
            const ids = this.selection.map((x) => x.id);
            this.picked.clear();
            this.target = -1;
            this.table.dispatch({ type: 'extend', seat: this.you, at: i, tiles: ids });
        }

        act(el) {
            const type = el.dataset.act;
            const seat = this.you;
            const ids = this.selection.map((x) => x.id);
            // Which rank the run starts on, when the player picked a reading.
            const lo = el.dataset.lo === undefined ? undefined : Number(el.dataset.lo);

            if (type === 'play')  return void this.table.dispatch({ type: 'play', seat, tiles: ids, lo });
            if (type === 'joker') return void this.table.dispatch({ type: 'joker', seat });
            if (type === 'fold')  return void this.table.dispatch({ type: 'fold', seat });
        }
    }

    CV.LamiView = LamiView;
    CV.LamiTile = tileHtml;
})();
