/**
 * CardVerse — 射龙门 (Dragon Gate).
 *
 * Two cards set a gate; a third must land strictly inside it. Rank only —
 * suits are irrelevant, and the ace is always **1**, never 14. Nothing here
 * borrows from any other game in the hub: no blackjack totals, no baccarat
 * scoring, no poker hands.
 *
 * **The gate is dealt before the stake.** A seat's turn opens with its two
 * posts already face up and priced, and only then is it asked for money. That
 * ordering is the game: you are looking at the gate, and at what it pays,
 * when you decide whether to shoot it — or to pass and let it go. Staking
 * blind and then being shown an adjacent gate that no card can pass is not a
 * decision, it is a collection.
 *
 * Passing costs nothing. The two posts are spent either way, because they
 * came off the pack.
 *
 * The two rules that are easy to get wrong, and are therefore written out:
 *
 *  - **Equal gate cards are not an automatic loss.** They put the choice to
 *    the player: 大过 (higher) or 小过 (lower). Only then is the third card
 *    drawn.
 *  - **A card equal to a gate post loses.** 压线. Strictly between, strictly
 *    above, strictly below — never equal.
 *
 * An adjacent gate (7 and 8) has nothing strictly between it, so no third
 * card can win. The round still runs its normal course, and the view says so
 * plainly rather than letting it look like a fault.
 *
 * **The deck is not reshuffled between rounds.** A card that has been dealt
 * cannot come back until the deck runs down and is rebuilt, so the odds move
 * as the shoe depletes — which is why the payout is computed from the cards
 * actually left rather than from a fixed table.
 *
 * **A table takes turns, and every gate belongs to one player.** Seats shoot
 * one after another: a seat stakes, its own two posts come off the pack, it
 * calls 大过/小过 if they match, and its third card lands. Then the next seat.
 * Nobody shares a gate and nobody bets on anybody else's shot — 射龙门 is a
 * shot at the pot, so a shared gate would be a different game.
 *
 * The pack is shared, though, and that is the whole point of a table: the
 * posts the third player draws are drawn from what the first two left.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;

    /** Ace is low and always 1. Everything else is its face value; J/Q/K are 11/12/13. */
    const rank = (card) => (card.r === 14 ? 1 : card.r);

    const MIN_CARDS = 3;

    /**
     * Does a card of rank `r` pass this gate?
     *
     * The one rule with the most room to go quietly wrong, so it lives in one
     * place and every price, every quote and every settlement calls it.
     * Strictly between, strictly above, strictly below — never equal, because
     * level with a post is 压线 and loses.
     */
    function passes(r, gate, pick) {
        if (gate.equal) {
            if (pick === 'higher') return r > gate.low;
            if (pick === 'lower')  return r < gate.low;
            return false;
        }
        return r > gate.low && r < gate.high;
    }

    class DragonGateEngine extends CV.GameEngine {

        static get publicConfig() { return ['room', 'decks', 'edge']; }

        static get defaults() {
            return {
                room: 'beginner',
                decks: 1,          // one standard 52-card pack, no jokers
                // The house's slice of a fair price. The payout itself is
                // derived from the gate, not from a fixed table — see odds().
                edge: 0.05,
                shoe: null,
            };
        }

        constructor(opts) {
            super(opts);
            const room  = CV.Registry.room(this.config.room);
            this.minBet = room.bet[0];
            this.maxBet = room.bet[1];

            this.deck = new Deck(this.rng, { decks: this.config.decks });
            if (this.config.shoe) this.deck.restore(this.config.shoe);
            else this.deck.shuffle();

            this.cached = null;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net     = 0;
                s.bet     = 0;
                s.payout  = 0;
                s.gate    = null;   // { low, high, equal, cards }
                s.quote   = null;   // the price before anybody has staked
                s.pick    = null;   // 'higher' | 'lower', for an equal gate
                s.third   = null;
                s.odds    = null;   // { winners, remaining, mult }
                s.outcome = null;   // 'gate' | 'post' | 'outside' | 'passed'
                s.skipped = false;
                s.done    = false;
                s.out     = s.coins < this.minBet;
            }
        }

        /** The seat taking its shot. Every gate on the table belongs to one. */
        get shooter() { return this.seats[this.turn] || null; }

        /** Your chair, which is not the same thing as whose turn it is. */
        get seat() { return this.seats[this.youSeat] || this.seats[0]; }

        // The round reads from whoever is shooting. These keep the table and
        // the recap talking about one gate at a time without either of them
        // having to know which seat it belongs to.
        get gate()    { return this.shooter ? this.shooter.gate : null; }
        get quote()   { return this.shooter ? this.shooter.quote : null; }
        get pick()    { return this.shooter ? this.shooter.pick : null; }
        get third()   { return this.shooter ? this.shooter.third : null; }
        get odds()    { return this.shooter ? this.shooter.odds : null; }
        get outcome() { return this.shooter ? this.shooter.outcome : null; }

        get shoeState() { return this.deck.snapshot(); }

        /* ---- phases ------------------------------------------------------- */

        start() {
            this.round = 1;
            const first = this.seats.findIndex((s) => !s.out);
            if (first < 0) { this.over = true; this.phase = 'over'; return; }
            this.turn = first;
            this.beginTurn();
        }

        /** A seat's turn opens with its posts already down and priced. */
        beginTurn() {
            this.topUp();
            this.phase = 'offer';
            this.openGate();
        }

        /**
         * A dealt card cannot return until the pack is rebuilt, so top it up
         * whenever there is not enough left for the seat about to shoot.
         */
        topUp() {
            if (this.deck.remaining < MIN_CARDS) {
                this.deck.reset();
                this.emit('shuffle');
            }
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];
            const s = this.seats[seat];
            if (!s || s.out || s.done) return [];

            if (this.phase === 'offer') {
                const out = [];
                const max = Math.min(this.maxBet, s.coins);
                if (max >= this.minBet) {
                    out.push({ type: 'bet', min: this.minBet, max, label: t('dg.open') });
                }
                // Passing is always on the table. A gate no card can pass, or
                // one a seat simply does not fancy, is theirs to let go.
                out.push({ type: 'skip', label: t('dg.skip') });
                return out;
            }

            // An equal gate hands the decision to the player. It is never
            // resolved for them, and never treated as a loss on its own.
            if (this.phase === 'choose') {
                return [
                    { type: 'pick', dir: 'higher', label: t('dg.higher') },
                    { type: 'pick', dir: 'lower',  label: t('dg.lower') },
                ];
            }
            return [];
        }

        handle(action) {
            // Only the seat whose shot it is may act on this gate.
            if (action.seat !== undefined && action.seat !== this.turn) return false;
            if (action.type === 'bet')  return this.doBet(action.amount);
            if (action.type === 'skip') return this.doSkip();
            if (action.type === 'pick') return this.doPick(action.dir);
            return false;
        }

        /* ---- the round ----------------------------------------------------- */

        doBet(amount) {
            if (this.phase !== 'offer') return false;
            const s = this.shooter;
            const bet = Math.max(this.minBet,
                Math.min(Math.round(amount), Math.min(this.maxBet, s.coins)));
            s.bet    = bet;
            s.coins -= bet;
            s.net   -= bet;
            this.emit('bet', { seat: this.turn, amount: bet });

            // An equal gate hands the decision to the seat before the price
            // can be fixed, because the two calls are not worth the same.
            if (s.gate.equal) {
                this.phase = 'choose';
                this.emit('choose', { seat: this.turn, rank: s.gate.low });
                return true;
            }
            this.settleOdds();
            this.drawThird();
            return true;
        }

        /** Let the gate go. It costs nothing and pays nothing. */
        doSkip() {
            if (this.phase !== 'offer') return false;
            const s = this.shooter;
            s.skipped = true;
            s.outcome = 'passed';
            s.done    = true;
            this.emit('skip', { seat: this.turn });
            this.nextShooter();
            return true;
        }

        /** Draw the two posts. Order does not matter — low and high are sorted. */
        openGate() {
            const s = this.shooter;
            const a = this.deck.draw();
            const b = this.deck.draw();
            const ra = rank(a), rb = rank(b);

            s.gate = {
                low:  Math.min(ra, rb),
                high: Math.max(ra, rb),
                equal: ra === rb,
                cards: [a, b],
            };
            // Priced now, before a stake exists. Nothing else comes off the
            // pack until the third card, so this quote is the real price and
            // not an estimate the settlement can quietly disagree with.
            s.quote = this.quoteFor(s);
            this.emit('gate', {
                seat: this.turn, cards: [a, b], quote: s.quote,
                low: s.gate.low, high: s.gate.high, equal: s.gate.equal,
            });
        }

        /**
         * What this gate is worth before anybody has staked anything.
         *
         * An ordinary gate has one price. An equal gate has two — one for
         * 大过 and one for 小过 — and both are quoted, because a seat cannot
         * judge whether to play without seeing what either call is worth.
         */
        quoteFor(s) {
            if (!s.gate.equal) return { one: this.priceFor(s.gate, null) };
            return {
                higher: this.priceFor(s.gate, 'higher'),
                lower:  this.priceFor(s.gate, 'lower'),
            };
        }

        /** The fair inverse of the true chance, less the house's edge. */
        priceFor(gate, pick) {
            const remaining = this.deck.remaining;
            const winners = this.deck.cards.filter((c) => passes(rank(c), gate, pick)).length;
            const p = remaining ? winners / remaining : 0;
            const mult = p > 0 ? Math.round((1 / p) * (1 - this.config.edge) * 100) / 100 : 0;
            return { winners, remaining, mult };
        }

        doPick(dir) {
            this.shooter.pick = dir;
            this.emit('pick', { seat: this.turn, dir });
            this.settleOdds();
            this.drawThird();
            return true;
        }

        /**
         * Would this rank win, given the gate and any 大过/小过 choice?
         * Equal to a post is never a win — that is 压线.
         */
        wins(r, seat) {
            const s = seat || this.shooter;
            return passes(r, s.gate, s.pick);
        }

        /**
         * Price the gate from the cards actually left in the pack.
         *
         * A fixed paytable would be wrong twice over: it would misprice a
         * narrow gate against a wide one, and it would ignore that the pack
         * depletes. `winners / remaining` is the true chance at this moment,
         * and the payout is its fair inverse less the house's edge.
         *
         * An adjacent or otherwise impossible gate has no winners at all. The
         * round still plays out — the rules say the third card loses — and the
         * multiplier is zero so nothing pretends otherwise.
         */
        /**
         * Fix the price the seat is actually being paid at.
         *
         * It re-derives rather than reading the quote back, so that if the
         * two ever disagreed the settlement would still be the honest number
         * — and the audit compares them.
         */
        settleOdds() {
            const s = this.shooter;
            s.odds = this.priceFor(s.gate, s.gate.equal ? s.pick : null);
            this.emit('odds', Object.assign({ seat: this.turn }, s.odds));
        }

        drawThird() {
            this.phase = 'reveal';
            const s = this.shooter;
            const card = this.deck.draw();
            s.third = card;
            const r = rank(card);
            const g = s.gate;

            // 压线 — level with a post. Always a loss, in both kinds of gate.
            const onPost = g.equal ? (r === g.low) : (r === g.low || r === g.high);

            s.outcome = this.wins(r, s) ? 'gate' : (onPost ? 'post' : 'outside');
            this.emit('third', { seat: this.turn, card, rank: r, outcome: s.outcome });
            this.settle();
        }

        settle() {
            const s = this.shooter;
            const won = s.outcome === 'gate';
            s.payout = won ? Math.round(s.bet * s.odds.mult) : 0;
            s.coins += s.payout;
            s.net   += s.payout;
            s.done   = true;
            this.emit('result', { seat: this.turn, outcome: s.outcome, payout: s.payout });
            this.nextShooter();
        }

        /**
         * Hand the pack to the next seat. Nobody shoots twice and nobody
         * shoots out of turn; when the last chair has had its gate the round
         * is finished and everybody is compared at once.
         */
        nextShooter() {
            const next = this.seats.findIndex((s, i) => i > this.turn && !s.out && !s.done);
            if (next < 0) { this.phase = 'over'; this.finish(); return; }
            this.turn = next;
            this.beginTurn();
        }

        /* ---- result --------------------------------------------------------- */

        result() {
            if (this.cached) return this.cached;

            /** How one seat's gate reads in words. */
            const say = (s) => {
                const g = s.gate;
                if (!g) return '';
                return g.equal
                    ? t('dg.detailEqual', {
                        rank: this.rankName(g.low),
                        dir: t(s.pick === 'higher' ? 'dg.higher' : 'dg.lower'),
                    })
                    : t('dg.detail', { lo: this.rankName(g.low), hi: this.rankName(g.high) });
            };

            const played = this.seats.filter((s) => s.done);
            const rows = played.map((s) => {
                const g = s.gate || { low: 0, high: 0, equal: false, cards: [] };
                const won = s.outcome === 'gate';
                // A gate that was let go could not have been shut out — the
                // seat never found out, and the tally must not claim it did.
                const shut = !s.skipped && s.odds && s.odds.winners === 0;
                return {
                    seat: s.index,
                    name: s.name,
                    coins: s.net,
                    stake: s.bet,
                    score: won ? Math.round((s.odds ? s.odds.mult : 0) * 100) : 0,
                    ratio: s.bet ? Math.round((s.net / s.bet) * 1000) / 1000 : 0,
                    outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                    note: t('dg.' + s.outcome),
                    hands: [{
                        cards: g.cards.concat(s.third ? [s.third] : []),
                        bet: s.bet, payout: s.payout,
                        outcome: s.outcome,
                        // Rank is not a score here — the cards say what happened,
                        // and a number beside them only reads as points.
                        total: null,
                    }],
                    extra: {
                        dgRounds: s.skipped ? 0 : 1,
                        dgWins: won ? 1 : 0,
                        dgPosts: s.outcome === 'post' ? 1 : 0,
                        dgEqual: (g.equal && !s.skipped) ? 1 : 0,
                        dgShut: shut ? 1 : 0,
                        dgSkips: s.skipped ? 1 : 0,
                        forfeits: 0,
                    },
                };
            });

            // The recap headline is your own gate when you played one — it is
            // your round being described — and the last one otherwise.
            const mine = played.find((s) => s.isYou) || played[played.length - 1] || null;
            const detail = mine ? (mine.skipped ? t('dg.passed') : say(mine)) : '';

            // The gates sit in the table at a return of zero, the same way the
            // dealer does elsewhere. Without that row a solo player who has
            // just lost is still handed first place and a gold medal.
            const pot = rows.reduce((n, r) => n + r.coins, 0);
            rows.push({
                seat: -1, name: t('dg.house'), house: true,
                coins: -pot, ratio: 0, score: 0, outcome: 'house',
                note: (mine && mine.odds && mine.odds.winners === 0) ? t('dg.shut') : detail,
                extra: {},
            });

            rows.sort((a, b) => b.ratio - a.ratio || b.coins - a.coins);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { place = idx + 1; last = r.ratio; } r.rank = place; });

            this.cached = new CV.GameResult({ ranks: rows, detail });
            return this.cached;
        }

        /** 1 prints as A, 11-13 as J/Q/K — the same names the cards carry. */
        rankName(r) {
            return r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);
        }

        snapshot() {
            // Only the gate on the table right now. The pack itself is never
            // put on the wire — see the broadcast audit in tools/smoke.js.
            return Object.assign(super.snapshot(), {
                gate: this.gate, pick: this.pick, third: this.third,
                odds: this.odds, quote: this.quote, outcome: this.outcome,
                shooter: this.turn,
                shoeRemaining: this.deck.remaining,
            });
        }
    }

    CV.DragonGateEngine = DragonGateEngine;
    CV.DragonGateRank   = rank;
})();
