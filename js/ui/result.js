/**
 * CardVerse — the result screen every game shares.
 *
 * It reads the summary rewards.js produces and nothing else, so a new game
 * gets this screen for free and cannot get a different one. Per-game colour
 * is limited to `result.detail` (one line) and `note` per rank row.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { $, esc, fmt, signed, pct } = CV.UI;

    const HEAD = {
        win:  { key: 'res.win',  icon: '🏆', cls: 'win' },
        loss: { key: 'res.loss', icon: '💸', cls: 'loss' },
        draw: { key: 'res.draw', icon: '🤝', cls: 'draw' },
    };

    const MEDAL = ['🥇', '🥈', '🥉'];

    function show(summary, { onAgain, onLobby }) {
        const host = $('resultOverlay');
        const head = HEAD[summary.outcome] || HEAD.draw;
        const rows = summary.result.ranks;

        const you = CV.Play.table ? CV.Play.table.engine.youSeat : -1;
        const mine  = rows.find((r) => r.seat === you);
        const house = rows.find((r) => r.house);

        /** One hand, drawn small, with its total. */
        const handStrip = (h) => `
            <span class="rc-hand">
                ${CV.CardView.hand(h.cards || [], { size: 'sm' })}
                ${h.total === null || h.total === undefined ? ''
                    : `<span class="rc-total${h.total > 21 ? ' bad' : ''}">${h.total > 21 ? 'BUST' : h.total}</span>`}
                ${h.doubled ? '<span class="tag">2×</span>' : ''}${h.split ? '<span class="tag">split</span>' : ''}
            </span>`;

        /**
         * Everybody's cards, not just yours. The overlay sits on top of the
         * table, so without this the round ends and takes the evidence with
         * it — and the stake column is what makes two different "Win" payouts
         * make sense, since a win pays on the winner's own stake.
         */
        /**
         * The cards nobody owned. Hold'em's five are what every hand at the
         * table was made from, so a showdown recap without them is a list of
         * two-card fragments and no way to check the winner.
         */
        const shared = summary.result.board;
        const sharedBlock = (shared && shared.length) ? `
            <div class="rc-shared">
                <span class="rc-label">${esc(summary.result.boardLabel || t('res.community'))}</span>
                ${CV.CardView.hand(shared, { size: 'sm' })}
            </div>` : '';

        /**
         * The tiles, for the games that are played with them.
         *
         * A tile is not a card and will not go through `CardView`, so a row
         * that has them carries `tiles` instead of `hands` and is drawn with
         * the table's own tile face. Every seat is in it, not just the
         * winner: the overlay covers the felt, and the losers' hands are
         * half of why the hand ended the way it did.
         */
        const tileFace = CV.MahjongTile;
        const withTiles = tileFace ? rows.filter((r) => r.tiles) : [];

        /** One seat's tiles: what it melded, what it held, what it turned. */
        const tileHand = (r) => {
            const winId = r.tiles.win && r.tiles.win.id;
            const face = (tile) => tileFace(tile, {
                small: true, cls: winId && tile.id === winId ? 'is-win' : '',
            });
            const melds = r.tiles.melds
                .map((m) => `<span class="mj-meld">${m.tiles.map(face).join('')}</span>`).join('');
            const flowers = r.tiles.flowers.length
                ? `<span class="rc-flowers">${r.tiles.flowers.map((x) => tileFace(x, { small: true })).join('')}</span>`
                : '';
            return melds + `<span class="mj-meld">${r.tiles.hand.map(face).join('')}</span>` + flowers;
        };

        /**
         * What the 番 were, one line each.
         *
         * 门清 and 混一色 are names, not explanations, and a player who has
         * just been paid or charged for one has no way to find out what it
         * meant — the note on the row lists them and stops there.
         */
        const fanList = (r) => {
            if (!r.fan || !r.fan.length) return '';
            return `<div class="rc-fan">${r.fan.map((p) => {
                const key = 'mj.fan.' + p.name;
                const gloss = t(key);
                return `<div class="rc-fan-row"><b>${esc(p.name)}</b>
                    <span class="rc-fan-n">${esc(t('res.fanN', { n: p.fan }))}</span>
                    <small>${gloss === key ? '' : esc(gloss)}</small></div>`;
            }).join('')}</div>`;
        };

        const tilesBlock = withTiles.length ? `
            <div class="rc-board">
                <span class="rc-label">${esc(t('res.tiles'))}</span>
                ${withTiles.map((r) => `
                    <div class="rc-seat${r.seat === you ? ' is-you' : ''}${r.rank === 1 && !summary.result.draw ? ' is-win' : ''}">
                        <div class="rc-seat-head">
                            <b>${esc(r.name)}</b>${r.seat === you ? ` <em>(${esc(t('you'))})</em>` : ''}
                            <span class="num ${r.coins > 0 ? 'good' : r.coins < 0 ? 'bad' : ''}">${signed(r.coins)}</span>
                        </div>
                        <div class="rc-tiles">${tileHand(r)}</div>
                        ${fanList(r)}
                    </div>`).join('')}
            </div>` : '';

        const withCards = rows.filter((r) => r.hands && r.hands.length);
        const cardsBlock = withCards.length ? `
            <div class="rc-board">
                <span class="rc-label">${esc(t('res.board'))}</span>
                <table class="rc-board-table"><tbody>
                    ${withCards.map((r) => `
                        <tr class="${r.seat === you ? 'is-you' : ''}${r.house ? ' is-house' : ''}">
                            <td class="rc-who">${esc(r.name)}${r.seat === you ? ' <em>(you)</em>' : ''}</td>
                            <td class="rc-hands">${r.hands.map(handStrip).join('')}</td>
                            <td class="num muted">${r.house ? '' : '🪙 ' + fmt(r.stake || 0)}</td>
                            <td class="num ${r.coins > 0 ? 'good' : r.coins < 0 ? 'bad' : ''}">${r.house ? '' : signed(r.coins)}</td>
                        </tr>`).join('')}
                </tbody></table>
            </div>` : '';


        const table = rows.map((r) => `
            <tr class="${r.seat === you ? 'is-you' : ''}">
                <td>${MEDAL[r.rank - 1] || esc(t('res.nth', { n: r.rank }))}</td>
                <td>${esc(r.name)}</td>
                <td class="num muted small">${r.house ? '' : '🪙 ' + fmt(r.stake || 0)}</td>
                <td class="num ${r.coins > 0 ? 'good' : r.coins < 0 ? 'bad' : ''}">${signed(r.coins)}</td>
                <td class="muted small">${esc(r.note || '')}</td>
            </tr>`).join('');

        const unlocked = summary.achievements.map((a) => `
            <div class="unlock"><span class="icon">${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>
            <span class="reward">${a.reward.coins ? '🪙 ' + fmt(a.reward.coins) : ''} ${a.reward.xp ? '⭐ ' + fmt(a.reward.xp) : ''}</span></div>`).join('');

        const missions = summary.missions.map((m) => `
            <div class="unlock mission"><span class="icon">${m.icon}</span><div><b>${esc(t('res.missionDone'))}</b><small>${esc(t('res.claimIn', { text: m.text }))}</small></div></div>`).join('');

        const levelUp = summary.levels
            ? `<div class="levelup">${esc(t('res.levelUp', { n: CV.Profile.get().level, title: CV.Profile.titleFor(CV.Profile.get().level).name }))} <small>${esc(t('res.levelCoins', { n: fmt(summary.levelCoins) }))}</small></div>`
            : '';

        const streak = summary.streak >= 2
            ? `<div class="streak">${esc(t('res.streak', { n: summary.streak }))}${summary.milestone ? ` <small>${esc(t('res.streakBonus', { n: summary.milestone }))}</small>` : ''}</div>`
            : '';

        host.innerHTML = `
            <div class="result ${head.cls}">
                <div class="result-head">
                    <span class="icon">${head.icon}</span>
                    <h2>${esc(t(head.key))}</h2>
                    <div class="muted">${esc(summary.gameName)} · ${esc(CV.Registry.room(summary.room).name)}${summary.result.detail ? ' · ' + esc(summary.result.detail) : ''}</div>
                </div>

                <div class="result-grid">
                    <div class="stat"><span class="label">${esc(t('res.rank'))}</span><span class="value">${MEDAL[summary.rank - 1] || esc(t('res.nth', { n: summary.rank }))}</span></div>
                    <div class="stat"><span class="label">${esc(t('res.coins'))}</span><span class="value ${summary.coins > 0 ? 'good' : summary.coins < 0 ? 'bad' : ''}">🪙 ${signed(summary.coins)}</span></div>
                    <div class="stat"><span class="label">${esc(t('res.xp'))}</span><span class="value">⭐ +${fmt(summary.xp)}</span></div>
                    <div class="stat"><span class="label">${esc(t('res.winRate'))}</span><span class="value small">${pct(summary.winRateBefore)} → ${pct(summary.winRateAfter)}</span></div>
                </div>

                ${sharedBlock}
                ${cardsBlock}
                ${tilesBlock}
                ${levelUp}${streak}
                ${unlocked}${missions}

                <table class="result-table"><tbody>${table}</tbody></table>

                <div class="btn-row">
                    <button class="btn primary big" id="resultAgain">${esc(t('res.again'))}</button>
                    <button class="btn" id="resultPeek">${esc(t('res.peek'))}</button>
                    <button class="btn" id="resultLobby">${esc(t('res.lobby'))}</button>
                </div>
            </div>`;

        host.hidden = false;
        host.scrollTop = 0;
        peekOff();
        $('resultAgain').addEventListener('click', () => { host.hidden = true; peekOff(); onAgain(); });
        $('resultLobby').addEventListener('click', () => { host.hidden = true; peekOff(); onLobby(); });
        $('resultPeek').addEventListener('click', () => peek(host));

        // preventScroll matters. Focusing a button at the bottom of a card
        // taller than the screen scrolls it into view, which drags the
        // "YOU WIN" header off the top — the round then appears to open
        // half-way through itself. Keep the keyboard focus, lose the scroll.
        setTimeout(() => $('resultAgain').focus({ preventScroll: true }), 50);
    }

    /**
     * Step off the result and look at the table underneath.
     *
     * The overlay covers the board the moment the hand ends, and at mahjong
     * that board is thirteen tiles a seat — the one thing a player wants to
     * look at again. Hiding the overlay is enough, as long as there is an
     * obvious way back to it, so the way back follows the player down.
     */
    function peek(host) {
        host.hidden = true;
        let back = document.getElementById('resultBack');
        if (!back) {
            back = document.createElement('button');
            back.id = 'resultBack';
            back.className = 'btn primary result-back';
            document.body.appendChild(back);
        }
        back.textContent = t('res.backToResult');
        back.hidden = false;
        back.onclick = () => { back.hidden = true; host.hidden = false; };
    }

    /** Put the peek away — a new hand must not leave the chip behind. */
    function peekOff() {
        const back = document.getElementById('resultBack');
        if (back) back.hidden = true;
    }

    CV.ResultView = { show, peekOff };
})();
