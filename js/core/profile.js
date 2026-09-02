/**
 * CardVerse — the player: coins, XP, level, streak.
 *
 * Coins are **virtual only**. There is no purchase, no top-up, no cash-out and
 * no path from a coin to money in either direction, and that is a design
 * constraint rather than a feature not yet built. It is what keeps CardVerse a
 * card hub instead of a gambling product. If a future screen ever needs a
 * "buy coins" button, that is the moment to stop and reconsider the whole app,
 * not a small feature request.
 *
 * The level curve is `500 + level × 250` XP to advance, which puts level 18 at
 * 5,000 XP to next — the figure in the spec's own mock-up.
 */

(() => {
    'use strict';

    const KEY = () => window.CV.Store.KEYS.profile;

    /** The rank names shown beside the level number. */
    const TITLES = [
        { at: 100, name: 'Legend',  icon: '🌟' },
        { at: 50,  name: 'Master',  icon: '👑' },
        { at: 30,  name: 'Expert',  icon: '💎' },
        { at: 20,  name: 'Veteran', icon: '🛡️' },
        { at: 10,  name: 'Player',  icon: '🎯' },
        { at: 5,   name: 'Beginner', icon: '🌿' },
        { at: 1,   name: 'Novice',  icon: '🥚' },
    ];

    const STARTING_COINS = 5000;

    /** Win-streak milestones, paid once each time the streak reaches them. */
    const STREAK_XP = { 1: 10, 3: 50, 5: 100, 10: 200 };

    function blank() {
        return {
            id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name: 'Player',
            avatar: '🙂',
            level: 1,
            xp: 0,
            coins: STARTING_COINS,
            created: new Date().toISOString(),
            totalGames: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            streak: 0,
            bestStreak: 0,
            favourite: null,
        };
    }

    let state = null;

    function load() {
        state = Object.assign(blank(), window.CV.Store.get(KEY(), null) || {});
        return state;
    }

    function save() {
        return window.CV.Store.set(KEY(), state);
    }

    function get() {
        if (!state) load();
        return state;
    }

    const xpForLevel = (level) => 500 + level * 250;

    function titleFor(level) {
        return TITLES.find((t) => level >= t.at) || TITLES[TITLES.length - 1];
    }

    /** Fraction through the current level, for the XP bar. */
    function levelProgress() {
        const p = get();
        return { xp: p.xp, need: xpForLevel(p.level), pct: Math.min(100, (p.xp / xpForLevel(p.level)) * 100) };
    }

    /**
     * Add XP and level up as many times as it earns.
     * Each level pays `level × 100` coins — the reason levelling is felt.
     * @returns {{levels:number, coins:number}} what the gain produced
     */
    function addXp(amount) {
        const p = get();
        if (!amount) return { levels: 0, coins: 0 };
        p.xp += Math.round(amount);
        let levels = 0, coins = 0;
        while (p.xp >= xpForLevel(p.level)) {
            p.xp -= xpForLevel(p.level);
            p.level++;
            levels++;
            coins += p.level * 100;
        }
        if (coins) p.coins += coins;
        save();
        return { levels, coins };
    }

    function addCoins(amount) {
        const p = get();
        p.coins = Math.max(0, p.coins + Math.round(amount));
        save();
        return p.coins;
    }

    const canAfford = (amount) => get().coins >= amount;

    /** Take coins if they are there. Returns false and takes nothing if not. */
    function spend(amount) {
        const p = get();
        if (p.coins < amount) return false;
        p.coins -= amount;
        save();
        return true;
    }

    /**
     * Record one finished game.
     * @param {'win'|'loss'|'draw'} outcome
     * @returns {{streak:number, milestone:number}} milestone is XP earned by the streak
     */
    function recordGame(gameCode, outcome) {
        const p = get();
        p.totalGames++;
        if (outcome === 'win')       { p.wins++;   p.streak++; }
        else if (outcome === 'loss') { p.losses++; p.streak = 0; }
        else                         { p.draws++; }   // a push breaks nothing

        if (p.streak > p.bestStreak) p.bestStreak = p.streak;

        const milestone = (outcome === 'win' && STREAK_XP[p.streak]) ? STREAK_XP[p.streak] : 0;
        p.favourite = window.CV.Stats.mostPlayed() || gameCode;
        save();
        return { streak: p.streak, milestone };
    }

    const winRate = () => {
        const p = get();
        const decided = p.wins + p.losses;
        return decided ? (p.wins / decided) * 100 : 0;
    };

    function rename(name) {
        const clean = String(name || '').trim().slice(0, 16);
        if (!clean) return false;
        get().name = clean;
        return save();
    }

    function setAvatar(emoji) {
        get().avatar = emoji;
        return save();
    }

    /** Used by Import — replace wholesale, never merge two histories. */
    function replace(next) {
        state = Object.assign(blank(), next || {});
        return save();
    }

    window.CV = window.CV || {};
    window.CV.Profile = {
        TITLES, STREAK_XP, STARTING_COINS,
        load, save, get, replace,
        xpForLevel, titleFor, levelProgress,
        addXp, addCoins, canAfford, spend,
        recordGame, winRate, rename, setAvatar,
    };
})();
