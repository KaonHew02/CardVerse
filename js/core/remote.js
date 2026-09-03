/**
 * CardVerse — playing at someone else's table.
 *
 * A guest has no engine. It has a stream of `snapshotFor(mySeat)` objects from
 * the host and nothing else — no deck, no seed, no other player's hidden
 * cards. That is the security model working as intended, but it leaves the
 * views with a problem: they were written against a live engine.
 *
 * Rather than rewrite every view to read two different shapes, `RemoteEngine`
 * puts the engine's *read* surface back on top of a snapshot. The view cannot
 * tell the difference, so one table screen serves both the host and the guest
 * and there is no second rendering path to keep in step.
 *
 * Everything here is read-only. A guest that could mutate its own copy would
 * just be lying to itself: the host owns the game, and the next snapshot
 * overwrites whatever the guest imagined.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** The engine surface a view actually touches, rebuilt from a snapshot. */
    class RemoteEngine {
        constructor(view, game) {
            this.game = game;
            this.seen = [];              // guests are never sent the count history
            this.absorb(view);
        }

        /** Take a new snapshot from the host. */
        absorb(view) {
            this.view    = view;
            this.phase   = view.phase;
            this.turn    = view.turn;
            this.round   = view.round;
            this.over    = view.over;
            this.viewer  = view.viewer;
            this.config  = Object.assign({}, view.rules || {});
            this.dealer  = view.dealer || { cards: [], revealed: false };
            this.shoe    = { remaining: view.shoeRemaining || 0, cards: [] };
            this.options = view.options || [];
            this.log     = view.log || [];

            // Seats arrive as plain JSON, so `isHuman` — a getter on the Seat
            // prototype — does not survive the trip. Rehydrating real Seats is
            // cheaper than teaching every view to cope without it.
            this.seats = (view.seats || []).map((s, i) => Object.assign(new CV.Seat(i, s), s));
            return this;
        }

        get youSeat() { return this.viewer; }
        isOver()      { return this.over; }

        /**
         * Only this viewer's own options are known, because the host only sends
         * a seat what that seat may do. Asking about another seat truthfully
         * returns nothing rather than guessing.
         */
        legalActions(seat) {
            return seat === this.viewer ? this.options : [];
        }

        hand(seat, i) {
            const s = this.seats[seat];
            if (!s || !s.hands) return undefined;
            return s.hands[i === undefined ? s.active : i];
        }

        dealerUp()    { return this.dealer.cards[0]; }
        dealerValue() { return CV.Cards.handValue(this.dealer.cards); }

        get shoeState() { return null; }

        /** A guest cannot decide anything; the host does. */
        apply() { return false; }
        snapshot() { return this.view; }
        snapshotFor() { return this.view; }
        since() { return []; }
    }

    /**
     * A Table, from the guest's side. Same shape the views and `play.js`
     * expect — `engine`, `dispatch`, `onChange`, `waitingOnYou` — but every
     * decision goes down the wire instead of into an engine, and the screen
     * repaints when the host says so.
     */
    class RemoteTable {
        constructor({ client, game, view, session }) {
            this.client   = client;
            this.game     = game;
            this.session  = session;
            this.engine   = new RemoteEngine(view, game);
            // The strategy hint reads only the hand and the dealer's up-card,
            // both of which a guest legitimately has, so hints still work.
            this.ai       = game.AI ? new game.AI(this.engine) : null;
            this.watchers = [];
            this.settled  = false;
            this.speed    = 1;
            this.lastResult = null;
        }

        onChange(fn) { this.watchers.push(fn); return this; }

        notify(events) {
            for (const fn of this.watchers) {
                try { fn(events || [], this); } catch (err) { console.error('[remote-table]', err); }
            }
        }

        /** A fresh snapshot from the host. */
        update(view) {
            this.engine.absorb(view);
            this.notify([]);
        }

        /** The host has settled the round and told us how it went. */
        finish(result, ranks) {
            if (this.settled) return;
            this.settled = true;
            // Rewards are local — a guest earns into their own profile from the
            // result the host reports. There is nothing to defend here: the
            // profile is their own browser's, and they could edit it directly.
            const shim = { engine: this.engine, game: this.game, settled: false };
            this.engine.result = () => result;
            this.lastResult = CV.Rewards.settle(shim, result);
            this.notify([{ type: 'settled', result: this.lastResult, ranks }]);
        }

        dispatch(action) {
            if (!this.engine.legalActions(this.engine.viewer).length) return false;
            this.client.act(action);
            return true;
        }

        options(seat) { return this.engine.legalActions(seat === undefined ? this.engine.viewer : seat); }

        get youSeat() { return this.engine.viewer; }

        get waitingOnYou() {
            return !this.engine.over && this.engine.turn === this.engine.viewer;
        }

        pause() {}
        resume() {}
        settle() { return this.lastResult; }
        destroy() { this.watchers.length = 0; }
    }

    /**
     * The guest's Transport. It never applies anything locally — it posts the
     * action to whoever is running the table and waits to be told what
     * happened. Kept as a Transport so the seam in transport.js stays real
     * rather than decorative.
     */
    class RemoteTransport extends CV.Transport {
        constructor(client) {
            super();
            this.client = client;
            this.isAuthority = false;
        }
        send(action) {
            this.client.act(action);
            this.fire(action, true);
            return true;
        }
        close() { /* the client owns the connection */ }
    }

    CV.RemoteEngine    = RemoteEngine;
    CV.RemoteTable     = RemoteTable;
    CV.RemoteTransport = RemoteTransport;
})();
