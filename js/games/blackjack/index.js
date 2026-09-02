/**
 * CardVerse — Blackjack's entry in the hub.
 *
 * This file is the whole of what the hub knows about Blackjack. The lobby
 * card, the statistics page, the trophy cabinet and the save format all read
 * it; none of them mention the game by name anywhere else.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'blackjack',
        name: 'Blackjack',
        icon: '🃏',
        blurb: 'Beat the dealer. Split, double, surrender.',
        category: 'cards',
        players: [1, 5],
        wagers: true,
        Engine: CV.BlackjackEngine,
        AI:     CV.BlackjackAI,
        View:   CV.BlackjackView,

        /** Labels for the `extra` counters the engine reports. */
        extraLabels: {
            blackjacks: 'Blackjacks', busts: 'Busts', doubles: 'Doubles',
            splits: 'Splits', dealerBusts: 'Dealer busts seen', surrenders: 'Surrenders', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'bj-first', name: 'Beat the House', icon: '🃏', desc: 'Win your first Blackjack hand.',
              reward: { coins: 150, xp: 40 }, check: (c) => c.gameStats.wins >= 1 },
            { id: 'bj-natural', name: 'Natural', icon: '✨', desc: 'Be dealt a blackjack.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.blackjacks || 0) >= 1 },
            { id: 'bj-natural-25', name: 'Twenty-One Club', icon: '🎩', desc: 'Be dealt 25 blackjacks.',
              reward: { coins: 1500, xp: 300 }, check: (c) => (c.gameStats.extra.blackjacks || 0) >= 25 },
            { id: 'bj-split-win', name: 'Divide and Conquer', icon: '✂️', desc: 'Win a hand after splitting.',
              reward: { coins: 250, xp: 60 }, check: (c) => c.entry.outcome === 'win' && (c.mine.extra.splits || 0) >= 1 },
            { id: 'bj-double-win', name: 'Double Trouble', icon: '⏫', desc: 'Win a hand after doubling down.',
              reward: { coins: 250, xp: 60 }, check: (c) => c.entry.outcome === 'win' && (c.mine.extra.doubles || 0) >= 1 },
            { id: 'bj-wins-50', name: 'Card Counter', icon: '🧮', desc: 'Win 50 Blackjack hands.',
              reward: { coins: 1000, xp: 200 }, check: (c) => c.gameStats.wins >= 50 },
            { id: 'bj-wins-200', name: 'Blackjack Master', icon: '👑', desc: 'Win 200 Blackjack hands.',
              reward: { coins: 5000, xp: 800 }, check: (c) => c.gameStats.wins >= 200 },
            { id: 'bj-streak-5', name: 'Dealer’s Nightmare', icon: '😈', desc: 'Win 5 Blackjack hands in a row.',
              reward: { coins: 600, xp: 120 }, check: (c) => c.gameStats.bestStreak >= 5 },
        ],
    });
})();
