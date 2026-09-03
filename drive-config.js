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
    clientId: 'PASTE-YOUR-CLIENT-ID.apps.googleusercontent.com',

    /**
     * The shared **GameHub** folder — every game writes one file into it.
     * Taken from the folder's Drive URL, the part after `/folders/` and
     * before any `?`:
     *
     *     https://drive.google.com/drive/folders/1AbC…XyZ?usp=sharing
     *                                            └── this ──┘
     *
     * Keep this folder **Restricted** in Drive's Share settings.
     */
    folderId: '1Qc4ZfqWyoQf-2_ohW1ieoebwtCWKjJOz',

    /**
     * The one file CardVerse writes, and the thing that keeps it apart from
     * every other game in the shared folder — `findFile()` searches by parent
     * folder plus this exact name. **Must be unique across all games.**
     * Renaming it in Drive starts a new file and orphans the old one.
     */
    filename: 'cardverse-data.json',
};
