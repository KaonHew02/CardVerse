/**
 * CardVerse — 老虎机's entry in the hub.
 *
 * **A note on return-to-player.** Every symbol is equally likely on every
 * reel, so a win of any kind is 1 in 64, and the average paying triple is
 * ×34.75. That makes the machine's RTP (5+8+10+15+25+40+75+100) / 512 ≈
 * **54%** — a player gets back a little over half of what they stake, on
 * average, over a long run.
 *
 * That figure follows from the paytable and equal reels as specified; it is
 * not a bug and it is not accidental. It is also far below a real machine's
 * 85–98%, so the coin balance drains quickly. The lever, if it should be
 * kinder, is either weighting the reels or raising the multipliers —
 * `tools/smoke.js` measures the RTP and asserts it, so a change is deliberate
 * rather than a surprise.
 *
 * Virtual coins only. No purchase, no top-up, no cash-out, in either
 * direction — the line the whole hub is built on.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'slots',
        name: '老虎机',
        icon: '🎰',
        blurb: 'Three reels, one payline. Match three and the coins fall.',
        category: 'machine',
        players: [1, 1],
        wagers: true,
        rooms: ['beginner'],        // the machine sets its own limits, not the room
        Engine: CV.SlotsEngine,
        View:   CV.SlotsView,
        // No AI: nobody else sits at a slot machine.

        rules: ['slots.rule1', 'slots.rule2', 'slots.rule3', 'slots.rule4', 'slots.rule5'],

        extraLabels: {
            slotSpins: 'Spins', slotWins: 'Winning spins', slotLosses: 'Losing spins',
            slotStaked: 'Coins staked', slotWon: 'Coins won', slotJackpots: 'Jackpots (7 7 7)',
        },

        achievements: [
            { id: 'sl-first', name: 'Pull the Lever', icon: '🎰', desc: 'Spin the reels for the first time.',
              reward: { coins: 100, xp: 25 }, check: (c) => (c.gameStats.extra.slotSpins || 0) >= 1 },
            { id: 'sl-win', name: 'Three of a Kind', icon: '🍒', desc: 'Land three matching symbols.',
              reward: { coins: 200, xp: 40 }, check: (c) => (c.gameStats.extra.slotWins || 0) >= 1 },
            { id: 'sl-jackpot', name: '7 7 7', icon: '7️⃣', desc: 'Hit the jackpot.',
              reward: { coins: 3000, xp: 500 }, check: (c) => (c.gameStats.extra.slotJackpots || 0) >= 1 },
            { id: 'sl-diamond', name: 'Diamond Hands', icon: '💎', desc: 'Win 5,000 coins in one session.',
              reward: { coins: 800, xp: 150 }, check: (c) => c.mine.score >= 5000 },
            { id: 'sl-spins-500', name: 'One More Spin', icon: '🔁', desc: 'Spin 500 times.',
              reward: { coins: 1000, xp: 200 }, check: (c) => (c.gameStats.extra.slotSpins || 0) >= 500 },
        ],
    });
})();
