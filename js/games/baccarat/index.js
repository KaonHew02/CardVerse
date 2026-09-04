/**
 * CardVerse — 百家乐's entry in the hub.
 *
 * `rules` is the how-to-play card shown before a player's first hand; every
 * game carries its own, and the shell shows it once and then on demand.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'baccarat',
        name: '百家乐',
        icon: '🎴',
        blurb: 'Bet on Player, Banker or Tie. No decisions, all nerve.',
        category: 'cards',
        players: [1, 6],
        wagers: true,
        Engine: CV.BaccaratEngine,
        AI:     CV.BaccaratAI,
        View:   CV.BaccaratView,

        /** Keys, resolved at display time so the card follows the language. */
        rules: ['bac.rule1', 'bac.rule2', 'bac.rule3', 'bac.rule4', 'bac.rule5'],

        extraLabels: {
            bacPlayer: 'Player bets', bacBanker: 'Banker bets',
            bacTie: 'Tie bets', bacTieHit: 'Ties hit', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'bac-first', name: 'Punto Banco', icon: '🎴', desc: 'Win your first hand of 百家乐.',
              reward: { coins: 150, xp: 40 }, check: (c) => c.gameStats.wins >= 1 },
            { id: 'bac-tie', name: 'Against the Odds', icon: '🎯', desc: 'Win a Tie bet — it pays 8:1 for a reason.',
              reward: { coins: 800, xp: 150 }, check: (c) => (c.gameStats.extra.bacTieHit || 0) >= 1 },
            { id: 'bac-banker-50', name: 'The House Way', icon: '🏦', desc: 'Back the Banker 50 times.',
              reward: { coins: 600, xp: 120 }, check: (c) => (c.gameStats.extra.bacBanker || 0) >= 50 },
            { id: 'bac-wins-50', name: 'Steady Nerve', icon: '💠', desc: 'Win 50 hands of 百家乐.',
              reward: { coins: 1000, xp: 200 }, check: (c) => c.gameStats.wins >= 50 },
            { id: 'bac-streak-5', name: 'Reading the Shoe', icon: '🔮', desc: 'Win 5 hands of 百家乐 in a row.',
              reward: { coins: 600, xp: 120 }, check: (c) => c.gameStats.bestStreak >= 5 },
        ],
    });
})();
