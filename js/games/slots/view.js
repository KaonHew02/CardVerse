/**
 * CardVerse — the 老虎机 cabinet.
 *
 * The engine has already decided the reels before this file draws anything.
 * The spin is therefore pure theatre: each reel cycles through symbols on a
 * timer and then stops, left to right, on the symbol the RNG picked. Nothing
 * here can change an outcome, and nothing here should look as though it
 * could — the stop order is fixed and the delays are constant.
 *
 * Session state (bet, auto-spin, the running tally) lives on `session` rather
 * than on the view, so it survives the view being rebuilt.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { esc, fmt, signed } = CV.UI;

    const AUTO_STEPS = [10, 25, 50, 100];
    const CYCLE_MS   = 70;      // how fast a spinning reel changes symbol
    const STOP_GAP   = 420;     // between one reel stopping and the next

    class SlotsView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;

            session.slots = session.slots || { bet: 10, auto: 0, autoOn: false };
            this.s = session.slots;

            this.spinning = false;
            this.timers   = [];
            this.shown    = ['cherry', 'cherry', 'cherry'];
        }

        mount() {
            this.root.classList.add('no-felt');
            const syms = CV.SlotsSymbols;
            this.root.innerHTML = `
                <div class="slots">
                    <div class="slot-cabinet">
                        <div class="slot-window">
                            ${[0, 1, 2].map((i) => `<div class="slot-reel" id="slotReel${i}">🍒</div>`).join('')}
                        </div>
                        <div class="slot-payline"></div>
                        <div class="slot-shout" id="slotShout"></div>
                    </div>

                    <div class="slot-controls" id="slotControls"></div>

                    <div class="slot-side">
                        <div class="card-panel slot-pay">
                            <h3>${esc(t('slots.paytable'))}</h3>
                            <table class="slot-pay-table"><tbody>
                                ${syms.slice().reverse().map((sym) => `
                                    <tr data-sym="${sym.id}">
                                        <td>${sym.icon} ${sym.icon} ${sym.icon}</td>
                                        <td class="num">×${sym.mult}</td>
                                    </tr>`).join('')}
                            </tbody></table>
                            <p class="muted small">${esc(t('slots.payNote'))}</p>
                        </div>
                        <div class="card-panel slot-stats" id="slotStats"></div>
                        <div class="card-panel slot-history" id="slotHistory"></div>
                    </div>
                </div>`;

            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() {
            this.clearTimers();
            this.root.classList.remove('no-felt');
            this.root.innerHTML = '';
        }

        clearTimers() {
            this.timers.forEach(clearTimeout);
            this.timers = [];
        }
        later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

        /* ---- reacting ----------------------------------------------------- */

        onChange(events) {
            const spun = events.find((e) => e.type === 'spin');
            if (spun) return this.animate(spun);
            this.paint();
        }

        /**
         * Reveal a result that already exists. Reels stop left to right; the
         * shout and the tally only appear once the last one has landed, so the
         * player reads the line rather than the number.
         */
        animate(spin) {
            this.spinning = true;
            this.clearTimers();
            this.paintControls();
            this.$('slotShout').textContent = '';
            this.$('slotShout').className = 'slot-shout';

            const syms = CV.SlotsSymbols;
            const speed = this.table.speed || 1;
            const cycles = [];

            for (let i = 0; i < 3; i++) {
                const el = this.$('slotReel' + i);
                el.classList.add('is-spinning');
                cycles[i] = setInterval(() => {
                    el.textContent = syms[Math.floor(Math.random() * syms.length)].icon;
                }, CYCLE_MS);
            }

            for (let i = 0; i < 3; i++) {
                this.later(() => {
                    clearInterval(cycles[i]);
                    const el = this.$('slotReel' + i);
                    el.classList.remove('is-spinning');
                    el.classList.add('is-landing');
                    el.textContent = spin.icons[i];
                    this.shown[i] = spin.reels[i];
                    setTimeout(() => el.classList.remove('is-landing'), 260);

                    if (i === 2) {
                        this.spinning = false;
                        this.settleSpin(spin);
                    }
                }, (STOP_GAP * (i + 1)) * speed);
            }
        }

        settleSpin(spin) {
            const shout = this.$('slotShout');
            if (spin.jackpot) {
                shout.textContent = t('slots.jackpot', { n: fmt(spin.payout) });
                shout.className = 'slot-shout is-jackpot';
            } else if (spin.payout > 0) {
                shout.textContent = t('slots.won', { n: fmt(spin.payout), mult: spin.mult });
                shout.className = 'slot-shout is-win';
            } else {
                shout.textContent = t('slots.noWin');
                shout.className = 'slot-shout is-loss';
            }

            this.paint();
            CV.UI.header();

            // Auto-spin carries on only while there is a spin left, the coins
            // to make it, and the player has not pressed stop.
            if (this.s.autoOn && this.s.auto > 0 && !this.engine.over) {
                this.s.auto--;
                if (this.s.auto <= 0) this.s.autoOn = false;
                if (this.engine.seat.coins >= Math.min(this.s.bet, this.engine.maxBet)) {
                    this.later(() => this.doSpin(), 320 * (this.table.speed || 1));
                } else {
                    this.s.autoOn = false;
                    this.s.auto = 0;
                    CV.UI.toast(t('slots.autoStopped'), 'warn');
                    this.paintControls();
                }
            }
        }

        /* ---- painting ------------------------------------------------------ */

        paint() {
            this.paintControls();
            this.paintStats();
            this.paintHistory();
            const coins = document.getElementById('tableCoins');
            if (coins) coins.textContent = fmt(this.engine.seat.coins);
            const shoe = document.getElementById('tableShoe');
            if (shoe) shoe.textContent = t('slots.spinsShort', { n: this.engine.tally.spins });
        }

        paintControls() {
            const e = this.engine;
            const host = this.$('slotControls');
            if (e.over) {
                host.innerHTML = `<div class="muted center">${esc(t('slots.finished'))}</div>`;
                return;
            }

            const coins = e.seat.coins;
            const max = Math.min(e.maxBet, coins);
            const busy = this.spinning;
            if (this.s.bet > max) this.s.bet = Math.max(e.minBet, max);
            if (this.s.bet < e.minBet) this.s.bet = e.minBet;

            const chips = [1, 10, 50, 100, 500, 1000].filter((v) => v <= max);

            host.innerHTML = `
                <div class="slot-bet">
                    <span class="muted small">${esc(t('slots.bet'))}</span>
                    <div class="slot-bet-row">
                        <button class="btn tiny" data-act="down" ${busy ? 'disabled' : ''}>−</button>
                        <b id="slotBetAmt">🪙 ${fmt(this.s.bet)}</b>
                        <button class="btn tiny" data-act="up" ${busy ? 'disabled' : ''}>+</button>
                    </div>
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip small" data-act="chip" data-v="${v}" ${busy ? 'disabled' : ''}>${fmt(v)}</button>`).join('')}
                        <button class="chip small" data-act="chip" data-v="${max}" ${busy ? 'disabled' : ''}>${esc(t('slots.max'))}</button>
                    </div>
                    <div class="muted small">${esc(t('slots.range', { lo: fmt(e.minBet), hi: fmt(e.maxBet) }))}</div>
                </div>

                <div class="slot-go">
                    <button class="btn primary slot-spin" data-act="spin" ${busy || max < e.minBet ? 'disabled' : ''}>
                        ${esc(busy ? t('slots.spinning') : t('slots.spin'))}
                    </button>
                    ${this.s.autoOn
                        ? `<button class="btn danger" data-act="stopauto">${esc(t('slots.stopAuto', { n: this.s.auto }))}</button>`
                        : `<div class="btn-row auto-row">
                             <span class="muted small">${esc(t('slots.auto'))}</span>
                             ${AUTO_STEPS.map((n) => `<button class="btn tiny" data-act="auto" data-n="${n}" ${busy ? 'disabled' : ''}>${n}</button>`).join('')}
                           </div>`}
                    <button class="btn ghost" data-act="cashout" ${busy ? 'disabled' : ''}>${esc(t('slots.cashout'))}</button>
                </div>`;
        }

        paintStats() {
            const g = this.engine.tally;
            const rate = g.spins ? (g.wins / g.spins) * 100 : 0;
            const net = g.won - g.staked;
            this.$('slotStats').innerHTML = `
                <h3>${esc(t('slots.session'))}</h3>
                <div class="stat-grid">
                    <div class="stat"><span class="label">${esc(t('slots.spins'))}</span><span class="value">${fmt(g.spins)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.totalBet'))}</span><span class="value">${fmt(g.staked)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.totalWon'))}</span><span class="value good">${fmt(g.won)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.net'))}</span><span class="value ${net > 0 ? 'good' : net < 0 ? 'bad' : ''}">${signed(net)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.biggest'))}</span><span class="value">${fmt(g.biggest)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.jackpots'))}</span><span class="value">${fmt(g.jackpots)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.wins'))}</span><span class="value good">${fmt(g.wins)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.losses'))}</span><span class="value bad">${fmt(g.losses)}</span></div>
                    <div class="stat"><span class="label">${esc(t('slots.winRate'))}</span><span class="value">${rate.toFixed(1)}%</span></div>
                </div>`;
        }

        paintHistory() {
            const rows = this.engine.history.slice(0, 12);
            this.$('slotHistory').innerHTML = `
                <h3>${esc(t('slots.history'))}</h3>
                ${rows.length ? `<table class="slot-hist"><tbody>${rows.map((r) => `
                    <tr class="${r.jackpot ? 'is-jackpot' : r.payout > 0 ? 'is-win' : ''}">
                        <td class="slot-hist-reels">${r.icons.join(' ')}</td>
                        <td class="num muted">🪙 ${fmt(r.bet)}</td>
                        <td class="num ${r.net > 0 ? 'good' : r.net < 0 ? 'bad' : ''}">${signed(r.net)}</td>
                    </tr>`).join('')}</tbody></table>`
                    : `<p class="muted small">${esc(t('slots.noSpins'))}</p>`}`;
        }

        /* ---- input --------------------------------------------------------- */

        step(dir) {
            const e = this.engine;
            const ladder = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
            const max = Math.min(e.maxBet, e.seat.coins);
            const i = ladder.findIndex((v) => v >= this.s.bet);
            let next = dir > 0 ? ladder[Math.min(ladder.length - 1, i + 1)] : ladder[Math.max(0, i - 1)];
            this.s.bet = Math.max(e.minBet, Math.min(max, next));
            this.paintControls();
        }

        doSpin() {
            if (this.spinning || this.engine.over) return;
            const e = this.engine;
            const bet = Math.max(e.minBet, Math.min(this.s.bet, Math.min(e.maxBet, e.seat.coins)));
            this.table.dispatch({ type: 'spin', seat: 0, amount: bet });
        }

        act(el) {
            const type = el.dataset.act;
            if (this.spinning && type !== 'stopauto') return;

            switch (type) {
                case 'up':   return this.step(1);
                case 'down': return this.step(-1);
                case 'chip':
                    this.s.bet = Math.max(this.engine.minBet,
                        Math.min(Number(el.dataset.v), Math.min(this.engine.maxBet, this.engine.seat.coins)));
                    return this.paintControls();
                case 'spin': return this.doSpin();
                case 'auto':
                    this.s.auto = Number(el.dataset.n);
                    this.s.autoOn = true;
                    this.paintControls();
                    return this.doSpin();
                case 'stopauto':
                    this.s.autoOn = false;
                    this.s.auto = 0;
                    return this.paintControls();
                case 'cashout':
                    this.s.autoOn = false;
                    this.s.auto = 0;
                    return void this.table.dispatch({ type: 'cashout', seat: 0 });
                default: return undefined;
            }
        }
    }

    CV.SlotsView = SlotsView;
})();
