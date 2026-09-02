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
**https://kaonhew02.github.io/CardVerse/** (once the repo is published to
GitHub Pages) and not from a file opened off disk. The rest of CardVerse —
every game, Export, Import — works from either.

## Setting it up (once, about five minutes)

You already have a Google Cloud project with the Drive API enabled and the
consent screen done, from MoneyFlow and FinSim. Reuse it: add a third OAuth
client rather than reusing one of theirs, so the sign-in window says
"CardVerse" and the grants stay separate.

1. Open <https://console.cloud.google.com/apis/credentials> in that project.
2. **Create credentials → OAuth client ID → Web application.**
   - Name: `CardVerse`
   - Authorised JavaScript origins: `https://kaonhew02.github.io`
     (scheme and host only — no path, no trailing slash)
   - Authorised redirect URIs: leave empty.
3. Copy the client ID (it ends in `.apps.googleusercontent.com`) into
   `drive-config.js` as `clientId`.
4. In Google Drive, make a folder for CardVerse (or reuse one). Open it and
   copy the ID from the address bar — the part after `/folders/` and before
   any `?` — into `drive-config.js` as `folderId`. Keep the folder's sharing
   set to **Restricted**.
5. Commit and push. Open the site, go to Settings, press **To Drive**, sign
   in when asked, and the stamp under the buttons will say when the copy went
   up.

A **client secret is never needed** and must never be pasted anywhere in this
project. If the console offers one, ignore it.

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
