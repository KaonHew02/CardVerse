/**
 * CardVerse — the main menu / lobby, and the table set-up screen.
 *
 * The lobby is painted from the registry and nothing else: every game the
 * spec lists is on it, the built ones with PLAY and the rest greyed with
 * "Coming soon", so the hub reads as a plan rather than a pair of games.
 *
 * Set-up asks four things — room, how many AI, how strong, and whether
 * anyone else is sharing this device — remembers the answers, and refuses
 * a room the player cannot afford rather than letting them find out at the
 * table.
 */

(() => {
    'use strict';

    const t = (k, p) => window.CV.t(k, p);

    const CV = window.CV;
    const { $, esc, fmt, pct } = CV.UI;

    /* ---- home ------------------------------------------------------------- */

    function renderHome() {
        const grid = $('lobbyGrid');
        grid.innerHTML = CV.Registry.all().map((g) => {
            const s = CV.Stats.forGame(g.code);
            const played = s.played
                ? `<span class="muted small">${esc(t('lobby.record', { played: s.played, rate: pct(CV.Stats.winRate(g.code)) }))}</span>`
                : '';
            const range = g.players[0] + (g.players[1] > g.players[0] ? '–' + g.players[1] : '');
            if (!g.ready) {
                return `
                    <div class="game-card is-soon">
                        <div class="game-icon">${g.icon}</div>
                        <div class="game-body">
                            <h3>${esc(g.name)}</h3>
                            <p>${esc(g.blurb)}</p>
                            <span class="muted small">${esc(t('lobby.players', { range }))}</span>
                        </div>
                        <span class="soon">${esc(t('lobby.soon'))}</span>
                    </div>`;
            }
            return `
                <div class="game-card" data-go="setup" data-game="${g.code}">
                    <div class="game-icon">${g.icon}</div>
                    <div class="game-body">
                        <h3>${esc(g.name)}</h3>
                        <p>${esc(g.blurb)}</p>
                        <span class="muted small">${esc(t('lobby.players', { range }))}</span>
                        ${played}
                    </div>
                    <button class="btn primary">${esc(t('lobby.play'))}</button>
                </div>`;
        }).join('');

        const ach = CV.Achievements.progress();
        const login = CV.Missions.loginState();
        const todo = CV.Missions.unclaimed() + (login.claimable ? 1 : 0);
        const p = CV.Profile.get();

        $('homeNav').innerHTML = `
            <button class="nav-tile" data-go="achievements"><span class="icon">🏆</span><span>${esc(t('nav.achievements'))}</span><small>${esc(t('nav.achCount', { done: ach.done, total: ach.total }))}</small></button>
            <button class="nav-tile" data-go="stats"><span class="icon">📊</span><span>${esc(t('nav.stats'))}</span><small>${esc(t('nav.games', { n: fmt(p.totalGames) }))}</small></button>
            <button class="nav-tile${todo ? ' has-badge' : ''}" data-go="missions"><span class="icon">🎁</span><span>${esc(t('nav.bonus'))}</span><small>${esc(todo ? t('nav.toClaim', { n: todo }) : login.claimedToday ? t('nav.claimed') : t('nav.ready'))}</small></button>
            <button class="nav-tile" data-go="room"><span class="icon">🌐</span><span>${esc(t('nav.friends'))}</span><small>${esc(t('nav.online'))}</small></button>
            <button class="nav-tile" data-go="leaderboard"><span class="icon">🏅</span><span>${esc(t('nav.leaderboard'))}</span><small>${esc(t('nav.local'))}</small></button>
            <button class="nav-tile" data-go="profile"><span class="icon">👤</span><span>${esc(t('nav.profile'))}</span><small>${esc(t('lv'))} ${p.level}</small></button>
            <button class="nav-tile" data-go="settings"><span class="icon">⚙️</span><span>${esc(t('nav.settings'))}</span><small>${esc(t('set.theme'))} · ${esc(t('set.data'))}</small></button>`;
    }

    /* ---- set-up ----------------------------------------------------------- */

    let setup = null;   // { game, room, ai, level, guests[] }

    function renderSetup({ game: code }) {
        const game = CV.Registry.get(code);
        if (!game || !game.ready) return CV.UI.go('home');
        const S = CV.Settings.get();
        const maxOthers = game.players[1] - 1;

        setup = {
            game,
            room: CV.Registry.roomsFor(code)[0].id,
            ai:   Math.min(maxOthers, S.aiCount),
        };
        paintSetup();
    }

    function paintSetup() {
        const { game } = setup;
        const p = CV.Profile.get();
        const maxOthers = game.players[1] - 1;
        const rooms = CV.Registry.roomsFor(game.code);
        const s = CV.Stats.forGame(game.code);

        $('setupBody').innerHTML = `
            <div class="setup-head">
                <div class="game-icon big">${game.icon}</div>
                <div>
                    <h2>${esc(game.name)}</h2>
                    <p class="muted">${esc(game.blurb)}</p>
                    <p class="muted small">${esc(t('setup.you', { played: s.played, wins: s.wins, rate: pct(CV.Stats.winRate(game.code)) }))}</p>
                </div>
            </div>

            <div class="card-panel">
                <h3>${esc(t('setup.room'))}</h3>
                <div class="room-grid">
                    ${rooms.map((r) => {
                        const need = r.entry + r.bet[0];
                        const ok = p.coins >= need;
                        return `
                        <button class="room${setup.room === r.id ? ' is-on' : ''}${ok ? '' : ' is-locked'}" data-room="${r.id}" ${ok ? '' : 'disabled'}>
                            <span class="icon">${r.icon}</span>
                            <b>${esc(r.name)}</b>
                            <small>${esc(r.entry ? t('setup.entry', { n: fmt(r.entry) }) : t('setup.freeEntry'))}</small>
                            <small>${esc(t('setup.bets', { lo: fmt(r.bet[0]), hi: fmt(r.bet[1]) }))}</small>
                            <small class="muted">${esc(r.blurb)}</small>
                            ${ok ? '' : `<small class="lock">${esc(t('setup.need', { n: fmt(need) }))}</small>`}
                        </button>`;
                    }).join('')}
                </div>
            </div>

            <div class="card-panel">
                <h3>${esc(t('setup.opponents'))}</h3>
                <div class="row-opt">
                    <span>${esc(t('setup.aiPlayers'))}</span>
                    <div class="seg" id="setupAi">
                        ${Array.from({ length: maxOthers + 1 }, (_, n) =>
                            `<button class="${setup.ai === n ? 'is-on' : ''}" data-ai="${n}">${n}</button>`).join('')}
                    </div>
                </div>
                <p class="muted small">${esc(t('setup.aiNote'))}</p>
            </div>

            <div class="setup-foot">
                <div class="muted small">${esc(t('setup.seats', { used: setup.ai + 1, max: game.players[1], coins: fmt(p.coins) }))}</div>
                <button class="btn primary big" id="setupStart">${esc(t('setup.sit'))}</button>
            </div>`;

        const body = $('setupBody');
        body.querySelectorAll('[data-room]').forEach((b) => b.addEventListener('click', () => { setup.room = b.dataset.room; paintSetup(); }));
        body.querySelectorAll('[data-ai]').forEach((b) => b.addEventListener('click', () => { setup.ai = Number(b.dataset.ai); paintSetup(); }));
        $('setupStart').addEventListener('click', start);
    }

    function start() {
        CV.Settings.set('aiCount', setup.ai);
        CV.Play.begin({ gameCode: setup.game.code, room: setup.room, aiCount: setup.ai });
    }

    CV.UI.screen('home',  { render: renderHome });
    CV.UI.screen('setup', { render: renderSetup });
})();
