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

    const CV = window.CV;
    const { $, esc, fmt, pct } = CV.UI;

    /* ---- home ------------------------------------------------------------- */

    function renderHome() {
        const grid = $('lobbyGrid');
        grid.innerHTML = CV.Registry.all().map((g) => {
            const s = CV.Stats.forGame(g.code);
            const played = s.played ? `<span class="muted small">${s.played} played · ${pct(CV.Stats.winRate(g.code))} wins</span>` : '';
            if (!g.ready) {
                return `
                    <div class="game-card is-soon">
                        <div class="game-icon">${g.icon}</div>
                        <div class="game-body">
                            <h3>${esc(g.name)}</h3>
                            <p>${esc(g.blurb)}</p>
                            <span class="muted small">Players: ${g.players[0]}${g.players[1] > g.players[0] ? '–' + g.players[1] : ''}</span>
                        </div>
                        <span class="soon">Coming soon</span>
                    </div>`;
            }
            return `
                <div class="game-card" data-go="setup" data-game="${g.code}">
                    <div class="game-icon">${g.icon}</div>
                    <div class="game-body">
                        <h3>${esc(g.name)}</h3>
                        <p>${esc(g.blurb)}</p>
                        <span class="muted small">Players: ${g.players[0]}–${g.players[1]}</span>
                        ${played}
                    </div>
                    <button class="btn primary">PLAY</button>
                </div>`;
        }).join('');

        const ach = CV.Achievements.progress();
        const login = CV.Missions.loginState();
        const todo = CV.Missions.unclaimed() + (login.claimable ? 1 : 0);
        const p = CV.Profile.get();

        $('homeNav').innerHTML = `
            <button class="nav-tile" data-go="achievements"><span class="icon">🏆</span><span>Achievements</span><small>${ach.done} / ${ach.total}</small></button>
            <button class="nav-tile" data-go="stats"><span class="icon">📊</span><span>Statistics</span><small>${fmt(p.totalGames)} games</small></button>
            <button class="nav-tile${todo ? ' has-badge' : ''}" data-go="missions"><span class="icon">🎁</span><span>Daily Bonus</span><small>${todo ? todo + ' to claim' : login.claimedToday ? 'Claimed today' : 'Ready'}</small></button>
            <button class="nav-tile" data-go="room"><span class="icon">🌐</span><span>Play with Friends</span><small>Online</small></button>
            <button class="nav-tile" data-go="leaderboard"><span class="icon">🏅</span><span>Leaderboard</span><small>Local</small></button>
            <button class="nav-tile" data-go="profile"><span class="icon">👤</span><span>Profile</span><small>Lv ${p.level}</small></button>
            <button class="nav-tile" data-go="settings"><span class="icon">⚙️</span><span>Settings</span><small>Theme · Data</small></button>`;
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
            room:   CV.Registry.roomsFor(code)[0].id,
            ai:     Math.min(maxOthers, S.aiCount),
            level:  S.aiLevel,
            guests: (S.guestNames || []).slice(0, Math.max(0, Math.min(S.guests, maxOthers - Math.min(maxOthers, S.aiCount)))),
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
                    <p class="muted small">You: ${s.played} played · ${s.wins} won · ${pct(CV.Stats.winRate(game.code))}</p>
                </div>
            </div>

            <div class="card-panel">
                <h3>Room</h3>
                <div class="room-grid">
                    ${rooms.map((r) => {
                        const need = r.entry + r.bet[0];
                        const ok = p.coins >= need;
                        return `
                        <button class="room${setup.room === r.id ? ' is-on' : ''}${ok ? '' : ' is-locked'}" data-room="${r.id}" ${ok ? '' : 'disabled'}>
                            <span class="icon">${r.icon}</span>
                            <b>${esc(r.name)}</b>
                            <small>${r.entry ? 'Entry 🪙 ' + fmt(r.entry) : 'Free entry'}</small>
                            <small>Bets ${fmt(r.bet[0])}–${fmt(r.bet[1])}</small>
                            <small class="muted">${esc(r.blurb)}</small>
                            ${ok ? '' : `<small class="lock">Need 🪙 ${fmt(need)}</small>`}
                        </button>`;
                    }).join('')}
                </div>
            </div>

            <div class="card-panel">
                <h3>Opponents</h3>
                <div class="row-opt">
                    <span>AI players</span>
                    <div class="seg" id="setupAi">
                        ${Array.from({ length: maxOthers + 1 }, (_, n) =>
                            `<button class="${setup.ai === n ? 'is-on' : ''}" data-ai="${n}" ${n + setup.guests.length > maxOthers ? 'disabled' : ''}>${n}</button>`).join('')}
                    </div>
                </div>
                <div class="row-opt">
                    <span>Difficulty</span>
                    <div class="seg" id="setupLevel">
                        ${Object.entries(CV.AI_LEVELS).map(([k, v]) =>
                            `<button class="${setup.level === k ? 'is-on' : ''}" data-level="${k}">${v.icon} ${v.label}</button>`).join('')}
                    </div>
                </div>
            </div>

            <div class="card-panel">
                <h3>Pass-and-play</h3>
                <p class="muted small">Friends on this device take their own seats. They play with 5,000 table coins; only your seat earns coins, XP and stats.</p>
                <div class="row-opt">
                    <span>Extra players</span>
                    <div class="seg" id="setupGuests">
                        ${Array.from({ length: maxOthers + 1 }, (_, n) =>
                            `<button class="${setup.guests.length === n ? 'is-on' : ''}" data-guests="${n}" ${n + setup.ai > maxOthers ? 'disabled' : ''}>${n}</button>`).join('')}
                    </div>
                </div>
                <div id="setupGuestNames" class="guest-names">
                    ${setup.guests.map((g, i) => `<input type="text" maxlength="12" placeholder="Guest ${i + 1}" value="${esc(g)}" data-guest="${i}">`).join('')}
                </div>
            </div>

            <div class="setup-foot">
                <div class="muted small">${setup.ai + setup.guests.length + 1} of ${game.players[1]} seats · you have 🪙 ${fmt(p.coins)}</div>
                <button class="btn primary big" id="setupStart">Sit down</button>
            </div>`;

        const body = $('setupBody');
        body.querySelectorAll('[data-room]').forEach((b) => b.addEventListener('click', () => { setup.room = b.dataset.room; paintSetup(); }));
        body.querySelectorAll('[data-ai]').forEach((b) => b.addEventListener('click', () => { setup.ai = Number(b.dataset.ai); paintSetup(); }));
        body.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { setup.level = b.dataset.level; paintSetup(); }));
        body.querySelectorAll('[data-guests]').forEach((b) => b.addEventListener('click', () => {
            const n = Number(b.dataset.guests);
            setup.guests = Array.from({ length: n }, (_, i) => setup.guests[i] || '');
            paintSetup();
        }));
        body.querySelectorAll('[data-guest]').forEach((inp) => inp.addEventListener('input', () => {
            setup.guests[Number(inp.dataset.guest)] = inp.value;
        }));
        $('setupStart').addEventListener('click', start);
    }

    function start() {
        const S = CV.Settings;
        S.set('aiCount', setup.ai);
        S.set('aiLevel', setup.level);
        S.set('guests', setup.guests.length);
        S.set('guestNames', setup.guests.map((g, i) => (g || '').trim() || `Guest ${i + 1}`));
        CV.Play.begin({
            gameCode: setup.game.code,
            room: setup.room,
            aiCount: setup.ai,
            aiLevel: setup.level,
            guests: S.get().guestNames.slice(0, setup.guests.length),
        });
    }

    CV.UI.screen('home',  { render: renderHome });
    CV.UI.screen('setup', { render: renderSetup });
})();
