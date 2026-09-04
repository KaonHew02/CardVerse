/**
 * CardVerse — the 轮盘 table.
 *
 * A wheel and a layout. You cover spots with chips, every seat does the same
 * in turn, and then one ball settles the lot.
 *
 * **The ball is theatre and nothing else.** The engine has already drawn the
 * pocket before this file is told anything, so the spin here only travels to
 * a number that is already true. It is paced because the engine resolves in
 * one step, and a wheel whose result appears in the same frame as the bet is
 * not a wheel — but nothing in this file can move a ball anywhere the RNG did
 * not already put it.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const W = CV.Wheel;
    const { esc, fmt, signed } = CV.UI;

    /** How long the ball runs before it drops. */
    const BALL_MS = 2600;

    /** The chips you can pick up, filtered to the table's range. */
    const CHIPS = [1, 5, 10, 25, 50, 100, 500];

    const CX = 112, CY = 112, R_OUT = 106, R_IN = 74, R_TEXT = 90, R_BALL = 64;

    /** One pocket wedge on the rim. */
    function wedge(i) {
        const step = 360 / W.POCKETS;
        const rad = (d) => ((d - 90) * Math.PI) / 180;
        const a0 = rad(i * step - step / 2);
        const a1 = rad((i + 1) * step - step / 2);
        const p = (r, a) => [(CX + r * Math.cos(a)).toFixed(2), (CY + r * Math.sin(a)).toFixed(2)];
        const [x0, y0] = p(R_OUT, a0), [x1, y1] = p(R_OUT, a1);
        const [x2, y2] = p(R_IN, a1),  [x3, y3] = p(R_IN, a0);
        return `M${x0} ${y0} A${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1} `
             + `L${x2} ${y2} A${R_IN} ${R_IN} 0 0 0 ${x3} ${y3} Z`;
    }

    /** The wheel, drawn in the pockets' real order — see wheel.js. */
    function wheelSvg() {
        const step = 360 / W.POCKETS;
        const pockets = W.ORDER.map((n, i) => {
            const mid = i * step;
            const rad = ((mid - 90) * Math.PI) / 180;
            const tx = (CX + R_TEXT * Math.cos(rad)).toFixed(2);
            const ty = (CY + R_TEXT * Math.sin(rad)).toFixed(2);
            return `<path class="rl-pocket is-${W.colourOf(n)}" d="${wedge(i)}"></path>`
                 + `<text class="rl-pip" x="${tx}" y="${ty}" transform="rotate(${mid.toFixed(2)} ${tx} ${ty})"
                      text-anchor="middle" dominant-baseline="central">${n}</text>`;
        }).join('');

        return `
            <svg class="rl-wheel" viewBox="0 0 224 224" role="img" aria-label="Roulette wheel">
                <circle cx="${CX}" cy="${CY}" r="${R_OUT + 6}" class="rl-rim"></circle>
                ${pockets}
                <circle cx="${CX}" cy="${CY}" r="${R_IN - 4}" class="rl-hub"></circle>
                <g class="rl-ball-arm" id="rlBallArm">
                    <circle class="rl-ball" cx="${CX}" cy="${CY - R_BALL}" r="6"></circle>
                </g>
                <path class="rl-pointer" d="M${CX} 6 L${CX - 7} 20 L${CX + 7} 20 Z"></path>
            </svg>`;
    }

    /** The three rows of the layout, top to bottom: columns 3, 2 then 1. */
    const ROWS = [3, 2, 1].map((col) => {
        const nums = [];
        for (let n = col; n <= 36; n += 3) nums.push(n);
        return { col, nums };
    });

    class RouletteView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            session.rl   = session.rl || { chip: 10 };
            this.s       = session.rl;
            this.landed  = false;
            this.spun    = 0;       // degrees the ball has travelled so far
            this.timer   = null;
        }

        get you() { return this.engine.youSeat; }
        get revealing() { return this.engine.number !== null && !this.landed; }

        mount() {
            this.root.innerHTML = `
                <div class="rl">
                    <div class="rl-top">
                        <div class="rl-wheel-box">
                            ${wheelSvg()}
                            <div class="rl-call" id="rlCall"></div>
                        </div>
                        <div class="rl-seats" id="rlSeats"></div>
                    </div>
                    <div class="rl-board" id="rlBoard"></div>
                    <div class="bj-status" id="rlStatus"></div>
                    <div class="bj-actions" id="rlActions"></div>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.paintBoard();
            this.table.onChange((events) => this.onChange(events));
            this.paint();
        }

        unmount() { clearTimeout(this.timer); this.root.innerHTML = ''; }

        onChange(events) {
            const spun = events.find((e) => e.type === 'spin');
            if (spun && !this.landed) {
                clearTimeout(this.timer);
                this.roll(spun.number);
                this.timer = setTimeout(() => {
                    this.landed = true;
                    this.paint();
                }, BALL_MS * (this.table.speed || 1));
            }
            this.paint();
        }

        /** Send the ball round to a pocket the RNG has already chosen. */
        roll(n) {
            const arm = this.$('rlBallArm');
            if (!arm) return;
            const step = 360 / W.POCKETS;
            const target = W.ORDER.indexOf(n) * step;
            // Always forwards, and always several turns, so the travel reads
            // as a spin rather than a jump to the answer.
            const turns = 5 * 360;
            const from = this.spun % 360;
            this.spun += turns + ((target - from) + 360) % 360;
            arm.style.transform = `rotate(${this.spun}deg)`;
        }

        /* ---- painting ------------------------------------------------------ */

        paint() {
            this.paintCall();
            this.paintSeats();
            this.paintChips();
            this.paintStatus();
            this.paintActions();
            const coins = document.getElementById('tableCoins');
            if (coins && this.you >= 0) coins.textContent = fmt(this.engine.seats[this.you].coins);
        }

        paintCall() {
            const e = this.engine;
            const host = this.$('rlCall');
            if (e.number === null || !this.landed) { host.innerHTML = ''; return; }
            host.innerHTML = `<span class="rl-number is-${e.colour}">${e.number}</span>
                <span class="rl-colour">${esc(t('rl.' + e.colour))}</span>`;
        }

        /** The layout. Built once — only the chips on it change. */
        paintBoard() {
            const cell = (n) => `<button class="rl-cell is-${W.colourOf(n)}" data-act="spot"
                data-kind="straight" data-v="${n}"><b>${n}</b><i class="rl-stack"></i></button>`;

            const rows = ROWS.map((r, i) => r.nums.map(cell).join('')
                + `<button class="rl-cell rl-side" data-act="spot" data-kind="column" data-v="${r.col}"
                     style="grid-column:14;grid-row:${i + 1}"><b>2:1</b><i class="rl-stack"></i></button>`).join('');

            const dozens = [1, 2, 3].map((d) => `
                <button class="rl-cell rl-wide" data-act="spot" data-kind="dozen" data-v="${d}"
                    style="grid-column:${2 + (d - 1) * 4} / span 4;grid-row:4">
                    <b>${esc(t('rl.dozen' + d))}</b><i class="rl-stack"></i></button>`).join('');

            const outs = ['low', 'even', 'red', 'black', 'odd', 'high'].map((k, i) => `
                <button class="rl-cell rl-wide is-${k}" data-act="spot" data-kind="${k}"
                    style="grid-column:${2 + i * 2} / span 2;grid-row:5">
                    <b>${esc(t('rl.' + k))}</b><i class="rl-stack"></i></button>`).join('');

            this.$('rlBoard').innerHTML = `
                <button class="rl-cell rl-zero is-green" data-act="spot" data-kind="straight" data-v="0">
                    <b>0</b><i class="rl-stack"></i></button>
                ${rows}${dozens}${outs}`;
        }

        /** Your own chips, on the spots you put them. */
        paintChips() {
            const e = this.engine;
            const mine = this.you >= 0 ? e.seats[this.you] : null;
            const by = new Map();
            if (mine) for (const b of mine.bets) by.set(W.keyOf(b), b);

            this.root.querySelectorAll('.rl-cell').forEach((el) => {
                const kind = el.dataset.kind;
                const v = el.dataset.v;
                const key = v === undefined ? kind : kind + ':' + Number(v);
                const bet = by.get(key);
                const stack = el.querySelector('.rl-stack');
                stack.textContent = bet ? fmt(bet.amount) : '';
                el.classList.toggle('has-chip', !!bet);
                // Once the ball is down, the spots that paid are the story.
                el.classList.toggle('is-hit',
                    this.landed && e.number !== null && W.wins({ kind, value: v === undefined ? null : Number(v) }, e.number));
            });
        }

        paintSeats() {
            const e = this.engine;
            this.$('rlSeats').innerHTML = e.seats.map((s, i) => {
                const turn = e.turn === i && !e.over && e.phase === 'betting';
                const cls = ['seat', s.isYou ? ' is-you' : '', turn ? ' is-turn' : '',
                    s.out ? ' is-out' : ''].filter(Boolean).join(' ');
                const show = this.landed && e.number !== null;
                return `
                    <div class="${cls}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <div class="who">
                                <span class="name">${esc(s.name)}${s.isYou ? ` <em>(${esc(t('you'))})</em>` : ''}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span>
                            </div>
                        </div>
                        <div class="hand-meta">
                            ${s.out ? `<span class="muted small">${esc(t('table.sittingOut'))}</span>` : ''}
                            ${s.bets.length
                                ? `<span class="rl-slip">${esc(t('rl.covered', { n: s.bets.length }))}</span>
                                   <span class="bet">🪙 ${fmt(s.staked)}</span>`
                                : s.done ? `<span class="muted small">${esc(t('rl.passed'))}</span>` : ''}
                            ${show ? `<span class="${s.net > 0 ? 'good' : s.net < 0 ? 'bad' : ''}">${signed(s.net)}</span>` : ''}
                        </div>
                    </div>`;
            }).join('');
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('rlStatus');
            if (this.revealing) { host.innerHTML = `<span>${esc(t('rl.rolling'))}</span>`; return; }
            if (e.over) {
                host.innerHTML = `<span class="muted">${esc(t('rl.landed', {
                    n: e.number, colour: t('rl.' + e.colour),
                }))}</span>`;
                return;
            }
            const who = e.seats[e.turn];
            if (!who) { host.innerHTML = ''; return; }
            host.innerHTML = e.turn === this.you
                ? `<span class="you">${esc(t('rl.yourBet'))}</span>`
                : `<span class="muted">${who.avatar} ${esc(t('table.betting', { name: who.name }))}</span>`;
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('rlActions');
            const options = (e.turn === this.you && !e.over) ? e.legalActions(this.you) : [];
            if (!options.length) { host.innerHTML = ''; return; }

            const place = options.find((o) => o.type === 'place');
            const done  = options.find((o) => o.type === 'done');
            const s = e.seats[this.you];

            if (place) {
                const lo = place.min, hi = place.max;
                if (this.s.chip < lo || this.s.chip > hi) this.s.chip = lo;
                const chips = CHIPS.filter((v) => v >= lo && v <= hi);
                if (!chips.length) chips.push(lo);
                host.innerHTML = `
                    <div class="rl-chipbar">
                        <span class="muted small">${esc(t('rl.chip'))}</span>
                        ${chips.map((v) => `<button class="chip${this.s.chip === v ? ' is-on' : ''}"
                            data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="done">${esc(done.label)}</button>
                        ${options.some((o) => o.type === 'clear')
                            ? `<button class="btn ghost" data-act="clear">${esc(t('rl.clear'))}</button>` : ''}
                    </div>
                    <div class="muted small">${esc(t('rl.staked', {
                        n: fmt(s.staked), of: fmt(s.coins),
                    }))}</div>`;
            } else {
                host.innerHTML = `<div class="btn-row">
                    <button class="btn primary big" data-act="done">${esc(done.label)}</button></div>`;
            }
        }

        /* ---- input --------------------------------------------------------- */

        act(el) {
            const e = this.engine;
            const type = el.dataset.act;
            if (type === 'chip') { this.s.chip = Number(el.dataset.v); this.paintActions(); return; }
            if (type === 'clear') { this.table.dispatch({ type: 'clear', seat: this.you }); return; }
            if (type === 'done')  { this.table.dispatch({ type: 'done', seat: this.you }); return; }
            if (type === 'spot') {
                if (e.turn !== this.you || e.phase !== 'betting') return;
                const kind = el.dataset.kind;
                const v = el.dataset.v;
                this.table.dispatch({
                    type: 'place', seat: this.you,
                    bet: { kind, value: v === undefined ? null : Number(v) },
                    amount: this.s.chip,
                });
            }
        }
    }

    CV.RouletteView = RouletteView;
})();
