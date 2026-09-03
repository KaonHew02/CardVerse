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
     * Google Cloud → APIs & Services → Credentials → OAuth client ID (Web
     * application). Paste it here; it ends in `.apps.googleusercontent.com`.
     *
     * You already have a Cloud project with the Drive API and consent screen
     * done from MoneyFlow / FinSim — add a *third* OAuth client in that same
     * project rather than reusing one, so the sign-in window names CardVerse.
     *
     * Until this is replaced, every Drive button says so instead of failing
     * oddly. Export and Import work regardless — they need no account at all.
     */
    clientId: 'PASTE-YOUR-CLIENT-ID.apps.googleusercontent.com',

    /**
     * The folder the file is kept in, taken from its Drive URL — the part
     * after `/folders/` and before any `?`:
     *
     *     https://drive.google.com/drive/folders/1AbC…XyZ?usp=sharing
     *                                            └── this ──┘
     *
     * Keep this folder **Restricted** in Drive's Share settings.
     */
    folderId: '1Qc4ZfqWyoQf-2_ohW1ieoebwtCWKjJOz',

    /** The one file CardVerse writes. Renaming it in Drive starts a new one. */
    filename: 'cardverse-data.json',
};
