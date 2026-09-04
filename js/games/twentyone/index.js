/**
 * CardVerse — 21's entry in the hub.
 *
 * A standalone game with its own engine, AI and table. It is not a variant of
 * anything: no natural, no special two-card 21, no insurance, no split, no
 * surrender. Totals, DOUBLE, and 五龙.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'twentyone',
        name: '21',
        icon: '🃏',
        blurb: 'Get closer to 21 than the dealer. Five cards under 21 beats everything.',
        category: 'cards',
        players: [1, 5],
        wagers: true,
        Engine: CV.TwentyOneEngine,
        AI:     CV.TwentyOneAI,
        View:   CV.TwentyOneView,

        rules: ['to.rule1', 'to.rule2', 'to.rule3', 'to.rule4', 'to.rule5', 'to.rule6'],

        extraLabels: {
            dragons: '五龙 hands', dragonWins: '五龙 wins', exact21: 'Reached exactly 21',
            busts: 'Busts', doubles: 'Doubles', dealerBusts: 'Dealer busts seen',
            forfeits: 'Walked away',
        },

        achievements: [
            { id: 'to-first', name: 'Nice Round Number', icon: '🔢', desc: 'Win your first hand of 21.',
              reward: { coins: 150, xp: 40 }, check: (c) => c.gameStats.wins >= 1 },
            { id: 'to-exact', name: 'On the Nose', icon: '🎯', desc: 'Reach exactly 21.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.exact21 || 0) >= 1 },
            { id: 'to-dragons', name: '五龙', icon: '🐉', desc: 'Make Five Dragons — five cards, 21 or under.',
              reward: { coins: 500, xp: 100 }, check: (c) => (c.gameStats.extra.dragons || 0) >= 1 },
            { id: 'to-dragons-10', name: 'Dragon Keeper', icon: '🐲', desc: 'Win with Five Dragons ten times.',
              reward: { coins: 2000, xp: 350 }, check: (c) => (c.gameStats.extra.dragonWins || 0) >= 10 },
            { id: 'to-double-win', name: 'Double Trouble', icon: '⏫', desc: 'Win a hand after doubling.',
              reward: { coins: 250, xp: 60 }, check: (c) => c.entry.outcome === 'win' && (c.mine.extra.doubles || 0) >= 1 },
            { id: 'to-wins-50', name: 'Twenty-One Regular', icon: '🪑', desc: 'Win 50 hands of 21.',
              reward: { coins: 1000, xp: 200 }, check: (c) => c.gameStats.wins >= 50 },
            { id: 'to-streak-5', name: 'Five Alive', icon: '🖐️', desc: 'Win 5 hands of 21 in a row.',
              reward: { coins: 600, xp: 120 }, check: (c) => c.gameStats.bestStreak >= 5 },
        ],
    });
})();
