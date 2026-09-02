/**
 * CardVerse — achievements.
 *
 * A definition is data plus one predicate. Hub-wide ones live here; a game
 * ships its own in its registry entry, so the trophy cabinet grows when a game
 * is added and this file does not change.
 *
 * Predicates are evaluated **after** the game's statistics have been written,
 * so `ctx.gameStats.wins` already includes the round that just finished. They
 * must be pure reads: an achievement that mutates something is an achievement
 * that fires differently depending on what else was checked first.
 */

(() => {
    'use strict';

    const KEY = () => window.CV.Store.KEYS.achievements;

    /** Hub-wide. Game-specific ones come from `game.achievements`. */
    const GLOBAL = [
        {
            id: 'first-game', name: 'Welcome to CardVerse', icon: '🎉',
            desc: 'Play your first game.', reward: { coins: 100, xp: 20 },
            check: (c) => c.profile.totalGames >= 1,
        },
        {
            id: 'first-win', name: 'First Blood', icon: '🩸',
            desc: 'Win your first game.', reward: { coins: 200, xp: 40 },
            check: (c) => c.profile.wins >= 1,
        },
        {
            id: 'streak-3', name: 'On a Roll', icon: '🔥',
            desc: 'Win 3 games in a row.', reward: { coins: 300, xp: 60 },
            check: (c) => c.profile.bestStreak >= 3,
        },
        {
            id: 'streak-5', name: 'Hot Hand', icon: '🌋',
            desc: 'Win 5 games in a row.', reward: { coins: 600, xp: 120 },
            check: (c) => c.profile.bestStreak >= 5,
        },
        {
            id: 'streak-10', name: 'Unstoppable', icon: '🏅',
            desc: 'Win 10 games in a row.', reward: { coins: 2000, xp: 400 },
            check: (c) => c.profile.bestStreak >= 10,
        },
        {
            id: 'games-50', name: 'Regular', icon: '🪑',
            desc: 'Play 50 games.', reward: { coins: 500, xp: 100 },
            check: (c) => c.profile.totalGames >= 50,
        },
        {
            id: 'games-250', name: 'Table Veteran', icon: '🛡️',
            desc: 'Play 250 games.', reward: { coins: 2500, xp: 500 },
            check: (c) => c.profile.totalGames >= 250,
        },
        {
            id: 'level-10', name: 'Getting Serious', icon: '🎯',
            desc: 'Reach level 10.', reward: { coins: 1000, xp: 0 },
            check: (c) => c.profile.level >= 10,
        },
        {
            id: 'level-30', name: 'Expert', icon: '💎',
            desc: 'Reach level 30.', reward: { coins: 5000, xp: 0 },
            check: (c) => c.profile.level >= 30,
        },
        {
            id: 'rich-25k', name: 'Deep Pockets', icon: '💰',
            desc: 'Hold 25,000 coins at once.', reward: { coins: 1000, xp: 100 },
            check: (c) => c.profile.coins >= 25000,
        },
        {
            id: 'sampler', name: 'Around the Verse', icon: '🧭',
            desc: 'Play every game in the hub at least once.',
            reward: { coins: 1500, xp: 300 },
            check: (c) => window.CV.Registry.playable()
                .every((g) => (c.stats[g.code] || {}).played > 0),
        },
        {
            id: 'high-roller', name: 'High Roller', icon: '👑',
            desc: 'Win a hand in the Master Room.', reward: { coins: 2000, xp: 250 },
            check: (c) => c.entry.room === 'master' && c.entry.outcome === 'win',
        },
    ];

    let unlocked = null;   // { id: timestamp }

    function load() {
        unlocked = window.CV.Store.get(KEY(), {}) || {};
        return unlocked;
    }

    const save = () => window.CV.Store.set(KEY(), unlocked);

    /** Every definition in the hub, global first then per game. */
    function all() {
        const out = GLOBAL.map((a) => Object.assign({ game: null }, a));
        for (const game of window.CV.Registry.all()) {
            for (const a of (game.achievements || [])) {
                out.push(Object.assign({ game: game.code }, a));
            }
        }
        return out;
    }

    function get(id) { return all().find((a) => a.id === id) || null; }

    function has(id) {
        if (!unlocked) load();
        return !!unlocked[id];
    }

    const earnedAt = (id) => (unlocked || load())[id] || null;

    /**
     * Run every locked achievement's predicate against the context of the game
     * just finished, unlock what passes, and pay for it.
     *
     * @returns {Array} the definitions unlocked by this call, for the result screen
     */
    function evaluate(ctx) {
        if (!unlocked) load();
        const won = [];
        for (const def of all()) {
            if (unlocked[def.id]) continue;
            // A game's own trophies are judged only on that game's rounds —
            // `ctx.gameStats` and `ctx.mine` belong to the game just played,
            // and a Blackjack win must not unlock "first game of 21".
            if (def.game && def.game !== ctx.entry.game) continue;
            let hit = false;
            try { hit = !!def.check(ctx); }
            catch (_) { hit = false; }   // a game's bad predicate must not stop the others
            if (!hit) continue;
            unlocked[def.id] = Date.now();
            won.push(def);
        }
        if (won.length) {
            save();
            for (const def of won) {
                if (def.reward && def.reward.coins) window.CV.Profile.addCoins(def.reward.coins);
                if (def.reward && def.reward.xp)    window.CV.Profile.addXp(def.reward.xp);
            }
        }
        return won;
    }

    function progress() {
        const list = all();
        const done = list.filter((a) => has(a.id)).length;
        return { done, total: list.length, pct: list.length ? (done / list.length) * 100 : 0 };
    }

    function replace(next) {
        unlocked = next || {};
        return save();
    }

    window.CV = window.CV || {};
    window.CV.Achievements = {
        GLOBAL, load, save, all, get, has, earnedAt, evaluate, progress, replace,
    };
})();
