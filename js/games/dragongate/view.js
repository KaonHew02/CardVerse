/**
 * CardVerse — the 射龙门 table.
 *
 * Three positions: two posts and the shot between them. The third card is
 * held back by the view and turned after a beat, because the engine resolves
 * the whole round the moment the gate is priced and a card that appears in
 * the same frame as the verdict is a card nobody sees.
 *
 * The odds are shown before the third card lands — how many cards in the pack
 * can win, and what the gate pays. A player should be able to see that a
 * narrow gate is worth more and an adjacent one cannot be won at all.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { esc, fmt, signed } = CV.UI;

    const REVEAL_MS = 900;

    class DragonGateView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.known   = new Set();
            this.bet     = null;
            this.showThird = false;
            this.timer   = null;
        }

        mount() {
            this.root.innerHTML = `
                <div class="dg">
                    <div class="dg-gate">
                        <div class="dg-post" id="dgPostA"></div>
                        <div class="dg-middle">
                            <div class="dg-arch"></div>
                            <div class="dg-shot" id="dgShot"></div>
                        </div>
                        <div class="dg-post" id="dgPostB"></div>
                    </div>
                    <div class="dg-odds" id="dgOdds"></div>
                    <div class="bj-status" id="dgStatus"></div>
                    <div class="bj-actions" id="dgActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() {
            clearTimeout(this.timer);
            this.root.innerHTML = '';
        }

        get revealing() { return this.engine.third && !this.showThird; }

        onChange(events) {
            // Hold the third card back for a beat once the engine has drawn it.
            if (events.some((e) => e.type === 'third') && !this.showThird) {
                clearTimeout(this.timer);
                this.timer = setTimeout(() => {
                    this.showThird = true;
                    this.paint();
                }, REVEAL_MS * (this.table.speed || 1));
            }
            this.paint();
        }

        /* ---- painting ------------------------------------------------------ */

        paint() {
            const e = this.engine;
            const g = e.gate;

            const card = (c) => (c
                ? CV.CardView.html(c, { fresh: !this.known.has(c.id) })
                : `<div class="card card-slot"></div>`);

            this.$('dgPostA').innerHTML = g ? card(g.cards[0]) : card(null);
            this.$('dgPostB').innerHTML = g ? card(g.cards[1]) : card(null);
            this.$('dgShot').innerHTML = (e.third && this.showThird) ? card(e.third) : card(null);
            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));

            this.$('dgShot').className = 'dg-shot'
                + (e.third && this.showThird && e.outcome ? ' is-' + e.outcome : '');

            this.paintOdds();
            this.paintStatus();
            this.paintActions();

            const bar = document.getElementById('tableShoe');
            if (bar) bar.textContent = t('table.cards', { n: e.deck.remaining });
            const coins = document.getElementById('tableCoins');
            if (coins) coins.textContent = fmt(e.seat.coins);
        }

        paintOdds() {
            const e = this.engine;
            const host = this.$('dgOdds');
            if (!e.odds || !e.gate) { host.innerHTML = ''; return; }

            const { winners, remaining, mult } = e.odds;
            if (winners === 0) {
                host.innerHTML = `<span class="dg-shut">${esc(t('dg.shut'))}</span>`;
                return;
            }
            const chance = ((winners / remaining) * 100).toFixed(0);
            host.innerHTML = `
                <span>${esc(t('dg.odds', { n: winners, of: remaining, pct: chance }))}</span>
                <b class="dg-mult">${esc(t('dg.pays', { mult: mult.toFixed(2) }))}</b>`;
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('dgStatus');

            if (this.revealing) { host.innerHTML = `<span>${esc(t('dg.shooting'))}</span>`; return; }
            if (e.over && e.outcome) {
                const cls = e.outcome === 'gate' ? 'you' : 'muted';
                host.innerHTML = `<span class="${cls} dg-verdict">${esc(t('dg.' + e.outcome))}</span>`;
                return;
            }
            if (e.phase === 'choose') {
                host.innerHTML = `<span class="you">${esc(t('dg.chooseAsk', { rank: e.rankName(e.gate.low) }))}</span>`;
                return;
            }
            if (e.phase === 'betting') { host.innerHTML = `<span class="you">${esc(t('table.yourBet'))}</span>`; return; }
            host.innerHTML = '';
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('dgActions');
            const options = e.legalActions(0);
            if (!options.length) { host.innerHTML = ''; return; }

            if (e.phase === 'choose') {
                host.innerHTML = `
                    <div class="btn-row dg-choice">
                        ${options.map((o) => `
                            <button class="btn primary big" data-act="pick" data-dir="${o.dir}">
                                ${esc(o.label)}
                            </button>`).join('')}
                    </div>
                    <div class="muted small">${esc(t('dg.chooseNote', { rank: e.rankName(e.gate.low) }))}</div>`;
                return;
            }

            const opt = options[0];
            const seat = e.seat;
            if (this.bet === null || this.bet < opt.min || this.bet > opt.max) {
                this.bet = Math.min(opt.max, Math.max(opt.min, this.session.lastBet || opt.min));
            }
            const chips = [opt.min, opt.min * 2, opt.min * 5, opt.max]
                .filter((v, i, a) => v <= opt.max && a.indexOf(v) === i);

            host.innerHTML = `
                <div class="bet-box">
                    <div class="bet-amount">🪙 <b id="dgBetAmt">${fmt(this.bet)}</b>
                        <small class="muted">${esc(t('table.ofCoins', { n: fmt(seat.coins) }))}</small></div>
                    <input type="range" id="dgBetRange" min="${opt.min}" max="${opt.max}" step="5" value="${this.bet}">
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip" data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="bet">${esc(t('dg.open'))}</button>
                    </div>
                    <div class="muted small">${esc(t('table.range', { lo: fmt(opt.min), hi: fmt(opt.max) }))}</div>
                </div>`;

            const range = this.$('dgBetRange');
            range.addEventListener('input', () => {
                this.bet = Number(range.value);
                this.$('dgBetAmt').textContent = fmt(this.bet);
            });
        }

        /* ---- input --------------------------------------------------------- */

        act(el) {
            const type = el.dataset.act;
            if (type === 'chip') {
                const range = this.$('dgBetRange');
                this.bet = Math.min(Number(range.max), Math.max(Number(range.min), Number(el.dataset.v)));
                range.value = this.bet;
                this.$('dgBetAmt').textContent = fmt(this.bet);
                return;
            }
            if (type === 'bet') {
                this.session.lastBet = this.bet;
                this.table.dispatch({ type: 'bet', seat: 0, amount: this.bet });
                this.bet = null;
                return;
            }
            if (type === 'pick') {
                this.table.dispatch({ type: 'pick', seat: 0, dir: el.dataset.dir });
            }
        }
    }

    CV.DragonGateView = DragonGateView;
})();
