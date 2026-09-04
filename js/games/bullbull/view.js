/**
 * CardVerse — the 斗牛 table.
 *
 * The dealer's five across the top, the seats below, your bet box at the
 * bottom. There is one decision in the game, so the screen's whole job is
 * afterwards: showing what everybody got and why it beat or lost to the
 * dealer.
 *
 * The hands are turned one seat at a time. The engine resolves the deal in a
 * single step, so without pacing the round would begin and end in the same
 * frame; `revealing` holds the result screen back until the last hand is up.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { esc, fmt, signed } = CV.UI;

    const SEAT_MS = 620;

    class BullBullView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.bet     = null;
            this.shown   = 0;      // hands turned over so far
            this.timer   = null;
            this.known   = new Set();
        }

        get you() { return this.engine.youSeat; }

        /** How many hands there are to turn: the dealer's, then each seat's. */
        get toShow() {
            const e = this.engine;
            return e.phase === 'betting' ? 0 : 1 + e.seats.filter((s) => !s.out).length;
        }
        get revealing() { return this.shown < this.toShow; }

        mount() {
            this.root.innerHTML = `
                <div class="bj">
                    <div class="bj-dealer" id="bbDealer"></div>
                    <div class="bj-seats" id="bbSeats"></div>
                    <div class="bj-status" id="bbStatus"></div>
                    <div class="bj-actions" id="bbActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange(() => this.onChange());
            this.paint();
        }

        unmount() { clearTimeout(this.timer); this.root.innerHTML = ''; }

        onChange() { this.tick(); this.paint(); }

        tick() {
            clearTimeout(this.timer);
            if (!this.revealing) return;
            this.timer = setTimeout(() => {
                this.shown++;
                this.paint();
                this.tick();
            }, SEAT_MS * (this.table.speed || 1));
        }

        /* ---- painting -------------------------------------------------------- */

        paint() {
            this.paintDealer();
            this.paintSeats();
            this.paintStatus();
            this.paintActions();
            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
        }

        /**
         * A hand, with the three that made the multiple of ten marked. That
         * mark is the whole explanation of the bull, and without it the
         * number looks arbitrary.
         */
        handHtml(cards, hand, up) {
            if (!up) return CV.CardView.hand(cards.map(() => null), {});
            const inCombo = new Set((hand && hand.three ? hand.three : []).map((c) => c.id));
            return `<div class="hand">${cards.map((c) => CV.CardView.html(c, {
                fresh: !this.known.has(c.id),
                cls: inCombo.has(c.id) ? 'is-combo' : '',
            })).join('')}</div>`;
        }

        paintDealer() {
            const e = this.engine;
            const up = this.shown >= 1 && e.dealer.cards.length > 0;
            this.$('bbDealer').innerHTML = `
                <div class="bj-rule">${esc(t('table.dealer'))}</div>
                ${e.dealer.cards.length
                    ? this.handHtml(e.dealer.cards, e.dealer.hand, up)
                    : `<div class="hand hand-empty"></div>`}
                <div class="bb-name">${up ? esc(e.handName(e.dealer.hand)) : ''}</div>`;
        }

        seatBox(s, order) {
            const e = this.engine;
            const up = this.shown >= 2 + order;
            const mine = s.index === this.you;
            const turn = e.turn === s.index && !e.over;
            const badge = (up && s.outcome)
                ? `<span class="badge ${s.outcome}">${esc(t('out.' + s.outcome))}</span>` : '';

            return `
                <div class="seat${mine ? ' is-you' : ''}${turn ? ' is-turn' : ''}${s.out ? ' is-out' : ''}">
                    <div class="seat-head">
                        <span class="avatar">${s.avatar}</span>
                        <span class="who"><span class="name">${esc(s.name)}${mine ? ' <em>(you)</em>' : ''}</span>
                            <span class="coins">🪙 ${fmt(s.coins)}</span></span>
                        ${badge}
                    </div>
                    ${s.cards.length
                        ? this.handHtml(s.cards, s.hand, up)
                        : `<div class="hand hand-empty"></div>`}
                    <div class="hand-meta">
                        <span class="bb-name">${up ? esc(e.handName(s.hand)) : ''}</span>
                        ${up && s.hand ? `<span class="bb-mult">×${s.hand.mult}</span>` : ''}
                        ${s.bet ? `<span class="bet">🪙 ${fmt(s.bet)}</span>` : ''}
                        ${up && s.outcome ? `<span class="${s.net > 0 ? 'good' : s.net < 0 ? 'bad' : ''}">${signed(s.net)}</span>` : ''}
                    </div>
                </div>`;
        }

        paintSeats() {
            const e = this.engine;
            const order = e.seats.filter((s) => !s.out);
            this.$('bbSeats').innerHTML = order.map((s, i) => this.seatBox(s, i)).join('');
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('bbStatus');
            if (e.phase === 'betting') {
                host.innerHTML = e.turn === this.you
                    ? `<span class="you">${esc(t('table.yourBet'))}</span>`
                    : `<span class="muted">${esc(t('bb.waiting', { name: e.seats[e.turn].name }))}</span>`;
                return;
            }
            if (this.revealing) { host.innerHTML = `<span class="muted">${esc(t('bb.showing'))}</span>`; return; }
            host.innerHTML = `<span class="muted">${esc(t('bb.against', { hand: e.handName(e.dealer.hand) }))}</span>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('bbActions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            const opt = options[0];
            const s = e.seats[this.you];
            if (this.bet === null || this.bet < opt.min || this.bet > opt.max) {
                this.bet = Math.min(opt.max, Math.max(opt.min, this.session.lastBet || opt.min));
            }
            const chips = [opt.min, opt.min * 2, opt.min * 5, opt.max]
                .filter((v, i, a) => v <= opt.max && a.indexOf(v) === i);

            host.innerHTML = `
                <div class="bet-box">
                    <div class="bet-amount">🪙 <b id="bbBetAmt">${fmt(this.bet)}</b>
                        <small class="muted">${esc(t('table.ofCoins', { n: fmt(s.coins) }))}</small></div>
                    <input type="range" id="bbRange" min="${opt.min}" max="${opt.max}" step="5" value="${this.bet}">
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip" data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="bet">${esc(t('act.bet'))}</button>
                    </div>
                    <div class="muted small">${esc(t('table.range', { lo: fmt(opt.min), hi: fmt(opt.max) }))}</div>
                </div>`;

            const range = this.$('bbRange');
            range.addEventListener('input', () => {
                this.bet = Number(range.value);
                this.$('bbBetAmt').textContent = fmt(this.bet);
            });
        }

        /* ---- input ------------------------------------------------------------ */

        act(el) {
            const type = el.dataset.act;
            if (type === 'chip') {
                const range = this.$('bbRange');
                this.bet = Math.min(Number(range.max), Math.max(Number(range.min), Number(el.dataset.v)));
                range.value = this.bet;
                this.$('bbBetAmt').textContent = fmt(this.bet);
                return;
            }
            if (type === 'bet') {
                this.session.lastBet = this.bet;
                this.table.dispatch({ type: 'bet', seat: this.you, amount: this.bet });
                this.bet = null;
            }
        }
    }

    CV.BullBullView = BullBullView;
})();
