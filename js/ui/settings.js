/**
 * CardVerse — settings: the store and the screen.
 *
 * Preferences are deliberately **not** in the backup envelope (see store.js
 * `BACKUP_STORES`). A theme travels with the device, not the player, and an
 * import that flipped someone's browser to dark mode would feel like a fault.
 */

(() => {
    'use strict';

    const CV  = window.CV;
    const KEY = () => CV.Store.KEYS.settings;

    const DEFAULTS = {
        theme: 'auto',        // auto | dark | light
        sound: true,
        fastAnim: false,
        hints: true,          // show the AI's basic-strategy hint at the table
        aiLevel: 'normal',
        aiCount: 2,
        guests: 0,            // extra humans sharing this device
        guestNames: [],
    };

    let state = null;

    const get = () => state || (state = Object.assign({}, DEFAULTS, CV.Store.get(KEY(), {}) || {}));

    function set(key, value) {
        get()[key] = value;
        CV.Store.set(KEY(), state);
        apply();
        return state;
    }

    function apply() {
        const s = get();
        const root = document.documentElement;
        if (s.theme === 'auto') delete root.dataset.theme;
        else root.dataset.theme = s.theme;
        root.dataset.fast = s.fastAnim ? '1' : '0';
    }

    /* ---- screen ---------------------------------------------------------- */

    function render() {
        const { $, esc } = CV.UI;
        const s = get();
        const host = $('settingsBody');
        const p = CV.Profile.get();

        host.innerHTML = `
            <div class="card-panel">
                <h3>Appearance</h3>
                <label class="row-opt">
                    <span>Theme</span>
                    <select data-set="theme">
                        <option value="auto"  ${s.theme === 'auto'  ? 'selected' : ''}>Follow system</option>
                        <option value="dark"  ${s.theme === 'dark'  ? 'selected' : ''}>Dark</option>
                        <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option>
                    </select>
                </label>
                <label class="row-opt">
                    <span>Fast animations</span>
                    <input type="checkbox" data-set="fastAnim" ${s.fastAnim ? 'checked' : ''}>
                </label>
                <label class="row-opt">
                    <span>Sound effects</span>
                    <input type="checkbox" data-set="sound" ${s.sound ? 'checked' : ''}>
                </label>
            </div>

            <div class="card-panel">
                <h3>Table</h3>
                <label class="row-opt">
                    <span>Show strategy hints</span>
                    <input type="checkbox" data-set="hints" ${s.hints ? 'checked' : ''}>
                </label>
                <label class="row-opt">
                    <span>Default AI difficulty</span>
                    <select data-set="aiLevel">
                        ${Object.entries(CV.AI_LEVELS).map(([k, v]) =>
                            `<option value="${k}" ${s.aiLevel === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
                    </select>
                </label>
            </div>

            <div class="card-panel">
                <h3>Player</h3>
                <label class="row-opt">
                    <span>Nickname</span>
                    <input type="text" id="setName" maxlength="16" value="${esc(p.name)}">
                </label>
                <p class="muted small">Avatars are chosen in your Profile.</p>
            </div>

            <div class="card-panel">
                <h3>Your data</h3>
                <p class="muted small">Everything lives in this browser. Export keeps a copy anywhere you like; Drive keeps one in your Google Drive.</p>
                <div class="btn-row">
                    <button class="btn" id="backupExport">📤 Export</button>
                    <button class="btn" id="backupImportBtn">📥 Import</button>
                    <input type="file" id="backupImport" accept="application/json,.json" hidden>
                </div>
                <div class="btn-row">
                    <button class="btn" id="drivePush">☁️ To Drive</button>
                    <button class="btn" id="drivePull">⬇️ From Drive</button>
                    <button class="btn" id="driveAuto" aria-pressed="false">Auto: off</button>
                    <span id="driveStamp" class="drive-stamp" title=""></span>
                </div>
                <p class="muted small" id="driveWhen"></p>
                <p class="muted small" id="storeUsage"></p>
            </div>

            <div class="card-panel danger-zone">
                <h3>Danger zone</h3>
                <p class="muted small">Resets are permanent. Export first.</p>
                <div class="btn-row">
                    <button class="btn ghost" id="resetStats">Reset statistics</button>
                    <button class="btn danger" id="resetAll">Start over</button>
                </div>
            </div>

            <p class="muted small center">CardVerse · One World. Every Game. · Virtual coins only — nothing here is worth money, and nothing ever will be.</p>
        `;

        host.querySelectorAll('[data-set]').forEach((el) => {
            el.addEventListener('change', () => {
                const key = el.dataset.set;
                set(key, el.type === 'checkbox' ? el.checked : el.value);
                CV.UI.toast('Saved', 'ok', 1200);
            });
        });

        $('setName').addEventListener('change', (e) => {
            if (CV.Profile.rename(e.target.value)) { CV.UI.header(); CV.UI.toast('Nickname saved', 'ok', 1200); }
            else e.target.value = p.name;
        });

        $('backupExport').addEventListener('click', (e) => CV.Save.exportBackup(e.currentTarget));
        $('backupImportBtn').addEventListener('click', () => $('backupImport').click());
        $('backupImport').addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) CV.Save.importBackup(f);
            e.target.value = '';
        });

        $('resetStats').addEventListener('click', () => {
            CV.UI.confirm('Reset every statistic?',
                'Wins, losses, streaks and the game history for every game go to zero. Coins, level and achievements stay.',
                'Reset statistics', () => { CV.Stats.reset(); CV.UI.toast('Statistics reset', 'ok'); }, true);
        });

        $('resetAll').addEventListener('click', () => {
            CV.UI.confirm('Start CardVerse over?',
                'Profile, coins, level, statistics, achievements, missions and cosmetics are all erased from this browser. A Drive copy, if you made one, is not touched.',
                'Erase everything', () => CV.Save.eraseAll(), true);
        });

        const usage = CV.Store.usage();
        $('storeUsage').textContent = `This browser holds ${(usage / 1024).toFixed(1)} KB of CardVerse data.`;

        // drive.js wires its buttons once at load; the screen is rebuilt on each
        // visit, so ask it to re-attach.
        if (typeof window.CVDriveRewire === 'function') window.CVDriveRewire();
    }

    CV.Settings = { DEFAULTS, get, set, apply };
    CV.UI.screen('settings', { render });
})();
