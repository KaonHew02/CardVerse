# Keeping a copy of your CardVerse player in Google Drive

Your profile, coins, statistics, achievements and cosmetics live in this
browser. Clear the browser's site data and they are gone. **Export** in
Settings writes a file you can keep anywhere; the **Drive** buttons keep one
copy in your own Google Drive, so a new computer or a wiped browser can pick
up where you left off.

## What it does, exactly

- **To Drive** writes one file, `cardverse-data.json`, into one folder you
  choose. Pressing it again overwrites that file. It is a *mirror* of this
  browser, not an archive of every version.
- **From Drive** reads that file and **replaces** everything in this browser
  with it, after showing you what is in both and asking. It never merges.
- **Auto** (off by default) sends a copy about a minute after your record
  last changed — after a hand, a purchase, a claimed bonus. It never opens a
  sign-in window on its own, so the very first copy has to be one you send by
  pressing *To Drive*; after that it looks after itself while the tab is open.
- The app asks for the `drive.file` permission only. That reaches **only files
  CardVerse itself created** — it cannot see, read or touch anything else in
  your Drive.

Export and Import need none of this. They work with no account at all,
including from a double-clicked `index.html`.

## Where it works

Google will only sign an app in from a real web address, so Drive works from
**<https://kaonhew02.github.io/CardVerse/>** and not from a file opened off
disk. `file://` has no origin and Google will not issue a token to it. The
rest of CardVerse — every game, Export, Import — works from either.

All your GitHub Pages projects share the single origin `kaonhew02.github.io`.
That is why the origin below carries no `/CardVerse` path, and also why
MoneyFlow, FinSim and MiniShoppingMall each needed their own OAuth client
rather than a per-project origin.

## Status

| | |
| --- | --- |
| GitHub Pages | ✅ live at <https://kaonhew02.github.io/CardVerse/> |
| Drive folder | ✅ set — `1Qc4ZfqWyoQf-2_ohW1ieoebwtCWKjJOz` |
| OAuth client ID | ⬜ **still a placeholder — the one step left, below** |

Until the client ID is filled in, every Drive button says "Drive is not set up
yet" rather than failing oddly. **Everything else already works**: the game
saves to this browser as you play, and Export / Import need no account at all.
Drive is the copy that survives clearing the browser or moving to another
machine — worth having, but not load-bearing.

## The one step left — the GameHub client ID

CardVerse is the first game on the **GameHub** arrangement: one Google Cloud
project, one OAuth client, one Drive folder, shared by every game from here on.
**The full setup and the reasoning live in [GAMEHUB.md](GAMEHUB.md)** — make
the project and the client there, once, then come back and paste the client ID
into `drive-config.js`:

```bash
git add drive-config.js && git commit -m "Drive: add the GameHub client ID" && git push
```

Every game after this one reuses that same client ID and the same folder, and
needs nothing done in Google Cloud at all — only its own unique `filename` and
envelope `format`.

A **client secret is never needed** and must never be pasted anywhere in this
project. If the console offers one, ignore it.

## Then — the first copy

Open <https://kaonhew02.github.io/CardVerse/>, go to **Settings → Your data**,
press **To Drive** and sign in. The stamp underneath turns into a cloud with a
tick. Then turn **Auto** on if you want it kept up to date without pressing
anything — but note the first copy always has to be one you send by hand,
because Auto deliberately never opens a sign-in window.

Keep the folder's sharing set to **Restricted** in Drive. "Anyone with the
link" would mean anyone holding that link can read your save.

## If something goes wrong

- *"Drive is not set up yet"* — `drive-config.js` still has the placeholder.
- *A sign-in window opens and closes with an error about the origin* — the
  JavaScript origin registered in step 2 does not exactly match the address
  in the browser. Check scheme, host and that there is no path.
- *"There is nothing in Drive yet"* on **From Drive** — this browser has never
  sent a copy to that folder. Press *To Drive* on the machine that has your
  record first.
- *The stamp turned red after a week* — Google stops issuing silent tokens
  after a while. One press of *To Drive* renews it.
