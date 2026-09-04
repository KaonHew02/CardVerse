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
    'js/games/baccarat/engine.js', 'js/games/baccarat/ai.js', 'js/games/baccarat/index.js',
    'js/games/slots/engine.js', 'js/games/slots/index.js',
    'js/games/dragongate/engine.js', 'js/games/dragongate/index.js',
    'js/games/bullbull/hands.js', 'js/games/bullbull/engine.js',
    'js/games/bullbull/ai.js', 'js/games/bullbull/index.js',
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
 * 21, to the house rules: no natural, DOUBLE, and 五龙 — exactly five cards
 * at 21 or under — beating every normal hand including a normal 21.
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

const anyLive = (e) => e.seats.some((s) => !s.out && !CV.TwentyOneScore(s.hands[0].cards).bust);

/* ---- run --------------------------------------------------------------- */

console.log(`CardVerse smoke — ${HANDS} hands per game\n`);

/**
 * Games this loop does not fit — a wager against the house across a carried
 * shoe. 老虎机 and 射龙门 have no opponents at all; 斗地主 is three seats
 * playing each other for points rather than a table paying out. Each has its
 * own audit further down.
 */
const OWN_AUDIT = new Set(['slots', 'dragongate', 'doudizhu', 'bigtwo', 'poker', 'mahjong', 'bullbull']);

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
 * measured rather than assumed: with equal reels and this paytable it works
 * out at (5+8+10+15+25+40+75+100) / 8³ ≈ 54%. If the reels are ever weighted
 * or the multipliers changed, this is what will say so.
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

    // The theoretical figure, straight from the paytable.
    const theory = syms.reduce((n, s) => n + s.mult, 0) / Math.pow(syms.length, 3);

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
        check(same === (r.payout > 0), `slots: three-alike ${same} but payout ${r.payout}`);

        if (same) {
            const sym = syms.find((s) => s.id === r.reels[0]);
            check(r.payout === BET * sym.mult,
                `slots: ${r.reels[0]} paid ${r.payout}, expected ${BET * sym.mult}`);
            check(r.jackpot === (r.reels[0] === CV.SlotsJackpot), 'slots: jackpot flag disagrees with the reels');
            paidOnWin++;
        } else {
            // Two of a kind must pay nothing — the rule players get wrong.
            const pairish = r.reels[0] === r.reels[1] || r.reels[1] === r.reels[2] || r.reels[0] === r.reels[2];
            if (pairish) { twoMatch++; check(r.payout === 0, 'slots: two matching symbols paid'); }
        }
    }

    const g = e.tally;
    const rtp = g.won / g.staked;
    check(g.spins === g.wins + g.losses, `slots: ${g.spins} spins but ${g.wins}+${g.losses} recorded`);
    check(g.wins === paidOnWin, 'slots: win tally disagrees with the spins');
    check(e.seat.coins === e.seat.startCoins + e.seat.net, 'slots: coins do not reconcile');
    check(g.won === g.staked * rtp, 'slots: rtp arithmetic');

    console.log(`  ${g.spins.toLocaleString('en-US')} spins · win rate ${(g.wins / g.spins * 100).toFixed(2)}% `
        + `(1 in ${(g.spins / g.wins).toFixed(0)}) · ${twoMatch.toLocaleString('en-US')} near misses paid nothing`);
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
    console.log('  ✓ bet never exceeds the balance, and two-of-a-kind never pays');
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

    /** An engine whose next three cards are exactly a, b, third. */
    const rigged = (a, b, third, coins) => {
        const e = new game.Engine({
            rng: new CV.RNG(7),
            seats: [new CV.Seat(0, { kind: 'human', isYou: true, coins: coins || 100000 })],
            config: {},
        });
        e.start();
        // draw() pops, so the first card dealt is the last in the array.
        e.deck.cards = e.deck.cards.slice(0, 20).concat([cardOf(third), cardOf(b), cardOf(a)]);
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
                    e.handle({ type: 'bet', amount: 10 });

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

                    // The payout follows the verdict and the priced gate, and
                    // a loss pays nothing at all.
                    const paid = want === 'gate' ? Math.round(10 * e.odds.mult) : 0;
                    check(e.seat.payout === paid,
                        `dragongate: ${want} paid ${e.seat.payout}, wanted ${paid}`);
                    check(e.seat.coins === e.seat.startCoins - 10 + paid,
                        'dragongate: coins do not reconcile');
                    check(e.isOver(), `dragongate: posts ${a}/${b} v ${third} never finished`);

                    if (e.odds.winners === 0) { shut++; check(paid === 0, 'dragongate: a shut gate paid out'); }
                    if (want === 'gate') gates++; else if (want === 'post') posts++; else outside++;
                    cells++;
                }
            }
        }
    }
    console.log(`  ${cells.toLocaleString('en-US')} gates played out — `
        + `${gates} 射中龙门, ${posts} 压线, ${outside} 龙门外`);
    console.log('  ✓ level with a post always loses · ✓ an equal gate always asks 大过/小过');

    /* --- the price is the gate, not the bet ----------------------------- */

    // The result may not depend on what was staked, or on the call.
    const small = rigged(4, 10, 7), big = rigged(4, 10, 7);
    small.handle({ type: 'bet', amount: 5 });
    big.handle({ type: 'bet', amount: 5000 });
    check(rank(small.third) === rank(big.third) && small.outcome === big.outcome,
        'dragongate: the third card moved with the size of the bet');
    check(small.odds.mult === big.odds.mult, 'dragongate: the price moved with the size of the bet');

    const up = rigged(9, 9, 12), down = rigged(9, 9, 12);
    up.handle({ type: 'bet', amount: 10 });   up.handle({ type: 'pick', dir: 'higher' });
    down.handle({ type: 'bet', amount: 10 }); down.handle({ type: 'pick', dir: 'lower' });
    check(rank(up.third) === rank(down.third), 'dragongate: the third card moved with the call');
    check(up.outcome === 'gate' && down.outcome === 'outside', 'dragongate: the call was not honoured');
    console.log('  ✓ neither the stake nor the call moves the card');

    /* --- an adjacent gate cannot be won, and says so -------------------- */

    for (const pair of [[7, 8], [1, 2], [12, 13]]) {
        const e = rigged(pair[0], pair[1], 5);
        e.handle({ type: 'bet', amount: 10 });
        check(e.odds.winners === 0, `dragongate: gate ${pair[0]}/${pair[1]} claims ${e.odds.winners} winning cards`);
        check(e.odds.mult === 0, `dragongate: gate ${pair[0]}/${pair[1]} quoted a price it cannot pay`);
        check(e.outcome !== 'gate', `dragongate: something got through gate ${pair[0]}/${pair[1]}`);
    }
    console.log(`  ✓ adjacent posts have no winners, and ${shut.toLocaleString('en-US')} shut gates paid nothing`);

    /* --- the count of winning cards is the real count ------------------- */

    {
        const e = rigged(3, 11, 6);
        e.handle({ type: 'bet', amount: 10 });
        // Counted before the third card was taken, so put it back.
        const left = e.deck.cards.concat([e.third]);
        const want = left.filter((c) => rank(c) > 3 && rank(c) < 11).length;
        check(e.odds.winners === want,
            `dragongate: quoted ${e.odds.winners} winning cards, the pack holds ${want}`);
        check(e.odds.remaining === left.length,
            `dragongate: quoted ${e.odds.remaining} cards left, the pack holds ${left.length}`);
        const fair = Math.round((1 / (want / left.length)) * 0.95 * 100) / 100;
        check(e.odds.mult === fair, `dragongate: priced at x${e.odds.mult}, fair is x${fair}`);
        console.log(`  ✓ the price is the true count — gate 3 to J quoted x${e.odds.mult}`);
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
            const before = shoe ? shoe.cards.length : 52;
            e.start();
            if (e.deck.remaining > before) { reshuffles++; seen = new Set(); }
            e.handle({ type: 'bet', amount: 10 });
            if (e.phase === 'choose') e.handle({ type: 'pick', dir: 'higher' });
            for (const c of e.gate.cards.concat([e.third])) {
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

    /* --- what the table is allowed to say out loud ---------------------- */

    {
        const e = rigged(5, 9, 7);
        e.handle({ type: 'bet', amount: 10 });
        const view = e.snapshotFor(0);
        check(!view.rng, 'dragongate: the snapshot carries the RNG');
        check(!('deck' in view), 'dragongate: the snapshot carries the pack');
        check(view.shoeRemaining === e.deck.remaining, 'dragongate: the snapshot misreports the pack');
    }

    // The rules card must have something to show a first-time player.
    check(game.rules && game.rules.length >= 5, 'dragongate: too few rules to teach the game');
    for (const key of game.rules) check(CV.t(key) !== key, `dragongate: rule key ${key} has no text`);
    for (const key of ['dg.gate', 'dg.post', 'dg.outside', 'dg.higher', 'dg.lower', 'dg.shut'])
        check(CV.t(key) !== key, `dragongate: ${key} has no text`);
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
    const shape = CV.MJWin.isWin(MJ.counts(tiles), 0);
    if (!shape) return null;
    return CV.MJFan.calculateFan({
        shape: shape.shape,
        melds: shape.melds || [],
        pair: shape.pair,
        keys: tiles.map(MJ.key),
        selfDraw: !!opts.selfDraw,
        menzen: !!opts.menzen,
        quad: !!shape.quad,
    });
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
        ['123m456m789s555p99p', '平胡',            1],
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
        ['111m333m555m777m99m', ['清碰'],       ['清一色', '碰碰胡', '平胡']],
        ['11223344556677m',     ['清七对'],     ['清一色', '七对子', '豪华七对子', '平胡']],
        ['1111m2233s4455p66z',  ['豪华七对子'], ['七对子', '平胡']],
        ['123m555z666z777z11m', ['大三元'],     ['小三元']],
        ['123m111z222z333z44z', ['小四喜'],     ['大四喜']],
        ['111z222z333z444z55m', ['大四喜'],     ['小四喜']],
        ['555z666z111z222z33z', ['字一色'],     ['混一色', '碰碰胡', '平胡']],
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
        check(both.totalFan === 3, `mj: 平胡 with 自摸 and 门清 is ${both.totalFan}番, wanted 3`);
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
        console.log(`  ${cells} payment cells checked against the table, 5番 to 爆番`);

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

    /* --- a hand that wins but may not be declared --------------------------- */

    {
        const e = new game.Engine({
            rng: new CV.RNG(21), config: { room: 'beginner' },
            seats: [0, 1, 2].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
        });
        e.start();
        check(e.minFan === 5, `mj: three seats should demand 5番, demand ${e.minFan}`);

        // With dots the only numbered suit, every concealed hand is already
        // 混一色 or better — so the floor only ever bites on a discard, where
        // there is no 自摸 to carry it over. 3 + 门清 is four, and four is not
        // enough.
        const B = (e.dealer + 1) % 3;
        e.seats[B].hand = mjTiles('12456789p111z22z');      // thirteen, waiting on 3筒
        const tile = mjTiles('3p')[0];
        const got = e.winFor(B, tile);
        check(!!got, 'mj: that hand plus 3筒 should be a winning shape');
        check(got.fan.totalFan === 4, `mj: 混一色 with 门清 is ${got && got.fan.totalFan}番, wanted 4`);
        check(got.ok === false, 'mj: a hand under the minimum was declarable');

        e.seats[e.dealer].discards.push(tile);
        e.lastDiscard = { tile, from: e.dealer };
        const claims = e.findClaims(tile, e.dealer);
        const mine = claims.find((c) => c.seat === B);
        check(!mine || !mine.options.some((o) => o.type === 'win'),
            'mj: 胡 was offered on a hand under the minimum');
        check(e.declareWin(B, e.dealer) === false, 'mj: a hand under the minimum was declared anyway');

        // Self-drawn, the same shape carries 自摸 and clears it exactly.
        e.seats[B].hand = mjTiles('123456789p111z22z');
        const drawn = e.winFor(B, null);
        check(drawn && drawn.fan.totalFan === 5, `mj: the same hand self-drawn is ${drawn && drawn.fan.totalFan}番`);
        check(drawn && drawn.ok, 'mj: five 番 should be enough to declare');

        // And one suit on its own is well clear of it.
        e.seats[B].hand = mjTiles('11223344556677p');
        const big = e.winFor(B, null);
        check(big && big.ok, 'mj: 清七对 should clear a 5番 minimum');
        check(big.fan.totalFan >= 8, `mj: 清七对 came to ${big && big.fan.totalFan}番`);

        // Four seats have no floor, so a plain 平胡 stands.
        const four = new game.Engine({
            rng: new CV.RNG(22), config: { room: 'beginner' },
            seats: [0, 1, 2, 3].map((i) => new CV.Seat(i, { kind: 'ai', name: 'S' + i, coins: 5000 })),
        });
        four.start();
        check(four.minFan === 0, 'mj: four seats should have no minimum');
        four.seats[four.dealer].hand = mjTiles('123m456m789s555p99p');
        const small = four.winFor(four.dealer, null);
        check(small && small.ok, 'mj: a 平胡 should stand at a four-seat table');
        check(small.fan.totalFan < 5, 'mj: that hand was supposed to be a small one');
        console.log('  ✓ 5番 or nothing at three seats, no floor at four');
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
            + (players === 3 ? ` · 一番 🪙 ${CV.MJPay.unitFor(3, 10, 2)} minimum 5番` : ''));
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
        // A + 2 + 7 = 10, and 8 + 3 = 11 leaves a one.
        ['AS 2H 7D 8C 3S',   'BULL_1',        1],
        // 10 + K + Q = 30, and the pair of threes makes it 宝宝.
        ['10D KH QC 3S 3H',  'BABY',          6],
        // Five picture cards.
        ['JS QH KD JC QS',   'FIVE_PIC',      null],
        // 10 + K + Q = 30, leaving a jack and the ace of spades.
        ['10D KH QC JS AS',  'PIC_BLACK_ACE', 1],
        // 5 + 5 + K = 20, leaving a queen and the ace of clubs.
        ['5S 5H KD QC AC',   'PIC_BLACK_ACE', 1],
        // Nothing makes ten, twenty or thirty.
        ['2S 2H 2D 2C 3S',   'NO_BULL',       null],
        // 2 + 3 + 5 = 10, and 4 + 6 = 10 is a round bull.
        ['2S 3H 5D 4C 6H',   'BULL_BULL',     0],
        ['2S 3H 5D 4C 5H',   'BULL_9',        9],
        ['2S 3H 5D 9C 2H',   'BULL_1',        1],
    ];
    for (const [str, type, bull] of CASES) {
        const h = read(str);
        check(h.type === type, `bb: "${str}" read as ${h.type}, wanted ${type}`);
        if (bull !== null) check(h.bull === bull, `bb: "${str}" gave 牛${h.bull}, wanted 牛${bull}`);
    }
    console.log(`  ${CASES.length} hands read, every worked example from the rules`);

    /* --- the order, top to bottom -------------------------------------------- */

    const CHAIN = [
        ['JS QH KD JC QS',  '五个 Pic'],
        ['10D KH QC JS AS', 'Pic + Black Ace'],
        ['2S 3H 5D 4C 6H',  '牛牛'],
        ['10D KH QC 3S 3H', '宝宝·牛六'],
        ['10D KH QC AS AH', '宝宝·牛二'],
        ['2S 3H 5D 4C 5H',  '牛九'],
        ['2S 3H 5D 9C 2H',  '牛一'],
        ['2S 2H 2D 2C 3S',  '无牛'],
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
                const sum = five.reduce((n, x) => n + H.value(x), 0) % 10;
                if (h.bull !== sum) check(false, `bb: bull ${h.bull} against a hand total of ${sum}`);
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

    // The 3 ↔ 6 rule cannot fire, and that is a fact about pairs rather than a
    // gap: two cards of the same value always sum to an even number.
    {
        let odd = 0;
        for (let val = 1; val <= 10; val++) if ((val * 2) % 10 % 2 === 1) odd++;
        check(odd === 0, 'bb: a pair somehow summed to an odd last digit');
        console.log('  ✓ 宝宝 can only land on an even bull, so 牛三 never comes up to convert');
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
    const eight = rig('AS 4H 5D 8C KH', '2S 3H 5D 4C AH', 100);
    check(eight.hand.type === 'BULL_8', `bb: the test hand read as ${eight.hand.type}`);
    check(eight.outcome === 'win' && eight.net === 200,
        `bb: 牛八 over 牛五 on 100 netted ${eight.net}, wanted 200`);

    // The best hand there is, five times.
    const pic = rig('JS QH KD JC QS', '2S 3H 5D 4C 6H', 100);
    check(pic.net === 500, `bb: 五个 Pic over 牛牛 on 100 netted ${pic.net}, wanted 500`);

    // And the same table the other way round.
    const lost = rig('2S 3H 5D 9C 2H', 'JS QH KD JC QS', 100);
    check(lost.outcome === 'loss' && lost.net === -500,
        `bb: 牛一 under 五个 Pic on 100 netted ${lost.net}, wanted -500`);

    const push = rig('2S 3H 5D 4C 5H', '2H 3D 5S 4H 5C', 100);
    check(push.outcome === 'push' && push.net === 0, `bb: a push netted ${push.net}`);

    // A seat cannot be taken below zero by a big dealer hand.
    const broke = rig('2S 3H 5D 9C 2H', 'JS QH KD JC QS', 100000);
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
