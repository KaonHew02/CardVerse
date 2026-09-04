/**
 * CardVerse — the 斗牛 table.
 *
 * The dealer's five across the top, the seats below, your bet box at the
 * bottom. There is one decision in the game, so the screen's whole job is
 * afterwards: showing what everybody got and why it beat or lost to the
 * dealer.
 *
 * Every hand turns in two beats: the three that make the ten, and then the
 * two that give the bull. That is the order the game is played in and the
 * order it reads in — the three explain where the number came from, and the
 * two are the number.
 *
 * The engine resolves the whole deal in a single step, so without pacing the
 * round would begin and end in the same frame; `revealing` holds the result
 * screen back until the last two cards are over.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { esc, fmt, signed } = CV.UI;

    /** One beat per half-hand: three cards, then two. */
    const BEAT_MS = 430;

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

        /** Two beats a hand — the dealer's first, then each seat's. */
        get toShow() {
            const e = this.engine;
            return e.phase === 'betting' ? 0 : (1 + e.seats.filter((s) => !s.out).length) * 2;
        }
        get revealing() { return this.shown < this.toShow; }

        /** 0 face down, 1 the three that make the ten, 2 the whole hand. */
        stageOf(hand) { return Math.max(0, Math.min(2, this.shown - hand * 2)); }

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
            }, BEAT_MS * (this.table.speed || 1));
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
         * A hand at a given stage. The three that make the multiple of ten
         * come up first and stay marked — that mark is the whole explanation
         * of the bull, and without it the number looks arbitrary.
         *
         * A 无牛 hand has no such three, so it turns the first three and then
         * the rest, which is the same shape with nothing to show for it.
         */
        handHtml(cards, hand, stage) {
            if (stage <= 0) return CV.CardView.hand(cards.map(() => null), {});
            const three = (hand && hand.three) ? hand.three : cards.slice(0, 3);
            const inCombo = new Set(three.map((c) => c.id));
            const marks = !!(hand && hand.three);
            return `<div class="hand">${cards.map((c) => {
                if (stage < 2 && !inCombo.has(c.id)) return CV.CardView.html(null, { faceDown: true });
                return CV.CardView.html(c, {
                    fresh: !this.known.has(c.id),
                    cls: (marks && inCombo.has(c.id)) ? 'is-combo' : '',
                });
            }).join('')}</div>`;
        }

        paintDealer() {
            const e = this.engine;
            const stage = e.dealer.cards.length ? this.stageOf(0) : 0;
            this.$('bbDealer').innerHTML = `
                <div class="bj-rule">${esc(t('table.dealer'))}</div>
                ${e.dealer.cards.length
                    ? this.handHtml(e.dealer.cards, e.dealer.hand, stage)
                    : `<div class="hand hand-empty"></div>`}
                <div class="bb-name">${stage >= 2 ? esc(e.handName(e.dealer.hand)) : ''}</div>`;
        }

        seatBox(s, order) {
            const e = this.engine;
            const stage = s.cards.length ? this.stageOf(1 + order) : 0;
            const up = stage >= 2;
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
                        ? this.handHtml(s.cards, s.hand, stage)
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
