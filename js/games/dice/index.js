/**
 * CardVerse — 骰子's entry in the hub.
 *
 * Three dice, three things to back. The reading is fixed by the rules and
 * checked exhaustively; the odds are not settled yet and live in one place —
 * `PAYS` in `dice.js`.
 *
 * Virtual coins only, in both directions.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'dice',
        name: '骰子',
        icon: '🎲',
        blurb: 'Three dice. Back 大, 小 or 围骰 and watch them land.',
        category: 'dice',
        players: [1, 6],
        wagers: true,
        Engine: CV.DiceEngine,
        AI:     CV.DiceAI,
        View:   CV.DiceView,

        rules: ['dice.rule1', 'dice.rule2', 'dice.rule3', 'dice.rule4', 'dice.rule5'],

        extraLabels: {
            diceRounds: 'Throws', diceWins: 'Throws won',
            diceBig: 'Backed 大', diceSmall: 'Backed 小',
            diceTripleBets: 'Backed 围骰', diceTripleHits: '围骰 hit',
            diceSeen: '围骰 thrown', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'dice-first', name: '开门红', icon: '🎲', desc: 'Win your first throw.',
              reward: { coins: 150, xp: 40 }, check: (c) => (c.gameStats.extra.diceWins || 0) >= 1 },
            { id: 'dice-triple', name: '围骰', icon: '💥', desc: 'Back 围骰 and hit it — one throw in thirty-six.',
              reward: { coins: 2000, xp: 400 }, check: (c) => (c.gameStats.extra.diceTripleHits || 0) >= 1 },
            { id: 'dice-seen', name: '豹子出现', icon: '👀', desc: 'Be at the table for ten 围骰.',
              reward: { coins: 600, xp: 130 }, check: (c) => (c.gameStats.extra.diceSeen || 0) >= 10 },
            { id: 'dice-wins-50', name: '骰王', icon: '🏆', desc: 'Win 50 throws.',
              reward: { coins: 1000, xp: 200 }, check: (c) => (c.gameStats.extra.diceWins || 0) >= 50 },
        ],
    });
})();
