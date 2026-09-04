/**
 * CardVerse — the 21 table.
 *
 * Repaints from engine state on every change; events are used only to know
 * which cards are new, so the deal animation runs once per card and never on
 * a re-render. What is drawn is what the engine holds, which makes "the
 * screen is stale" impossible rather than merely unlikely.
 *
 * The engine resolves the dealer in one synchronous burst, so the view holds
 * the dealer's cards back and turns them one at a time — otherwise the hand
 * is over before it can be read.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { esc, fmt, signed } = CV.UI;

    /** Badge on a finished hand. The word comes from the pack; the tone is local. */
    const OUTCOME = {
        dragons: { key: 'out.dragons', cls: 'win' },
        win:     { key: 'out.win',     cls: 'win' },
        push:    { key: 'out.push',    cls: 'push' },
        loss:    { key: 'out.loss',    cls: 'loss' },
        bust:    { key: 'out.bust',    cls: 'loss' },
    };

    class TwentyOneView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.known   = new Set();
            this.bet     = null;
            this.shownDealer = 0;
            this.revealTimer = null;
        }

        mount() {
            this.root.innerHTML = `
                <div class="bj">
                    <section class="bj-dealer">
                        <div class="seat-head">
                            <span class="avatar">🎩</span>
                            <span class="name">${esc(t('table.dealer'))}</span>
                            <span class="total" id="toDealerTotal"></span>
                        </div>
                        <div id="toDealerHand" class="hand-wrap"></div>
                        <div class="bj-rule muted small">${esc(t('to.rules'))}</div>
                    </section>
                    <section class="bj-seats" id="toSeats"></section>
                    <section class="bj-status" id="toStatus"></section>
                    <section class="bj-actions" id="toActions"></section>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange(() => this.paint());
            this.paint();
        }

        unmount() {
            clearTimeout(this.revealTimer);
            this.revealTimer = null;
            this.root.innerHTML = '';
        }

        /* ---- the paced dealer reveal -------------------------------------- */

        get revealing() {
            const d = this.engine.dealer;
            return !!d.revealed && this.shownDealer < (d.cards || []).filter(Boolean).length;
        }

        scheduleReveal() {
            if (this.revealTimer) return;
            this.revealTimer = setTimeout(() => {
                this.revealTimer = null;
                this.shownDealer++;
                this.paint();
            }, 620 * (this.table.speed || 1));
        }

        /* ---- painting ---------------------------------------------------- */

        paint() {
            this.paintDealer();
            this.paintSeats();
            this.paintStatus();
            this.paintActions();
            this.followTurn();
            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const bar = document.getElementById('tableShoe');
            if (bar) bar.textContent = t('table.cards', { n: this.engine.shoe.remaining });
            const coins = document.getElementById('tableCoins');
            if (coins && this.engine.youSeat >= 0) {
                coins.textContent = fmt(this.engine.seats[this.engine.youSeat].coins);
            }
        }

        /**
         * On a phone the action bar is pinned to the bottom while the cards it
         * refers to can be several seats up. Bring the active seat into view
         * once per turn — not on every repaint, or the page fights the player.
         */
        followTurn() {
            const e = this.engine;
            const seat = e.seats[e.turn];
            const key = `${e.phase}:${e.turn}`;
            if (key === this.lastFollow) return;
            this.lastFollow = key;
            if (window.innerWidth > 720 || e.over || !seat || !seat.isHuman) return;
            const el = this.root.querySelector('.seat.is-turn');
            if (!el) return;
            const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
        }

        cards(list, hideSecond) {
            return `<div class="hand">` + list.map((c, i) => CV.CardView.html(c, {
                faceDown: hideSecond && i === 1,
                fresh: c && !this.known.has(c.id),
            })).join('') + '</div>';
        }

        paintDealer() {
            const e = this.engine;
            const d = e.dealer;
            const hidden = !d.revealed;
            const all = (d.cards || []).filter(Boolean);

            let shown;
            if (hidden) { this.shownDealer = 0; shown = all; }
            else {
                if (this.shownDealer < 2) this.shownDealer = Math.min(2, all.length);
                shown = all.slice(0, this.shownDealer);
                if (this.shownDealer < all.length) this.scheduleReveal();
            }

            this.$('toDealerHand').innerHTML = shown.length ? this.cards(shown, hidden) : '';
            const el = this.$('toDealerTotal');
            if (!shown.length) { el.textContent = ''; return; }

            const sc = CV.TwentyOneScore(shown);
            if (hidden) {
                el.textContent = CV.TwentyOneScore([shown[0]]).total + ' + ?';
                el.classList.remove('bad');
            } else {
                el.textContent = sc.bust ? t('out.bust')
                    : sc.dragons ? `${t('out.dragons')} ${sc.total}` : sc.total;
                el.classList.toggle('bad', sc.bust);
            }
        }

        paintSeats() {
            const e = this.engine;
            this.$('toSeats').innerHTML = e.seats.map((s, i) => {
                const turn = e.turn === i && !e.over && e.phase === 'playing';
                const cls = ['seat', s.isYou ? 'is-you' : '', turn ? 'is-turn' : '', s.out ? 'is-out' : '']
                    .filter(Boolean).join(' ');
                const h = s.hands[0];
                return `
                    <div class="${cls}" data-seat="${i}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <div class="who">
                                <span class="name">${esc(s.name)}${s.isYou ? ` <em>(${esc(t('you'))})</em>` : ''}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span>
                            </div>
                        </div>
                        <div class="seat-hands">
                            ${s.out ? `<div class="muted small">${esc(t('table.sittingOut'))}</div>`
                                : h ? this.handHtml(h, turn) : '<div class="hand hand-empty"></div>'}
                        </div>
                    </div>`;
            }).join('');
        }

        handHtml(h, active) {
            const sc = CV.TwentyOneScore(h.cards);
            let total = '';
            if (h.cards.length) {
                total = sc.bust ? t('out.bust')
                    : sc.dragons ? `${t('out.dragons')} ${sc.total}`
                    : (sc.soft && sc.total !== 21 ? 'soft ' : '') + sc.total;
            }
            const badge = h.outcome && OUTCOME[h.outcome]
                ? `<span class="badge ${OUTCOME[h.outcome].cls}">${esc(t(OUTCOME[h.outcome].key))} ${signed(h.payout - h.bet)}</span>`
                : '';
            const tags = h.doubled ? '<small>2×</small>' : '';
            return `
                <div class="seat-hand${active ? ' is-active' : ''}${h.done && !h.outcome ? ' is-done' : ''}${sc.dragons ? ' is-dragons' : ''}">
                    ${this.cards(h.cards, false)}
                    <div class="hand-meta">
                        <span class="total${sc.bust ? ' bad' : ''}">${esc(String(total))}</span>
                        <span class="bet">🪙 ${fmt(h.bet)} ${tags}</span>
                        ${badge}
                    </div>
                </div>`;
        }

        paintStatus() {
            const e = this.engine;
            const host = this.$('toStatus');

            if (this.revealing) { host.innerHTML = `<span>${esc(t('table.dealerDraws'))}</span>`; return; }
            if (e.over) {
                const sc = CV.TwentyOneScore((e.dealer.cards || []).filter(Boolean));
                host.innerHTML = `<span>${esc(sc.bust ? t('table.dealerBusts')
                    : sc.dragons ? t('to.dealerDragons', { n: sc.total })
                    : t('table.dealerHas', { n: sc.total }))}</span>`;
                return;
            }
            if (e.phase === 'dealer') { host.innerHTML = `<span>${esc(t('table.dealerPlays'))}</span>`; return; }

            const seat = e.seats[e.turn];
            if (!seat) { host.innerHTML = ''; return; }
            if (seat.isHuman) {
                const line = e.phase === 'betting' ? t('table.yourBet') : t('table.yourTurn');
                host.innerHTML = `<span class="you">${esc(line)}</span>`;
            } else {
                const key = e.phase === 'betting' ? 'table.betting' : 'table.thinking';
                host.innerHTML = `<span class="muted">${seat.avatar} ${esc(t(key, { name: seat.name }))}</span>`;
            }
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('toActions');
            const seat = e.seats[e.turn];
            if (e.over || !seat || !seat.isHuman) { host.innerHTML = ''; return; }

            const options = e.legalActions(e.turn);
            if (!options.length) { host.innerHTML = ''; return; }
            if (e.phase === 'betting') return this.paintBet(host, options[0], seat);

            const hint = this.hint(seat);
            host.innerHTML = `
                ${hint ? `<div class="bj-hint muted small">${esc(t('table.bookLabel'))} <b>${esc(hint)}</b></div>` : ''}
                <div class="btn-row">
                    ${options.map((o) => `<button class="btn act-${o.type}" data-act="${o.type}">${esc(o.label)}</button>`).join('')}
                </div>`;
        }

        paintBet(host, opt, seat) {
            if (this.bet === null || this.bet < opt.min || this.bet > opt.max) {
                this.bet = Math.min(opt.max, Math.max(opt.min, this.session.lastBet || opt.min));
            }
            const chips = [opt.min, opt.min * 2, opt.min * 5, opt.max]
                .filter((v, i, a) => v <= opt.max && a.indexOf(v) === i);
            host.innerHTML = `
                <div class="bet-box">
                    <div class="bet-amount">🪙 <b id="toBetAmt">${fmt(this.bet)}</b>
                        <small class="muted">${esc(t('table.ofCoins', { n: fmt(seat.coins) }))}</small></div>
                    <input type="range" id="toBetRange" min="${opt.min}" max="${opt.max}" step="5" value="${this.bet}">
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip" data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="bet">${esc(t('table.deal'))}</button>
                    </div>
                    <div class="muted small">${esc(t('table.range', { lo: fmt(opt.min), hi: fmt(opt.max) }))}</div>
                </div>`;
            const range = this.$('toBetRange');
            range.addEventListener('input', () => {
                this.bet = Number(range.value);
                this.$('toBetAmt').textContent = fmt(this.bet);
            });
        }

        /** What correct play would do here — a teaching aid, on by default. */
        hint(seat) {
            if (!CV.Settings.get().hints || !this.table.ai || this.engine.phase !== 'playing') return '';
            const h = this.engine.hand(seat.index);
            if (!h) return '';
            const can = (type) => this.engine.legalActions(seat.index).some((o) => o.type === type);
            const up = CV.Cards.pipValue(this.engine.dealerUp());
            const move = this.table.ai.book(h.cards, up, can);
            return can(move) ? t('act.' + move) : '';
        }

        /* ---- input ------------------------------------------------------- */

        act(el) {
            const e = this.engine;
            const type = el.dataset.act;
            if (type === 'chip') {
                const range = this.$('toBetRange');
                this.bet = Math.min(Number(range.max), Math.max(Number(range.min), Number(el.dataset.v)));
                range.value = this.bet;
                this.$('toBetAmt').textContent = fmt(this.bet);
                return;
            }
            if (type === 'bet') {
                this.session.lastBet = this.bet;
                this.table.dispatch({ type: 'bet', seat: e.turn, amount: this.bet });
                this.bet = null;
                return;
            }
            this.table.dispatch({ type, seat: e.turn });
        }
    }

    CV.TwentyOneView = TwentyOneView;
})();
