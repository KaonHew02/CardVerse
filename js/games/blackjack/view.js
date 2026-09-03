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

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { handValue, isBlackjack } = CV.Cards;
    const { esc, fmt, signed } = CV.UI;

    /** Badge on a finished hand. The word comes from the pack; only the tone is local. */
    const OUTCOME = {
        blackjack: { key: 'out.blackjack', cls: 'win' },
        twentyone: { key: 'out.twentyone', cls: 'win' },
        win:       { key: 'out.win',       cls: 'win' },
        push:      { key: 'out.push',      cls: 'push' },
        loss:      { key: 'out.loss',      cls: 'loss' },
        bust:      { key: 'out.bust',      cls: 'loss' },
        surrender: { key: 'out.surrender', cls: 'loss' },
    };

    class BlackjackView {
        constructor(root, table, session) {
            this.root    = root;
            this.table   = table;
            this.engine  = table.engine;
            this.session = session;
            this.known   = new Set();       // card ids already on screen
            this.bet     = null;
            // The engine draws the dealer's whole hand in one synchronous
            // loop, so without this the cards all appear at once and the
            // round is over before anyone can read it. The view holds them
            // back and turns them one at a time.
            this.shownDealer = 0;
            this.revealTimer = null;
            this.simple  = !!session.game.simple;   // 21: fewer controls, plainer words
        }

        mount() {
            this.root.innerHTML = `
                <div class="bj">
                    <section class="bj-dealer">
                        <div class="seat-head">
                            <span class="avatar">🎩</span>
                            <span class="name">${esc(t('table.dealer'))}</span>
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
                ? t('table.rulesSimple')
                : t('table.rules', { decks: this.engine.config.decks });

            CV.UI.on(this.root, '[data-act]', (el) => this.act(el));
            this.table.onChange((events) => this.paint(events));
            this.paint([]);
        }

        unmount() {
            clearTimeout(this.revealTimer);
            this.revealTimer = null;
            this.root.innerHTML = '';
        }

        /** True while dealer cards are still being turned over. */
        get revealing() {
            const d = this.engine.dealer;
            return !!d.revealed && this.shownDealer < (d.cards || []).filter(Boolean).length;
        }

        scheduleReveal() {
            if (this.revealTimer) return;
            this.revealTimer = setTimeout(() => {
                this.revealTimer = null;
                this.shownDealer++;
                this.paint([]);
            }, 620 * (this.table.speed || 1));
        }

        /* ---- painting ---------------------------------------------------- */

        paint(events) {
            const e = this.engine;
            this.paintDealer();
            this.paintSeats();
            this.paintStatus(events);
            this.paintActions();
            this.followTurn();
            // Whatever is now on screen is known; the next paint animates only newcomers.
            this.root.querySelectorAll('.card[data-id]').forEach((c) => this.known.add(c.dataset.id));
            const bar = document.getElementById('tableShoe');
            if (bar) bar.textContent = t('table.cards', { n: e.shoe.remaining });
            const coins = document.getElementById('tableCoins');
            if (coins && e.youSeat >= 0) coins.textContent = fmt(e.seats[e.youSeat].coins);
        }

        /**
         * On a phone the action bar is pinned to the bottom, but the cards it
         * refers to can be several seats up the page. Bring the seat whose
         * turn it is into view — once per turn, not on every repaint, or the
         * page fights the player every time a card lands.
         */
        followTurn() {
            const e = this.engine;
            const seat = e.seats[e.turn];
            const key = `${e.phase}:${e.turn}:${seat ? seat.active : ''}`;
            if (key === this.lastFollow) return;
            this.lastFollow = key;
            if (window.innerWidth > 720 || e.over || !seat || !seat.isHuman) return;
            const el = this.root.querySelector('.seat.is-turn');
            if (!el) return;
            const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
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
            // A remote view is JSON off a wire: filter before measuring, so a
            // malformed hand degrades to a blank dealer rather than a crash
            // that takes the whole table down.
            const all = (d.cards || []).filter(Boolean);

            // Face-down, everything the engine has is the two dealt cards and
            // the second is drawn as a back. Face-up, the hand grows a card at
            // a time from those two, so the total visibly climbs to 17 the way
            // it does at a real table.
            let cards;
            if (hidden) {
                this.shownDealer = 0;
                cards = all;
            } else {
                if (this.shownDealer < 2) this.shownDealer = Math.min(2, all.length);
                cards = all.slice(0, this.shownDealer);
                if (this.shownDealer < all.length) this.scheduleReveal();
            }

            this.$('bjDealerHand').innerHTML = cards.length ? this.cards(cards, hidden) : '';
            const total = this.$('bjDealerTotal');
            if (!cards.length) total.textContent = '';
            else if (hidden) total.textContent = handValue([cards[0]]).total + ' + ?';
            else {
                const v = handValue(cards);
                total.textContent = v.total > 21 ? 'BUST' : (isBlackjack(cards) ? 'BLACKJACK' : v.total);
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
                                <span class="name">${esc(s.name)}${s.isYou ? ` <em>(${esc(t('you'))})</em>` : ''}</span>
                                <span class="coins">🪙 ${fmt(s.coins)}</span>
                            </div>
                            ${lvl}
                        </div>
                        <div class="seat-hands">
                            ${s.out ? `<div class="muted small">${esc(t('table.sittingOut'))}</div>` : hands || '<div class="hand hand-empty"></div>'}
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
                ? `<span class="badge ${OUTCOME[h.outcome].cls}">${esc(t(OUTCOME[h.outcome].key))} ${signed(h.payout - h.bet)}</span>`
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

            if (this.revealing) { host.innerHTML = `<span>${esc(t('table.dealerDraws'))}</span>`; return; }
            if (e.over) {
                const d = handValue((e.dealer.cards || []).filter(Boolean));
                host.innerHTML = `<span>${esc(d.total > 21 ? t('table.dealerBusts') : t('table.dealerHas', { n: d.total }))}</span>`;
                return;
            }
            if (e.phase === 'dealer') { host.innerHTML = `<span>${esc(t('table.dealerPlays'))}</span>`; return; }
            if (!seat) { host.innerHTML = ''; return; }

            if (seat.isHuman) {
                const mine = seat.isYou;
                const who = mine ? '' : esc(seat.name);
                // A guest at an online table is another person, not someone to
                // hand the phone to — that prompt belongs to pass-and-play only.
                const pass = (!mine && !CV.Room.active)
                    ? `<small class="muted">${esc(t('table.passDevice'))}</small>` : '';
                let line;
                if (e.phase === 'betting') {
                    line = mine ? t('table.yourBet') : t('table.someoneBet', { who });
                } else if (e.phase === 'insurance') {
                    line = t('table.insuranceAsk', { who: mine ? t('you') : who });
                } else {
                    const n = seat.hands.length > 1
                        ? t('table.handOf', { n: seat.active + 1, total: seat.hands.length }) : '';
                    line = (mine ? t('table.yourTurn') : t('table.someoneTurn', { who })) + n;
                }
                host.innerHTML = `<span class="you">${esc(line)}${pass}</span>`;
            } else {
                const key = e.phase === 'betting' ? 'table.betting'
                    : e.phase === 'insurance' ? 'table.insuring' : 'table.thinking';
                host.innerHTML = `<span class="muted">${seat.avatar} ${esc(t(key, { name: seat.name }))}</span>`;
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
                ${hint ? `<div class="bj-hint muted small">${esc(t('table.bookLabel'))} <b>${esc(hint)}</b></div>` : ''}
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
                    <div class="bet-amount">🪙 <b id="bjBetAmt">${fmt(this.bet)}</b> <small class="muted">${esc(t('table.ofCoins', { n: fmt(seat.coins) }))}</small></div>
                    <input type="range" id="bjBetRange" min="${opt.min}" max="${opt.max}" step="5" value="${this.bet}">
                    <div class="btn-row chips">
                        ${chips.map((v) => `<button class="chip" data-act="chip" data-v="${v}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="btn-row">
                        <button class="btn primary big" data-act="bet">${esc(t('table.deal'))}</button>
                    </div>
                    <div class="muted small">${esc(t('table.range', { lo: fmt(opt.min), hi: fmt(opt.max) }))}</div>
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
            const move = this.table.ai.book(h, up, can, 'expert');
            return can(move) ? t('act.' + move) : '';
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
