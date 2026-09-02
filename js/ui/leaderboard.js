/**
 * CardVerse — the leaderboard, local edition.
 *
 * There is no server, so there is no global board, and this screen does not
 * pretend otherwise: it ranks *your* best hands, per game and overall, from
 * the history. When online play lands (Phase 5) this is the screen that
 * grows a "Global" tab; the layout is already shaped for it.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { $, esc, fmt, dmyDate } = CV.UI;

    let tab = 'all';

    function render() {
        const games = CV.Registry.playable();
        const hist = CV.Stats.history.filter((h) => tab === 'all' || h.game === tab);
        const best = hist.filter((h) => h.coins > 0).sort((a, b) => b.coins - a.coins).slice(0, 10);
        const p = CV.Profile.get();
        const o = CV.Stats.overall();

        $('lbBody').innerHTML = `
            <div class="card-panel lb-you">
                <span class="avatar big">${p.avatar}</span>
                <div>
                    <b>${esc(p.name)}</b>
                    <div class="muted small">Level ${p.level} · 🪙 ${fmt(p.coins)} · ${fmt(o.wins)} wins · net ${CV.UI.signed(o.coinsWon - o.coinsLost)}</div>
                </div>
            </div>

            <div class="seg tabs">
                <button class="${tab === 'all' ? 'is-on' : ''}" data-tab="all">🌐 All</button>
                ${games.map((g) => `<button class="${tab === g.code ? 'is-on' : ''}" data-tab="${g.code}">${g.icon} ${esc(g.name)}</button>`).join('')}
            </div>

            <div class="card-panel">
                <h3>Biggest wins</h3>
                ${best.length ? `<table class="history"><tbody>${best.map((h, i) => {
                    const g = CV.Registry.get(h.game) || { icon: '❔', name: h.game };
                    return `<tr>
                        <td>${['🥇', '🥈', '🥉'][i] || (i + 1)}</td>
                        <td>${g.icon} ${esc(g.name)}</td>
                        <td class="num good">+${fmt(h.coins)}</td>
                        <td class="muted small">${esc(CV.Registry.room(h.room).name)}</td>
                        <td class="muted small">${dmyDate(new Date(h.at))}</td>
                    </tr>`;
                }).join('')}</tbody></table>` : '<p class="muted small">No winning hands recorded yet.</p>'}
            </div>

            <p class="muted small center">Rankings are local to this browser. A global board arrives with online play.</p>`;

        $('lbBody').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    }

    CV.UI.screen('leaderboard', { render });
})();
