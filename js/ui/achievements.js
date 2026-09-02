/**
 * CardVerse — the trophy cabinet. Global first, then a section per game,
 * including games not yet built (their lists are empty until they register
 * achievements, which is honest).
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { $, esc, fmt, dmyDate } = CV.UI;

    function row(a) {
        const when = CV.Achievements.earnedAt(a.id);
        const reward = [a.reward.coins ? '🪙 ' + fmt(a.reward.coins) : '', a.reward.xp ? '⭐ ' + fmt(a.reward.xp) : ''].filter(Boolean).join(' · ');
        return `
            <div class="ach${when ? ' is-done' : ''}">
                <span class="icon">${a.icon}</span>
                <div class="ach-body">
                    <b>${esc(a.name)}</b>
                    <small>${esc(a.desc)}</small>
                </div>
                <div class="ach-side">
                    <span class="reward">${reward}</span>
                    <small class="muted">${when ? dmyDate(new Date(when)) : 'Locked'}</small>
                </div>
            </div>`;
    }

    function render() {
        const all = CV.Achievements.all();
        const prog = CV.Achievements.progress();
        const global = all.filter((a) => !a.game);

        const sections = CV.Registry.all().map((g) => {
            const list = all.filter((a) => a.game === g.code);
            if (!list.length) return '';
            const done = list.filter((a) => CV.Achievements.has(a.id)).length;
            return `<h3>${g.icon} ${esc(g.name)} <small class="muted">${done} / ${list.length}</small></h3>${list.map(row).join('')}`;
        }).join('');

        $('achBody').innerHTML = `
            <div class="card-panel">
                <div class="row-opt"><b>${prog.done} of ${prog.total} unlocked</b><span class="muted">${Math.round(prog.pct)}%</span></div>
                <div class="xp-bar"><div class="xp-fill gold" style="width:${prog.pct}%"></div></div>
            </div>
            <h3>🌐 CardVerse <small class="muted">${global.filter((a) => CV.Achievements.has(a.id)).length} / ${global.length}</small></h3>
            ${global.map(row).join('')}
            ${sections}`;
    }

    CV.UI.screen('achievements', { render });
})();
