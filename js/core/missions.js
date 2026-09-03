/**
 * CardVerse — daily missions and the login calendar.
 *
 * Two rules shape this file.
 *
 * **The day is local and it is a date string.** Everything keys off
 * `YYYY-MM-DD` in the player's own timezone, never a rolling 24-hour timer.
 * A player who plays at 9pm and again at 8am the next morning has plainly had
 * two days, and a timer that disagrees feels broken.
 *
 * **Today's missions are derived, not stored.** They are drawn from the pool
 * by an RNG seeded from the date itself, so the same four appear however many
 * times the page is reloaded, and a cleared browser does not hand out a fresh
 * set for the same day. Only *progress* is written down.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const KEY = () => window.CV.Store.KEYS.missions;

    const MISSION_COUNT = 4;

    const today = (d = new Date()) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    /** Stable integer from a date string, to seed the day's draw. */
    function daySeed(key) {
        let h = 2166136261;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /**
     * The pool. `target` is how many of `metric` the day needs.
     * Metrics are counted by `note()` below; a new metric needs a case there.
     */
    const POOL = [
        { id: 'play3',    metric: 'played',   target: 3, icon: '🎮', text: 'Play 3 games',            reward: { coins: 100 } },
        { id: 'play5',    metric: 'played',   target: 5, icon: '🎮', text: 'Play 5 games',            reward: { coins: 200 } },
        { id: 'win2',     metric: 'wins',     target: 2, icon: '🏆', text: 'Win 2 games',             reward: { coins: 200 } },
        { id: 'win4',     metric: 'wins',     target: 4, icon: '🏆', text: 'Win 4 games',             reward: { coins: 400 } },
        { id: 'variety',  metric: 'variety',  target: 2, icon: '🧭', text: 'Play 2 different games',  reward: { xp: 60 } },
        { id: 'variety3', metric: 'variety',  target: 3, icon: '🧭', text: 'Play 3 different games',  reward: { coins: 300, xp: 50 } },
        { id: 'streak2',  metric: 'streak',   target: 2, icon: '🔥', text: 'Win 2 games in a row',    reward: { xp: 80 } },
        { id: 'earn500',  metric: 'earned',   target: 500, icon: '🪙', text: 'Win 500 coins in a day', reward: { xp: 100 } },
        { id: 'casual',   metric: 'roomUp',   target: 1, icon: '🎲', text: 'Play outside the Beginner Room', reward: { coins: 150 } },
    ];

    /** One per playable game — "play X today" — added to the pool at draw time. */
    function gameMissions() {
        return window.CV.Registry.playable().map((g) => ({
            id: 'play-' + g.code,
            metric: 'game:' + g.code,
            target: 1,
            icon: g.icon,
            // Built per call rather than localized once, because the game's
            // own name has already been translated by then.
            text: t('miss.playGame', { name: g.name }),
            reward: { xp: 50 },
        }));
    }

    function blank(day) {
        return { day, counters: {}, claimed: {}, login: { last: null, day: 0, claimedOn: null } };
    }

    let state = null;

    function load() {
        const saved = window.CV.Store.get(KEY(), null);
        state = saved || blank(today());
        if (!state.login) state.login = { last: null, day: 0, claimedOn: null };
        rollover();
        return state;
    }

    const save = () => window.CV.Store.set(KEY(), state);

    function get() { if (!state) load(); return state; }

    /** A new local day wipes the counters but never the login calendar. */
    function rollover() {
        const day = today();
        if (state.day !== day) {
            state.day = day;
            state.counters = {};
            state.claimed  = {};
            save();
        }
    }

    /** The four missions for today — same four all day, on any device. */
    function list() {
        const s = get();
        rollover();
        const pool = POOL.concat(gameMissions());
        const rng  = new window.CV.RNG(daySeed(s.day));
        const draw = rng.shuffle(pool.slice()).slice(0, MISSION_COUNT);
        return draw.map((m) => {
            const have = s.counters[m.metric] || 0;
            return Object.assign({}, m, {
                have: Math.min(have, m.target),
                done: have >= m.target,
                claimed: !!s.claimed[m.id],
            });
        });
    }

    function bump(metric, by = 1) {
        const s = get();
        s.counters[metric] = (s.counters[metric] || 0) + by;
    }

    /**
     * Fold one finished game into today's counters.
     * @param {object} entry { game, outcome, coins, room }
     */
    function note(entry) {
        const s = get();
        rollover();

        bump('played');
        bump('game:' + entry.game);
        if (entry.outcome === 'win') bump('wins');
        if (entry.coins > 0) bump('earned', entry.coins);
        if (entry.room && entry.room !== 'beginner') bump('roomUp');

        // Variety is a set, not a tally — replaying one game all day is not variety.
        s.counters.variety = window.CV.Stats.playedToday().size;

        // Streak is the profile's live figure, not an accumulation.
        s.counters.streak = Math.max(s.counters.streak || 0, window.CV.Profile.get().streak);

        save();
        return list();
    }

    /** Hand over a completed mission's reward, once. */
    function claim(id) {
        const s = get();
        const mission = list().find((m) => m.id === id);
        if (!mission || !mission.done || mission.claimed) return null;
        s.claimed[id] = Date.now();
        save();
        if (mission.reward.coins) window.CV.Profile.addCoins(mission.reward.coins);
        if (mission.reward.xp)    window.CV.Profile.addXp(mission.reward.xp);
        return mission;
    }

    const unclaimed = () => list().filter((m) => m.done && !m.claimed).length;

    /* ---- daily login ---------------------------------------------------- */

    /** The 7-day cycle from the spec. Day 7 restarts the cycle at day 1. */
    const LOGIN_REWARDS = [
        { day: 1, coins: 100,  icon: '🪙', key: 'miss.r100' },
        { day: 2, coins: 150,  icon: '🪙', key: 'miss.r150' },
        { day: 3, coins: 200,  icon: '🪙', key: 'miss.r200' },
        { day: 4, coins: 250, xp: 100, icon: '🎁', key: 'miss.r250xp' },
        { day: 5, coins: 500,  icon: '🪙', key: 'miss.r500' },
        { day: 6, xp: 300,     icon: '⭐', key: 'miss.r300xp' },
        { day: 7, coins: 1500, xp: 500, icon: '💎', key: 'miss.r1500' },
    ];

    const yesterdayKey = () => {
        const d = new Date(); d.setDate(d.getDate() - 1); return today(d);
    };

    /**
     * Where the calendar stands. `day` is which square is next; a gap of more
     * than one day resets to square 1, which is the whole point of a streak.
     */
    function loginState() {
        const s = get();
        const L = s.login;
        const day = today();
        if (L.claimedOn === day) {
            return { day: L.day, claimable: false, claimedToday: true, rewards: LOGIN_REWARDS };
        }
        const next = (L.last === yesterdayKey() && L.day < 7) ? L.day + 1 : 1;
        return { day: next, claimable: true, claimedToday: false, rewards: LOGIN_REWARDS };
    }

    function claimLogin() {
        const s = get();
        const info = loginState();
        if (!info.claimable) return null;
        const reward = LOGIN_REWARDS[info.day - 1];
        s.login = { last: today(), day: info.day, claimedOn: today() };
        save();
        if (reward.coins) window.CV.Profile.addCoins(reward.coins);
        if (reward.xp)    window.CV.Profile.addXp(reward.xp);
        return reward;
    }

    function replace(next) {
        state = next || blank(today());
        if (!state.login) state.login = { last: null, day: 0, claimedOn: null };
        return save();
    }

    window.CV = window.CV || {};
    window.CV.Missions = {
        POOL, LOGIN_REWARDS, today,
        load, save, get, list, note, claim, unclaimed,
        loginState, claimLogin, replace,
    };
})();
