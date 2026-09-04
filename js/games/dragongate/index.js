/**
 * CardVerse — 射龙门's entry in the hub.
 *
 * **On the payout.** The rules specify everything about how a round is played
 * and nothing about what a win pays, so the price is derived rather than
 * invented: the engine counts how many cards left in the pack would actually
 * win, and pays the fair inverse of that chance less a 5% house edge. A gate
 * of 5 to J pays about ×1.6; a gate of 7 to 9 pays about ×11; an adjacent
 * gate cannot be won and pays nothing, which the table says out loud.
 *
 * A fixed paytable would misprice a narrow gate against a wide one and ignore
 * that the pack depletes between rounds. If a flat multiplier is wanted
 * instead, this is the one number to change.
 *
 * Virtual coins only — no purchase, top-up or cash-out, in either direction.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'dragongate',
        name: '射龙门',
        icon: '🐉',
        blurb: 'Two cards open a gate. Bet whether the third lands inside it.',
        category: 'cards',
        players: [1, 1],
        wagers: true,
        Engine: CV.DragonGateEngine,
        View:   CV.DragonGateView,
        // No AI: the gate is one player's shot, and the 大过/小过 call is theirs.

        rules: ['dg.rule1', 'dg.rule2', 'dg.rule3', 'dg.rule4', 'dg.rule5', 'dg.rule6'],

        extraLabels: {
            dgRounds: 'Gates opened', dgWins: '射中龙门', dgPosts: '压线',
            dgEqual: 'Equal gates', dgShut: 'Adjacent gates', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'dg-first', name: '射中龙门', icon: '🐉', desc: 'Shoot your first gate.',
              reward: { coins: 150, xp: 40 }, check: (c) => (c.gameStats.extra.dgWins || 0) >= 1 },
            { id: 'dg-narrow', name: 'Threading It', icon: '🎯', desc: 'Win a gate paying ×5 or better.',
              reward: { coins: 600, xp: 120 }, check: (c) => c.mine.score >= 500 },
            { id: 'dg-equal', name: '大过 or 小过', icon: '⚖️', desc: 'Win after calling higher or lower on an equal gate.',
              reward: { coins: 400, xp: 80 },
              check: (c) => c.entry.outcome === 'win' && (c.mine.extra.dgEqual || 0) >= 1 },
            { id: 'dg-wins-25', name: 'Dragon Slayer', icon: '🐲', desc: 'Shoot 25 gates.',
              reward: { coins: 1000, xp: 200 }, check: (c) => (c.gameStats.extra.dgWins || 0) >= 25 },
            { id: 'dg-post', name: '压线', icon: '😤', desc: 'Land exactly on a post. It happens.',
              reward: { coins: 100, xp: 30 }, check: (c) => (c.gameStats.extra.dgPosts || 0) >= 1 },
        ],
    });
})();
