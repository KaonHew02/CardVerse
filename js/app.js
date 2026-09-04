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
        R.stub('bullbull',   '斗牛',   '🐮', 'Bull Bull. Three to ten, two to score.', [2, 6]);
        R.stub('mahjong',    'Mahjong', '🀄', 'Hong Kong style. Four sets and a pair.', [4, 4]);
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
    }

    function boot() {
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

        const login = CV.Missions.loginState();
        if (login.claimable && !CV.Store.isEmpty()) {
            setTimeout(() => CV.UI.toast(CV.t('miss.loginWaiting', { n: login.day }), 'info', 3500), 600);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
