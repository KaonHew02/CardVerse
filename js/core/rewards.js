/**
 * CardVerse — what a finished game is worth.
 *
 * One pipeline, called once per round by `Table.settle()`, in a fixed order:
 *
 *     coins → XP + level → profile record → per-game stats
 *           → missions → achievements → summary for the result screen
 *
 * The order is load-bearing. Stats are written before achievements are
 * checked so "win 100 games" sees the hundredth; missions are noted after the
 * profile so a streak mission reads the new streak. Move a step and a trophy
 * fires a game late — the kind of bug nobody reports and everybody notices.
 *
 * Coins here are a **delta**: an engine keeps each seat's stack on the seat
 * and this file pays the difference into the profile. The engine never
 * touches the profile and the profile never touches a hand.
 */

(() => {
    'use strict';

    /** Base XP by outcome, before the room multiplier and streak bonus. */
    const XP = { win: 60, draw: 25, loss: 15 };

    function settle(table, result) {
        const CV      = window.CV;
        const engine  = table.engine;
        const you     = engine.youSeat;
        const game    = table.game;
        const roomId  = (engine.config && engine.config.room) || 'beginner';
        const room    = CV.Registry.room(roomId);

        const summary = {
            game: game.code,
            gameName: game.name,
            room: roomId,
            result,
            outcome: null,
            rank: null,
            coins: 0,
            xp: 0,
            levels: 0,
            levelCoins: 0,
            streak: 0,
            milestone: 0,
            winRateBefore: CV.Profile.winRate(),
            winRateAfter: null,
            missions: [],
            achievements: [],
            spectator: you < 0,
        };

        // An all-AI table pays nobody. Nothing to record, nothing to unlock.
        if (you < 0) { summary.winRateAfter = summary.winRateBefore; return summary; }

        const seat  = engine.seats[you];
        const mine  = result.forSeat(you) || { rank: null, score: 0, coins: 0 };
        const delta = (mine.coins !== undefined && mine.coins !== null)
            ? mine.coins
            : (seat.coins - (seat.startCoins === undefined ? seat.coins : seat.startCoins));

        summary.rank    = mine.rank;
        summary.outcome = mine.outcome || (result.draw ? 'draw' : (mine.rank === 1 ? 'win' : 'loss'));
        summary.coins   = Math.round(delta);

        // 1. coins
        if (summary.coins) CV.Profile.addCoins(summary.coins);

        // 2. profile record + streak, so the streak bonus is known before XP
        const rec = CV.Profile.recordGame(game.code, summary.outcome);
        summary.streak    = rec.streak;
        summary.milestone = rec.milestone;

        // 3. XP. Levels are measured across the whole pipeline (below),
        //    because an achievement's XP can push over the line too.
        const levelBefore = CV.Profile.get().level;
        const base   = XP[summary.outcome] || XP.loss;
        const bonus  = Math.max(0, Math.round((mine.score || 0) / 10));   // engines score 0..~500
        summary.xp   = Math.round((base + bonus) * room.xp) + rec.milestone;
        CV.Profile.addXp(summary.xp);

        // 4. per-game stats
        const entry = {
            game: game.code,
            outcome: summary.outcome,
            coins: summary.coins,
            score: mine.score || 0,
            room: roomId,
            extra: mine.extra || {},
        };
        const gameStats = CV.Stats.record(entry);

        // 5. missions
        summary.missions = CV.Missions.note(entry).filter((m) => m.done && !m.claimed);

        // 6. achievements
        summary.achievements = CV.Achievements.evaluate({
            profile: CV.Profile.get(),
            stats: CV.Stats.all,
            gameStats,
            result,
            entry,
            mine,
            engine,
        });

        // 7. levels gained anywhere above, and what they paid (level × 100 each)
        const levelAfter = CV.Profile.get().level;
        summary.levels = levelAfter - levelBefore;
        for (let L = levelBefore + 1; L <= levelAfter; L++) summary.levelCoins += L * 100;

        summary.winRateAfter = CV.Profile.winRate();
        return summary;
    }

    /**
     * Leaving mid-hand. The stake already left the seat when it was bet, so
     * the honest figure is whatever `seat.net` says — usually a loss of the
     * bet. Recorded as a loss with no XP: walking away is not a game played.
     */
    function forfeit(table) {
        const CV  = window.CV;
        const you = table.engine.youSeat;
        if (you < 0 || table.settled) return null;
        table.settled = true;
        const seat  = table.engine.seats[you];
        const delta = Math.round(seat.net || 0);
        if (delta) CV.Profile.addCoins(delta);
        if (table.engine.phase !== 'betting') {
            CV.Profile.recordGame(table.game.code, 'loss');
            CV.Stats.record({ game: table.game.code, outcome: 'loss', coins: delta, score: 0,
                              room: table.engine.config.room, extra: { forfeits: 1 } });
        }
        return delta;
    }

    window.CV = window.CV || {};
    window.CV.Rewards = { XP, settle, forfeit };
})();
