/**
 * CardVerse — the 斗地主 table.
 *
 * Three seats: the two opponents across the top with their card counts and
 * whatever they last put down, the three face-down cards and the stake in the
 * middle, and your hand along the bottom.
 *
 * Two things this screen owes the player, because the round is fast:
 *
 *  - **What just happened, and who did it.** Each seat keeps its last play
 *    visible until the trick clears, so a hand that resolves in four seconds
 *    can still be read afterwards.
 *  - **Whether the selection is legal, before committing it.** 出牌 is only
 *    live when the selected cards actually beat what is down, and 提示 walks
 *    through the plays that would.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const D  = CV.DDZ;
    const { esc, fmt } = CV.UI;

    class DouDiZhuView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.selected = new Set();
            this.last    = [null, null, null];   // per seat: {cards} | {pass:true}
            this.hintAt  = -1;
            this.known   = new Set();
        }

        get you() { return this.engine.youSeat; }

        mount() {
            this.root.innerHTML = `
                <div class="ddz">
                    <div class="ddz-top">
                        <div class="ddz-opp" id="ddzOppA"></div>
                        <div class="ddz-mid">
                            <div class="ddz-bottom" id="ddzBottom"></div>
                            <div class="ddz-stake" id="ddzStake"></div>
                        </div>
                        <div class="ddz-opp" id="ddzOppB"></div>
                    </div>
                    <div class="bj-status" id="ddzStatus"></div>
                    <div class="ddz-hand" id="ddzHand"></div>
                    <div class="bj-actions" id="ddzActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            CV.UI.on(this.root, '[data-card]', (el) => this.toggle(el.dataset.card));
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() { this.root.innerHTML = ''; }

        /** Nothing here is animated on a timer, so the round is never mid-reveal. */
        get revealing() { return false; }

        onChange(events) {
            for (const e of events) {
                if (e.type === 'play')     this.last[e.seat] = { cards: e.cards, combo: e.combo };
                if (e.type === 'pass')     this.last[e.seat] = { pass: true };
                if (e.type === 'trickEnd') this.last = [null, null, null];
                if (e.type === 'deal' || e.type === 'redeal') {
                    this.last = [null, null, null];
                    this.selected.clear();
                }
                if (e.type === 'play' && e.seat === this.you) this.selected.clear();
            }
            this.hintAt = -1;
            this.paint();
        }

        /* ---- painting -------------------------------------------------------- */

        paint() {
            const e = this.engine;
            const you = this.you;
            const others = [0, 1, 2].filter((i) => i !== you);
            // Seat to your left first, so the play goes left → across → you.
            const order = [(you + 1) % 3, (you + 2) % 3];
            const [a, b] = (others.length === 2) ? order : others;

            this.$('ddzOppA').innerHTML = this.opponent(a);
            this.$('ddzOppB').innerHTML = this.opponent(b);
            this.paintBottom();
            this.paintStake();
            this.paintStatus();
            this.paintHand();
            this.paintActions();

            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const coins = document.getElementById('tableCoins');
            if (coins && you >= 0) coins.textContent = fmt(e.seats[you].coins);
        }

        roleTag(i) {
            const e = this.engine;
            if (e.landlord < 0) return '';
            return e.landlord === i
                ? `<span class="tag ddz-role is-landlord">${esc(t('ddz.landlord'))}</span>`
                : `<span class="tag ddz-role">${esc(t('ddz.farmer'))}</span>`;
        }

        opponent(i) {
            const e = this.engine;
            const s = e.seats[i];
            const turn = e.turn === i && !e.over;
            const bid = (e.phase === 'bid' && s.bid !== null)
                ? `<span class="ddz-bid">${esc(s.bid ? t('ddz.bidN', { n: s.bid }) : t('ddz.noBid'))}</span>` : '';

            return `
                <div class="seat ddz-seat${turn ? ' is-turn' : ''}">
                    <div class="seat-head">
                        <span class="avatar">${s.avatar}</span>
                        <span class="who"><span class="name">${esc(s.name)}</span>
                            <span class="coins">🪙 ${fmt(s.coins)}</span></span>
                        ${this.roleTag(i)}
                    </div>
                    <div class="ddz-count">${esc(t('ddz.cardsLeft', { n: s.cards.length }))}</div>
                    <div class="ddz-played">${this.playedBy(i)}${bid}</div>
                </div>`;
        }

        playedBy(i) {
            const shown = this.last[i];
            if (!shown) return '';
            if (shown.pass) return `<span class="ddz-pass">${esc(t('ddz.pass'))}</span>`;
            return CV.CardView.hand(shown.cards, { size: 'sm' })
                + `<span class="ddz-combo">${esc(this.comboName(shown.combo))}</span>`;
        }

        comboName(combo) {
            if (!combo) return '';
            return t('ddz.type.' + combo.type);
        }

        paintBottom() {
            const e = this.engine;
            const host = this.$('ddzBottom');
            // Face down means face down: the backs are drawn from nothing, not
            // from the real cards with a class on them, so the three are not
            // sitting in the DOM waiting to be read.
            const cards = e.landlord < 0 ? [null, null, null] : e.bottom;
            host.innerHTML = `<span class="ddz-label">${esc(t('ddz.bottom'))}</span>`
                + CV.CardView.hand(cards, { size: 'sm' });
        }

        paintStake() {
            const e = this.engine;
            const host = this.$('ddzStake');
            if (e.landlord < 0) { host.innerHTML = ''; return; }
            const points = e.base * e.multiplier;
            host.innerHTML = `
                <span>${esc(t('ddz.base', { n: e.base }))}</span>
                ${e.multiplier > 1 ? `<b class="ddz-mult">×${e.multiplier}</b>` : ''}
                <span class="muted">${esc(t('ddz.worth', { n: fmt(points * e.stake) }))}</span>`;
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('ddzStatus');
            if (e.over) { host.innerHTML = ''; return; }

            if (e.phase === 'bid') {
                const who = e.seats[e.turn];
                host.innerHTML = e.turn === this.you
                    ? `<span class="you">${esc(t('ddz.yourBid'))}</span>`
                    : `<span class="muted">${esc(t('ddz.waitingBid', { name: who.name }))}</span>`;
                return;
            }
            if (e.turn === this.you) {
                host.innerHTML = e.trick
                    ? `<span class="you">${esc(t('ddz.beat', { what: this.comboName(e.trick.combo) }))}</span>`
                    : `<span class="you">${esc(t('ddz.yourLead'))}</span>`;
                return;
            }
            host.innerHTML = `<span class="muted">${esc(t('ddz.waiting', { name: e.seats[e.turn].name }))}</span>`;
        }

        paintHand() {
            const e = this.engine;
            const host = this.$('ddzHand');
            if (this.you < 0) { host.innerHTML = ''; return; }
            const hand = e.seats[this.you].cards;

            host.innerHTML = `
                <div class="ddz-you">
                    ${this.roleTag(this.you)}
                    <span class="ddz-count">${esc(t('ddz.cardsLeft', { n: hand.length }))}</span>
                </div>
                <div class="ddz-fan">
                    ${hand.map((c) => {
                        const on = this.selected.has(c.id);
                        return `<button class="ddz-card${on ? ' is-on' : ''}" data-card="${c.id}"
                            aria-pressed="${on}">${CV.CardView.html(c, { fresh: !this.known.has(c.id) })}</button>`;
                    }).join('')}
                </div>`;
        }

        /** The reading of the current selection, and whether it may be played. */
        get selection() {
            const e = this.engine;
            if (this.you < 0) return { cards: [], combo: null, ok: false };
            const hand = e.seats[this.you].cards;
            const cards = hand.filter((c) => this.selected.has(c.id));
            const combo = cards.length ? D.canBeat(cards, e.trick ? e.trick.combo : null) : null;
            return { cards, combo, ok: !!combo && e.turn === this.you && e.phase === 'play' };
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('ddzActions');
            const mine = e.turn === this.you && !e.over;
            const options = mine ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            if (e.phase === 'bid') {
                host.innerHTML = `
                    <div class="btn-row">
                        ${options.map((o) => `
                            <button class="btn ${o.bid ? 'primary' : 'ghost'} big"
                                data-act="bid" data-bid="${o.bid}">${esc(o.label)}</button>`).join('')}
                    </div>
                    <div class="muted small">${esc(t('ddz.bidNote'))}</div>`;
                return;
            }

            const sel = this.selection;
            const canPass = options.some((o) => o.type === 'pass');
            const name = sel.combo ? this.comboName(sel.combo) : '';
            host.innerHTML = `
                <div class="btn-row">
                    <button class="btn ghost" data-act="hint">${esc(t('ddz.hint'))}</button>
                    <button class="btn primary big" data-act="play" ${sel.ok ? '' : 'disabled'}>
                        ${esc(t('ddz.play'))}${name ? ` · ${esc(name)}` : ''}</button>
                    <button class="btn ghost" data-act="pass" ${canPass ? '' : 'disabled'}>${esc(t('ddz.pass'))}</button>
                </div>
                ${sel.cards.length && !sel.combo
                    ? `<div class="muted small">${esc(t(e.trick ? 'ddz.cannotBeat' : 'ddz.notACombo'))}</div>` : ''}`;
        }

        /* ---- input ------------------------------------------------------------ */

        toggle(id) {
            if (this.engine.phase !== 'play' || this.engine.turn !== this.you) return;
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
            const e = this.engine;

            if (type === 'bid') {
                this.table.dispatch({ type: 'bid', seat: this.you, bid: Number(el.dataset.bid) });
                return;
            }
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

        /**
         * Walk the plays that would answer the table, one press at a time. On
         * a lead this offers the groups the hand breaks into, which is the
         * same advice the opponents give themselves.
         */
        hint() {
            const e = this.engine;
            if (this.you < 0 || e.turn !== this.you) return;
            const hand = e.seats[this.you].cards;
            const options = D.find(hand, e.trick ? e.trick.combo : null);
            if (!options.length) {
                CV.UI.toast(t('ddz.noPlay'), 'warn');
                return;
            }
            this.hintAt = (this.hintAt + 1) % options.length;
            this.selected = new Set(options[this.hintAt].map((c) => c.id));
            this.paintHand();
            this.paintActions();
        }
    }

    CV.DouDiZhuView = DouDiZhuView;
})();
