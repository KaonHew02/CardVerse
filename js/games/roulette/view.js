/**
 * CardVerse — the party table.
 *
 * The seats around the top with their hearts and their scores, the spinner in
 * the middle, and two buttons. Everything the game knows is on screen: how
 * many slots are left and what kinds, because both are public and counting
 * them is the only skill there is.
 *
 * The pacing is the point of this screen. A spin takes a beat, the result
 * lands with a shout, and a hit shakes the table — and the result overlay is
 * held back until all of that has finished, because a party game that resolves
 * in one frame is not a party game.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const R = CV.Roulette;
    const { esc, fmt } = CV.UI;

    const SPIN_MS  = 950;
    const SHOUT_MS = 1300;

    class RouletteView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.spinning = false;
            this.shout   = null;      // { slot, hp, points, blocked }
            this.timers  = [];
        }

        get you() { return this.engine.youSeat; }
        get revealing() { return this.spinning || !!this.shout; }

        after(ms, fn) {
            const id = setTimeout(() => { fn(); this.paint(); }, ms * (this.table.speed || 1));
            this.timers.push(id);
        }

        mount() {
            this.root.innerHTML = `
                <div class="rr">
                    <div class="rr-seats" id="rrSeats"></div>
                    <div class="rr-stage">
                        <div class="rr-event" id="rrEvent"></div>
                        <div class="rr-wheel" id="rrWheel"></div>
                        <div class="rr-shout" id="rrShout"></div>
                    </div>
                    <div class="bj-status" id="rrStatus"></div>
                    <div class="bj-actions" id="rrActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() {
            this.timers.forEach(clearTimeout);
            this.root.innerHTML = '';
        }

        onChange(events) {
            for (const e of events) {
                if (e.type === 'spin') {
                    this.spinning = true;
                    this.after(SPIN_MS, () => { this.spinning = false; });
                }
                if (e.type === 'pull') {
                    this.shout = e;
                    if (e.hp < 0) this.root.classList.add('rr-hit');
                    this.after(SHOUT_MS, () => {
                        this.shout = null;
                        this.root.classList.remove('rr-hit');
                    });
                }
            }
            this.paint();
        }

        /* ---- painting -------------------------------------------------------- */

        paint() {
            this.paintSeats();
            this.paintEvent();
            this.paintWheel();
            this.paintShout();
            this.paintStatus();
            this.paintActions();
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
        }

        hearts(s) {
            const max = Math.max(s.hp, this.engine.final ? this.engine.config.finalHp : this.engine.config.hp);
            let out = '';
            for (let i = 0; i < max; i++) out += `<i class="${i < s.hp ? 'on' : ''}"></i>`;
            return `<span class="rr-hp" aria-label="${s.hp} HP">${out}</span>`;
        }

        paintSeats() {
            const e = this.engine;
            this.$('rrSeats').innerHTML = e.seats.filter((s) => !s.out).map((s) => {
                const turn = e.turn === s.index && !e.over;
                const mine = s.index === this.you;
                const tags = [];
                if (s.shield)  tags.push(`<span class="rr-tag is-shield">${esc(t('rr.shield'))}</span>`);
                if (s.doubled) tags.push(`<span class="rr-tag is-double">${esc(t('rr.double'))}</span>`);
                if (s.lucky)   tags.push(`<span class="rr-tag is-lucky">${esc(t('rr.lucky'))}</span>`);
                return `
                    <div class="seat rr-seat${turn ? ' is-turn' : ''}${mine ? ' is-you' : ''}${s.alive ? '' : ' is-dead'}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <span class="who"><span class="name">${esc(s.name)}${mine ? ' <em>(you)</em>' : ''}</span>
                                <span class="coins">${esc(t('rr.score', { n: s.score }))}</span></span>
                        </div>
                        ${s.alive ? this.hearts(s) : `<div class="rr-out">${esc(t('rr.eliminated'))}</div>`}
                        <div class="rr-tags">${tags.join('')}</div>
                    </div>`;
            }).join('');
        }

        paintEvent() {
            const e = this.engine;
            const host = this.$('rrEvent');
            if (e.over || !e.event) { host.innerHTML = ''; return; }
            host.innerHTML = `<span class="rr-banner is-${e.event}">${esc(t('rr.ev.' + e.event))}</span>`;
        }

        /**
         * Six slots in a ring with a pointer. The ones already opened are
         * dimmed, because what is left is public and worth counting.
         */
        paintWheel() {
            const e = this.engine;
            const used = R.SIZE - e.chamber.left;
            const slots = [];
            for (let i = 0; i < R.SIZE; i++) {
                const angle = (i / R.SIZE) * 360;
                slots.push(`<i class="rr-slot${i < used ? ' is-used' : ''}" style="--a:${angle}deg"></i>`);
            }
            const counts = e.chamber.counts;
            const legend = ['DANGER', 'TRAP', 'BONUS', 'SAFE']
                .filter((k) => counts[k])
                .map((k) => `<span class="rr-left is-${k}">${counts[k]}</span>`).join('');

            this.$('rrWheel').innerHTML = `
                <div class="rr-ring${this.spinning ? ' is-spinning' : ''}${e.final ? ' is-final' : ''}">
                    ${slots.join('')}<b class="rr-pin">${e.final ? '🔥' : '🎯'}</b>
                </div>
                <div class="rr-legend">${legend}
                    <span class="muted small">${esc(t('rr.left', { n: e.chamber.left }))}</span></div>`;
        }

        paintShout() {
            const host = this.$('rrShout');
            if (!this.shout || this.spinning) { host.innerHTML = ''; return; }
            const s = this.shout;
            const bits = [];
            if (s.blocked) bits.push(t('rr.blocked'));
            else if (s.hp < 0) bits.push(t('rr.hpLost', { n: -s.hp }));
            if (s.points) bits.push((s.points > 0 ? '+' : '') + s.points + ' ' + t('rr.points'));
            host.innerHTML = `
                <div class="rr-call is-${s.slot}">${esc(t(R.SLOTS[s.slot].shout))}</div>
                <div class="rr-sub">${esc(bits.join(' · '))}</div>`;
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('rrStatus');
            if (e.over) {
                host.innerHTML = e.winner >= 0
                    ? `<span class="you">${esc(t('rr.wins', { name: e.seats[e.winner].name }))}</span>` : '';
                return;
            }
            const who = e.seats[e.turn];
            host.innerHTML = e.turn === this.you
                ? `<span class="you">${esc(t(e.phase === 'spin' ? 'rr.yourSpin' : 'rr.yourPull'))}</span>`
                : `<span class="muted">${esc(t('rr.turnOf', { name: who.name, n: e.round }))}</span>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('rrActions');
            const options = (e.turn === this.you && !e.over && !this.revealing)
                ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            host.innerHTML = `
                <div class="btn-row">
                    ${options.map((o) => `
                        <button class="btn ${o.type === 'pull' ? 'primary big' : ''} rr-btn is-${o.type}"
                            data-act="${o.type}">${esc(o.label)}</button>`).join('')}
                </div>
                <div class="muted small">${esc(t(e.phase === 'spin' ? 'rr.spinNote' : 'rr.pullNote'))}</div>`;
        }

        act(el) {
            if (this.revealing) return;
            this.table.dispatch({ type: el.dataset.act, seat: this.you });
        }
    }

    CV.RouletteView = RouletteView;
})();
