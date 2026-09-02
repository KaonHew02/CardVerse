/**
 * CardVerse — Daily Bonus: the login calendar and today's missions.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { $, esc, fmt } = CV.UI;

    function render() {
        const login = CV.Missions.loginState();
        const missions = CV.Missions.list();
        const p = CV.Profile.get();

        $('missionsBody').innerHTML = `
            <div class="card-panel">
                <h3>📅 Daily login</h3>
                <div class="login-grid">
                    ${login.rewards.map((r) => {
                        const state = r.day < login.day || (r.day === login.day && login.claimedToday) ? 'is-done'
                            : r.day === login.day ? 'is-today' : '';
                        return `<div class="login-day ${state}">
                            <small>Day ${r.day}</small>
                            <span class="icon">${r.icon}</span>
                            <small>${esc(r.label)}</small>
                        </div>`;
                    }).join('')}
                </div>
                <div class="btn-row">
                    ${login.claimable
                        ? `<button class="btn primary big" id="claimLogin">Claim day ${login.day}</button>`
                        : `<span class="muted">Claimed today — come back tomorrow for day ${login.day < 7 ? login.day + 1 : 1}.</span>`}
                </div>
            </div>

            <div class="card-panel">
                <h3>🎯 Daily missions</h3>
                ${missions.map((m) => `
                    <div class="mission${m.done ? ' is-done' : ''}${m.claimed ? ' is-claimed' : ''}">
                        <span class="icon">${m.icon}</span>
                        <div class="mission-body">
                            <b>${esc(m.text)}</b>
                            <div class="xp-bar small"><div class="xp-fill" style="width:${(m.have / m.target) * 100}%"></div></div>
                            <small class="muted">${m.have} / ${m.target}</small>
                        </div>
                        <div class="mission-side">
                            <span class="reward">${m.reward.coins ? '🪙 ' + fmt(m.reward.coins) : ''} ${m.reward.xp ? '⭐ ' + fmt(m.reward.xp) : ''}</span>
                            ${m.claimed ? '<span class="tag on">Claimed</span>'
                                : m.done ? `<button class="btn tiny primary" data-claim="${m.id}">Claim</button>`
                                : ''}
                        </div>
                    </div>`).join('')}
                <p class="muted small">New missions every day at midnight.</p>
            </div>

            <div class="card-panel">
                <h3>🔥 Win streak</h3>
                <div class="row-opt"><span>Current</span><b>${p.streak}</b></div>
                <div class="row-opt"><span>Best</span><b>${p.bestStreak}</b></div>
                <p class="muted small">Streak bonuses: ${Object.entries(CV.Profile.STREAK_XP).map(([n, xp]) => `${n} wins → +${xp} XP`).join(' · ')}.</p>
            </div>`;

        const claim = $('claimLogin');
        if (claim) claim.addEventListener('click', () => {
            const r = CV.Missions.claimLogin();
            if (r) CV.UI.toast(`Day ${login.day}: ${r.label}`, 'ok');
            CV.UI.header();
            render();
        });
        $('missionsBody').querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => {
            const m = CV.Missions.claim(b.dataset.claim);
            if (m) CV.UI.toast(`Claimed: ${m.text}`, 'ok');
            CV.UI.header();
            render();
        }));
    }

    CV.UI.screen('missions', { render });
})();
