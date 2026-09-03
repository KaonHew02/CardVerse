/**
 * CardVerse — settings: the store and the screen.
 *
 * Preferences are deliberately **not** in the backup envelope (see store.js
 * `BACKUP_STORES`). A theme and a language travel with the device, not with
 * the player; an import that flipped someone's phone to another language
 * would read as a fault rather than a restore. The language therefore lives
 * under its own `cardverse.lang` key, owned by i18n.js.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

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
        const { $, esc, fmt } = CV.UI;
        const s = get();
        const host = $('settingsBody');
        const p = CV.Profile.get();

        host.innerHTML = `
            <div class="card-panel">
                <h3>${esc(t('set.appearance'))}</h3>
                <label class="row-opt">
                    <span>${esc(t('set.language'))}</span>
                    <select data-set="lang">
                        ${CV.I18n.ORDER.map((code) =>
                            `<option value="${code}" ${CV.I18n.lang === code ? 'selected' : ''}>${esc(CV.I18n.name(code))}</option>`).join('')}
                    </select>
                </label>
                <label class="row-opt">
                    <span>${esc(t('set.theme'))}</span>
                    <select data-set="theme">
                        <option value="auto"  ${s.theme === 'auto'  ? 'selected' : ''}>${esc(t('set.themeAuto'))}</option>
                        <option value="dark"  ${s.theme === 'dark'  ? 'selected' : ''}>${esc(t('set.themeDark'))}</option>
                        <option value="light" ${s.theme === 'light' ? 'selected' : ''}>${esc(t('set.themeLight'))}</option>
                    </select>
                </label>
                <label class="row-opt">
                    <span>${esc(t('set.fast'))}</span>
                    <input type="checkbox" data-set="fastAnim" ${s.fastAnim ? 'checked' : ''}>
                </label>
                <label class="row-opt">
                    <span>${esc(t('set.sound'))}</span>
                    <input type="checkbox" data-set="sound" ${s.sound ? 'checked' : ''}>
                </label>
            </div>

            <div class="card-panel">
                <h3>${esc(t('set.table'))}</h3>
                <label class="row-opt">
                    <span>${esc(t('set.hints'))}</span>
                    <input type="checkbox" data-set="hints" ${s.hints ? 'checked' : ''}>
                </label>
                <label class="row-opt">
                    <span>${esc(t('set.aiLevel'))}</span>
                    <select data-set="aiLevel">
                        ${Object.entries(CV.AI_LEVELS).map(([k, v]) =>
                            `<option value="${k}" ${s.aiLevel === k ? 'selected' : ''}>${v.icon} ${esc(v.label)}</option>`).join('')}
                    </select>
                </label>
            </div>

            <div class="card-panel">
                <h3>${esc(t('set.player'))}</h3>
                <label class="row-opt">
                    <span>${esc(t('prof.nickname'))}</span>
                    <input type="text" id="setName" maxlength="16" value="${esc(p.name)}">
                </label>
                <p class="muted small">${esc(t('set.avatarNote'))}</p>
            </div>

            <div class="card-panel">
                <h3>${esc(t('set.data'))}</h3>
                <p class="muted small">${esc(t('set.dataNote'))}</p>
                <div class="btn-row">
                    <button class="btn" id="backupExport">${esc(t('set.export'))}</button>
                    <button class="btn" id="backupImportBtn">${esc(t('set.import'))}</button>
                    <input type="file" id="backupImport" accept="application/json,.json" hidden>
                </div>
                <div class="btn-row">
                    <button class="btn" id="drivePush">${esc(t('set.toDrive'))}</button>
                    <button class="btn" id="drivePull">${esc(t('set.fromDrive'))}</button>
                    <button class="btn" id="driveAuto" aria-pressed="false">${esc(t('set.auto'))}</button>
                    <span id="driveStamp" class="drive-stamp" title=""></span>
                </div>
                <p class="muted small" id="driveWhen"></p>
                <p class="muted small" id="storeUsage"></p>
            </div>

            <div class="card-panel danger-zone">
                <h3>${esc(t('set.danger'))}</h3>
                <p class="muted small">${esc(t('set.dangerNote'))}</p>
                <div class="btn-row">
                    <button class="btn ghost" id="resetStats">${esc(t('set.resetStats'))}</button>
                    <button class="btn danger" id="resetAll">${esc(t('set.startOver'))}</button>
                </div>
            </div>

            <p class="muted small center">${esc(t('set.footer'))}</p>
        `;

        host.querySelectorAll('[data-set]').forEach((el) => {
            el.addEventListener('change', () => {
                const key = el.dataset.set;

                // Language is not a game setting — it lives in i18n.js, and
                // changing it repaints rather than saving quietly, because
                // every visible string has just changed underneath.
                if (key === 'lang') {
                    if (CV.I18n.set(el.value)) {
                        CV.UI.header();
                        CV.UI.go('settings');
                        CV.UI.toast(t('set.saved'), 'ok', 1200);
                    }
                    return;
                }

                set(key, el.type === 'checkbox' ? el.checked : el.value);
                CV.UI.toast(t('set.saved'), 'ok', 1200);
            });
        });

        $('setName').addEventListener('change', (e) => {
            if (CV.Profile.rename(e.target.value)) { CV.UI.header(); CV.UI.toast(t('set.nickSaved'), 'ok', 1200); }
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
            CV.UI.confirm(t('set.resetStatsTitle'), t('set.resetStatsBody'),
                t('set.resetStats'), () => { CV.Stats.reset(); CV.UI.toast(t('set.resetDone'), 'ok'); }, true);
        });

        $('resetAll').addEventListener('click', () => {
            CV.UI.confirm(t('set.startOverTitle'), t('set.startOverBody'),
                t('set.eraseAll'), () => CV.Save.eraseAll(), true);
        });

        const usage = CV.Store.usage();
        $('storeUsage').textContent = t('set.usage', { n: (usage / 1024).toFixed(1) });

        // drive.js wires its buttons once at load; the screen is rebuilt on each
        // visit, so ask it to re-attach.
        if (typeof window.CVDriveRewire === 'function') window.CVDriveRewire();
    }

    CV.Settings = { DEFAULTS, get, set, apply };
    CV.UI.screen('settings', { render });
})();
