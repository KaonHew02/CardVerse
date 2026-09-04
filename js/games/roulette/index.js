/**
 * CardVerse — Russian Roulette Party's entry in the hub.
 *
 * Survival is the mode that ships, which the rules call the recommended one:
 * three HP each, out at zero, last one standing wins. Classic is the same loop
 * without the elimination and Risk & Reward needs a different turn entirely —
 * both are listed as later versions in the rules and neither is here.
 *
 * Coins are an ante rather than a bet: everyone pays the room's stake in and
 * the winner takes the pot. The rules' own score is kept alongside it and is
 * what drives XP and the stats page.
 *
 * Virtual coins only, and the spinner is an abstract arcade device.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'roulette',
        name: 'Roulette Party',
        icon: '🎯',
        blurb: 'Spin. Risk. Survive. Three hearts each and one slot in six that bites.',
        category: 'party',
        players: [2, 8],
        wagers: true,
        Engine: CV.RouletteEngine,
        AI:     CV.RouletteAI,
        View:   CV.RouletteView,

        rules: ['rr.rule1', 'rr.rule2', 'rr.rule3', 'rr.rule4',
                'rr.rule5', 'rr.rule6', 'rr.rule7'],

        extraLabels: {
            rrGames: 'Games played', rrWins: 'Games won', rrScore: 'Points scored',
            rrHp: 'Hearts left over', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'rr-first', name: 'Last One Standing', icon: '🎯', desc: 'Win your first party.',
              reward: { coins: 250, xp: 60 }, check: (c) => (c.gameStats.extra.rrWins || 0) >= 1 },
            { id: 'rr-clean', name: 'Untouched', icon: '💚', desc: 'Win without losing a single heart.',
              reward: { coins: 900, xp: 180 },
              check: (c) => c.entry.outcome === 'win' && (c.mine.extra.rrHp || 0) >= 3 },
            { id: 'rr-score', name: 'High Roller', icon: '⭐', desc: 'Finish a party on 300 points or more.',
              reward: { coins: 700, xp: 150 }, check: (c) => (c.mine.extra.rrScore || 0) >= 300 },
            { id: 'rr-wins-25', name: 'Party Animal', icon: '🎉', desc: 'Win 25 parties.',
              reward: { coins: 1500, xp: 300 }, check: (c) => (c.gameStats.extra.rrWins || 0) >= 25 },
        ],
    });
})();
