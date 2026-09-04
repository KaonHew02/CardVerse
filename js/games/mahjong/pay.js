/**
 * CardVerse — who pays, and how much.
 *
 * Kept apart from the fan calculator on purpose. `fan.js` answers "what did
 * this hand contain"; this answers "what is that worth at this table", and
 * the two questions change for different reasons — a regional fan table is
 * one edit, a different settlement is another.
 *
 * The rules do not price a win, so this is the settlement 麻将 is usually
 * played for, written as configuration rather than baked in:
 *
 *     一番 is worth one point, and a point is worth the room's stake.
 *     自摸 — everyone else pays the winner.
 *     放铳 — the player who threw the tile pays for the whole table.
 *     The dealer pays and receives double, either way round.
 *
 * That last one is why the button matters. Turn `dealerMul` down to 1 and the
 * dealer's seat becomes decoration.
 */

(() => {
    'use strict';

    const DEFAULTS = {
        pointPerFan: 1,   // 一番 = one point
        dealerMul: 2,     // the dealer pays and collects double
        capFan: 0,        // 0 = no limit hand; set e.g. 16 to cap a payout
    };

    /**
     * @param {object} o
     * @param {number} o.players  how many seats
     * @param {number} o.winner   seat that won
     * @param {number} o.from     seat that threw the tile, or -1 for 自摸
     * @param {number} o.dealer   seat holding the button
     * @param {number} o.fan      total 番
     * @param {number} o.stake    coins one point is worth
     * @param {object} [o.config] overrides for the constants above
     * @returns {{deltas:number[], unit:number, selfDraw:boolean}}
     */
    function settle(o) {
        const cfg = Object.assign({}, DEFAULTS, o.config || {});
        const n = o.players;
        const fan = cfg.capFan ? Math.min(o.fan, cfg.capFan) : o.fan;
        const unit = fan * cfg.pointPerFan * o.stake;
        const deltas = new Array(n).fill(0);
        const withDealer = (a, b) => ((a === o.dealer || b === o.dealer) ? cfg.dealerMul : 1);

        if (o.from < 0) {
            // 自摸 — every other seat pays its own share.
            for (let i = 0; i < n; i++) {
                if (i === o.winner) continue;
                const pay = unit * withDealer(o.winner, i);
                deltas[i] -= pay;
                deltas[o.winner] += pay;
            }
        } else {
            // 放铳 — the seat that threw it covers the table.
            const pay = unit * (n - 1) * withDealer(o.winner, o.from);
            deltas[o.from] -= pay;
            deltas[o.winner] += pay;
        }
        return { deltas, unit, selfDraw: o.from < 0 };
    }

    /**
     * Nobody can pay more than they hold. Losses are trimmed to what is there
     * and the winner collects what was actually paid.
     */
    function clamp(deltas, stacks, winner) {
        const out = deltas.slice();
        let pot = 0;
        for (let i = 0; i < out.length; i++) {
            if (i === winner || out[i] >= 0) continue;
            const paid = Math.min(-out[i], stacks[i]);
            out[i] = -paid;
            pot += paid;
        }
        out[winner] = pot;
        return out;
    }

    window.CV = window.CV || {};
    window.CV.MJPay = { DEFAULTS, settle, clamp };
})();
