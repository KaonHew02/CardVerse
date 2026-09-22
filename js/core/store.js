/**
 * CardVerse — where the player's record lives.
 *
 * localStorage, deliberately. A profile, per-game statistics and an
 * achievement list are a few kilobytes even after years of play, so the
 * IndexedDB machinery MoneyFlow needs for a ledger would be cost without
 * benefit here.
 *
 * The one lesson carried over from MoneyFlow: **every write goes through
 * `write()`**, which remembers whether it landed. A silent `catch {}` around
 * setItem is right about a private window and badly wrong about a full quota —
 * the app keeps running, shows the coins you just won, and loses them on
 * reload. A new persisted store must be added to `KEYS` below, or it is
 * neither watched nor backed up.
 */

(() => {
    'use strict';

    const KEYS = {
        profile:      'cardverse.profile.v1',
        stats:        'cardverse.stats.v1',
        achievements: 'cardverse.achievements.v1',
        missions:     'cardverse.missions.v1',
        cosmetics:    'cardverse.cosmetics.v1',
        history:      'cardverse.history.v1',
        settings:     'cardverse.settings.v1',
    };

    /** Preferences are excluded from backup on purpose — see save.js. */
    const BACKUP_STORES = [
        KEYS.profile, KEYS.stats, KEYS.achievements,
        KEYS.missions, KEYS.cosmetics, KEYS.history,
    ];

    /**
     * Every stored record carries a fingerprint of itself.
     *
     * This is the answer to "he pasted something in the console and it was
     * still there after a refresh". A DOM edit never survives a reload — the
     * screens repaint from state — so anything that *does* survive was written
     * straight into localStorage. A record whose fingerprint does not match its
     * contents was not written by this game, and is not loaded.
     *
     * **What this is not.** The fingerprint is computed by code the player can
     * read, so somebody who reads it can compute one too. It stops a pasted
     * `localStorage.setItem(...)`; it does not stop a programmer who decides to
     * sit down with the source for ten minutes. Nothing that runs in the
     * player's own browser can, which is why the things that matter — what a
     * guest's coins are worth at someone else's table, what a host may put on a
     * guest's screen — are enforced in net.js and safe.js instead of here.
     *
     * A record is never destroyed over this. It is set aside under
     * `<key>.rejected` first, so a false positive costs a message rather than a
     * player's history.
     */
    const SEAL_SALT = 2166136261;

    /** cyrb53 — short, fast, and far beyond what a hand-edit will collide with. */
    function fingerprint(text) {
        let h1 = 0xdeadbeef ^ SEAL_SALT;
        let h2 = 0x41c6ce57 ^ SEAL_SALT;
        for (let i = 0; i < text.length; i++) {
            const ch = text.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    }

    const seal = (key, json) => fingerprint(key + '\u0000' + json) + '.' + json;

    /**
     * Split a stored string back into its record.
     *
     * Every store CardVerse writes is an object or an array, so a value that
     * starts with `{` or `[` is one written before sealing existed. Those are
     * honoured and re-sealed by the next write — an update must not cost
     * anybody their history.
     */
    function unseal(key, stored) {
        if (stored === null || stored === '') return { json: null };
        const head = stored[0];
        if (head === '{' || head === '[') {
            // Unsealed, which means one of two things: a record written before
            // this existed, or a record somebody typed in. They look identical,
            // so the only way to tell them apart is *when* — `sealAll()` runs
            // once on the first boot after the update, re-seals what it finds,
            // and drops the flag that closes this door behind it.
            return legacyOk() ? { json: stored, legacy: true } : { json: stored, tampered: true };
        }
        const dot = stored.indexOf('.');
        if (dot < 1) return { json: stored, tampered: true };
        const json = stored.slice(dot + 1);
        if (stored.slice(0, dot) !== fingerprint(key + '\u0000' + json)) return { json, tampered: true };
        return { json };
    }

    /**
     * Set once the existing records have been sealed. Its absence is what makes
     * an unsealed record acceptable, so it is written exactly once per browser.
     */
    const SEALED_FLAG = 'cardverse.sealed.v1';
    let legacy = null;

    function legacyOk() {
        if (legacy === null) {
            try { legacy = localStorage.getItem(SEALED_FLAG) === null; }
            catch (_) { legacy = true; }
        }
        return legacy;
    }

    /**
     * Seal whatever this browser already holds, then refuse unsealed records
     * from here on. Runs before anything reads a store — see app.js.
     */
    function sealAll() {
        if (!legacyOk()) return;
        for (const key of Object.values(KEYS)) {
            const stored = raw(key);
            if (stored && (stored[0] === '{' || stored[0] === '[')) write(key, seal(key, stored));
        }
        try { localStorage.setItem(SEALED_FLAG, '1'); } catch (_) { /* stays open one more boot */ }
        legacy = false;
    }

    let lastError = null;
    const listeners = [];
    const tamperListeners = [];
    const tampered = [];

    function reportTamper(key) {
        if (!tampered.includes(key)) tampered.push(key);
        for (const fn of tamperListeners) { try { fn(key); } catch (_) { /* a bad listener must not break a load */ } }
    }

    function report(err) {
        lastError = err;
        for (const fn of listeners) { try { fn(err); } catch (_) { /* a bad listener must not break a save */ } }
    }

    function raw(key) {
        try { return localStorage.getItem(key); }
        catch (err) { report(err); return null; }
    }

    /**
     * The only door out to storage. Returns true when the value is genuinely on
     * disk; a false is surfaced to the player rather than swallowed.
     */
    function write(key, value) {
        try {
            localStorage.setItem(key, value);
            if (lastError) report(null);
            if (typeof window.CVDriveTouch === 'function') window.CVDriveTouch();
            return true;
        } catch (err) {
            report(err);
            return false;
        }
    }

    function get(key, fallback) {
        const stored = raw(key);
        if (stored === null || stored === '') return fallback;

        const opened = unseal(key, stored);
        if (opened.tampered) {
            // Set the record aside rather than letting the next write bury it,
            // then behave as though the key were absent.
            try {
                if (localStorage.getItem(key + '.rejected') === null) {
                    localStorage.setItem(key + '.rejected', stored);
                }
            } catch (_) { /* nothing more to do for it */ }
            reportTamper(key);
            return fallback;
        }
        const text = opened.json;
        if (text === null || text === '') return fallback;
        try {
            const value = JSON.parse(text);
            if (value === null || value === undefined) return fallback;
            // Everything here was JSON a moment ago, and it did not necessarily
            // start life in this browser: Import writes these keys straight from
            // a file, and the Drive pull from a folder. JSON can carry a
            // `__proto__` key, and every module builds its state by
            // `Object.assign`-ing over what this function returns — which is
            // exactly the call that turns such a key into a prototype swap. One
            // strip here covers all seven stores and all three ways in.
            return (typeof value === 'object') ? window.CV.Safe.clean(value) : value;
        } catch (_) {
            // Corrupt JSON is treated as absent. Throwing here would brick the
            // whole hub over one bad key.
            return fallback;
        }
    }

    function set(key, value) {
        return write(key, seal(key, JSON.stringify(value)));
    }

    function remove(key) {
        try { localStorage.removeItem(key); return true; }
        catch (err) { report(err); return false; }
    }

    /** Rough bytes used by CardVerse's own keys, for the storage warning. */
    function usage() {
        let bytes = 0;
        for (const key of Object.values(KEYS)) {
            const text = raw(key);
            if (text) bytes += key.length + text.length;
        }
        return bytes;
    }

    /**
     * True when this browser holds no CardVerse record at all — the signal
     * drive.js uses to offer a pull instead of silently starting you over.
     */
    function isEmpty() {
        return !usable(KEYS.profile) && !usable(KEYS.stats) && !usable(KEYS.history);
    }

    /**
     * Present *and* readable. A rejected record is still sitting in storage as
     * bytes, and counting those as a record is how a player whose save was
     * refused ends up with a blank profile and no offer to restore the good
     * copy from Drive — at exactly the moment they need it most.
     */
    function usable(key) {
        const stored = raw(key);
        if (stored === null || stored === '') return false;
        return !unseal(key, stored).tampered;
    }

    /** The set-aside copies, so "erase everything" means everything. */
    function rejectedKeys() {
        return Object.values(KEYS).map((k) => k + '.rejected').filter((k) => raw(k) !== null);
    }

    window.CV = window.CV || {};
    window.CV.Store = {
        KEYS, BACKUP_STORES,
        raw, write, get, set, remove, usage, isEmpty,
        seal, unseal, fingerprint, sealAll, usable, rejectedKeys,
        onError(fn) { listeners.push(fn); },
        /**
         * Registration order must not decide whether the player is told. The
         * stores are read during boot and the screens are wired after it, so a
         * listener added later still hears about what was already found.
         */
        onTamper(fn) {
            tamperListeners.push(fn);
            for (const key of tampered) { try { fn(key); } catch (_) { /* as above */ } }
        },
        get tampered() { return tampered.slice(); },
        get lastError() { return lastError; },
    };

    // drive.js asks this by name, before app.js has necessarily run.
    window.cardverseIsEmpty = isEmpty;
})();
