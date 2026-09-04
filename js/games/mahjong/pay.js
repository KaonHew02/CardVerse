/**
 * CardVerse — who may win, and what it costs.
 *
 * Kept apart from the fan calculator on purpose. `fan.js` answers "what did
 * this hand contain"; this answers "is that enough, and what does it pay".
 *
 * **The two modes pay differently, so they are two profiles.** Nothing in the
 * three-player table can reach the four-player one by accident.
 *
 *     three seats   5番 minimum to 胡
 *                   自摸 — both opponents pay double
 *                   放铳 — the thrower pays double, the other pays once
 *     four seats    no minimum
 *                   自摸 — all three pay once
 *                   放铳 — the thrower covers the table
 *
 * **爆番.** Ten 番 or more is not scored at ten. It is capped and doubled to
 * a flat twenty, so an 11番 hand and a 16番 hand pay the same.
 *
 * All of it is integer arithmetic on coins, because a payment that goes
 * through a float is a payment that eventually comes out at 3.9999999999.
 */

(() => {
    'use strict';

    /**
     * One profile per mode. `unitSteps` multiply the room's base stake, and
     * they hold the 0.20 / 0.50 / 1.00 shape the table is normally played at.
     */
    const PROFILES = {
        3: {
            minFan: 5,
            baoAt: 10, baoFan: 20,
            selfDraw: 2,          // each opponent pays this many base amounts
            thrower: 2,           // 放铳者
            bystander: 1,         // the other seat, on a discard win
            unitSteps: [2, 5, 10],
        },
        4: {
            minFan: 0,
            baoAt: 10, baoFan: 20,
            selfDraw: 1,
            thrower: 3,           // the thrower covers the table
            bystander: 0,
            unitSteps: [2, 5, 10],
        },
    };

    const profileFor = (players) => PROFILES[players] || PROFILES[4];

    /** The coin value of one 番 at this room and this step. */
    const unitFor = (players, baseBet, step) => {
        const p = profileFor(players);
        const use = p.unitSteps.includes(step) ? step : p.unitSteps[0];
        return baseBet * use;
    };

    /**
     * May this hand be declared at all? Under the minimum it is not a win,
     * however good the tiles are — the check comes before any money moves.
     */
    function canWin(players, fan, config) {
        const p = Object.assign({}, profileFor(players), config || {});
        return fan >= p.minFan;
    }

    /** 番 as scored, versus 番 as paid. Ten or more pays a flat twenty. */
    function payFan(players, fan, config) {
        const p = Object.assign({}, profileFor(players), config || {});
        const bao = p.baoAt > 0 && fan >= p.baoAt;
        return { bao, fan: bao ? p.baoFan : fan };
    }

    /**
     * @param {object} o
     * @param {number} o.players  how many seats
     * @param {number} o.winner   seat that won
     * @param {number} o.from     seat that threw the tile, or -1 for 自摸
     * @param {number} o.fan      total 番 as scored
     * @param {number} o.unit     coins one 番 is worth
     * @param {object} [o.config] overrides for the profile
     * @returns {{deltas:number[], base:number, bao:boolean, payFan:number}}
     */
    function settle(o) {
        const p = Object.assign({}, profileFor(o.players), o.config || {});
        const { bao, fan } = payFan(o.players, o.fan, o.config);
        const base = fan * o.unit;
        const deltas = new Array(o.players).fill(0);

        for (let i = 0; i < o.players; i++) {
            if (i === o.winner) continue;
            const shares = (o.from < 0) ? p.selfDraw
                : (i === o.from ? p.thrower : p.bystander);
            const pay = base * shares;
            deltas[i] -= pay;
            deltas[o.winner] += pay;
        }
        return { deltas, base, bao, payFan: fan };
    }

    /**
     * Nobody hands over more than they hold. Losses are trimmed to what is
     * there and the winner collects what was actually paid.
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
    window.CV.MJPay = { PROFILES, profileFor, unitFor, canWin, payFan, settle, clamp };
})();
