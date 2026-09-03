/**
 * ====================================================================
 * CardVerse — the copy that lives in Google Drive
 * --------------------------------------------------------------------
 * localStorage stays the working store. It is instant, it works with no
 * network and no account, and CardVerse is fully usable if this file never loads
 * at all. Drive is the *second* copy: the one that survives a cleared browser,
 * and the one you can pull down onto another machine or a phone.
 *
 * That ordering is the whole design. A calculator that cannot open because
 * Google is having a bad morning is a worse calculator than one that keeps its
 * figures locally and sends them up when asked.
 *
 * What goes up is exactly what Export writes — `backupEnvelope()` from save.js,
 * the same shape, the same version field. So a file pulled off Drive can be
 * fed to Import, and a file made by Export can be dropped into the Drive
 * folder by hand. One format, three routes in.
 *
 * On scope: this asks for `drive.file`, which grants access only to files this
 * app itself created. It cannot read your other documents, and it cannot list
 * your Drive. That is deliberate, and it is also why it needs no review from
 * Google — the wider scopes do.
 * ====================================================================
 */

(() => {

    const $ = (id) => document.getElementById(id);

    const SCOPE  = 'https://www.googleapis.com/auth/drive.file';
    const API    = 'https://www.googleapis.com/drive/v3';
    const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

    const cfg = (typeof CV_DRIVE !== 'undefined') ? CV_DRIVE : null;

    const configured = () => !!cfg
        && !/YOUR-CLIENT-ID/i.test(cfg.clientId || '')
        && !!cfg.folderId;

    /** The current access token, and when it stops being any use. */
    let token = null;
    let tokenExpires = 0;
    let tokenClient = null;

    /**
     * Three guards ported from MiniShoppingMall's drive.js, each for a way
     * this hung in a real game rather than in theory:
     *
     *   inFlight   a second authorize() used to overwrite the first's
     *              callback, leaving that promise pending for ever.
     *   silentOff  once a silent token is refused, stop asking. Retrying a
     *              minute later is precisely the call that pops a sign-in
     *              window in the middle of a hand.
     *   warned     say why once per session, not once per attempt.
     */
    let inFlight = null;
    let silentOff = false;
    let warned = false;

    /** The Drive file id, once found or created. Cached so each save is one call. */
    let fileId = null;

    const valid = () => token && Date.now() < tokenExpires - 60000;

    /* ------------------------------------------------------------------ *
     * Signing in
     * ------------------------------------------------------------------ */

    /**
     * Google's library is loaded from their CDN by a tag in index.html. If the
     * network is down, or a blocker ate it, every Drive button has to fail
     * with something a person can act on rather than `google is not defined`.
     */
    function library() {
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            throw new Error('Google’s sign-in library did not load. Check your internet '
                + 'connection, or whether an extension is blocking accounts.google.com.');
        }
        return google.accounts.oauth2;
    }

    /**
     * Asks for a token, silently if Google already knows the answer.
     *
     * `prompt: 'none'`, never `prompt: ''`. The empty string does not promise
     * silence: with more than one Google account signed in, Google still opens
     * the account chooser — which is how an automatic push ended up asking
     * "which account?" in the middle of a hand and taking the window away from
     * the table. 'none' tells Google to answer or fail, never to show anything.
     *
     * Interactive passes no prompt at all rather than 'consent', so a player
     * who has already granted access is not asked to grant it again every time
     * they press the button.
     */
    function authorize(interactive) {
        if (valid()) return Promise.resolve(token);
        if (!interactive && silentOff) {
            return Promise.reject(new Error('Google will not sign you in without being asked.'));
        }
        if (inFlight) return inFlight;

        const promise = new Promise((resolve, reject) => {
            let done = false;
            let timer = null;
            const settle = (fn, value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                fn(value);
            };

            let oauth2;
            try { oauth2 = library(); } catch (err) { return settle(reject, err); }

            if (!tokenClient) {
                tokenClient = oauth2.initTokenClient({
                    client_id: cfg.clientId,
                    scope: SCOPE,
                    callback: () => {},          // replaced per request, below
                });
            }

            tokenClient.callback = (response) => {
                if (!response || response.error || !response.access_token) {
                    const code = (response && response.error) || 'no_token';
                    // access_denied is a person clicking Cancel, not a fault.
                    if (/access_denied|user_cancel/i.test(code)) {
                        return settle(reject, new Error('Sign-in was cancelled, so nothing was sent to Drive.'));
                    }
                    return settle(reject, new Error('Google refused the sign-in: ' + code));
                }
                token = response.access_token;
                tokenExpires = Date.now() + (Number(response.expires_in || 3600) * 1000);
                silentOff = false;
                warned = false;
                settle(resolve, token);
            };

            tokenClient.error_callback = (err) => {
                const type = (err && err.type) || '';
                // A non-interactive attempt fails through this same callback,
                // and it has not opened any window to close — saying so sent
                // people looking for a pop-up that was never there.
                if (!interactive) {
                    return settle(reject, new Error('Google would not sign you in without being asked.'));
                }
                settle(reject, new Error(type === 'popup_closed'
                    ? 'The Google sign-in window was closed before it finished.'
                    : 'The Google sign-in window could not open. Allow pop-ups for this site and try again.'));
            };

            // A window someone closed can call neither callback, and a silent
            // request that Google simply never answers would otherwise leave
            // Auto wedged for the rest of the session.
            timer = setTimeout(() => settle(reject, new Error('Google did not answer in time.')),
                               interactive ? 120000 : 15000);

            try {
                tokenClient.requestAccessToken(interactive ? {} : { prompt: 'none' });
            } catch (err) {
                settle(reject, err);
            }
        });

        inFlight = promise;
        promise.catch(() => {}).then(() => { if (inFlight === promise) inFlight = null; });
        return promise;
    }

    /* ------------------------------------------------------------------ *
     * Talking to Drive
     * ------------------------------------------------------------------ */

    /**
     * Every Drive response goes through here. A 401 means the token went stale
     * mid-flight, which is normal after an hour and is worth exactly one silent
     * retry rather than an error in someone's face.
     */
    async function call(url, options = {}, retrying = false) {
        const response = await fetch(url, {
            ...options,
            headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token },
        });

        if (response.status === 401 && !retrying) {
            token = null;
            await authorize(false);
            return call(url, options, true);
        }

        if (!response.ok) {
            let detail = '';
            try {
                const body = await response.json();
                detail = (body.error && body.error.message) || '';
            } catch (err) { /* a non-JSON error body tells us nothing extra */ }

            if (response.status === 403 && /insufficient|permission/i.test(detail)) {
                throw new Error('Google allowed the sign-in but refused the folder. Check that the '
                    + 'folder ID in drive-config.js is a folder this account can edit.');
            }
            if (response.status === 404) {
                throw new Error('That folder no longer exists, or this account cannot see it. '
                    + 'Check the folder ID in drive-config.js.');
            }
            throw new Error('Drive refused the request (' + response.status + ')'
                + (detail ? ': ' + detail : '.'));
        }

        return response;
    }

    /**
     * Finds the app's file in the folder, or reports that there is not one yet.
     *
     * The query is scoped to the folder *and* the name, because a `drive.file`
     * search only ever sees files this app made — so a file you dragged in by
     * hand is invisible here, and a second one would otherwise be created
     * silently beside it.
     */
    async function findFile() {
        if (fileId) return fileId;

        const query = encodeURIComponent(
            `'${cfg.folderId}' in parents and name = '${cfg.filename}' and trashed = false`);
        const response = await call(
            `${API}/files?q=${query}&fields=files(id,name,modifiedTime)&pageSize=1`);
        const body = await response.json();

        fileId = (body.files && body.files[0] && body.files[0].id) || null;
        return fileId;
    }

    async function readFile(id) {
        const response = await call(`${API}/files/${id}?alt=media`);
        return response.json();
    }

    /** When Drive last saw a change, so a pull can say how old its copy is. */
    async function fileModified(id) {
        const response = await call(`${API}/files/${id}?fields=modifiedTime`);
        const body = await response.json();
        return body.modifiedTime || null;
    }

    /**
     * Creates the file the first time and updates it every time after. The
     * create is a multipart upload because the metadata (name, parent folder)
     * and the content have to arrive together, or the file lands in the root
     * of My Drive instead of the folder that was asked for.
     */
    async function writeFile(envelope) {
        const body = JSON.stringify(envelope, null, 2);
        const id = await findFile();

        if (id) {
            await call(`${UPLOAD}/files/${id}?uploadType=media`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            return id;
        }

        const boundary = 'cardverse-' + Math.random().toString(36).slice(2);
        const metadata = { name: cfg.filename, parents: [cfg.folderId], mimeType: 'application/json' };
        const multipart =
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
            + JSON.stringify(metadata)
            + `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`
            + body
            + `\r\n--${boundary}--`;

        const response = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
            method: 'POST',
            headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
            body: multipart,
        });

        fileId = (await response.json()).id;
        return fileId;
    }

    /* ------------------------------------------------------------------ *
     * The two buttons
     * ------------------------------------------------------------------ */

    function notConfigured() {
        backupSay('Drive is not set up yet',
            'Paste your Google OAuth client ID into drive-config.js — docs/DRIVE.md walks '
            + 'through making one. Until then, Export and Import still work and still keep '
            + 'your record safe.');
    }

    async function push(btn) {
        if (!configured()) return notConfigured();

        try {
            flashButton(btn, '<span>⏳ Saving…</span>');
            // Interactive: a press of this button IS the permission to open a
            // sign-in window. Asking silently here was a bug — `prompt: 'none'`
            // tells Google never to show anything, so the very first save could
            // never succeed, and failed claiming the window had been closed.
            await authorize(true);
            await writeFile(backupEnvelope());
            remember();
            flashButton(btn, '<span>✅ In Drive</span>');
        } catch (err) {
            backupSay('Could not save to Drive', err.message);
        }
    }

    /**
     * Pulling is the dangerous direction — it replaces what is on this machine
     * — so it goes through the same confirmation Import does, and says what is
     * in both copies before anyone agrees to anything.
     */
    async function pull(btn) {
        if (!configured()) return notConfigured();

        try {
            flashButton(btn, '<span>⏳ Reading…</span>');
            await authorize(true);

            const id = await findFile();
            if (!id) {
                return backupSay('There is nothing in Drive yet',
                    'CardVerse has not written to that folder before. Press “To Drive” first, and '
                    + 'this becomes the way to get that record onto another computer.');
            }

            const envelope = await readFile(id);
            if (!envelope || envelope.format !== 'cardverse.backup') {
                return backupSay('That Drive file is not readable',
                    'The file in the folder is not a CardVerse backup. Rename or remove it and '
                    + 'press “To Drive” to write a fresh one.');
            }

            // Drive answers in RFC 3339, which starts with a yyyy-mm-dd nobody
            // here reads dates in. Turn it round; say so plainly if it is absent.
            const raw = await fileModified(id);
            const stamp = raw ? new Date(raw) : null;
            const modified = (stamp && !isNaN(stamp)) ? dmyDate(stamp) : 'an unknown date';

            askConfirm(
                'Replace what is here with the Drive copy?',
                'Drive holds ' + backupSummary(envelope) + ', last written ' + modified + '. '
                + 'This browser holds ' + backupSummary(backupEnvelope()) + ', and all of it will be '
                + 'replaced. If this machine has the newer record, cancel and press “To Drive” instead.',
                'Use the Drive copy',
                () => backupApply(envelope));
        } catch (err) {
            backupSay('Could not read from Drive', err.message);
        }
    }

    /* ------------------------------------------------------------------ *
     * Sending it up on its own
     * ------------------------------------------------------------------ *
     * Off by default, and it has to be: this file's whole promise is that
     * nothing leaves the browser unless someone presses a button. A switch
     * makes that a choice rather than a change made on everyone's behalf.
     *
     * Two rules keep it from being obnoxious once it is on:
     *
     *   It never opens a sign-in window. A popup nobody asked for gets
     *   blocked, and a popup that is not blocked is worse. If the token has
     *   lapsed the automatic push simply stands down and the stamp goes stale,
     *   which is exactly the signal that says "press the button".
     *
     *   It waits for the typing to stop. A push per keystroke would be a
     *   hundred writes to Drive for one evening at a calculator.
     */
    const AUTO_KEY  = 'cardverse.drive.auto';
    const AUTO_WAIT = 60000;

    let autoTimer = null;

    const autoOn = () => {
        try { return localStorage.getItem(AUTO_KEY) === 'on'; } catch (err) { return false; }
    };

    function setAuto(on) {
        try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch (err) { /* not vital */ }
        paintAuto();
        // The stamp's wording depends on the switch — "Auto is waiting on you"
        // is only true while it is on — so it is repainted with it.
        showStamp();
        if (on) schedule(); else clearTimeout(autoTimer);
    }

    function paintAuto() {
        const btn = $('driveAuto');
        if (!btn) return;
        const on = autoOn();
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', String(on));
        btn.title = on
            ? 'Sending a copy to Drive about a minute after you stop typing. Click to stop.'
            : 'Off — nothing goes to Drive unless you press "To Drive". Click to send it automatically.';
    }

    /** Called by save.js whenever a figure changes. */
    function schedule() {
        if (!autoOn() || !configured()) return;
        clearTimeout(autoTimer);
        autoTimer = setTimeout(run, AUTO_WAIT);
    }

    async function run() {
        if (!autoOn() || !configured()) return;

        // A token is good for about an hour and is held in memory only, so a
        // reload loses it. Without this, Auto worked until the first reload
        // after a manual push and then stopped for good — which is not what a
        // switch called Auto should mean.
        //
        // `authorize(false)` asks Google for a fresh one *without* a prompt.
        // Where the grant is still in place it comes back silently; where it
        // is not, it fails, this stands down, and the stamp turns red asking
        // for one press. Only ever while the tab is actually being looked at —
        // nothing should be waking a background tab into a sign-in window.
        if (!valid()) {
            if (document.visibilityState !== 'visible') return;
            try {
                await authorize(false);
            } catch (err) {
                // Stand down for the session rather than trying again in a
                // minute, and say why exactly once.
                silentOff = true;
                if (!warned) {
                    warned = true;
                    if (window.CV && CV.UI) CV.UI.toast('Auto needs you to press “To Drive” once to sign in again.', 'warn', 4000);
                }
                showStamp();
                return;
            }
        }

        try {
            await writeFile(backupEnvelope());
            remember();
        } catch (err) {
            // A failed automatic push is not worth a dialog in front of
            // someone who did not ask for one. The stamp going stale is the
            // honest signal, and pressing the button gives the real error.
            showStamp();
        }
    }

    /* ------------------------------------------------------------------ *
     * "Last saved" — the only status worth showing
     * ------------------------------------------------------------------ */

    const STAMP_KEY = 'cardverse.drive.lastPush';

    function remember() {
        try { localStorage.setItem(STAMP_KEY, new Date().toISOString()); } catch (err) { /* not vital */ }
        showStamp();
    }

    /**
     * Three states, and only one of them says anything.
     *
     * There are no words in any of them. The reader said three times that the
     * wording confused rather than helped, and they were right: a sentence in
     * a toolbar is something to decode every time you glance at it. A crossed
     * cloud beside the button you have to press says the same thing without
     * asking anyone to read anything, and the full explanation is a hover away
     * for whoever wants it.
     *
     * The earlier wording was confusing — which they were: "Not in Drive yet" and "In
     * Drive, today" are both *statuses*, and a status you have to interpret
     * every time you glance at the toolbar is a tax on nothing. So a working
     * backup is a small tick with the detail in its tooltip, and words appear
     * **only when something needs pressing**.
     *
     * What must never happen is silence *and* a broken backup. That one case
     * is the whole reason this exists.
     */
    function showStamp() {
        const el = $('driveStamp');

        // The toolbar has room for a glyph and a tooltip; the Data panel has
        // room for the sentence. Same three states, said twice at two
        // different lengths, so neither can drift from the other.
        const line = $('driveWhen');

        let stamp = null;
        try { stamp = localStorage.getItem(STAMP_KEY); } catch (err) { stamp = null; }

        const show = (state, html, title, words) => {
            if (el) {
                el.dataset.state = state;
                el.innerHTML = html;
                el.title = title;
                el.classList.toggle('is-stale', state === 'warn');
            }
            if (line) line.textContent = words;
        };

        if (!configured()) {
            return show('none', '', '', 'Drive is not set up in this copy of CardVerse — see docs/DRIVE.md.');
        }

        if (!stamp) {
            // Auto cannot make the first push itself: Google only signs anyone
            // in when they ask it to. Say what to do, not what is true.
            if (autoOn()) {
                return show('warn', '<span class="stamp-glyph">☁️✖</span>',
                    'Auto is on, but Google will only sign you in when you ask it to — so the '
                    + 'very first copy has to be one you send. Press "To Drive" once; after that '
                    + 'Auto keeps it up to date on its own.',
                    'Auto is on, but the first copy has to be one you send. Press “To Drive” once; '
                    + 'after that it keeps itself up to date.');
            }
            return show('none', '', 'Nothing has been sent to Drive from this browser.',
                'Nothing has been sent to Drive from this browser yet.');
        }

        const then = new Date(stamp);
        const days = Math.floor((Date.now() - then.getTime()) / 86400000);
        const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';

        // A week without a copy is worth interrupting for; anything less is not.
        if (days >= 7) {
            return show('warn', '<span class="stamp-glyph">☁️✖</span>',
                'The last copy went to Drive on ' + dmyStamp(then) + '. If Auto is on, '
                + 'Google has probably stopped signing you in without being asked — one press '
                + 'fixes that.',
                'The last copy went up ' + when + ', on ' + dmyStamp(then) + '. If Auto is on, '
                + 'Google has probably stopped signing you in without being asked — one press fixes it.');
        }

        show('ok', '<span class="stamp-glyph">☁️✔</span>',
            'In Drive, ' + when + ' · ' + dmyStamp(then),
            'In Drive, ' + when + ' — ' + dmyStamp(then) + '.');
    }

    /* ------------------------------------------------------------------ *
     * Coming back to an empty browser
     * ------------------------------------------------------------------ *
     * The moment a Drive copy actually earns its keep: this machine has
     * nothing on its forms, and there may well be a set of scenarios sitting
     * in the folder. Without this you would have to know to press "From
     * Drive" — and someone whose browser has just been cleared is exactly the
     * person who does not.
     *
     * It offers rather than does. A pull replaces what is here, and a silent
     * one would be a network call and a sign-in nobody asked for — and a
     * sign-in popup not started by a click gets blocked anyway.
     *
     * **It must not be asked before the records are loaded.** They come out of
     * IndexedDB asynchronously, so for a moment after DOMContentLoaded the
     * store is legitimately empty and this would announce that a full set of
     * scenarios was missing.
     */
    function offerPull() {
        const bar = $('driveOffer');
        if (!bar) return;
        if (!configured() || typeof cardverseIsEmpty !== 'function' || !cardverseIsEmpty()) return;
        bar.hidden = false;
    }

    /* ------------------------------------------------------------------ */

    /**
     * The Settings screen rebuilds its buttons every time it is shown, so
     * this is exported as `CVDriveRewire` and called after each render. It
     * is safe to run repeatedly: a fresh element has no listeners yet.
     */
    function wire() {
        const up = $('drivePush');
        if (up) up.addEventListener('click', () => push(up));

        const down = $('drivePull');
        if (down) down.addEventListener('click', () => pull(down));

        const auto = $('driveAuto');
        if (auto) auto.addEventListener('click', () => setAuto(!autoOn()));

        paintAuto();
        showStamp();
    }

    function start() {
        wire();
        window.CVDriveRewire = wire;

        // The only way in from store.js. It is a no-op when the switch is off,
        // so the autosave needs to know nothing about any of this.
        window.CVDriveTouch = schedule;

        const offer = $('driveOfferPull');
        if (offer) {
            offer.addEventListener('click', () => {
                const bar = $('driveOffer');
                if (bar) bar.hidden = true;
                pull(offer);
            });
        }

        const dismiss = $('driveOfferNo');
        if (dismiss) {
            dismiss.addEventListener('click', () => {
                const bar = $('driveOffer');
                if (bar) bar.hidden = true;
            });
        }

        // Only once app.js says the records are in memory. Either order is
        // possible depending on script order, so both are handled.
        if (window.CVReady) offerPull();
        else document.addEventListener('cardverse:ready', offerPull, { once: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
