/**
 * CardVerse — 射龙门 (Dragon Gate).
 *
 * Two cards set a gate; a third must land strictly inside it. Rank only —
 * suits are irrelevant, and the ace is always **1**, never 14. Nothing here
 * borrows from any other game in the hub: no blackjack totals, no baccarat
 * scoring, no poker hands.
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
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;

    /** Ace is low and always 1. Everything else is its face value; J/Q/K are 11/12/13. */
    const rank = (card) => (card.r === 14 ? 1 : card.r);

    const MIN_CARDS = 3;

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

            this.gate    = null;   // { low, high, equal, lowCard, highCard }
            this.pick    = null;   // 'higher' | 'lower' for an equal gate
            this.third   = null;
            this.odds    = null;   // { winners, remaining, mult }
            this.outcome = null;   // 'gate' | 'post' | 'outside'
            this.cached  = null;

            const s = this.seats[0];
            s.startCoins = s.coins;
            s.net = 0;
            s.bet = 0;
            s.payout = 0;
            s.out = s.coins < this.minBet;
        }

        get seat() { return this.seats[0]; }
        get shoeState() { return this.deck.snapshot(); }

        /* ---- phases ------------------------------------------------------- */

        start() {
            // A dealt card cannot return until the pack is rebuilt, so top it
            // up when there is not enough left to run a round.
            if (this.deck.remaining < MIN_CARDS) {
                this.deck.reset();
                this.emit('shuffle');
            }
            this.round = 1;
            this.phase = 'betting';
            this.turn  = 0;
            if (this.seat.out) { this.over = true; this.phase = 'over'; return; }
            this.emit('betting', { seat: 0 });
        }

        legalActions(seat) {
            if (this.over || seat !== 0) return [];
            const s = this.seat;

            if (this.phase === 'betting') {
                const max = Math.min(this.maxBet, s.coins);
                if (max < this.minBet) return [];
                return [{ type: 'bet', min: this.minBet, max, label: t('act.bet') }];
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
            if (action.type === 'bet')  return this.doBet(action.amount);
            if (action.type === 'pick') return this.doPick(action.dir);
            return false;
        }

        /* ---- the round ----------------------------------------------------- */

        doBet(amount) {
            const s = this.seat;
            const bet = Math.round(amount);
            s.bet    = bet;
            s.coins -= bet;
            s.net   -= bet;
            this.emit('bet', { seat: 0, amount: bet });
            this.openGate();
            return true;
        }

        /** Draw the two posts. Order does not matter — low and high are sorted. */
        openGate() {
            const a = this.deck.draw();
            const b = this.deck.draw();
            const ra = rank(a), rb = rank(b);

            this.gate = {
                low:  Math.min(ra, rb),
                high: Math.max(ra, rb),
                equal: ra === rb,
                cards: [a, b],
            };
            this.emit('gate', { cards: [a, b], low: this.gate.low, high: this.gate.high, equal: this.gate.equal });

            if (this.gate.equal) {
                this.phase = 'choose';
                this.emit('choose', { rank: this.gate.low });
                return;
            }
            this.settleOdds();
            this.drawThird();
        }

        doPick(dir) {
            this.pick = dir;
            this.emit('pick', { dir });
            this.settleOdds();
            this.drawThird();
            return true;
        }

        /**
         * Would this rank win, given the gate and any 大过/小过 choice?
         * Equal to a post is never a win — that is 压线.
         */
        wins(r) {
            const g = this.gate;
            if (g.equal) {
                if (this.pick === 'higher') return r > g.low;
                if (this.pick === 'lower')  return r < g.low;
                return false;
            }
            return r > g.low && r < g.high;
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
        settleOdds() {
            const remaining = this.deck.remaining;
            const winners = this.deck.cards.filter((c) => this.wins(rank(c))).length;
            const p = remaining ? winners / remaining : 0;
            const mult = p > 0 ? Math.round((1 / p) * (1 - this.config.edge) * 100) / 100 : 0;
            this.odds = { winners, remaining, mult };
            this.emit('odds', this.odds);
        }

        drawThird() {
            this.phase = 'reveal';
            const card = this.deck.draw();
            this.third = card;
            const r = rank(card);
            const g = this.gate;

            // 压线 — level with a post. Always a loss, in both kinds of gate.
            const onPost = g.equal ? (r === g.low) : (r === g.low || r === g.high);

            this.outcome = this.wins(r) ? 'gate' : (onPost ? 'post' : 'outside');
            this.emit('third', { card, rank: r, outcome: this.outcome });
            this.settle();
        }

        settle() {
            const s = this.seat;
            const won = this.outcome === 'gate';
            s.payout = won ? Math.round(s.bet * this.odds.mult) : 0;
            s.coins += s.payout;
            s.net   += s.payout;
            this.emit('result', { outcome: this.outcome, payout: s.payout });
            this.finish();
        }

        /* ---- result --------------------------------------------------------- */

        result() {
            if (this.cached) return this.cached;
            const s = this.seat;
            const g = this.gate || { low: 0, high: 0, equal: false, cards: [] };
            const won = this.outcome === 'gate';
            const detail = g.equal
                ? t('dg.detailEqual', {
                    rank: this.rankName(g.low),
                    dir: t(this.pick === 'higher' ? 'dg.higher' : 'dg.lower'),
                })
                : t('dg.detail', { lo: this.rankName(g.low), hi: this.rankName(g.high) });

            const rows = [{
                seat: 0,
                name: s.name,
                coins: s.net,
                stake: s.bet,
                score: won ? Math.round((this.odds ? this.odds.mult : 0) * 100) : 0,
                ratio: s.bet ? Math.round((s.net / s.bet) * 1000) / 1000 : 0,
                outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                note: t('dg.' + this.outcome),
                hands: [{
                    cards: g.cards.concat(this.third ? [this.third] : []),
                    bet: s.bet, payout: s.payout,
                    outcome: this.outcome,
                    // Rank is not a score here — the cards say what happened,
                    // and a number beside them only reads as points.
                    total: null,
                }],
                extra: {
                    dgRounds: 1,
                    dgWins: won ? 1 : 0,
                    dgPosts: this.outcome === 'post' ? 1 : 0,
                    dgEqual: g.equal ? 1 : 0,
                    dgShut: (this.odds && this.odds.winners === 0) ? 1 : 0,
                    forfeits: 0,
                },
            }];

            // The gate itself sits in the table at a return of zero, the same
            // way the dealer does elsewhere. Without it a solo player who has
            // just lost is still handed first place and a gold medal.
            rows.push({
                seat: -1, name: t('dg.house'), house: true,
                coins: -s.net, ratio: 0, score: 0, outcome: 'house',
                note: (this.odds && this.odds.winners === 0) ? t('dg.shut') : detail,
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
            return Object.assign(super.snapshot(), {
                gate: this.gate, pick: this.pick, third: this.third,
                odds: this.odds, outcome: this.outcome,
                shoeRemaining: this.deck.remaining,
            });
        }
    }

    CV.DragonGateEngine = DragonGateEngine;
    CV.DragonGateRank   = rank;
})();
