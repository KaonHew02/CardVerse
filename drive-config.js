/**
 * CardVerse — where the Drive copy lives, and who is allowed to write it.
 *
 * Both values are safe to publish, and both are meant to be. An OAuth client
 * ID is not a secret — it only names the app; Google will not hand it a token
 * without you signing in and agreeing, and it only works from the web
 * addresses you registered against it. A folder ID is likewise just a name:
 * without permission on the folder, knowing its ID gets you nothing.
 *
 * What must NEVER appear in this file is a **client secret**. The web flow
 * this app uses does not need one. If you ever find yourself pasting something
 * labelled "secret" in here, stop — you have created the wrong kind of
 * credential.
 *
 * Setup is a few minutes of clicking, once. See docs/DRIVE.md.
 */

const CV_DRIVE = {

    /**
     * The **shared GameHub client ID** — one OAuth client for CardVerse and
     * every game after it. See docs/GAMEHUB.md.
     *
     * The same string goes in every game's drive-config.js. That is
     * deliberate: the consent screen's app name is set per Cloud *project*,
     * not per client, so one GameHub project is the only way every game's
     * sign-in window says "GameHub". And `drive.file` is granted per client,
     * so sharing one is what lets the games live in a single folder under a
     * single grant.
     *
     * Until this is replaced, every Drive button says so instead of failing
     * oddly. Export and Import work regardless — they need no account at all.
     */
    clientId: '612843079573-ujp69s8asq895kofufsb84j372qrhl9f.apps.googleusercontent.com',

    /**
     * The folder every save is filed under — **a name, not an id**.
     *
     * A hard-coded id was one folder in one person's Drive. That is fine for a
     * single player and breaks the moment a second one presses the button:
     * `drive.file` reaches only files this app made for *that* account, so
     * another player has no permission on the first player's folder and the
     * write is refused. Sharing the folder is worse rather than better — every
     * save then lands in one person's Drive, on one person's quota, readable
     * by them.
     *
     * A name instead means `findFolder()` looks it up in whichever Drive just
     * signed in, and makes it there the first time. Each player ends up with
     * their own folder, their own file, their own storage; nobody can see
     * anybody else's, and there is nothing to share or configure.
     *
     * It stays `GameHub` rather than `CardVerse` so a player who plays three
     * of these games has one folder holding three files, not three folders.
     * `filename` is what keeps the games apart inside it.
     */
    folderName: 'GameHub',

    /**
     * The one file CardVerse writes, and the thing that keeps it apart from
     * every other game in the shared folder — `findFile()` searches by parent
     * folder plus this exact name. **Must be unique across all games.**
     * Renaming it in Drive starts a new file and orphans the old one.
     */
    filename: 'cardverse-data.json',
};
