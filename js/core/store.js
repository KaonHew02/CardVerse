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

    let lastError = null;
    const listeners = [];

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
        const text = raw(key);
        if (text === null || text === '') return fallback;
        try {
            const value = JSON.parse(text);
            return (value === null || value === undefined) ? fallback : value;
        } catch (_) {
            // Corrupt JSON is treated as absent. Throwing here would brick the
            // whole hub over one bad key.
            return fallback;
        }
    }

    function set(key, value) {
        return write(key, JSON.stringify(value));
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
        return !raw(KEYS.profile) && !raw(KEYS.stats) && !raw(KEYS.history);
    }

    window.CV = window.CV || {};
    window.CV.Store = {
        KEYS, BACKUP_STORES,
        raw, write, get, set, remove, usage, isEmpty,
        onError(fn) { listeners.push(fn); },
        get lastError() { return lastError; },
    };

    // drive.js asks this by name, before app.js has necessarily run.
    window.cardverseIsEmpty = isEmpty;
})();
