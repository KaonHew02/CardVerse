/**
 * CardVerse — the 百家乐 table.
 *
 * Two hands in the middle that the whole table shares, and seats around the
 * edge showing only which side each one backed. Nobody holds cards, so the
 * seat is a betting slip rather than a hand.
 *
 * Like the blackjack view, this repaints from engine state and uses events
 * only to know which cards are new. The deal resolves synchronously in the
 * engine, so the view paces the reveal itself — otherwise six cards appear at
 * once and the round is over before it can be read.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { esc, fmt, signed } = CV.UI;

    const SIDES = ['player', 'banker', 'tie'];

    const OUTCOME = { win: 'win', push: 'push', loss: 'loss' };

    class BaccaratView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.known   = new Set();
            this.side    = session.lastSide || 'banker';
            this.bet     = null;
            this.shown   = 0;          // cards turned so far, across both hands
            this.timer   = null;
        }

        mount() {
            this.root.innerHTML = `
                <div class="bac">
                    <section class="bac-hands">
                        <div class="bac-hand" id="bacPlayerBox">
                            <span class="bac-label">${esc(t('bac.player'))}</span>
                            <div id="bacPlayerHand" class="hand-wrap"></div>
                            <span class="bac-total" id="bacPlayerTotal"></span>
                        </div>
                        <div class="bac-hand" id="bacBankerBox">
                            <span class="bac-label">${esc(t('bac.banker'))}</span>
                            <div id="bacBankerHand" class="hand-wrap"></div>
                            <span class="bac-total" id="bacBankerTotal"></span>
                        </div>
                    </section>
                    <div class="bac-rule muted small">${esc(t('bac.rules'))}</div>
                    <section class="bj-seats" id="bacSeats"></section>
                    <section class="bj-status" id="bacStatus"></section>
                    <section class="bj-actions" id="bacActions"></section>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange(() => this.paint());
            this.paint();
        }

        unmount() {
            clearTimeout(this.timer);
            this.root.innerHTML = '';
        }

        /** True while cards are still being turned. */
        get revealing() {
            const e = this.engine;
            return this.shown < (e.player.length + e.banker.length);
        }

        scheduleReveal() {
            if (this.timer) return;
            this.timer = setTimeout(() => {
                this.timer = null;
                this.shown++;
                this.paint();
            }, 520 * (this.table.speed || 1));
        }

        /* ---- painting ---------------------------------------------------- */

        paint() {
            this.paintHands();
            this.paintSeats();
            this.paintStatus();
            this.paintActions();
            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const bar = document.getElementById('tableShoe');
            if (bar) bar.textContent = t('table.cards', { n: this.engine.shoe.remaining });
            const coins = document.getElementById('tableCoins');
            if (coins && this.engine.youSeat >= 0) coins.textContent = fmt(this.engine.seats[this.engine.youSeat].coins);
        }

        /**
         * Cards are turned in dealing order — Player, Banker, Player, Banker,
         * then any thirds — so the count runs across both hands rather than
         * one at a time.
         */
        paintHands() {
            const e = this.engine;
            const order = [];
            for (let i = 0; i < Math.max(e.player.length, e.banker.length); i++) {
                if (e.player[i]) order.push(['player', e.player[i]]);
                if (e.banker[i]) order.push(['banker', e.banker[i]]);
            }
            if (this.shown < order.length) this.scheduleReveal();

            const shownOf = (which) => order.slice(0, this.shown)
                .filter(([w]) => w === which).map(([, c]) => c);

            for (const which of ['player', 'banker']) {
                const cards = shownOf(which);
                const box = which === 'player' ? 'bacPlayerHand' : 'bacBankerHand';
                this.$(box).innerHTML = cards.length
                    ? `<div class="hand">${cards.map((c) => CV.CardView.html(c, { fresh: !this.known.has(c.id) })).join('')}</div>`
                    : '';
                this.$(which === 'player' ? 'bacPlayerTotal' : 'bacBankerTotal').textContent =
                    cards.length ? CV.BaccaratTotal(cards) : '';
            }

            const done = !this.revealing && e.outcome;
            this.$('bacPlayerBox').classList.toggle('is-won', done && e.outcome === 'player');
            this.$('bacBankerBox').classList.toggle('is-won', done && e.outcome === 'banker');
        }

        paintSeats() {
            const e = this.engine;
            this.$('bacSeats').innerHTML = e.seats.map((s, i) => {
                const turn = e.turn === i && !e.over && e.phase === 'betting';
                const cls = ['seat', s.isYou ? 'is-you' : '', turn ? 'is-turn' : '', s.out ? 'is-out' : '']
                    .filter(Boolean).join(' ');
                // Another seat's pick is hidden until the deal — see redactSeat.
                const hidden = s.side === 'hidden';
                const pick = s.side && !hidden
                    ? `<span class="bac-pick side-${s.side}">${esc(t('bac.' + s.side))}</span>`
                    : s.side ? `<span class="bac-pick side-hidden">•••</span>` : '';
                const res = s.outcome
                    ? `<span class="badge ${OUTCOME[s.outcome]}">${esc(t('bac.' + s.outcome))} ${signed(s.payout - s.bet)}</span>`
                    : '';
                return `
                    <div class="${cls}" data-seat="${i}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <div class="who">
                                <span class="name">${esc(s.name)}${s.isYou ? ` <em>(${esc(t('you'))})</em>` : ''}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span>
                            </div>
                        </div>
                        <div class="bac-slip">
                            ${s.out ? `<span class="muted small">${esc(t('table.sittingOut'))}</span>` : ''}
                            ${pick}
                            ${s.bet ? `<span class="bet">🪙 ${fmt(s.bet)}</span>` : ''}
                            ${res}
                        </div>
                    </div>`;
            }).join('');
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('bacStatus');
            if (this.revealing) return void (host.innerHTML = `<span>${esc(t('bac.dealing'))}</span>`);
            if (e.over) {
                return void (host.innerHTML =
                    `<span class="you">${esc(t('bac.wins', { side: t('bac.' + e.outcome) }))}</span>`);
            }
            const seat = e.seats[e.turn];
            if (!seat) return void (host.innerHTML = '');
            host.innerHTML = seat.isHuman
                ? `<span class="you">${esc(t('bac.yourBet'))}</span>`
                : `<span class="muted">${seat.avatar} ${esc(t('table.betting', { name: seat.name }))}</span>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('bacActions');
            const seat = e.seats[e.turn];
            if (e.over || !seat || !seat.isHuman || e.phase !== 'betting') { host.innerHTML = ''; return; }

            const options = e.legalActions(e.turn);
            if (!options.length) { host.innerHTML = ''; return; }
            const opt = options[0];

            if (this.bet === null || this.bet < opt.min || this.bet > opt.max) {
                this.bet = Math.min(opt.max, Math.max(opt.min, this.session.lastBet || opt.min));
            }
            const chips = [opt.min, opt.min * 2, opt.min * 5, opt.max]
                .filter((v, i, a) => v <= opt.max && a.indexOf(v) === i);

            host.innerHTML = `
                <div class="bet-box">
                    <div class="bac-sides">
                        ${SIDES.map((s) => `
                            <button class="bac-side side-${s}${this.side === s ? ' is-on' : ''}" data-act="side" data-side="${s}">
                                <b>${esc(t('bac.' + s))}</b>
                                <small>${esc(t('bac.pays.' + s))}</small>
                            </button>`).join('')}
                    </div>
                    <div class="bet-amount">🪙 <b id="bacBetAmt">${fmt(this.bet)}</b>
                        <small class="muted">${esc(t('table.ofCoins', { n: fmt(seat.coins) }))}</small></div>
                    <input type="range" id="bacBetRange" min="${opt.min}" max="${opt.max}" step="5" value="${this.bet}">
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip" data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="wager">${esc(t('bac.place'))}</button>
                    </div>
                    <div class="muted small">${esc(t('table.range', { lo: fmt(opt.min), hi: fmt(opt.max) }))}</div>
                </div>`;

            const range = this.$('bacBetRange');
            range.addEventListener('input', () => {
                this.bet = Number(range.value);
                this.$('bacBetAmt').textContent = fmt(this.bet);
            });
        }

        /* ---- input -------------------------------------------------------- */

        act(el) {
            const e = this.engine;
            const type = el.dataset.act;
            if (type === 'side') { this.side = el.dataset.side; this.paintActions(); return; }
            if (type === 'chip') {
                const range = this.$('bacBetRange');
                this.bet = Math.min(Number(range.max), Math.max(Number(range.min), Number(el.dataset.v)));
                range.value = this.bet;
                this.$('bacBetAmt').textContent = fmt(this.bet);
                return;
            }
            if (type === 'wager') {
                this.session.lastBet = this.bet;
                this.session.lastSide = this.side;
                this.table.dispatch({ type: 'wager', seat: e.turn, side: this.side, amount: this.bet });
                this.bet = null;
            }
        }
    }

    CV.BaccaratView = BaccaratView;
})();
