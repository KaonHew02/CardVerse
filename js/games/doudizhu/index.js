/**
 * CardVerse — 斗地主's entry in the hub.
 *
 * The stake is the room's minimum, and it buys one *point*. A game is worth
 * base × multiplier points, the Landlord's swing being twice a Farmer's, so
 * a 3-point hand with a bomb and a spring in it moves real numbers. Nobody
 * can be taken below zero — see `settleCoins`.
 *
 * Virtual coins only, in both directions.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'doudizhu',
        name: '斗地主',
        icon: '👑',
        blurb: 'Landlord against two Farmers. Bombs, rockets and a spring.',
        category: 'cards',
        players: [3, 3],
        wagers: true,
        Engine: CV.DouDiZhuEngine,
        AI:     CV.DouDiZhuAI,
        View:   CV.DouDiZhuView,

        rules: ['ddz.rule1', 'ddz.rule2', 'ddz.rule3', 'ddz.rule4',
                'ddz.rule5', 'ddz.rule6', 'ddz.rule7', 'ddz.rule8'],

        extraLabels: {
            ddzRounds: 'Rounds played', ddzLandlord: 'Games as 地主',
            ddzLandlordWins: '地主 wins', ddzFarmerWins: '农民 wins',
            ddzBombs: 'Bombs played', ddzRockets: '王炸 played',
            ddzSprings: '春天', ddzAnti: '反春', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'ddz-first', name: 'Cards on the Table', icon: '👑', desc: 'Win your first game of 斗地主.',
              game: 'doudizhu', reward: { coins: 200, xp: 50 },
              check: (c) => c.entry.outcome === 'win' },
            { id: 'ddz-landlord', name: '地主', icon: '🏯', desc: 'Win a game as the Landlord.',
              reward: { coins: 400, xp: 90 },
              check: (c) => (c.gameStats.extra.ddzLandlordWins || 0) >= 1 },
            { id: 'ddz-bomb', name: '炸弹', icon: '💣', desc: 'Drop a bomb.',
              reward: { coins: 250, xp: 60 },
              check: (c) => (c.gameStats.extra.ddzBombs || 0) >= 1 },
            { id: 'ddz-rocket', name: '王炸', icon: '🚀', desc: 'Play both jokers together.',
              reward: { coins: 500, xp: 110 },
              check: (c) => (c.gameStats.extra.ddzRockets || 0) >= 1 },
            { id: 'ddz-spring', name: '春天', icon: '🌸', desc: 'Take every trick as the Landlord.',
              reward: { coins: 900, xp: 180 },
              check: (c) => (c.gameStats.extra.ddzSprings || 0) >= 1 },
            { id: 'ddz-wins-25', name: 'Old Hand', icon: '🀄', desc: 'Win 25 games of 斗地主.',
              game: 'doudizhu', reward: { coins: 1200, xp: 240 },
              check: (c) => c.gameStats.wins >= 25 },
        ],
    });
})();
