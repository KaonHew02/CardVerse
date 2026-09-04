/**
 * CardVerse — Texas Hold'em's entry in the hub.
 *
 * Blinds come from the room: the big blind is the room's minimum bet and the
 * small blind is half of it. You sit down with a hundred big blinds or your
 * whole balance, whichever is smaller — the standard cash-game buy-in, which
 * is also what keeps one bad all-in from emptying an account.
 *
 * Virtual chips only, in both directions.
 */

(() => {
    'use strict';

    const CV = window.CV;

    CV.Registry.add({
        code: 'poker',
        name: 'Poker',
        icon: '♠️',
        blurb: "Texas Hold'em. Two cards each, five on the table, best five win.",
        category: 'cards',
        players: [2, 9],
        wagers: true,
        Engine: CV.PokerEngine,
        AI:     CV.PokerAI,
        View:   CV.PokerView,

        rules: ['pk.rule1', 'pk.rule2', 'pk.rule3', 'pk.rule4',
                'pk.rule5', 'pk.rule6', 'pk.rule7', 'pk.rule8'],

        extraLabels: {
            pkHands: 'Hands played', pkWins: 'Pots won', pkShowdowns: 'Showdowns',
            pkFolds: 'Hands folded', pkAllIns: 'All-ins', pkBig: 'Flush or better',
            pkRoyal: 'Royal flushes', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'pk-first', name: 'First Pot', icon: '♠️', desc: 'Win your first pot.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.pkWins || 0) >= 1 },
            { id: 'pk-showdown', name: 'Called', icon: '👀', desc: 'Win a pot at showdown.',
              reward: { coins: 300, xp: 70 },
              check: (c) => c.entry.outcome === 'win' && (c.mine.extra.pkShowdowns || 0) >= 1 },
            { id: 'pk-allin', name: 'All In', icon: '🎲', desc: 'Put your whole stack in and win it back.',
              reward: { coins: 500, xp: 110 },
              check: (c) => c.entry.outcome === 'win' && (c.mine.extra.pkAllIns || 0) >= 1 },
            { id: 'pk-big', name: 'Big Hand', icon: '💎', desc: 'Show down a flush or better.',
              reward: { coins: 450, xp: 100 }, check: (c) => (c.gameStats.extra.pkBig || 0) >= 1 },
            { id: 'pk-royal', name: 'Royal Flush', icon: '👑', desc: 'Show down a royal flush. It happens once.',
              reward: { coins: 5000, xp: 800 }, check: (c) => (c.gameStats.extra.pkRoyal || 0) >= 1 },
            { id: 'pk-wins-50', name: 'Grinder', icon: '🃏', desc: 'Win 50 pots.',
              reward: { coins: 1500, xp: 300 }, check: (c) => (c.gameStats.extra.pkWins || 0) >= 50 },
        ],
    });
})();
