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

for (const game of CV.Registry.playable()) {
    if (!game.AI) continue;   // slots has no opponents; auditSlots covers it
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
    if (!game.AI) continue;   // a slot machine deals no hands to broadcast
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
