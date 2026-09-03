/**
 * CardVerse — the result screen every game shares.
 *
 * It reads the summary rewards.js produces and nothing else, so a new game
 * gets this screen for free and cannot get a different one. Per-game colour
 * is limited to `result.detail` (one line) and `note` per rank row.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { $, esc, fmt, signed, pct } = CV.UI;

    const HEAD = {
        win:  { title: 'YOU WIN!',  icon: '🏆', cls: 'win' },
        loss: { title: 'YOU LOSE',  icon: '💸', cls: 'loss' },
        draw: { title: 'PUSH',      icon: '🤝', cls: 'draw' },
    };

    const MEDAL = ['🥇', '🥈', '🥉'];

    function show(summary, { onAgain, onLobby }) {
        const host = $('resultOverlay');
        const head = HEAD[summary.outcome] || HEAD.draw;
        const rows = summary.result.ranks;

        const you = CV.Play.table ? CV.Play.table.engine.youSeat : -1;
        const mine  = rows.find((r) => r.seat === you);
        const house = rows.find((r) => r.house);

        /** A hand, drawn small, with its total. */
        const handStrip = (h) => `
            <div class="rc-hand">
                ${CV.CardView.hand(h.cards || [], { size: 'sm' })}
                <span class="rc-total${h.total > 21 ? ' bad' : ''}">${h.total > 21 ? 'BUST' : h.total}</span>
                ${h.doubled ? '<span class="tag">2×</span>' : ''}${h.split ? '<span class="tag">split</span>' : ''}
            </div>`;

        // What the player actually held, and what the dealer turned over.
        // Without this the result screen announces a number and covers the
        // evidence for it.
        const cardsBlock = (mine && mine.hands && mine.hands.length) ? `
            <div class="rc-cards">
                <div class="rc-side">
                    <span class="rc-label">Your hand${mine.hands.length > 1 ? 's' : ''}</span>
                    ${mine.hands.map(handStrip).join('')}
                </div>
                ${house && house.hands && house.hands.length ? `
                <div class="rc-side">
                    <span class="rc-label">Dealer</span>
                    ${house.hands.map(handStrip).join('')}
                </div>` : ''}
            </div>` : '';

        // And the arithmetic behind the coin figure, so it can be checked
        // rather than believed. The lines sum to exactly what was paid.
        const money = (mine && mine.lines && mine.lines.length) ? `
            <details class="rc-money" open>
                <summary>How the coins worked out</summary>
                <table class="rc-money-table"><tbody>
                    ${mine.lines.map((l) => `
                        <tr>
                            <td>
                                <b>${esc(l.label)}</b><small class="muted"> — ${esc(l.why)}</small>
                                <small class="rc-sum">staked 🪙${fmt(l.stake)} → back 🪙${fmt(l.returned)}</small>
                            </td>
                            <td class="num ${l.amount > 0 ? 'good' : l.amount < 0 ? 'bad' : ''}">${signed(l.amount)}</td>
                        </tr>`).join('')}
                    <tr class="rc-total-row">
                        <td><b>Net this hand</b></td>
                        <td class="num ${summary.coins > 0 ? 'good' : summary.coins < 0 ? 'bad' : ''}"><b>${signed(summary.coins)}</b></td>
                    </tr>
                </tbody></table>
            </details>` : '';
        const table = rows.map((r) => `
            <tr class="${r.seat === you ? 'is-you' : ''}">
                <td>${MEDAL[r.rank - 1] || r.rank + 'th'}</td>
                <td>${esc(r.name)}</td>
                <td class="num ${r.coins > 0 ? 'good' : r.coins < 0 ? 'bad' : ''}">${signed(r.coins)}</td>
                <td class="muted small">${esc(r.note || '')}</td>
            </tr>`).join('');

        const unlocked = summary.achievements.map((a) => `
            <div class="unlock"><span class="icon">${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>
            <span class="reward">${a.reward.coins ? '🪙 ' + fmt(a.reward.coins) : ''} ${a.reward.xp ? '⭐ ' + fmt(a.reward.xp) : ''}</span></div>`).join('');

        const missions = summary.missions.map((m) => `
            <div class="unlock mission"><span class="icon">${m.icon}</span><div><b>Mission complete</b><small>${esc(m.text)} — claim it in Daily Bonus</small></div></div>`).join('');

        const levelUp = summary.levels
            ? `<div class="levelup">⬆️ Level ${CV.Profile.get().level} — ${CV.Profile.titleFor(CV.Profile.get().level).name}! <small>+${fmt(summary.levelCoins)} coins</small></div>`
            : '';

        const streak = summary.streak >= 2
            ? `<div class="streak">🔥 ${summary.streak} in a row${summary.milestone ? ` <small>+${summary.milestone} XP bonus</small>` : ''}</div>`
            : '';

        host.innerHTML = `
            <div class="result ${head.cls}">
                <div class="result-head">
                    <span class="icon">${head.icon}</span>
                    <h2>${head.title}</h2>
                    <div class="muted">${esc(summary.gameName)} · ${esc(CV.Registry.room(summary.room).name)}${summary.result.detail ? ' · ' + esc(summary.result.detail) : ''}</div>
                </div>

                <div class="result-grid">
                    <div class="stat"><span class="label">Rank</span><span class="value">${MEDAL[summary.rank - 1] || summary.rank + 'th'}</span></div>
                    <div class="stat"><span class="label">Coins</span><span class="value ${summary.coins > 0 ? 'good' : summary.coins < 0 ? 'bad' : ''}">🪙 ${signed(summary.coins)}</span></div>
                    <div class="stat"><span class="label">XP</span><span class="value">⭐ +${fmt(summary.xp)}</span></div>
                    <div class="stat"><span class="label">Win rate</span><span class="value small">${pct(summary.winRateBefore)} → ${pct(summary.winRateAfter)}</span></div>
                </div>

                ${cardsBlock}
                ${money}
                ${levelUp}${streak}
                ${unlocked}${missions}

                <table class="result-table"><tbody>${table}</tbody></table>

                <div class="btn-row">
                    <button class="btn primary big" id="resultAgain">Play again</button>
                    <button class="btn" id="resultLobby">Back to lobby</button>
                </div>
            </div>`;

        host.hidden = false;
        $('resultAgain').addEventListener('click', () => { host.hidden = true; onAgain(); });
        $('resultLobby').addEventListener('click', () => { host.hidden = true; onLobby(); });
        setTimeout(() => $('resultAgain').focus(), 50);
    }

    CV.ResultView = { show };
})();
