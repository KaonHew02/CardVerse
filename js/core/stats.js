/**
 * CardVerse — per-game statistics and the game history.
 *
 * Every game keeps its own record under its registry code, plus a `extra` bag
 * for the figures only that game has (blackjacks hit, bombs played, a mahjong
 * high score). A new game therefore needs no schema change here — it writes
 * whatever counters it cares about and the statistics screen prints them.
 *
 * History is capped. An unbounded log of every hand ever played would be the
 * one thing in this app that grows without limit, and nothing reads further
 * back than the recent-form strip.
 */

(() => {
    'use strict';

    const KEY  = () => window.CV.Store.KEYS.stats;
    const HKEY = () => window.CV.Store.KEYS.history;

    const HISTORY_MAX = 200;

    let stats = null;
    let history = null;

    function blankGame() {
        return {
            played: 0, wins: 0, losses: 0, draws: 0,
            coinsWon: 0, coinsLost: 0,
            best: 0,            // best single-game score, game-defined
            streak: 0, bestStreak: 0,
            extra: {},
        };
    }

    function load() {
        stats   = window.CV.Store.get(KEY(), {})  || {};
        history = window.CV.Store.get(HKEY(), []) || [];
        return stats;
    }

    function save() {
        window.CV.Store.set(KEY(), stats);
        return window.CV.Store.set(HKEY(), history);
    }

    function forGame(code) {
        if (!stats) load();
        if (!stats[code]) stats[code] = blankGame();
        // Older saves predate fields added later; fill without clobbering.
        return Object.assign(blankGame(), stats[code], { extra: stats[code].extra || {} });
    }

    /**
     * Record one finished game against one game's counters.
     * @param {object} entry { game, outcome, coins, score, room, extra }
     */
    function record(entry) {
        if (!stats) load();
        const s = forGame(entry.game);

        s.played++;
        if (entry.outcome === 'win')       { s.wins++;   s.streak++; }
        else if (entry.outcome === 'loss') { s.losses++; s.streak = 0; }
        else                               { s.draws++; }
        if (s.streak > s.bestStreak) s.bestStreak = s.streak;

        const coins = entry.coins || 0;
        if (coins > 0) s.coinsWon  += coins;
        if (coins < 0) s.coinsLost += -coins;
        if ((entry.score || 0) > s.best) s.best = entry.score || 0;

        for (const [k, v] of Object.entries(entry.extra || {})) {
            s.extra[k] = (s.extra[k] || 0) + v;
        }

        stats[entry.game] = s;

        history.unshift({
            game: entry.game,
            outcome: entry.outcome,
            coins,
            score: entry.score || 0,
            room: entry.room || 'beginner',
            at: Date.now(),
        });
        if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;

        save();
        return s;
    }

    const winRate = (code) => {
        const s = forGame(code);
        const decided = s.wins + s.losses;
        return decided ? (s.wins / decided) * 100 : 0;
    };

    /** The game with the most rounds played, or null before anything is. */
    function mostPlayed() {
        if (!stats) load();
        let best = null, most = 0;
        for (const [code, s] of Object.entries(stats)) {
            if (s.played > most) { most = s.played; best = code; }
        }
        return best;
    }

    /** How many distinct games have been played today — a daily mission reads this. */
    function playedToday() {
        if (!history) load();
        const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
        const cut = midnight.getTime();
        const out = new Set();
        for (const h of history) {
            if (h.at < cut) break;      // history is newest-first
            out.add(h.game);
        }
        return out;
    }

    const recent = (n = 10, code = null) =>
        (history || []).filter((h) => !code || h.game === code).slice(0, n);

    /** Totals across every game, for the profile header. */
    function overall() {
        if (!stats) load();
        const out = { played: 0, wins: 0, losses: 0, draws: 0, coinsWon: 0, coinsLost: 0 };
        for (const s of Object.values(stats)) {
            out.played += s.played; out.wins += s.wins;
            out.losses += s.losses; out.draws += s.draws;
            out.coinsWon += s.coinsWon; out.coinsLost += s.coinsLost;
        }
        return out;
    }

    function replace(nextStats, nextHistory) {
        stats   = nextStats   || {};
        history = nextHistory || [];
        return save();
    }

    function reset() {
        return replace({}, []);
    }

    window.CV = window.CV || {};
    window.CV.Stats = {
        load, save, forGame, record, winRate, mostPlayed,
        playedToday, recent, overall, replace, reset,
        get all() { if (!stats) load(); return stats; },
        get history() { if (!history) load(); return history; },
    };
})();
