/**
 * CardVerse — Export, Import, and the envelope drive.js sends.
 *
 * One file: `cardverse-YYYY-MM-DD.json`, shaped
 *
 *     { format: 'cardverse.backup', version: 1, exported: ISO, stores: { key: value } }
 *
 * carrying every key in `CV.Store.BACKUP_STORES` and nothing else. Settings
 * stay behind on purpose (see settings.js).
 *
 * **Import replaces, never merges.** Two records of the same player cannot be
 * merged without guessing which games are the same games, and guessing wrong
 * doubles a win count. The dialog says what is in both copies before anyone
 * agrees, the apply is all-or-nothing with a rollback, and the page reloads
 * afterwards because every module read its store once at start-up.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const FORMAT  = 'cardverse.backup';
    const VERSION = 1;

    function envelope() {
        const stores = {};
        for (const key of CV.Store.BACKUP_STORES) {
            const value = CV.Store.get(key, null);
            if (value !== null) stores[key] = value;
        }
        return { format: FORMAT, version: VERSION, exported: new Date().toISOString(), stores };
    }

    /** "a level 12 player with 3,400 coins and 86 games" — for the confirm text. */
    function summary(env) {
        const K = CV.Store.KEYS;
        const p = (env.stores && env.stores[K.profile]) || null;
        if (!p) return 'no player record';
        const s = (env.stores && env.stores[K.stats]) || {};
        const games = Object.values(s).reduce((n, g) => n + (g.played || 0), 0);
        return `${CV.UI.esc(p.name || 'a player')} at level ${p.level || 1} with ${CV.UI.fmt(p.coins || 0)} coins and ${CV.UI.fmt(games)} games`;
    }

    function valid(env) {
        return !!env && env.format === FORMAT && typeof env.stores === 'object' && env.stores !== null;
    }

    /**
     * Write every store from the envelope. Snapshots first; on any failure
     * puts every store back. Half an imported record is worse than none.
     */
    function apply(env) {
        const before = {};
        for (const key of CV.Store.BACKUP_STORES) before[key] = CV.Store.raw(key);

        let ok = true;
        for (const key of CV.Store.BACKUP_STORES) {
            const has = Object.prototype.hasOwnProperty.call(env.stores, key);
            ok = has ? CV.Store.set(key, env.stores[key]) : CV.Store.remove(key);
            if (!ok) break;
        }

        if (!ok) {
            for (const key of CV.Store.BACKUP_STORES) {
                if (before[key] === null) CV.Store.remove(key);
                else CV.Store.write(key, before[key]);
            }
            CV.UI.say('Nothing was changed', 'The browser refused one of the writes, so the previous record was put back in full.');
            return false;
        }

        // Import restores the profile's own name into the header before the
        // reload so the confirmation the player sees is already theirs.
        CV.UI.toast('Loaded — restarting…', 'ok', 1200);
        setTimeout(() => location.reload(), 500);
        return true;
    }

    function exportBackup(btn) {
        const env  = envelope();
        const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const d    = new Date();
        a.href = url;
        a.download = `cardverse-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        CV.UI.flash(btn, '✅ Exported');
    }

    function importBackup(file) {
        const reader = new FileReader();
        reader.onload = () => {
            let env = null;
            try { env = JSON.parse(reader.result); } catch (_) { env = null; }
            if (!valid(env)) {
                return CV.UI.say('That file is not a CardVerse backup',
                    'Pick a file that Export made — it is named cardverse-<i>date</i>.json.');
            }
            CV.UI.confirm(
                'Replace what is here with this file?',
                `The file holds ${summary(env)}. This browser holds ${summary(envelope())}, and all of it will be replaced.`,
                'Use the file', () => apply(env), true);
        };
        reader.onerror = () => CV.UI.say('Could not read the file', 'The browser refused to open it.');
        reader.readAsText(file);
    }

    function eraseAll() {
        for (const key of Object.values(CV.Store.KEYS)) CV.Store.remove(key);
        try { localStorage.removeItem('cardverse.drive.lastPush'); } catch (_) { /* fine */ }
        location.reload();
    }

    CV.Save = { FORMAT, envelope, summary, valid, apply, exportBackup, importBackup, eraseAll };

    // The names drive.js was written against.
    window.backupEnvelope = envelope;
    window.backupSummary  = summary;
    window.backupApply    = apply;
})();
