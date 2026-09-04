/**
 * CardVerse — Lami's entry in the hub.
 *
 * Two to four seats. Everyone throws to see who opens the first round; after
 * that the previous winner opens, which is the rule the game is built around.
 *
 * Scoring is the one the rules give: whatever is left in your hand counts
 * against you, and the smallest hand wins. In coins that is — every seat pays
 * its own points at the room's stake, and the smallest hand takes the pot. A
 * player who went out pays nothing and collects it all.
 *
 * Everything the rules leave open lives in `RULES` in `melds.js`, one named
 * constant each. Virtual coins only.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /**
     * A mahjong tile with a jester's face on it — the game is rummy played on
     * tiles, so the icon is a tile rather than a card, with the green edge a
     * tile has when you look at it from the side.
     *
     * Drawn rather than borrowed: 🃏 is already 21's icon and the Unicode
     * tile glyphs come out as thin hollow outlines at this size.
     */
    const ICON =
        '<svg class="icon-tile" viewBox="0 0 30 36" aria-label="Joker tile">' +
        // The side of the tile, and its face.
        '<rect x="1" y="3.5" width="25" height="31.5" rx="4.5" fill="#2f9e5a"/>' +
        '<rect x="4" y="1" width="25" height="31.5" rx="4.5" fill="#fdfdf7"/>' +
        // The cap: three points, three colours, a bell on each.
        '<path d="M9.5 16.5 L6 8.5 L14 13 Z" fill="#3aa856" stroke="#2a2a2a" stroke-width=".8" stroke-linejoin="round"/>' +
        '<path d="M23.5 16.5 L27 8.5 L19 13 Z" fill="#2f7fd8" stroke="#2a2a2a" stroke-width=".8" stroke-linejoin="round"/>' +
        '<path d="M11 14 L16.5 5 L22 14 Z" fill="#e03b3b" stroke="#2a2a2a" stroke-width=".8" stroke-linejoin="round"/>' +
        '<circle cx="6" cy="7.5" r="2.1" fill="#f5b942" stroke="#2a2a2a" stroke-width=".7"/>' +
        '<circle cx="27" cy="7.5" r="2.1" fill="#8e5bd0" stroke="#2a2a2a" stroke-width=".7"/>' +
        '<circle cx="16.5" cy="4.4" r="2.1" fill="#3aa856" stroke="#2a2a2a" stroke-width=".7"/>' +
        // And the face under it, grinning.
        '<circle cx="16.5" cy="21" r="7.4" fill="#f7cf9a" stroke="#2a2a2a" stroke-width=".9"/>' +
        '<circle cx="13.6" cy="19" r="1.1" fill="#2a2a2a"/>' +
        '<circle cx="19.4" cy="19" r="1.1" fill="#2a2a2a"/>' +
        '<circle cx="10.8" cy="22.2" r="1.5" fill="#f08a8a"/>' +
        '<circle cx="22.2" cy="22.2" r="1.5" fill="#f08a8a"/>' +
        '<path d="M11.6 22.4 A5.2 5.2 0 0 0 21.4 22.4 Z" fill="#c0392b" stroke="#2a2a2a" ' +
        'stroke-width=".8" stroke-linejoin="round"/></svg>';

    CV.Registry.add({
        code: 'lami',
        name: 'Lami',
        icon: ICON,
        blurb: 'Rummy on mahjong tiles. Runs, sets, jokers — empty your rack.',
        category: 'tiles',
        players: [2, 4],
        wagers: true,
        Engine: CV.LamiEngine,
        AI:     CV.LamiAI,
        View:   CV.LamiView,

        rules: ['lami.rule1', 'lami.rule2', 'lami.rule3', 'lami.rule4',
                'lami.rule5', 'lami.rule6', 'lami.rule7'],

        extraLabels: {
            lamiRounds: 'Rounds played', lamiWins: 'Rounds won',
            lamiOut: 'Racks emptied', lamiPoints: 'Points left over',
            lamiMelds: 'Melds laid', forfeits: 'Walked away',
        },

        achievements: [
            { id: 'lami-first', name: 'First Meld', icon: '🧩', desc: 'Win your first round of Lami.',
              reward: { coins: 200, xp: 50 }, check: (c) => (c.gameStats.extra.lamiWins || 0) >= 1 },
            { id: 'lami-out', name: 'Clean Rack', icon: '✨', desc: 'Get rid of every tile in your hand.',
              reward: { coins: 700, xp: 150 }, check: (c) => (c.gameStats.extra.lamiOut || 0) >= 1 },
            { id: 'lami-melds', name: 'Table Setter', icon: '🪄', desc: 'Lay 50 melds.',
              reward: { coins: 500, xp: 120 }, check: (c) => (c.gameStats.extra.lamiMelds || 0) >= 50 },
            { id: 'lami-wins-25', name: 'Rummy Hand', icon: '🏆', desc: 'Win 25 rounds of Lami.',
              reward: { coins: 1200, xp: 240 }, check: (c) => (c.gameStats.extra.lamiWins || 0) >= 25 },
        ],
    });
})();
