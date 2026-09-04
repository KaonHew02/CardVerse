/**
 * CardVerse — the Hold'em table.
 *
 * The opponents run across the top with their stacks and whatever they last
 * did, the board and the pot sit in the middle, and your two cards are at the
 * bottom with the betting controls.
 *
 * The board is turned one card at a time. The engine deals a flop in a single
 * step, and an all-in runs the whole board out in one, so without pacing the
 * hand would resolve in a frame nobody could read. `revealing` holds the
 * result screen back until the last card has landed.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const H  = CV.PokerHands;
    const { esc, fmt } = CV.UI;

    const CARD_MS = 480;

    class PokerView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.known   = new Set();
            this.shown   = 0;        // board cards turned so far
            this.raise   = null;
            this.timer   = null;
        }

        get you() { return this.engine.youSeat; }
        get revealing() { return this.shown < this.engine.board.length; }

        mount() {
            this.root.innerHTML = `
                <div class="pk">
                    <div class="pk-seats" id="pkSeats"></div>
                    <div class="pk-middle">
                        <div class="pk-pot" id="pkPot"></div>
                        <div class="pk-board" id="pkBoard"></div>
                    </div>
                    <div class="bj-status" id="pkStatus"></div>
                    <div class="pk-you" id="pkYou"></div>
                    <div class="bj-actions" id="pkActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange(() => this.onChange());
            this.paint();
        }

        unmount() { clearTimeout(this.timer); this.root.innerHTML = ''; }

        onChange() {
            this.tick();
            this.paint();
        }

        /** Turn the board over one card at a time. */
        tick() {
            clearTimeout(this.timer);
            if (!this.revealing) return;
            this.timer = setTimeout(() => {
                this.shown++;
                this.paint();
                this.tick();
            }, CARD_MS * (this.table.speed || 1));
        }

        /* ---- painting -------------------------------------------------------- */

        paint() {
            const e = this.engine;
            this.paintSeats();
            this.paintPot();
            this.paintBoard();
            this.paintStatus();
            this.paintYou();
            this.paintActions();
            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(e.seats[this.you].stack);
        }

        button(i) {
            const e = this.engine;
            if (i === e.dealer) return `<span class="tag pk-btn" title="${esc(t('pk.dealer'))}">D</span>`;
            if (i === e.sbSeat) return `<span class="tag pk-blind">SB</span>`;
            if (i === e.bbSeat) return `<span class="tag pk-blind">BB</span>`;
            return '';
        }

        seatBox(i) {
            const e = this.engine;
            const s = e.seats[i];
            const turn = e.turn === i && !e.over;
            const show = e.showing && !s.folded && !s.out;
            const hole = (i === this.you || show) ? s.hole : s.hole.map(() => null);

            const state = s.out ? t('pk.satOut')
                : s.folded ? t('pk.folded')
                : s.allIn ? t('pk.allIn')
                : s.lastAction ? t('pk.' + s.lastAction) : '';

            return `
                <div class="seat pk-seat${turn ? ' is-turn' : ''}${(s.folded || s.out) ? ' is-out' : ''}">
                    <div class="seat-head">
                        <span class="avatar">${s.avatar}</span>
                        <span class="who"><span class="name">${esc(s.name)}</span>
                            <span class="coins">🪙 ${fmt(s.stack)}</span></span>
                        ${this.button(i)}
                    </div>
                    ${CV.CardView.hand(hole, { size: 'sm' })}
                    <div class="pk-line">
                        <span class="play-pass">${esc(state)}</span>
                        ${s.bet ? `<span class="pk-bet">🪙 ${fmt(s.bet)}</span>` : ''}
                    </div>
                    ${show && s.hand ? `<div class="play-name">${esc(H.describe(s.hand))}</div>` : ''}
                </div>`;
        }

        paintSeats() {
            const e = this.engine;
            const you = this.you < 0 ? -1 : this.you;
            const order = e.seats.map((_, i) => i).filter((i) => i !== you);
            this.$('pkSeats').innerHTML = order.map((i) => this.seatBox(i)).join('');
        }

        paintPot() {
            const e = this.engine;
            const live = e.seats.reduce((n, s) => n + s.bet, 0);
            this.$('pkPot').innerHTML = `
                <span class="pile-label">${esc(t('pk.pot'))}</span>
                <b class="pk-potv">🪙 ${fmt(e.pot + live)}</b>`;
        }

        paintBoard() {
            const e = this.engine;
            const cards = e.board.slice(0, this.shown);
            while (cards.length < 5) cards.push(null);
            this.$('pkBoard').innerHTML = cards.map((c) => (c
                ? CV.CardView.html(c, { fresh: !this.known.has(c.id) })
                : '<div class="card card-slot"></div>')).join('');
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('pkStatus');
            if (e.over) {
                host.innerHTML = e.showing
                    ? `<span class="you">${esc(t('pk.showdown'))}</span>` : '';
                return;
            }
            if (this.revealing) { host.innerHTML = `<span class="muted">${esc(t('pk.' + e.phase))}</span>`; return; }
            if (e.turn === this.you) {
                const need = e.currentBet - e.seats[this.you].bet;
                host.innerHTML = `<span class="you">${esc(need > 0
                    ? t('pk.toCall', { n: fmt(need) }) : t('pk.yourMove'))}</span>`;
                return;
            }
            host.innerHTML = `<span class="muted">${esc(t('pk.waiting', { name: e.seats[e.turn].name }))}</span>`;
        }

        paintYou() {
            const e = this.engine;
            const host = this.$('pkYou');
            if (this.you < 0) { host.innerHTML = ''; return; }
            const s = e.seats[this.you];
            const best = s.hole.length && this.shown >= e.board.length
                ? H.evaluate(s.hole.concat(e.board.slice(0, this.shown))) : null;

            host.innerHTML = `
                <div class="pk-hole">${CV.CardView.hand(s.hole, { freshFrom: 0 })}</div>
                <div class="pk-mine">
                    ${this.button(this.you)}
                    <span class="seat-count">🪙 ${fmt(s.stack)}</span>
                    ${s.bet ? `<span class="pk-bet">${esc(t('pk.inFront', { n: fmt(s.bet) }))}</span>` : ''}
                    ${best ? `<span class="play-name">${esc(H.describe(best))}</span>` : ''}
                </div>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('pkActions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length || this.revealing) { host.innerHTML = ''; return; }

            const call  = options.find((o) => o.type === 'call');
            const check = options.find((o) => o.type === 'check');
            const raise = options.find((o) => o.type === 'raise');
            const pot = e.pot + e.seats.reduce((n, x) => n + x.bet, 0);

            if (raise) {
                if (this.raise === null || this.raise < raise.min || this.raise > raise.max) {
                    this.raise = raise.min;
                }
            }

            const chips = raise ? [
                { label: t('pk.min'), v: raise.min },
                { label: t('pk.halfPot'), v: e.currentBet + Math.round(pot / 2) },
                { label: t('pk.potBet'), v: e.currentBet + pot },
                { label: t('pk.allIn'), v: raise.max },
            ].map((c) => ({ label: c.label, v: Math.max(raise.min, Math.min(raise.max, c.v)) }))
             .filter((c, i, a) => a.findIndex((x) => x.v === c.v) === i) : [];

            host.innerHTML = `
                ${raise ? `
                <div class="pk-raise">
                    <input type="range" id="pkRange" min="${raise.min}" max="${raise.max}"
                        step="${Math.max(1, Math.round(e.bb / 2))}" value="${this.raise}">
                    <div class="btn-row chips">
                        ${chips.map((c) => `<button class="chip small" data-act="chip" data-v="${c.v}">${esc(c.label)}</button>`).join('')}
                    </div>
                </div>` : ''}
                <div class="btn-row">
                    <button class="btn ghost" data-act="fold">${esc(t('pk.fold'))}</button>
                    ${check ? `<button class="btn" data-act="check">${esc(t('pk.check'))}</button>` : ''}
                    ${call ? `<button class="btn" data-act="call">${esc(t('pk.callN', { n: fmt(call.amount) }))}</button>` : ''}
                    ${raise ? `<button class="btn primary big" data-act="raise">
                        ${esc(e.currentBet ? t('pk.raiseTo') : t('pk.betTo'))} <b id="pkRaiseV">${fmt(this.raise)}</b></button>` : ''}
                </div>`;

            const range = this.$('pkRange');
            if (range) {
                range.addEventListener('input', () => {
                    this.raise = Number(range.value);
                    const label = this.$('pkRaiseV');
                    if (label) label.textContent = fmt(this.raise);
                });
            }
        }

        /* ---- input ------------------------------------------------------------ */

        act(el) {
            const e = this.engine;
            const type = el.dataset.act;
            const seat = this.you;

            if (type === 'chip') {
                const range = this.$('pkRange');
                this.raise = Math.max(Number(range.min), Math.min(Number(range.max), Number(el.dataset.v)));
                range.value = this.raise;
                this.$('pkRaiseV').textContent = fmt(this.raise);
                return;
            }
            if (type === 'fold')  return void this.table.dispatch({ type: 'fold', seat });
            if (type === 'check') return void this.table.dispatch({ type: 'check', seat });
            if (type === 'call') {
                const call = e.legalActions(seat).find((o) => o.type === 'call');
                if (call) this.table.dispatch({ type: 'call', seat, amount: call.amount });
                return;
            }
            if (type === 'raise') {
                const amount = this.raise;
                this.raise = null;
                this.table.dispatch({ type: 'raise', seat, amount });
            }
        }
    }

    CV.PokerView = PokerView;
})();
