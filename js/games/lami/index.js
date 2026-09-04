/**
 * CardVerse — Lami's entry in the hub.
 *
 * Two to four seats. Everyone throws to see who opens the first round; after
 * that the previous winner opens, which is the rule the game is built around.
 *
 * Scoring is the one the rules give: whatever is left in your hand counts
 * against you, and the smallest hand wins. In coins that is — every seat pays
 * its own points at the room's stake, and the smallest hand takes the pot. A
 * player who went out pays nothing and collects it all.
 *
 * Everything the rules leave open lives in `RULES` in `melds.js`, one named
 * constant each. Virtual coins only.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'lami',
        name: 'Lami',
        icon: '🧩',
        blurb: 'Rummy on mahjong tiles. Runs, sets, jokers — empty your rack.',
        category: 'tiles',
        players: [2, 4],
        wagers: true,
        Engine: CV.LamiEngine,
        AI:     CV.LamiAI,
        View:   CV.LamiView,

        rules: ['lami.rule1', 'lami.rule2', 'lami.rule3', 'lami.rule4',
                'lami.rule5', 'lami.rule6', 'lami.rule7'],

        extraLabels: {
            lamiRounds: 'Rounds played', lamiWins: 'Rounds won',
            lamiOut: 'Racks emptied', lamiPoints: 'Points left over',
            lamiMelds: 'Melds laid', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'lami-first', name: 'First Meld', icon: '🧩', desc: 'Win your first round of Lami.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.lamiWins || 0) >= 1 },
            { id: 'lami-out', name: 'Clean Rack', icon: '✨', desc: 'Get rid of every tile in your hand.',
              reward: { coins: 700, xp: 150 }, check: (c) => (c.gameStats.extra.lamiOut || 0) >= 1 },
            { id: 'lami-melds', name: 'Table Setter', icon: '🪄', desc: 'Lay 50 melds.',
              reward: { coins: 500, xp: 120 }, check: (c) => (c.gameStats.extra.lamiMelds || 0) >= 50 },
            { id: 'lami-wins-25', name: 'Rummy Hand', icon: '🏆', desc: 'Win 25 rounds of Lami.',
              reward: { coins: 1200, xp: 240 }, check: (c) => (c.gameStats.extra.lamiWins || 0) >= 25 },
        ],
    });
})();
