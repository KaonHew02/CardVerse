# GameHub — one Google identity for every game

From CardVerse onward, every game shares **one Google Cloud project, one OAuth
client ID, and one Drive folder**. This file is the convention and the
checklist; follow it and a new game's Drive save is fifteen minutes of
copy-paste rather than a fresh round of Google Cloud archaeology.

## The arrangement

| | |
| --- | --- |
| Cloud project | **GameHub** — its consent screen sets the name every game shows at sign-in |
| OAuth client | **one**, Web application, origin `https://kaonhew02.github.io` |
| Drive folder | **`GameHub`**, with one sub-folder per game |
| Scope | `drive.file`, always. Never widen it to `drive`. |

### Why one client, when the earlier advice was one per app

Two facts, both learned the awkward way:

1. **The app name on the consent screen is per *project*, not per client.**
   Adding a second OAuth client inside a project does not rename anything a
   player sees. Only a separate Cloud project does. So "every game's sign-in
   says GameHub" is achievable *only* by putting them in a GameHub project —
   which is the whole point of this arrangement.

2. **`drive.file` access is granted per OAuth client.** Apps sharing a client
   can see each other's save files. That was the argument *against* sharing
   when the games were unrelated products. For a deliberate hub of one
   person's games it stops being a leak and starts being the feature: one
   grant, one consent, one folder you can actually browse.

MoneyFlow and FinSim have shared a client since day one, so this is what was
happening in practice anyway.

## Folder layout

The folder is independent of the client ID — one OAuth client writes into as
many folders as you point it at, because `folderId` is only the parent a file
is filed under. So the hub mirrors the Cloud project structure:

```
GameHub/                     ← the folder whose id everyone starts from
  CardVerse/
    cardverse-data.json
  <next game>/
    <app>-data.json
```

Each game's `drive-config.js` carries **its own sub-folder id**, not the
GameHub root's. Making the sub-folder and copying its id is the one manual
step per game; in exchange the folder is browsable at a glance and a single
game's folder can be shared or cleared without touching the others.

A **flat** `GameHub/` holding every file also works — filenames are unique, and
`findFile()` matches parent *plus* name — but then which file belongs to which
game is only legible by reading filenames. Sub-folders are the default here.

Whichever is used, changing a game's `folderId` after it has written a file
**orphans that file**: the app looks in the new folder, finds nothing, and
writes a fresh one. Press *From Drive* (or Export) before moving a game that
already has a save, and delete the old file afterwards.

## One repo per game

Each game keeps its own GitHub repo — `KaonHew02/CardVerse`,
`KaonHew02/MiniShoppingMall`, and so on. Nothing about GameHub wants a
monorepo, and the Google side costs nothing extra, because of one fact worth
stating plainly:

> A GitHub Pages project site lives at `https://kaonhew02.github.io/<repo>/`,
> but an **origin is scheme + host only**. The `/<repo>` part is not in it.

So every repo on the account shares the single origin
`https://kaonhew02.github.io`, one entry on the OAuth client covers all of
them, and a new repo needs nothing registered anywhere. That is also why the
setup notes keep insisting the origin has no path — pasting
`https://kaonhew02.github.io/CardVerse` there is the commonest way to make
sign-in fail.

### The other half of that fact: one origin means one browser store

The same shared origin that makes OAuth free also means **every game shares one
`localStorage`** — one ~5 MB quota between all of them, one flat namespace, and
one "clear site data" that wipes the lot. Two rules follow:

1. **Prefix every key with the game's name.** CardVerse writes only
   `cardverse.*` — ten keys, `cardverse.profile.v1` through
   `cardverse.drive.lastPush`. A game that writes a bare `settings` key would
   collide with the next game that does the same, and the symptom would be a
   save quietly changing under you.
2. **Watch the shared ceiling as games accumulate.** A game save here is a few
   KB, so five games is nowhere near 5 MB. If one ever gets close, the lever is
   IndexedDB on the same origin — hundreds of MB — which is the move MoneyFlow
   already made. Drive is a backup, not more room.

### Keeping the copied files from rotting

Separate repos mean `drive.js` is copy-pasted, not shared — there is no build
step and no cross-origin import that would be worth the trouble. The discipline
that keeps that honest: **CardVerse holds the canonical copy.** Copy from it,
and if you fix a bug in some other game's copy, port the fix back to CardVerse
so the *next* game starts from the fixed version rather than the original one.

## Telling the games apart

Two fields, and nothing else, distinguish one game's save from another:

| Game | File in the folder | Envelope `format` |
| --- | --- | --- |
| CardVerse | `cardverse-data.json` | `cardverse.backup` |
| *(next game)* | `<app>-data.json` | `<app>.backup` |

Older apps predate the convention and keep their own names — `moneyflow-data.json`
/ `moneyflow.backup`, `finsim-data.json` / `finsim.backup`,
`mini-shopping-mall-save.json` / `minimall.backup`. Do not rename them; a
renamed file in Drive is a *new* file and the old one is orphaned.

Both fields matter and they do different jobs:

- **The filename** is what `findFile()` searches for, scoped to the folder
  (`'<folderId>' in parents and name = '<filename>'`). Distinct names are what
  let one folder hold every game without collision.
- **The `format` string** is what "From Drive" checks before it replaces
  anything. Point a game at another game's file and it refuses by name rather
  than importing nonsense. This is the safety net that makes a shared folder
  safe; a new game that skips it can silently eat another game's save.

## Adding Drive to a new game

1. **Copy `drive.js` from CardVerse**, not from FinSim or MoneyFlow. It is the
   most hardened version — it carries MiniShoppingMall's four sign-in guards
   (`prompt: 'none'`, the `inFlight` lock, the timeout, and `silentOff`) *and*
   the icon-only stamp UI. Swap the `CV_` / `CV` prefixes for the new game's.
2. **Copy `drive-config.js`** and set the three values: the shared `clientId`,
   the shared GameHub `folderId`, and a **new, unique** `filename`.
3. **Give the envelope a unique `format`** in the new game's `save.js`, and
   check it on import. `<app>.backup`.
4. **Add the sign-in library** to `index.html` — this is the one that gets
   forgotten, and without it every Drive button fails the library check no
   matter how the config is filled in:

   ```html
   <script src="https://accounts.google.com/gsi/client" async defer></script>
   ```
5. **Wire the four button ids** the file expects: `drivePush`, `drivePull`,
   `driveAuto`, `driveStamp` (plus `driveWhen`, and `driveOffer` /
   `driveOfferPull` / `driveOfferNo` for the empty-browser offer). If the
   settings screen is re-rendered on each visit, call `CVDriveRewire()` after
   it, or the listeners are lost.
6. **Add the row to the table above**, so the next game inherits a correct map.
7. Publish to GitHub Pages. The origin is already registered, so nothing needs
   touching in Google Cloud — that is the entire payoff of this arrangement.

## Moving an existing game onto the GameHub client

Read this before touching MoneyFlow, FinSim or MiniShoppingMall.

**A new client cannot see files an old client created.** `findFile()` returns
nothing, so the app writes a *second* file with the same name into the folder —
Drive permits duplicate names — and from then on reads the empty one while the
real save sits beside it looking identical.

If you move one anyway, in this order:

1. **Export** from the app's own Settings, and keep the file. This is the copy
   that does not depend on any of this working.
2. Change `clientId` and `folderId`, commit, push.
3. Press **To Drive**. It creates a fresh file under the new client.
4. In Drive, **delete the orphaned old file** by hand so the folder does not
   hold two of the same name.

There is no reason to do this for a game that already works. The three older
apps are fine where they are.

## Setting up the GameHub project, once

1. <https://console.cloud.google.com/projectcreate> → name it **GameHub**.
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **OAuth consent screen** → External → App name **GameHub** (this is the name
   every game shows at sign-in), your email for both contact fields. Save.
4. While it is in **Testing**, add your own Google account under
   **Audience → Test users**, or Google refuses the sign-in.
5. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Name: `GameHub Web`
   - **Authorised JavaScript origins**: `https://kaonhew02.github.io`
     — scheme and host only. No path, no trailing slash. Every Pages repo on
     this account shares that one origin, which is why a single entry covers
     every game you will ever publish there.
   - **Authorised redirect URIs**: leave empty.
6. Copy the client ID into each game's `drive-config.js`.

A **client secret is never needed** and must never be committed. If the console
offers one, ignore it — needing it means the wrong credential type was created.
