/**
 * CardVerse — 锄大D's entry in the hub.
 *
 * The rules do not price a round, so the settlement is the one the game is
 * normally played for: each loser pays the room's stake for every card still
 * in their hand, and the winner collects. Thirteen cards left at the
 * beginner's stake is 130 coins; a clean sweep of the table is 390. Nobody
 * is taken below zero — see `settleCoins`.
 *
 * Virtual coins only, in both directions.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /**
     * A solid 2 of spades, drawn rather than borrowed: the Unicode
     * playing-card glyphs render as thin hollow outlines at tile size.
     */
    const ICON =
        '<svg class="icon-card" viewBox="0 0 26 36" aria-label="2 of spades">' +
        '<rect x="1" y="1" width="24" height="34" rx="4" fill="#fff"/>' +
        '<text x="4" y="12" class="ic-r">2</text>' +
        '<text x="22" y="32" class="ic-r ic-b">2</text>' +
        '<text x="13" y="26" class="ic-p">♠</text></svg>';

    CV.Registry.add({
        code: 'bigtwo',
        name: '锄大D',
        icon: ICON,
        blurb: 'Big Two. The 3♦ opens, suits decide, first hand empty wins.',
        category: 'cards',
        players: [4, 4],
        wagers: true,
        Engine: CV.BigTwoEngine,
        AI:     CV.BigTwoAI,
        View:   CV.BigTwoView,

        rules: ['b2.rule1', 'b2.rule2', 'b2.rule3', 'b2.rule4',
                'b2.rule5', 'b2.rule6', 'b2.rule7', 'b2.rule8'],

        extraLabels: {
            b2Rounds: 'Rounds played', b2Wins: 'Rounds won',
            b2Straights: 'Straights', b2Flushes: 'Flushes', b2Houses: 'Full houses',
            b2Quads: 'Four of a kind', b2StraightFlushes: 'Straight flushes',
            b2Clean: 'Clean sweeps', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'b2-first', name: 'First Out', icon: '🂡', desc: 'Win your first round of 锄大D.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.b2Wins || 0) >= 1 },
            { id: 'b2-flush', name: '同花', icon: '💠', desc: 'Play a flush.',
              reward: { coins: 250, xp: 60 }, check: (c) => (c.gameStats.extra.b2Flushes || 0) >= 1 },
            { id: 'b2-quads', name: '四条', icon: '🧨', desc: 'Play four of a kind.',
              reward: { coins: 450, xp: 100 }, check: (c) => (c.gameStats.extra.b2Quads || 0) >= 1 },
            { id: 'b2-sf', name: '同花顺', icon: '🌟', desc: 'Play a straight flush — the best hand in the game.',
              reward: { coins: 900, xp: 180 }, check: (c) => (c.gameStats.extra.b2StraightFlushes || 0) >= 1 },
            { id: 'b2-clean', name: 'Clean Sweep', icon: '🧹', desc: 'Win a round before anyone else plays a card.',
              reward: { coins: 1200, xp: 240 }, check: (c) => (c.gameStats.extra.b2Clean || 0) >= 1 },
            { id: 'b2-wins-25', name: 'Table Boss', icon: '👑', desc: 'Win 25 rounds of 锄大D.',
              reward: { coins: 1200, xp: 240 }, check: (c) => (c.gameStats.extra.b2Wins || 0) >= 25 },
        ],
    });
})();
