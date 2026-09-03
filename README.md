<p align="center">
  <img src="assets/logo/cardverse-wide.svg" alt="CardVerse — One World. Every Game." width="520">
</p>

# CardVerse

A casual card and tile game hub — Blackjack, 21, 斗地主, 锄大D, Poker, 斗牛
and Mahjong — with one player profile, virtual coins, XP and levels,
achievements, daily missions and a Google Drive backup. Vanilla HTML, CSS and
JavaScript; no build step, no dependencies, no server. Copy the folder and
double-click `index.html`.

**Virtual coins only.** Nothing in CardVerse can be bought with money, sold
for money, or cashed out, and nothing ever will be. That is the line that
keeps it a game hub.

## What is built (V1)

| Area | Status |
| --- | --- |
| Main menu & lobby | ✅ every game in the spec listed; unbuilt ones greyed *Coming soon* |
| Player profile, coins, XP, levels, titles | ✅ |
| Rooms (Beginner / Casual / Pro / Master) | ✅ entry fee, bet range, XP multiplier |
| Game engine, deck engine, seeded RNG | ✅ `js/core/` |
| AI players, four difficulties | ✅ basic strategy + Hi-Lo count at Expert |
| Pass-and-play (extra humans on one device) | ✅ |
| Statistics, per game and overall | ✅ |
| Achievements, hub-wide and per game | ✅ |
| Daily missions, daily login calendar, win streaks | ✅ |
| Cosmetics: avatars, card backs, tables, tile skins | ✅ |
| Leaderboard | ✅ local (your best hands); global needs a server |
| Export / Import, Google Drive copy | ✅ `save.js`, `drive.js` |
| 🃏 **Blackjack** | ✅ |
| 🔢 **21** | ✅ |
| 🏠 斗地主 · ♦️ 锄大D · ♠️ Poker · 🐂 斗牛 · 🀄 Mahjong | ⏳ next, in that order |
| Online multiplayer | ⏳ Phase 5 — see `js/core/transport.js` |

## How it is put together

```
index.html            one page, screens shown and hidden by js/ui/shell.js
css/                  global · lobby · game · responsive
js/core/              the hub — nothing in here knows a game by name
  rng.js              seeded RNG (every shuffle is replayable)
  cards.js            Card / Deck / hand values
  engine.js           GameEngine base, Seat, GameResult
  transport.js        how an action reaches the engine (the online seam)
  table.js            engine + transport + AI turns + settle-once
  ai.js               AIPlayer base, difficulty = decision quality
  registry.js         the list of games and rooms
  profile.js          coins, XP, level, streak
  stats.js            per-game counters + history
  achievements.js     hub-wide definitions + evaluation
  missions.js         daily missions + login calendar
  cosmetics.js        the shop
  rewards.js          what a finished game is worth (one pipeline)
  store.js            localStorage with failure reporting
js/games/<game>/      engine.js · ai.js · view.js · index.js (registers itself)
js/ui/                shell · lobby · play · result · profile · achievements ·
                      statistics · leaderboard · missions · settings · cardview
js/save.js            Export / Import envelope
drive.js              the Drive copy (ported from FinSim)
drive-config.js       your OAuth client ID and folder ID
docs/DRIVE.md         how to set Drive up for CardVerse
docs/GAMEHUB.md       the shared Google identity every game uses
assets/logo/          generated — see tools/build-logo.mjs, never hand-edit
tools/build-logo.mjs  the logo, as code
tools/smoke.js        headless engine tests
tools/serve.js        a static server for local development
```

## The logo

A fan of five cards — one per suit, with a mahjong tile standing taller at the
centre. Cards *and* tiles is the split the hub is built around, and the arc
they sit in is the "verse".

It is **generated, not drawn**. Edit the numbers in `tools/build-logo.mjs` and
re-run it; never hand-edit `assets/logo/*.svg`, or the favicon stops matching
the header.

```bash
node tools/build-logo.mjs
```

Open `assets/logo/preview.html` to check the mark still reads at 16px before
shipping a change to it — that check is why the suit pips sit high on each
card rather than centred. In a fan, a centred pip is exactly the part the next
card covers, so a centred design renders as five white slivers.

| file | for |
| --- | --- |
| `cardverse-icon.svg` | favicon — three cards, redrawn rather than scaled down |
| `cardverse-mark.svg` | app icon, header, anywhere square |
| `cardverse-glyph.svg` | the fan alone, no badge |
| `cardverse-logo.svg` | stacked lockup |
| `cardverse-wide.svg` | wide lockup, social preview |
| `cardverse-wide-trim.svg` | the same, transparent |

### The three rules the architecture depends on

1. **Engines never touch the DOM, the profile, or `Math.random()`.** They
   take a seeded RNG and seat descriptors, produce state and events, and
   answer `legalActions()`. A view paints from state; `rewards.js` pays out
   from the result. This is what makes the same engine run under an AI, in a
   test, or — later — in a host browser deciding for everyone.
2. **Adding a game touches nothing outside its folder.** `index.js` calls
   `CV.Registry.add({...})` with its engine, AI, view and achievements; the
   lobby, statistics, trophy cabinet and save format read the registry.
3. **`legalActions()` is the single source of legality.** The UI greys
   buttons from it and `apply()` refuses anything absent from it.

### Adding a game

1. Create `js/games/<code>/` with `engine.js` (extends `CV.GameEngine`),
   `ai.js` (extends `CV.AIPlayer`), `view.js` (a class with `mount()` /
   `unmount()`), and `index.js` calling `CV.Registry.add`.
2. Add the four `<script>` tags to `index.html`.
3. Remove the matching `R.stub(...)` line in `js/app.js`.

`js/games/twentyone/` is the smallest worked example: it subclasses
Blackjack's engine and AI and reuses its view.

### Online play, when it comes

The engine is already deterministic and JSON-snapshottable, and every action
goes through a `Transport`. The plan, recorded in `js/core/transport.js`, is
**host authority**: one browser runs the engine, the others render its
snapshots. Not lockstep-with-a-shared-seed — that would hand every peer the
shuffled deck. What is left to choose is the pipe (WebRTC via a signalling
broker, or a small WebSocket server).

## Running it

Open `index.html`. For the Drive copy it has to be served from the registered
origin — publish to GitHub Pages (`KaonHew02/CardVerse`, branch `master`, root)
and follow `docs/DRIVE.md`.

## Testing the engine headless

`tools/smoke.js` runs thousands of AI-only hands of each game under Node and
checks that every coin paid out was a coin that was bet, that no engine
throws, and that the seeded RNG replays identically:

```bash
node tools/smoke.js
```
