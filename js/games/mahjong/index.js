/**
 * CardVerse — 麻将's entry in the hub.
 *
 * The seat count picks the mode, because that is exactly what it is: three
 * seats is the 108-tile game and four is the 136-tile one. The setup screen's
 * opponent choice is therefore the mode selector, and nothing else needs to
 * know which is which.
 *
 * Payment lives in `pay.js` and the fan table in `fan.js`, both configurable
 * without touching the engine. One 番 is one point and a point is the room's
 * stake, so a 8番 hand at the beginner table moves 80 coins a side, doubled
 * when the dealer is on one end of it. Virtual chips only.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'mahjong',
        name: 'Mahjong',
        icon: '🀄',
        blurb: 'Four melds and a pair. Three seats play dots and fly; four play the full set.',
        category: 'tiles',
        players: [3, 4],
        wagers: true,
        Engine: CV.MahjongEngine,
        AI:     CV.MahjongAI,
        View:   CV.MahjongView,

        // The table's stake is a coin value per 番, in the 0.20 / 0.50 / 1.00
        // shape the game is normally played at, scaled by the room.
        setupOptions: [{
            key: 'unitStep',
            label: 'mj.fanUnit',
            note: 'mj.fanUnitNote',
            def: 2,
            choices: (room) => [2, 5, 10].map((n) => ({ value: n, label: '🪙 ' + (n * room.bet[0]) })),
        }],

        rules: ['mj.rule1', 'mj.rule11', 'mj.rule12', 'mj.rule2', 'mj.rule3', 'mj.rule4',
                'mj.rule5', 'mj.rule6', 'mj.rule7', 'mj.rule8', 'mj.rule9', 'mj.rule10'],

        extraLabels: {
            mjRounds: 'Hands played', mjWins: 'Hands won', mjSelfDraw: '自摸',
            mjDealtIn: 'Dealt in', mjDraws: '流局', mjFan: 'Total 番',
            mjBig: 'Hands of 8番 or more', mjBao: '爆番', mjKongs: 'Kongs',
            mjFlowers: 'Flowers drawn', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'mj-first', name: '和了', icon: '🀄', desc: 'Win your first hand of mahjong.',
              reward: { coins: 250, xp: 60 }, check: (c) => (c.gameStats.extra.mjWins || 0) >= 1 },
            { id: 'mj-selfdraw', name: '自摸', icon: '🎴', desc: 'Draw your own winning tile.',
              reward: { coins: 350, xp: 80 }, check: (c) => (c.gameStats.extra.mjSelfDraw || 0) >= 1 },
            { id: 'mj-kong', name: '杠', icon: '🧱', desc: 'Declare a kong.',
              reward: { coins: 250, xp: 60 }, check: (c) => (c.gameStats.extra.mjKongs || 0) >= 1 },
            { id: 'mj-big', name: '大牌', icon: '💮', desc: 'Win a hand worth 8番 or more.',
              reward: { coins: 900, xp: 180 }, check: (c) => (c.gameStats.extra.mjBig || 0) >= 1 },
            { id: 'mj-pure', name: '清一色', icon: '🟩', desc: 'Win with every tile in one suit.',
              reward: { coins: 800, xp: 160 },
              check: (c) => c.entry.outcome === 'win' && /清一色|清碰|清七对/.test(c.mine.note || '') },
            { id: 'mj-bao', name: '爆番', icon: '💥', desc: 'Win a hand of 10番 or more.',
              reward: { coins: 1600, xp: 320 }, check: (c) => (c.gameStats.extra.mjBao || 0) >= 1 },
            { id: 'mj-wins-25', name: '雀士', icon: '🏮', desc: 'Win 25 hands of mahjong.',
              reward: { coins: 1500, xp: 300 }, check: (c) => (c.gameStats.extra.mjWins || 0) >= 25 },
        ],
    });
})();
