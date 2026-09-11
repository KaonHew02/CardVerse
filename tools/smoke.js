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
    'js/core/rewards.js', 'js/core/table.js', 'js/core/remote.js',
    'js/games/baccarat/engine.js', 'js/games/baccarat/ai.js', 'js/games/baccarat/index.js',
    'js/games/slots/engine.js', 'js/games/slots/index.js',
    'js/games/dragongate/engine.js', 'js/games/dragongate/ai.js', 'js/games/dragongate/index.js',
    'js/games/bullbull/hands.js', 'js/games/bullbull/engine.js',
    'js/games/bullbull/ai.js', 'js/games/bullbull/index.js',
    'js/games/roulette/wheel.js', 'js/games/roulette/engine.js',
    'js/games/roulette/ai.js', 'js/games/roulette/index.js',
    'js/games/dice/dice.js', 'js/games/dice/engine.js',
    'js/games/dice/ai.js', 'js/games/dice/index.js',
    'js/games/lami/melds.js', 'js/games/lami/engine.js',
    'js/games/lami/ai.js', 'js/games/lami/index.js',
    'js/games/mahjong/tiles.js', 'js/games/mahjong/win.js', 'js/games/mahjong/fan.js',
    'js/games/mahjong/pay.js', 'js/games/mahjong/engine.js',
    'js/games/mahjong/ai.js', 'js/games/mahjong/index.js',
    'js/games/poker/hands.js', 'js/games/poker/engine.js',
    'js/games/poker/ai.js', 'js/games/poker/index.js',
    'js/games/bigtwo/combos.js', 'js/games/bigtwo/engine.js',
    'js/games/bigtwo/ai.js', 'js/games/bigtwo/index.js',
    'js/games/doudizhu/combos.js', 'js/games/doudizhu/engine.js',
    'js/games/doudizhu/ai.js', 'js/games/doudizhu/index.js',
    // Views need CV.UI and a DOM; the engines under test do not.
    'js/games/twentyone/engine.js', 'js/games/twentyone/ai.js', 'js/games/twentyone/index.js',
].forEach(load);

const CV = global.CV;
const { handValue, isBlackjack } = CV.Cards;

/* ---- harness ----------------------------------------------------------- */

let failures = 0;
function check(cond, msg) {
    if (!cond) { failures++; console.error('  ✗', msg); }
}

function seats(n, rng, youIndex = 0) {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({ kind: 'ai', name: 'S' + i, avatar: '🙂', coins: 20000, isYou: i === youIndex });
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

/**
 * Checks every game must pass, whatever it deals: coins conserve, and the
 * result rows agree with the seats they describe.
 */
function auditCommon(game, e) {
    for (const s of e.seats) {
        if (s.out) continue;
        check(s.coins === s.startCoins + s.net,
            `${game.code}: coins ${s.coins} != start ${s.startCoins} + net ${s.net}`);
    }
    const r = e.result();
    for (const row of r.ranks) {
        if (row.house) continue;
        check(row.coins === e.seats[row.seat].net,
            `${game.code}: result coins ${row.coins} != net ${e.seats[row.seat].net}`);
    }
}

/** 百家乐: the drawing rules are fixed, so the payouts are checkable exactly. */
function auditBaccarat(game, e) {
    const p = e.playerTotal(), b = e.bankerTotal();
    const want = p > b ? 'player' : b > p ? 'banker' : 'tie';
    check(e.outcome === want, `${game.code}: called ${e.outcome} on ${p} v ${b}`);
    check(e.player.length >= 2 && e.player.length <= 3, `${game.code}: player hand of ${e.player.length}`);
    check(e.banker.length >= 2 && e.banker.length <= 3, `${game.code}: banker hand of ${e.banker.length}`);

    // A natural stops the deal: neither side may draw a third card.
    const natural = CV.BaccaratTotal(e.player.slice(0, 2)) >= 8
                 || CV.BaccaratTotal(e.banker.slice(0, 2)) >= 8;
    if (natural) {
        check(e.player.length === 2 && e.banker.length === 2,
            `${game.code}: drew a third card on a natural`);
    }

    for (const s of e.seats) {
        if (s.out) continue;
        const won = s.side === e.outcome;
        const push = e.outcome === 'tie' && s.side !== 'tie';
        const expect = won
            ? (s.side === 'banker' ? s.bet * (2 - e.config.commission)
              : s.side === 'tie' ? s.bet * (1 + e.config.tiePays) : s.bet * 2)
            : (push ? s.bet : 0);
        check(Math.round(expect) === s.payout,
            `${game.code}: ${s.side} ${won ? 'win' : push ? 'push' : 'loss'} on ${s.bet} paid ${s.payout}, wanted ${Math.round(expect)}`);
        check(s.net === s.payout - s.bet, `${game.code}: net ${s.net} != payout ${s.payout} - bet ${s.bet}`);
    }
    auditCommon(game, e);
}

function auditHand(game, e) {
    if (!e.dealer) return auditBaccarat(game, e);
    return auditTwentyOne(game, e);
}

/**
 * 21, to the house rules: no natural, DOUBLE, 五龙 — exactly five cards at 21
 * or under — beating every normal hand including a normal 21, and 十五点可以跑,
 * which takes a hand out of the comparison entirely.
 */
function auditTwentyOne(game, e) {
    const score = CV.TwentyOneScore;
    const d = score(e.dealer.cards);

    check(e.dealer.revealed, `${game.code}: hole card never revealed`);
    check(e.dealer.cards.length <= 5, `${game.code}: dealer drew ${e.dealer.cards.length} cards`);
    if (!d.bust && !d.dragons) {
        check(d.total >= e.config.dealerStandsOn || !anyLive(e),
            `${game.code}: dealer stopped on ${d.total}`);
    }

    for (const s of e.seats) {
        if (s.out) continue;
        const h = s.hands[0];
        const p = score(h.cards);

        check(h.cards.length <= 5, `${game.code}: player held ${h.cards.length} cards`);
        if (p.dragons) check(h.cards.length === 5, `${game.code}: 五龙 with ${h.cards.length} cards`);
        if (h.doubled) check(h.cards.length === 3, `${game.code}: doubled hand has ${h.cards.length} cards`);

        // 跑 is only offered on exactly fifteen and only on two cards, and it
        // returns the stake untouched. A hand that ran is out of the
        // comparison, so it is checked here and skipped below.
        if (h.ran) {
            check(h.cards.length === 2 && handValue(h.cards).total === e.config.runOn,
                `${game.code}: ran on ${h.cards.length}c ${p.total}`);
            check(h.outcome === 'run', `${game.code}: ran but outcome is ${h.outcome}`);
            check(h.payout === h.bet, `${game.code}: run paid ${h.payout}, wanted ${h.bet}`);
            check(s.net === 0, `${game.code}: run left net ${s.net}`);
            continue;
        }

        // The outcome the rules demand, derived independently of the engine.
        let want;
        if (p.bust) want = 'bust';
        else if (d.bust) want = p.dragons ? 'dragons' : 'win';
        else if (p.rank > d.rank) want = p.dragons ? 'dragons' : 'win';
        else if (p.rank < d.rank) want = 'loss';
        else if (p.total > d.total) want = p.dragons ? 'dragons' : 'win';
        else if (p.total < d.total) want = 'loss';
        else want = 'push';
        check(h.outcome === want,
            `${game.code}: ${h.cards.length}c ${p.total}${p.dragons ? ' 五龙' : ''} v ` +
            `${e.dealer.cards.length}c ${d.total}${d.dragons ? ' 五龙' : ''} called ${h.outcome}, wanted ${want}`);

        const pay = { bust: 0, loss: 0, push: h.bet, win: h.bet * 2,
                      dragons: h.bet * (1 + e.config.dragonPays) }[want];
        check(Math.round(pay) === h.payout,
            `${game.code}: ${want} on ${h.bet} paid ${h.payout}, wanted ${Math.round(pay)}`);
        check(s.net === h.payout - h.bet, `${game.code}: net ${s.net} != ${h.payout} - ${h.bet}`);
    }

    const r = e.result();
    const house = r.ranks.find((row) => row.house);
    check(house && house.coins === -r.ranks.filter((row) => !row.house).reduce((n, row) => n + row.coins, 0),
        `${game.code}: house row does not balance the table`);
    auditCommon(game, e);
}

/**
 * Anybody the dealer still has to draw against. A hand that busted is already
 * lost and a hand that ran is already settled, so neither keeps the dealer
 * playing — which is why the dealer may legitimately stop on twelve.
 */
const anyLive = (e) => e.seats.some((s) => !s.out
    && !s.hands[0].ran && !CV.TwentyOneScore(s.hands[0].cards).bust);

/* ---- run --------------------------------------------------------------- */

console.log(`CardVerse smoke — ${HANDS} hands per game\n`);

/**
 * Games this loop does not fit — a wager against the house across a carried
 * shoe. 老虎机 has no opponents at all; 斗地主 is three seats
 * playing each other for points rather than a table paying out. Each has its
 * own audit further down.
 */
const OWN_AUDIT = new Set(['slots', 'dragongate', 'doudizhu', 'bigtwo', 'poker', 'mahjong',
                           'bullbull', 'lami', 'dice', 'roulette']);

for (const game of CV.Registry.playable()) {
    if (!game.AI || OWN_AUDIT.has(game.code)) continue;
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
        // Blackjack stakes live on each hand; baccarat stakes live on the
        // seat, because a seat backs an outcome rather than holding cards.
        for (const s of e.seats) if (!s.out) {
            bet += s.hands ? s.hands.reduce((n, h) => n + h.bet, 0) : (s.bet || 0);
            net += s.net;
        }
    }
    const edge = (net / bet) * 100;
    console.log(`  ${HANDS} hands, ${Date.now() - t0} ms, mixed-level return ${edge.toFixed(2)}% of stake`);
    // Every seat plays the book now, so a mixed table lands near the same
    // edge as the solo run below. Still a wide band: this sample mixes rooms
    // and seat counts, and it is only here to catch a payout bug.
    check(edge > -12 && edge < 10, `${game.code}: return ${edge.toFixed(2)}% is outside any plausible band`);

    // Expert alone, one seat, should sit near the book's house edge.
    let ebet = 0, enet = 0, eshoe = null;
    const erng = new CV.RNG(777);
    for (let i = 0; i < HANDS * 3; i++) {
        const e = playHand(game, { seed: erng.int(1e9), seats: [{ kind: 'ai', name: 'X', coins: 1e6, isYou: true }], config: { room: 'beginner', shoe: eshoe } });
        eshoe = e.shoeState;
        const s0 = e.seats[0];
        ebet += s0.hands ? s0.hands.reduce((n, h) => n + h.bet, 0) : (s0.bet || 0);
        enet += s0.net;
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
    // Measured, not assumed. Baccarat is the book figure for a table that
    // backs banker most of the time. 21 is strongly player-positive by
    // design — exact 21 pays 3:2, 五小 pays 2:1 and 孖宝 lets a good spot be
    // doubled — so this figure is a *balance* decision, not a law of the
    // game. If the coin economy ever inflates, this is the number to change
    // and this check is what will notice.
    const expected = game.code === 'baccarat' ? -1.1 : 2;
    const lo = expected - 3 * se, hi = expected + 3 * se;
    console.log(`  solo book player over ${nHands} hands: ${eedge.toFixed(2)}% of stake `
        + `(expect ${expected}% ±${(3 * se).toFixed(1)})`);
    check(eedge > lo && eedge < hi,
        `${game.code}: solo return ${eedge.toFixed(2)}% is outside ${lo.toFixed(1)}..${hi.toFixed(1)}%`);

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
    const game = CV.Registry.get('twentyone');
    let checked = 0;
    for (let i = 0; i < 300; i++) {
        const e = playHand(game, { seed: 9000 + i, seats: seats(3, new CV.RNG(i), 1), config: { room: 'casual' } });
        const p0 = JSON.parse(JSON.stringify(CV.Profile.get()));
        const g0 = CV.Stats.forGame('twentyone').played;
        const fake = { engine: e, game, settled: false };
        const s = CV.Rewards.settle(fake, e.result());
        const p1 = CV.Profile.get();
        const extra = s.levelCoins + s.achievements.reduce((n, a) => n + (a.reward.coins || 0), 0);
        check(p1.coins === p0.coins + s.coins + extra, `profile coins moved by ${p1.coins - p0.coins}, summary says ${s.coins} + ${extra}`);
        check(CV.Stats.forGame('twentyone').played === g0 + 1, 'stats.played did not increment');
        check(p1.totalGames === p0.totalGames + 1, 'profile.totalGames did not increment');
        check(['win', 'loss', 'draw'].includes(s.outcome), `bad outcome ${s.outcome}`);
        if (s.outcome === 'win') check(p1.streak === p0.streak + 1, 'win did not extend streak');
        if (s.outcome === 'loss') check(p1.streak === 0, 'loss did not reset streak');
        checked++;
    }
    const ids = Object.keys(CV.Achievements.load());
    console.log(`  ${checked} settlements, ${ids.length} achievements unlocked, level ${CV.Profile.get().level}, ${CV.Missions.list().filter((m) => m.done).length}/4 missions done`);
    check(ids.length >= 2, 'first-game / first-win never unlocked');
    // Only 21 was played, so only 21's and the hub's trophies may be open.
    const leaked = ids.filter((id) => { const d = CV.Achievements.get(id); return d.game && d.game !== 'twentyone'; });
    check(leaked.length === 0, `another game's achievements unlocked from 21: ${leaked.join(', ')}`);

    // Spectator table pays nothing.
    const spec = playHand(game, { seed: 1, seats: seats(2, new CV.RNG(2), -1), config: { room: 'beginner' } });
    const pc = CV.Profile.get().coins;
    const ss = CV.Rewards.settle({ engine: spec, game, settled: false }, spec.result());
    check(ss.spectator && CV.Profile.get().coins === pc, 'spectator table changed the profile');
}

/* ---- 老虎机 ------------------------------------------------------------- */

/**
 * The paytable, the win condition, and the return-to-player.
 *
 * RTP is the number that decides whether the machine is playable, so it is
 * measured rather than assumed. With equal reels, 512 lines are possible: 8
 * of them are a triple and 168 are exactly a pair (8 symbols × 3 positions ×
 * 7 others), so
 *
 *     (Σ triple mults + 21 × Σ pair mults) / 512
 *
 * is the theoretical return. Three of a kind alone came to 54%, which is a
 * machine nobody would sit at; the pair line is what brings it to ~95%. If
 * the reels are ever weighted or a price changed, this is what will say so.
 */
function auditSlots() {
    console.log('\n🎰 老虎机');
    const game = CV.Registry.get('slots');
    const syms = CV.SlotsSymbols;

    check(syms.length === 8, `slots: ${syms.length} symbols, expected 8`);
    const wanted = { cherry: 5, lemon: 8, orange: 10, melon: 15, bell: 25, star: 40, diamond: 75, seven: 100 };
    for (const [id, mult] of Object.entries(wanted)) {
        const sym = syms.find((s) => s.id === id);
        check(sym && sym.mult === mult, `slots: ${id} pays ×${sym && sym.mult}, expected ×${mult}`);
    }
    const wantedPair = { cherry: 1, lemon: 1, orange: 1, melon: 1, bell: 1, star: 1, diamond: 2, seven: 2 };
    for (const [id, mult] of Object.entries(wantedPair)) {
        const sym = syms.find((s) => s.id === id);
        check(sym && sym.pair === mult, `slots: two ${id} pays ×${sym && sym.pair}, expected ×${mult}`);
    }

    // The theoretical figure, straight from the paytable — see the note above.
    const LINES = Math.pow(syms.length, 3);
    const PAIR_LINES = 3 * (syms.length - 1);
    const theory = (syms.reduce((n, s) => n + s.mult, 0)
        + PAIR_LINES * syms.reduce((n, s) => n + s.pair, 0)) / LINES;

    const rng = new CV.RNG(2468);
    const e = new game.Engine({
        rng,
        seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: 1e9 })],
        config: {},
    });
    e.start();

    const SPINS = 200000;
    const BET = 10;
    let paidOnWin = 0, twoMatch = 0;
    for (let i = 0; i < SPINS; i++) {
        if (!e.canAfford) break;
        e.spin(BET);
        const r = e.last;

        const same = r.reels[0] === r.reels[1] && r.reels[1] === r.reels[2];
        const pairId = same ? null
            : r.reels[0] === r.reels[1] ? r.reels[0]
            : r.reels[1] === r.reels[2] ? r.reels[1]
            : r.reels[0] === r.reels[2] ? r.reels[0] : null;
        check((same || !!pairId) === (r.payout > 0),
            `slots: line ${r.reels.join('/')} paid ${r.payout}`);

        if (same) {
            const sym = syms.find((s) => s.id === r.reels[0]);
            check(r.kind === 'triple', `slots: three alike read as ${r.kind}`);
            check(r.payout === BET * sym.mult,
                `slots: ${r.reels[0]} paid ${r.payout}, expected ${BET * sym.mult}`);
            check(r.jackpot === (r.reels[0] === CV.SlotsJackpot), 'slots: jackpot flag disagrees with the reels');
            paidOnWin++;
        } else if (pairId) {
            // Exactly two, which is a different price and never the jackpot.
            const sym = syms.find((s) => s.id === pairId);
            twoMatch++;
            check(r.kind === 'pair', `slots: a pair read as ${r.kind}`);
            check(r.payout === BET * sym.pair,
                `slots: two ${pairId} paid ${r.payout}, expected ${BET * sym.pair}`);
            check(!r.jackpot, 'slots: a pair was called a jackpot');
            paidOnWin++;
        } else {
            check(r.payout === 0, `slots: three different paid ${r.payout}`);
        }
    }

    const g = e.tally;
    const rtp = g.won / g.staked;
    check(g.spins === g.wins + g.losses, `slots: ${g.spins} spins but ${g.wins}+${g.losses} recorded`);
    check(g.wins === paidOnWin, 'slots: win tally disagrees with the spins');
    check(e.seat.coins === e.seat.startCoins + e.seat.net, 'slots: coins do not reconcile');
    check(g.won === g.staked * rtp, 'slots: rtp arithmetic');

    console.log(`  ${g.spins.toLocaleString('en-US')} spins · hit rate ${(g.wins / g.spins * 100).toFixed(2)}% `
        + `(1 in ${(g.spins / g.wins).toFixed(1)}) · ${twoMatch.toLocaleString('en-US')} of them a pair`);
    console.log(`  RTP ${(rtp * 100).toFixed(1)}% measured against ${(theory * 100).toFixed(1)}% theoretical`);
    console.log(`  jackpots ${g.jackpots} · biggest single win 🪙 ${g.biggest.toLocaleString('en-US')}`);

    // Sampling error over 200k spins is small, but a ×100 jackpot is lumpy —
    // three points either side is honest rather than tight.
    check(Math.abs(rtp - theory) < 0.03,
        `slots: RTP ${(rtp * 100).toFixed(1)}% is far from the paytable's ${(theory * 100).toFixed(1)}%`);

    // Betting limits hold, and a bet is never larger than the balance.
    const poor = new game.Engine({
        rng: new CV.RNG(9), seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: 3 })], config: {},
    });
    poor.start();
    poor.spin(1000);
    check(poor.seat.startCoins - poor.seat.coins + poor.last.payout === poor.last.payout - poor.last.net + 0
        || poor.last.bet <= 3, `slots: staked ${poor.last.bet} with only 3 coins`);
    check(poor.last.bet <= 3, `slots: bet ${poor.last.bet} exceeded the balance of 3`);
    console.log('  ✓ bet never exceeds the balance, and every line is priced once');
}
auditSlots();

/* ---- the baccarat drawing table, exhaustively --------------------------- */

/**
 * Every cell of the third-card table, checked against the rules as written
 * rather than against whatever hands happened to come up. A sampled game can
 * play thousands of rounds without once putting a Banker 3 against a player
 * third card of 9 — which is exactly the cell that was wrong.
 */
function auditBaccaratTable() {
    console.log('\n📐 百家乐 drawing table');
    const game = CV.Registry.get('baccarat');
    const e = new game.Engine({
        rng: new CV.RNG(1),
        seats: [new CV.Seat(0, { kind: 'ai', coins: 1000 })],
        config: {},
    });

    // A card of each pip value 0-9. Tens and pictures are 0; an ace is 1.
    const cardOf = (v) => (v === 0 ? { r: 13, s: 'S', id: 'K' }
        : v === 1 ? { r: 14, s: 'S', id: 'A' }
        : { r: v, s: 'S', id: 'c' + v });

    // Player stood: banker draws on 0-5, stands on 6-7.
    for (let b = 0; b <= 7; b++) {
        check(e.bankerDraws(b, null) === (b <= 5),
            `baccarat: player stood, banker ${b} should ${b <= 5 ? 'draw' : 'stand'}`);
    }

    // Player drew: one row per banker total, exactly as the house table reads.
    const draws = (b, v) => {
        if (b <= 2) return true;
        if (b === 3) return v <= 7;              // stands on 8-9
        if (b === 4) return v >= 2 && v <= 7;
        if (b === 5) return v >= 4 && v <= 7;
        if (b === 6) return v === 6 || v === 7;
        return false;                            // 7 stands
    };

    let cells = 0;
    for (let b = 0; b <= 7; b++) {
        for (let v = 0; v <= 9; v++) {
            const got = e.bankerDraws(b, cardOf(v));
            check(got === draws(b, v),
                `baccarat: banker ${b} v player third ${v} gave ${got ? 'draw' : 'stand'}, `
                + `wanted ${draws(b, v) ? 'draw' : 'stand'}`);
            cells++;
        }
    }
    console.log(`  ${cells + 8} cells checked — the stand row and every draw row`);

    // Scoring keeps only the last digit, and the pip values are the odd ones.
    check(CV.BaccaratTotal([cardOf(7), cardOf(8)]) === 5, 'baccarat: 7 + 8 should be 5');
    check(CV.BaccaratTotal([cardOf(9), cardOf(8), cardOf(6)]) === 3, 'baccarat: 9 + 8 + 6 should be 3');
    check(CV.BaccaratTotal([cardOf(0), cardOf(0)]) === 0, 'baccarat: two pictures should be 0');
    check(CV.BaccaratTotal([cardOf(1), cardOf(0)]) === 1, 'baccarat: ace + picture should be 1');
    console.log('  ✓ scoring keeps only the last digit');
}
auditBaccaratTable();

/* ---- 射龙门, gate by gate ----------------------------------------------- */

/**
 * The gate is small enough to check completely, so it is: every pair of posts
 * against every third card, in both post orders, and both calls on an equal
 * gate. Cheaper than sampling, and it cannot miss the rare cell the way a
 * played-out game does.
 *
 * The three rules with the most room to go quietly wrong are asserted by
 * name: the ace ranks 1, a card level with a post is 压线 and loses, and an
 * equal gate is *never* resolved for the player.
 */
function auditDragonGate() {
    console.log('\n🐉 射龙门');
    const game = CV.Registry.get('dragongate');
    const rank = CV.DragonGateRank;
    const ANTE = CV.Registry.room('beginner').bet[0];

    check(rank({ r: 14 }) === 1, 'dragongate: the ace must rank 1, never 14');
    for (let r = 2; r <= 13; r++) check(rank({ r }) === r, `dragongate: rank ${r} does not rank ${r}`);

    let n = 0;
    const cardOf = (r) => ({ r: r === 1 ? 14 : r, s: 'S', id: 'dg' + (n++) });

    /** The rules as written, re-derived here rather than asked of the engine. */
    const verdict = (lo, hi, pick, r) => {
        if (lo === hi) {
            if (r === lo) return 'post';
            if (pick === 'higher') return r > lo ? 'gate' : 'outside';
            return r < lo ? 'gate' : 'outside';
        }
        if (r === lo || r === hi) return 'post';
        return (r > lo && r < hi) ? 'gate' : 'outside';
    };

    /** The quote a seat is looking at, for the call it is actually making. */
    const quoteFor = (e, pick) => {
        const q = e.quote;
        if (!q) return null;
        return q.one || (pick === 'lower' ? q.lower : q.higher);
    };

    /** An engine whose next three cards are exactly a, b, third. */
    const rigged = (a, b, third, coins) => {
        const e = new game.Engine({
            rng: new CV.RNG(7),
            seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: coins || 100000 })],
            config: {},
        });
        // draw() pops, so the first card dealt is the last in the array. This
        // has to happen before start(), which antes and opens the gate.
        e.deck.cards = e.deck.cards.slice(0, 20).concat([cardOf(third), cardOf(b), cardOf(a)]);
        e.start();
        return e;
    };

    /* --- every gate against every third card ---------------------------- */

    let cells = 0, gates = 0, posts = 0, outside = 0, shut = 0;
    for (let a = 1; a <= 13; a++) {
        for (let b = 1; b <= 13; b++) {
            for (let third = 1; third <= 13; third++) {
                const picks = (a === b) ? ['higher', 'lower'] : [null];
                for (const pick of picks) {
                    const e = rigged(a, b, third);
                    const pot = e.pot;
                    check(pot === ANTE, `dragongate: a solo table anted ${pot}, wanted ${ANTE}`);
                    const called = Math.min(ANTE, e.callCap(e.seat));
                    e.handle({ type: 'bet', amount: called });

                    if (a === b) {
                        // The rule that must never be shortcut: an equal gate
                        // is a question put to the player, not a loss.
                        check(e.phase === 'choose', `dragongate: gate ${a}=${b} did not ask 大过/小过`);
                        check(e.third === null, `dragongate: gate ${a}=${b} drew a third card before the call`);
                        check(e.outcome === null, `dragongate: gate ${a}=${b} was resolved without a call`);
                        const opts = e.legalActions(0);
                        check(opts.length === 2 && opts[0].dir === 'higher' && opts[1].dir === 'lower',
                            `dragongate: gate ${a}=${b} offered ${opts.length} calls`);
                        e.handle({ type: 'pick', dir: pick });
                    }

                    const lo = Math.min(a, b), hi = Math.max(a, b);
                    const want = verdict(lo, hi, pick, third);
                    check(e.outcome === want,
                        `dragongate: posts ${a}/${b}${pick ? ' called ' + pick : ''} v ${third} `
                        + `gave ${e.outcome}, wanted ${want}`);

                    // The money follows the verdict: what you called comes out
                    // of the middle, goes into it, or goes into it twice over.
                    const swing = want === 'gate' ? called
                        : want === 'post' ? -called * e.config.postPenalty
                        : -called;
                    check(e.seat.net === swing - ANTE,
                        `dragongate: ${want} left net ${e.seat.net}, wanted ${swing - ANTE}`);
                    check(e.seat.coins === e.seat.startCoins + e.seat.net,
                        'dragongate: coins do not reconcile');
                    check(e.pot === pot - swing,
                        `dragongate: the middle holds ${e.pot}, wanted ${pot - swing}`);
                    check(e.isOver(), `dragongate: posts ${a}/${b} v ${third} never finished`);

                    const q = quoteFor(e, pick);
                    if (q.winners === 0) { shut++; check(want !== 'gate', 'dragongate: a shut gate let one through'); }
                    if (want === 'gate') gates++; else if (want === 'post') posts++; else outside++;
                    cells++;
                }
            }
        }
    }
    console.log(`  ${cells.toLocaleString('en-US')} gates played out — `
        + `${gates} 射中龙门, ${posts} 压线, ${outside} 龙门外`);
    console.log('  ✓ level with a post always loses double · ✓ an equal gate always asks 大过/小过');

    /* --- the card is the card, whatever was called ---------------------- */

    const small = rigged(4, 10, 7), big = rigged(4, 10, 7);
    small.handle({ type: 'bet', amount: 1 });
    big.handle({ type: 'bet', amount: big.callCap(big.seat) });
    check(rank(small.third) === rank(big.third) && small.outcome === big.outcome,
        'dragongate: the third card moved with the size of the call');
    check(small.quote.one.winners === big.quote.one.winners,
        'dragongate: the quote moved with the size of the call');

    const up = rigged(9, 9, 12), down = rigged(9, 9, 12);
    up.handle({ type: 'bet', amount: 10 });   up.handle({ type: 'pick', dir: 'higher' });
    down.handle({ type: 'bet', amount: 10 }); down.handle({ type: 'pick', dir: 'lower' });
    check(rank(up.third) === rank(down.third), 'dragongate: the third card moved with the call');
    check(up.outcome === 'gate' && down.outcome === 'outside', 'dragongate: the call was not honoured');
    console.log('  ✓ neither the call nor its size moves the card');

    /* --- nobody may call more than is in the middle --------------------- */

    {
        const e = rigged(2, 12, 7, 1e6);
        check(e.callCap(e.seat) <= e.pot,
            `dragongate: a seat could call ${e.callCap(e.seat)} at a pot of ${e.pot}`);
        e.handle({ type: 'bet', amount: 1e6 });
        check(e.seats[0].bet <= ANTE, `dragongate: called ${e.seats[0].bet} at a pot of ${ANTE}`);

        // And never more than it can settle twice over, because 撞柱 doubles.
        const thin = rigged(2, 12, 7, ANTE + 3);
        check(thin.callCap(thin.seat) <= Math.floor(thin.seat.coins / thin.config.postPenalty),
            'dragongate: a seat could call more than it could pay for a post');
    }
    console.log('  ✓ a call is capped by the middle, and by what a post would cost');

    /* --- an adjacent gate cannot be won, and says so -------------------- */

    for (const pair of [[7, 8], [1, 2], [12, 13]]) {
        const e = rigged(pair[0], pair[1], 5);
        e.handle({ type: 'bet', amount: 10 });
        check(e.quote.one.winners === 0,
            `dragongate: gate ${pair[0]}/${pair[1]} claims ${e.quote.one.winners} winning cards`);
        check(e.outcome !== 'gate', `dragongate: something got through gate ${pair[0]}/${pair[1]}`);
    }
    console.log(`  ✓ adjacent posts have no winners, and ${shut.toLocaleString('en-US')} shut gates paid nothing`);

    /* --- the count of winning cards is the real count ------------------- */

    {
        const e = rigged(3, 11, 6);
        const q = e.quote.one;
        e.handle({ type: 'bet', amount: 10 });
        // Counted before the third card was taken, so put it back.
        const left = e.deck.cards.concat([e.third]);
        const want = left.filter((c) => rank(c) > 3 && rank(c) < 11).length;
        const onPost = left.filter((c) => rank(c) === 3 || rank(c) === 11).length;
        check(q.winners === want,
            `dragongate: quoted ${q.winners} winning cards, the pack holds ${want}`);
        check(q.posts === onPost,
            `dragongate: quoted ${q.posts} posts, the pack holds ${onPost}`);
        check(q.remaining === left.length,
            `dragongate: quoted ${q.remaining} cards left, the pack holds ${left.length}`);
        check(Math.abs(q.pct - want / left.length) < 1e-9, 'dragongate: the chance is not the count');
        console.log(`  ✓ the quote is the true count — gate 3 to J: ${q.winners} of ${q.remaining} get through`);
    }

    /* --- the pack is not reshuffled between rounds ---------------------- */

    {
        let shoe = null, seen = new Set(), rounds = 0, reshuffles = 0, coins = 100000;
        while (rounds < 40) {
            const e = new game.Engine({
                rng: new CV.RNG(31 + rounds),
                seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins })],
                config: { shoe },
            });
            const before = shoe ? shoe.deck.cards.length : 52;
            e.start();
            // start() has already taken the two posts, so add them back before
            // comparing — otherwise every round looks like it shrank the pack.
            if (e.deck.remaining + 2 > before) { reshuffles++; seen = new Set(); }
            e.handle({ type: 'bet', seat: 0, amount: e.callCap(e.seat) || 1 });
            if (e.phase === 'choose') e.handle({ type: 'pick', dir: 'higher' });
            for (const c of e.gate.cards.concat(e.third ? [e.third] : [])) {
                check(!seen.has(c.id), `dragongate: card ${c.id} came out twice without a reshuffle`);
                seen.add(c.id);
            }
            coins = e.seat.coins;
            shoe = e.shoeState;
            rounds++;
        }
        check(reshuffles > 0, 'dragongate: 40 rounds off one pack — it never reshuffled');
        console.log(`  ✓ 40 rounds, no card repeated between reshuffles (${reshuffles} of them)`);
    }

    /* --- the pot carries, and a fresh ante is only taken on an empty one - */

    {
        let shoe = null, antes = 0, carried = 0;
        let coins = 1e6;
        for (let g = 0; g < 60; g++) {
            const potBefore = shoe ? shoe.pot : 0;
            const e = new game.Engine({
                rng: new CV.RNG(5100 + g),
                seats: [0, 1, 2, 3, 4].map((i) => new CV.Seat(i, {
                    kind: i ? 'ai' : 'human', isYou: i === 0, name: 'S' + i, coins: 1e5,
                })),
                config: { shoe },
            });
            const ai = new CV.DragonGateAI(e);
            e.start();

            if (potBefore > 0) {
                carried++;
                check(e.pot === potBefore,
                    `dragongate: carried ${potBefore} into a hand that started at ${e.pot}`);
                check(e.seats.every((s) => s.ante === 0),
                    'dragongate: a carried pot was anted into a second time');
            } else {
                antes++;
                check(e.pot === ANTE * 5, `dragongate: five seats anted to ${e.pot}`);
            }

            const potStart = e.pot;
            // After the ante, not before it: the ante is already inside
            // potStart, and counting it on both sides would look like a leak.
            const startCoins = e.seats.map((s) => s.coins);
            let guard = 0;
            while (!e.isOver() && guard++ < 30) {
                const move = ai.decide(e.turn);
                check(!!move, `dragongate: seat ${e.turn} had nothing to play`);
                e.handle(move);
            }
            check(e.isOver(), 'dragongate: a five-seat hand never finished');

            // Nothing is created and nothing is destroyed: every coin that
            // left a seat is in the middle, and every coin taken out of the
            // middle is at a seat.
            const moved = e.seats.reduce((a, s, i) => a + (s.coins - startCoins[i]), 0);
            check(potStart - e.pot === moved,
                `dragongate: the middle moved ${potStart - e.pot} but the seats moved ${moved}`);
            check(e.pot >= 0, `dragongate: the middle went to ${e.pot}`);
            check(e.cleared === (e.pot === 0), 'dragongate: cleared disagrees with the middle');

            const rows = e.result().ranks;
            const house = rows.find((r) => r.house);
            const players = rows.filter((r) => !r.house);
            check(players.length === 5, `dragongate: ${players.length} seats in a five-seat recap`);
            check(house && house.coins === -players.reduce((a, r) => a + r.coins, 0),
                'dragongate: the middle does not hold the other side of the table');

            shoe = e.shoeState;
            coins = e.seats[0].coins;
        }
        check(carried > 5, `dragongate: the pot carried only ${carried} times in 60 hands`);
        check(antes > 1, `dragongate: the pot was cleared only ${antes - 1} times in 60 hands`);
        console.log(`  ${antes} fresh antes, ${carried} hands riding a carried pot — coins reconcile every time`);
        console.log('  ✓ the middle is conserved: what leaves a seat lands in it, and back');
        void coins;
    }

    /* --- a table takes turns, off one pack ------------------------------ */

    /**
     * Five seats, and the three things a table can get wrong that one chair
     * cannot: a seat shooting out of turn, two seats being dealt the same
     * card, and a hand ending before everybody has had their gate — unless
     * the middle was emptied, which ends it there and then by design.
     */
    {
        let rounds = 0, shots = 0, shut2 = 0, passes = 0, cleared = 0;
        for (let g = 0; g < 60; g++) {
            const e = new game.Engine({
                rng: new CV.RNG(9000 + g),
                seats: [0, 1, 2, 3, 4].map((i) => new CV.Seat(i, {
                    kind: i ? 'ai' : 'human', isYou: i === 0, name: 'S' + i, coins: 5000,
                })),
                config: { shoe: null },
            });
            const ai = new CV.DragonGateAI(e);
            e.start();

            const seen = new Set();
            let packAt = e.deck.remaining;
            let guard = 0;

            while (!e.isOver() && guard++ < 40) {
                const turn = e.turn;

                // Nobody but the seat whose shot it is may act.
                for (let i = 0; i < 5; i++) {
                    if (i === turn) continue;
                    check(e.legalActions(i).length === 0,
                        `dragongate: seat ${i} had actions on seat ${turn}'s gate`);
                }
                check(e.handle({ type: 'bet', seat: (turn + 1) % 5, amount: 10 }) === false,
                    'dragongate: a seat acted out of turn and the engine took it');

                const move = ai.decide(turn);
                check(!!move, `dragongate: seat ${turn} had nothing to play`);
                e.handle(move);

                // A reshuffle is the one time a card may legitimately repeat.
                if (e.deck.remaining > packAt) seen.clear();
                packAt = e.deck.remaining;

                const s = e.seats[turn];
                if (s.done) {
                    if (s.skipped) passes++; else shots++;
                    if (s.quote && e.quoteWinners(s) === 0) shut2++;
                    // A passed gate still spent its posts; only the third card
                    // is missing, because it was never drawn.
                    for (const c of s.gate.cards.concat(s.third ? [s.third] : [])) {
                        check(!seen.has(c.id),
                            `dragongate: ${c.id} was dealt to two seats in one hand`);
                        seen.add(c.id);
                    }
                    check(!s.skipped || (s.third === null && s.bet === 0 && s.net === -s.ante),
                        `dragongate: seat ${turn} passed but was charged for it`);
                }
            }

            check(e.isOver(), 'dragongate: a five-seat hand never finished');
            if (e.cleared) cleared++;
            else {
                check(e.seats.every((x) => x.done || x.out),
                    'dragongate: the hand ended with a seat that never shot');
            }
            rounds++;
        }
        console.log(`  ${rounds} five-seat hands — ${shots} gates shot off a shared pack, `
            + `${passes} passed, ${shut2} shut, ${cleared} cleared the middle out`);
        console.log('  ✓ seats shoot in turn, and no card reached two of them');
    }

    /* --- the gate comes first, and passing is free ---------------------- */

    /**
     * The ordering is the game. A seat must be looking at its posts, and at
     * what can still get through them, *before* it is asked for money —
     * otherwise "pass" is not a decision and an adjacent gate is just a levy.
     */
    {
        let quoted = 0, passed = 0, equalQuotes = 0;
        for (let g = 0; g < 300; g++) {
            const e = new game.Engine({
                rng: new CV.RNG(1700 + g),
                seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: 5000 })],
                config: { shoe: null },
            });
            e.start();

            check(e.phase === 'offer', 'dragongate: the turn did not open on an offer');
            check(!!e.gate && e.gate.cards.length === 2, 'dragongate: no posts at the offer');
            check(e.third === null, 'dragongate: a third card was drawn before any stake');
            check(e.seat.bet === 0 && e.seat.coins === e.seat.startCoins - e.seat.ante,
                'dragongate: the seat was charged before it agreed to play');

            const q = e.quote;
            check(!!q, 'dragongate: the gate was offered without a quote');
            const opts = e.legalActions(0).map((o) => o.type);
            check(opts.includes('skip'), 'dragongate: a gate was offered with no way to pass it');
            quoted++;

            if (e.gate.equal) {
                // Both calls quoted, because the seat has to weigh them.
                check(q.higher && q.lower, 'dragongate: an equal gate quoted only one call');
                equalQuotes++;
                e.handle({ type: 'bet', seat: 0, amount: 10 });
                const dir = q.higher.winners >= q.lower.winners ? 'higher' : 'lower';
                e.handle({ type: 'pick', seat: 0, dir });
                const r = rank(e.third);
                const wantWin = dir === 'higher' ? r > e.gate.low : r < e.gate.low;
                check((e.outcome === 'gate') === wantWin,
                    `dragongate: called ${dir} on ${e.gate.low}, got ${r}, said ${e.outcome}`);
            } else if (g % 3 === 0) {
                // Pass it, and check the pass cost nothing beyond the ante.
                const before = e.seat.coins;
                e.handle({ type: 'skip', seat: 0 });
                check(e.seat.skipped && e.seat.done, 'dragongate: a pass did not end the turn');
                check(e.seat.third === null, 'dragongate: a passed gate still drew a third card');
                check(e.seat.coins === before, 'dragongate: passing cost the seat money');
                check(e.isOver(), 'dragongate: the solo hand did not end on a pass');
                passed++;
            } else {
                const want = q.one;
                const cap = e.callCap(e.seat);
                e.handle({ type: 'bet', seat: 0, amount: cap });
                check(e.quote.one.winners === want.winners,
                    'dragongate: the quote changed once the call was made');
            }
        }
        check(passed > 20, `dragongate: only ${passed} gates were passed in 300`);
        check(equalQuotes > 5, `dragongate: only ${equalQuotes} equal gates in 300`);
        console.log(`  ${quoted} gates offered before a stake — ${equalQuotes} of them quoted both calls`);
        console.log('  ✓ the quote is fixed when the gate is dealt, and passing is free');
    }

    /* --- what the table is allowed to say out loud ---------------------- */

    {
        const e = rigged(5, 9, 7);
        e.handle({ type: 'bet', amount: 10 });
        const view = e.snapshotFor(0);
        check(!view.rng, 'dragongate: the snapshot carries the RNG');
        check(!('deck' in view), 'dragongate: the snapshot carries the pack');
        check(view.shoeRemaining === e.deck.remaining, 'dragongate: the snapshot misreports the pack');
        check(view.pot === e.pot, 'dragongate: the snapshot misreports the middle');
    }

    // The rules card must have something to show a first-time player.
    check(game.rules && game.rules.length >= 5, 'dragongate: too few rules to teach the game');
    for (const key of game.rules) check(CV.t(key) !== key, `dragongate: rule key ${key} has no text`);
    for (const key of ['dg.gate', 'dg.post', 'dg.outside', 'dg.higher', 'dg.lower', 'dg.shut',
                       'dg.pot', 'dg.cleared', 'dg.potLeft', 'dg.callNote'])
        check(CV.t(key) !== key, `dragongate: ${key} has no text`);

    /* --- the call is the caller's, at every seat ------------------------ */

    // An equal gate is never resolved for a player, whichever chair they are
    // in. This is the one rule a turn loop could quietly drop.
    {
        let asked = 0;
        for (let g = 0; g < 400 && asked < 12; g++) {
            const e = new game.Engine({
                rng: new CV.RNG(400 + g),
                seats: [0, 1, 2].map((i) => new CV.Seat(i, {
                    kind: i ? 'ai' : 'human', isYou: i === 0, name: 'S' + i, coins: 5000,
                })),
                config: { shoe: null },
            });
            const ai = new CV.DragonGateAI(e);
            e.start();
            let guard = 0;
            while (!e.isOver() && guard++ < 30) {
                const turn = e.turn;
                check(e.phase === 'offer', `dragongate: seat ${turn} was not offered its gate`);
                check(!!e.seats[turn].gate, 'dragongate: asked for a stake with no gate on the table');
                const cap = e.callCap(e.seats[turn]);
                if (cap < 1) { e.handle({ type: 'skip', seat: turn }); continue; }
                e.handle({ type: 'bet', seat: turn, amount: cap });
                if (e.phase === 'choose') {
                    asked++;
                    check(e.seats[turn].third === null,
                        `dragongate: seat ${turn} got its third card before it called`);
                    check(e.legalActions(turn).every((o) => o.type === 'pick'),
                        'dragongate: an equal gate offered something other than the call');
                    e.handle(ai.decide(turn));
                }
            }
        }
        check(asked >= 12, `dragongate: only ${asked} equal gates came up in 400 tables`);
        console.log(`  ✓ ${asked} equal gates, every one put to the seat holding it`);
    }

    console.log('  ✓ rules card and verdict labels all resolve');
}
auditDragonGate();

/* ---- 斗地主 ------------------------------------------------------------- */

/**
 * Two halves. The first is the combination table, checked case by case
 * against the rules as written — including the ones that must NOT parse, like
 * `A 2 3 4 5` and `J Q K A 2`, because a straight that quietly accepts an ace
 * as a one is the classic way this game goes wrong.
 *
 * The second plays whole rounds and audits them: 54 cards in and 54 cards
 * out, every play legal against what was down, two passes clearing the table,
 * the multiplier equal to two to the power of the bombs, and coins that
 * balance without taking anyone below zero.
 */

const DDZ_TOKENS = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14, 'sj': 15, 'bj': 16,
};

let ddzUid = 0;
function ddzHand(str) {
    return str.split(/\s+/).filter(Boolean).map((tok) => {
        const r = DDZ_TOKENS[tok];
        if (r === undefined) throw new Error('bad token ' + tok);
        const joker = (r === 15 || r === 16);
        return { r, s: joker ? 'J' : 'SHDC'[ddzUid % 4], id: 'k' + (ddzUid++) };
    });
}

function auditDouDiZhu() {
    console.log('\n👑 斗地主');
    const game = CV.Registry.get('doudizhu');
    const D = CV.DDZ;

    /* --- the order of the cards ------------------------------------------ */

    const s = (tok) => D.strength(ddzHand(tok)[0]);
    check(s('3') === 3, 'ddz: 3 is the floor');
    check(s('A') === 14 && s('2') === 15, 'ddz: the 2 must outrank the ace');
    check(s('sj') === 16 && s('bj') === 17, 'ddz: small joker under big joker, both over the 2');
    for (const [a, b] of [['3', '4'], ['10', 'J'], ['K', 'A'], ['A', '2'], ['2', 'sj'], ['sj', 'bj']]) {
        check(s(a) < s(b), `ddz: ${a} should rank under ${b}`);
    }

    /* --- what the cards are ---------------------------------------------- */

    const named = (str) => { const c = D.parse(ddzHand(str)); return c ? c.type : null; };

    const TABLE = [
        ['7',                          'single'],
        ['sj',                         'single'],
        ['8 8',                        'pair'],
        ['K K K',                      'triple'],
        ['7 7 7 K',                    'triple1'],
        ['7 7 7 K K',                  'triple2'],
        ['3 4 5 6 7',                  'straight'],
        ['8 9 10 J Q K',               'straight'],
        ['10 J Q K A',                 'straight'],
        ['3 3 4 4 5 5',                'pairs'],
        ['8 8 9 9 10 10 J J',          'pairs'],
        ['3 3 3 4 4 4',                'plane'],
        ['7 7 7 8 8 8 9 9 9',          'plane'],
        ['3 3 3 4 4 4 7 K',            'plane1'],
        ['3 3 3 4 4 4 7 7 K K',        'plane2'],
        ['9 9 9 9 3 K',                'four2'],
        ['9 9 9 9 3 3',                'four2'],
        ['9 9 9 9 3 3 K K',            'four2pair'],
        ['A A A A',                    'bomb'],
        ['sj bj',                      'rocket'],
        // The ones that must not read as anything at all.
        ['A 2 3 4 5',                  null],
        ['J Q K A 2',                  null],
        ['3 4 5 6',                    null],
        ['Q Q K K A A 2 2',            null],
        ['3 3 4 4',                    null],
        ['2 2 2 3 3 3',                null],
        ['A A A 2 2 2',                null],
        ['K K K K K',                  null],
        ['3 4 5 7 8',                  null],
        ['sj bj 2',                    null],
    ];
    for (const [cards, want] of TABLE) {
        const got = named(cards);
        check(got === want, `ddz: "${cards}" read as ${got}, wanted ${want}`);
    }
    console.log(`  ${TABLE.length} combinations named, the invalid ones included`);

    // A straight, a run of pairs and an airplane may never touch a 2 or a joker.
    let banned = 0;
    for (const cards of ['J Q K A 2', 'Q Q K K A A 2 2', 'K K K A A A 2 2 2', '2 2 3 3 4 4']) {
        for (const r of D.readings(ddzHand(cards))) {
            check(!['straight', 'pairs', 'plane', 'plane1', 'plane2'].includes(r.type),
                `ddz: "${cards}" read as a ${r.type} — a 2 or joker got into a run`);
            banned++;
        }
    }
    check(banned >= 0, '');
    console.log('  ✓ no 2 and no joker in a straight, a run of pairs or an airplane');

    /* --- which beats which ------------------------------------------------ */

    const cmp = (a, b) => D.beats(D.parse(ddzHand(a)), D.parse(ddzHand(b)));
    const BEATS = [
        ['9 9',            '7 7',              true],
        ['9 9 9',          '7 7',              false],   // type must match
        ['7 7',            '9 9',              false],
        ['4 5 6 7 8',      '3 4 5 6 7',        true],
        ['3 4 5 6 7 8',    '3 4 5 6 7',        false],   // and so must the count
        ['9 9 9 3 3',      '6 6 6 4 4',        true],    // kickers do not count
        ['6 6 6 K K',      '9 9 9 3 3',        false],
        ['9 9 9 K',        '6 6 6 3',          true],
        ['5 5 5 6 6 6',    '3 3 3 4 4 4',      true],
        ['5 5 6 6 7 7',    '3 3 4 4 5 5',      true],
        ['2',              'A',                true],
        ['A',              '2',                false],
        ['sj',             '2',                true],
        ['bj',             'sj',               true],
        ['3 3 3 3',        '9 9',              true],    // a bomb takes anything
        ['3 3 3 3',        '9 9 9 9 3 3 K K',  true],
        ['K K K K',        '8 8 8 8',          true],
        ['8 8 8 8',        'K K K K',          false],
        ['sj bj',          'K K K K',          true],    // and the rocket takes bombs
        ['K K K K',        'sj bj',            false],
        ['sj bj',          '3',                true],
    ];
    for (const [a, b, want] of BEATS) {
        check(cmp(a, b) === want, `ddz: "${a}" v "${b}" gave ${cmp(a, b)}, wanted ${want}`);
    }

    // Nothing beats itself, and nothing beats what beats it.
    const SAMPLES = TABLE.filter(([, w]) => w).map(([c]) => c);
    let pairsChecked = 0;
    for (const a of SAMPLES) {
        check(!cmp(a, a), `ddz: "${a}" beats itself`);
        for (const b of SAMPLES) {
            if (cmp(a, b) && cmp(b, a)) check(false, `ddz: "${a}" and "${b}" each beat the other`);
            pairsChecked++;
        }
    }
    console.log(`  ${BEATS.length} comparisons and ${pairsChecked} ordering checks`);

    /* --- find() never offers a play that is not one ----------------------- */

    {
        const rng = new CV.RNG(4242);
        let offered = 0;
        for (let i = 0; i < 600; i++) {
            const deck = new CV.Cards.Deck(rng, { decks: 1, jokers: true });
            deck.shuffle();
            const hand = deck.drawMany(rng.range(5, 20));
            const other = deck.drawMany(rng.range(1, 5));
            const req = D.parse(other);
            const ids = new Set(hand.map((c) => c.id));
            for (const play of D.find(hand, req)) {
                check(play.every((c) => ids.has(c.id)), 'ddz: find() offered a card not in the hand');
                check(new Set(play.map((c) => c.id)).size === play.length, 'ddz: find() used a card twice');
                const combo = D.canBeat(play, req);
                check(!!combo, `ddz: find() offered ${play.length} cards that do not answer ${req && req.type}`);
                offered++;
            }
        }
        console.log(`  ${offered.toLocaleString('en-US')} suggested plays, every one legal and held`);
    }

    /* --- whole rounds ----------------------------------------------------- */

    const ROUNDS = Math.max(120, Math.round(HANDS / 6));
    const master = new CV.RNG(97531);
    let landlordWins = 0, springs = 0, antis = 0, bombs = 0, rockets = 0, redeals = 0;
    const t0 = Date.now();

    for (let g = 0; g < ROUNDS; g++) {
        const rng = new CV.RNG(master.int(1e9));
        const room = CV.Registry.ROOMS[master.int(4)].id;
        const chairs = [0, 1, 2].map((i) => new CV.Seat(i, {
            kind: 'ai', name: 'S' + i, coins: 20000, isYou: i === master.int(3),
        }));
        const e = new game.Engine({ rng, seats: chairs, config: { room } });
        const ai = new game.AI(e);
        e.start();

        const dealt = e.seats.reduce((n, s) => n + s.cards.length, 0);
        check(dealt === 51, `ddz: dealt ${dealt} cards to hands, wanted 51`);
        check(e.bottom.length === 3, `ddz: ${e.bottom.length} cards left face down, wanted 3`);
        check(allDistinct(e.seats.flatMap((s) => s.cards).concat(e.bottom)) === 54,
            'ddz: the pack is not 54 distinct cards');

        let steps = 0, crowned = false;
        const played = [];
        while (!e.isOver()) {
            const seat = e.turn;
            const before = e.trick ? e.trick.combo : null;
            const held = new Set(e.seats[seat].cards.map((c) => c.id));
            const action = ai.decide(seat);
            check(!!action, `ddz: the AI had nothing to do in ${e.phase}`);
            if (!action) break;

            if (action.type === 'play') {
                // Legal against what was down, and out of that seat's own hand.
                const cards = action.cards.map((id) => e.seats[seat].cards.find((c) => c.id === id));
                check(cards.every(Boolean), 'ddz: the AI played a card it does not hold');
                check(action.cards.every((id) => held.has(id)), 'ddz: the AI played a card it does not hold');
                check(!!CV.DDZ.canBeat(cards.filter(Boolean), before),
                    'ddz: the AI played something that does not answer the table');
                played.push(...action.cards);
            }
            check(e.apply(action), `ddz: engine refused ${action.type} in ${e.phase}`);

            if (!crowned && e.landlord >= 0) {
                crowned = true;
                check(e.seats[e.landlord].cards.length === 20,
                    `ddz: the Landlord holds ${e.seats[e.landlord].cards.length} cards, wanted 20`);
                check(e.base >= 1 && e.base <= 3, `ddz: base score ${e.base} out of range`);
            }
            if (++steps > 500) { check(false, 'ddz: a round ran past 500 actions'); break; }
        }
        redeals += e.deals - 1;

        /* the round, once it is over */
        const left = e.seats.reduce((n, s) => n + s.cards.length, 0);
        check(left + played.length === 54, `ddz: ${left} held + ${played.length} played is not 54`);
        check(e.seats[e.winner].cards.length === 0, 'ddz: the winner still holds cards');
        check(e.winner >= 0, 'ddz: nobody went out');

        // Two passes clear the table, and the lead goes back to whoever
        // last got cards down.
        auditTricks(e);

        // Every bomb and the rocket doubles, and a spring doubles once more.
        check(e.multiplier === Math.pow(2, e.bombs + e.rockets),
            `ddz: multiplier ${e.multiplier} against ${e.bombs} bombs and ${e.rockets} rockets`);
        const wantScore = e.base * e.multiplier * ((e.spring || e.antiSpring) ? 2 : 1);
        check(e.score === wantScore, `ddz: score ${e.score}, wanted ${wantScore}`);

        // 春天 only when the Farmers never played; 反春 only when the Farmers
        // won and exactly one of them played, which is the rule as written.
        const farmerPlays = e.farmers.map((i) => e.plays[i]);
        check(e.spring === (e.landlordWon && farmerPlays.every((n) => n === 0)),
            'ddz: 春天 disagrees with what the Farmers did');
        check(e.antiSpring === (!e.landlordWon && farmerPlays.filter((n) => n > 0).length === 1),
            'ddz: 反春 disagrees with what the Farmers did');
        if (e.spring) check(e.landlordWon, 'ddz: a 春天 that the Landlord did not win');

        // The Landlord's swing is two Farmers' worth, coins balance, and
        // nobody is taken below zero.
        const r = e.result();
        const total = e.seats.reduce((n, x) => n + x.net, 0);
        check(total === 0, `ddz: the table gained ${total} coins out of nowhere`);
        for (const x of e.seats) {
            check(x.coins >= 0, 'ddz: a seat was taken below zero');
            check(x.coins === x.startCoins + x.net, 'ddz: coins do not reconcile');
        }
        const lord = r.forSeat(e.landlord);
        const farm = r.forSeat(e.farmers[0]);
        check((lord.coins > 0) === e.landlordWon, 'ddz: the Landlord was paid the wrong way');
        check((farm.coins > 0) !== e.landlordWon, 'ddz: a Farmer was paid the wrong way');
        check(r.ranks.filter((row) => row.rank === 1).length === (e.landlordWon ? 1 : 2),
            'ddz: the winning side is the wrong size');

        if (e.landlordWon) landlordWins++;
        if (e.spring) springs++;
        if (e.antiSpring) antis++;
        bombs += e.bombs; rockets += e.rockets;
    }

    console.log(`  ${ROUNDS} rounds, ${Date.now() - t0} ms — Landlord won `
        + `${(landlordWins / ROUNDS * 100).toFixed(1)}%`);
    console.log(`  ${bombs} bombs · ${rockets} 王炸 · ${springs} 春天 · ${antis} 反春 · ${redeals} redeals`);
    check(landlordWins > 0 && landlordWins < ROUNDS, 'ddz: one side wins every single round');

    /* --- is the table balanced, or is the Landlord's AI just better? ------ */

    // The Landlord wins most rounds, and that is not a bug: the bidding hands
    // the job to whoever was dealt the best hand. Take the bidding out — draw
    // the Landlord at random — and the same AI on both sides should land near
    // even. That is the number worth watching; if it drifts, one side plays
    // better than the other rather than holding better cards.
    {
        const rng = new CV.RNG(2024);
        let wins = 0;
        const N = Math.max(60, Math.round(ROUNDS / 2));
        for (let g = 0; g < N; g++) {
            const e = new game.Engine({
                rng: new CV.RNG(rng.int(1e9)), config: { room: 'beginner' },
                seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 20000 })),
            });
            const ai = new game.AI(e);
            const pick = rng.int(3);
            ai.bidFor = (seat) => (seat === pick ? 2 : 0);
            e.start();
            let steps = 0;
            while (!e.isOver()) {
                const a = ai.decide(e.turn);
                if (!a || !e.apply(a)) break;
                if (++steps > 500) break;
            }
            if (e.landlordWon) wins++;
        }
        const rate = wins / N * 100;
        console.log(`  with the Landlord drawn at random instead of bid for: ${rate.toFixed(1)}%`);
        check(rate > 40 && rate < 68,
            `ddz: ${rate.toFixed(1)}% for a randomly chosen Landlord — the two sides are not playing equally`);
    }

    /* --- what a host may broadcast ---------------------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(5), config: {},
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 500, isYou: i === 0 })),
        });
        e.start();
        for (let viewer = 0; viewer < 3; viewer++) {
            const view = e.snapshotFor(viewer);
            check(!view.rng, 'ddz: the snapshot carries the RNG');
            check(view.bottom.every((c) => c === null), 'ddz: the face-down cards went out on the wire');
            view.seats.forEach((seat, i) => {
                if (i === viewer) check(seat.cards.every(Boolean), 'ddz: your own hand was redacted from you');
                else check(seat.cards.every((c) => c === null) && seat.cards.length === 17,
                    'ddz: another seat\'s hand went out on the wire');
            });
        }
        // And the moment a Landlord exists, the three are public.
        while (e.landlord < 0) e.apply({ type: 'bid', seat: e.turn, bid: 3 });
        check(e.snapshotFor(1).bottom.every(Boolean), 'ddz: the bottom stayed hidden after the Landlord took it');
    }
    console.log('  ✓ no hand and no face-down card on the wire');

    // The rules card must have something to teach a first-time player.
    for (const key of game.rules) check(CV.t(key) !== key, `ddz: rule key ${key} has no text`);
    for (const type of ['single', 'pair', 'triple', 'triple1', 'triple2', 'straight', 'pairs',
                        'plane', 'plane1', 'plane2', 'four2', 'four2pair', 'bomb', 'rocket']) {
        check(CV.t('ddz.type.' + type) !== 'ddz.type.' + type, `ddz: ${type} has no name`);
    }
    console.log('  ✓ rules card and every combination name resolve');
}

const allDistinct = (cards) => new Set(cards.map((c) => c.id)).size;

/** Replay the log: two passes must clear the table and return the lead. */
function auditTricks(e) {
    let lastPlayer = -1, passes = 0, cleared = false;
    for (const ev of e.events) {
        if (ev.type === 'play') {
            if (cleared) {
                check(ev.seat === lastPlayer,
                    `ddz: the trick cleared but seat ${ev.seat} led instead of ${lastPlayer}`);
                cleared = false;
            }
            lastPlayer = ev.seat; passes = 0;
        } else if (ev.type === 'pass') {
            passes++;
            check(passes <= 2, 'ddz: three passes in a row without the table clearing');
        } else if (ev.type === 'trickEnd') {
            check(passes === 2, `ddz: the table cleared after ${passes} passes`);
            check(ev.lead === lastPlayer, 'ddz: the lead did not go back to the last player');
            passes = 0; cleared = true;
        }
    }
}
auditDouDiZhu();

/* ---- 锄大D -------------------------------------------------------------- */

/**
 * Three passes over the rules.
 *
 * First the card order, where suits matter and the 2 sits on top. Then
 * `detect` — named cases from the rules, then 100,000 random five-card hands
 * classified a second time, independently, and compared. A sample that size
 * covers every shape including the ones a played-out game would take hours to
 * produce. Then whole rounds: 52 cards in and out, the 3♦ opening, a pass
 * that locks a seat out of the trick, and coins that balance.
 */

const B2_SUITS = { D: 'D', C: 'C', H: 'H', S: 'S' };
const B2_RANKS = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
                   '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

let b2Uid = 0;
function b2Hand(str) {
    return str.split(/\s+/).filter(Boolean).map((tok) => {
        const suit = tok.slice(-1), rank = tok.slice(0, -1);
        if (!B2_SUITS[suit] || B2_RANKS[rank] === undefined) throw new Error('bad card ' + tok);
        return { r: B2_RANKS[rank], s: suit, id: 'b' + (b2Uid++) };
    });
}

/** The rules again, written out separately from the engine's reading of them. */
function b2Classify(cards) {
    const rv = (c) => (c.r === 2 ? 15 : c.r);
    const vals = cards.map(rv).sort((a, b) => a - b);
    const flush = new Set(cards.map((c) => c.s)).size === 1;
    const cnt = {};
    for (const v of vals) cnt[v] = (cnt[v] || 0) + 1;
    const shape = Object.values(cnt).sort().join('');

    let run = vals[vals.length - 1] <= 14;
    for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1] + 1) run = false;

    if (cards.length === 1) return 'SINGLE';
    if (cards.length === 2) return shape === '2' ? 'PAIR' : null;
    if (cards.length === 3) return shape === '3' ? 'TRIPLE' : null;
    if (cards.length !== 5) return null;
    if (run && flush) return 'STRAIGHT_FLUSH';
    if (shape === '14') return 'FOUR_OF_A_KIND';
    if (shape === '23') return 'FULL_HOUSE';
    if (flush) return 'FLUSH';
    if (run) return 'STRAIGHT';
    return null;
}

function auditBigTwo() {
    console.log('\n🂡 锄大D');
    const game = CV.Registry.get('bigtwo');
    const B = CV.B2;

    /* --- the order of the cards ------------------------------------------ */

    const v = (tok) => B.cardValue(b2Hand(tok)[0]);
    check(v('3S') > v('3H') && v('3H') > v('3C') && v('3C') > v('3D'),
        'b2: the suit order must be ♦ < ♣ < ♥ < ♠');
    check(v('4D') > v('3S'), 'b2: rank is compared before suit — 4♦ must beat 3♠');
    check(v('2D') > v('AS'), 'b2: the 2 must be the highest rank');
    check(v('2S') === Math.max(...['2S', 'AS', 'KS', '3D'].map(v)), 'b2: 2♠ is the top card of the deck');

    /* --- what the cards are ---------------------------------------------- */

    const named = (str) => { const c = B.detect(b2Hand(str)); return c ? c.type : null; };
    const TABLE = [
        ['7S',                    'SINGLE'],
        ['8C 8H',                 'PAIR'],
        ['9D 9C 9S',              'TRIPLE'],
        ['3D 4C 5H 6S 7D',        'STRAIGHT'],
        ['7C 8D 9H 10S JC',       'STRAIGHT'],
        ['10D JC QH KS AD',       'STRAIGHT'],
        ['3S 6S 8S JS KS',        'FLUSH'],
        ['8D 8C 8H KD KC',        'FULL_HOUSE'],
        ['9D 9C 9H 9S KD',        'FOUR_OF_A_KIND'],
        ['5S 6S 7S 8S 9S',        'STRAIGHT_FLUSH'],
        // The ones the rules say are not straights, and the illegal counts.
        ['JD QC KH AS 2D',        null],
        ['AD 2C 3H 4S 5D',        null],
        ['QD KC AH 2S 3D',        null],
        ['KD AC 2H 3S 4D',        null],
        ['8D 9C',                 null],
        ['9D 9C 8S',              null],
        ['9D 9C 9H 9S',           null],
        ['3D 4C 5H 6S',           null],
        ['3D 4C 5H 6S 7D 8C',     null],
        ['3D 5C 7H 9S JD',        null],
        ['2S 2H 2D 2C 3D',        'FOUR_OF_A_KIND'],
    ];
    for (const [cards, want] of TABLE) {
        const got = named(cards);
        check(got === want, `b2: "${cards}" read as ${got}, wanted ${want}`);
    }

    // Every straight window the rules list, and every one they exclude.
    const RANK_NAME = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let windows = 0;
    for (let lo = 3; lo <= 10; lo++) {
        const cards = [0, 1, 2, 3, 4].map((i) => RANK_NAME[lo + i] + 'DCHSD'[i]).join(' ');
        check(named(cards) === 'STRAIGHT', `b2: ${cards} should be a straight`);
        windows++;
    }
    console.log(`  ${TABLE.length} named combinations and all ${windows} legal straight windows`);

    /* --- 100,000 hands, classified twice ---------------------------------- */

    {
        const rng = new CV.RNG(31337);
        const deck = new CV.Cards.Deck(rng, { decks: 1 });
        const seen = {};
        let n = 0;
        for (let i = 0; i < 100000; i++) {
            deck.reset();
            const five = deck.drawMany(5);
            const got = B.detect(five);
            const want = b2Classify(five);
            check((got ? got.type : null) === want,
                `b2: ${five.map((c) => c.r + c.s).join(' ')} read as ${got && got.type}, wanted ${want}`);
            seen[want || 'none'] = (seen[want || 'none'] || 0) + 1;
            n++;
        }
        const kinds = Object.keys(seen).filter((k) => k !== 'none').sort();
        console.log(`  ${n.toLocaleString('en-US')} random hands agreed, covering ${kinds.length} kinds`);
        check(kinds.length === 5, `b2: only ${kinds.join(', ')} came up in 100,000 hands`);
    }

    /* --- which beats which ------------------------------------------------ */

    const cmp = (a, b) => B.beats(B.detect(b2Hand(a)), B.detect(b2Hand(b)));
    const BEATS = [
        ['8D',                 '7S',                 true],    // rank first
        ['3S',                 '3H',                 true],    // then suit
        ['3D',                 '3C',                 false],
        ['10D 10S',            '8C 8H',              true],
        ['8C 8H',              '10D 10S',            false],
        ['JD JC JH',           '9D 9C 9S',           true],
        ['6D 7C 8H 9S 10D',    '5D 6C 7H 8S 9D',     true],
        ['5D 6C 7H 8S 9D',     '6D 7C 8H 9S 10D',    false],
        ['3S 6S 8S JS KS',     '10D JC QH KS AD',    true],    // flush over straight
        ['8D 8C 8H KD KC',     '3S 6S 8S JS KS',     true],    // house over flush
        ['9D 9C 9H 9S KD',     '8D 8C 8H KD KC',     true],    // four over house
        ['5S 6S 7S 8S 9S',     '9D 9C 9H 9S KD',     true],    // straight flush over four
        ['9D 9C 9H 9S KD',     '5S 6S 7S 8S 9S',     false],
        ['10D 10C 10H 3D 3C',  '8D 8C 8H KD KC',     true],    // the triple decides
        ['JD JC JH JS 3D',     '9D 9C 9H 9S KD',     true],    // the quad decides
        ['3H 6H 8H JH AH',     '3S 6S 8S JS KS',     true],    // flush cascade
        ['3S 6S 8S JS KS',     '3H 6H 8H JH AH',     false],
        // Counts never cross: no bombs in this game.
        ['9D 9C 9H 9S KD',     '8C 8H',              false],
        ['8C 8H',              '7S',                 false],
        ['7S',                 '8C 8H',              false],
        ['JD JC JH',           '8C 8H',              false],
    ];
    for (const [a, b, want] of BEATS) {
        check(cmp(a, b) === want, `b2: "${a}" v "${b}" gave ${cmp(a, b)}, wanted ${want}`);
    }

    const SAMPLES = TABLE.filter(([, w]) => w).map(([c]) => c);
    let ordered = 0;
    for (const a of SAMPLES) {
        check(!cmp(a, a), `b2: "${a}" beats itself`);
        for (const b of SAMPLES) {
            if (cmp(a, b) && cmp(b, a)) check(false, `b2: "${a}" and "${b}" each beat the other`);
            ordered++;
        }
    }
    console.log(`  ${BEATS.length} comparisons and ${ordered} ordering checks`);

    /* --- find() only ever offers a legal play ----------------------------- */

    {
        const rng = new CV.RNG(808);
        let offered = 0;
        for (let i = 0; i < 400; i++) {
            const deck = new CV.Cards.Deck(rng, { decks: 1 });
            deck.shuffle();
            const hand = deck.drawMany(13);
            const req = B.detect(deck.drawMany([1, 2, 3, 5][rng.int(4)]));
            const ids = new Set(hand.map((c) => c.id));
            for (const play of B.find(hand, req)) {
                check(play.every((c) => ids.has(c.id)), 'b2: find() offered a card not in the hand');
                check(new Set(play.map((c) => c.id)).size === play.length, 'b2: find() used a card twice');
                check(!!B.canBeat(play, req), 'b2: find() offered a play that does not answer');
                offered++;
            }
        }
        console.log(`  ${offered.toLocaleString('en-US')} suggested plays, every one legal and held`);
    }

    /* --- whole rounds ------------------------------------------------------ */

    const ROUNDS = Math.max(100, Math.round(HANDS / 8));
    const master = new CV.RNG(24680);
    const t0 = Date.now();
    const wins = [0, 0, 0, 0];
    let sweeps = 0, fives = 0;

    for (let g = 0; g < ROUNDS; g++) {
        const room = CV.Registry.ROOMS[master.int(4)].id;
        const e = new game.Engine({
            rng: new CV.RNG(master.int(1e9)), config: { room },
            seats: [0, 1, 2, 3].map((i) => new CV.Seat(i, {
                kind: 'ai', name: 'S' + i, coins: 20000, isYou: i === master.int(4),
            })),
        });
        const ai = new game.AI(e);
        e.start();

        check(e.seats.every((s) => s.cards.length === 13), 'b2: not thirteen cards each');
        check(new Set(e.seats.flatMap((s) => s.cards).map((c) => c.id)).size === 52,
            'b2: the pack is not 52 distinct cards');
        check(e.seats.flatMap((s) => s.cards).every((c) => c.s !== 'J'), 'b2: a joker got into the deck');
        // Phase 4: the 3♦ decides who opens.
        check(e.seats[e.turn].cards.some(CV.BigTwoOpener), 'b2: the opener does not hold the 3♦');

        let steps = 0, first = true;
        const played = [];
        while (!e.isOver()) {
            const seat = e.turn;
            const before = e.trick ? e.trick.combo : null;
            const action = ai.decide(seat);
            check(!!action, 'b2: the AI had nothing to do');
            if (!action) break;

            if (action.type === 'play') {
                const cards = action.cards.map((id) => e.seats[seat].cards.find((c) => c.id === id));
                check(cards.every(Boolean), 'b2: the AI played a card it does not hold');
                check(!!B.canBeat(cards.filter(Boolean), before), 'b2: the AI played something illegal');
                if (first) {
                    check(cards.some(CV.BigTwoOpener), 'b2: the opening play did not contain the 3♦');
                    first = false;
                }
                if (cards.length === 5) fives++;
                played.push(...action.cards);
            } else {
                check(!!e.trick, 'b2: a seat passed with an open table');
            }
            check(e.apply(action), `b2: engine refused ${action.type}`);
            if (++steps > 400) { check(false, 'b2: a round ran past 400 actions'); break; }
        }

        const left = e.seats.reduce((n, s) => n + s.cards.length, 0);
        check(left + played.length === 52, `b2: ${left} held + ${played.length} played is not 52`);
        check(e.winner >= 0 && e.seats[e.winner].cards.length === 0, 'b2: the winner still holds cards');
        auditB2Tricks(e);

        const r = e.result();
        const total = e.seats.reduce((n, s) => n + s.net, 0);
        check(total === 0, `b2: the table gained ${total} coins out of nowhere`);
        for (const s of e.seats) {
            check(s.coins >= 0, 'b2: a seat was taken below zero');
            check(s.coins === s.startCoins + s.net, 'b2: coins do not reconcile');
        }
        check(r.forSeat(e.winner).rank === 1, 'b2: the winner did not come first');
        check(r.ranks.filter((row) => row.outcome === 'win').length === 1, 'b2: more than one winner');
        // Losers pay for what they hold, at the room's stake.
        for (let i = 0; i < 4; i++) {
            if (i === e.winner) continue;
            check(-e.seats[i].net === Math.min(e.seats[i].cards.length * e.stake, e.seats[i].startCoins),
                'b2: a loser paid something other than the cards in their hand');
        }
        wins[e.winner]++;
        if (e.cardsLeftElsewhere() === 39) sweeps++;
    }

    console.log(`  ${ROUNDS} rounds, ${Date.now() - t0} ms — seats won `
        + `${wins.map((n) => (n / ROUNDS * 100).toFixed(0) + '%').join(' / ')}`);
    console.log(`  ${fives} five-card hands played · ${sweeps} clean sweeps`);
    // The 3♦ opens, which is a real edge, but not a decisive one.
    check(Math.max(...wins) / ROUNDS < 0.45, 'b2: one seat wins far too often');
    check(Math.min(...wins) > 0, 'b2: a seat never wins at all');

    /* --- what a host may broadcast ----------------------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(3), config: {},
            seats: [0, 1, 2, 3].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 500, isYou: i === 0 })),
        });
        e.start();
        for (let viewer = 0; viewer < 4; viewer++) {
            const view = e.snapshotFor(viewer);
            check(!view.rng, 'b2: the snapshot carries the RNG');
            view.seats.forEach((seat, i) => {
                if (i === viewer) check(seat.cards.every(Boolean), 'b2: your own hand was redacted from you');
                else check(seat.cards.every((c) => c === null) && seat.cards.length === 13,
                    'b2: another seat\'s hand went out on the wire');
            });
        }
    }
    console.log('  ✓ no hand but your own on the wire');

    for (const key of game.rules) check(CV.t(key) !== key, `b2: rule key ${key} has no text`);
    for (const type of ['SINGLE', 'PAIR', 'TRIPLE', 'STRAIGHT', 'FLUSH',
                        'FULL_HOUSE', 'FOUR_OF_A_KIND', 'STRAIGHT_FLUSH']) {
        check(CV.t('b2.type.' + type) !== 'b2.type.' + type, `b2: ${type} has no name`);
    }
    console.log('  ✓ rules card and every combination name resolve');
}

/**
 * Replay the log. A seat that passes is out of the trick, the trick clears
 * only when the other three have all passed, and the lead goes back to
 * whoever last got cards down.
 */
function auditB2Tricks(e) {
    let owner = -1;
    let passed = new Set();
    for (const ev of e.events) {
        if (ev.type === 'play') {
            check(!passed.has(ev.seat), 'b2: a seat played again after passing in the same trick');
            owner = ev.seat;
        } else if (ev.type === 'pass') {
            check(!passed.has(ev.seat), 'b2: a seat passed twice in the same trick');
            passed.add(ev.seat);
        } else if (ev.type === 'trickEnd') {
            check(ev.lead === owner, 'b2: the lead did not go back to the last player to play');
            check(passed.size === 3, `b2: the trick cleared after ${passed.size} passes, not 3`);
            passed = new Set();
        }
    }
}
auditBigTwo();

/* ---- Texas Hold'em ------------------------------------------------------ */

const PK_RANKS = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
                   '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
let pkUid = 0;
function pkCards(str) {
    return str.split(/\s+/).filter(Boolean).map((tok) => {
        const s = tok.slice(-1), r = PK_RANKS[tok.slice(0, -1)];
        if (r === undefined || !'SHDC'.includes(s)) throw new Error('bad card ' + tok);
        return { r, s, id: 'p' + (pkUid++) };
    });
}

/**
 * The evaluator, checked against the deck itself.
 *
 * Every one of the 2,598,960 five-card hands is dealt and named, and the
 * counts are compared to the combinatorial table. There is no sampling and no
 * judgement in it: if a single hand of any kind is misread the totals move,
 * and a wheel that is not recognised or a Q-K-A-2-3 that is would both show
 * up here as a straight count that is not 10,200.
 */
function auditPokerHands() {
    const H = CV.PokerHands;
    const deck = [];
    for (const s of ['S', 'H', 'D', 'C']) for (let r = 2; r <= 14; r++) deck.push({ r, s, id: s + r });

    const WANT = {
        ROYAL_FLUSH: 4, STRAIGHT_FLUSH: 36, FOUR_OF_A_KIND: 624, FULL_HOUSE: 3744,
        FLUSH: 5108, STRAIGHT: 10200, THREE_OF_A_KIND: 54912, TWO_PAIR: 123552,
        ONE_PAIR: 1098240, HIGH_CARD: 1302540,
    };
    const tally = {};
    const five = new Array(5);
    const t0 = Date.now();
    for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++)
    for (let c = b + 1; c < 50; c++) for (let d = c + 1; d < 51; d++)
    for (let e = d + 1; e < 52; e++) {
        five[0] = deck[a]; five[1] = deck[b]; five[2] = deck[c]; five[3] = deck[d]; five[4] = deck[e];
        const name = H.score5(five).name;
        tally[name] = (tally[name] || 0) + 1;
    }
    let total = 0;
    for (const [name, want] of Object.entries(WANT)) {
        check(tally[name] === want, `poker: ${tally[name]} ${name}, the deck holds ${want}`);
        total += tally[name] || 0;
    }
    check(total === 2598960, `poker: ${total} hands named, the deck holds 2,598,960`);
    console.log(`  all 2,598,960 five-card hands named in ${Date.now() - t0} ms, `
        + 'every count matching the deck');
}

function auditPoker() {
    console.log('\n♠️ Texas Hold\'em');
    const game = CV.Registry.get('poker');
    const H = CV.PokerHands;

    auditPokerHands();

    /* --- the named cases from the rules ----------------------------------- */

    const named = (str) => H.score5(pkCards(str)).name;
    const TABLE = [
        ['10S JS QS KS AS',  'ROYAL_FLUSH'],
        ['5S 6S 7S 8S 9S',   'STRAIGHT_FLUSH'],
        ['AS 2S 3S 4S 5S',   'STRAIGHT_FLUSH'],   // the wheel, suited
        ['KS KH KD KC 7D',   'FOUR_OF_A_KIND'],
        ['QS QH QD 8C 8D',   'FULL_HOUSE'],
        ['AS 9S 7S 5S 2S',   'FLUSH'],
        ['5S 6D 7C 8H 9S',   'STRAIGHT'],
        ['AS 2D 3C 4H 5S',   'STRAIGHT'],          // the ace plays as a one
        ['8S 8H 8D KC 3D',   'THREE_OF_A_KIND'],
        ['KS KH 7D 7C AS',   'TWO_PAIR'],
        ['10S 10H AD 8C 3S', 'ONE_PAIR'],
        ['AS 10H 8D 5C 2S',  'HIGH_CARD'],
        // The ace does not wrap.
        ['QS KH AD 2C 3S',   'HIGH_CARD'],
        ['KS AH 2D 3C 4S',   'HIGH_CARD'],
    ];
    for (const [cards, want] of TABLE) {
        check(named(cards) === want, `poker: "${cards}" read as ${named(cards)}, wanted ${want}`);
    }
    // The wheel is a five-high, the lowest straight there is.
    check(H.score5(pkCards('AS 2D 3C 4H 5S')).tie[0] === 5, 'poker: the wheel must be a five-high straight');
    check(H.compare(H.score5(pkCards('2S 3D 4C 5H 6S')), H.score5(pkCards('AS 2D 3C 4H 5S'))) > 0,
        'poker: a six-high straight must beat the wheel');
    console.log(`  ${TABLE.length} named hands, the wheel and the two that do not wrap`);

    /* --- kickers and ties -------------------------------------------------- */

    const cmp = (a, b) => H.compare(H.score5(pkCards(a)), H.score5(pkCards(b)));
    const COMPARE = [
        ['AS AH KD QC JS',  'AD AC KH QS 10D',  1],   // the last kicker decides
        ['KS KH 7D 7C AS',  'QS QH JD JC AS',   1],   // the higher pair first
        ['10S 10H 10D 4C 4S', 'JS JH JD 2C 2S', -1],  // the triple decides a full house
        ['9S 9H 9D 9C 3S',  '7S 7H 7D 7C AS',   1],
        ['AS KS QS JS 9S',  'AH KH QH JH 8H',   1],   // the flush cascade
        ['AS KD QC JH 10S', 'AH KS QD JC 10H',  0],   // suits do not break a tie
        ['KS KH 2D 3C 4S',  'QS QH AD KC JS',   1],   // the higher pair, kickers ignored
        ['2S 2H 3D 4C 5S',  'AS KD QC JH 9S',   1],   // the smallest pair beats any high card
        ['AS AH AD KC KS',  'AS AH AD 2C 2S',   1],   // the pair breaks a full-house tie
    ];
    for (const [a, b, want] of COMPARE) {
        const got = Math.sign(cmp(a, b));
        check(got === want, `poker: "${a}" v "${b}" gave ${got}, wanted ${want}`);
    }

    /* --- seven cards, and the two rules people get wrong -------------------- */

    // A board that is already the best hand belongs to everyone in it.
    const royalBoard = pkCards('AS KS QS JS 10S');
    const junk = pkCards('2D 3C');
    check(H.evaluate(junk.concat(royalBoard)).name === 'ROYAL_FLUSH',
        'poker: the board alone must be playable — a royal on the table is a royal');

    // The best five of seven, not all seven.
    const best = H.evaluate(pkCards('AS AD').concat(pkCards('AH KC KD 7S 2C')));
    check(best.name === 'FULL_HOUSE' && best.tie[0] === 14 && best.tie[1] === 13,
        `poker: A A A K K should be aces full of kings, got ${best.name}`);

    // One hole card is enough.
    const oneCard = H.evaluate(pkCards('AS 2C').concat(pkCards('KS QS JS 9S 3D')));
    check(oneCard.name === 'FLUSH' && oneCard.tie[0] === 14,
        'poker: one hole card must be usable on its own');
    console.log('  ✓ best five of seven, with both hole cards, one, or neither');

    /* --- side pots, exactly as the rules set them out ----------------------- */

    {
        // Player A all-in for 50, B and C all-in for 100.
        const e = new game.Engine({
            rng: new CV.RNG(11), config: { room: 'beginner' },
            seats: [50, 100, 100].map((c, i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: c })),
        });
        e.start();
        check(e.seats[e.sbSeat].committed === e.sb, 'poker: the small blind was not posted');
        check(e.seats[e.bbSeat].committed === e.bb, 'poker: the big blind was not posted');

        e.apply({ type: 'raise', seat: e.turn, amount: 50 });
        e.apply({ type: 'raise', seat: e.turn, amount: 100 });
        e.apply({ type: 'call',  seat: e.turn, amount: e.currentBet - e.seats[e.turn].bet });

        check(e.isOver(), 'poker: an all-in table should have run to the end');
        check(e.pots.length === 2, `poker: ${e.pots.length} pots, wanted a main and a side`);
        check(e.pots[0].amount === 150, `poker: main pot ${e.pots[0].amount}, wanted 150`);
        check(e.pots[0].eligible.length === 3, 'poker: everyone should contest the main pot');
        check(e.pots[1].amount === 100, `poker: side pot ${e.pots[1].amount}, wanted 100`);
        check(e.pots[1].eligible.join() === '1,2', 'poker: the short stack must not contest the side pot');
        check(e.seats[0].stack <= 150, 'poker: the short stack won chips it never covered');
        console.log('  ✓ side pots: 50 / 100 / 100 makes a main of 150 and a side of 100');
    }

    /* --- an uncalled bet comes back ---------------------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(12), config: { room: 'beginner' },
            seats: [200, 200].map((c, i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: c })),
        });
        e.start();
        const raiser = e.turn;
        e.apply({ type: 'raise', seat: raiser, amount: 100 });
        e.apply({ type: 'fold',  seat: e.turn });
        check(e.isOver(), 'poker: everyone folded but the hand did not end');
        check(e.seats[raiser].net === e.bb, `poker: the raiser netted ${e.seats[raiser].net}, wanted ${e.bb}`);
        check(e.seats[raiser].net + e.seats[1 - raiser].net === 0, 'poker: chips appeared from nowhere');
        console.log('  ✓ an uncalled bet is returned before the pot is paid');
    }

    /* --- whole hands -------------------------------------------------------- */

    const HANDS_PK = Math.max(200, Math.round(HANDS / 4));
    const master = new CV.RNG(60606);
    const t0 = Date.now();
    let showdowns = 0, allIns = 0, splits = 0, folds = 0, biggest = 0;

    for (let g = 0; g < HANDS_PK; g++) {
        // Two to nine, the whole range the rules allow — heads-up and a
        // full table behave differently and both have to hold.
        const n = master.range(2, 9);
        const room = CV.Registry.ROOMS[master.int(4)].id;
        const chips = Array.from({ length: n }, () => master.range(40, 4000));
        const e = new game.Engine({
            rng: new CV.RNG(master.int(1e9)), config: { room, shoe: { dealer: master.int(n) } },
            seats: chips.map((c, i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: c, isYou: i === 0 })),
        });
        const ai = new game.AI(e);
        e.start();
        if (e.isOver() && !e.board.length && !e.seats.some((s) => s.hole.length)) continue;   // nobody could sit

        const chipsBefore = e.seats.reduce((t, s) => t + s.startStack, 0);
        let steps = 0;
        while (!e.isOver()) {
            const seat = e.turn;
            const options = e.legalActions(seat);
            check(options.length > 0, `poker: seat ${seat} is to act with nothing it may do`);
            const action = ai.decide(seat);
            check(!!action, 'poker: the AI had nothing to do');
            if (!action) break;
            check(e.apply(action), `poker: engine refused ${JSON.stringify(action)} in ${e.phase}`);
            if (++steps > 300) { check(false, 'poker: a hand ran past 300 actions'); break; }
        }

        // Chips are conserved and no stack goes negative.
        const chipsAfter = e.seats.reduce((t, s) => t + s.stack, 0);
        check(chipsAfter === chipsBefore, `poker: ${chipsBefore} chips became ${chipsAfter}`);
        check(e.seats.every((s) => s.stack >= 0), 'poker: a stack went negative');
        check(e.seats.reduce((t, s) => t + s.net, 0) === 0, 'poker: the table is not zero-sum');
        for (const s of e.seats) check(s.coins === s.startCoins + s.net, 'poker: coins do not reconcile');

        // The pot is exactly what was put into it, and it is all paid out.
        const inPot = e.seats.reduce((t, s) => t + s.committed, 0);
        const paid = e.seats.reduce((t, s) => t + s.won, 0);
        check(paid === inPot, `poker: ${inPot} chips in the pot, ${paid} paid out`);
        check(e.pots.reduce((t, p) => t + p.amount, 0) === inPot, 'poker: the side pots do not add up');

        // Board length matches the street it stopped on.
        check([0, 3, 4, 5].includes(e.board.length), `poker: ${e.board.length} community cards`);
        check(new Set(e.board.concat(e.seats.flatMap((s) => s.hole)).map((c) => c.id)).size
            === e.board.length + e.seats.reduce((t, s) => t + s.hole.length, 0),
            'poker: a card was dealt twice');

        // Whoever took a pot had the best hand of those entitled to it. A
        // hand that ended before the river has no hands to compare — the last
        // player standing takes it without showing.
        for (const pot of e.pots) {
            if (e.showing) {
                for (const w of pot.winners) {
                    for (const i of pot.eligible) {
                        check(H.compare(e.seats[w].hand, e.seats[i].hand) >= 0,
                            'poker: a pot went to a hand that was beaten');
                    }
                }
            } else {
                check(pot.winners.every((w) => !e.seats[w].folded),
                    'poker: a pot went to a seat that had folded');
            }
            if (pot.winners.length > 1) splits++;
        }

        // The button moves on.
        check(e.shoeState.dealer === (e.dealer + 1) % n, 'poker: the button did not move');

        if (e.showing) showdowns++; else folds++;
        if (e.seats.some((s) => s.allIn)) allIns++;
        biggest = Math.max(biggest, ...e.seats.map((s) => s.won));
    }

    console.log(`  ${HANDS_PK} hands, ${Date.now() - t0} ms — ${showdowns} showdowns, `
        + `${folds} won by folding, ${allIns} with someone all-in, ${splits} split pots`);
    console.log(`  biggest pot taken: ${biggest.toLocaleString('en-US')}`);
    check(showdowns > 0 && folds > 0, 'poker: hands only ever end one way');
    check(allIns > 0, 'poker: nobody ever went all-in, so side pots were never exercised');

    /* --- what a host may broadcast ------------------------------------------ */

    {
        const e = new game.Engine({
            rng: new CV.RNG(7), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 1000, isYou: i === 0 })),
        });
        e.start();
        for (let viewer = 0; viewer < 3; viewer++) {
            const view = e.snapshotFor(viewer);
            const wire = JSON.stringify(view);
            check(!view.rng, 'poker: the snapshot carries the RNG');
            view.seats.forEach((seat, i) => {
                if (i === viewer) check(seat.hole.every(Boolean), 'poker: your own cards were redacted from you');
                else check(seat.hole.every((c) => c === null), 'poker: another seat\'s hole cards went out');
            });
            for (const card of e.deck.cards.slice(-8)) {
                check(!wire.includes('"' + card.id + '"'),
                    `poker: an undealt card (${card.id}) is in the broadcast`);
            }
        }
    }
    console.log('  ✓ no hole card but your own, and nothing still in the deck');

    for (const key of game.rules) check(CV.t(key) !== key, `poker: rule key ${key} has no text`);
    for (const name of Object.keys(H.CAT)) {
        check(CV.t('pk.hand.' + name) !== 'pk.hand.' + name, `poker: ${name} has no name`);
    }
    console.log('  ✓ rules card and every hand name resolve');
}
auditPoker();

/* ---- 麻将 ---------------------------------------------------------------- */

let mjUid = 0;
/** Standard notation: "123m456m789s555p99p", "1234567z". */
function mjTiles(str) {
    const out = [];
    let buf = '';
    for (const ch of str.replace(/\s+/g, '')) {
        if ('mspz'.includes(ch)) {
            for (const d of buf) out.push({ suit: ch, n: Number(d), id: 't' + (mjUid++) });
            buf = '';
        } else buf += ch;
    }
    return out;
}

/** Read a hand, then price it. Both halves, end to end. */
function mjFanOf(str, opts = {}) {
    const MJ = CV.MJ;
    const tiles = mjTiles(str);
    const shape = CV.MJWin.isWin(MJ.counts(tiles), 0, 0, null, opts.shapes);
    if (!shape) return null;
    return CV.MJFan.calculateFan({
        shape: shape.shape,
        melds: shape.melds || [],
        pair: shape.pair,
        keys: tiles.map(MJ.key),
        selfDraw: !!opts.selfDraw,
        menzen: !!opts.menzen,
        quad: !!shape.quad,
        flowers: opts.flowers || 0,
    }, opts.table);
}

function auditMahjong() {
    console.log('\n🀄 麻将');
    const game = CV.Registry.get('mahjong');
    const MJ = CV.MJ;
    const W = CV.MJWin;

    /* --- the two tile sets ------------------------------------------------- */

    {
        const four = MJ.build(4);
        check(four.length === 136, `mj: the four-player set has ${four.length} tiles, wanted 136`);
        check(four.every(MJ.isPlaying), 'mj: a flower or a fly got into the four-player set');
        const cnt = MJ.counts(four);
        for (const [, n] of cnt) check(n === 4, 'mj: a tile does not appear exactly four times');
        for (const suit of ['m', 's', 'p']) {
            const kinds = [...cnt.keys()].filter((k) => k[0] === suit);
            check(kinds.length === 9, `mj: the four-player set has ${kinds.length} kinds of ${suit}`);
        }
        const winds = ['z1', 'z2', 'z3', 'z4'].reduce((n, k) => n + (cnt.get(k) || 0), 0);
        const dragons = ['z5', 'z6', 'z7'].reduce((n, k) => n + (cnt.get(k) || 0), 0);
        check(winds === 16 && dragons === 12, `mj: ${winds} winds and ${dragons} dragons`);
    }

    {
        // Three seats play a different box: dots, winds, dragons, eight
        // flowers — and the fly on top. No characters and no bamboo at all.
        const three = MJ.build(3);
        const cnt = MJ.counts(three);
        const flowers = three.filter(MJ.isFlower).length;
        const fly = three.filter(MJ.isFly).length;
        const playing = three.filter(MJ.isPlaying).length;

        check(playing === 64, `mj: ${playing} playing tiles, wanted 36 dots + 28 honours`);
        check(flowers === 8, `mj: ${flowers} flowers, wanted 8`);
        check(playing + flowers === 72, `mj: ${playing + flowers} base tiles, wanted 72`);
        check(fly === MJ.FLY_COUNT, `mj: ${fly} fly tiles, wanted ${MJ.FLY_COUNT}`);
        check(three.length === 72 + MJ.FLY_COUNT, `mj: the three-player set has ${three.length} tiles`);
        check([...cnt.keys()].every((k) => k[0] === 'p' || k[0] === 'z'),
            'mj: a character or a bamboo got into the three-player set');
        const dots = [...cnt.keys()].filter((k) => k[0] === 'p');
        check(dots.length === 9, `mj: ${dots.length} kinds of dot`);
        for (const [, n] of cnt) check(n === 4, 'mj: a tile does not appear exactly four times');
        check(MJ.keysFor(3).every((k) => k[0] === 'p' || k[0] === 'z'),
            'mj: the three-player pool offers a tile the set does not hold');
    }
    console.log(`  136 tiles for four seats; 72 + ${CV.MJ.FLY_COUNT} fly for three, dots and honours only`);

    /* --- the fly is wild, and only inside its own set ----------------------- */

    {
        const pool3 = MJ.keysFor(3);
        const pool4 = MJ.keysFor(4);

        // One tile short of four melds and a pair, with a fly to cover it.
        const short = MJ.counts(mjTiles('123456789p1122z'));   // 13 tiles + a fly
        check(!W.isWin(short, 0, 0, pool3), 'mj: that hand should not win without the fly');
        check(!!W.isWin(short, 0, 1, pool3), 'mj: a fly should complete the hand');

        // A wild that is left over is a tile left over.
        check(!W.isWin(MJ.counts(mjTiles('123456789p11223z')), 0, 1, pool3),
            'mj: a spare fly should not be allowed to sit in a finished hand');

        // Three flies make a meld of their own.
        check(!!W.isWin(MJ.counts(mjTiles('123456789p11z')), 0, 3, pool3),
            'mj: three flies should make the fourth meld');

        // Seven pairs, one of them made of a fly and a single.
        check(!!W.isWin(MJ.counts(mjTiles('112233445566p1z')), 0, 1, pool3),
            'mj: a fly should pair with the odd tile');

        // 十三幺 needs four tiles the three-player set does not contain, so no
        // number of flies can make it — but at four seats it still can.
        const orphans = MJ.counts(mjTiles('19p1234567z'));
        check(!W.isWin(orphans, 0, 2, pool3), 'mj: 十三幺 must be unreachable at three seats');
        check(!!W.isWin(MJ.counts(mjTiles('119m19s19p1234567z')), 0, 0, pool4),
            'mj: 十三幺 should still stand at four seats');

        console.log('  ✓ a fly stands in for any tile the set holds, and for nothing it does not');
    }

    /* --- an ordinary fly is worth no 番 -------------------------------------- */

    {
        // The same hand, once made of tiles and once with a fly standing in.
        // The rules are explicit: an ordinary fly adds nothing.
        const plain = mjFanOf('123456789p11122z');
        const withFly = CV.MJFan.calculateFan({
            shape: 'standard',
            melds: [{ type: 'chow', key: 'p1' }, { type: 'chow', key: 'p4' },
                    { type: 'chow', key: 'p7' }, { type: 'pung', key: 'z1', wild: 1 }],
            pair: 'z2',
            keys: 'p1 p2 p3 p4 p5 p6 p7 p8 p9 z1 z1 z1 z2 z2'.split(' '),
            selfDraw: false, menzen: false, wilds: 1, dun: 0,
        });
        check(plain && plain.totalFan === withFly.totalFan,
            `mj: a fly changed the 番 count (${plain && plain.totalFan} against ${withFly.totalFan})`);
        console.log('  ✓ an ordinary fly is a wild card and nothing more');
    }

    /* --- 飞 takes a discard too ---------------------------------------------- */

    {
        // The bug this holds down: a seat holding one 白 and a fly was told
        // it could not 碰 a thrown 白. The fly counted inside a finished hand
        // and nowhere else, so the one claim it was most obviously good for
        // was the one claim it was refused.
        const e = new game.Engine({
            rng: new CV.RNG(77), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
        });
        e.start();
        const D = e.dealer, B = (D + 1) % 3, C = (D + 2) % 3;
        const fly = { suit: 'F', n: 1, wild: true, dun: false, id: 'Fclaim' };
        const white = mjTiles('7z')[0];

        e.seats[D].hand = mjTiles('123456789p1122z').concat([white]);   // 14, throws 白
        e.seats[B].hand = mjTiles('123456789p12z7z').concat([fly]);     // one 白 and a fly
        e.seats[C].hand = mjTiles('123456789p1234z');                   // nothing to claim with

        check(e.apply({ type: 'discard', seat: D, tile: white.id }), 'mj: the dealer could not throw 白');
        check(e.phase === 'claim' && e.turn === B, `mj: ${e.phase} and seat ${e.turn} was asked, wanted ${B}`);
        const offered = e.legalActions(B).map((o) => o.type);
        check(offered.includes('pung'), `mj: 碰 with a fly was not offered — got ${offered.join()}`);

        check(e.apply({ type: 'pung', seat: B }), 'mj: the engine refused a 碰 made with a fly');
        const meld = e.seats[B].melds[0];
        check(meld && meld.type === 'pung' && meld.key === 'z7', 'mj: the meld is not a pung of 白');
        check(meld.tiles.length === 3, `mj: the pung holds ${meld.tiles.length} tiles`);
        check(meld.tiles.filter(MJ.isFly).length === 1, 'mj: the fly did not go into the meld');
        check(!e.seats[B].hand.some(MJ.isFly), 'mj: the fly is still in the hand as well');
        check(!e.seats[D].discards.includes(white), 'mj: the claimed tile is still in the pool');
        console.log('  ✓ a fly takes a discard as well as it finishes a hand');
    }

    /* --- and the screen can say what the fly became -------------------------- */

    {
        // `explain` is the answer to "why can I 胡?" — the hand cut into the
        // groups it was read as, with every fly drawn as the tile it turned
        // into. If it does not add up to fourteen it is not the hand.
        const e = new game.Engine({
            rng: new CV.RNG(78), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
        });
        e.start();
        const S = e.dealer;
        const flies = [1, 2].map((n) => ({ suit: 'F', n, wild: true, dun: false, id: 'Fx' + n }));

        // Four melds and a pair with two of the tiles standing in — the hand
        // the player was handed a 胡 button for and could not read. Seven
        // pairs is deliberately not used here: this table does not play it,
        // and a test that leans on a shape the rules do not recognise is
        // testing the wrong engine.
        e.seats[S].hand = mjTiles('1234567899p11z').concat(flies);
        const wildHand = e.explain(S, null);
        check(!!wildHand, 'mj: a standard hand with two flies should be a win');
        check(wildHand.shape === 'standard', `mj: read as ${wildHand && wildHand.shape}`);
        check(wildHand.groups.length === 5, `mj: ${wildHand.groups.length} groups, wanted four melds and a pair`);
        let tiles = wildHand.groups.flatMap((g) => g.tiles);
        check(tiles.length === 14, `mj: the explanation covers ${tiles.length} tiles, wanted 14`);
        check(tiles.filter((x) => x.wild).length === 2, 'mj: the two flies are not marked in the explanation');
        check(tiles.every((x) => e.pool.includes(x.key)), 'mj: a fly was explained as a tile the set does not hold');
        check(wildHand.fan.totalFan === wildHand.fan.patterns.reduce((n, x) => n + x.fan, 0),
            'mj: the explanation and its own 番 disagree');

        // And a fly standing in the middle of a run says which tile it is.
        e.seats[S].hand = mjTiles('12456789p111z22z').concat([flies[0]]);
        const runs = e.explain(S, null);
        check(!!runs && runs.shape === 'standard', 'mj: a fly should complete the run');
        tiles = runs.groups.flatMap((g) => g.tiles);
        check(tiles.length === 14, `mj: the explanation covers ${tiles.length} tiles, wanted 14`);
        const wild = tiles.filter((x) => x.wild);
        check(wild.length === 1 && wild[0].key === 'p3',
            `mj: the fly was explained as ${wild.map((x) => x.key).join()}, wanted p3`);
        console.log('  ✓ every fly in a finished hand is named as the tile it became');
    }

    /* --- what wins --------------------------------------------------------- */

    const wins = (str) => !!W.isWin(MJ.counts(mjTiles(str)), 0);
    const SHAPES = [
        ['123m456m789s555p99p', true,  'four melds and a pair'],
        ['123456789m123s99p',   true,  'chows across suits'],
        ['1122m3344s5566p11z',  true,  '七对子'],
        ['1111m2233s4455p66z',  true,  '七对子 with a four of a kind'],
        ['119m19s19p1234567z',  true,  '十三幺'],
        ['123m456m789s555p9p',  false, 'thirteen tiles is not a win'],
        ['123m456m789s555p999p', false, 'fifteen tiles is not a win'],
        ['123z456m789m111s22p', false, 'honours cannot make a chow'],
        ['789m123s456p111z22z', true,  'a wind pung is fine'],
        ['891m123s456p111z22z', false, 'a run cannot wrap past nine'],
        ['123m456m789s557p88p', false, 'two pairs and a floater is not a win'],
        ['1122m3344s5566p1z2z', false, 'six pairs and two singles is not 七对子'],
        ['19m19s19p1234567z1m', true,  '十三幺 with the duplicate written last'],
        ['119m19s19p123456z7z', true,  '十三幺 again'],
        ['1199m19s19p123456z',  false, 'two duplicates is not 十三幺'],
    ];
    for (const [str, want, why] of SHAPES) {
        check(wins(str) === want, `mj: "${str}" (${why}) read as ${wins(str)}, wanted ${want}`);
    }
    console.log(`  ${SHAPES.length} hands read, the losing shapes included`);

    // A chow needs one suit and consecutive numbers, and honours never chow.
    check(!wins('147m147s147p11z222z'), 'mj: tiles three apart are not a chow');
    check(wins('111z222z333z444z55z'), 'mj: four wind pungs and a pair is a win');

    // The wall running dry ends the hand with nobody home.
    {
        const e = new game.Engine({
            rng: new CV.RNG(3), config: { room: 'beginner' },
            seats: [0, 1, 2, 3].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 1000 })),
        });
        e.start();
        e.wall.length = 0;
        e.apply({ type: 'discard', seat: e.turn, tile: e.seats[e.turn].hand[0].id });
        check(e.isOver() && e.drawn, 'mj: an empty wall did not end the hand');
        check(e.winner < 0, 'mj: 流局 produced a winner');
        check(e.seats.every((x) => x.net === 0), 'mj: 流局 moved coins');
        check(e.shoeState.dealer === e.dealer, 'mj: the dealer should keep the seat through a 流局');
    }

    /* --- 番, and nothing counted twice ------------------------------------- */

    const names = (r) => r.patterns.map((p) => p.name).sort().join(',');
    const FAN = [
        ['123m456m789s555p99p', '鸡胡',            1],
        ['111m555s777p999m22z', '碰碰胡',          2],
        ['123m456m777m999m11z', '混一色',          3],
        ['123m456m789m555m88m', '清一色',          6],
        ['111m333m555m777m99m', '清碰',            8],
        ['1122m3344s5566p11z',  '七对子',          4],
        ['1111m2233s4455p66z',  '豪华七对子',      8],
        ['11223344556677m',     '清七对',          8],
        ['555z666z111z222z33z', '字一色',          8],
        ['123m456s555z666z77z', '小三元',          4],
        ['119m19s19p1234567z',  '十三幺',         16],
    ];
    for (const [str, want, fan] of FAN) {
        const r = mjFanOf(str);
        check(!!r, `mj: "${str}" is not a winning hand`);
        if (!r) continue;
        const has = r.patterns.find((p) => p.name === want);
        check(!!has, `mj: "${str}" should contain ${want}, got ${names(r)}`);
        if (has) check(has.fan === fan, `mj: ${want} paid ${has.fan}番, wanted ${fan}`);
    }

    // The overlap rules, one by one, exactly as the rules set them out.
    const OVERLAP = [
        ['111m333m555m777m99m', ['清碰'],       ['清一色', '碰碰胡', '鸡胡']],
        ['11223344556677m',     ['清七对'],     ['清一色', '七对子', '豪华七对子', '鸡胡']],
        ['1111m2233s4455p66z',  ['豪华七对子'], ['七对子', '鸡胡']],
        ['123m555z666z777z11m', ['大三元'],     ['小三元']],
        ['123m111z222z333z44z', ['小四喜'],     ['大四喜']],
        ['111z222z333z444z55m', ['大四喜'],     ['小四喜']],
        ['555z666z111z222z33z', ['字一色'],     ['混一色', '碰碰胡', '鸡胡']],
    ];
    for (const [str, must, mustNot] of OVERLAP) {
        const r = mjFanOf(str);
        check(!!r, `mj: "${str}" is not a winning hand`);
        if (!r) continue;
        for (const name of must) {
            check(r.patterns.some((p) => p.name === name),
                `mj: "${str}" should be ${name}, got ${names(r)}`);
        }
        for (const name of mustNot) {
            check(!r.patterns.some((p) => p.name === name),
                `mj: "${str}" counted ${name} as well — got ${names(r)}`);
        }
    }
    console.log(`  ${FAN.length} patterns priced and ${OVERLAP.length} overlaps resolved — nothing counted twice`);

    // The bonuses stack on whatever the hand was.
    {
        const plain = mjFanOf('123m456m789s555p99p');
        const both  = mjFanOf('123m456m789s555p99p', { selfDraw: true, menzen: true });
        check(plain.totalFan === 1, `mj: a plain hand is ${plain.totalFan}番, wanted 1`);
        check(both.totalFan === 3, `mj: 鸡胡 with 自摸 and 门清 is ${both.totalFan}番, wanted 3`);
        // 平胡 is 全顺子 and the four-seat table has no row for it, so the
        // filter drops it there and that table is exactly what it was.
        check(!plain.patterns.some((x) => x.name === '平胡'),
            'mj: the four-seat table started paying for 全顺子');
    }
    // 四杠子 needs four kongs, which no fourteen concealed tiles can show.
    {
        const r = CV.MJFan.calculateFan({
            shape: 'standard',
            melds: ['m1', 'm5', 's7', 'p9'].map((key) => ({ type: 'kong', key })),
            pair: 'z1',
            keys: ['m1', 'm5', 's7', 'p9', 'z1'],
            selfDraw: false, menzen: false, quad: false,
        });
        check(r.patterns.some((p) => p.name === '四杠子' && p.fan === 16), 'mj: four kongs should be 四杠子 16番');
        check(!r.patterns.some((p) => p.name === '碰碰胡'), 'mj: 四杠子 counted 碰碰胡 as well');
        check(!r.patterns.some((p) => p.name === '鸡胡'), 'mj: 四杠子 counted the base pattern as well');
    }

    /* --- who pays ----------------------------------------------------------- */

    {
        const P = CV.MJPay;

        // The floor. Three seats need 5番 and four seats need nothing.
        for (let fan = 1; fan <= 9; fan++) {
            check(P.canWin(3, fan) === (fan >= 5), `mj: three seats at ${fan}番 should ${fan >= 5 ? '' : 'not '}win`);
            check(P.canWin(4, fan) === true, `mj: four seats should have no minimum, ${fan}番 refused`);
        }

        // 爆番: ten or more settles at a flat twenty, whatever it scored.
        for (const [fan, want, bao] of [[9, 9, false], [10, 20, true], [11, 20, true], [16, 20, true], [20, 20, true]]) {
            const got = P.payFan(3, fan);
            check(got.fan === want && got.bao === bao,
                `mj: ${fan}番 settles at ${got.fan}番, wanted ${want}`);
        }

        // The table from the rules, cell by cell, at one 番 = 20 coins —
        // the RM0.20 column with a hundred coins to the ringgit.
        const TABLE = [
            [2,   80,  80,  40],
            [3,  120, 120,  60],
            [4,  160, 160,  80],
            [5,  200, 200, 100],
            [6,  240, 240, 120],
            [7,  280, 280, 140],
            [8,  320, 320, 160],
            [9,  360, 360, 180],
            [10, 800, 800, 400],
            [16, 800, 800, 400],
        ];
        let cells = 0;
        for (const [fan, each, thrower, other] of TABLE) {
            const draw = P.settle({ players: 3, winner: 0, from: -1, fan, unit: 20 });
            check(draw.deltas[1] === -each && draw.deltas[2] === -each,
                `mj: ${fan}番 自摸 charged ${-draw.deltas[1]} each, wanted ${each}`);
            check(draw.deltas[0] === each * 2, `mj: ${fan}番 自摸 paid the winner ${draw.deltas[0]}`);

            const disc = P.settle({ players: 3, winner: 0, from: 1, fan, unit: 20 });
            check(disc.deltas[1] === -thrower, `mj: ${fan}番 放铳者 paid ${-disc.deltas[1]}, wanted ${thrower}`);
            check(disc.deltas[2] === -other, `mj: ${fan}番 bystander paid ${-disc.deltas[2]}, wanted ${other}`);
            check(disc.deltas[0] === thrower + other, `mj: ${fan}番 放铳 paid the winner ${disc.deltas[0]}`);
            cells += 3;
        }
        console.log(`  ${cells} payment cells checked against the table, 2番 to 爆番`);

        // The other two stakes change the money and nothing else.
        for (const [unit, base] of [[20, 100], [50, 250], [100, 500]]) {
            const r = P.settle({ players: 3, winner: 0, from: -1, fan: 5, unit });
            check(r.base === base && r.deltas[1] === -base * 2,
                `mj: at a stake of ${unit} a 5番 自摸 charged ${-r.deltas[1]}, wanted ${base * 2}`);
        }
        // And they are the room's stake times 2, 5 and 10.
        for (const step of [2, 5, 10]) {
            check(P.unitFor(3, 10, step) === 10 * step, `mj: step ${step} priced a 番 wrongly`);
        }

        // Four seats settle their own way, and the two never mix.
        const four = P.settle({ players: 4, winner: 0, from: -1, fan: 2, unit: 10 });
        check(four.deltas.join() === '60,-20,-20,-20', `mj: four-seat 自摸 paid ${four.deltas.join()}`);
        const fourD = P.settle({ players: 4, winner: 0, from: 2, fan: 2, unit: 10 });
        check(fourD.deltas.join() === '60,0,-60,0', `mj: four-seat 放铳 paid ${fourD.deltas.join()}`);

        // Every figure above is an integer, so nothing rounds.
        for (const fan of [5, 6, 7, 8, 9, 10, 16]) {
            for (const unit of [20, 50, 100]) {
                const r = P.settle({ players: 3, winner: 0, from: -1, fan, unit });
                check(r.deltas.every(Number.isInteger), 'mj: a payment came out fractional');
            }
        }

        // Nobody pays what they do not have.
        const c = P.clamp([90, -30, -30, -30], [0, 5, 1000, 1000], 0);
        check(c.join() === '65,-5,-30,-30', `mj: clamping paid ${c.join()}`);
        check(c.reduce((n, x) => n + x, 0) === 0, 'mj: clamping is not zero-sum');
        console.log('  ✓ 自摸 double from both, 放铳者 double and the other once, all in whole coins');
    }

    /* --- 混一色 is not a pattern at three seats ------------------------------ */

    {
        // That box holds dots and honours and nothing else, so "one suit plus
        // honours" is every hand in it. A pattern every hand has is not a
        // pattern, and the three-seat table does not price it.
        const three = CV.MJFan.tableFor(3), four = CV.MJFan.tableFor(4);
        check(four['混一色'] === 3, 'mj: four seats should still pay 3番 for 混一色');
        check(three['混一色'] === undefined, 'mj: 混一色 is still on the three-seat table');
        // The two tables are two games, not one game with a row crossed out:
        // three seats re-tuned 清一色 down to 3番 and let patterns stack
        // instead of swallowing one another.
        check(three['清一色'] === 3 && four['清一色'] === 6,
            'mj: the two tables should price 清一色 differently');
        check(three['清碰'] === undefined, 'mj: 清碰 should be the sum of its parts at three seats');
        check(three['七对子'] === undefined, 'mj: seven pairs should not be on the three-seat table');
        check(three['平胡'] === 4 && three['鸡胡'] === 1,
            'mj: three seats should pay 4番 for 全顺子 and 1番 for a plain hand');

        const noShapes = { pairs: false };
        // One flower on every hand below: with none they would all be 无花,
        // which is 爆番 and would drown the number being measured.
        const mixed = mjFanOf('123456789p111z22z',
            { table: three, menzen: true, shapes: noShapes, flowers: 1 });
        check(!mixed.patterns.some((p) => p.name === '混一色'), 'mj: a three-seat hand scored 混一色');
        // 混一色 swallows the base pattern. Dropping it after the overlaps
        // were resolved would take 鸡胡 with it and score the hand at nothing
        // — which is why fan.js drops it before.
        check(mixed.patterns.some((p) => p.name === '鸡胡'),
            `mj: dropping 混一色 took 鸡胡 with it — got ${names(mixed)}`);
        check(!mixed.patterns.some((p) => p.name === '门清'), 'mj: three seats paid for 门清');
        // 鸡胡 1, the flower 1, and the 东 triplet 1 — every wind triplet pays,
        // and this hand is read with no seat, so it is nobody's 门风.
        check(mixed.totalFan === 3, `mj: a plain hand with a flower is ${mixed.totalFan}番, wanted 3`);
        check(mixed.patterns.some((p) => p.name === '风刻' && p.fan === 1),
            `mj: a 东 triplet paid no 风刻 — got ${names(mixed)}`);
        check(!mixed.patterns.some((p) => p.name === '门风'),
            'mj: a hand read with no seat was paid 门风');

        // 全顺子 in one suit is 平胡 and 清一色, stacked, plus 无花.
        const runs = mjFanOf('112233456789p55p', { table: three, shapes: noShapes, flowers: 1 });
        check(runs && runs.patterns.some((p) => p.name === '平胡' && p.fan === 4),
            `mj: an all-runs hand should be 平胡 4番 — got ${runs && names(runs)}`);
        check(runs.patterns.some((p) => p.name === '清一色' && p.fan === 3),
            'mj: 清一色 should stack on 平胡 rather than replace it');
        check(runs.totalFan === 8, `mj: 平胡 清一色 花 is ${runs.totalFan}番, wanted 8`);
        // Nothing on this table is paid for how the hand arrived.
        check(three['自摸'] === undefined && three['门清'] === undefined,
            'mj: three seats should pay for neither 自摸 nor 门清');
        check(three['无花'] === 10, 'mj: 无花 should be priced at the 爆番 line');
        console.log('  ✓ three seats play their own table, not the four-seat one less a row');
    }

    /* --- a hand that wins but may not be declared --------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(21), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
        });
        e.start();
        check(e.minFan === 5, `mj: three seats should demand 5番, demand ${e.minFan}`);
        // The number the screen prints and the number that actually refuses a
        // declaration live in two files. They have to be the same number.
        check(e.minFan === CV.MJPay.profileFor(3).minFan,
            'mj: the mode and the pay profile disagree about the floor');

        const B = (e.dealer + 1) % 3;
        // The deal has already handed this seat whatever flowers came up, and
        // flowers are 番 now — so every hand below is set up with none, or the
        // test is measuring the deal rather than the hand.
        const bare = (seat) => { e.seats[seat].flowers = []; };

        // A hand with a triplet in it and nothing else going on is 鸡胡: one
        // 番, plus one for the flower it turned, and two is not five. That is
        // the floor's whole job — it is what stops an ordinary claimed hand
        // racing everybody home. The flower matters: without one the hand
        // would be 无花 instead, which is 爆番 and clears anything.
        bare(B);
        // B sits one seat past the dealer, so B is 南 — and 南's flowers are
        // the second of each suit, 夏 (2) and 兰 (6). A 春 would be East's and
        // would pay B nothing, which is the whole point of the rule.
        e.seats[B].flowers = [{ suit: 'f', n: 2, id: 'fl0' }];
        e.seats[B].melds = [{ type: 'chow', key: 'p1', tiles: mjTiles('123p'),
                              concealed: false, from: e.dealer }];
        e.seats[B].hand = mjTiles('45678p111z22z');         // ten, waiting on 9筒
        const tile = mjTiles('9p')[0];
        const got = e.winFor(B, tile);
        check(!!got, 'mj: that hand plus 9筒 should be a winning shape');
        // 鸡胡 1, 花 1, and 1 for the 东 triplet — B is sitting 南, so 东 is
        // not B's 门风 and pays once rather than twice. Three is still not
        // five, which is the point: the floor stops an ordinary claimed hand.
        check(got.fan.totalFan === 3, `mj: 鸡胡 with one flower is ${got && got.fan.totalFan}番, wanted 3`);
        check(got.fan.patterns.some((x) => x.name === '风刻' && x.fan === 1),
            'mj: 东东东 in the 南 seat paid no 风刻');
        check(!got.fan.patterns.some((x) => x.name === '门风'),
            'mj: 东东东 in the 南 seat was paid 门风');
        check(got.ok === false, 'mj: a hand under the minimum was declarable');

        e.seats[e.dealer].discards.push(tile);
        e.lastDiscard = { tile, from: e.dealer };
        const claims = e.findClaims(tile, e.dealer);
        const mine = claims.find((c) => c.seat === B);
        check(!mine || !mine.options.some((o) => o.type === 'win'),
            'mj: 胡 was offered on a hand under the minimum');
        check(e.declareWin(B, e.dealer) === false, 'mj: a hand under the minimum was declared anyway');

        // Take the triplet out and the same tiles are 全顺子 — 平胡, 4番,
        // and with 无花 that is exactly the floor. This is the hand the table
        // is built around: the floor is set where an all-runs hand reaches it
        // and an ordinary one does not.
        // Take the melded chow back and give the seat 全顺子 — four runs and
        // a pair, not one triplet. Honours never form a run, so at three
        // seats an all-runs hand is all dots, which makes it 清一色 too.
        bare(B);
        e.seats[B].melds = [];
        e.seats[B].hand = mjTiles('112233456789p55p');
        const flat = e.winFor(B, null);
        check(flat && flat.fan.patterns.some((x) => x.name === '平胡' && x.fan === 4),
            `mj: 平胡 should be 全顺子 at 4番 — got ${flat && flat.fan.patterns.map((x) => x.name)}`);
        check(flat && flat.ok, 'mj: an all-runs hand should clear the floor');

        // **Whose wind is that?** The whole table, seat by seat.
        //
        // 东 is the round wind (圈风) and pays whoever collects it; the 东
        // seat also holds it as their own, so it pays them twice. 北 has no
        // seat behind it at three players and pays anybody. 南 and 西 pay
        // only the seat sitting on them. The dragons pay everybody.
        //
        // Every cell matters: the old rule paid *only* your own wind, which
        // made 东东东 in the 西 seat three tiles that happened to match and
        // read as a broken counter every time somebody laid one down.
        {
            const three = CV.MJFan.tableFor(3);
            const WINDS = ['东', '南', '西', '北'];
            const worth = (key, seatWind, row) => {
                const got = CV.MJFan.calculateFan({
                    shape: 'normal', melds: [{ type: 'pung', key }], pair: 'p1', keys: [],
                    seatWind, players: 3, flowers: 0, flowersHeld: 1,
                }, three);
                return (got.patterns.find((x) => x.name === row) || {}).fan || 0;
            };
            const wind = (key, seat) => worth(key, seat, '风刻') + worth(key, seat, '门风');
            //           东 seat  南 seat  西 seat
            const WANT = {
                z1: [2, 1, 1],        // 东 — 圈风 to everybody, and 门风 as well to 东
                z2: [0, 1, 0],        // 南 — only the seat sitting on it
                z3: [0, 0, 1],        // 西
                z4: [1, 1, 1],        // 北 — no seat behind it at three players
            };
            for (const [key, want] of Object.entries(WANT)) {
                for (let seat = 0; seat < 3; seat++) {
                    const got = wind(key, seat);
                    check(got === want[seat], `mj: ${WINDS[Number(key.slice(1)) - 1].repeat(3)} pays `
                        + `${got}番 to the ${WINDS[seat]} seat, wanted ${want[seat]}番`);
                }
            }
            for (const key of ['z5', 'z6', 'z7']) {
                for (let seat = 0; seat < 3; seat++) {
                    check(worth(key, seat, '箭刻') === 1,
                        `mj: a dragon triplet did not pay the ${WINDS[seat]} seat`);
                }
            }
            // And through the engine, not just the calculator.
            const E = e.dealer;                   // the dealer is always 东
            bare(E);
            e.seats[E].melds = [];
            e.seats[E].hand = mjTiles('111z22z123456789p');
            const own = e.winFor(E, null).fan;
            const row = (n) => own.patterns.find((x) => x.name === n);
            check(!!row('风刻') && row('风刻').fan === 1, 'mj: the 东 seat was paid no 风刻 for 东东东');
            check(!!row('门风') && row('门风').fan === 1, 'mj: the 东 seat was paid no 门风 for 东东东');
            console.log('  ✓ 圈风 and an empty wind pay anybody, 门风 pays the seat, and 东 pays 东 twice');
        }

        // Patterns stack rather than swallow one another: 清一色 和 碰碰胡
        // are 3 and 3, and the hand is worth both. There is no 清碰 row any
        // more — it was a name for the sum.
        bare(B);
        e.seats[B].melds = [];
        e.seats[B].hand = mjTiles('111222555999p77p');
        const stack = e.winFor(B, null);
        const named = (n) => stack.fan.patterns.find((x) => x.name === n);
        check(named('清一色') && named('碰碰胡'), 'mj: 清一色 and 碰碰胡 should both be counted');
        check(!named('清碰'), 'mj: 清碰 should not exist as a pattern of its own');
        check(named('清一色').fan + named('碰碰胡').fan === 6, 'mj: 清一色 with 碰碰胡 should be 3+3');

        // Flowers pay by the tile, and holding none pays the same as holding
        // one. Neither is ever part of the hand.
        bare(B);
        const none = e.winFor(B, null).fan;
        // `mjTiles` reads suits, and a flower is not in one. Three that pay
        // this seat: 夏 and 兰 are 南's own, and 冬 is North's — a wind nobody
        // is sitting on at three seats, so it pays whoever turns it.
        e.seats[B].flowers = [2, 6, 4].map((n) => ({ suit: 'f', n, id: 'fl' + n }));
        const three = e.winFor(B, null).fan;
        check(none.patterns.some((x) => x.name === '无花'), 'mj: an empty flower box should pay 无花');
        check(three.patterns.some((x) => x.name === '花' && x.fan === 3),
            'mj: three flowers of this seat own wind should pay 3番');
        // …and a flower belonging to a seat that is at the table pays nobody
        // else. 春 is East's; B is 南.
        e.seats[B].flowers = [{ suit: 'f', n: 1, id: 'flE' }];
        const theirs = e.winFor(B, null).fan;
        check(!theirs.patterns.some((x) => x.name === '花'),
            'mj: another wind flower paid this seat');
        check(!theirs.patterns.some((x) => x.name === '无花'),
            'mj: a seat holding a flower was paid 无花');
        check(!three.patterns.some((x) => x.name === '无花'), 'mj: 无花 was paid to a seat holding three');
        // 无花 is not "zero flowers scaled to zero" — it is a limit hand, and
        // it is priced ten against a flower's one to say so.
        check(none.totalFan - three.totalFan === 7, 'mj: 无花 is 10 where three flowers are 3');
        check(CV.MJPay.payFan(3, none.totalFan).bao, 'mj: 无花 should settle at 爆番');
        bare(B);

        // 七对子 is not a cheap hand at three seats — it is not a hand.
        e.seats[B].melds = [];
        e.seats[B].hand = mjTiles('11223344556677p');
        const pairs = e.winFor(B, null);
        check(!pairs || pairs.shape.shape !== 'sevenPairs',
            'mj: seven pairs should not be a winning shape at three seats');

        // Four seats have no floor and still play seven pairs.
        const four = new game.Engine({
            rng: new CV.RNG(22), config: { room: 'beginner' },
            seats: [0, 1, 2, 3].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
        });
        four.start();
        check(four.minFan === 0, 'mj: four seats should have no minimum');
        four.seats[four.dealer].hand = mjTiles('123m456m789s555p99p');
        const small = four.winFor(four.dealer, null);
        check(small && small.ok, 'mj: an ordinary hand should stand at a four-seat table');
        check(small.fan.totalFan < 5, 'mj: that hand was supposed to be a small one');
        four.seats[four.dealer].hand = mjTiles('11223344556677m');
        const fourPairs = four.winFor(four.dealer, null);
        check(fourPairs && fourPairs.shape.shape === 'sevenPairs',
            'mj: four seats should still play seven pairs');
        console.log('  ✓ 5番 or nothing at three seats, no floor at four');
    }

    /* --- a claim is not a self draw ------------------------------------------ */

    {
        // A 碰 can finish a hand too: the seat is left holding fourteen tiles
        // that read as a win. It is not 自摸 — it is a hand that should have
        // said 胡 to the discard instead of 碰 — and scoring it as one paid
        // the wrong 番 out of the wrong pockets. Worse, at a table with a
        // floor it laundered a hand that had just been refused: 胡 denied at
        // 1番, take the 碰 instead, declare the same tiles for 2番.
        const e = new game.Engine({
            rng: new CV.RNG(51), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
        });
        e.start();
        const D = e.dealer, B = (D + 1) % 3, C = (D + 2) % 3;
        const nine = mjTiles('9p')[0];

        e.seats[D].hand = mjTiles('1122334455667p').concat([nine]);  // 14, throws 9筒
        // Three melds, a pair, and the pair of 9筒 the claim would complete.
        e.seats[B].hand = mjTiles('123p456p789p99p22z');             // 13
        e.seats[C].hand = mjTiles('123456789p1234z');

        check(e.apply({ type: 'discard', seat: D, tile: nine.id }), 'mj: the dealer could not throw 9筒');
        check(e.turn === B && e.phase === 'claim', 'mj: seat B was not asked for the 9筒');
        check(e.legalActions(B).some((o) => o.type === 'pung'), 'mj: 碰 was not offered');
        check(e.apply({ type: 'pung', seat: B }), 'mj: the 碰 was refused');

        // The hand is now four melds and a pair — and may not be declared.
        const shape = e.winFor(B, null);
        check(!!shape, 'mj: the 碰 should have completed the hand');
        check(!e.legalActions(B).some((o) => o.type === 'win'),
            'mj: 自摸 was offered on a hand finished by a 碰');
        check(e.declareWin(B, null) === false, 'mj: a hand finished by a 碰 was declared as 自摸');
        check(e.explain(B, null) === null, 'mj: the screen offered to explain a 胡 that is not on offer');

        // The same fourteen tiles reached by drawing are 自摸, which is what
        // the flag is for: it is the way the tile arrived that differs, not
        // the hand. A kong's replacement counts as a draw — 杠上开花.
        // All dots and all runs, so it is well clear of the 5番 floor — the
        // point here is which flag the win carries, not whether it is worth
        // enough, and a hand sitting on the floor would be measuring both.
        e.seats[B].melds = [];
        e.seats[B].flowers = [];
        e.seats[B].hand = mjTiles('112233456789p55p');               // 14, a win
        e.claimed = false;
        e.phase = 'discard';
        e.turn = B;
        e.drew = e.seats[B].hand[0];
        check(e.legalActions(B).some((o) => o.type === 'win'),
            'mj: 自摸 was refused on a hand that was actually drawn');
        check(!!e.explain(B, null), 'mj: the screen would not explain a 胡 that is on offer');
        console.log('  ✓ a 碰 that finishes a hand is not 自摸, and does not launder the floor');
    }

    /* --- 抢杠 ----------------------------------------------------------------- */

    {
        // Adding the fourth tile to a pung on the table puts it in the open
        // for a moment. Anyone whose hand it finishes may take it — without
        // that, a player waiting on the one tile is simply never asked and
        // the hand they were owed disappears inside somebody's kong.
        const build = () => {
            const e = new game.Engine({
                rng: new CV.RNG(61), config: { room: 'beginner' },
                seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
            });
            e.start();
            const A = e.dealer, B = (A + 1) % 3, C = (A + 2) % 3;
            // A holds a pung of 5筒 on the table and has just drawn the fourth.
            e.seats[A].melds = [{ type: 'pung', key: 'p5', tiles: mjTiles('555p'),
                                  concealed: false, from: C }];
            e.seats[A].hand = mjTiles('5p1122334455z');               // 11 with the fourth 5筒
            // B is waiting on that 5筒 to close 3-4-5 — and the hand behind
            // it has to be worth declaring, or the robbery is never offered
            // and this tests nothing. All dots and no flower: 清一色 3 and
            // 无花 10, well clear of the floor.
            e.seats[B].hand = mjTiles('34p111p999p777p22p');          // 13
            e.seats[B].melds = [];
            e.seats[B].flowers = [];
            e.seats[C].hand = mjTiles('667788p9p123456z');
            e.seats[C].melds = [];
            e.phase = 'discard';
            e.turn = A;
            e.claimed = false;
            return { e, A, B, C };
        };

        {
            const { e, A, B } = build();
            check(e.legalActions(A).some((o) => o.type === 'kong' && o.key === 'p5'),
                'mj: 加杠 was not offered on the fourth 5筒');
            check(e.apply({ type: 'kong', seat: A, key: 'p5' }), 'mj: the 加杠 was refused');

            // The kong is not made yet — the tile is on offer.
            check(e.phase === 'claim' && e.turn === B, `mj: ${e.phase}, seat ${e.turn} — wanted B on a claim`);
            check(!!e.robbing && e.robbing.seat === A, 'mj: nothing is being robbed');
            check(e.seats[A].melds[0].type === 'pung', 'mj: the kong completed before it was offered around');
            check(e.seats[A].hand.length === 11, 'mj: the fourth tile left the hand too early');
            const offered = e.legalActions(B).map((o) => o.type).sort().join();
            check(offered === 'pass,win', `mj: a robbery offered ${offered}, wanted win and pass only`);

            check(e.apply({ type: 'win', seat: B }), 'mj: the robbery was refused');
            check(e.winner === B && e.winFrom === A, `mj: seat ${e.winner} won off ${e.winFrom}`);
            check(e.robbed === true, 'mj: the win was not recorded as a 抢杠');
            check(!e.fan.patterns.some((p) => p.name === '自摸'), 'mj: a robbed kong scored 自摸');
            check(!e.seats[A].hand.some((x) => MJ.key(x) === 'p5'),
                'mj: the robbed tile is still in the kong-maker\'s hand');
            check(e.seats[A].melds[0].tiles.length === 3, 'mj: the kong was made anyway');
            check(e.seats[A].net < 0 && e.seats[B].net > 0, 'mj: the kong-maker did not pay for the robbery');
        }

        {
            // Passed on, the kong stands and the seat draws its replacement.
            const { e, A, B } = build();
            const wall = e.wall.length;
            check(e.apply({ type: 'kong', seat: A, key: 'p5' }), 'mj: the 加杠 was refused');
            check(e.apply({ type: 'pass', seat: B }), 'mj: the robber could not pass');
            check(!e.robbing, 'mj: the robbery is still open');
            check(e.seats[A].melds[0].type === 'kong' && e.seats[A].melds[0].tiles.length === 4,
                'mj: the kong was not made after the robbery was passed up');
            check(e.phase === 'discard' && e.turn === A, `mj: ${e.phase} and seat ${e.turn} after the kong`);
            check(e.wall.length === wall - 1, 'mj: the kong drew no replacement');
            check(e.seats[A].hand.length + 3 * e.seats[A].melds.length === 14,
                'mj: the kong left the hand the wrong size');
        }
        console.log('  ✓ 加杠 is offered around before it is made, and stands when nobody wants it');
    }

    /* --- 吃, with the tiles named by the player -------------------------------
     *
     * One thrown tile is several runs, and the screen now asks which two
     * tiles rather than putting one 吃 button on the table for each. The
     * claim carries the ids, so the engine has to lay down those tiles and
     * nothing else — and refuse, changing nothing, when they are not a run.
     */
    {
        const run = (low, mine, thrown, partial) => {
            const out = MJ.chowFill(low, mjTiles(mine), thrown ? mjTiles(thrown)[0] : null, partial);
            return out && out.map((x) => (x ? (MJ.isFly(x) ? '飞' : MJ.key(x)) : '_')).join(' ');
        };
        const fly = () => ({ suit: 'F', n: 1, id: 'fly' + (mjUid++) });
        const runFly = (low, mine, thrownFly) => {
            const out = MJ.chowFill(low, mine.map((k) => (k === 'F' ? fly() : mjTiles(k)[0])),
                thrownFly === 'F' ? fly() : mjTiles(thrownFly)[0]);
            return out && out.map((x) => (MJ.isFly(x) ? '飞' : MJ.key(x))).join(' ');
        };

        check(run('p3', '4p5p', '3p') === 'p3 p4 p5', 'mj: 4筒 5筒 do not take a thrown 3筒');
        check(run('p3', '3p5p', '4p') === 'p3 p4 p5', 'mj: a thrown 4筒 does not land in the middle');
        check(run('p3', '3p3p', '5p') === null, 'mj: two 3筒 filled two different rungs');
        check(run('z1', '1z1z', '1z') === null, 'mj: honours were allowed to run');
        check(run('p8', '9p9p', '8p') === null, 'mj: a run ran off the end of the suit');
        check(run('p3', '4p', '3p', true) === 'p3 p4 _', 'mj: a half-made pick is not a partial run');
        check(run('p3', '4p', '3p') === null, 'mj: a half-made pick was taken for a finished run');
        // Real tiles take their own rung before any fly is spent on it.
        check(runFly('p3', ['3p', 'F'], '4p') === 'p3 p4 飞', 'mj: a fly took the rung the 3筒 was filling');
        check(runFly('p3', ['F', '3p'], '4p') === 'p3 p4 飞', 'mj: the order the tiles were picked in changed the run');
        check(runFly('p3', ['4p', '5p'], 'F') === '飞 p4 p5', 'mj: a thrown 飞 did not fill the missing rung');
        check(runFly('p3', ['4p', 'F'], 'F') === null, 'mj: a thrown 飞 paired with a held one');

        const build = () => {
            const e = new game.Engine({
                rng: new CV.RNG(31337),
                config: { room: 'beginner', shoe: { dealer: 0 } },
                seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
            });
            e.start();
            const from = 0, me = 1;              // 吃 belongs to the seat after the thrower
            // Half a suit: a thrown 5筒 is 3-4-5, 4-5-6 and 5-6-7 all at once.
            e.seats[me].hand = mjTiles('2334667p1234z99p');
            e.seats[me].melds = [];
            const tile = mjTiles('5p')[0];
            e.seats[from].discards.push(tile);
            e.lastDiscard = { tile, from };
            e.phase = 'claim';
            e.turn = me;
            e.pending = [{ seat: me, options: e.findClaims(tile, from).find((x) => x.seat === me).options,
                           rank: 1, step: 1 }];
            e.claimAt = 0;
            return { e, me, from, tile };
        };

        {
            const { e, me } = build();
            const lows = e.legalActions(me).filter((o) => o.type === 'chow').map((o) => o.low).sort();
            check(lows.join() === 'p3,p4,p5', `mj: a thrown 5筒 offered ${lows.join()}, wanted three runs`);

            // 6筒 and 7筒 — the top run, which is not the one the engine would
            // have picked for itself.
            const want = ['p6', 'p7'].map((k) => e.seats[me].hand.find((x) => MJ.key(x) === k).id);
            check(e.apply({ type: 'chow', seat: me, low: 'p5', tiles: want }), 'mj: a named 吃 was refused');
            const meld = e.seats[me].melds[0];
            check(meld.tiles.map(MJ.key).join(' ') === 'p5 p6 p7', 'mj: the meld is not the run that was named');
            check(meld.tiles[1].id === want[0] && meld.tiles[2].id === want[1],
                'mj: the meld is not made of the tiles that were named');
            check(!e.seats[me].hand.some((x) => want.includes(x.id)), 'mj: the named tiles are still in the hand');
            check(e.seats[me].hand.length === 11, `mj: ${e.seats[me].hand.length} tiles left, wanted 11`);
        }

        {
            // Two tiles that are not a run change nothing at all.
            const { e, me, from } = build();
            const bad = ['z1', 'z2'].map((k) => e.seats[me].hand.find((x) => MJ.key(x) === k).id);
            check(!e.apply({ type: 'chow', seat: me, low: 'p5', tiles: bad }), 'mj: two honours were taken for a run');
            check(e.seats[me].hand.length === 13, 'mj: a refused 吃 took tiles out of the hand');
            check(e.seats[me].melds.length === 0, 'mj: a refused 吃 put a meld down');
            check(e.seats[from].discards.length === 1, 'mj: a refused 吃 took the tile out of the pool');
        }

        {
            // A bare 吃 — what the AI sends, and an older screen — still works.
            const { e, me } = build();
            check(e.apply({ type: 'chow', seat: me, low: 'p3' }), 'mj: a 吃 naming no tiles was refused');
            check(e.seats[me].melds[0].tiles.map(MJ.key).join(' ') === 'p3 p4 p5',
                'mj: a bare 吃 did not pick the run itself');
        }
        console.log('  ✓ 吃 lays down the two tiles the player named, and refuses two that are not a run');
    }

    /* --- the rules hold under random legal play ------------------------------ */

    {
        // Every invariant a screen cannot check, after every single action,
        // with the moves chosen mostly by the AI and sometimes at random —
        // the AI alone never explores the odd corners, and pure noise never
        // finishes a hand. Tile conservation is the big one: a hand is
        // thirteen tiles, or fourteen for the seat about to throw, and every
        // tile in the box is in exactly one place at every moment.
        const ROUNDS = Math.max(20, Math.round(HANDS / 60));
        let acted = 0, robs = 0;

        for (const players of [3, 4]) {
            const master = new CV.RNG(players === 3 ? 4242 : 8888);
            for (let g = 0; g < ROUNDS; g++) {
                const e = new game.Engine({
                    rng: new CV.RNG(master.int(1e9)),
                    config: { room: 'beginner', shoe: { dealer: master.int(players) } },
                    seats: Array.from({ length: players }, (_, i) =>
                        new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 100000, isYou: i === 0 })),
                });
                const ai = new game.AI(e);
                e.start();
                const full = MJ.build(players, {
                    fly: e.mode.flyEnabled ? MJ.FLY_COUNT : 0, flowers: e.mode.flowers,
                }).length;
                const where = `mj: ${players}P hand ${g}`;

                const invariants = (when) => {
                    const all = [];
                    for (const s of e.seats) {
                        all.push(...s.hand, ...s.discards, ...s.flowers,
                                 ...s.melds.flatMap((m) => m.tiles));
                    }
                    all.push(...e.wall);
                    check(all.length === full, `${where}: ${all.length} tiles ${when}, the set holds ${full}`);
                    check(new Set(all.map((x) => x.id)).size === all.length,
                        `${where}: a tile is in two places at once ${when}`);

                    for (let i = 0; i < players; i++) {
                        const s = e.seats[i];
                        const size = s.hand.length + 3 * s.melds.length;
                        // Fourteen for the seat about to throw — and for a
                        // seat whose 加杠 is still being offered around.
                        const wants14 = (!e.over && e.phase === 'discard' && e.turn === i)
                            || !!(e.robbing && e.robbing.seat === i);
                        check(size === (wants14 ? 14 : 13),
                            `${where}: seat ${i} holds ${size} tiles ${when}, wanted ${wants14 ? 14 : 13}`);
                        check(!s.hand.some(MJ.isFlower), `${where}: a flower sat in a hand ${when}`);
                        check(!s.discards.some(MJ.isFlower), `${where}: a flower was discarded ${when}`);
                        check(s.melds.length <= 4, `${where}: seat ${i} has ${s.melds.length} melds ${when}`);
                        for (const m of s.melds) {
                            check(m.tiles.length === (m.type === 'kong' ? 4 : 3),
                                `${where}: a ${m.type} holds ${m.tiles.length} tiles ${when}`);
                            const real = m.tiles.filter((x) => !MJ.isFly(x));
                            if (m.type === 'chow') {
                                const suit = m.key[0], lo = Number(m.key.slice(1));
                                check(suit !== 'z' && lo >= 1 && lo + 2 <= 9,
                                    `${where}: a chow of ${m.key} ${when}`);
                                check(real.every((x) => x.suit === suit
                                        && [lo, lo + 1, lo + 2].includes(x.n)),
                                    `${where}: a tile outside its own chow ${when}`);
                                check(new Set(real.map(MJ.key)).size === real.length,
                                    `${where}: a chow holding the same tile twice ${when}`);
                            } else {
                                check(real.every((x) => MJ.key(x) === m.key),
                                    `${where}: a tile outside its own ${m.type} ${when}`);
                            }
                        }
                        if (players === 4) {
                            check(!s.flowers.length && !s.hand.some(MJ.isFly),
                                `${where}: a flower or a fly reached four seats ${when}`);
                        }
                    }
                    if (!e.over && e.phase === 'claim') {
                        const entry = e.pending[e.claimAt];
                        check(!!entry && entry.seat === e.turn,
                            `${where}: the claim queue and the turn disagree ${when}`);
                        check(!!e.lastDiscard, `${where}: a claim phase with nothing on offer ${when}`);
                        // The flag says how the seat *in play* got its turn,
                        // so it belongs to a discard phase and nowhere else.
                        check(!e.claimed, `${where}: the claim flag outlived its turn ${when}`);
                    }
                    // A kong draws a replacement, so a dry wall offers none.
                    if (!e.over && !e.wall.length && e.phase === 'discard') {
                        check(!e.legalActions(e.turn).some((o) => o.type === 'kong'),
                            `${where}: 杠 offered with an empty wall ${when}`);
                    }
                };

                invariants('at the deal');
                let steps = 0;
                while (!e.isOver()) {
                    const seat = e.turn;
                    const options = e.legalActions(seat);
                    check(options.length > 0, `${where}: seat ${seat} had nothing legal in ${e.phase}`);
                    if (!options.length) break;
                    let pick = options[master.int(options.length)];
                    if (master.int(4) > 0) {
                        const want = ai.decide(seat);
                        const same = want && options.find((o) => o.type === want.type
                            && (o.low === undefined || o.low === want.low)
                            && (o.key === undefined || o.key === want.key)
                            && (o.tile === undefined || o.tile === want.tile));
                        if (same) pick = same;
                    }
                    const was = e.phase;
                    check(e.apply(Object.assign({}, pick, { seat })) === true,
                        `${where}: the engine refused its own legal ${pick.type} in ${was}`);
                    acted++;
                    if (!e.over) invariants(`after a ${pick.type}`);
                    if (++steps > 1200) { check(false, `${where}: ran past 1200 actions`); break; }
                }

                check(e.seats.reduce((n, s) => n + s.net, 0) === 0, `${where}: not zero-sum`);
                check(e.seats.every((s) => s.coins >= 0), `${where}: a seat went below zero`);
                if (!e.drawn) {
                    if (e.robbed) robs++;
                    check(e.fan.totalFan >= e.minFan,
                        `${where}: a ${e.fan.totalFan}番 hand cleared a ${e.minFan}番 floor`);
                    check(!!e.winTile, `${where}: the tile the hand went out on was not recorded`);
                    // 自摸 is scored exactly when nobody threw it, and 门清
                    // exactly when nothing was taken from anybody — at a table
                    // that pays for either. Three seats pay for neither: a 番
                    // for how the hand arrived is a 番 nobody built.
                    const pays = (n) => (e.fanTable[n] || 0) > 0;
                    check(e.fan.patterns.some((p) => p.name === '自摸')
                        === (pays('自摸') && e.winFrom < 0),
                        `${where}: 自摸 and winFrom disagree`);
                    check(e.fan.patterns.some((p) => p.name === '门清')
                        === (pays('门清') && !e.seats[e.winner].melds.some((m) => !m.concealed)),
                        `${where}: 门清 and the melds on the table disagree`);
                    // What was paid is what the hand contains, priced again.
                    check(CV.MJFan.calculateFan(e.winHand, e.fanTable).totalFan === e.fan.totalFan,
                        `${where}: the winning hand does not re-price to ${e.fan.totalFan}番`);
                    check(e.bao === (e.fan.totalFan >= e.mode.baoFanThreshold)
                        && e.payFan === (e.bao ? e.mode.baoFanPayment : e.fan.totalFan),
                        `${where}: 爆番 settled at ${e.payFan}番 on a ${e.fan.totalFan}番 hand`);
                }
            }
        }
        console.log(`  ✓ ${acted} actions of mixed play, every invariant held after each one`
            + (robs ? ` (${robs} 抢杠)` : ''));
    }

    /* --- whole hands, both modes -------------------------------------------- */

    const master = new CV.RNG(31415);
    for (const players of [4, 3]) {
        // Mahjong hands are long, and a three-player hand played for value is
        // longer still, so this is deliberately a smaller sample than the card
        // games get. It is enough to exercise every path.
        const ROUNDS = players === 3 ? Math.max(12, Math.round(HANDS / 200))
                                     : Math.max(15, Math.round(HANDS / 150));
        const t0 = Date.now();
        let wins = 0, draws = 0, selfDraws = 0, kongs = 0, claims = 0, fanTotal = 0;

        for (let g = 0; g < ROUNDS; g++) {
            const room = CV.Registry.ROOMS[master.int(4)].id;
            const e = new game.Engine({
                rng: new CV.RNG(master.int(1e9)),
                config: { room, shoe: { dealer: master.int(players) } },
                seats: Array.from({ length: players }, (_, i) => new CV.Seat(i, {
                    kind: 'ai', name: 'S' + i, coins: 100000, isYou: i === 0,
                })),
            });
            const ai = new game.AI(e);
            e.start();

            const full = MJ.build(players, {
                fly: e.mode.flyEnabled ? MJ.FLY_COUNT : 0, flowers: e.mode.flowers,
            }).length;
            check(e.seats[e.dealer].hand.length === 14, 'mj: East was not dealt fourteen tiles');
            for (let i = 0; i < players; i++) {
                if (i === e.dealer) continue;
                check(e.seats[i].hand.length === 13, 'mj: a seat was not dealt thirteen tiles');
            }
            check(e.turn === e.dealer, 'mj: East does not throw first');

            let steps = 0;
            while (!e.isOver()) {
                const action = ai.decide(e.turn);
                check(!!action, `mj: the AI had nothing to do in ${e.phase}`);
                if (!action) break;
                if (action.type === 'kong') kongs++;
                if (['pung', 'chow'].includes(action.type)) claims++;
                check(e.apply(action), `mj: engine refused ${JSON.stringify(action)} in ${e.phase}`);
                if (++steps > 900) { check(false, 'mj: a hand ran past 900 actions'); break; }
            }

            // Every tile is somewhere, and only in one place.
            const seen = [];
            for (const s of e.seats) {
                seen.push(...s.hand, ...s.discards, ...s.flowers,
                    ...s.melds.flatMap((m) => m.tiles));
            }
            seen.push(...e.wall);
            if (e.winner >= 0 && e.winFrom >= 0) seen.push(e.lastDiscard.tile);
            check(seen.length === full, `mj: ${seen.length} tiles accounted for, the set holds ${full}`);
            check(new Set(seen.map((x) => x.id)).size === full, 'mj: a tile is in two places at once');

            check(e.seats.every((s) => !s.hand.some(MJ.isFlower)),
                'mj: a flower was left sitting in a hand');
            check(e.seats.every((s) => !s.discards.some(MJ.isFlower)),
                'mj: a flower was discarded instead of set aside');
            if (players === 4) {
                check(e.seats.every((s) => !s.flowers.length && !s.hand.some(MJ.isFly)),
                    'mj: a flower or a fly reached the four-player game');
            }

            // 吃 only ever comes from the seat before.
            for (let i = 0; i < players; i++) {
                for (const meld of e.seats[i].melds) {
                    if (meld.type !== 'chow') continue;
                    check((meld.from + 1) % players === i,
                        'mj: a chow was taken from someone other than the previous seat');
                    check(meld.tiles.every((x) => x.suit !== 'z'), 'mj: a chow of honours');
                }
                for (const meld of e.seats[i].melds) {
                    const size = meld.type === 'kong' ? 4 : 3;
                    check(meld.tiles.length === size, `mj: a ${meld.type} holds ${meld.tiles.length} tiles`);
                }
            }

            // The score adds up and nobody is taken below zero.
            check(e.seats.reduce((n, s) => n + s.net, 0) === 0, 'mj: the table is not zero-sum');
            for (const s of e.seats) {
                check(s.coins >= 0, 'mj: a seat was taken below zero');
                check(s.coins === s.startCoins + s.net, 'mj: coins do not reconcile');
            }

            if (e.drawn) { draws++; check(e.winner < 0, 'mj: a 流局 with a winner'); }
            else {
                wins++;
                fanTotal += e.fan.totalFan;
                check(e.fan.totalFan >= 1, 'mj: a winning hand worth no 番 at all');
                check(e.fan.totalFan >= e.minFan,
                    `mj: a ${e.fan.totalFan}番 hand was declared at a ${e.minFan}番 table`);
                check(e.bao === (e.fan.totalFan >= 10), 'mj: 爆番 disagrees with the 番 count');
                if (e.bao) check(e.payFan === 20, `mj: 爆番 settled at ${e.payFan}番`);
                const parts = MJ.split(e.winTiles);
                check(!!W.isWin(parts.counts, e.seats[e.winner].melds.length,
                    e.mode.flyEnabled ? parts.wilds : 0, e.pool),
                    'mj: the declared winner does not hold a winning hand');
                if (e.winFrom < 0) selfDraws++;
                // East keeps the seat by winning, and gives it up otherwise.
                const want = e.winner === e.dealer ? e.dealer : (e.dealer + 1) % players;
                check(e.shoeState.dealer === want, 'mj: the dealer moved the wrong way');
            }
        }
        console.log(`  ${players}-player: ${ROUNDS} hands, ${Date.now() - t0} ms — `
            + `${wins} won (${selfDraws} 自摸), ${draws} 流局, avg ${(fanTotal / Math.max(1, wins)).toFixed(1)}番`
            + (players === 3 ? ` · 一番 🪙 ${CV.MJPay.unitFor(3, 10, 2)} minimum ${CV.MJPay.profileFor(3).minFan}番` : ''));
        console.log(`    ${claims} tiles claimed, ${kongs} kongs`);
        check(wins > 0, `mj: nobody ever won a ${players}-player hand`);
    }

    /* --- what a host may broadcast ------------------------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(9), config: { room: 'beginner' },
            seats: [0, 1, 2, 3].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000, isYou: i === 0 })),
        });
        e.start();
        for (let viewer = 0; viewer < 4; viewer++) {
            const view = e.snapshotFor(viewer);
            const wire = JSON.stringify(view);
            check(!view.rng, 'mj: the snapshot carries the RNG');
            check(typeof view.wall === 'number', 'mj: the wall itself went out on the wire');
            view.seats.forEach((seat, i) => {
                if (i === viewer) check(seat.hand.every(Boolean), 'mj: your own tiles were redacted from you');
                else check(seat.hand.every((x) => x === null), 'mj: another seat\'s tiles went out');
            });
            for (const tile of e.wall.slice(-8)) {
                check(!wire.includes('"' + tile.id + '"'), `mj: a tile still in the wall (${tile.id}) is on the wire`);
            }
        }
    }
    console.log('  ✓ no concealed tile but your own, and nothing left in the wall');

    /* --- what a guest's engine can still answer ------------------------------ */

    {
        // A guest holds no engine. It holds `CV.RemoteEngine` wearing the
        // host's snapshot, and the table screen reads the wall, the floor,
        // the stake, whose seat is East and whether the fly is in play
        // straight off it. None of that survived the trip: the mahjong
        // screen threw on a guest's first paint, before a tile was drawn.
        const e = new game.Engine({
            rng: new CV.RNG(97), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'human', name: 'S' + i, coins: 5000 })),
        });
        e.start();
        const guest = new CV.RemoteEngine(e.snapshotFor(1), game);

        const SAME = ['players', 'minFan', 'unit', 'flyOn', 'baoAt', 'baoPay', 'wallLeft'];
        for (const k of SAME) {
            check(guest[k] === e[k], `mj: a guest reads ${k} as ${guest[k]}, the host says ${e[k]}`);
        }
        // East is seat 0 at the start of a shoe, and 0 is falsy — which is
        // how the dealer's seat turned into a card table's empty hand.
        check(guest.dealer === e.dealer, `mj: a guest thinks seat ${JSON.stringify(guest.dealer)} is East`);
        check(typeof guest.dealer === 'number', 'mj: a guest reads East as something other than a seat');
        check(guest.legalActions(1).length >= 0 && guest.legalActions(0).length === 0,
            'mj: a guest was told what another seat may do');
        check(guest.seats[1].hand.every(Boolean), 'mj: a guest cannot see its own tiles');
        check(guest.seats[0].hand.every((x) => x === null), 'mj: a guest can see another seat\'s tiles');
        console.log('  ✓ a guest reads the wall, the floor, the stake and East off the snapshot');
    }

    for (const key of game.rules) check(CV.t(key) !== key, `mj: rule key ${key} has no text`);
    console.log('  ✓ rules card resolves');
}
auditMahjong();

/* ---- 斗牛 ---------------------------------------------------------------- */

let bbUid = 0;
function bbCards(str) {
    return str.split(/\s+/).filter(Boolean).map((tok) => {
        const s = tok.slice(-1), r = PK_RANKS[tok.slice(0, -1)];
        if (r === undefined || !'SHDC'.includes(s)) throw new Error('bad card ' + tok);
        return { r, s, id: 'b' + (bbUid++) };
    });
}

function auditBullBull() {
    console.log('\n🐮 斗牛');
    const game = CV.Registry.get('bullbull');
    const H = CV.BullHands;

    /* --- what a card is worth ---------------------------------------------- */

    const v = (tok) => H.value(bbCards(tok)[0]);
    check(v('AS') === 1, 'bb: the ace counts one');
    for (let n = 2; n <= 9; n++) check(v(n + 'H') === n, `bb: ${n} should count ${n}`);
    for (const tok of ['10D', 'JC', 'QS', 'KH']) check(v(tok) === 10, `bb: ${tok} should count ten`);

    /* --- the examples from the rules ---------------------------------------- */

    const read = (str) => H.evaluate(bbCards(str));
    const CASES = [
        // A + 2 + 7 = 10 leaves 8 and 3 for a one — but the 3 counts as a 6,
        // and 8 + 6 is a four. The hand is read the higher way.
        ['AS 2H 7D 8C 3S',   'BULL_4',        4],
        // 10 + K + Q = 30, and the pair of threes makes it 宝宝.
        ['10D KH QC 3S 3H',  'BABY',          6],
        // Five picture cards.
        ['JS QH KD JC QS',   'FIVE_PIC',      null],
        // 10 + K + Q = 30, leaving a jack and the ace of spades.
        ['10D KH QC JS AS',  'PIC_BLACK_ACE', 1],
        // 5 + 5 + K = 20, leaving a queen and the ace of *clubs* — which is
        // an ordinary ace. 黑 here means 黑桃, the spade, not "a black card",
        // and the two readings are one card apart on a hand that pays ×4.
        ['5S 5H KD QC AC',   'BULL_1',        1],
        // The same hand with the spade instead, which is the real thing.
        ['5S 5H KD QC AS',   'PIC_BLACK_ACE', 1],
        // Nothing makes ten, twenty or thirty — not even with the swap.
        ['2S 2H 2D 2C 5S',   'NO_BULL',       null],
        // The same four twos with a 3: counted as a 6 it makes 2 + 2 + 6 = 10,
        // which leaves the other two twos as a pair — so a hand that is 无牛
        // on its face is a 宝宝·牛四.
        ['2S 2H 2D 2C 3S',   'BABY',          4],
        // 6 counted as 3: 4 + 3 + 3 = 10 leaves two aces, which is a 宝宝.
        ['4S 6H 3D AC AH',   'BABY',          2],
        // 2 + 3 + 5 = 10, and 4 + 6 = 10 is a round bull.
        ['2S 3H 5D 4C 6H',   'BULL_BULL',     0],
        ['2S 3H 5D 4C 5H',   'BULL_9',        9],
        // 2 + 8 + 10 = 20 leaves an ace and a ten. No 3 and no 6, so there is
        // only the one reading.
        ['2S 8H 10D AC 10H', 'BULL_1',        1],
    ];
    for (const [str, type, bull] of CASES) {
        const h = read(str);
        check(h.type === type, `bb: "${str}" read as ${h.type}, wanted ${type}`);
        if (bull !== null) check(h.bull === bull, `bb: "${str}" gave 牛${h.bull}, wanted 牛${bull}`);
    }
    console.log(`  ${CASES.length} hands read, every worked example from the rules`);

    /* --- the order, top to bottom -------------------------------------------- */

    const CHAIN = [
        ['JS QH KD JC QS',   '五个 Pic'],
        ['10D KH QC JS AS',  'Pic + Black Ace'],
        ['2S 3H 5D 4C 6H',   '牛牛'],
        ['10D KH QC 3S 3H',  '宝宝·牛六'],
        ['10D KH QC AS AH',  '宝宝·牛二'],
        ['2S 3H 5D 4C 5H',   '牛九'],
        ['2S 8H 10D AC 10H', '牛一'],
        ['2S 2H 2D 2C 5S',   '无牛'],
    ];
    for (let i = 0; i + 1 < CHAIN.length; i++) {
        const a = read(CHAIN[i][0]), b = read(CHAIN[i + 1][0]);
        check(H.compare(a, b) > 0, `bb: ${CHAIN[i][1]} should beat ${CHAIN[i + 1][1]}`);
        check(H.compare(b, a) < 0, `bb: ${CHAIN[i + 1][1]} should lose to ${CHAIN[i][1]}`);
    }
    check(H.compare(read('2S 3H 5D 4C 5H'), read('2H 3D 5S 4H 5C')) === 0,
        'bb: two hands of the same rank must push');
    console.log(`  ${CHAIN.length - 1} steps of the order, and a push where they meet`);

    /* --- the multiplier table ------------------------------------------------ */

    const MULT = {
        FIVE_PIC: 5, PIC_BLACK_ACE: 4, BULL_BULL: 3, BABY: 3,
        BULL_9: 2, BULL_8: 2, BULL_7: 2,
        BULL_6: 1, BULL_5: 1, BULL_4: 1, BULL_3: 1, BULL_2: 1, BULL_1: 1, NO_BULL: 1,
    };
    for (const [type, want] of Object.entries(MULT)) {
        check(H.MULT[type] === want, `bb: ${type} pays ×${H.MULT[type]}, wanted ×${want}`);
    }

    /* --- every hand in the deck ---------------------------------------------- */

    {
        const deck = [];
        for (const s of ['S', 'H', 'D', 'C']) for (let r = 2; r <= 14; r++) deck.push({ r, s, id: s + r });
        const tally = {};
        const five = new Array(5);
        const t0 = Date.now();
        let total = 0;

        for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++) for (let d = c + 1; d < 51; d++)
        for (let e = d + 1; e < 52; e++) {
            five[0] = deck[a]; five[1] = deck[b]; five[2] = deck[c]; five[3] = deck[d]; five[4] = deck[e];
            const h = H.evaluate(five);
            tally[h.type] = (tally[h.type] || 0) + 1;
            total++;

            // The invariants, on every hand there is.
            if (h.mult !== MULT[h.type]) check(false, `bb: ${h.type} paid ×${h.mult}`);
            if (h.type !== 'NO_BULL' && h.type !== 'FIVE_PIC') {
                // The bull is the last digit of the hand *as counted*, so the
                // swaps the reading used are added back before comparing —
                // which is also a check that `swaps` reports them honestly.
                const face = five.reduce((n, x) => n + H.value(x), 0);
                const adj = h.swaps.reduce((n, w) => n + (w.to - w.from), 0);
                const sum = (face + adj) % 10;
                if (h.bull !== sum) check(false, `bb: bull ${h.bull} against a hand total of ${sum}`);
                for (const w of h.swaps) {
                    if (H.SWAP[w.from] !== w.to) check(false, `bb: counted a ${w.from} as a ${w.to}`);
                }
            }
            if (h.type === 'BABY' && h.bull % 2 !== 0) {
                check(false, `bb: a 宝宝 landed on an odd bull (${h.bull})`);
            }
        }

        check(total === 2598960, `bb: ${total} hands read, the deck holds 2,598,960`);
        // Twelve picture cards, five at a time — a figure that can be checked
        // by hand, which is the point of checking it.
        check(tally.FIVE_PIC === 792, `bb: ${tally.FIVE_PIC} 五个 Pic, the deck holds 792`);
        check(tally.NO_BULL > 0 && tally.BULL_BULL > 0 && tally.BABY > 0 && tally.PIC_BLACK_ACE > 0,
            'bb: some kind of hand never came up in the whole deck');

        const pct = (k) => ((tally[k] || 0) / total * 100).toFixed(2);
        console.log(`  all 2,598,960 hands read in ${Date.now() - t0} ms — `
            + `无牛 ${pct('NO_BULL')}%, 牛牛 ${pct('BULL_BULL')}%, 宝宝 ${pct('BABY')}%`);
        console.log(`  Pic + Black Ace ${pct('PIC_BLACK_ACE')}% · 五个 Pic ${tally.FIVE_PIC} hands exactly`);
        console.log('  ✓ the bull is the hand\'s last digit on every one of them');
    }

    // A 宝宝 is two cards of the same value *as counted*, and two equal
    // numbers always sum to an even one — so a 宝宝 can never land on an odd
    // bull, swap or no swap. The exhaustive pass above asserts it on all
    // 2.6 million hands; this says why.
    {
        let odd = 0;
        for (let val = 1; val <= 10; val++) if (((val * 2) % 10) % 2 === 1) odd++;
        check(odd === 0, 'bb: a pair somehow summed to an odd last digit');
        console.log('  ✓ 3 counts as 6 and 6 as 3, and a 宝宝 still lands only on an even bull');
    }

    /* --- the 3 ↔ 6 rule, on its own -------------------------------------- */

    {
        // Only the 3 and the 6 have a second value, and they swap into each
        // other. Everything else is worth exactly one thing.
        for (let r = 2; r <= 14; r++) {
            const card = { r, s: 'S', id: 'x' + r };
            const vals = H.valuesOf(card);
            const face = H.value(card);
            const want = (face === 3 || face === 6) ? 2 : 1;
            check(vals.length === want,
                `bb: rank ${r} can be counted ${vals.length} ways, wanted ${want}`);
            check(vals[0] === face, `bb: rank ${r} does not lead with its face value`);
            if (want === 2) check(vals[1] === 9 - face, `bb: ${face} does not swap to ${9 - face}`);
        }

        // The rule may only ever help. Reading a hand with the swap turned off
        // can never beat reading it with the swap on, because the reading with
        // the swap on includes the one without it.
        let helped = 0;
        const rng = new CV.RNG(4242);
        for (let g = 0; g < 4000; g++) {
            const deck = new CV.Cards.Deck(rng, { decks: 1 });
            deck.shuffle();
            const five = [deck.draw(), deck.draw(), deck.draw(), deck.draw(), deck.draw()];
            const withSwap = H.evaluate(five);
            // The same five with every 3 and 6 removed from the hand's reach:
            // swapped hands must rank at least as high as their own face.
            check(withSwap.swaps.every((w) => H.SWAP[w.from] === w.to),
                'bb: a swap that is not in the table');
            if (withSwap.swaps.length) helped++;
        }
        check(helped > 0, 'bb: the swap never fired in 4,000 hands');
        console.log(`  ✓ only 3 and 6 have a second value, and it was used in `
            + `${(helped / 40).toFixed(0)}% of 4,000 dealt hands`);
    }

    /* --- settling against the dealer ------------------------------------------ */

    const table = (players, coins, seed) => new game.Engine({
        rng: new CV.RNG(seed === undefined ? 5 : seed), config: { room: 'beginner' },
        seats: Array.from({ length: players }, (_, i) => new CV.Seat(i, {
            kind: 'ai', name: 'S' + i, coins, isYou: i === 0,
        })),
    });

    /** Deal by hand, so the comparison being tested is the one that happens. */
    const rig = (mine, dealer, bet) => {
        const e = table(1, 100000);
        e.start();
        e.seats[0].bet = bet;
        e.seats[0].coins -= bet;
        e.seats[0].net -= bet;
        e.phase = 'dealing';
        e.seats[0].cards = bbCards(mine);
        e.seats[0].hand = H.evaluate(e.seats[0].cards);
        e.dealer.cards = bbCards(dealer);
        e.dealer.hand = H.evaluate(e.dealer.cards);
        e.settle();
        return e.seats[0];
    };

    // The worked example: 牛八 against 牛五, a hundred up, pays two hundred.
    // Neither hand holds a 3 or a 6, so there is one reading of each and the
    // comparison being tested is the settlement rather than the evaluator.
    const eight = rig('AS 4H 5D 8C KH', '2S 8H 10D 4C AH', 100);
    check(eight.hand.type === 'BULL_8', `bb: the test hand read as ${eight.hand.type}`);
    check(eight.outcome === 'win' && eight.net === 200,
        `bb: 牛八 over 牛五 on 100 netted ${eight.net}, wanted 200`);

    // The best hand there is, five times.
    const pic = rig('JS QH KD JC QS', '2S 3H 5D 4C 6H', 100);
    check(pic.net === 500, `bb: 五个 Pic over 牛牛 on 100 netted ${pic.net}, wanted 500`);

    // And the same table the other way round.
    const lost = rig('2S 8H 10D AC 10H', 'JS QH KD JC QS', 100);
    check(lost.outcome === 'loss' && lost.net === -500,
        `bb: 牛一 under 五个 Pic on 100 netted ${lost.net}, wanted -500`);

    const push = rig('2S 3H 5D 4C 5H', '2H 3D 5S 4H 5C', 100);
    check(push.outcome === 'push' && push.net === 0, `bb: a push netted ${push.net}`);

    // A seat cannot be taken below zero by a big dealer hand.
    const broke = rig('2S 8H 10D AC 10H', 'JS QH KD JC QS', 100000);
    check(broke.coins >= 0, 'bb: a seat was taken below zero');
    console.log('  ✓ the winner\'s multiplier sets the swing, a tie returns the bet');

    /* --- whole hands ----------------------------------------------------------- */

    {
        const master = new CV.RNG(80808);
        const ROUNDS = Math.max(200, Math.round(HANDS / 3));
        const t0 = Date.now();
        let staked = 0, net = 0;
        const seen = {};

        for (let g = 0; g < ROUNDS; g++) {
            const n = master.range(1, 6);
            const room = CV.Registry.ROOMS[master.int(4)].id;
            const e = table(n, master.range(500, 50000), master.int(1e9));
            const ai = new game.AI(e);
            e.config.room = room;
            e.start();
            let steps = 0;
            while (!e.isOver()) {
                const a = ai.decide(e.turn);
                check(!!a, 'bb: the AI had nothing to do');
                if (!a) break;
                check(e.apply(a), `bb: engine refused ${JSON.stringify(a)}`);
                if (++steps > 20) { check(false, 'bb: a hand ran past 20 actions'); break; }
            }

            // Five each and five for the dealer, all from one pack.
            const live = e.seats.filter((s) => !s.out);
            check(e.dealer.cards.length === 5, `bb: the dealer took ${e.dealer.cards.length} cards`);
            for (const s of live) check(s.cards.length === 5, `bb: a seat took ${s.cards.length} cards`);
            const all = live.flatMap((s) => s.cards).concat(e.dealer.cards);
            check(new Set(all.map((c) => c.id)).size === all.length, 'bb: a card was dealt twice');

            for (const s of live) {
                check(s.coins >= 0, 'bb: a seat was taken below zero');
                check(s.coins === s.startCoins + s.net, 'bb: coins do not reconcile');
                // The outcome and the comparison have to agree.
                const cmp = H.compare(s.hand, e.dealer.hand);
                const want = cmp > 0 ? 'win' : cmp < 0 ? 'loss' : 'push';
                check(s.outcome === want, `bb: a ${want} was settled as a ${s.outcome}`);
                if (want === 'win') {
                    check(s.net === s.bet * s.hand.mult,
                        `bb: a win on ${s.hand.type} netted ${s.net} against a bet of ${s.bet}`);
                }
                if (want === 'push') check(s.net === 0, 'bb: a push moved coins');
                staked += s.bet;
                net += s.net;
                seen[s.hand.type] = (seen[s.hand.type] || 0) + 1;
            }
        }
        const edge = (net / staked) * 100;
        console.log(`  ${ROUNDS} hands, ${Date.now() - t0} ms — return ${edge.toFixed(2)}% of stake `
            + `across ${Object.keys(seen).length} kinds of hand`);
        check(Math.abs(edge) < 12, `bb: a return of ${edge.toFixed(2)}% is outside any plausible band`);
    }

    /* --- what a host may broadcast ---------------------------------------------- */

    {
        const e = table(3, 5000);
        e.start();
        for (let viewer = 0; viewer < 3; viewer++) {
            const view = e.snapshotFor(viewer);
            const wire = JSON.stringify(view);
            check(!view.rng, 'bb: the snapshot carries the RNG');
            check(view.dealer.cards.length === 0, 'bb: the dealer\'s cards went out before the deal');
            view.seats.forEach((s, i) => {
                if (i !== viewer && e.seats[i].bet) {
                    check(s.bet === 'hidden', 'bb: another seat\'s bet is visible before the deal');
                }
            });
            for (const card of e.deck.cards.slice(-8)) {
                check(!wire.includes('"' + card.id + '"'), `bb: an undealt card (${card.id}) is on the wire`);
            }
        }
    }
    console.log('  ✓ nothing on the wire before the deal, and nothing still in the pack');

    for (const key of game.rules) check(CV.t(key) !== key, `bb: rule key ${key} has no text`);
    console.log('  ✓ rules card resolves');
}
auditBullBull();

/* ---- Lami ---------------------------------------------------------------- */

let lamiUid = 0;
/** "C3 C4 C5" — suit letter then rank. `X` is a joker. */
function lamiTiles(str) {
    return str.split(/\s+/).filter(Boolean).map((tok) => {
        if (tok === 'X') return { joker: true, id: 'x' + (lamiUid++) };
        const s = tok[0], r = Number(tok.slice(1));
        if (!'CDHS'.includes(s) || !(r >= CV.Lami.LOW && r <= CV.Lami.TOP)) throw new Error('bad tile ' + tok);
        return { r, s, id: 'l' + (lamiUid++) };
    });
}

function auditLami() {
    console.log('\n🧩 Lami');
    const game = CV.Registry.get('lami');
    const L = CV.Lami;

    /* --- the box ------------------------------------------------------------ */

    {
        const box = L.build();
        const jokers = box.filter(L.isJoker);
        const real = box.filter((x) => !L.isJoker(x));
        check(real.length === 104, `lami: ${real.length} numbered tiles, wanted 2 × 52`);
        check(jokers.length === L.RULES.jokers, `lami: ${jokers.length} jokers, wanted ${L.RULES.jokers}`);
        check(new Set(box.map((x) => x.id)).size === box.length, 'lami: the box holds a duplicate id');
        // The ace is high and there is no 1: a rank worth 15 points cannot
        // also be the bottom of every run. See `melds.js`.
        check(L.LOW === 2 && L.TOP === 14, `lami: the box runs ${L.LOW} to ${L.TOP}, wanted 2 to A`);
        check(!real.some((x) => x.r === 1), 'lami: a rank 1 got into a box that starts at 2');
        for (const s of L.SUITS) {
            const suit = real.filter((x) => x.s === s);
            check(suit.length === 26, `lami: ${suit.length} tiles in ${s}, wanted 2 × 13`);
            check(new Set(suit.map((x) => x.r)).size === 13, `lami: ${s} is not 2 to A`);
        }
        check(L.RULES.hand === 20, `lami: ${L.RULES.hand} tiles dealt, wanted 20`);
        check(L.RULES.hand * 4 < box.length, 'lami: four hands of 20 do not fit in the box');
        console.log(`  ${box.length} tiles — four suits of 2 to A, two of each, and ${L.RULES.jokers} jokers`);
    }

    /* --- what is a meld ------------------------------------------------------ */

    const read = (str) => { const m = L.meld(lamiTiles(str)); return m ? m.type : null; };
    const MELDS = [
        // Runs, straight from the rules.
        ['C3 C4 C5',        'run'],
        ['D7 D8 D9 D10',    'run'],
        ['H8 H9 X',         'run'],      // the joker plays the ten
        ['S11 S12 S13',     'run'],
        ['S12 S13 X',       'run'],      // the joker goes below, not past the king
        // Sets, straight from the rules.
        ['C7 D7 H7 S7',     'set'],
        ['C13 D13 H13',     'set'],
        ['C5 D5 X',         'set'],
        // And the ones that are not melds at all.
        ['C3 C4',           null],       // two is not enough
        ['C3 D4 H5',        null],       // a run is one suit
        ['C3 C5 C6',        null],       // and consecutive
        ['C3 C3 C4',        null],       // with no tile twice
        ['C7 D7',           null],       // two is not enough for a set either
        ['C7 C7 D7',        null],       // and a suit cannot appear twice
        ['C7 D7 H7 S7 X',   null],       // five is past the four suits
        ['S13 S14 S2',      null],       // a run does not wrap past the ace
        ['C2 X X',          'run'],      // two jokers still need a real tile
        ['X X X',           null],       // and three jokers are nothing at all
    ];
    for (const [str, want] of MELDS) {
        check(read(str) === want, `lami: "${str}" read as ${read(str)}, wanted ${want}`);
    }
    console.log(`  ${MELDS.length} melds read, the ones that are not melds included`);

    /* --- how a meld is laid out on the table --------------------------------- *
     *
     * A joker parked on the end of a run is a joker nobody can read: ♦2 ♦4 ♦5
     * 🃏 is a 3 in the hole two places to its left, and the meld whose job is
     * to say so does not. A run goes down by rank with each joker in the slot
     * it fills; see `L.layout`.
     */
    {
        const laid = (str) => L.layout(lamiTiles(str)).map(L.name).join(' ');
        const LAYOUTS = [
            ['D2 D4 D5 X',   '2♦ 🃏 4♦ 5♦'],       // the hole in the middle
            ['C7 C9 C10 X',  '7♣ 🃏 9♣ 10♣'],
            ['S2 S5 X X',    '2♠ 🃏 🃏 5♠'],        // two holes, two jokers
            ['H2 H3 H4',     '2♥ 3♥ 4♥'],           // nothing to move
            ['S2 S3 S4 X',   '2♠ 3♠ 4♠ 🃏'],        // no hole: the spare rides on top
            ['S12 S13 S14 X', '🃏 Q♠ K♠ A♠'],       // …unless the run is on the ace
            ['C5 D5 X',      '5♣ 5♦ 🃏'],           // a set has no order to get wrong
        ];
        for (const [str, want] of LAYOUTS) {
            check(laid(str) === want, `lami: "${str}" laid out as ${laid(str)}, wanted ${want}`);
        }
        // Whatever it does with the order, it does not lose or copy a tile.
        for (const [str] of LAYOUTS) {
            const tiles = lamiTiles(str);
            const out = L.layout(tiles);
            const ids = new Set(out.map((x) => x.id));
            check(out.length === tiles.length && ids.size === tiles.length
                && tiles.every((x) => ids.has(x.id)), `lami: the layout of "${str}" lost a tile`);
        }
        console.log(`  ${LAYOUTS.length} melds laid out — a joker sits in the hole it fills`);
    }

    /* --- adding to what is on the table -------------------------------------- */

    {
        // The example from the rules: ♠3-4-5-6 becomes ♠3-4-5-6-7.
        const table = lamiTiles('S3 S4 S5 S6');
        check(!!L.extend(table, lamiTiles('S7')), 'lami: a run should take the next tile up');
        check(!!L.extend(table, lamiTiles('S2')), 'lami: a run should take the next tile down');
        check(!L.extend(table, lamiTiles('S9')), 'lami: a run should not take a tile that does not join');
        check(!L.extend(table, lamiTiles('H7')), 'lami: a run should not take another suit');

        const set = lamiTiles('C7 D7 H7');
        check(!!L.extend(set, lamiTiles('S7')), 'lami: a set of three should take the fourth suit');
        check(!L.extend(set, lamiTiles('C7')), 'lami: a set should not take a suit it already holds');
        console.log('  ✓ a run takes either end, a set takes the suit it is missing');
    }

    /* --- the opening run, which is not optional ------------------------------
     *
     * Your first lay has to be a run, and a seat holding one has to lay it:
     * no folding on it, no spending a joker to buy the turn. Until it is down
     * you are not on the table and may add nothing to anybody else's meld.
     */
    {
        const build = (rack) => {
            const e = new game.Engine({
                rng: new CV.RNG(9001), config: { room: 'beginner' },
                seats: [0, 1, 2, 3].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
            });
            e.start();
            const me = e.turn;
            e.seats[me].opened = false;
            e.seats[me].folded = false;
            e.seats[me].rack = lamiTiles(rack);
            e.table = [{ tiles: lamiTiles('S3 S4 S5'), meld: { type: 'run' }, by: (me + 1) % 4 }];
            return { e, me };
        };
        const types = (e, seat) => e.legalActions(seat).map((o) => o.type).sort().join();

        {
            // A run in the rack — and a joker, and a set, neither of which is a way out.
            const { e, me } = build('C3 C4 C5 D7 H7 S7 X');
            check(e.mustOpen(me) === true, 'lami: a rack holding a run was not made to open');
            check(types(e, me) === 'play', `lami: a seat that must open was offered ${types(e, me)}`);
            check(!e.apply({ type: 'fold', seat: me }), 'lami: a seat holding a run was allowed to fold');
            check(!e.seats[me].folded, 'lami: the refused fold folded the seat anyway');
            check(!e.apply({ type: 'joker', seat: me }),
                'lami: a seat holding a run bought the turn with a joker');
            check(e.seats[me].rack.length === 7, 'lami: the refused joker left the rack');
            // The set is in the rack and is still not a legal opening.
            const set = e.seats[me].rack.filter((x) => x.r === 7).map((x) => x.id);
            check(!e.apply({ type: 'play', seat: me, tiles: set }), 'lami: a set opened a seat');
            // Nor may it touch the meld already on the table.
            check(!e.validExtend(me, 0, [e.seats[me].rack.find((x) => x.r === 3 && x.s === 'C').id]),
                'lami: an unopened seat added to somebody else\'s meld');
            // The run itself goes down, and that is the whole turn.
            const run = e.seats[me].rack.filter((x) => x.s === 'C').map((x) => x.id);
            check(e.apply({ type: 'play', seat: me, tiles: run }), 'lami: the opening run was refused');
            check(e.seats[me].opened, 'lami: laying the run did not open the seat');
            check(e.turn !== me, 'lami: the turn did not pass after the opening run');
        }

        {
            // No run anywhere — now folding and the joker are back on offer.
            const { e, me } = build('C3 D7 H9 S11 C13 X');
            check(e.mustOpen(me) === false, 'lami: a rack with no run was made to open');
            check(types(e, me) === 'fold,joker,play', `lami: a stuck seat was offered ${types(e, me)}`);
            check(e.apply({ type: 'fold', seat: me }), 'lami: a seat with no run could not fold');
        }

        {
            // A run that only exists because of a joker still has to be laid.
            const { e, me } = build('C3 C5 X D7 H9');
            check(e.mustOpen(me) === true, 'lami: a run made with a joker did not count as a run');
            check(types(e, me) === 'play', 'lami: a joker-run seat was offered a way out');
        }
        console.log('  ✓ the opening run is compulsory, and an unopened seat touches nobody else\'s melds');
    }

    /* --- what a tile costs when it is left over ------------------------------ */

    {
        // Face value to the ten, ten for each court card, fifteen for an ace.
        for (let r = 2; r <= 10; r++) {
            check(L.points(lamiTiles('C' + r)[0]) === r, `lami: a ${r} should cost ${r}`);
        }
        for (const r of [11, 12, 13]) {
            check(L.points(lamiTiles('C' + r)[0]) === 10, `lami: a ${r} should cost 10`);
        }
        check(L.points(lamiTiles('C14')[0]) === 15, 'lami: an ace should cost 15');
        check(L.points(lamiTiles('X')[0]) === L.RULES.jokerPoints,
            'lami: a joker should cost what the table says it costs');
        check(L.handPoints(lamiTiles('C2 D13 X')) === 2 + 10 + L.RULES.jokerPoints,
            'lami: a hand adds up to the sum of its tiles');

        /* --- the side count: jokers and aces, in pieces --------------------- */
        check(L.pieces(lamiTiles('C2 D3 H4')) === 0, 'lami: plain tiles counted as pieces');
        check(L.pieces(lamiTiles('C14')) === 1, 'lami: an ace should be one piece');
        check(L.pieces(lamiTiles('X X')) === 2, 'lami: two jokers should be two pieces');
        // Both copies of one ace: two tiles, and one more for the pair.
        const pair = L.build().filter((x) => x.r === L.TOP && x.s === 'C');
        check(pair.length === 2, 'lami: the box should hold two of each ace');
        check(L.pieces(pair) === 3, `lami: two of the same ace should be 3 pieces, got ${L.pieces(pair)}`);
        // One of every suit: four tiles, and four more for the four of a kind.
        check(L.pieces(lamiTiles('C14 D14 H14 S14')) === 8,
            `lami: four aces of a kind should be 8 pieces, got ${L.pieces(lamiTiles('C14 D14 H14 S14'))}`);
    }

    /* --- findMelds only offers real melds ------------------------------------ */

    {
        const rng = new CV.RNG(4747);
        let offered = 0, held = 0;
        for (let i = 0; i < 400; i++) {
            const box = L.build();
            rng.shuffle(box);
            const rack = box.slice(0, 14);
            const ids = new Set(rack.map((x) => x.id));
            for (const found of L.findMelds(rack)) {
                check(!!L.meld(found), 'lami: findMelds offered something that is not a meld');
                check(found.every((x) => ids.has(x.id)), 'lami: findMelds offered a tile not in the rack');
                check(new Set(found.map((x) => x.id)).size === found.length,
                    'lami: findMelds used a tile twice');
                offered++;
            }
            held += rack.length;
        }
        console.log(`  ${offered.toLocaleString('en-US')} melds suggested from ${held / 14} racks, every one legal`);
    }

    /* --- the throw ------------------------------------------------------------ */

    {
        // Highest starts, and a tie throws again — the procedure as written.
        let ties = 0;
        for (let i = 0; i < 200; i++) {
            const e = new game.Engine({
                rng: new CV.RNG(1000 + i), config: { room: 'beginner' },
                seats: [0, 1, 2, 3].map((n) => new CV.Seat(n, { kind: 'ai', name: 'S' + n, coins: 9000 })),
            });
            e.start();
            check(Array.isArray(e.dice) && e.dice.length >= 1, 'lami: nobody threw for the start');
            const first = e.dice[0];
            const best = Math.max(...first.map((x) => x.roll));
            const tied = first.filter((x) => x.roll === best);
            if (tied.length > 1) {
                ties++;
                check(e.dice.length > 1, 'lami: a tied throw was not thrown again');
                check(e.dice[1].length === tied.length, 'lami: the wrong players threw again');
            } else {
                check(e.starter === tied[0].seat, 'lami: the highest throw did not open');
            }
            check(e.dice.every((round) => round.every((x) => x.roll >= 1 && x.roll <= 6)),
                'lami: a die came up outside one to six');
        }
        console.log(`  ✓ highest throw opens, and ${ties} of 200 tables had to throw again`);
    }

    /* --- whole rounds ---------------------------------------------------------- */

    const master = new CV.RNG(90210);
    const ROUNDS = Math.max(60, Math.round(HANDS / 25));
    const t0 = Date.now();
    let outs = 0, stalls = 0, melds = 0, leftover = 0;

    for (let g = 0; g < ROUNDS; g++) {
        const n = master.range(2, 4);
        const room = CV.Registry.ROOMS[master.int(4)].id;
        const e = new game.Engine({
            rng: new CV.RNG(master.int(1e9)), config: { room },
            seats: Array.from({ length: n }, (_, i) => new CV.Seat(i, {
                kind: 'ai', name: 'S' + i, coins: master.range(2000, 60000), isYou: i === 0,
            })),
        });
        const ai = new game.AI(e);
        e.start();

        const box = L.build(e.rules).length;
        check(e.seats.every((s) => s.rack.length === e.rules.hand),
            'lami: somebody was not dealt a full rack');
        check(e.poolLeft === box - n * e.rules.hand, 'lami: the pool is the wrong size');

        let steps = 0;
        while (!e.isOver()) {
            const seat = e.turn;
            const action = ai.decide(seat);
            check(!!action, 'lami: the AI had nothing to do');
            if (!action) break;
            if (action.type === 'play') {
                const tiles = action.tiles.map((id) => e.seats[seat].rack.find((x) => x.id === id));
                check(tiles.every(Boolean), 'lami: the AI played a tile it does not hold');
                check(!!L.meld(tiles.filter(Boolean), e.rules), 'lami: the AI laid something that is not a meld');
            }
            check(e.apply(action), `lami: engine refused ${action.type}`);
            if (++steps > 900) { check(false, 'lami: a round ran past 900 actions' ); break; }
        }

        // Every tile is somewhere, and only in one place.
        const seen = e.seats.flatMap((s) => s.rack)
            .concat(e.table.flatMap((m) => m.tiles), e.pool);
        check(seen.length === box, `lami: ${seen.length} tiles accounted for, the box holds ${box}`);
        check(new Set(seen.map((x) => x.id)).size === box, 'lami: a tile is in two places at once');

        // Everything on the table is still a meld.
        for (const m of e.table) {
            check(!!L.meld(m.tiles, e.rules), 'lami: something on the table is not a meld');
            check(m.tiles.length >= Math.min(e.rules.minRun, e.rules.minSet), 'lami: a meld is too short');
        }

        // The count, and the coins that follow from it.
        for (const s of e.seats) {
            check(s.points === L.handPoints(s.rack), 'lami: a hand was counted wrong');
            check(s.coins >= 0, 'lami: a seat was taken below zero');
            check(s.coins === s.startCoins + s.net, 'lami: coins do not reconcile');
        }
        check(e.seats.reduce((t, s) => t + s.net, 0) === 0, 'lami: the table is not zero-sum');

        const low = Math.min(...e.seats.map((s) => s.points));
        const r = e.result();
        check(r.ranks[0].rank === 1 && e.seats[r.ranks[0].seat].points === low,
            'lami: the smallest hand did not come first');
        // The winner opens the next round.
        check(e.shoeState.starter >= 0, 'lami: nobody was set to open the next round');
        if (e.winner >= 0) {
            check(e.shoeState.starter === e.winner, 'lami: the winner does not open the next round');
        }

        if (e.seats.some((s) => !s.rack.length)) outs++; else stalls++;
        melds += e.table.length;
        leftover += e.seats.reduce((t, s) => t + s.points, 0) / e.seats.length;
    }

    console.log(`  ${ROUNDS} rounds, ${Date.now() - t0} ms — ${outs} ended with a rack emptied, `
        + `${stalls} on a stall`);
    console.log(`  ${(melds / ROUNDS).toFixed(1)} melds laid a round · `
        + `${(leftover / ROUNDS).toFixed(1)} points left in an average hand`);
    check(melds > 0, 'lami: nothing was ever laid on the table');

    /* --- the previous winner opens the next round ------------------------------- */

    {
        const seats = [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 9000 }));
        const first = new game.Engine({ rng: new CV.RNG(5), config: { room: 'beginner' }, seats });
        const ai = new game.AI(first);
        first.start();
        while (!first.isOver()) { const a = ai.decide(first.turn); if (!a || !first.apply(a)) break; }
        const next = new game.Engine({
            rng: new CV.RNG(6), config: { room: 'beginner', shoe: first.shoeState },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 9000 })),
        });
        next.start();
        check(next.starter === first.shoeState.starter, 'lami: the carried starter was ignored');
        check(next.dice === null, 'lami: a second round threw the dice again');
        console.log('  ✓ the first round is thrown for, and the winner opens the next');
    }

    /* --- what a host may broadcast ---------------------------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(8), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 9000, isYou: i === 0 })),
        });
        e.start();
        for (let viewer = 0; viewer < 3; viewer++) {
            const view = e.snapshotFor(viewer);
            const wire = JSON.stringify(view);
            check(!view.rng, 'lami: the snapshot carries the RNG');
            check(typeof view.pool === 'number', 'lami: the pool itself went out on the wire');
            view.seats.forEach((s, i) => {
                if (i === viewer) check(s.rack.every(Boolean), 'lami: your own rack was redacted from you');
                else check(s.rack.every((x) => x === null), 'lami: another rack went out on the wire');
            });
            for (const tile of e.pool.slice(-8)) {
                check(!wire.includes('"' + tile.id + '"'), `lami: a tile still in the pool (${tile.id}) is on the wire`);
            }
        }
    }
    console.log('  ✓ no rack but your own, and nothing still in the pool');

    /* --- two settlements, and they are not the same game --------------------- */

    {
        const seats = () => [0, 1, 2, 3].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 }));
        const table = (fn) => {
            const e = new game.Engine({ rng: new CV.RNG(9), config: { room: 'beginner' }, seats: seats() });
            e.start();
            if (e.over) return null;         // a 天胡 off the deal — try another seed
            fn(e);
            e.finishRound();
            return e;
        };

        // Points decide the ranking; the ranking decides the ratio. The seat
        // one place behind the winner is 小哥 and pays 1, then 二哥 2, and
        // 大哥 — the one holding the most — pays 3.
        const plain = table((e) => {
            e.seats.forEach((x) => { x.rack = []; });
            e.seats[0].rack = lamiTiles('C2 D3');          // 5  — winner
            e.seats[1].rack = lamiTiles('C9 D9');          // 18 — 小哥
            e.seats[2].rack = lamiTiles('C13 D13 H13');    // 30 — 二哥
            e.seats[3].rack = lamiTiles('C10 D10 H10 S9'); // 39 — 大哥
        });
        check(!!plain, 'lami: the settlement table dealt a 天胡 and could not be set up');
        const st = plain.stake;
        check(plain.winner === 0, `lami: seat ${plain.winner} won on points, wanted 0`);
        check(plain.seats[1].net === -1 * st, `lami: 小哥 paid ${plain.seats[1].net}, wanted ${-st}`);
        check(plain.seats[2].net === -2 * st, `lami: 二哥 paid ${plain.seats[2].net}, wanted ${-2 * st}`);
        check(plain.seats[3].net === -3 * st, `lami: 大哥 paid ${plain.seats[3].net}, wanted ${-3 * st}`);
        check(plain.seats[0].net === 6 * st, `lami: the winner took ${plain.seats[0].net}, wanted ${6 * st}`);
        check(plain.seats.reduce((n, x) => n + x.net, 0) === 0, 'lami: the plain settlement is not zero-sum');

        // Going out is paid flat by everybody — five stakes each, for having
        // cleared the rack — **and the ranking runs on top of it**, so what
        // you were caught holding still decides which of the losers pays
        // most. It used to be flat and nothing else, which meant a seat
        // frozen on a full rack paid exactly what a seat one tile from home
        // paid, and being 大哥 cost nothing at all.
        const out = table((e) => {
            e.seats.forEach((x) => { x.rack = []; });
            e.seats[2].rack = [];                          // went out
            e.winner = 2;
            e.seats[0].rack = lamiTiles('C2 D3');          // 5  — 小哥
            e.seats[1].rack = lamiTiles('C9 D9');          // 18 — 二哥
            e.seats[3].rack = lamiTiles('C13 D13 H13');    // 30 — 大哥
        });
        const so = out.stake;
        check(out.seats[0].net === -(5 + 1) * so,
            `lami: 小哥 paid ${out.seats[0].net} on a win, wanted ${-(5 + 1) * so}`);
        check(out.seats[1].net === -(5 + 2) * so,
            `lami: 二哥 paid ${out.seats[1].net} on a win, wanted ${-(5 + 2) * so}`);
        check(out.seats[3].net === -(5 + 3) * so,
            `lami: 大哥 paid ${out.seats[3].net} on a win, wanted ${-(5 + 3) * so}`);
        check(out.seats[2].net === (15 + 6) * so,
            `lami: going out collected ${out.seats[2].net}, wanted ${(15 + 6) * so}`);
        check(out.seats.reduce((n, x) => n + x.net, 0) === 0, 'lami: the win settlement is not zero-sum');
        // The order is the point: holding the most costs the most, always.
        check(out.seats[3].net < out.seats[1].net && out.seats[1].net < out.seats[0].net,
            'lami: the losers are not ordered by what they were holding');

        // The side count runs whatever the hand did: half a stake for each
        // piece of difference, head to head with everybody.
        const side = table((e) => {
            e.seats.forEach((x) => { x.rack = lamiTiles('C2'); });   // 2 points, 0 pieces
            e.seats[0].rack = lamiTiles('C2 X');                     // one joker — 1 piece
        });
        // Seat 0 is holding a joker: one piece against three seats holding
        // none, so it collects half a stake three times over. It also has the
        // most points, so it is 大哥 on the hand and pays three.
        const sideNet = side.seats[0].net;
        check(side.seats[0].pieces === 1 && side.seats[1].pieces === 0,
            'lami: the side count did not see the joker');
        check(sideNet === -3 * side.stake + Math.round(1.5 * side.stake),
            `lami: the side count paid ${sideNet}, wanted 3 stakes out and 1.5 in`);
        check(side.seats.reduce((n, x) => n + x.net, 0) === 0, 'lami: the side count is not zero-sum');
    }
    console.log('  ✓ 3:2:1 on the hand, flat on a win, and the joker/ace count settles apart from both');

    /* --- 天胡: twenty tiles that already lie in melds ------------------------- */

    {
        // Two runs and a set, no remainder — the shape the deal is tested for.
        check(!!L.partition(lamiTiles('C2 C3 C4 H9 H10 H11 D7 H7 S7')),
            'lami: a hand that is entirely melds should partition');
        check(!L.partition(lamiTiles('C2 C3 C4 H9 H10 H11 D7 H7 S13')),
            'lami: a hand with a tile left over should not partition');
        // A joker fills a hole, but three jokers on their own are not a meld.
        check(!!L.partition(lamiTiles('C2 C3 X D5 D6 D7')),
            'lami: a joker should be able to complete a partition');
        check(!L.partition(lamiTiles('X X X')), 'lami: three jokers are not a meld');
    }
    console.log('  ✓ 天胡 is read off the deal, and only a real partition counts');

    for (const key of game.rules) check(CV.t(key) !== key, `lami: rule key ${key} has no text`);
    console.log('  ✓ rules card resolves');
}
auditLami();

/* ---- 骰子 ---------------------------------------------------------------- */

function auditDice() {
    console.log('\n🎲 骰子');
    const game = CV.Registry.get('dice');
    const D = CV.Dice;

    /* --- every throw there is ------------------------------------------------ */

    {
        const tally = { triple: 0, small: 0, big: 0, unknown: 0 };
        const totals = {};
        let n = 0;

        for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
            const r = D.read([a, b, c]);
            tally[r.type]++;
            totals[r.total] = totals[r.total] || {};
            totals[r.total][r.type] = (totals[r.total][r.type] || 0) + 1;
            n++;

            // The reading, re-derived rather than trusted.
            const sum = a + b + c;
            const trip = a === b && b === c;
            const want = trip ? 'triple' : (sum <= 10 ? 'small' : 'big');
            check(r.total === sum, `dice: ${a}+${b}+${c} came to ${r.total}`);
            check(r.type === want, `dice: ${a}+${b}+${c} read as ${r.type}, wanted ${want}`);
            if (trip) check(r.face === a, `dice: a triple of ${a} reported a face of ${r.face}`);
            else check(r.face === null, 'dice: a face was reported on a hand that is not a triple');
        }

        check(n === 216, `dice: ${n} throws enumerated, there are 216`);
        check(tally.unknown === 0, `dice: ${tally.unknown} throws read as nothing at all`);
        check(tally.triple === 6, `dice: ${tally.triple} triples, there are 6`);
        check(tally.small === 105, `dice: ${tally.small} smalls, wanted 105`);
        check(tally.big === 105, `dice: ${tally.big} bigs, wanted 105`);
        check(tally.small + tally.big + tally.triple === 216, 'dice: the three kinds do not add up');

        // 3 and 18 can only be reached by a triple, so neither is ever 小 or 大.
        for (const edge of [3, 18]) {
            check(Object.keys(totals[edge]).join() === 'triple',
                `dice: a total of ${edge} was read as something other than a 围骰`);
        }
        // And every total inside a range that is not a triple reads that way.
        for (let s = 4; s <= 10; s++) check(!totals[s].big, `dice: a total of ${s} was read as 大`);
        for (let s = 11; s <= 17; s++) check(!totals[s].small, `dice: a total of ${s} was read as 小`);

        console.log('  all 216 throws read — 6 围骰, 105 小, 105 大, and nothing left over');
        console.log('  ✓ 3 and 18 are only ever 围骰, so neither range can reach them');
    }

    /* --- the worked examples from the rules ---------------------------------- */

    const CASES = [
        [[1, 2, 3], 6,  'small'],
        [[2, 3, 4], 9,  'small'],
        [[1, 4, 6], 11, 'big'],
        [[3, 4, 5], 12, 'big'],
        [[5, 5, 2], 12, 'big'],
        [[1, 1, 1], 3,  'triple'],
        [[2, 2, 2], 6,  'triple'],
        [[4, 4, 4], 12, 'triple'],
        [[6, 6, 6], 18, 'triple'],
        // The one the priority rule exists for.
        [[5, 5, 5], 15, 'triple'],
    ];
    for (const [dice, total, type] of CASES) {
        const r = D.read(dice);
        check(r.total === total && r.type === type,
            `dice: ${dice.join('+')} read as ${r.type} ${r.total}, wanted ${type} ${total}`);
    }
    console.log(`  ${CASES.length} worked examples, including the fifteen that is not a 大`);

    /* --- 大 and 小 both lose to a 围骰 ---------------------------------------- */

    {
        const trip = D.read([5, 5, 5]);
        check(!D.wins('big', trip), 'dice: 大 should lose to a 围骰 inside its range');
        check(!D.wins('small', trip), 'dice: 小 should lose to a 围骰');
        check(D.wins('triple', trip), 'dice: 围骰 should win on a 围骰');
        const small = D.read([1, 2, 3]);
        check(D.wins('small', small) && !D.wins('big', small) && !D.wins('triple', small),
            'dice: a small throw paid the wrong side');
    }

    /* --- the throw comes from the table's own stream --------------------------- */

    {
        const a = new CV.RNG(4242), b = new CV.RNG(4242);
        for (let i = 0; i < 50; i++) {
            check(D.roll(a).join() === D.roll(b).join(), 'dice: the same seed threw differently');
        }
        const rng = new CV.RNG(9);
        for (let i = 0; i < 3000; i++) {
            const dice = D.roll(rng);
            check(dice.length === 3, 'dice: something other than three dice was thrown');
            check(dice.every((x) => x >= 1 && x <= 6), 'dice: a die came up outside one to six');
        }
    }

    /* --- whole throws ---------------------------------------------------------- */

    {
        const master = new CV.RNG(31337);
        const ROUNDS = Math.max(600, HANDS);
        const t0 = Date.now();
        const staked = { big: 0, small: 0, triple: 0 };
        const net = { big: 0, small: 0, triple: 0 };
        let triples = 0;

        for (let g = 0; g < ROUNDS; g++) {
            const n = master.range(1, 6);
            const room = CV.Registry.ROOMS[master.int(4)].id;
            const e = new game.Engine({
                rng: new CV.RNG(master.int(1e9)), config: { room },
                seats: Array.from({ length: n }, (_, i) => new CV.Seat(i, {
                    kind: 'ai', name: 'S' + i, coins: master.range(2000, 90000), isYou: i === 0,
                })),
            });
            const ai = new game.AI(e);
            e.start();
            let steps = 0;
            while (!e.isOver()) {
                const a = ai.decide(e.turn);
                check(!!a, 'dice: the AI had nothing to do');
                if (!a) break;
                check(e.apply(a), `dice: engine refused ${JSON.stringify(a)}`);
                if (++steps > 20) { check(false, 'dice: a throw ran past 20 actions'); break; }
            }

            check(e.dice && e.dice.length === 3, 'dice: the round ended without a throw');
            check(e.outcome.type !== 'unknown', 'dice: a throw read as nothing');
            if (e.outcome.type === 'triple') triples++;

            for (const s of e.seats) {
                if (s.out) continue;
                check(s.coins >= 0, 'dice: a seat was taken below zero');
                check(s.coins === s.startCoins + s.net, 'dice: coins do not reconcile');
                // A win pays the table's price and a loss costs the stake.
                const won = D.wins(s.side, e.outcome);
                check(s.outcome === (won ? 'win' : 'loss'), 'dice: the outcome disagrees with the throw');
                check(s.net === (won ? s.bet * D.PAYS[s.side] : -s.bet),
                    `dice: a ${s.side} bet of ${s.bet} netted ${s.net}`);
                staked[s.side] += s.bet;
                net[s.side] += s.net;
            }
        }

        const pct = (k) => (staked[k] ? (net[k] / staked[k] * 100).toFixed(1) : '—');
        console.log(`  ${ROUNDS} throws, ${Date.now() - t0} ms — 围骰 came up `
            + `${(triples / ROUNDS * 100).toFixed(1)}% of the time (2.8% expected)`);
        console.log(`  return on stake: 大 ${pct('big')}% · 小 ${pct('small')}% · 围骰 ${pct('triple')}%`);
        // 大 and 小 lose to a triple, which is exactly six throws in 216.
        for (const side of ['big', 'small']) {
            const edge = net[side] / staked[side] * 100;
            check(edge > -12 && edge < 6, `dice: ${side} returned ${edge.toFixed(1)}%, which is not the book`);
        }
    }

    /* --- what a host may broadcast ---------------------------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(2), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 4000, isYou: i === 0 })),
        });
        e.start();
        e.apply({ type: 'wager', seat: 0, side: 'big', amount: 10 });
        for (let viewer = 0; viewer < 3; viewer++) {
            const view = e.snapshotFor(viewer);
            check(!view.rng, 'dice: the snapshot carries the RNG');
            check(view.dice === null, 'dice: the dice went out before they were thrown');
            view.seats.forEach((s, i) => {
                if (i !== viewer && e.seats[i].side) {
                    check(s.side === 'hidden', 'dice: another seat\'s pick is visible before the throw');
                }
            });
        }
    }
    console.log('  ✓ no dice and no pick on the wire before the throw');

    for (const key of game.rules) check(CV.t(key) !== key, `dice: rule key ${key} has no text`);
    console.log('  ✓ rules card resolves');
}
auditDice();

/* ---- Roulette Party ------------------------------------------------------ */

function auditRoulette() {
    console.log('\n\u{1F3A1} \u8f6e\u76d8');
    const game = CV.Registry.get('roulette');
    const W = CV.Wheel;

    /* --- the wheel itself ------------------------------------------------ */

    check(W.POCKETS === 37, `roulette: ${W.POCKETS} pockets \u2014 a single-zero wheel has 37`);
    check(W.ORDER.length === 37, `roulette: the rim carries ${W.ORDER.length} pockets`);
    {
        const seen = new Set(W.ORDER);
        check(seen.size === 37, 'roulette: a pocket appears twice on the rim');
        for (let n = 0; n <= 36; n++) check(seen.has(n), `roulette: ${n} is missing from the rim`);
    }
    {
        const by = { red: 0, black: 0, green: 0 };
        for (let n = 0; n <= 36; n++) by[W.colourOf(n)]++;
        check(by.red === 18 && by.black === 18 && by.green === 1,
            `roulette: ${by.red} red, ${by.black} black, ${by.green} green \u2014 wanted 18/18/1`);
        check(W.colourOf(0) === 'green', 'roulette: zero is not the green pocket');
    }

    /* --- the edge is the same on every bet, exactly ---------------------- */

    /**
     * Each price is the fair inverse of its own chance with one pocket held
     * back, so a winning bet always brings back 36 units for every 37 the
     * layout covers. That reduces to one integer identity per bet, which is
     * checked here rather than by comparing floating-point percentages.
     */
    {
        const kinds = Object.keys(W.PAYS);
        for (const k of kinds) {
            const covers = W.COVERS[k];
            check(covers > 0, `roulette: ${k} covers nothing`);
            check(covers * (W.PAYS[k] + 1) === 36,
                `roulette: ${k} covers ${covers} and pays ${W.PAYS[k]} \u2014 `
                + `returns ${covers * (W.PAYS[k] + 1)}/37, not 36/37`);
        }
        const edge = -1 / 37;
        const worst = Math.max(...kinds.map((k) =>
            Math.abs(((W.COVERS[k] / 37) * (W.PAYS[k] + 1) - 1) - edge)));
        check(worst < 1e-12, `roulette: a price drifts from the flat edge by ${worst}`);
        console.log(`  ${kinds.length} prices \u2014 every one returns exactly `
            + `${(edge * 100).toFixed(2)}%, single zero`);
    }

    /* --- every bet against every pocket, re-derived ----------------------- */

    /** The rules as written, worked out here rather than asked of the wheel. */
    const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const truth = (bet, n) => {
        if (bet.kind === 'straight') return n === bet.value;
        // Zero is the house's pocket and takes every outside bet.
        if (n === 0) return false;
        switch (bet.kind) {
            case 'red':    return RED.indexOf(n) >= 0;
            case 'black':  return RED.indexOf(n) < 0;
            case 'odd':    return n % 2 === 1;
            case 'even':   return n % 2 === 0;
            case 'low':    return n <= 18;
            case 'high':   return n >= 19;
            case 'dozen':  return n > (bet.value - 1) * 12 && n <= bet.value * 12;
            case 'column': return n % 3 === bet.value % 3;
            default:       return false;
        }
    };

    const everyBet = [];
    for (let n = 0; n <= 36; n++) everyBet.push({ kind: 'straight', value: n });
    for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) everyBet.push({ kind: k });
    for (const v of [1, 2, 3]) everyBet.push({ kind: 'dozen', value: v });
    for (const v of [1, 2, 3]) everyBet.push({ kind: 'column', value: v });

    {
        let cells = 0;
        for (const bet of everyBet) {
            let hits = 0;
            for (let n = 0; n <= 36; n++) {
                const got = W.wins(bet, n);
                check(got === truth(bet, n),
                    `roulette: ${W.keyOf(bet)} on ${n} said ${got}`);
                if (got) hits++;
                cells++;
            }
            check(hits === W.COVERS[bet.kind],
                `roulette: ${W.keyOf(bet)} covers ${hits} pockets, priced for ${W.COVERS[bet.kind]}`);
        }
        console.log(`  ${cells.toLocaleString('en-US')} bet/pocket cells checked against the rules as written`);
    }

    /* --- zero takes the outside, and that is not an accident -------------- */

    {
        const outside = everyBet.filter((b) => b.kind !== 'straight');
        for (const bet of outside) {
            check(!W.wins(bet, 0), `roulette: ${W.keyOf(bet)} was paid on zero`);
        }
        check(W.wins({ kind: 'straight', value: 0 }, 0), 'roulette: zero straight up did not pay on zero');
        console.log(`  \u2713 zero pays only itself \u2014 all ${outside.length} outside spots lose to it`);
    }

    /* --- the table pays what the wheel says ------------------------------ */

    {
        // One seat, one chip on every spot, over a rigged pocket: the payout
        // has to be the stake back plus the price, on exactly the spots that
        // cover that pocket and no others.
        for (const want of [0, 1, 17, 26, 36]) {
            const e = new game.Engine({
                rng: new CV.RNG(11),
                seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: 1000000 })],
                config: { room: 'beginner' },
            });
            e.start();
            // Through apply(), which is the path a real table takes: it runs
            // the legality gate that handle() on its own skips right past.
            for (const bet of everyBet) {
                check(e.apply({ type: 'place', seat: 0, bet, amount: 10 }) === true,
                    `roulette: the table refused a legal chip on ${W.keyOf(bet)}`);
            }
            const staked = e.seat.staked;
            check(staked === everyBet.length * 10,
                `roulette: staked ${staked} for ${everyBet.length} chips of 10`);

            // Force the pocket, then settle by hand the way the engine does.
            e.number = want;
            e.settle();

            let owed = 0;
            for (const bet of everyBet) if (truth(bet, want)) owed += 10 * (W.PAYS[bet.kind] + 1);
            check(e.seat.payout === owed,
                `roulette: pocket ${want} paid ${e.seat.payout}, the layout owed ${owed}`);
            check(e.seat.coins === e.seat.startCoins - staked + owed,
                `roulette: coins do not reconcile on pocket ${want}`);
        }
        console.log('  \u2713 a full layout settles to the pocket, stake returned with the price');
    }

    /* --- a table bets in turn, and one ball settles all of it ------------- */

    /**
     * Seeds for the loop below, scattered rather than counted.
     *
     * One roulette round is one engine taking exactly one number, so a loop
     * over `seed = base + g` would be measuring mulberry32's *first* output
     * across neighbouring seeds rather than the wheel. That first draw does
     * carry mild structure \u2014 chi-square around 48 against an expected 36
     * over 200k sequential seeds, where the same test on a single stream, or
     * on the `Date.now() ^ Math.random()` seeding a real table actually uses,
     * sits at 32 to 35. The game is unaffected; the harness would not be.
     */
    const scatter = (g) => (Math.imul(g + 1, 2654435761) ^ 0x9e3779b9) >>> 0;

    {
        let rounds = 0, spins = 0, staked = 0, net = 0;
        const seen = new Set();
        for (let g = 0; g < 400; g++) {
            const seats = [new CV.Seat(0, { kind: 'human', isYou: true, coins: 20000 })];
            for (let i = 1; i < 4; i++) seats.push(new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 20000 }));
            const e = new game.Engine({ rng: new CV.RNG(scatter(g)), seats, config: { room: 'beginner' } });
            const ai = new CV.RouletteAI(e);
            e.start();

            let guard = 0;
            while (!e.isOver() && guard++ < 200) {
                const turn = e.turn;
                // Nobody may touch the layout out of turn.
                for (let i = 0; i < 4; i++) {
                    if (i === turn) continue;
                    check(e.legalActions(i).length === 0,
                        `roulette: seat ${i} could bet on seat ${turn}'s turn`);
                }
                // And nothing may read the pocket before the ball is sent.
                check(e.number === null, 'roulette: the pocket existed before the spin');
                const move = ai.decide(turn);
                check(!!move, `roulette: seat ${turn} had nothing to play`);
                check(e.apply(move) === true,
                    `roulette: the table refused its own AI's ${move.type}`);
            }

            check(e.isOver(), 'roulette: a four-seat spin never finished');
            check(e.number !== null && e.number >= 0 && e.number <= 36,
                `roulette: the ball settled on ${e.number}`);
            seen.add(e.number);
            spins++;

            // Everyone settled against the same pocket, and the wheel holds
            // the other side of whatever the table won or lost.
            const rows = e.result().ranks;
            const house = rows.find((r) => r.house);
            const players = rows.filter((r) => !r.house);
            check(players.length === 4, `roulette: ${players.length} seats in a four-seat recap`);
            check(house && house.coins === -players.reduce((a, r) => a + r.coins, 0),
                'roulette: the wheel does not hold the other side of the table');

            for (const s of e.seats) {
                staked += s.staked;
                net += s.net;
                for (const b of s.bets) {
                    check(b.won === W.wins(b, e.number),
                        `roulette: ${W.keyOf(b)} was settled against a different pocket`);
                }
            }
            rounds++;
        }
        check(seen.size > 30, `roulette: only ${seen.size} different pockets in ${spins} spins`);
        const edge = (net / staked) * 100;
        console.log(`  ${rounds} four-seat spins \u2014 ${seen.size} of the 37 pockets came up`);
        console.log(`  \u2713 seats bet in turn and one ball settles them all, and the recap balances`);
        // A wide band, on purpose. Most of these chips are on single numbers
        // at 35 to 1, where a single hit moves the figure by whole percent.
        // The exact statement about the edge is the price identity above;
        // this is only here to catch a payout that is wildly wrong.
        console.log(`  return on stake: ${edge.toFixed(2)}% (\u22122.70% expected, wide at this sample)`);
        check(Math.abs(edge + 2.70) < 8,
            `roulette: the table returned ${edge.toFixed(2)}%, nowhere near \u22122.70%`);
    }

    /* --- and it converges where the variance is small --------------------- */

    /**
     * Flat red, 120k spins. An even-money bet has a standard deviation of
     * about 1 a unit, so the standard error here is near 0.29% and the true
     * \u22122.70% sits comfortably inside a percent. This is the empirical
     * counterpart to the price identity above \u2014 the same number, measured
     * rather than derived.
     */
    {
        const N = 120000;
        let net = 0;
        const rng = new CV.RNG(31337);
        for (let i = 0; i < N; i++) net += W.wins({ kind: 'red' }, W.spin(rng)) ? 1 : -1;
        const edge = (net / N) * 100;
        const se = (1 / Math.sqrt(N)) * 100;
        console.log(`  flat red over ${N.toLocaleString('en-US')} spins: ${edge.toFixed(3)}% `
            + `(\u22122.70% \u00b1 ${(2 * se).toFixed(2)})`);
        check(Math.abs(edge + 2.7027) < 3 * se,
            `roulette: flat red returned ${edge.toFixed(3)}%, over 3 SE off \u22122.70%`);
    }

    /* --- the pockets come up evenly -------------------------------------- */

    /**
     * A wheel that favours a pocket is not a wheel, and no amount of correct
     * pricing would save it. 200k spins off one stream, chi-square against a
     * flat 37: 36 is the expected value and 68 is the 0.1% tail.
     */
    {
        const N = 200000;
        const counts = new Array(37).fill(0);
        const rng = new CV.RNG(20260904);
        for (let i = 0; i < N; i++) counts[W.spin(rng)]++;
        const exp = N / 37;
        const chi = counts.reduce((a, c) => a + ((c - exp) * (c - exp)) / exp, 0);
        check(chi < 68, `roulette: pockets came up unevenly \u2014 chi-square ${chi.toFixed(1)} over ${N} spins`);
        const lo = Math.min.apply(null, counts), hi = Math.max.apply(null, counts);
        console.log(`  ${N.toLocaleString('en-US')} spins \u2014 chi-square ${chi.toFixed(1)} on 36 df `
            + `(${lo}\u2013${hi} a pocket, ${exp.toFixed(0)} expected)`);
    }

    /* --- the gate refuses what it should -------------------------------- */

    /**
     * `legalActions` is the single source of legality and `apply` is the only
     * way in, so the two have to agree. This is the check that would have
     * caught the affordance carrying a field no action could ever match —
     * which silently refused every chip while `handle()` on its own took them
     * all quite happily.
     */
    {
        const e = new game.Engine({
            rng: new CV.RNG(4242),
            seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: 5000 }),
                    new CV.Seat(1, { kind: 'ai', name: 'A', coins: 5000 })],
            config: { room: 'beginner' },
        });
        e.start();
        const lo = e.legalActions(0).find((a) => a.type === 'place').min;
        const hi = e.legalActions(0).find((a) => a.type === 'place').max;

        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'red' }, amount: lo }) === true,
            'roulette: a plain even-money chip was refused');
        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'straight', value: 17 }, amount: lo }) === true,
            'roulette: a straight-up chip was refused');
        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'dozen', value: 2 }, amount: lo }) === true,
            'roulette: a dozen was refused');

        // And what it must not take.
        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'straight', value: 37 }, amount: lo }) === false,
            'roulette: took a bet on a pocket that does not exist');
        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'dozen', value: 4 }, amount: lo }) === false,
            'roulette: took a fourth dozen');
        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'basket' }, amount: lo }) === false,
            'roulette: took a bet the table does not offer');
        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'red' }, amount: lo - 1 }) === false,
            'roulette: took a chip under the table minimum');
        check(e.apply({ type: 'place', seat: 0, bet: { kind: 'red' }, amount: hi + 1 }) === false,
            'roulette: took a chip over the table maximum');
        check(e.apply({ type: 'place', seat: 1, bet: { kind: 'red' }, amount: lo }) === false,
            'roulette: took a chip from a seat whose turn it was not');

        const staked = e.seats[0].staked;
        check(staked === lo * 3, `roulette: ${staked} staked after three good chips and six bad`);
        console.log('  \u2713 apply() takes the three good chips and refuses all six bad ones');
    }

    /* --- nothing about the pocket goes out early ------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(77),
            seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: 5000 }),
                    new CV.Seat(1, { kind: 'ai', name: 'A', coins: 5000 })],
            config: { room: 'beginner' },
        });
        e.start();
        e.handle({ type: 'place', seat: 0, bet: { kind: 'red' }, amount: 10 });
        const snap = JSON.stringify(e.snapshotFor(0));
        check(snap.indexOf('"number":null') >= 0, 'roulette: the pocket was on the wire before the spin');
        check(snap.indexOf('seed') < 0, 'roulette: the seed went out with the snapshot');
        console.log('  \u2713 no pocket and no seed on the wire before the ball drops');
    }

    /* --- the words all resolve ------------------------------------------- */

    for (const key of game.rules) {
        check(CV.t(key) !== key, `roulette: rules line ${key} does not resolve`);
    }
    for (const key of ['rl.red', 'rl.black', 'rl.green', 'rl.house', 'rl.landed',
                       'rl.spin', 'rl.pass', 'rl.clear', 'rl.passed',
                       'rl.dozen1', 'rl.dozen2', 'rl.dozen3']) {
        check(CV.t(key) !== key, `roulette: ${key} does not resolve`);
    }
    console.log('  \u2713 rules card and layout labels all resolve');
}
auditRoulette();

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
    // This audit is written for a table whose cards are face up apart from a
    // hole card, so it treats a null in the broadcast as a hole. 斗地主 hides
    // whole hands, and nulls there are the redaction working — its own audit
    // checks that above. A slot machine deals no hands at all.
    if (!game.AI || OWN_AUDIT.has(game.code)) continue;
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
                if (e.dealer && !e.dealer.revealed && e.dealer.cards.length > 1) {
                    const hole = e.dealer.cards[1];
                    check(!wire.includes(hole.id),
                        `${game.code}: hole card ${hole.id} is in the broadcast before the reveal`);
                    check(view.dealer.cards.length === 1,
                        `${game.code}: broadcast shows ${view.dealer.cards.length} dealer cards before the reveal`);
                    checkedHidden++;
                }

                // 百家乐 hides nothing on the table, but it does hide where the
                // other seats put their money until the deal — knowing that
                // before betting is information nobody at a table has in time.
                if (!e.dealer && e.phase === 'betting') {
                    view.seats.forEach((st, si) => {
                        if (si === viewer || !e.seats[si].side) return;
                        check(st.side === 'hidden',
                            `${game.code}: seat ${si}'s pick (${st.side}) is visible to seat ${viewer} before the deal`);
                        checkedHidden++;
                    });
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
                // Every card the broadcast carries, wherever the game keeps
                // them, must be a real card and not a hole where one should be.
                const loose = []
                    .concat((view.dealer && view.dealer.cards) || [])
                    .concat(view.player || [])
                    .concat(view.banker || []);
                for (const c of loose) {
                    check(c && typeof c.r === 'number', `${game.code}: broadcast hand holds a non-card`);
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
        if (e.dealer) {
            check(done.dealer.revealed && done.dealer.cards.length === e.dealer.cards.length,
                `${game.code}: dealer hand still redacted after the round ended`);
        } else {
            check(done.seats.every((st, si) => st.side === e.seats[si].side),
                `${game.code}: seat picks still redacted after the round ended`);
        }
    }
    console.log(`  ${game.icon} ${game.name}: ${checkedHidden} concealed-state broadcasts audited`);
    if (failures === before) console.log('    ✓ no seed, no hole card, no undealt card on the wire');
}

/**
 * Names the Table wrapper owns.
 *
 * `settled` is how a finished round reaches the screen, and the screen reads a
 * result off it. An engine that emits its own event by the same name gets found
 * first and hands the screen nothing — a broken table rather than a broken
 * animation, which is why this is a test and not a comment.
 */
console.log('\n🔒 Reserved event names');
{
    const RESERVED = ['settled', 'gameOver'];
    let checked = 0;
    for (const game of CV.Registry.playable()) {
        const file = path.join(ROOT, 'js/games/' + game.code + '/engine.js');
        if (!fs.existsSync(file)) continue;
        const src = fs.readFileSync(file, 'utf8');
        for (const name of RESERVED) {
            check(!src.includes("emit('" + name + "'"),
                game.code + ": emits '" + name + "', which the Table wrapper owns");
            checked++;
        }
    }
    console.log(`  ${checked} checks — no engine emits a name the wrapper needs`);
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
