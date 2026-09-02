/**
 * CardVerse — 21's entry in the hub. Shares Blackjack's table view; the
 * `simple` flag is how the view knows to say less.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'twentyone',
        name: '21',
        icon: '🔢',
        blurb: 'Hit or stand. Exactly 21 wins outright.',
        category: 'cards',
        players: [1, 5],
        wagers: true,
        simple: true,
        Engine: CV.TwentyOneEngine,
        AI:     CV.TwentyOneAI,
        View:   CV.BlackjackView,

        extraLabels: {
            twentyones: 'Exact 21s', blackjacks: 'Dealt 21', busts: 'Busts', dealerBusts: 'Dealer busts seen', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'to-first', name: 'Nice Round Number', icon: '🔢', desc: 'Win your first game of 21.',
              reward: { coins: 150, xp: 40 }, check: (c) => c.gameStats.wins >= 1 },
            { id: 'to-exact', name: 'On the Nose', icon: '🎯', desc: 'Hit exactly 21.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.twentyones || 0) + (c.gameStats.extra.blackjacks || 0) >= 1 },
            { id: 'to-exact-25', name: 'Sharpshooter', icon: '🏹', desc: 'Hit exactly 21 twenty-five times.',
              reward: { coins: 1200, xp: 250 }, check: (c) => (c.gameStats.extra.twentyones || 0) + (c.gameStats.extra.blackjacks || 0) >= 25 },
            { id: 'to-wins-50', name: 'Twenty-One Regular', icon: '🪑', desc: 'Win 50 games of 21.',
              reward: { coins: 1000, xp: 200 }, check: (c) => c.gameStats.wins >= 50 },
            { id: 'to-streak-5', name: 'Five Alive', icon: '🖐️', desc: 'Win 5 games of 21 in a row.',
              reward: { coins: 600, xp: 120 }, check: (c) => c.gameStats.bestStreak >= 5 },
        ],
    });
})();
