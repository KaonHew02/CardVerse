/**
 * CardVerse — boot.
 *
 * Order matters and is deliberate: stores are read before anything paints,
 * the theme is applied before the first frame, the games not yet built are
 * registered as stubs so the lobby shows the whole plan, and only then does
 * the first screen render. `cardverse:ready` is the signal drive.js waits
 * for before offering to restore an empty browser.
 */

(() => {
    'use strict';

    const CV = window.CV;

    /** The rest of the spec, greyed in the lobby until each one is built. */
    function registerStubs() {
        const R = CV.Registry;
        // English names and blurbs; i18n.localize() translates them in place.
        // Blackjack is deliberately absent: 21 covers the same table, and
        // 百家乐 took its place in the lineup. Its engine still loads, because
        // 21 is built on it.
    }

    function wireGlobal() {
        // Any element with data-go="screen" navigates; data-game rides along.
        CV.UI.on(document.body, '[data-go]', (el) => {
            CV.UI.go(el.dataset.go, el.dataset.game ? { game: el.dataset.game } : {});
        });

        // Storage failures become a visible strip, never a silent loss.
        CV.Store.onError((err) => {
            const strip = document.getElementById('storeAlert');
            if (!strip) return;
            if (!err) { strip.hidden = true; return; }
            strip.hidden = false;
            strip.textContent = CV.t('storage.failing');
        });

        // A record that was edited outside the game says so, rather than
        // silently reverting and leaving the player to wonder.
        CV.Store.onTamper(() => {
            const strip = document.getElementById('storeAlert');
            if (!strip) return;
            strip.hidden = false;
            strip.textContent = CV.t('storage.tampered');
        });
    }

    /**
     * Seal the namespace once everything has registered.
     *
     * Every `CV.X = …` in the hub runs while its file loads, so by the time
     * boot finishes nothing legitimate writes here again. Freezing therefore
     * costs nothing and takes away the easiest console edit there is —
     * replacing a whole module, `CV.Profile = {…}`, or swapping one method for
     * a version that always says yes.
     *
     * It does not make the game uncheatable, and it is not meant to: the state
     * behind these modules still lives in the same browser as the person
     * reading this. It raises the floor. What actually protects *other* players
     * is that the host never trusts a guest's numbers — see net.js and
     * js/ui/room.js, where a guest is seated with a fixed stack no matter what
     * their own profile claims.
     */
    function lockApi() {
        for (const key of Object.keys(CV)) {
            const part = CV[key];
            const kind = typeof part;
            if (part && (kind === 'object' || kind === 'function')) {
                try { Object.freeze(part); } catch (_) { /* nothing to lose if it refuses */ }
            }
        }
        try { Object.freeze(CV); } catch (_) { /* as above */ }
    }

    function boot() {
        // Before anything reads a store: seal whatever this browser already
        // holds, so an existing player keeps their record and an unsealed one
        // stops being acceptable from the next boot onward.
        CV.Store.sealAll();

        CV.Settings.apply();
        CV.Profile.load();
        CV.Stats.load();
        CV.Achievements.load();
        CV.Missions.load();
        CV.Cosmetics.load();
        CV.Cosmetics.applyToDocument();

        registerStubs();
        // After the stubs, because localize() walks the whole registry; before
        // the first render, because every screen paints from it.
        CV.I18n.init();
        wireGlobal();

        CV.UI.go('home');

        window.CVReady = true;
        document.dispatchEvent(new CustomEvent('cardverse:ready'));

        // After the ready event: drive.js only ever touches window globals, but
        // a listener that wanted to register a module should still get to.
        lockApi();

        const login = CV.Missions.loginState();
        if (login.claimable && !CV.Store.isEmpty()) {
            setTimeout(() => CV.UI.toast(CV.t('miss.loginWaiting', { n: login.day }), 'info', 3500), 600);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
