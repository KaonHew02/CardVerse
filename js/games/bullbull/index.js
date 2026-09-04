/**
 * CardVerse — 斗牛's entry in the hub.
 *
 * One bet, five cards, and a comparison against the dealer. What a hand is
 * worth comes from the multiplier table in `hands.js`, kept apart from the
 * settlement in `engine.js` exactly as the rules ask.
 *
 * Virtual coins only, in both directions.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'bullbull',
        name: '斗牛',
        icon: '🐮',
        blurb: 'Five cards. Three make ten, the other two make the bull.',
        category: 'cards',
        players: [1, 6],
        wagers: true,
        Engine: CV.BullBullEngine,
        AI:     CV.BullBullAI,
        View:   CV.BullBullView,

        rules: ['bb.rule1', 'bb.rule2', 'bb.rule3', 'bb.rule4',
                'bb.rule5', 'bb.rule6', 'bb.rule7'],

        extraLabels: {
            bbRounds: 'Hands played', bbWins: 'Hands won', bbBull: '牛牛',
            bbBaby: '宝宝', bbPicAce: 'Pic + Black Ace', bbFivePic: '五个 Pic',
            bbNoBull: '无牛', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'bb-first', name: '开牛', icon: '🐮', desc: 'Win your first hand of 斗牛.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.bbWins || 0) >= 1 },
            { id: 'bb-bull', name: '牛牛', icon: '🐂', desc: 'Land a 牛牛 — the two left over make a round ten.',
              reward: { coins: 350, xp: 80 }, check: (c) => (c.gameStats.extra.bbBull || 0) >= 1 },
            { id: 'bb-baby', name: '宝宝', icon: '👶', desc: 'Land a 宝宝 — a pair left over.',
              reward: { coins: 400, xp: 90 }, check: (c) => (c.gameStats.extra.bbBaby || 0) >= 1 },
            { id: 'bb-picace', name: 'Pic + Black Ace', icon: '🖤', desc: 'A picture card and a black ace left over.',
              reward: { coins: 800, xp: 160 }, check: (c) => (c.gameStats.extra.bbPicAce || 0) >= 1 },
            { id: 'bb-fivepic', name: '五个 Pic', icon: '👑', desc: 'Five picture cards. The best hand there is.',
              reward: { coins: 2000, xp: 400 }, check: (c) => (c.gameStats.extra.bbFivePic || 0) >= 1 },
            { id: 'bb-wins-50', name: '牛人', icon: '🏆', desc: 'Win 50 hands of 斗牛.',
              reward: { coins: 1200, xp: 240 }, check: (c) => (c.gameStats.extra.bbWins || 0) >= 50 },
        ],
    });
})();
