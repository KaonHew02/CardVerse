/**
 * CardVerse — the profile screen and the cosmetics shop inside it.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { $, esc, fmt, pct, dmyDate } = CV.UI;

    let tab = 'avatar';

    function render() {
        const p = CV.Profile.get();
        const prog = CV.Profile.levelProgress();
        const title = CV.Profile.titleFor(p.level);
        const fav = p.favourite ? CV.Registry.get(p.favourite) : null;
        const recent = CV.Stats.recent(12);

        $('profileBody').innerHTML = `
            <div class="profile-card">
                <button class="avatar huge" id="profileAvatar" title="Change avatar">${p.avatar}</button>
                <div class="profile-main">
                    <h2>${esc(p.name)} <button class="btn tiny ghost" id="profileRename">✏️</button></h2>
                    <div class="muted">${title.icon} ${esc(title.name)} · ${esc(t('level'))} ${p.level} · ${esc(t('prof.since', { date: dmyDate(new Date(p.created)) }))}</div>
                    <div class="xp-bar"><div class="xp-fill" style="width:${prog.pct}%"></div></div>
                    <div class="muted small">${esc(t('prof.toNext', { xp: fmt(prog.xp), need: fmt(prog.need), n: p.level + 1 }))}</div>
                </div>
                <div class="profile-coins">🪙 ${fmt(p.coins)}</div>
            </div>

            <div class="stat-grid">
                <div class="stat"><span class="label">${esc(t('prof.totalGames'))}</span><span class="value">${fmt(p.totalGames)}</span></div>
                <div class="stat"><span class="label">${esc(t('prof.wins'))}</span><span class="value good">${fmt(p.wins)}</span></div>
                <div class="stat"><span class="label">${esc(t('prof.losses'))}</span><span class="value bad">${fmt(p.losses)}</span></div>
                <div class="stat"><span class="label">${esc(t('prof.rate'))}</span><span class="value">${pct(CV.Profile.winRate())}</span></div>
                <div class="stat"><span class="label">${esc(t('prof.streak'))}</span><span class="value">🔥 ${p.streak} <small class="muted">${esc(t('prof.best', { n: p.bestStreak }))}</small></span></div>
                <div class="stat"><span class="label">${esc(t('prof.favourite'))}</span><span class="value">${fav ? fav.icon + ' ' + esc(fav.name) : '—'}</span></div>
            </div>

            <div class="card-panel">
                <h3>${esc(t('prof.form'))}</h3>
                <p class="muted small">${esc(t('prof.formNote'))}</p>
                <div class="form-strip">
                    ${recent.length ? recent.map((h) => `<span class="dot ${h.outcome}" title="${esc(CV.Registry.get(h.game).name)}">${esc(t(h.outcome === 'win' ? 'w' : h.outcome === 'loss' ? 'l' : 'd'))}</span>`).join('') : `<span class="muted small">${esc(t('prof.noGames'))}</span>`}
                </div>
            </div>

            <div class="card-panel">
                <h3>${esc(t('prof.customise'))}</h3>
                <div class="seg tabs" id="shopTabs">
                    <button class="${tab === 'avatar' ? 'is-on' : ''}" data-tab="avatar">${esc(t('prof.avatar'))}</button>
                    <button class="${tab === 'back'   ? 'is-on' : ''}" data-tab="back">${esc(t('prof.back'))}</button>
                    <button class="${tab === 'table'  ? 'is-on' : ''}" data-tab="table">${esc(t('prof.table'))}</button>
                    <button class="${tab === 'tile'   ? 'is-on' : ''}" data-tab="tile">${esc(t('prof.tile'))}</button>
                </div>
                <div id="shopBody"></div>
            </div>`;

        $('profileAvatar').addEventListener('click', () => { tab = 'avatar'; render(); });
        $('profileRename').addEventListener('click', () => {
            CV.UI.prompt(t('prof.nickname'), t('prof.nicknameHint'), p.name, t('save'), (v) => {
                if (CV.Profile.rename(v)) { CV.UI.header(); render(); }
            });
        });
        $('shopTabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
        paintShop();
    }

    function paintShop() {
        const host = $('shopBody');
        const p = CV.Profile.get();
        const equipped = tab === 'avatar' ? p.avatar : CV.Cosmetics.equipped(tab);

        const item = (it) => {
            const owned = CV.Cosmetics.owns(tab, it.id);
            const on = equipped === it.id;
            const preview = tab === 'avatar'
                ? `<span class="preview-emoji">${it.id}</span>`
                : tab === 'back'
                    ? `<span class="preview-back back-${it.id}"></span>`
                    : tab === 'table'
                        ? `<span class="preview-table table-${it.id}"></span>`
                        : `<span class="preview-tile tile-${it.id}">🀄</span>`;
            const action = on ? `<span class="tag on">${esc(t('prof.equipped'))}</span>`
                : owned ? `<button class="btn tiny" data-equip="${it.id}">${esc(t('prof.equip'))}</button>`
                : `<button class="btn tiny ${p.coins >= it.price ? 'primary' : ''}" data-buy="${it.id}">🪙 ${fmt(it.price)}</button>`;
            return `<div class="shop-item${on ? ' is-on' : ''}">${preview}<span class="name">${esc(it.name || '')}</span>${action}</div>`;
        };

        if (tab === 'avatar') {
            host.innerHTML = CV.Cosmetics.CATALOG.avatar.map((g) => `
                <h4>${esc(g.group)}</h4>
                <div class="shop-grid">${g.items.map((i) => item(Object.assign({ name: '' }, i))).join('')}</div>`).join('');
        } else {
            host.innerHTML = `<div class="shop-grid wide">${CV.Cosmetics.items(tab).map(item).join('')}</div>`;
            if (tab === 'tile') host.innerHTML += `<p class="muted small">${esc(t('prof.tileNote'))}</p>`;
        }

        host.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
            CV.Cosmetics.equip(tab, b.dataset.equip);
            CV.Cosmetics.applyToDocument();
            CV.UI.header();
            render();
        }));
        host.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
            const it = CV.Cosmetics.find(tab, b.dataset.buy);
            if (!CV.Profile.canAfford(it.price)) return CV.UI.toast(t('prof.needMore', { n: fmt(it.price - p.coins) }), 'warn');
            CV.UI.confirm(t('prof.buyTitle', { name: esc(it.name || it.id) }),
                t('prof.buyBody', { price: fmt(it.price), have: fmt(p.coins) }), t('prof.buy'), () => {
                const r = CV.Cosmetics.buy(tab, it.id);
                if (r === 'bought') {
                    CV.Cosmetics.equip(tab, it.id);
                    CV.Cosmetics.applyToDocument();
                    CV.UI.toast(t('prof.bought'), 'ok');
                }
                CV.UI.header();
                render();
            });
        }));
    }

    CV.UI.screen('profile', { render });
})();
