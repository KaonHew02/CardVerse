/**
 * CardVerse — the Blackjack table on screen (21 uses it too).
 *
 * The view repaints from engine state on every change. It does not replay
 * events to build the picture; events are only used to know which cards are
 * new, so the deal animation runs once per card and never on a re-render.
 * That keeps the view honest — what is drawn is what the engine holds —
 * and makes "the screen is stale" impossible rather than merely unlikely.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { handValue, isBlackjack } = CV.Cards;
    const { esc, fmt, signed } = CV.UI;

    const OUTCOME = {
        blackjack: { text: 'BLACKJACK', cls: 'win' },
        twentyone: { text: '21!',       cls: 'win' },
        win:       { text: 'WIN',       cls: 'win' },
        push:      { text: 'PUSH',      cls: 'push' },
        loss:      { text: 'LOSE',      cls: 'loss' },
        bust:      { text: 'BUST',      cls: 'loss' },
        surrender: { text: 'SURRENDER', cls: 'loss' },
    };

    class BlackjackView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.known   = new Set();       // card ids already on screen
            this.bet     = null;
            this.simple  = !!session.game.simple;   // 21: fewer controls, plainer words
        }

        mount() {
            this.root.innerHTML = `
                <div class="bj">
                    <section class="bj-dealer">
                        <div class="seat-head">
                            <span class="avatar">🎩</span>
                            <span class="name">Dealer</span>
                            <span class="total" id="bjDealerTotal"></span>
                        </div>
                        <div id="bjDealerHand" class="hand-wrap"></div>
                        <div class="bj-rule muted small" id="bjRule"></div>
                    </section>
                    <section class="bj-seats" id="bjSeats"></section>
                    <section class="bj-status" id="bjStatus"></section>
                    <section class="bj-actions" id="bjActions"></section>
                </div>`;
            this.$ = (id) => this.root.querySelector('#' + id);
            this.$('bjRule').textContent = this.simple
                ? `Single deck · Dealer draws to 17 · Exactly 21 pays 3:2`
                : `${this.engine.config.decks} decks · Dealer stands on 17 · Blackjack pays 3:2`;

            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange((events) => this.paint(events));
            this.paint([]);
        }

        unmount() { this.root.innerHTML = ''; }

        /* ---- painting ---------------------------------------------------- */

        paint(events) {
            const e = this.engine;
            this.paintDealer();
            this.paintSeats();
            this.paintStatus(events);
            this.paintActions();
            // Whatever is now on screen is known; the next paint animates only newcomers.
            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const bar = document.getElementById('tableShoe');
            if (bar) bar.textContent = `${e.shoe.remaining} cards`;
            const coins = document.getElementById('tableCoins');
            if (coins && e.youSeat >= 0) coins.textContent = fmt(e.seats[e.youSeat].coins);
        }

        cards(list, hidden) {
            return `<div class="hand">` + list.map((c, i) => CV.CardView.html(c, {
                faceDown: hidden && i === 1,
                fresh: c && !this.known.has(c.id),
            })).join('') + '</div>';
        }

        paintDealer() {
            const e = this.engine;
            const d = e.dealer;
            const hidden = !d.revealed;
            this.$('bjDealerHand').innerHTML = d.cards.length ? this.cards(d.cards, hidden) : '';
            const total = this.$('bjDealerTotal');
            if (!d.cards.length) total.textContent = '';
            else if (hidden) total.textContent = handValue([d.cards[0]]).total + ' + ?';
            else {
                const v = handValue(d.cards);
                total.textContent = v.total > 21 ? 'BUST' : (isBlackjack(d.cards) ? 'BLACKJACK' : v.total);
                total.classList.toggle('bad', v.total > 21);
            }
        }

        paintSeats() {
            const e = this.engine;
            const host = this.$('bjSeats');
            host.innerHTML = e.seats.map((s, i) => {
                const turn  = e.turn === i && !e.over && e.phase !== 'dealer';
                const cls = ['seat', s.isYou ? 'is-you' : '', s.isHuman && !s.isYou ? 'is-guest' : '', turn ? 'is-turn' : '', s.out ? 'is-out' : '']
                    .filter(Boolean).join(' ');
                const lvl = s.kind === 'ai' ? `<span class="tag">${CV.AI_LEVELS[s.level].icon} ${CV.AI_LEVELS[s.level].label}</span>` : '';
                const hands = s.hands.map((h, k) => this.handHtml(s, h, k, turn && s.active === k)).join('');
                return `
                    <div class="${cls}" data-seat="${i}">
                        <div class="seat-head">
                            <span class="avatar">${s.avatar}</span>
                            <div class="who">
                                <span class="name">${esc(s.name)}${s.isYou ? ' <em>(you)</em>' : ''}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span>
                            </div>
                            ${lvl}
                        </div>
                        <div class="seat-hands">
                            ${s.out ? '<div class="muted small">Sitting out</div>' : hands || '<div class="hand hand-empty"></div>'}
                        </div>
                    </div>`;
            }).join('');
        }

        handHtml(seat, h, k, active) {
            const v = handValue(h.cards);
            let total = '';
            if (h.cards.length) {
                if (v.total > 21) total = 'BUST';
                else if (isBlackjack(h.cards) && !h.split) total = this.simple ? '21' : 'BJ';
                else total = (v.soft && v.total !== 21 ? 'soft ' : '') + v.total;
            }
            const outcome = h.outcome && OUTCOME[h.outcome]
                ? `<span class="badge ${OUTCOME[h.outcome].cls}">${OUTCOME[h.outcome].text} ${signed(h.payout - h.bet)}</span>`
                : '';
            const tags = [h.doubled ? '2×' : '', h.split ? 'split' : ''].filter(Boolean).join(' · ');
            return `
                <div class="seat-hand${active ? ' is-active' : ''}${h.done && !h.outcome ? ' is-done' : ''}">
                    ${this.cards(h.cards, false)}
                    <div class="hand-meta">
                        <span class="total${v.total > 21 ? ' bad' : ''}">${total}</span>
                        <span class="bet">🪙 ${fmt(h.bet)}${tags ? ' <small>' + tags + '</small>' : ''}</span>
                        ${outcome}
                    </div>
                </div>`;
        }

        paintStatus(events) {
            const e = this.engine;
            const host = this.$('bjStatus');
            const seat = e.seats[e.turn];

            if (e.over) {
                const d = handValue(e.dealer.cards);
                host.innerHTML = `<span>${d.total > 21 ? 'Dealer busts.' : 'Dealer has ' + d.total + '.'}</span>`;
                return;
            }
            if (e.phase === 'dealer') { host.innerHTML = '<span>Dealer plays…</span>'; return; }
            if (!seat) { host.innerHTML = ''; return; }

            if (seat.isHuman) {
                const who = seat.isYou ? 'Your' : esc(seat.name) + '’s';
                const pass = seat.isYou ? '' : ' <small class="muted">— pass the device</small>';
                if (e.phase === 'betting')   host.innerHTML = `<span class="you">${who} bet${pass}</span>`;
                else if (e.phase === 'insurance') host.innerHTML = `<span class="you">Dealer shows an ace. ${who} call: insurance?${pass}</span>`;
                else {
                    const n = seat.hands.length > 1 ? ` — hand ${seat.active + 1} of ${seat.hands.length}` : '';
                    host.innerHTML = `<span class="you">${who} turn${n}${pass}</span>`;
                }
            } else {
                const verb = e.phase === 'betting' ? 'is betting' : e.phase === 'insurance' ? 'is deciding on insurance' : 'is thinking';
                host.innerHTML = `<span class="muted">${seat.avatar} ${esc(seat.name)} ${verb}…</span>`;
            }
        }

        paintActions() {
            const e = this.engine;
            const host = this.$('bjActions');
            const seat = e.seats[e.turn];

            if (e.over || !seat || !seat.isHuman) { host.innerHTML = ''; return; }
            const options = e.legalActions(e.turn);
            if (!options.length) { host.innerHTML = ''; return; }

            if (e.phase === 'betting') return this.paintBet(host, options[0], seat);

            const hint = this.hint(seat);
            host.innerHTML = `
                ${hint ? `<div class="bj-hint muted small">Book says: <b>${hint}</b></div>` : ''}
                <div class="btn-row">
                    ${options.map((o) => `<button class="btn act-${o.type}" data-act="${o.type}">${o.label}${o.hint ? ` <small>${o.hint}</small>` : ''}</button>`).join('')}
                </div>`;
        }

        paintBet(host, opt, seat) {
            if (this.bet === null || this.bet < opt.min || this.bet > opt.max) {
                this.bet = Math.min(opt.max, Math.max(opt.min, this.session.lastBet || opt.min));
            }
            const chips = [opt.min, opt.min * 2, opt.min * 5, opt.max].filter((v, i, a) => v <= opt.max && a.indexOf(v) === i);
            host.innerHTML = `
                <div class="bet-box">
                    <div class="bet-amount">🪙 <b id="bjBetAmt">${fmt(this.bet)}</b> <small class="muted">of ${fmt(seat.coins)}</small></div>
                    <input type="range" id="bjBetRange" min="${opt.min}" max="${opt.max}" step="5" value="${this.bet}">
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip" data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="bet">Deal</button>
                    </div>
                    <div class="muted small">Table ${fmt(opt.min)}–${fmt(opt.max)}</div>
                </div>`;
            const range = this.$('bjBetRange');
            range.addEventListener('input', () => {
                this.bet = Number(range.value);
                this.$('bjBetAmt').textContent = fmt(this.bet);
            });
        }

        /** What the strongest AI would do with this hand — a teaching aid, on by default. */
        hint(seat) {
            if (!CV.Settings.get().hints || !this.table.ai || this.engine.phase !== 'playing') return '';
            const h = this.engine.hand(seat.index);
            const can = (t) => this.engine.legalActions(seat.index).some((o) => o.type === t);
            const up  = CV.Cards.pipValue(this.engine.dealerUp());
            const t = this.table.ai.book(h, up, can, 'expert');
            return can(t) ? t[0].toUpperCase() + t.slice(1) : '';
        }

        /* ---- input ------------------------------------------------------- */

        act(el) {
            const e = this.engine;
            const type = el.dataset.act;
            if (type === 'chip') {
                const range = this.$('bjBetRange');
                this.bet = Math.min(Number(range.max), Math.max(Number(range.min), Number(el.dataset.v)));
                range.value = this.bet;
                this.$('bjBetAmt').textContent = fmt(this.bet);
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

    CV.BlackjackView = BlackjackView;
})();
