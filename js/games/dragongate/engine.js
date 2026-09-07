/**
 * CardVerse — 射龙门 (Dragon Gate).
 *
 * Two cards set a gate; a third must land strictly inside it. Rank only —
 * suits are irrelevant, and the ace is always **1**, never 14. Nothing here
 * borrows from any other game in the hub: no blackjack totals, no baccarat
 * scoring, no poker hands.
 *
 * **The money is a pot in the middle, not a house.** Everybody puts an ante
 * in, and from then on the table shoots at that pile: a seat that gets its
 * card through the gate takes what it called out of the pot, a seat that
 * misses pays that much *in*, and a seat that lands level with a post — 撞柱,
 * *tiang* — pays double. So the pile shrinks when the table is running well
 * and grows when it is not, which is the whole game. Nobody plays against the
 * house here, because there is no house: every coin in the middle was put
 * there by somebody at the table.
 *
 * **A hand is one lap of the table, and the pot carries between hands.** That
 * is what makes 越叠越高 real — the pile you are shooting at on the third hand
 * is the one the first two hands failed to empty. A fresh ante is only taken
 * when the pot is actually empty, which is to say when somebody has just
 * cleared it. Emptying it ends the hand there and then.
 *
 * **The gate is dealt before the stake.** A seat's turn opens with its two
 * posts already face up, and only then is it asked for money. That ordering
 * is the game: you are looking at the gate, and at how much is in the middle,
 * when you decide whether to shoot it — or to pass and let it go.
 *
 * Passing costs nothing. The two posts are spent either way, because they
 * came off the pack.
 *
 * The two rules that are easy to get wrong, and are therefore written out:
 *
 *  - **Equal gate cards are not an automatic loss.** They put the choice to
 *    the player: 大过 (higher) or 小过 (lower). Only then is the third card
 *    drawn.
 *  - **A card equal to a gate post loses double.** 撞柱. Strictly between,
 *    strictly above, strictly below — never equal.
 *
 * An adjacent gate (7 and 8) has nothing strictly between it, so no third
 * card can win. The round still runs its normal course, and the view says so
 * plainly rather than letting it look like a fault.
 *
 * **The deck is not reshuffled between rounds.** A card that has been dealt
 * cannot come back until the deck runs down and is rebuilt, so the chance of
 * getting through a gate moves as the shoe depletes — which is why the quote
 * is computed from the cards actually left rather than from a fixed table.
 * It is a quote and not a price: what a winning shot pays is what the seat
 * called, because that is what comes out of the pot.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;

    /** Ace is low and always 1. Everything else is its face value; J/Q/K are 11/12/13. */
    const rank = (card) => (card.r === 14 ? 1 : card.r);

    const MIN_CARDS = 3;

    /** What 撞柱 costs, as a multiple of what was called. */
    const POST_PENALTY = 2;

    /**
     * Does a card of rank `r` pass this gate?
     *
     * The one rule with the most room to go quietly wrong, so it lives in one
     * place and every quote and every settlement calls it. Strictly between,
     * strictly above, strictly below — never equal, because level with a post
     * is 撞柱 and pays double into the middle.
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

        static get publicConfig() { return ['room', 'decks', 'postPenalty']; }

        static get defaults() {
            return {
                room: 'beginner',
                decks: 1,          // one standard 52-card pack, no jokers
                postPenalty: POST_PENALTY,
                shoe: null,        // { deck, pot } — carried between hands
            };
        }

        constructor(opts) {
            super(opts);
            const room  = CV.Registry.room(this.config.room);
            this.minBet = room.bet[0];
            this.maxBet = room.bet[1];
            this.ante   = room.bet[0];

            const carry = this.config.shoe || null;
            this.deck = new Deck(this.rng, { decks: this.config.decks });
            if (carry && carry.deck) this.deck.restore(carry.deck);
            else this.deck.shuffle();

            // What was left in the middle when the last hand at this table
            // finished. A fresh table starts at nothing and antes.
            this.pot     = (carry && carry.pot) || 0;
            this.anted   = 0;
            this.cleared = false;    // did this hand empty the pot?
            this.cached  = null;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net     = 0;
                s.ante    = 0;
                s.bet     = 0;
                s.gate    = null;   // { low, high, equal, cards }
                s.quote   = null;   // the chance, before anybody has staked
                s.pick    = null;   // 'higher' | 'lower', for an equal gate
                s.third   = null;
                s.outcome = null;   // 'gate' | 'post' | 'outside' | 'passed'
                s.skipped = false;
                s.done    = false;
                s.out     = s.coins < this.ante;
            }
        }

        /** The seat taking its shot. Every gate on the table belongs to one. */
        get shooter() { return this.seats[this.turn] || null; }

        /** Your chair, which is not the same thing as whose turn it is. */
        get seat() { return this.seats[this.youSeat] || this.seats[0]; }

        // The hand reads from whoever is shooting. These keep the table and
        // the recap talking about one gate at a time without either of them
        // having to know which seat it belongs to.
        get gate()    { return this.shooter ? this.shooter.gate : null; }
        get quote()   { return this.shooter ? this.shooter.quote : null; }
        get pick()    { return this.shooter ? this.shooter.pick : null; }
        get third()   { return this.shooter ? this.shooter.third : null; }
        get outcome() { return this.shooter ? this.shooter.outcome : null; }

        /**
         * What the next hand at this table inherits: the pack *and* the pot.
         *
         * Riding on the shoe slot is not a trick — it is the same question.
         * "What carries from one hand to the next at this table" has exactly
         * one answer here, and splitting it in two would let the pack and the
         * pile disagree about which table they belong to.
         */
        get shoeState() { return { deck: this.deck.snapshot(), pot: this.pot }; }

        /** Everybody still holding enough to put an ante up. */
        liveSeats() { return this.seats.filter((s) => !s.out); }

        /* ---- phases ------------------------------------------------------- */

        start() {
            this.round = 1;
            const live = this.liveSeats();
            if (live.length < 1) { this.over = true; this.phase = 'over'; return; }

            // The ante is what starts a 局, and a 局 runs until somebody
            // clears the middle. A pot carried in from the last hand is that
            // same 局 still going, so nobody pays twice for it.
            if (this.pot <= 0) this.takeAntes(live);

            this.turn = live[0].index;
            this.beginTurn();
        }

        takeAntes(live) {
            for (const s of live) {
                const paid = Math.min(this.ante, s.coins);
                s.coins -= paid;
                s.net   -= paid;
                s.ante   = paid;
                this.pot += paid;
                this.anted += paid;
            }
            this.emit('ante', { each: this.ante, pot: this.pot, seats: live.map((s) => s.index) });
        }

        /** A seat's turn opens with its posts already down and quoted. */
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

        /**
         * The most a seat may call.
         *
         * Never more than is in the middle — you cannot take out what is not
         * there — and never more than the seat can pay for twice over, because
         * 撞柱 doubles it and a call that cannot be settled is not a call.
         *
         * **The room's bet ceiling deliberately does not apply.** Every coin
         * in the middle was put there by this table, so shooting the whole of
         * it moves no more money than the table has already committed — and
         * capping the call below the pot would make a big pile impossible to
         * clear, which is the one thing the game has to be able to do.
         */
        callCap(s) {
            return Math.max(0, Math.min(
                this.pot,
                Math.floor(s.coins / this.config.postPenalty),
            ));
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];
            const s = this.seats[seat];
            if (!s || s.out || s.done) return [];

            if (this.phase === 'offer') {
                const out = [];
                const max = this.callCap(s);
                if (max >= 1) {
                    out.push({ type: 'bet', min: Math.min(this.minBet, max), max, label: t('dg.open') });
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

        /* ---- the hand ------------------------------------------------------ */

        /**
         * Call an amount at the pot.
         *
         * Nothing moves yet. Unlike a house game the stake is not taken up
         * front, because it is not a stake: it is the size of the swing either
         * way, and which way is decided by one card.
         */
        doBet(amount) {
            if (this.phase !== 'offer') return false;
            const s = this.shooter;
            const cap = this.callCap(s);
            if (cap < 1) return false;
            s.bet = Math.max(1, Math.min(Math.round(amount), cap));
            this.emit('bet', { seat: this.turn, amount: s.bet, pot: this.pot });

            // An equal gate hands the decision to the seat before the card
            // comes off, because the two calls are not worth the same.
            if (s.gate.equal) {
                this.phase = 'choose';
                this.emit('choose', { seat: this.turn, rank: s.gate.low });
                return true;
            }
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
            s.quote = this.quoteFor(s);
            this.emit('gate', {
                seat: this.turn, cards: [a, b], quote: s.quote, pot: this.pot,
                low: s.gate.low, high: s.gate.high, equal: s.gate.equal,
            });
        }

        /**
         * The chance of getting through, from the cards actually left.
         *
         * An ordinary gate has one figure. An equal gate has two — one for
         * 大过 and one for 小过 — and both are quoted, because a seat cannot
         * judge whether to shoot without seeing what either call is worth.
         */
        quoteFor(s) {
            if (!s.gate.equal) return { one: this.chanceOf(s.gate, null) };
            return {
                higher: this.chanceOf(s.gate, 'higher'),
                lower:  this.chanceOf(s.gate, 'lower'),
            };
        }

        /**
         * How many of the cards left get through, out of how many there are —
         * and how many would land on a post, since those cost double and a
         * seat deciding whether to shoot needs both figures.
         */
        chanceOf(gate, pick) {
            const remaining = this.deck.remaining;
            let winners = 0, posts = 0;
            for (const c of this.deck.cards) {
                const r = rank(c);
                if (passes(r, gate, pick)) winners++;
                else if (gate.equal ? r === gate.low : (r === gate.low || r === gate.high)) posts++;
            }
            return {
                winners, posts, remaining,
                pct:     remaining ? winners / remaining : 0,
                postPct: remaining ? posts / remaining : 0,
            };
        }

        doPick(dir) {
            this.shooter.pick = dir;
            this.emit('pick', { seat: this.turn, dir });
            this.drawThird();
            return true;
        }

        /**
         * Would this rank win, given the gate and any 大过/小过 choice?
         * Equal to a post is never a win — that is 撞柱.
         */
        wins(r, seat) {
            const s = seat || this.shooter;
            return passes(r, s.gate, s.pick);
        }

        drawThird() {
            this.phase = 'reveal';
            const s = this.shooter;
            const card = this.deck.draw();
            s.third = card;
            const r = rank(card);
            const g = s.gate;

            // 撞柱 — level with a post. Costs double, in both kinds of gate.
            const onPost = g.equal ? (r === g.low) : (r === g.low || r === g.high);

            s.outcome = this.wins(r, s) ? 'gate' : (onPost ? 'post' : 'outside');
            this.emit('third', { seat: this.turn, card, rank: r, outcome: s.outcome });
            this.settleShot();
        }

        /**
         * Move the coins for one shot.
         *
         * Every branch touches the pot and the seat by the same figure and in
         * opposite directions, which is what keeps the middle honest: no coin
         * is created here and none is destroyed, it only changes sides.
         */
        settleShot() {
            const s = this.shooter;
            const called = s.bet;
            let delta = 0;

            if (s.outcome === 'gate') {
                delta = Math.min(called, this.pot);
                this.pot -= delta;
                s.coins  += delta;
                s.net    += delta;
                s.wonTotal = (s.wonTotal || 0) + delta;
            } else {
                const owed = Math.min(
                    called * (s.outcome === 'post' ? this.config.postPenalty : 1),
                    s.coins,
                );
                delta = -owed;
                this.pot += owed;
                s.coins  -= owed;
                s.net    -= owed;
            }

            s.done = true;
            this.emit('result', { seat: this.turn, outcome: s.outcome, delta, pot: this.pot });

            // The middle being emptied ends the 局 on the spot — that is what
            // "直到全部钱被拿完" means, and the next hand antes afresh.
            if (this.pot <= 0) { this.cleared = true; this.finishHand(); return; }
            this.nextShooter();
        }

        /**
         * Hand the pack to the next seat. Nobody shoots twice in a hand; when
         * the last chair has had its gate the lap is over and everybody is
         * compared at once. Whatever is left in the middle rides to the next
         * hand at this table — 越叠越高.
         */
        nextShooter() {
            const next = this.seats.findIndex((s, i) => i > this.turn && !s.out && !s.done);
            if (next < 0) { this.finishHand(); return; }
            this.turn = next;
            this.beginTurn();
        }

        /**
         * `turn` is deliberately left pointing at the last seat to shoot.
         * Every gate-side getter on this engine reads through `shooter`, and
         * the recap and the table both go looking for the gate that just
         * resolved — moving the pointer to nobody would blank all of them the
         * instant the hand ended.
         */
        finishHand() {
            this.phase = 'over';
            this.finish();
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

            // Everyone at the table, not only the seats that got a turn: a
            // hand that empties the middle ends where it stands, and the
            // seats it never reached are still sitting there with an ante in.
            const played = this.seats.filter((s) => !s.out);
            const rows = played.map((s) => {
                const g = s.gate || { low: 0, high: 0, equal: false, cards: [] };
                const won = s.outcome === 'gate';
                // A gate that was let go could not have been shut out — the
                // seat never found out, and the tally must not claim it did.
                const shut = !s.skipped && s.gate && this.quoteWinners(s) === 0;
                // The ante is at risk too, so it belongs in the stake: the
                // return column is meaningless if the coins that went in
                // before the gate was dealt are missing from it.
                const stake = s.ante + (s.skipped ? 0 : s.bet);
                return {
                    seat: s.index,
                    name: s.name,
                    coins: s.net,
                    stake,
                    score: won ? Math.min(500, s.bet) : 0,
                    ratio: stake ? Math.round((s.net / stake) * 1000) / 1000 : 0,
                    outcome: s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw',
                    note: s.outcome ? t('dg.' + s.outcome) : t('dg.passed'),
                    hands: s.gate ? [{
                        cards: g.cards.concat(s.third ? [s.third] : []),
                        bet: s.bet, payout: Math.max(0, s.net),
                        outcome: s.outcome,
                        // Rank is not a score here — the cards say what happened,
                        // and a number beside them only reads as points.
                        total: null,
                    }] : [],
                    extra: {
                        dgRounds: s.skipped ? 0 : 1,
                        dgWins: won ? 1 : 0,
                        dgPosts: s.outcome === 'post' ? 1 : 0,
                        dgEqual: (g.equal && !s.skipped) ? 1 : 0,
                        dgShut: shut ? 1 : 0,
                        dgSkips: s.skipped ? 1 : 0,
                        dgCleared: this.cleared && won ? 1 : 0,
                        forfeits: 0,
                    },
                };
            });

            // The recap headline is your own gate when you played one — it is
            // your round being described — and the last one otherwise.
            const mine = played.find((s) => s.isYou) || played[played.length - 1] || null;
            const gateLine = mine ? (mine.skipped ? t('dg.passed') : say(mine)) : '';

            // The middle is the counterparty, so it sits in the table the way
            // a dealer does elsewhere — and here the figure is real rather
            // than a bookkeeping zero: it is what the pot gained or lost.
            const swing = rows.reduce((n, r) => n + r.coins, 0);
            rows.push({
                seat: -1, name: t('dg.pot'), house: true,
                coins: -swing, ratio: 0, score: 0, outcome: 'house',
                note: this.cleared ? t('dg.cleared') : t('dg.potLeft', { n: this.pot }),
                hands: [], extra: {},
            });

            rows.sort((a, b) => b.ratio - a.ratio || b.coins - a.coins);
            let place = 0, last = null;
            rows.forEach((r, idx) => { if (r.ratio !== last) { place = idx + 1; last = r.ratio; } r.rank = place; });

            const detail = this.cleared
                ? t('dg.detailCleared', { name: mine && mine.outcome === 'gate' ? mine.name : this.clearedBy() })
                : t('dg.detailPot', { n: this.pot, gate: gateLine });

            this.cached = new CV.GameResult({ ranks: rows, detail });
            return this.cached;
        }

        /** Whoever took the last of it, for the recap line. */
        clearedBy() {
            const s = this.seats.filter((x) => x.outcome === 'gate').pop();
            return s ? s.name : '';
        }

        /** The winning cards left when this seat's gate was quoted. */
        quoteWinners(s) {
            if (!s.quote) return null;
            if (s.quote.one) return s.quote.one.winners;
            return s.pick === 'lower' ? s.quote.lower.winners : s.quote.higher.winners;
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
                quote: this.quote, outcome: this.outcome,
                pot: this.pot, ante: this.ante, cleared: this.cleared,
                shooter: this.turn,
                shoeRemaining: this.deck.remaining,
            });
        }
    }

    CV.DragonGateEngine = DragonGateEngine;
    CV.DragonGateRank   = rank;
})();
