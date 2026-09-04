/**
 * CardVerse — the list of games, and the rooms they are played in.
 *
 * Adding a game is one `CV.Registry.add({...})` call from that game's own
 * folder. Nothing in the lobby, the statistics screen, the achievement list or
 * the save layer is edited to make a new game appear; they all read this. That
 * is the "new games can be added without changing the core" requirement made
 * literal, and it is worth defending — the moment the lobby special-cases a
 * game code, the next game costs twice as much.
 */

(() => {
    'use strict';

    /**
     * Rooms are shared across the hub so a player learns them once.
     *
     * `entry` is a table fee, taken when you sit and not returned. It is the
     * coin sink that keeps the daily bonus from being pure inflation, and the
     * reason a Master seat feels like a decision. `bet` bounds the stake for
     * wagering games; `xp` scales the reward for the risk.
     */
    const ROOMS = [
        { id: 'beginner', name: 'Beginner Room', icon: '🌱', entry: 0,    bet: [10, 50],     xp: 1,   blurb: 'Free to sit. Learn the game.' },
        { id: 'casual',   name: 'Casual Room',   icon: '🎲', entry: 100,  bet: [50, 250],    xp: 1.25, blurb: 'Small stakes, real swings.' },
        { id: 'pro',      name: 'Pro Room',      icon: '💼', entry: 500,  bet: [250, 1000],  xp: 1.6,  blurb: 'For players who know the odds.' },
        { id: 'master',   name: 'Master Room',   icon: '👑', entry: 2000, bet: [1000, 5000], xp: 2.2,  blurb: 'Deep pockets only.' },
    ];

    const games = new Map();
    const order = [];

    const Registry = {
        ROOMS,

        /**
         * @param {object} game
         * @param {string} game.code      unique key, also the stats key
         * @param {string} game.name      shown in the lobby
         * @param {string} game.icon      emoji, or inline SVG for a drawn one
         * @param {string} game.blurb     one line under the title
         * @param {string} game.category  'cards' | 'tiles'
         * @param {number[]} game.players [min, max]
         * @param {Function} game.Engine  extends CV.GameEngine
         * @param {Function} [game.AI]    extends CV.AIPlayer
         * @param {Function} game.View    builds the table screen
         * @param {boolean} [game.wagers] true if the game takes a bet per hand
         * @param {boolean} [game.ready]  false parks it in the lobby as "Coming soon"
         */
        add(game) {
            const entry = Object.assign({
                category: 'cards',
                players: [1, 4],
                wagers: false,
                ready: true,
                rooms: ROOMS.map((r) => r.id),
                achievements: [],
            }, game);
            // Most icons are an emoji, which any context can take. A drawn one
            // is markup, and a <select> option or a textContent assignment
            // would print its source — so those places get a blank instead and
            // show the name alone.
            entry.iconText = /^\s*</.test(String(entry.icon)) ? '' : entry.icon;
            games.set(entry.code, entry);
            if (!order.includes(entry.code)) order.push(entry.code);
            return entry;
        },

        get(code) { return games.get(code) || null; },

        /** Every game, in registration order — including the not-yet-built ones. */
        all() { return order.map((c) => games.get(c)); },

        playable() { return this.all().filter((g) => g.ready); },

        room(id) { return ROOMS.find((r) => r.id === id) || ROOMS[0]; },

        /** Rooms this game offers, as objects. */
        roomsFor(code) {
            const game = this.get(code);
            if (!game) return ROOMS;
            return ROOMS.filter((r) => game.rooms.includes(r.id));
        },

        /**
         * Placeholder card for a game in the spec that has no engine yet. The
         * lobby shows these greyed rather than hiding them: the hub is a
         * promise about what is coming, and a hidden game reads as a game that
         * was cut.
         */
        stub(code, name, icon, blurb, players) {
            return this.add({ code, name, icon, blurb, players, ready: false, Engine: null, View: null });
        },
    };

    window.CV = window.CV || {};
    window.CV.Registry = Registry;
})();
