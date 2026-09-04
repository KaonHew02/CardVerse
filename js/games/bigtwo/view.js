/**
 * CardVerse — the 锄大D table.
 *
 * Four seats, so the three opponents sit left, across and right in clockwise
 * order from you, and your hand runs along the bottom. Each seat keeps
 * whatever it last put down until the trick clears, because a round of Big
 * Two resolves faster than anyone can read it otherwise.
 *
 * 出牌 goes live only when the selected cards are a legal answer, and 提示
 * walks the plays that would be — the same list the opponents work from.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const B  = CV.B2;
    const { esc, fmt } = CV.UI;

    const SEATS = 4;

    class BigTwoView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.selected = new Set();
            this.last    = [null, null, null, null];
            this.hintAt  = -1;
            this.known   = new Set();
        }

        get you() { return this.engine.youSeat; }

        mount() {
            this.root.innerHTML = `
                <div class="b2">
                    <div class="b2-across"><div class="b2-opp" id="b2Across"></div></div>
                    <div class="b2-row">
                        <div class="b2-opp" id="b2Left"></div>
                        <div class="b2-centre" id="b2Centre"></div>
                        <div class="b2-opp" id="b2Right"></div>
                    </div>
                    <div class="bj-status" id="b2Status"></div>
                    <div class="your-hand" id="b2Hand"></div>
                    <div class="bj-actions" id="b2Actions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            CV.UI.on(this.root, '[data-card]', (el) => this.toggle(el.dataset.card));
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() { this.root.innerHTML = ''; }

        get revealing() { return false; }

        onChange(events) {
            for (const e of events) {
                if (e.type === 'play')     this.last[e.seat] = { cards: e.cards, combo: e.combo };
                if (e.type === 'pass')     this.last[e.seat] = { pass: true };
                if (e.type === 'trickEnd') this.last = [null, null, null, null];
                if (e.type === 'deal')     { this.last = [null, null, null, null]; this.selected.clear(); }
                if (e.type === 'play' && e.seat === this.you) this.selected.clear();
            }
            this.hintAt = -1;
            this.paint();
        }

        /* ---- painting -------------------------------------------------------- */

        paint() {
            const you = this.you < 0 ? 0 : this.you;
            // Clockwise from you: left, across, right.
            this.$('b2Left').innerHTML   = this.opponent((you + 1) % SEATS);
            this.$('b2Across').innerHTML = this.opponent((you + 2) % SEATS);
            this.$('b2Right').innerHTML  = this.opponent((you + 3) % SEATS);

            this.paintCentre();
            this.paintStatus();
            this.paintHand();
            this.paintActions();

            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
        }

        opponent(i) {
            const e = this.engine;
            const s = e.seats[i];
            const turn = e.turn === i && !e.over;
            const out  = e.passed.has(i);
            return `
                <div class="seat b2-seat${turn ? ' is-turn' : ''}${out ? ' is-out' : ''}">
                    <div class="seat-head">
                        <span class="avatar">${s.avatar}</span>
                        <span class="who"><span class="name">${esc(s.name)}</span>
                            <span class="coins">🪙 ${fmt(s.coins)}</span></span>
                        <span class="tag b2-left">${s.cards.length}</span>
                    </div>
                    <div class="seat-play">${this.playedBy(i)}</div>
                </div>`;
        }

        playedBy(i) {
            const shown = this.last[i];
            if (!shown) return '';
            if (shown.pass) return `<span class="play-pass">${esc(t('b2.pass'))}</span>`;
            return CV.CardView.hand(shown.cards, { size: 'sm' })
                + `<span class="play-name">${esc(this.comboName(shown.combo))}</span>`;
        }

        comboName(combo) {
            return combo ? t('b2.type.' + combo.type) : '';
        }

        /** What is on the table to beat, and whose it is. */
        paintCentre() {
            const e = this.engine;
            const host = this.$('b2Centre');
            if (!e.trick) {
                host.innerHTML = `<span class="b2-open">${esc(t(e.opening ? 'b2.opens' : 'b2.free'))}</span>`;
                return;
            }
            host.innerHTML = `
                <span class="pile-label">${esc(t('b2.onTable'))}</span>
                ${CV.CardView.hand(e.trick.cards, { size: 'sm' })}
                <span class="play-name">${esc(this.comboName(e.trick.combo))}
                    · ${esc(e.seats[e.trick.by].name)}</span>`;
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('b2Status');
            if (e.over) { host.innerHTML = ''; return; }
            if (e.turn !== this.you) {
                host.innerHTML = `<span class="muted">${esc(t('b2.waiting', { name: e.seats[e.turn].name }))}</span>`;
                return;
            }
            if (e.opening) {
                host.innerHTML = `<span class="you">${esc(t('b2.youOpen'))}</span>`;
                return;
            }
            host.innerHTML = e.trick
                ? `<span class="you">${esc(t('b2.beat', { what: this.comboName(e.trick.combo) }))}</span>`
                : `<span class="you">${esc(t('b2.yourLead'))}</span>`;
        }

        paintHand() {
            const e = this.engine;
            const host = this.$('b2Hand');
            if (this.you < 0) { host.innerHTML = ''; return; }
            const hand = e.seats[this.you].cards;

            host.innerHTML = `
                <div class="hand-head">
                    <span class="seat-count">${esc(t('b2.cardsLeft', { n: hand.length }))}</span>
                </div>
                <div class="hand-fan">
                    ${hand.map((c) => {
                        const on = this.selected.has(c.id);
                        const must = e.opening && CV.BigTwoOpener(c);
                        return `<button class="fan-card${on ? ' is-on' : ''}${must ? ' is-must' : ''}"
                            data-card="${c.id}" aria-pressed="${on}"
                            >${CV.CardView.html(c, { fresh: !this.known.has(c.id) })}</button>`;
                    }).join('')}
                </div>`;
        }

        get selection() {
            const e = this.engine;
            if (this.you < 0) return { cards: [], combo: null, ok: false };
            const hand = e.seats[this.you].cards;
            const cards = hand.filter((c) => this.selected.has(c.id));
            const legal = cards.length ? e.validPlay(this.you, cards.map((c) => c.id)) : null;
            return { cards, combo: legal || B.detect(cards), ok: !!legal };
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('b2Actions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            const sel = this.selection;
            const canPass = options.some((o) => o.type === 'pass');
            const name = sel.combo ? this.comboName(sel.combo) : '';
            // Why the play is refused matters: holding the 3♦ back on the
            // opening hand is a different mistake from picking a losing pair.
            const gripe = !sel.cards.length ? ''
                : !B.detect(sel.cards) ? t('b2.notACombo')
                : (e.opening && !sel.cards.some(CV.BigTwoOpener)) ? t('b2.mustOpen')
                : !sel.ok ? t('b2.cannotBeat') : '';

            host.innerHTML = `
                <div class="btn-row">
                    <button class="btn ghost" data-act="hint">${esc(t('b2.hint'))}</button>
                    <button class="btn primary big" data-act="play" ${sel.ok ? '' : 'disabled'}>
                        ${esc(t('b2.play'))}${sel.ok && name ? ` · ${esc(name)}` : ''}</button>
                    <button class="btn ghost" data-act="pass" ${canPass ? '' : 'disabled'}>${esc(t('b2.pass'))}</button>
                </div>
                ${gripe ? `<div class="muted small">${esc(gripe)}</div>` : ''}`;
        }

        /* ---- input ------------------------------------------------------------ */

        toggle(id) {
            const e = this.engine;
            if (e.over || e.turn !== this.you) return;
            if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
            this.hintAt = -1;
            this.paintActions();
            const el = this.root.querySelector(`[data-card="${id}"]`);
            if (el) {
                const on = this.selected.has(id);
                el.classList.toggle('is-on', on);
                el.setAttribute('aria-pressed', String(on));
            }
        }

        act(el) {
            const type = el.dataset.act;
            if (type === 'pass') {
                this.selected.clear();
                this.table.dispatch({ type: 'pass', seat: this.you });
                return;
            }
            if (type === 'play') {
                const sel = this.selection;
                if (!sel.ok) return;
                this.table.dispatch({ type: 'play', seat: this.you, cards: sel.cards.map((c) => c.id) });
                return;
            }
            if (type === 'hint') this.hint();
        }

        hint() {
            const e = this.engine;
            if (this.you < 0 || e.turn !== this.you) return;
            const hand = e.seats[this.you].cards;
            const options = B.find(hand, e.trick ? e.trick.combo : null, e.mustPlay(this.you));
            if (!options.length) {
                CV.UI.toast(t('b2.noPlay'), 'warn');
                return;
            }
            this.hintAt = (this.hintAt + 1) % options.length;
            this.selected = new Set(options[this.hintAt].map((c) => c.id));
            this.paintHand();
            this.paintActions();
        }
    }

    CV.BigTwoView = BigTwoView;
})();
