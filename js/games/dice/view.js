/**
 * CardVerse — the 骰子 table.
 *
 * Three dice in the middle, the seats and what they backed around them, and
 * your stake at the bottom.
 *
 * The dice tumble for a beat before they land. The engine settles the throw
 * in one step, so without that the round would begin and end in the same
 * frame — and the one thing a dice game owes you is watching them come to
 * rest. `revealing` holds the result screen back until they have.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const D = CV.Dice;
    const { esc, fmt, signed } = CV.UI;

    const TUMBLE_MS = 900;

    /** A die face, drawn as pips on a three-by-three grid. */
    const PIPS = {
        1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
    };
    function dieHtml(n, opts = {}) {
        const on = new Set(PIPS[n] || []);
        const cells = [];
        for (let i = 0; i < 9; i++) cells.push(`<i${on.has(i) ? ' class="on"' : ''}></i>`);
        return `<span class="die${opts.cls ? ' ' + opts.cls : ''}" aria-label="${n}">${cells.join('')}</span>`;
    }

    class DiceView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.bet     = null;
            this.side    = 'small';
            this.landed  = false;
            this.timer   = null;
        }

        get you() { return this.engine.youSeat; }
        get revealing() { return !!this.engine.dice && !this.landed; }

        mount() {
            this.root.innerHTML = `
                <div class="bj">
                    <div class="dice-pit" id="dicePit"></div>
                    <div class="bj-seats" id="diceSeats"></div>
                    <div class="bj-status" id="diceStatus"></div>
                    <div class="bj-actions" id="diceActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() { clearTimeout(this.timer); this.root.innerHTML = ''; }

        onChange(events) {
            if (events.some((e) => e.type === 'roll') && !this.landed) {
                clearTimeout(this.timer);
                this.timer = setTimeout(() => { this.landed = true; this.paint(); },
                    TUMBLE_MS * (this.table.speed || 1));
            }
            this.paint();
        }

        /* ---- painting -------------------------------------------------------- */

        paint() {
            this.paintPit();
            this.paintSeats();
            this.paintStatus();
            this.paintActions();
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
        }

        paintPit() {
            const e = this.engine;
            const host = this.$('dicePit');
            if (!e.dice) {
                host.innerHTML = `<div class="dice-row">${[1, 1, 1].map(() => dieHtml(1, { cls: 'is-blank' })).join('')}</div>`;
                return;
            }
            const rolling = !this.landed;
            host.innerHTML = `
                <div class="dice-row">${e.dice.map((n) => dieHtml(n, { cls: rolling ? 'is-rolling' : '' })).join('')}</div>
                <div class="dice-call${e.outcome.type === 'triple' ? ' is-triple' : ''}">
                    ${this.landed ? esc(e.name(e.outcome)) : ''}</div>`;
        }

        paintSeats() {
            const e = this.engine;
            this.$('diceSeats').innerHTML = e.seats.filter((s) => !s.out).map((s) => {
                const mine = s.index === this.you;
                const turn = e.turn === s.index && !e.over;
                const show = this.landed && s.outcome;
                return `
                    <div class="seat${mine ? ' is-you' : ''}${turn ? ' is-turn' : ''}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <span class="who"><span class="name">${esc(s.name)}${mine ? ' <em>(you)</em>' : ''}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span></span>
                            ${show ? `<span class="badge ${s.outcome}">${esc(t('out.' + s.outcome))}</span>` : ''}
                        </div>
                        <div class="hand-meta">
                            ${s.side ? `<span class="dice-pick is-${s.side}">${esc(t('dice.' + s.side))}</span>` : ''}
                            ${s.bet ? `<span class="bet">🪙 ${fmt(s.bet)}</span>` : ''}
                            ${show ? `<span class="${s.net > 0 ? 'good' : s.net < 0 ? 'bad' : ''}">${signed(s.net)}</span>` : ''}
                        </div>
                    </div>`;
            }).join('');
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('diceStatus');
            if (e.phase === 'betting') {
                host.innerHTML = e.turn === this.you
                    ? `<span class="you">${esc(t('dice.yourBet'))}</span>`
                    : `<span class="muted">${esc(t('dice.waiting', { name: e.seats[e.turn].name }))}</span>`;
                return;
            }
            host.innerHTML = this.landed
                ? `<span class="muted">${esc(t('dice.total', { n: e.outcome.total }))}</span>`
                : `<span class="muted">${esc(t('dice.rolling'))}</span>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('diceActions');
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
                <div class="btn-row dice-sides">
                    ${options.map((o) => `
                        <button class="btn dice-side is-${o.side}${this.side === o.side ? ' is-on' : ''}"
                            data-act="side" data-side="${o.side}">
                            ${esc(o.label)}<small>${esc(t('dice.pays', { n: D.PAYS[o.side] }))}</small>
                        </button>`).join('')}
                </div>
                <div class="bet-box">
                    <div class="bet-amount">🪙 <b id="diceBetAmt">${fmt(this.bet)}</b>
                        <small class="muted">${esc(t('table.ofCoins', { n: fmt(s.coins) }))}</small></div>
                    <input type="range" id="diceRange" min="${opt.min}" max="${opt.max}" step="5" value="${this.bet}">
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip" data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="roll">${esc(t('dice.throw'))}</button>
                    </div>
                    <div class="muted small">${esc(t('table.range', { lo: fmt(opt.min), hi: fmt(opt.max) }))}</div>
                </div>`;

            const range = this.$('diceRange');
            range.addEventListener('input', () => {
                this.bet = Number(range.value);
                this.$('diceBetAmt').textContent = fmt(this.bet);
            });
        }

        /* ---- input ------------------------------------------------------------ */

        act(el) {
            const type = el.dataset.act;
            if (type === 'side') { this.side = el.dataset.side; this.paintActions(); return; }
            if (type === 'chip') {
                const range = this.$('diceRange');
                this.bet = Math.min(Number(range.max), Math.max(Number(range.min), Number(el.dataset.v)));
                range.value = this.bet;
                this.$('diceBetAmt').textContent = fmt(this.bet);
                return;
            }
            if (type === 'roll') {
                this.session.lastBet = this.bet;
                this.table.dispatch({ type: 'wager', seat: this.you, side: this.side, amount: this.bet });
                this.bet = null;
            }
        }
    }

    CV.DiceView = DiceView;
})();
