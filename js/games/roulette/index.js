/**
 * CardVerse — 轮盘's entry in the hub.
 *
 * Single-zero (European) roulette. The prices are the standard ones and are
 * not a design choice: each is the fair inverse of its own chance with one
 * pocket held back, which is what makes every bet on the layout return the
 * same −2.70%. See wheel.js, where they live, and the audit, which checks
 * that identity holds for all of them.
 *
 * **What is not here.** Splits, corners, streets and lines are real bets and
 * are priced in wheel.js, but they are not on the table yet — they need
 * edge-of-cell targets to place, and a spot you cannot reliably hit is worse
 * than one that is honestly absent. Straight numbers, dozens, columns and the
 * even-money spots are all live. En prison and la partage are variants and
 * are deliberately not implemented: on this table zero takes the outside bets.
 *
 * Virtual coins only — no purchase, top-up or cash-out, in either direction.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'roulette',
        name: '轮盘',
        icon: '🎡',
        blurb: 'Cover the layout, then one ball settles the table. Single zero.',
        category: 'table',
        players: [1, 6],
        wagers: true,
        Engine: CV.RouletteEngine,
        AI:     CV.RouletteAI,
        View:   CV.RouletteView,

        rules: ['rl.rule1', 'rl.rule2', 'rl.rule3', 'rl.rule4',
                'rl.rule5', 'rl.rule6', 'rl.rule7'],

        extraLabels: {
            rlSpins: 'Spins played', rlBets: 'Spots covered', rlHits: 'Spots that paid',
            rlStraight: 'Numbers hit straight', rlZero: 'Zeros seen',
            forfeits: 'Walked away',
        },

        achievements: [
            { id: 'rl-first', name: 'On the Wheel', icon: '🎡', desc: 'Win your first spin.',
              reward: { coins: 200, xp: 50 },
              check: (c) => c.entry.outcome === 'win' && (c.gameStats.extra.rlSpins || 0) >= 1 },
            { id: 'rl-straight', name: 'Straight Up', icon: '🎯', desc: 'Hit a number straight up.',
              reward: { coins: 800, xp: 160 }, check: (c) => (c.mine.extra.rlStraight || 0) >= 1 },
            { id: 'rl-zero', name: 'The House Pocket', icon: '🟢', desc: 'Be at the table when zero comes up.',
              reward: { coins: 150, xp: 40 }, check: (c) => (c.mine.extra.rlZero || 0) >= 1 },
            { id: 'rl-spread', name: 'Covering the Cloth', icon: '🪙', desc: 'Cover five spots on one spin.',
              reward: { coins: 400, xp: 90 }, check: (c) => (c.mine.extra.rlBets || 0) >= 5 },
            { id: 'rl-wins-25', name: 'Regular', icon: '🏆', desc: 'Win 25 spins.',
              reward: { coins: 1500, xp: 300 }, check: (c) => (c.gameStats.wins || 0) >= 25 },
        ],
    });
})();
