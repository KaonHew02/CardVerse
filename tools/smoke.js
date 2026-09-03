/**
 * CardVerse — headless smoke test.
 *
 *     node tools/smoke.js [hands]
 *
 * Loads the core and the game engines under Node with a minimal browser
 * shim, then plays thousands of AI-only hands of every registered game and
 * checks the things a screen cannot: every coin paid out matches the
 * outcome recorded, no hand ends over 21 without being called a bust, the
 * dealer follows the rule, the seeded RNG replays identically, and the
 * reward pipeline moves the profile by exactly what the result says.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT  = path.join(__dirname, '..');
const HANDS = Number(process.argv[2]) || 3000;

/* ---- browser shim ------------------------------------------------------ */

const memory = {};
global.localStorage = {
    getItem: (k) => (k in memory ? memory[k] : null),
    setItem: (k, v) => { memory[k] = String(v); },
    removeItem: (k) => { delete memory[k]; },
};
global.window = global;
global.document = {
    readyState: 'complete',
    addEventListener() {}, dispatchEvent() {}, getElementById: () => null,
    documentElement: { dataset: {} }, body: { dataset: {} },
};
global.CustomEvent = class { constructor(t) { this.type = t; } };

function load(rel) {
    const file = path.join(ROOT, rel);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: rel });
}

[
    'js/core/rng.js', 'js/core/cards.js', 'js/core/store.js', 'js/core/i18n.js', 'js/core/engine.js',
    'js/core/transport.js', 'js/core/ai.js', 'js/core/registry.js', 'js/core/profile.js',
    'js/core/stats.js', 'js/core/achievements.js', 'js/core/missions.js', 'js/core/cosmetics.js',
    'js/core/rewards.js', 'js/core/table.js',
    'js/games/blackjack/engine.js', 'js/games/blackjack/ai.js', 'js/games/blackjack/index.js',
    'js/games/twentyone/engine.js', 'js/games/twentyone/ai.js', 'js/games/twentyone/index.js',
].forEach(load);

const CV = global.CV;
const { handValue, isBlackjack } = CV.Cards;

/* ---- harness ----------------------------------------------------------- */

let failures = 0;
function check(cond, msg) {
    if (!cond) { failures++; console.error('  ✗', msg); }
}

const LEVELS = ['easy', 'normal', 'hard', 'expert'];

function seats(n, rng, youIndex = 0) {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({ kind: 'ai', name: 'S' + i, avatar: '🙂', level: LEVELS[rng.int(4)], coins: 20000, isYou: i === youIndex });
    }
    return out;
}

/** Play one hand to the end, synchronously. Returns the engine. */
function playHand(game, opts) {
    const rng = new CV.RNG(opts.seed);
    const engine = new game.Engine({ rng, seats: opts.seats.map((s, i) => new CV.Seat(i, s)), config: opts.config });
    const ai = new game.AI(engine);
    engine.start();
    let steps = 0;
    while (!engine.isOver()) {
        const action = ai.decide(engine.turn);
        if (!action) throw new Error(`${game.code}: AI returned no action in phase ${engine.phase} for seat ${engine.turn}`);
        if (!engine.apply(action)) throw new Error(`${game.code}: engine refused ${JSON.stringify(action)} in phase ${engine.phase}`);
        if (++steps > 200) throw new Error(`${game.code}: hand did not finish in 200 actions`);
    }
    return engine;
}

/* ---- invariants per hand ---------------------------------------------- */

function auditHand(game, e) {
    const dealer = handValue(e.dealer.cards);
    const dealerBJ = isBlackjack(e.dealer.cards);
    const simple = !!game.simple;

    check(e.dealer.revealed, `${game.code}: hole card never revealed`);

    for (const s of e.seats) {
        if (s.out) continue;
        let expectedNet = 0;
        for (const h of s.hands) {
            const v = handValue(h.cards);
            check(h.outcome, `${game.code}: hand with no outcome`);
            if (v.total > 21) check(h.outcome === 'bust', `${game.code}: ${v.total} called ${h.outcome}`);

            // Payout must match the outcome exactly.
            const bet = h.bet;
            const want = {
                bust: 0, loss: 0, push: bet, win: bet * 2, surrender: bet / 2,
                blackjack: bet * (1 + e.config.blackjackPays),
                twentyone: bet * (1 + e.config.exactBonus),
            }[h.outcome];
            check(Math.round(want) === h.payout, `${game.code}: ${h.outcome} on ${bet} paid ${h.payout}, wanted ${want}`);

            // And the outcome must match the cards.
            if (h.outcome === 'win')  check(v.total <= 21 && (dealer.total > 21 || v.total > dealer.total), `${game.code}: win with ${v.total} vs dealer ${dealer.total}`);
            if (h.outcome === 'loss') check(v.total <= 21 && dealer.total <= 21 && (v.total < dealer.total || dealerBJ), `${game.code}: loss with ${v.total} vs dealer ${dealer.total}`);
            if (h.outcome === 'push') check(v.total === dealer.total || (dealerBJ && isBlackjack(h.cards)), `${game.code}: push with ${v.total} vs ${dealer.total}`);
            if (h.outcome === 'twentyone') check(v.total === 21, `${game.code}: 21 bonus on ${v.total}`);
            if (simple && v.total === 21) check(h.outcome === 'twentyone' || h.outcome === 'blackjack', `21: exact 21 called ${h.outcome}`);

            expectedNet += h.payout - bet;
            if (h.doubled) check(h.cards.length === 3 || h.split, `${game.code}: doubled hand has ${h.cards.length} cards`);
        }
        if (s.insurance) expectedNet += (dealerBJ ? s.insurance * 3 : 0) - s.insurance;
        check(Math.round(expectedNet) === Math.round(s.net), `${game.code}: seat net ${s.net} but hands say ${expectedNet}`);
        check(s.coins === s.startCoins + s.net, `${game.code}: coins ${s.coins} ≠ start ${s.startCoins} + net ${s.net}`);
    }

    // Dealer rule: if anyone was live, dealer reached 17+ (or bust).
    const live = e.seats.some((s) => !s.out && s.hands.some((h) => ['win', 'loss', 'push'].includes(h.outcome)));
    if (live) check(dealer.total >= 17, `${game.code}: dealer stopped on ${dealer.total} with live hands`);

    // Result rows are consistent with seat nets.
    const r = e.result();
    const house = r.ranks.find((row) => row.house);
    check(house && house.coins === -r.ranks.filter((row) => !row.house).reduce((n, row) => n + row.coins, 0), `${game.code}: house row does not balance the table`);
    for (const row of r.ranks) {
        if (row.house) continue;
        const s = e.seats[row.seat];
        check(row.coins === s.net, `${game.code}: result coins ${row.coins} ≠ net ${s.net}`);
        check(row.outcome === (s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'draw'), `${game.code}: outcome/net mismatch`);
    }
}

/* ---- run --------------------------------------------------------------- */

console.log(`CardVerse smoke — ${HANDS} hands per game\n`);

for (const game of CV.Registry.playable()) {
    console.log(`${game.icon} ${game.name}`);
    const master = new CV.RNG(12345);
    let bet = 0, net = 0, shoe = null, sameShoeRuns = 0;
    const t0 = Date.now();
    const before = failures;

    for (let i = 0; i < HANDS; i++) {
        const n = master.range(1, 5);
        const room = CV.Registry.ROOMS[master.int(4)].id;
        // Carry the shoe for a run of hands, then drop it — both paths matter.
        if (sameShoeRuns-- <= 0) { shoe = null; sameShoeRuns = master.range(0, 12); }
        const e = playHand(game, { seed: master.int(1e9), seats: seats(n, master, master.int(n)), config: { room, shoe } });
        shoe = e.shoeState;
        auditHand(game, e);
        for (const s of e.seats) if (!s.out) {
            for (const h of s.hands) bet += h.bet;
            net += s.net;
        }
    }
    const edge = (net / bet) * 100;
    console.log(`  ${HANDS} hands, ${Date.now() - t0} ms, mixed-level return ${edge.toFixed(2)}% of stake`);
    // A quarter of these seats are Easy, which spoils 40% of its decisions;
    // a table like that loses heavily and should. The band only catches a
    // payout bug (which shows up as ±30%+), not a bad player.
    check(edge > -30 && edge < 8, `${game.code}: return ${edge.toFixed(2)}% is outside any plausible band`);

    // Expert alone, one seat, should sit near the book's house edge.
    let ebet = 0, enet = 0, eshoe = null;
    const erng = new CV.RNG(777);
    for (let i = 0; i < HANDS * 3; i++) {
        const e = playHand(game, { seed: erng.int(1e9), seats: [{ kind: 'ai', name: 'X', level: 'expert', coins: 1e6, isYou: true }], config: { room: 'beginner', shoe: eshoe } });
        eshoe = e.shoeState;
        for (const h of e.seats[0].hands) ebet += h.bet;
        enet += e.seats[0].net;
    }
    const eedge = (enet / ebet) * 100;

    // The band has to scale with the sample or this check fails at random on
    // short runs. A blackjack hand has a standard deviation near 1.15 units,
    // so the standard error on the mean return is 115/sqrt(n) percent; three
    // of those either side of the expected edge is a band that catches a real
    // strategy regression without flagging ordinary variance. It cost one
    // spurious failure at 300 hands to learn this.
    const nHands = HANDS * 3;
    const se = 115 / Math.sqrt(nHands);
    const expected = game.simple ? 4 : -0.5;      // 21's any-21-pays-3:2 rule is player-positive
    const lo = expected - 3 * se, hi = expected + 3 * se;
    console.log(`  expert solo over ${nHands} hands: ${eedge.toFixed(2)}% of stake `
        + `(expect ${expected}% ±${(3 * se).toFixed(1)})`);
    check(eedge > lo && eedge < hi,
        `${game.code}: expert return ${eedge.toFixed(2)}% is outside ${lo.toFixed(1)}..${hi.toFixed(1)}%`);

    // Determinism: same seed and seats → same log and same events.
    const a = playHand(game, { seed: 4242, seats: seats(4, new CV.RNG(1)), config: { room: 'casual' } });
    const b = playHand(game, { seed: 4242, seats: seats(4, new CV.RNG(1)), config: { room: 'casual' } });
    check(JSON.stringify(a.log) === JSON.stringify(b.log), `${game.code}: same seed produced different action logs`);
    check(JSON.stringify(a.events) === JSON.stringify(b.events), `${game.code}: same seed produced different events`);

    console.log(failures === before ? '  ✓ all invariants held' : `  ${failures - before} failure(s)`);
}

/* ---- rewards pipeline -------------------------------------------------- */

console.log('\n🪙 Rewards pipeline');
{
    CV.Profile.load(); CV.Stats.load(); CV.Achievements.load(); CV.Missions.load(); CV.Cosmetics.load();
    const game = CV.Registry.get('blackjack');
    let checked = 0;
    for (let i = 0; i < 300; i++) {
        const e = playHand(game, { seed: 9000 + i, seats: seats(3, new CV.RNG(i), 1), config: { room: 'casual' } });
        const p0 = JSON.parse(JSON.stringify(CV.Profile.get()));
        const g0 = CV.Stats.forGame('blackjack').played;
        const fake = { engine: e, game, settled: false };
        const s = CV.Rewards.settle(fake, e.result());
        const p1 = CV.Profile.get();
        const extra = s.levelCoins + s.achievements.reduce((n, a) => n + (a.reward.coins || 0), 0);
        check(p1.coins === p0.coins + s.coins + extra, `profile coins moved by ${p1.coins - p0.coins}, summary says ${s.coins} + ${extra}`);
        check(CV.Stats.forGame('blackjack').played === g0 + 1, 'stats.played did not increment');
        check(p1.totalGames === p0.totalGames + 1, 'profile.totalGames did not increment');
        check(['win', 'loss', 'draw'].includes(s.outcome), `bad outcome ${s.outcome}`);
        if (s.outcome === 'win') check(p1.streak === p0.streak + 1, 'win did not extend streak');
        if (s.outcome === 'loss') check(p1.streak === 0, 'loss did not reset streak');
        checked++;
    }
    const ids = Object.keys(CV.Achievements.load());
    console.log(`  ${checked} settlements, ${ids.length} achievements unlocked, level ${CV.Profile.get().level}, ${CV.Missions.list().filter((m) => m.done).length}/4 missions done`);
    check(ids.length >= 2, 'first-game / first-win never unlocked');
    // Only Blackjack was played, so only Blackjack's and the hub's trophies may be open.
    const leaked = ids.filter((id) => { const d = CV.Achievements.get(id); return d.game && d.game !== 'blackjack'; });
    check(leaked.length === 0, `another game's achievements unlocked from Blackjack: ${leaked.join(', ')}`);

    // Spectator table pays nothing.
    const spec = playHand(game, { seed: 1, seats: seats(2, new CV.RNG(2), -1), config: { room: 'beginner' } });
    const pc = CV.Profile.get().coins;
    const ss = CV.Rewards.settle({ engine: spec, game, settled: false }, spec.result());
    check(ss.spectator && CV.Profile.get().coins === pc, 'spectator table changed the profile');
}

/* ---- what a host is allowed to broadcast ------------------------------- */

/**
 * The multiplayer safety property, checked on every game the hub registers.
 *
 * `snapshotFor(viewer)` is the only object a host may put on a wire, so it
 * must not carry anything the viewer could not see at a real table. The RNG
 * is the dangerous one and the easiest to reintroduce: mulberry32 is
 * deterministic, so `{seed, calls}` reproduces the whole shoe — every hidden
 * card and every card still to come. A leak here is not a rendering bug, it
 * is a client that can see the deck.
 */
console.log('\n📡 Broadcast safety');
for (const game of CV.Registry.playable()) {
    const before = failures;
    let checkedHidden = 0;

    for (let i = 0; i < 400; i++) {
        const rng = new CV.RNG(5000 + i);
        const e = new game.Engine({
            rng,
            seats: seats(3, rng, 1).map((s, k) => new CV.Seat(k, s)),
            config: { room: 'casual' },
        });
        const ai = new game.AI(e);
        e.start();

        // Step through the hand, auditing the broadcast at every single state.
        let guard = 0;
        while (guard++ < 200) {
            for (const viewer of [-1, 0, 1, 2]) {
                const view = e.snapshotFor(viewer);
                const wire = JSON.stringify(view);

                check(view.rng === undefined, `${game.code}: snapshotFor(${viewer}) carries the RNG seed`);
                check(!/"seed"/.test(wire), `${game.code}: a seed appears in the broadcast`);

                // The hole card must be absent from the wire until it is turned.
                if (!e.dealer.revealed && e.dealer.cards.length > 1) {
                    const hole = e.dealer.cards[1];
                    check(!wire.includes(hole.id),
                        `${game.code}: hole card ${hole.id} is in the broadcast before the reveal`);
                    check(view.dealer.cards.length === 1,
                        `${game.code}: broadcast shows ${view.dealer.cards.length} dealer cards before the reveal`);
                    checkedHidden++;
                }

                // Every viewer must be told their own seat is theirs, and
                // exactly one seat may claim it.
                const mine = view.seats.filter((st) => st.isYou);
                check(mine.length === (viewer >= 0 ? 1 : 0),
                    `${game.code}: ${mine.length} seats marked "you" in the view for seat ${viewer}`);
                if (viewer >= 0) {
                    check(view.seats[viewer].isYou, `${game.code}: seat ${viewer} not marked as its own viewer`);
                    check(view.seats[viewer].kind === 'human', `${game.code}: viewer's own seat is not human`);
                }

                // A hole where a card should be is as bad as a leak: it
                // serialises as null and crashes whatever reads its rank.
                check(!/(^|[^a-z])null([^a-z]|$)/.test(wire.replace(/"[^"]*":null/g, '')),
                    `${game.code}: a null card is in the broadcast`);
                for (const c of (view.dealer.cards || [])) {
                    check(c && typeof c.r === 'number', `${game.code}: broadcast dealer hand holds a non-card`);
                }
                for (const st of view.seats) {
                    for (const h of (st.hands || [])) {
                        for (const c of (h.cards || [])) {
                            check(c && typeof c.r === 'number', `${game.code}: broadcast seat hand holds a non-card`);
                        }
                    }
                }

                // Nothing still in the shoe may ever appear.
                for (const card of e.shoe.cards.slice(-6)) {
                    check(!wire.includes('"' + card.id + '"'),
                        `${game.code}: an undealt card (${card.id}) is in the broadcast`);
                }
            }
            if (e.isOver()) break;
            const action = ai.decide(e.turn);
            if (!action || !e.apply(action)) break;
        }

        // Once turned, the hole card must be visible — redaction that never
        // lifts is just a broken game.
        const done = e.snapshotFor(0);
        check(done.dealer.revealed && done.dealer.cards.length === e.dealer.cards.length,
            `${game.code}: dealer hand still redacted after the round ended`);
    }
    console.log(`  ${game.icon} ${game.name}: ${checkedHidden} concealed-state broadcasts audited`);
    if (failures === before) console.log('    ✓ no seed, no hole card, no undealt card on the wire');
}

/* ---- the Table wrapper, with real timers ------------------------------- */

console.log('\n🪑 Table wrapper');
(async () => {
    const table = new CV.Table({
        gameCode: 'twentyone',
        seats: seats(3, new CV.RNG(5), 0).map((s, i) => new CV.Seat(i, s)),
        config: { room: 'beginner' },
        seed: 99,
    });
    table.speed = 0.01;
    const done = new Promise((resolve) => table.onChange((events) => {
        if (events.some((ev) => ev.type === 'settled')) resolve();
    }));
    table.start();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('table never settled')), 5000));
    try {
        await Promise.race([done, timeout]);
        check(table.settled, 'table did not mark settled');
        check(table.engine.isOver(), 'engine not over after settle');
        table.settle();   // second call must be a no-op
        console.log('  ✓ one hand played through timers and settled once');
    } catch (err) {
        check(false, err.message);
    }

    console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL GREEN');
    process.exit(failures ? 1 : 0);
})();
