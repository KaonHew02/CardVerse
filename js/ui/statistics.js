/**
 * CardVerse — statistics: an overall card, one panel per game played, and
 * the recent history. Per-game extras are printed from `game.extraLabels`,
 * so a counter a game invents shows up with a proper name and no edit here.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { $, esc, fmt, pct, dmyDate } = CV.UI;

    function gamePanel(g) {
        const s = CV.Stats.forGame(g.code);
        if (!s.played) return '';
        const net = s.coinsWon - s.coinsLost;
        const extras = Object.entries(s.extra)
            .filter(([, v]) => v)
            .map(([k, v]) => `<div class="stat"><span class="label">${esc((g.extraLabels || {})[k] || k)}</span><span class="value">${fmt(v)}</span></div>`)
            .join('');
        return `
            <div class="card-panel">
                <h3>${g.icon} ${esc(g.name)}</h3>
                <div class="stat-grid">
                    <div class="stat"><span class="label">Games played</span><span class="value">${fmt(s.played)}</span></div>
                    <div class="stat"><span class="label">Wins</span><span class="value good">${fmt(s.wins)}</span></div>
                    <div class="stat"><span class="label">Losses</span><span class="value bad">${fmt(s.losses)}</span></div>
                    <div class="stat"><span class="label">Pushes</span><span class="value">${fmt(s.draws)}</span></div>
                    <div class="stat"><span class="label">Win rate</span><span class="value">${pct(CV.Stats.winRate(g.code))}</span></div>
                    <div class="stat"><span class="label">Net coins</span><span class="value ${net > 0 ? 'good' : net < 0 ? 'bad' : ''}">${CV.UI.signed(net)}</span></div>
                    <div class="stat"><span class="label">Best streak</span><span class="value">🔥 ${fmt(s.bestStreak)}</span></div>
                    <div class="stat"><span class="label">Best hand</span><span class="value">${fmt(s.best)}</span></div>
                    ${extras}
                </div>
            </div>`;
    }

    function render() {
        const o = CV.Stats.overall();
        const p = CV.Profile.get();
        const net = o.coinsWon - o.coinsLost;
        const history = CV.Stats.recent(25);

        const panels = CV.Registry.all().map(gamePanel).join('');

        $('statsBody').innerHTML = `
            <div class="card-panel">
                <h3>All games</h3>
                <div class="stat-grid">
                    <div class="stat"><span class="label">Games played</span><span class="value">${fmt(o.played)}</span></div>
                    <div class="stat"><span class="label">Wins</span><span class="value good">${fmt(o.wins)}</span></div>
                    <div class="stat"><span class="label">Losses</span><span class="value bad">${fmt(o.losses)}</span></div>
                    <div class="stat"><span class="label">Win rate</span><span class="value">${pct(CV.Profile.winRate())}</span></div>
                    <div class="stat"><span class="label">Coins won</span><span class="value good">${fmt(o.coinsWon)}</span></div>
                    <div class="stat"><span class="label">Coins lost</span><span class="value bad">${fmt(o.coinsLost)}</span></div>
                    <div class="stat"><span class="label">Net</span><span class="value ${net > 0 ? 'good' : net < 0 ? 'bad' : ''}">${CV.UI.signed(net)}</span></div>
                    <div class="stat"><span class="label">Best streak</span><span class="value">🔥 ${fmt(p.bestStreak)}</span></div>
                </div>
            </div>
            ${panels || '<p class="muted center">Play a hand and the numbers appear here.</p>'}
            ${history.length ? `
            <div class="card-panel">
                <h3>Recent games</h3>
                <table class="history">
                    <tbody>${history.map((h) => {
                        const g = CV.Registry.get(h.game) || { icon: '❔', name: h.game };
                        const d = new Date(h.at);
                        return `<tr>
                            <td>${g.icon} ${esc(g.name)}</td>
                            <td><span class="dot ${h.outcome}">${h.outcome === 'win' ? 'W' : h.outcome === 'loss' ? 'L' : 'D'}</span></td>
                            <td class="num ${h.coins > 0 ? 'good' : h.coins < 0 ? 'bad' : ''}">${CV.UI.signed(h.coins)}</td>
                            <td class="muted small">${esc(CV.Registry.room(h.room).name)}</td>
                            <td class="muted small">${dmyDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>` : ''}`;
    }

    CV.UI.screen('stats', { render });
})();
