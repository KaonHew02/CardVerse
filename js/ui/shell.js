/**
 * CardVerse — the shell: screens, toasts, dialogs, the top bar.
 *
 * Screens are `<section class="screen" id="screen-NAME">` elements that exist
 * in index.html from the start; `go()` shows one and hides the rest. There is
 * no router and no history API because the app has one URL and a "Back"
 * button that means "to the lobby" — a browser Back that walked through six
 * screens of settings would be worse than none.
 *
 * Every screen registers `{ render(params), leave() }`. `render` repaints
 * from state each time it is shown, so no screen has to watch for changes
 * made elsewhere; `leave` is for tearing down timers and tables.
 */

(() => {
    'use strict';

    const screens = new Map();
    let current = null;
    let toastTimer = null;

    const $ = (id) => document.getElementById(id);

    const esc = (s) => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');

    /** "+1,200" / "−300" / "0", for coin deltas. */
    const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

    const pct = (n) => (Math.round(n * 10) / 10).toFixed(1) + '%';

    const dmyDate = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    };

    /* ---- screens -------------------------------------------------------- */

    function screen(name, def) {
        screens.set(name, Object.assign({ render() {}, leave() {} }, def));
    }

    function go(name, params = {}) {
        const def = screens.get(name);
        if (!def) { console.warn('No screen', name); return; }

        if (current && screens.get(current)) {
            try { screens.get(current).leave(); } catch (err) { console.error(err); }
        }
        current = name;
        document.body.dataset.screen = name;

        document.querySelectorAll('.screen').forEach((el) => {
            el.hidden = el.id !== 'screen-' + name;
        });
        const host = $('screen-' + name);
        if (host) host.scrollTop = 0;
        window.scrollTo(0, 0);

        try { def.render(params); } catch (err) { console.error('[screen ' + name + ']', err); }
        header();
    }

    const back = () => go('home');

    /* ---- top bar -------------------------------------------------------- */

    function header() {
        const CV = window.CV;
        if (!CV.Profile) return;
        const p = CV.Profile.get();
        const prog = CV.Profile.levelProgress();
        const title = CV.Profile.titleFor(p.level);

        const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
        set('hdrAvatar', p.avatar);
        set('hdrName', p.name);
        set('hdrLevel', 'Lv ' + p.level + ' · ' + title.name);
        // While seated, show the seat's live balance rather than the stored
        // profile: the stake leaves the seat on every bet and only returns to
        // the profile when the round settles. On a slot machine that gap is
        // visible on every single spin.
        const table = CV.Play && CV.Play.table;
        const seated = table && table.engine && table.engine.youSeat >= 0 && !table.engine.over
            ? table.engine.seats[table.engine.youSeat] : null;
        set('hdrCoins', fmt(seated ? seated.coins : p.coins));
        const bar = $('hdrXp');
        if (bar) bar.style.width = prog.pct + '%';
        const xp = $('hdrXpText');
        if (xp) xp.textContent = fmt(prog.xp) + ' / ' + fmt(prog.need) + ' XP';

        const badge = $('hdrBadge');
        if (badge && CV.Missions) {
            const n = CV.Missions.unclaimed() + (CV.Missions.loginState().claimable ? 1 : 0);
            badge.textContent = n;
            badge.hidden = n === 0;
        }
    }

    /* ---- toasts --------------------------------------------------------- */

    function toast(msg, kind = 'info', ms = 2600) {
        const host = $('toast');
        if (!host) return;
        host.textContent = msg;
        host.dataset.kind = kind;
        host.hidden = false;
        host.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            host.classList.remove('show');
            setTimeout(() => { host.hidden = true; }, 250);
        }, ms);
    }

    /* ---- dialogs -------------------------------------------------------- */

    /**
     * One dialog for every question the app asks. `field` adds a text input
     * whose value is passed to `onYes`; otherwise `onYes` takes nothing.
     */
    function dialog({ title, body, cta = null, danger = false, field = null, onYes = null, cancel = null }) {
        const host = $('dialog');
        if (!host) return;
        $('dialogTitle').textContent = title;
        $('dialogBody').innerHTML = body;

        const input = $('dialogField');
        input.hidden = field === null;
        if (field !== null) { input.value = field; }

        const yes = $('dialogYes');
        const no  = $('dialogNo');
        // Defaults come from the pack, not from a literal — the dialog is
        // the one place every screen shares, so an English 'OK' here leaks
        // into every language.
        yes.textContent = cta || window.CV.t('ok');
        yes.classList.toggle('danger', danger);
        no.hidden = onYes === null;
        no.textContent = cancel || window.CV.t('cancel');

        yes.onclick = () => {
            const value = field === null ? undefined : input.value;
            closeDialog();
            if (onYes) onYes(value);
        };
        no.onclick = closeDialog;

        host.hidden = false;
        if (field !== null) setTimeout(() => input.select(), 30);
        else setTimeout(() => yes.focus(), 30);
    }

    function closeDialog() {
        const host = $('dialog');
        if (host) host.hidden = true;
    }

    const say     = (title, body) => dialog({ title, body });
    const confirm = (title, body, cta, onYes, danger = false) => dialog({ title, body, cta, onYes, danger });
    const prompt  = (title, body, value, cta, onYes) => dialog({ title, body, cta, field: value, onYes });

    /* ---- buttons -------------------------------------------------------- */

    /** Swap a button's label for a moment (drive.js relies on this). */
    function flash(btn, html, ms = 1400) {
        if (!btn) return;
        if (!btn.dataset.rest) btn.dataset.rest = btn.innerHTML;
        btn.innerHTML = html;
        btn.disabled = true;
        clearTimeout(btn._flash);
        btn._flash = setTimeout(() => {
            btn.innerHTML = btn.dataset.rest;
            btn.disabled = false;
        }, ms);
    }

    /**
     * The how-to-play card. Shown once before a player's first hand of a
     * game, and on demand from the set-up screen after that — a player who
     * has never seen 五小 should not first meet it as a surprise payout.
     *
     * `game.rules` is a list of translation keys, so the card follows the
     * language like everything else.
     */
    function showRules(game, onOk) {
        const CV = window.CV;
        const first = CV.Stats.forGame(game.code).played === 0;
        const lines = (game.rules || []).map((key) => `<li>${esc(CV.t(key))}</li>`).join('');
        dialog({
            title: CV.t('rules.title', { game: game.name }),
            body: `${first ? `<p>${esc(CV.t('rules.first'))}</p>` : ''}<ul class="rules-list">${lines}</ul>`,
            cta: onOk ? CV.t('rules.play') : CV.t('ok'),
            onYes: onOk || null,
        });
    }

    /** Delegated click handling: `on(root, '[data-act]', fn)`. */
    function on(root, selector, fn, type = 'click') {
        root.addEventListener(type, (e) => {
            const el = e.target.closest(selector);
            if (el && root.contains(el)) fn(el, e);
        });
    }

    window.CV = window.CV || {};
    window.CV.UI = {
        $, esc, fmt, signed, pct, dmyDate,
        screen, go, back, header, toast,
        dialog, closeDialog, say, confirm, prompt, flash, on, showRules,
        get current() { return current; },
    };

    // drive.js calls these by their MoneyFlow/FinSim names.
    window.askConfirm  = confirm;
    window.dmyDate     = dmyDate;
    window.flashButton = flash;
    window.backupSay   = say;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDialog();
    });
})();
