# Keeping a copy of your CardVerse player in Google Drive

Your profile, coins, statistics, achievements and cosmetics live in this
browser. Clear the browser's site data and they are gone. **Export** in
Settings writes a file you can keep anywhere; the **Drive** buttons keep one
copy in your own Google Drive, so a new computer or a wiped browser can pick
up where you left off.

## What it does, exactly

- **To Drive** writes one file, `cardverse-data.json`, into a **`GameHub`
  folder in your own Google Drive** — the app makes that folder the first time
  you press the button, and there is nothing to set up beforehand. Pressing it
  again overwrites the file. It is a *mirror* of this browser, not an archive
  of every version.
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
| OAuth client ID | ✅ set — the shared GameHub client |
| Drive folder | ✅ made per player, automatically — nothing to configure |
| Other people signing in | ⚠️ needs one console setting — see below |

## Every player keeps their own copy

There is no folder id in `drive-config.js`, only the folder **name**
`GameHub`. `findFolder()` looks that name up in whichever Drive just signed in
and makes it there if it is missing, so each player's save goes to their own
Drive, on their own storage, under their own account.

That is not merely tidier than a shared folder — a shared one cannot work.
`drive.file` reaches only the files this app created *for the account holding
the token*, so a second player has no permission on the first player's folder
and Drive refuses the write. Handing the folder out as Editor to get past that
would put every player's save in one person's Drive, on one person's quota,
readable by them. Nobody can see anybody else's save under the arrangement as
it stands, and that is deliberate.

## Letting somebody else play

The code side needs nothing. The Google side needs one decision, because while
the **GameHub** Cloud project's consent screen is in **Testing**, Google lets in
only accounts on a list:

- **A few friends** — Cloud console → **Audience → Test users**, add their Gmail
  addresses. Up to 100. Note that Testing also stops Google issuing silent
  tokens after about 7 days, so *Auto* users need one press of *To Drive* a week.
- **Anyone** — set the consent screen to **In production**. `drive.file` is not a
  sensitive scope, so this does not drag the project into Google's verification
  review, and it ends the weekly re-press.

Until one of those is done, another person's sign-in is refused by Google
before they ever reach the consent screen — the app reports that the sign-in
did not finish and names this as the likely reason.

## Then — the first copy

Open <https://kaonhew02.github.io/CardVerse/>, go to **Settings → Your data**,
press **To Drive** and sign in. The stamp underneath turns into a cloud with a
tick. Then turn **Auto** on if you want it kept up to date without pressing
anything — but note the first copy always has to be one you send by hand,
because Auto deliberately never opens a sign-in window.

Leave the folder's sharing alone. It is yours, in your own Drive, and private
by default; setting it to "anyone with the link" would mean anyone holding that
link can read your save.

## If something goes wrong

- *"Drive is not set up yet"* — `drive-config.js` is missing its `clientId` or
  `folderName`.
- *"Google did not finish the sign-in"* on somebody else's machine — that
  account is not on the test-user list, and the consent screen is still in
  Testing. See *Letting somebody else play* above.
- *A sign-in window opens and closes with an error about the origin* — the
  JavaScript origin registered in step 2 does not exactly match the address
  in the browser. Check scheme, host and that there is no path.
- *"There is nothing in Drive yet"* on **From Drive** — this Google account has
  never sent a copy. Press *To Drive* on the machine that has your record
  first, signed in as the same account: a save sent from one Google account is
  invisible to another, by design.
- *The stamp turned red after a week* — Google stops issuing silent tokens
  after a while. One press of *To Drive* renews it.
