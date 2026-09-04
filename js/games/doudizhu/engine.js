/**
 * CardVerse — 斗地主.
 *
 * Three seats, 54 cards, one Landlord against two Farmers. 17 cards each and
 * three face down; whoever wins the bidding takes those three and leads.
 *
 * The rules that shape this file, in the order they bite:
 *
 *  - **Strength is not the deck's rank.** 2 sits above the ace and the jokers
 *    above that; a 2 or a joker can never appear in a straight, a run of
 *    pairs or an airplane. All of that lives in `combos.js`.
 *  - **A response must match the type and the card count.** Only a bomb or
 *    the rocket cuts across that.
 *  - **Two passes clear the trick** and hand the lead back to whoever last
 *    played, who may then lead anything.
 *  - **Either Farmer going out wins for both.** The other Farmer's hand is
 *    irrelevant.
 *
 * On legality: a game whose action space is "any of the millions of subsets
 * of twenty cards" cannot enumerate its legal moves, so `legalActions` lists
 * the *affordances* — play, pass, bid — and `isLegal` is overridden to run a
 * real validation on the cards. The invariant the hub depends on still holds:
 * nothing reaches `handle()` that `apply()` has not checked.
 *
 * Virtual coins only. Points are converted at the room's stake, and no seat
 * can be taken below zero.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { Deck } = CV.Cards;
    const D = CV.DDZ;

    const SEATS = 3;
    const HAND  = 17;
    const BOTTOM = 3;

    class DouDiZhuEngine extends CV.GameEngine {

        static get code() { return 'doudizhu'; }
        static get publicConfig() { return ['room', 'stake']; }

        static get defaults() {
            return {
                room: 'beginner',
                stake: 0,        // coins per point; 0 means "take it from the room"
            };
        }

        constructor(opts) {
            super(opts);
            const room = CV.Registry.room(this.config.room);
            this.stake = this.config.stake || room.bet[0];

            this.deck    = new Deck(this.rng, { decks: 1, jokers: true });
            this.bottom  = [];
            this.landlord = -1;
            this.base    = 0;
            this.multiplier = 1;
            this.bombs   = 0;
            this.rockets = 0;
            this.trick   = null;     // { by, combo, cards } — what must be beaten
            this.passes  = 0;
            this.plays   = [0, 0, 0];
            this.deals   = 0;
            this.winner  = -1;
            this.cached  = null;

            this.bidFrom = this.rng.int(SEATS);
            this.bidSeat = 0;        // how many seats have bid this round
            this.bids    = [];
            this.highBid = 0;
            this.highSeat = -1;

            for (const s of this.seats) {
                s.startCoins = s.coins;
                s.net = 0;
                s.cards = [];
                s.role = 'farmer';
                s.bid = null;
                s.passed = false;
            }
        }

        get farmers() { return [0, 1, 2].filter((i) => i !== this.landlord); }

        /* ---- dealing and bidding -------------------------------------------- */

        start() {
            this.deal();
            this.phase = 'bid';
            this.turn  = this.bidFrom;
            this.emit('bidding', { seat: this.turn });
        }

        deal() {
            this.deals++;
            this.deck.reset();
            const dealt = this.deck.deal(SEATS, HAND);
            for (let i = 0; i < SEATS; i++) {
                this.seats[i].cards = this.sort(dealt[i]);
                this.seats[i].role = 'farmer';
                this.seats[i].bid = null;
            }
            this.bottom = this.deck.drawMany(BOTTOM);
            this.bids = [];
            this.bidSeat = 0;
            this.highBid = 0;
            this.highSeat = -1;
            this.landlord = -1;
            this.emit('deal', { hands: this.seats.map((s) => s.cards.length) });
        }

        /** Low on the left, jokers on the right — the order a hand is read in. */
        sort(cards) {
            return cards.slice().sort((a, b) => D.strength(a) - D.strength(b) || a.s.localeCompare(b.s));
        }

        legalActions(seat) {
            if (this.over || seat !== this.turn) return [];

            if (this.phase === 'bid') {
                const out = [{ type: 'bid', bid: 0, label: t('ddz.noBid') }];
                for (let n = this.highBid + 1; n <= 3; n++) {
                    out.push({ type: 'bid', bid: n, label: t('ddz.bidN', { n }) });
                }
                return out;
            }

            if (this.phase === 'play') {
                // "Play" and "Pass" are affordances; which cards are legal is
                // settled by isLegal → validPlay, not by listing them.
                const out = [{ type: 'play', label: t('ddz.play') }];
                if (this.trick) out.push({ type: 'pass', label: t('ddz.pass') });
                return out;
            }
            return [];
        }

        /**
         * A play is checked against the cards actually held and against what
         * is on the table. Everything else defers to the base class.
         */
        isLegal(seat, action) {
            if (action.type === 'play') return !!this.validPlay(seat, action.cards);
            return super.isLegal(seat, action);
        }

        /**
         * The combination `seat` would be making by playing these card ids, if
         * it is a legal answer to the table. Null if the cards are not held,
         * are not a combination, or do not beat what is down.
         */
        validPlay(seat, ids) {
            if (this.over || this.phase !== 'play' || seat !== this.turn) return null;
            if (!Array.isArray(ids) || !ids.length) return null;

            const hand = this.seats[seat].cards;
            const seen = new Set();
            const cards = [];
            for (const id of ids) {
                if (seen.has(id)) return null;             // the same card twice
                seen.add(id);
                const card = hand.find((c) => c.id === id);
                if (!card) return null;                    // not in this hand
                cards.push(card);
            }
            return D.canBeat(cards, this.trick ? this.trick.combo : null);
        }

        handle(action) {
            if (action.type === 'bid')  return this.doBid(action.seat, action.bid);
            if (action.type === 'play') return this.doPlay(action.seat, action.cards);
            if (action.type === 'pass') return this.doPass(action.seat);
            return false;
        }

        doBid(seat, bid) {
            this.seats[seat].bid = bid;
            this.bids.push({ seat, bid });
            this.emit('bid', { seat, bid });
            if (bid > this.highBid) { this.highBid = bid; this.highSeat = seat; }
            this.bidSeat++;

            // A three ends it on the spot; nobody can go higher.
            if (bid === 3) return this.crown();
            if (this.bidSeat >= SEATS) {
                if (this.highBid === 0) return this.redeal();
                return this.crown();
            }
            this.turn = (this.turn + 1) % SEATS;
            this.emit('bidding', { seat: this.turn });
            return true;
        }

        /** Nobody wanted it. Fresh deal, and the next seat opens the bidding. */
        redeal() {
            this.bidFrom = (this.bidFrom + 1) % SEATS;
            this.deal();
            this.turn = this.bidFrom;
            this.emit('redeal', { deals: this.deals });
            this.emit('bidding', { seat: this.turn });
            return true;
        }

        crown() {
            this.landlord = this.highSeat;
            this.base = this.highBid;
            const s = this.seats[this.landlord];
            s.role = 'landlord';
            s.cards = this.sort(s.cards.concat(this.bottom));
            this.phase = 'play';
            this.turn  = this.landlord;
            this.trick = null;
            this.passes = 0;
            this.emit('landlord', { seat: this.landlord, base: this.base, bottom: this.bottom.slice() });
            return true;
        }

        /* ---- the tricks ------------------------------------------------------ */

        doPlay(seat, ids) {
            const combo = this.validPlay(seat, ids);
            if (!combo) return false;

            const s = this.seats[seat];
            const cards = ids.map((id) => s.cards.find((c) => c.id === id));
            s.cards = s.cards.filter((c) => !ids.includes(c.id));
            s.passed = false;
            this.plays[seat]++;

            // Every bomb and the rocket double the stake, as they land.
            if (combo.type === 'bomb')   { this.bombs++;   this.multiplier *= 2; }
            if (combo.type === 'rocket') { this.rockets++; this.multiplier *= 2; }

            this.trick  = { by: seat, combo, cards };
            this.passes = 0;
            this.emit('play', { seat, cards, combo, left: s.cards.length, multiplier: this.multiplier });

            if (!s.cards.length) { this.winner = seat; this.over = true; return true; }
            // A seat down to one card is worth announcing — everyone at a real
            // table can see it, so hiding it would be the odd choice.
            if (s.cards.length === 1) this.emit('lastCard', { seat });

            this.turn = (seat + 1) % SEATS;
            return true;
        }

        doPass(seat) {
            this.seats[seat].passed = true;
            this.passes++;
            this.emit('pass', { seat });

            // Two passes in a row clear the table, and the last player to get
            // cards down leads again — with anything they like.
            if (this.passes >= 2 && this.trick) {
                const lead = this.trick.by;
                this.trick = null;
                this.passes = 0;
                this.turn = lead;
                for (const s of this.seats) s.passed = false;
                this.emit('trickEnd', { lead });
                return true;
            }
            this.turn = (seat + 1) % SEATS;
            return true;
        }

        /* ---- how it ended ---------------------------------------------------- */

        get landlordWon() { return this.winner === this.landlord; }

        /** Landlord took every trick — the Farmers never got a card down. */
        get spring() {
            if (!this.landlordWon) return false;
            return this.farmers.every((i) => this.plays[i] === 0);
        }

        /**
         * 反春, as specified: the Farmers win, one of them played and the
         * other never did. (The classical rule counts the Landlord's plays
         * instead — this follows the rules as written.)
         */
        get antiSpring() {
            if (this.winner < 0 || this.landlordWon) return false;
            const played = this.farmers.filter((i) => this.plays[i] > 0);
            return played.length === 1;
        }

        /** Base × every doubling, including whichever spring applied. */
        get score() {
            const spring = this.spring || this.antiSpring;
            return this.base * this.multiplier * (spring ? 2 : 1);
        }

        /**
         * Points into coins. A seat is never taken below zero, so what the
         * winners collect is what the losers could actually pay.
         */
        settleCoins(points) {
            const raw = points.map((p) => p * this.stake);
            const net = new Array(SEATS).fill(0);
            let pot = 0;
            for (let i = 0; i < SEATS; i++) {
                if (raw[i] < 0) { net[i] = -Math.min(-raw[i], this.seats[i].coins); pot -= net[i]; }
            }
            const claim = raw.reduce((n, v) => n + (v > 0 ? v : 0), 0);
            let handed = 0;
            for (let i = 0; i < SEATS; i++) {
                if (raw[i] <= 0) continue;
                net[i] = claim ? Math.round((pot * raw[i]) / claim) : 0;
                handed += net[i];
            }
            // Rounding must not invent or destroy coins; the last winner squares it.
            if (handed !== pot) {
                for (let i = SEATS - 1; i >= 0; i--) if (raw[i] > 0) { net[i] += pot - handed; break; }
            }
            for (let i = 0; i < SEATS; i++) {
                this.seats[i].coins += net[i];
                this.seats[i].net = net[i];
            }
            return net;
        }

        result() {
            if (this.cached) return this.cached;

            const score = this.score;
            const won = this.landlordWon;
            // The Landlord plays two people at once, so the Landlord's swing
            // is twice a Farmer's.
            const points = [0, 0, 0];
            for (let i = 0; i < SEATS; i++) {
                if (i === this.landlord) points[i] = (won ? 2 : -2) * score;
                else points[i] = (won ? -1 : 1) * score;
            }
            const net = this.settleCoins(points);

            const rows = this.seats.map((s, i) => {
                const isLandlord = i === this.landlord;
                const winner = isLandlord === won;
                return {
                    seat: i,
                    name: s.name,
                    coins: net[i],
                    stake: Math.abs(points[i]) * this.stake,
                    score: winner ? Math.min(500, score * 20) : 0,
                    ratio: winner ? 1 : -1,
                    rank: winner ? 1 : 2,
                    outcome: winner ? 'win' : 'loss',
                    note: t(isLandlord ? 'ddz.landlord' : 'ddz.farmer')
                        + (i === this.winner ? ' · ' + t('ddz.wentOut') : ''),
                    hands: s.cards.length ? [{ cards: s.cards.slice(), total: null, bet: 0, payout: 0 }] : [],
                    extra: {
                        ddzRounds: 1,
                        ddzLandlord: isLandlord ? 1 : 0,
                        ddzLandlordWins: (isLandlord && won) ? 1 : 0,
                        ddzFarmerWins: (!isLandlord && !won) ? 1 : 0,
                        ddzBombs: this.bombs,
                        ddzRockets: this.rockets,
                        ddzSprings: this.spring ? 1 : 0,
                        ddzAnti: this.antiSpring ? 1 : 0,
                        ddzBase: this.base,
                        forfeits: 0,
                    },
                };
            });

            const bits = [
                t('ddz.detailLandlord', { name: this.seats[this.landlord].name }),
                t('ddz.detailBase', { n: this.base }),
            ];
            if (this.multiplier > 1) bits.push(t('ddz.detailMult', { n: this.multiplier }));
            if (this.spring) bits.push(t('ddz.spring'));
            if (this.antiSpring) bits.push(t('ddz.antiSpring'));

            this.cached = new CV.GameResult({ ranks: rows, detail: bits.join(' · ') });
            return this.cached;
        }

        /* ---- state ----------------------------------------------------------- */

        snapshot() {
            return Object.assign(super.snapshot(), {
                landlord: this.landlord,
                base: this.base,
                multiplier: this.multiplier,
                bottom: this.bottom.slice(),
                trick: this.trick && {
                    by: this.trick.by,
                    combo: this.trick.combo,
                    cards: this.trick.cards.slice(),
                },
                passes: this.passes,
                highBid: this.highBid,
                bids: this.bids.slice(),
                deckLeft: this.deck.remaining,
            });
        }

        /** Everyone's hand but yours is a count, and the bottom stays down. */
        redactSeat(seat, index, viewer) {
            if (index === viewer) return seat;
            return Object.assign({}, seat, { cards: seat.cards.map(() => null) });
        }

        snapshotFor(viewer) {
            const view = super.snapshotFor(viewer);
            // The three face-down cards are public the moment a Landlord takes
            // them, and secret until then.
            view.bottom = this.landlord < 0 ? this.bottom.map(() => null) : this.bottom.slice();
            return view;
        }
    }

    CV.DouDiZhuEngine = DouDiZhuEngine;
})();
