/**
 * CardVerse — languages.
 *
 * Same shape as MiniShoppingMall's i18n.js: one flat dictionary per language,
 * English first, and every other pack falls back to it key by key — so a
 * half-finished translation shows English words rather than raw keys.
 *
 * Two kinds of string live here:
 *
 *   - **UI text**, reached with `CV.t('key', {params})`, `{braces}` for values.
 *   - **Data names** — games, rooms, achievements, missions, cosmetics, ranks.
 *     Those are not fetched at every call site. `localize()` writes the
 *     translation straight into the registry and the definition lists, keeping
 *     the English original in a `__en` field, so the rest of the app keeps
 *     reading `game.name` and never learns that languages exist.
 *
 * The language is a **device preference, not part of the player's record** —
 * it lives in settings, which the backup envelope deliberately excludes. An
 * import that flipped someone's phone to another language would read as a
 * fault, not a restore.
 *
 * This file is UTF-8; index.html loads it as such.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const KEY = 'cardverse.lang';

    /* ------------------------------------------------------------------ *
     * English
     * ------------------------------------------------------------------ */

    const EN = {
        'lang.name': 'English',

        /* common */
        'ok': 'OK', 'cancel': 'Cancel', 'save': 'Save', 'close': 'Close',
        'back': '← Lobby', 'leave': '← Leave', 'yes': 'Yes', 'no': 'No',
        'you': 'you', 'host': 'Host', 'guest': 'Guest', 'of': 'of',
        'coins': 'coins', 'level': 'Level', 'lv': 'Lv',

        /* header + lobby */
        'app.slogan': 'One World. Every Game.',
        'lobby.title': '🎮 Game Lobby',
        'lobby.play': 'PLAY',
        'lobby.soon': 'Coming soon',
        'lobby.players': 'Players: {range}',
        'lobby.record': '{played} played · {rate} wins',
        'lobby.footnote': 'Virtual coins only. Nothing in CardVerse can be bought, sold or cashed out.',
        'nav.achievements': 'Achievements', 'nav.stats': 'Statistics',
        'nav.bonus': 'Daily Bonus', 'nav.friends': 'Play with Friends',
        'nav.leaderboard': 'Leaderboard', 'nav.profile': 'Profile', 'nav.settings': 'Settings',
        'nav.achCount': '{done} / {total}', 'nav.games': '{n} games',
        'nav.toClaim': '{n} to claim', 'nav.claimed': 'Claimed today', 'nav.ready': 'Ready',
        'nav.online': 'Online', 'nav.local': 'Local',

        /* set-up */
        'setup.title': 'Choose a table',
        'setup.you': 'You: {played} played · {wins} won · {rate}',
        'setup.room': 'Room',
        'setup.freeEntry': 'Free entry', 'setup.entry': 'Entry 🪙 {n}',
        'setup.bets': 'Bets {lo}–{hi}', 'setup.need': 'Need 🪙 {n}',
        'setup.opponents': 'Opponents', 'setup.aiPlayers': 'AI players',
        'setup.seats': '{used} of {max} seats · you have 🪙 {coins}',
        'setup.sit': 'Sit down',
        'setup.cantAfford': 'You need {n} coins to sit in the {room}.',

        /* table */
        'table.cards': '{n} cards',
        'table.dealer': 'Dealer',
        'table.sittingOut': 'Sitting out',
        'table.yourBet': 'Your bet', 'table.someoneBet': '{who} bet',
        'table.yourTurn': 'Your turn', 'table.someoneTurn': '{who} turn',
        'table.handOf': ' — hand {n} of {total}',
        'table.thinking': '{name} is thinking…',
        'table.betting': '{name} is betting…',
        'table.dealerPlays': 'Dealer plays…',
        'table.dealerDraws': 'Dealer draws…',
        'table.dealerBusts': 'Dealer busts.', 'table.dealerHas': 'Dealer has {n}.',
        'table.bookLabel': 'Book says:',
        'table.deal': 'Deal', 'table.range': 'Table {lo}–{hi}',
        'table.ofCoins': 'of {n}',
        'act.hit': 'Hit', 'act.stand': 'Stand', 'act.double': 'Double', 'act.bet': 'Bet',
        'table.leaveTitle': 'Leave this hand?',
        'table.leaveBody': 'The bet on the table is lost and the hand counts as a loss.',
        'table.leaveGo': 'Leave',
        'table.brokeTitle': 'Out of coins for this table',
        'table.brokeBody': 'The {room} needs at least {n} to bet. Claim the daily bonus or drop to a cheaper room.',

        /* result */
        'res.win': 'YOU WIN!', 'res.loss': 'YOU LOSE', 'res.draw': 'PUSH',
        'res.rank': 'Rank', 'res.coins': 'Coins', 'res.xp': 'XP', 'res.winRate': 'Win rate',
        'res.board': "Everyone's cards",
        'res.again': 'Play again', 'res.lobby': 'Back to lobby',
        'res.levelUp': '⬆️ Level {n} — {title}!', 'res.levelCoins': '+{n} coins',
        'res.streak': '🔥 {n} in a row', 'res.streakBonus': '+{n} XP bonus',
        'res.missionDone': 'Mission complete',
        'res.claimIn': '{text} — claim it in Daily Bonus',
        'res.nth': '{n}th',

        /* profile */
        'prof.title': '👤 Profile',
        'prof.since': 'Player since {date}',
        'prof.toNext': '{xp} / {need} XP to level {n}',
        'prof.totalGames': 'Total games', 'prof.wins': 'Wins', 'prof.losses': 'Losses',
        'prof.rate': 'Win rate', 'prof.streak': 'Streak', 'prof.best': 'best {n}',
        'prof.favourite': 'Favourite',
        'prof.form': 'Recent form', 'prof.noGames': 'No games yet.',
        'prof.customise': 'Customise',
        'prof.avatar': 'Avatar', 'prof.back': 'Card back', 'prof.table': 'Table', 'prof.tile': 'Mahjong tiles',
        'prof.equipped': 'Equipped', 'prof.equip': 'Equip',
        'prof.tileNote': 'Tile skins apply when Mahjong arrives.',
        'prof.nickname': 'Nickname', 'prof.nicknameHint': 'Up to 16 characters.',
        'prof.buyTitle': 'Buy {name}?', 'prof.buyBody': '🪙 {price} of your {have} coins.',
        'prof.buy': 'Buy', 'prof.bought': 'Yours — and equipped.',
        'prof.needMore': 'You need {n} more coins.',
        'w': 'W', 'l': 'L', 'd': 'D',

        /* achievements */
        'ach.title': '🏆 Achievements',
        'ach.unlocked': '{done} of {total} unlocked',
        'ach.locked': 'Locked',
        'ach.global': '🌐 CardVerse',

        /* statistics */
        'stats.title': '📊 Statistics',
        'stats.all': 'All games',
        'stats.played': 'Games played', 'stats.pushes': 'Pushes',
        'stats.coinsWon': 'Coins won', 'stats.coinsLost': 'Coins lost', 'stats.net': 'Net',
        'stats.bestStreak': 'Best streak', 'stats.bestHand': 'Best hand', 'stats.netCoins': 'Net coins',
        'stats.recent': 'Recent games',
        'stats.empty': 'Play a hand and the numbers appear here.',

        /* leaderboard */
        'lb.title': '🏅 Leaderboard',
        'lb.all': '🌐 All',
        'lb.biggest': 'Biggest wins',
        'lb.none': 'No winning hands recorded yet.',
        'lb.localNote': 'Rankings are local to this browser. A global board arrives with online play.',
        'lb.summary': 'Level {level} · 🪙 {coins} · {wins} wins · net {net}',

        /* missions */
        'miss.title': '🎁 Daily Bonus',
        'miss.login': '📅 Daily login',
        'miss.day': 'Day {n}',
        'miss.claimDay': 'Claim day {n}',
        'miss.claimedToday': 'Claimed today — come back tomorrow for day {n}.',
        'miss.daily': '🎯 Daily missions',
        'miss.claim': 'Claim', 'miss.claimed': 'Claimed',
        'miss.newDaily': 'New missions every day at midnight.',
        'miss.streakTitle': '🔥 Win streak',
        'miss.current': 'Current', 'miss.bestEver': 'Best',
        'miss.streakBonuses': 'Streak bonuses: {list}.',
        'miss.streakItem': '{n} wins → +{xp} XP',
        'miss.claimedToast': 'Claimed: {text}',
        'miss.loginWaiting': '🎁 Day {n} login bonus is waiting in Daily Bonus.',

        /* settings */
        'set.title': '⚙️ Settings',
        'set.appearance': 'Appearance',
        'set.language': 'Language',
        'set.theme': 'Theme', 'set.themeAuto': 'Follow system', 'set.themeDark': 'Dark', 'set.themeLight': 'Light',
        'set.fast': 'Fast animations',
        'set.table': 'Table', 'set.hints': 'Show strategy hints',
        'set.player': 'Player', 'set.avatarNote': 'Avatars are chosen in your Profile.',
        'set.data': 'Your data',
        'set.dataNote': 'Everything lives in this browser. Export keeps a copy anywhere you like; Drive keeps one in your Google Drive.',
        'set.export': '📤 Export', 'set.import': '📥 Import',
        'set.toDrive': '☁️ To Drive', 'set.fromDrive': '⬇️ From Drive', 'set.auto': 'Auto:',
        'set.usage': 'This browser holds {n} KB of CardVerse data.',
        'set.danger': 'Danger zone',
        'set.dangerNote': 'Resets are permanent. Export first.',
        'set.resetStats': 'Reset statistics', 'set.startOver': 'Start over',
        'set.resetStatsTitle': 'Reset every statistic?',
        'set.resetStatsBody': 'Wins, losses, streaks and the game history for every game go to zero. Coins, level and achievements stay.',
        'set.resetDone': 'Statistics reset',
        'set.startOverTitle': 'Start CardVerse over?',
        'set.startOverBody': 'Profile, coins, level, statistics, achievements, missions and cosmetics are all erased from this browser. A Drive copy, if you made one, is not touched.',
        'set.eraseAll': 'Erase everything',
        'set.footer': 'CardVerse · One World. Every Game. · Virtual coins only — nothing here is worth money, and nothing ever will be.',
        'set.saved': 'Saved', 'set.nickSaved': 'Nickname saved',

        /* save / drive */
        'save.badFile': 'That file is not a CardVerse backup',
        'save.badFileBody': 'Pick a file that Export made — it is named cardverse-<i>date</i>.json.',
        'save.replaceTitle': 'Replace what is here with this file?',
        'save.replaceBody': 'The file holds {file}. This browser holds {here}, and all of it will be replaced.',
        'save.useFile': 'Use the file',
        'save.loading': 'Loaded — restarting…',
        'save.unreadable': 'Could not read the file',
        'save.unreadableBody': 'The browser refused to open it.',
        'save.summary': '{name} at level {level} with {coins} coins and {games} games',
        'save.noPlayer': 'no player record',
        'save.noChange': 'Nothing was changed',
        'save.noChangeBody': 'The browser refused one of the writes, so the previous record was put back in full.',
        'save.exported': '✅ Exported',
        'storage.failing': 'This browser is refusing to save. Your progress will be lost on reload — export it from Settings now.',
        'drive.offer': 'This browser has no CardVerse record. Restore your player from Google Drive?',
        'drive.offerYes': 'From Drive', 'drive.offerNo': 'Start fresh',

        /* online room */
        'room.title': '🌐 Play with friends',
        'room.unavailable': 'Online play is unavailable',
        'room.unavailableBody': 'The peer-to-peer library did not load. Check your connection or whether an extension is blocking it, then reload. Everything else in CardVerse works without it — including pass-and-play, where friends share this device.',
        'room.backLobby': 'Back to lobby',
        'room.hostBig': 'Host a table', 'room.hostSub': 'You deal. Friends join with a 6-digit code.',
        'room.joinBig': 'Join a table', 'room.joinSub': 'Type the code your friend gives you.',
        'room.privacy': 'Play goes directly between your devices. Nothing about the game passes through CardVerse — only an introduction service that swaps addresses.',
        'room.settings': 'Table settings', 'room.game': 'Game',
        'room.fillAI': 'Fill empty seats with AI',
        'room.open': 'Open the table', 'room.opening': '⏳ Opening…',
        'room.code': 'Room code',
        'room.codeNote': 'Read this out, or tap it to copy. Keep this tab open — the table lives in it.',
        'room.copied': 'Code copied', 'room.copyFail': 'Copy failed — read it out instead',
        'room.atTable': 'At the table',
        'room.emptySeats': '{n} empty seats will be filled with AI.',
        'room.start': 'Start playing', 'room.next': 'Next hand',
        'room.closeTable': 'Close the table', 'room.closeTitle': 'Close the table?',
        'room.closeBody': 'Everyone is disconnected and the code stops working.',
        'room.closeGo': 'Close it',
        'room.leaveTitle': 'Leave the table?',
        'room.leaveBody': 'You leave the hand and your seat carries on as an AI.',
        'room.joined': 'Someone joined the table',
        'room.left': '{name} left the table',
        'room.joinTitle': 'Join a table', 'room.joinHint': 'Type the six digits your friend read out.',
        'room.join': 'Join', 'room.joining': '⏳ Connecting…',
        'room.looking': 'Looking for the table…',
        'room.connected': 'Connected. Waiting for the host to deal…',
        'room.sixDigits': 'The code is six digits.',
        'room.youAreIn': 'You are in',
        'room.waitHost': 'Waiting for the host to start the hand. Keep this tab open.',
        'room.closedTitle': 'The table closed',
        'room.closedBody': 'The host left.',
        'room.cantOpen': 'Could not open the table', 'room.cantJoin': 'Could not join',
        'room.notReady': 'The table is not ready',
        'room.notReadyBody': 'Nothing has arrived from the host yet. Try again in a moment.',
        'room.waitDeal': 'Waiting for the host to deal again…',
        'room.noCoins': 'Not enough coins',
        'room.noCoinsBody': 'Sitting in the {room} needs {n} coins.',

        /* rooms */
        'rooms.beginner': 'Beginner Room', 'rooms.beginner.blurb': 'Free to sit. Learn the game.',
        'rooms.casual': 'Casual Room', 'rooms.casual.blurb': 'Small stakes, real swings.',
        'rooms.pro': 'Pro Room', 'rooms.pro.blurb': 'For players who know the odds.',
        'rooms.master': 'Master Room', 'rooms.master.blurb': 'Deep pockets only.',

        /* AI difficulty */

        /* rank titles */
        'title.Novice': 'Novice', 'title.Beginner': 'Beginner', 'title.Player': 'Player',
        'title.Veteran': 'Veteran', 'title.Expert': 'Expert', 'title.Master': 'Master',
        'title.Legend': 'Legend',

        /* games */
        'game.twentyone': '21',
        'game.twentyone.blurb': 'Get closer to 21 than the dealer. Five cards under 21 beats everything.',
        'game.doudizhu': '斗地主', 'game.doudizhu.blurb': 'Landlord against two Farmers. Bombs, rockets and a spring.',
        /* 斗地主 */
        'ddz.landlord': '地主 Landlord', 'ddz.farmer': '农民 Farmer',
        'ddz.noBid': '不叫 Pass', 'ddz.bidN': '{n}分',
        'ddz.bidNote': 'The highest bid takes the three face-down cards, leads, and sets the base score.',
        'ddz.play': '出牌 Play', 'ddz.pass': '不出 Pass', 'ddz.hint': '提示 Hint',
        'ddz.bottom': 'Bottom cards', 'ddz.base': 'Base {n}',
        'ddz.worth': '🪙 {n} a side',
        'ddz.cardsLeft': '{n} cards',
        'ddz.yourBid': 'Bid for the Landlord.',
        'ddz.waitingBid': '{name} is bidding…',
        'ddz.yourLead': 'Your lead — play anything.',
        'ddz.beat': 'Beat the {what}, or pass.',
        'ddz.waiting': '{name} is thinking…',
        'ddz.cannotBeat': 'Those cards do not beat what is down.',
        'ddz.notACombo': 'Those cards are not a combination.',
        'ddz.noPlay': 'Nothing in your hand answers that.',
        'ddz.wentOut': 'went out',
        'ddz.spring': '春天 Spring', 'ddz.antiSpring': '反春 Anti-Spring',
        'ddz.detailLandlord': '地主 {name}', 'ddz.detailBase': 'base {n}', 'ddz.detailMult': '×{n}',
        'ddz.type.single': 'Single', 'ddz.type.pair': 'Pair', 'ddz.type.triple': 'Triple',
        'ddz.type.triple1': 'Triple + Single', 'ddz.type.triple2': 'Triple + Pair',
        'ddz.type.straight': 'Straight', 'ddz.type.pairs': 'Consecutive Pairs',
        'ddz.type.plane': 'Airplane', 'ddz.type.plane1': 'Airplane + Singles',
        'ddz.type.plane2': 'Airplane + Pairs',
        'ddz.type.four2': 'Four + Two', 'ddz.type.four2pair': 'Four + Two Pairs',
        'ddz.type.bomb': '炸弹 Bomb', 'ddz.type.rocket': '王炸 Rocket',
        'ddz.rule1': 'Three players and 54 cards. One Landlord against two Farmers — 17 cards each, and three left face down.',
        'ddz.rule2': 'Bid 不叫, 1分, 2分 or 3分. The highest bid takes the three face-down cards, leads the first play, and becomes the base score. A bid of 3 ends the bidding at once.',
        'ddz.rule3': 'Order is 3 4 5 6 7 8 9 10 J Q K A 2, then the small joker, then the big joker. 2 beats the ace, and suits count for nothing.',
        'ddz.rule4': 'To answer a play you must match its type and its number of cards and beat it. A six-card straight cannot answer a five-card one.',
        'ddz.rule5': 'A bomb is four of a kind and beats any normal play; a higher bomb beats a lower one. The rocket is both jokers, and beats everything.',
        'ddz.rule6': 'A 2 and the jokers can never be part of a straight, a run of pairs or an airplane, and an ace can never be used as a 1.',
        'ddz.rule7': 'Two passes in a row clear the table, and the last player to get cards down leads again — with anything they like.',
        'ddz.rule8': 'First hand empty wins, and either Farmer going out wins for both. Every bomb and the rocket doubles the stake, and so does a 春天 or 反春.',

        'game.bigtwo': '锄大D', 'game.bigtwo.blurb': 'Big Two. The 3♦ opens, suits decide, first hand empty wins.',
        /* 锄大D */
        'b2.play': '出牌 Play', 'b2.pass': '不出 Pass', 'b2.hint': '提示 Hint',
        'b2.cardsLeft': '{n} cards', 'b2.wentOut': 'went out',
        'b2.onTable': 'To beat', 'b2.opens': 'The 3♦ opens', 'b2.free': 'Open table',
        'b2.waiting': '{name} is thinking…',
        'b2.youOpen': 'You hold the 3♦ — your play must contain it.',
        'b2.yourLead': 'Your lead — play anything.',
        'b2.beat': 'Beat the {what}, or pass.',
        'b2.notACombo': 'Those cards are not a combination.',
        'b2.mustOpen': 'The opening play has to contain the 3♦.',
        'b2.cannotBeat': 'Those cards do not beat what is down.',
        'b2.noPlay': 'Nothing in your hand answers that.',
        'b2.detail': '{name} went out · {n} cards left on the table',
        'b2.type.SINGLE': 'Single', 'b2.type.PAIR': 'Pair', 'b2.type.TRIPLE': 'Triple',
        'b2.type.STRAIGHT': 'Straight', 'b2.type.FLUSH': 'Flush',
        'b2.type.FULL_HOUSE': 'Full House', 'b2.type.FOUR_OF_A_KIND': 'Four of a Kind',
        'b2.type.STRAIGHT_FLUSH': 'Straight Flush',
        'b2.rule1': 'Four players, 52 cards, no jokers, thirteen each. The first hand empty wins and the other three lose.',
        'b2.rule2': 'Whoever holds the 3♦ opens, and their first play has to contain it — alone, in a pair, or inside a five-card hand.',
        'b2.rule3': 'Rank runs 3 4 5 6 7 8 9 10 J Q K A 2, so the 2 is the highest card in the game. Suits break ties: ♦ < ♣ < ♥ < ♠, so 3♠ beats 3♣ — but 4♦ still beats 3♠, because rank is compared first.',
        'b2.rule4': 'Answer with the same number of cards, or pass. A single answers a single, a pair a pair, five cards five cards. Nothing crosses — there are no bombs here.',
        'b2.rule5': 'Five-card hands rank Straight < Flush < Full House < Four of a Kind + one < Straight Flush. A flush of low cards beats a straight to the ace.',
        'b2.rule6': 'A straight is 3-4-5-6-7 up to 10-J-Q-K-A and nothing else. J-Q-K-A-2 and A-2-3-4-5 are not straights.',
        'b2.rule7': 'Once you pass you are out until the trick clears. When everyone else has passed, the last player to get cards down leads again — with anything they like.',
        'b2.rule8': 'Each loser pays the table stake for every card still in their hand, and the winner collects the lot.',

        'game.poker': 'Poker', 'game.poker.blurb': "Texas Hold'em. Two cards each, five on the table, best five win.",
        /* Texas Hold'em */
        'pk.fold': 'Fold', 'pk.check': 'Check', 'pk.call': 'Call', 'pk.raise': 'Raise',
        'pk.bet': 'Bet', 'pk.callN': 'Call {n}', 'pk.raiseTo': 'Raise to', 'pk.betTo': 'Bet',
        'pk.allIn': 'All in', 'pk.min': 'Min', 'pk.halfPot': '½ pot', 'pk.potBet': 'Pot',
        'pk.pot': 'Pot', 'pk.dealer': 'Dealer button',
        'pk.satOut': 'Sitting out', 'pk.folded': 'Folded', 'pk.mucked': 'Mucked',
        'pk.showdown': 'Showdown', 'pk.waiting': '{name} is thinking…',
        'pk.toCall': '{n} to call — fold, call or raise.',
        'pk.yourMove': 'Your move — check or bet.',
        'pk.inFront': '{n} in front',
        'pk.preflop': 'Dealing…', 'pk.flop': 'The flop', 'pk.turn': 'The turn', 'pk.river': 'The river',
        'pk.detailShow': '{name} won with {hand}',
        'pk.detailFold': 'Won without a showdown · pot 🪙 {n}',
        'pk.hand.ROYAL_FLUSH': 'Royal flush',
        'pk.hand.STRAIGHT_FLUSH': 'Straight flush, {r} high',
        'pk.hand.FOUR_OF_A_KIND': 'Four {r}s',
        'pk.hand.FULL_HOUSE': '{r}s full of {s}s',
        'pk.hand.FLUSH': 'Flush, {r} high',
        'pk.hand.STRAIGHT': 'Straight, {r} high',
        'pk.hand.THREE_OF_A_KIND': 'Three {r}s',
        'pk.hand.TWO_PAIR': 'Two pair, {r}s and {s}s',
        'pk.hand.ONE_PAIR': 'Pair of {r}s',
        'pk.hand.HIGH_CARD': '{r} high',
        'pk.rule1': 'Two to nine players and 52 cards. Two private cards each and five on the table; the best five of your seven takes the pot.',
        'pk.rule2': 'You may use both your cards, one of them, or neither. A board of A♠ K♠ Q♠ J♠ 10♠ is a royal flush for everyone still in the hand.',
        'pk.rule3': 'Hands rank high card, pair, two pair, three of a kind, straight, flush, full house, four of a kind, straight flush, royal flush. Suits have no ranking at all.',
        'pk.rule4': 'The ace is high everywhere except A-2-3-4-5, the lowest straight there is. It never wraps — Q-K-A-2-3 and K-A-2-3-4 are not straights.',
        'pk.rule5': 'The button moves one seat every hand, and the two seats to its left post the small and the big blind.',
        'pk.rule6': 'Four betting rounds: before the flop, after it, after the turn and after the river. Fold, check when you owe nothing, call to match, or raise.',
        'pk.rule7': 'All in puts your whole stack in. If someone bets more than you can cover, the extra goes to a side pot you are not playing for.',
        'pk.rule8': 'Identical best hands split the pot. You sit down for a hundred big blinds or your balance, whichever is smaller.',

        'game.bullbull': '斗牛', 'game.bullbull.blurb': 'Bull Bull. Three to ten, two to score.',
        'game.mahjong': 'Mahjong', 'game.mahjong.blurb': 'Draw, meld, discard. Four melds and a pair — three seats or four.',
        /* 麻将 */
        'mj.win': '胡 Win', 'mj.pung': '碰 Pung', 'mj.chow': '吃 Chow',
        'mj.kong': '杠 Kong', 'mj.pass': '过 Pass',
        'mj.wall': '{n} tiles left', 'mj.mode': '{n}-player',
        'mj.yourTurn': 'Your turn — tap a tile to throw it.',
        'mj.yourClaim': 'That tile is yours to take, or let it go.',
        'mj.waiting': '{name} is thinking…',
        'mj.tapToDiscard': 'Tap a tile to discard.',
        'mj.drawn': '流局 — the wall ran out',
        'mj.won': '{name} won with {n}番',
        'mj.dealtIn': 'Threw the winning tile', 'mj.lost': 'No hand',
        'mj.selfDraw': '自摸', 'mj.byDiscard': '放铳',
        'mj.detailWin': '{name} · {how} · {n}番',
        'mj.detailDraw': '流局 — nobody was home',
        'mj.rule1': 'Three seats play the 108-tile game and four the 136-tile one. No flowers and no seasons. Thirteen tiles each, and East takes a fourteenth and throws first.',
        'mj.rule2': 'A winning hand is four melds and a pair. A meld is a chow — three in a run, all one suit — a pung of three the same, or a kong of four the same.',
        'mj.rule3': 'Two other hands win: 七对子, seven pairs, and 十三幺, all thirteen terminals and honours with one of them twice.',
        'mj.rule4': 'Draw, then discard. Anyone may claim the tile thrown: 胡 beats 碰 and 杠, which beat 吃, and 吃 is only for the seat immediately after the thrower.',
        'mj.rule5': 'Honours never form a chow — there is no run of winds. A kong takes four tiles off the table, so it draws a replacement.',
        'mj.rule6': 'Win by drawing the tile yourself (自摸) or on somebody else\'s discard (放铳). If the wall runs out with nobody home it is 流局 and the hand is void.',
        'mj.rule7': 'Every win is scored in 番, and no pattern is ever counted twice: 清一色 with 碰碰胡 is 清碰 and nothing else, and 大三元 is not also 小三元.',
        'mj.rule8': 'You choose what one 番 is worth before you sit down. Only the money follows it — the tiles and the rules never change. East keeps the seat by winning and gives it up otherwise.',
        'mj.rule9': 'Three seats have a floor: a hand worth fewer than 5番 cannot be declared at all, however finished it looks. Four seats have no minimum.',
        'mj.rule10': '10番 or more is 爆番 and settles at a flat 20番, so an 11番 hand and a 16番 hand pay the same. With three seats a 自摸 is paid double by both opponents, and on a discard the thrower pays double while the other pays once. With four seats a 自摸 is paid once by each, and a discard is covered by whoever threw it.',
        'mj.fanUnit': 'Table stake', 'mj.fanUnitNote': 'What one 番 is worth. Three seats need 5番 to win, so this is what a hand actually pays.',
        'mj.unit': '🪙 {n} a 番', 'mj.min': 'minimum {n}番',
        'mj.short': 'A winning hand — but {have}番 against a {need}番 minimum. Keep building.',
        'mj.bao': '💥 爆番, paid at {n}番',


        /* blackjack outcomes */ 'out.win': 'Win',
        'out.push': 'Push', 'out.loss': 'Lose', 'out.bust': 'Bust',
        'note.dealerStands': 'Stands on {n}', 'note.dealerBust': 'Bust',
        'detail.dealerBusts': 'Dealer busts', 'detail.dealer': 'Dealer {n}',

        /* per-game stat labels */ 'x.busts': 'Busts', 'x.doubles': 'Doubles', 'x.dealerBusts': 'Dealer busts seen',
        'x.forfeits': 'Walked away',

        /* achievements - global */
        'achv.first-game': 'Welcome to CardVerse', 'achv.first-game.desc': 'Play your first game.',
        'achv.first-win': 'First Blood', 'achv.first-win.desc': 'Win your first game.',
        'achv.streak-3': 'On a Roll', 'achv.streak-3.desc': 'Win 3 games in a row.',
        'achv.streak-5': 'Hot Hand', 'achv.streak-5.desc': 'Win 5 games in a row.',
        'achv.streak-10': 'Unstoppable', 'achv.streak-10.desc': 'Win 10 games in a row.',
        'achv.games-50': 'Regular', 'achv.games-50.desc': 'Play 50 games.',
        'achv.games-250': 'Table Veteran', 'achv.games-250.desc': 'Play 250 games.',
        'achv.level-10': 'Getting Serious', 'achv.level-10.desc': 'Reach level 10.',
        'achv.level-30': 'Expert', 'achv.level-30.desc': 'Reach level 30.',
        'achv.rich-25k': 'Deep Pockets', 'achv.rich-25k.desc': 'Hold 25,000 coins at once.',
        'achv.sampler': 'Around the Verse', 'achv.sampler.desc': 'Play every game in the hub at least once.',
        'achv.high-roller': 'High Roller', 'achv.high-roller.desc': 'Win a hand in the Master Room.',

        /* achievements - blackjack */

        /* achievements - 21 */
        'achv.to-first': 'Nice Round Number',
        'achv.to-exact': 'On the Nose',
        'achv.to-wins-50': 'Twenty-One Regular',
        'achv.to-streak-5': 'Five Alive',

        /* missions */
        'miss.play3': 'Play 3 games', 'miss.play5': 'Play 5 games',
        'miss.win2': 'Win 2 games', 'miss.win4': 'Win 4 games',
        'miss.variety': 'Play 2 different games', 'miss.variety3': 'Play 3 different games',
        'miss.streak2': 'Win 2 games in a row', 'miss.earn500': 'Win 500 coins in a day',
        'miss.casual': 'Play outside the Beginner Room',
        'miss.playGame': 'Play {name}',
        'miss.r100': '100 coins', 'miss.r150': '150 coins', 'miss.r200': '200 coins',
        'miss.r250xp': '250 coins + 100 XP', 'miss.r500': '500 coins', 'miss.r300xp': '300 XP',
        'miss.r1500': '1,500 coins + 500 XP',

        /* simplified settings */
        'setup.aiNote': 'Every AI plays correct basic strategy — no difficulty tiers, and none of them can see a card you cannot.',
        'set.aiNote': 'Opponents play correct basic strategy. There are no difficulty settings, and no AI ever sees a card you cannot.',
        'set.fastNote': 'shortens the deal and the pause between turns',
        'prof.formNote': 'Your last 12 results — W win, L lose, D push.',

        'game.baccarat': '百家乐', 'game.baccarat.blurb': 'Bet on Player, Banker or Tie. No decisions, all nerve.',
        'game.slots': '老虎机', 'game.slots.blurb': 'Three reels, one payline. Match three and the coins fall.',
        'game.dragongate': '射龙门', 'game.dragongate.blurb': 'Two cards open a gate. Bet whether the third lands inside it.',
        /* 射龙门 */
        'dg.house': 'The gate', 'dg.open': 'Open the gate', 'dg.shooting': 'Shooting…',
        'dg.higher': '大过 Higher', 'dg.lower': '小过 Lower',
        'dg.chooseAsk': 'Both posts are {rank}. Call it — higher or lower?',
        'dg.chooseNote': 'The third card must beat {rank} strictly. Level with it loses.',
        'dg.gate': '射中龙门 — through the gate!',
        'dg.post': '压线 — level with a post.',
        'dg.outside': '龙门外 — outside the gate.',
        'dg.odds': '{n} of {of} cards win · {pct}%',
        'dg.pays': 'pays ×{mult}',
        'dg.shut': 'No card can pass this gate — the posts are adjacent.',
        'dg.detail': 'Gate {lo} to {hi}',
        'dg.detailEqual': 'Two {rank}s · called {dir}',
        'dg.rule1': 'Two cards open the gate. A third must land strictly between them to win — rank only, suits count for nothing.',
        'dg.rule2': 'Ace is always 1, never 14. J is 11, Q is 12, K is 13. The order the posts come out in does not matter.',
        'dg.rule3': 'Level with a post is 压线, and loses. Outside the posts is 龙门外, and loses. Only strictly between wins.',
        'dg.rule4': 'If both posts are the same rank it is not a loss — you call 大过 (higher) or 小过 (lower), and the third card must beat that rank strictly.',
        'dg.rule5': 'Adjacent posts such as 7 and 8 have nothing between them, so no card can win. The round is still played out.',
        'dg.rule6': 'The payout follows the gate: the narrower it is, the more it pays. The table shows how many cards can win and what it pays before the third card lands. Cards are not reshuffled until the pack runs down.',

        /* 老虎机 */
        'slots.spin': 'SPIN', 'slots.spinning': 'Spinning…',
        'slots.cashout': 'Cash out', 'slots.finished': 'Session finished.',
        'slots.bet': 'Bet per spin', 'slots.max': 'Max',
        'slots.range': 'Machine takes {lo}–{hi} a spin',
        'slots.auto': 'Auto', 'slots.stopAuto': 'Stop auto ({n} left)',
        'slots.autoStopped': 'Auto-spin stopped — not enough coins.',
        'slots.paytable': 'Paytable',
        'slots.payNote': 'Three matching symbols on the line. Two do not pay.',
        'slots.session': 'This session', 'slots.history': 'Recent spins',
        'slots.spins': 'Spins', 'slots.spinsShort': '{n} spins',
        'slots.totalBet': 'Total bet', 'slots.totalWon': 'Total won', 'slots.net': 'Net',
        'slots.biggest': 'Biggest win', 'slots.jackpots': 'Jackpots',
        'slots.wins': 'Wins', 'slots.losses': 'Losses', 'slots.winRate': 'Win rate',
        'slots.noSpins': 'No spins yet.',
        'slots.won': 'WIN ×{mult} — 🪙 {n}', 'slots.jackpot': 'JACKPOT! 🪙 {n}',
        'slots.noWin': 'No win',
        'slots.note': '{spins} spins · {rate}% won',
        'slots.detail': '{spins} spins · biggest 🪙 {biggest}',
        'slots.rule1': 'Three reels, one payline. Set a stake and spin — the stake comes off before the reels move.',
        'slots.rule2': 'Only three identical symbols on the line pay. Two matching pays nothing, and three different pays nothing.',
        'slots.rule3': 'The payout is your stake multiplied: 🍒 ×5, 🍋 ×8, 🍊 ×10, 🍉 ×15, 🔔 ×25, ⭐ ×40, 💎 ×75, 7️⃣ ×100.',
        'slots.rule4': '7️⃣ 7️⃣ 7️⃣ is the jackpot at ×100. Bets run from 1 to 1,000 a spin, and never more than you hold.',
        'slots.rule5': 'Auto-spin runs 10, 25, 50 or 100 pulls and stops on its own if the coins run out. You can stop it at any time. Virtual coins only — nothing here is worth money.',

        /* 21 */
        'out.dragons': 'Five Dragons',
        'to.rules': 'Single deck · Dealer stands on 17 · 五龙 pays 2:1',
        'to.dealerDragons': 'Dealer makes 五龙 with {n}.',
        'detail.dealerDragons': 'Dealer 五龙 {n}',
        'to.rule1': 'Get closer to 21 than the dealer without going over. Aces are 1 or 11, whichever helps; pictures are 10.',
        'to.rule2': 'HIT takes one card. STAND stops. DOUBLE doubles your bet, takes exactly one card, then stands.',
        'to.rule3': 'Over 21 is a bust and loses at once, whatever the dealer does afterwards.',
        'to.rule4': 'There is no special two-card 21. A + K, A + 10 and 10 + 5 + 6 are all just 21, and all pay the same.',
        'to.rule5': '五龙 Five Dragons — exactly five cards totalling 21 or less. It beats every normal hand including a normal 21, pays 2:1, and ends the hand: there is no sixth card. The dealer can make it too.',
        'to.rule6': 'The dealer hits on 16 or below and stands on 17 or above. Normal win pays 1:1, 五龙 pays 2:1, a tie returns your bet.',
        'achv.to-first.desc': 'Win your first hand of 21.',
        'achv.to-exact.desc': 'Reach exactly 21.',
        'achv.to-dragons': '五龙', 'achv.to-dragons.desc': 'Make Five Dragons — five cards, 21 or under.',
        'achv.to-dragons-10': 'Dragon Keeper', 'achv.to-dragons-10.desc': 'Win with Five Dragons ten times.',
        'achv.to-double-win': 'Double Trouble', 'achv.to-double-win.desc': 'Win a hand after doubling.',
        'achv.to-wins-50.desc': 'Win 50 hands of 21.',
        'achv.to-streak-5.desc': 'Win 5 hands of 21 in a row.',
        'x.dragons': '五龙 hands', 'x.dragonWins': '五龙 wins', 'x.exact21': 'Reached exactly 21',


        /* 百家乐 */
        'bac.player': '闲 Player', 'bac.banker': '庄 Banker', 'bac.tie': '和 Tie',
        'bac.pays.player': 'pays 1:1', 'bac.pays.banker': 'pays 0.95:1', 'bac.pays.tie': 'pays 8:1',
        'bac.place': 'Place bet', 'bac.yourBet': 'Choose a side and a stake',
        'bac.dealing': 'Dealing…', 'bac.wins': '{side} wins',
        'bac.win': 'WON', 'bac.push': 'PUSH', 'bac.loss': 'LOST',
        'bac.rules': 'Eight decks · 闲 1:1 · 庄 0.95:1 · 和 8:1',
        'bac.detail': 'Player {p} · Banker {b} — {side}',
        'bac.rule1': 'Back the Player hand, the Banker hand, or a Tie. You are betting on an outcome, not playing a hand.',
        'bac.rule2': 'Aces are 1, 2–9 are face value, and tens and pictures are 0. Only the last digit of the total counts — 7 + 8 is 5, and 9 + 8 + 6 is 3.',
        'bac.rule3': 'Two cards to each hand. If either shows 8 or 9 that is a natural — no third cards are drawn, the scores are compared.',
        'bac.rule4': 'Otherwise the Player hand draws on 0–5 and stands on 6–7. The Banker then follows its own table: 0–2 always draws, 7 always stands, and 3 to 6 depend on the Player’s third card. Nobody chooses any of it.',
        'bac.rule5': 'Higher score wins, equal scores are a tie. 闲 pays 1:1; 庄 pays 0.95:1, because it wins slightly more often; 和 pays 8:1. A tie returns a 闲 or 庄 stake untouched.',

        /* how to play */
        'rules.title': 'How to play {game}',
        'rules.play': 'Got it — deal',
        'rules.again': 'Rules',
        'rules.first': 'First time here, so here is the short version.',

        /* 21 house rules */
    };

    /* ------------------------------------------------------------------ *
     * 简体中文
     * ------------------------------------------------------------------ */

    const ZH = {
        'lang.name': '简体中文',

        'ok': '确定', 'cancel': '取消', 'save': '保存', 'close': '关闭',
        'back': '← 大厅', 'leave': '← 离开', 'yes': '是', 'no': '否',
        'you': '你', 'host': '房主', 'guest': '玩家', 'of': '/',
        'coins': '金币', 'level': '等级', 'lv': '等级',

        'app.slogan': '一个世界，所有游戏。',
        'lobby.title': '🎮 游戏大厅',
        'lobby.play': '开始',
        'lobby.soon': '敬请期待',
        'lobby.players': '人数：{range}',
        'lobby.record': '已玩 {played} 局 · 胜率 {rate}',
        'lobby.footnote': '只用虚拟金币。CardVerse 中的一切都不能购买、出售或兑现。',
        'nav.achievements': '成就', 'nav.stats': '统计',
        'nav.bonus': '每日奖励', 'nav.friends': '好友对战',
        'nav.leaderboard': '排行榜', 'nav.profile': '个人资料', 'nav.settings': '设置',
        'nav.achCount': '{done} / {total}', 'nav.games': '{n} 局',
        'nav.toClaim': '{n} 项可领', 'nav.claimed': '今日已领', 'nav.ready': '可领取',
        'nav.online': '联机', 'nav.local': '本机',

        'setup.title': '选择牌桌',
        'setup.you': '你：已玩 {played} 局 · 胜 {wins} 局 · {rate}',
        'setup.room': '房间',
        'setup.freeEntry': '免费入场', 'setup.entry': '入场费 🪙 {n}',
        'setup.bets': '下注 {lo}–{hi}', 'setup.need': '需要 🪙 {n}',
        'setup.opponents': '对手', 'setup.aiPlayers': '电脑玩家',
        'setup.seats': '{max} 个座位已坐 {used} 个 · 你有 🪙 {coins}',
        'setup.sit': '入座',
        'setup.cantAfford': '进入{room}需要 {n} 金币。',

        'table.cards': '剩 {n} 张',
        'table.dealer': '庄家',
        'table.sittingOut': '暂不参与',
        'table.yourBet': '你的下注', 'table.someoneBet': '{who}下注',
        'table.yourTurn': '轮到你了', 'table.someoneTurn': '轮到{who}',
        'table.handOf': ' — 第 {n} / {total} 副手牌',
        'table.thinking': '{name} 思考中…',
        'table.betting': '{name} 下注中…',
        'table.dealerPlays': '庄家行动…',
        'table.dealerDraws': '庄家补牌…',
        'table.dealerBusts': '庄家爆牌。', 'table.dealerHas': '庄家 {n} 点。',
        'table.bookLabel': '建议：',
        'table.deal': '发牌', 'table.range': '桌限 {lo}–{hi}',
        'table.ofCoins': '/ {n}',
        'act.hit': '要牌', 'act.stand': '停牌', 'act.double': '加倍', 'act.bet': '下注',
        'table.leaveTitle': '要离开这局吗？',
        'table.leaveBody': '桌上的赌注将输掉，这局算作失败。',
        'table.leaveGo': '离开',
        'table.brokeTitle': '金币不足，无法继续',
        'table.brokeBody': '{room}至少需要 {n} 才能下注。去领每日奖励，或换个便宜的房间。',

        'res.win': '你赢了！', 'res.loss': '你输了', 'res.draw': '平局',
        'res.rank': '名次', 'res.coins': '金币', 'res.xp': '经验', 'res.winRate': '胜率',
        'res.board': '所有人的牌',
        'res.again': '再来一局', 'res.lobby': '返回大厅',
        'res.levelUp': '⬆️ 等级 {n} — {title}！', 'res.levelCoins': '+{n} 金币',
        'res.streak': '🔥 连胜 {n} 局', 'res.streakBonus': '+{n} 经验奖励',
        'res.missionDone': '任务完成',
        'res.claimIn': '{text} — 到每日奖励领取',
        'res.nth': '第{n}名',

        'prof.title': '👤 个人资料',
        'prof.since': '注册于 {date}',
        'prof.toNext': '距离等级 {n} 还需 {xp} / {need} 经验',
        'prof.totalGames': '总局数', 'prof.wins': '胜', 'prof.losses': '负',
        'prof.rate': '胜率', 'prof.streak': '连胜', 'prof.best': '最高 {n}',
        'prof.favourite': '最常玩',
        'prof.form': '近期战绩', 'prof.noGames': '还没有对局。',
        'prof.customise': '个性化',
        'prof.avatar': '头像', 'prof.back': '牌背', 'prof.table': '牌桌', 'prof.tile': '麻将牌面',
        'prof.equipped': '已装备', 'prof.equip': '装备',
        'prof.tileNote': '麻将上线后即可使用这些牌面。',
        'prof.nickname': '昵称', 'prof.nicknameHint': '最多 16 个字符。',
        'prof.buyTitle': '购买{name}？', 'prof.buyBody': '花费 🪙 {price}，你有 {have} 金币。',
        'prof.buy': '购买', 'prof.bought': '已购买并装备。',
        'prof.needMore': '还差 {n} 金币。',
        'w': '胜', 'l': '负', 'd': '平',

        'ach.title': '🏆 成就',
        'ach.unlocked': '已解锁 {done} / {total}',
        'ach.locked': '未解锁',
        'ach.global': '🌐 CardVerse',

        'stats.title': '📊 统计',
        'stats.all': '全部游戏',
        'stats.played': '总局数', 'stats.pushes': '平局',
        'stats.coinsWon': '赢得金币', 'stats.coinsLost': '输掉金币', 'stats.net': '净额',
        'stats.bestStreak': '最高连胜', 'stats.bestHand': '最佳点数', 'stats.netCoins': '净金币',
        'stats.recent': '最近对局',
        'stats.empty': '玩一局，这里就会出现数据。',

        'lb.title': '🏅 排行榜',
        'lb.all': '🌐 全部',
        'lb.biggest': '最大赢局',
        'lb.none': '还没有获胜记录。',
        'lb.localNote': '排名只保存在这个浏览器。全球排行榜会随联机对战一起推出。',
        'lb.summary': '等级 {level} · 🪙 {coins} · 胜 {wins} 局 · 净 {net}',

        'miss.title': '🎁 每日奖励',
        'miss.login': '📅 每日登录',
        'miss.day': '第 {n} 天',
        'miss.claimDay': '领取第 {n} 天',
        'miss.claimedToday': '今天已领 — 明天回来领第 {n} 天。',
        'miss.daily': '🎯 每日任务',
        'miss.claim': '领取', 'miss.claimed': '已领取',
        'miss.newDaily': '每天午夜更新任务。',
        'miss.streakTitle': '🔥 连胜',
        'miss.current': '当前', 'miss.bestEver': '最高',
        'miss.streakBonuses': '连胜奖励：{list}。',
        'miss.streakItem': '{n} 连胜 → +{xp} 经验',
        'miss.claimedToast': '已领取：{text}',
        'miss.loginWaiting': '🎁 第 {n} 天的登录奖励在每日奖励里等你。',

        'set.title': '⚙️ 设置',
        'set.appearance': '外观',
        'set.language': '语言',
        'set.theme': '主题', 'set.themeAuto': '跟随系统', 'set.themeDark': '深色', 'set.themeLight': '浅色',
        'set.fast': '快速动画',
        'set.table': '牌桌', 'set.hints': '显示策略提示',
        'set.player': '玩家', 'set.avatarNote': '头像在个人资料里选择。',
        'set.data': '你的数据',
        'set.dataNote': '所有数据都存在这个浏览器里。导出可以自己保存一份；Drive 会在你的 Google 云端硬盘保存一份。',
        'set.export': '📤 导出', 'set.import': '📥 导入',
        'set.toDrive': '☁️ 存到 Drive', 'set.fromDrive': '⬇️ 从 Drive 读取', 'set.auto': '自动：',
        'set.usage': '这个浏览器存了 {n} KB 的 CardVerse 数据。',
        'set.danger': '危险操作',
        'set.dangerNote': '重置无法撤销，请先导出。',
        'set.resetStats': '重置统计', 'set.startOver': '全部重来',
        'set.resetStatsTitle': '重置所有统计？',
        'set.resetStatsBody': '所有游戏的胜负、连胜和对局记录都会归零。金币、等级和成就会保留。',
        'set.resetDone': '统计已重置',
        'set.startOverTitle': '重新开始 CardVerse？',
        'set.startOverBody': '个人资料、金币、等级、统计、成就、任务和外观都会从这个浏览器抹去。如果你存过 Drive 备份，那份不受影响。',
        'set.eraseAll': '全部抹除',
        'set.footer': 'CardVerse · 一个世界，所有游戏。 · 只用虚拟金币 — 这里的一切都不值钱，也永远不会。',
        'set.saved': '已保存', 'set.nickSaved': '昵称已保存',

        'save.badFile': '这不是 CardVerse 的备份文件',
        'save.badFileBody': '请选择导出功能生成的文件，文件名形如 cardverse-<i>日期</i>.json。',
        'save.replaceTitle': '用这个文件替换现有数据？',
        'save.replaceBody': '文件里是 {file}。这个浏览器里是 {here}，将会被全部替换。',
        'save.useFile': '使用该文件',
        'save.loading': '已载入 — 正在重启…',
        'save.unreadable': '无法读取文件',
        'save.unreadableBody': '浏览器拒绝打开它。',
        'save.summary': '{name}，等级 {level}，{coins} 金币，{games} 局',
        'save.noPlayer': '没有玩家记录',
        'save.noChange': '没有任何改动',
        'save.noChangeBody': '浏览器拒绝了其中一次写入，原有记录已完整恢复。',
        'save.exported': '✅ 已导出',
        'storage.failing': '这个浏览器拒绝保存。刷新后进度会丢失 — 请立刻到设置里导出。',
        'drive.offer': '这个浏览器没有 CardVerse 记录。要从 Google Drive 恢复吗？',
        'drive.offerYes': '从 Drive 恢复', 'drive.offerNo': '重新开始',

        'room.title': '🌐 好友对战',
        'room.unavailable': '暂时无法联机',
        'room.unavailableBody': '点对点连接库没有加载。请检查网络或是否有扩展在拦截，然后刷新。CardVerse 的其他功能都不受影响 — 包括同机轮流玩。',
        'room.backLobby': '返回大厅',
        'room.hostBig': '开一桌', 'room.hostSub': '你来发牌。朋友用 6 位数房号加入。',
        'room.joinBig': '加入牌桌', 'room.joinSub': '输入朋友给你的房号。',
        'room.privacy': '对局数据在你们的设备之间直接传输。游戏内容不会经过 CardVerse — 只有一个牵线服务负责互换地址。',
        'room.settings': '牌桌设置', 'room.game': '游戏',
        'room.fillAI': '空位用电脑填满',
        'room.open': '开桌', 'room.opening': '⏳ 正在开桌…',
        'room.code': '房号',
        'room.codeNote': '把房号念给朋友，或点一下复制。请保持这个标签页开着 — 牌桌就在这里。',
        'room.copied': '房号已复制', 'room.copyFail': '复制失败 — 直接念给朋友吧',
        'room.atTable': '牌桌上的人',
        'room.emptySeats': '{n} 个空位会用电脑填满。',
        'room.start': '开始游戏', 'room.next': '下一局',
        'room.closeTable': '关闭牌桌', 'room.closeTitle': '关闭牌桌？',
        'room.closeBody': '所有人都会断开，房号也会失效。',
        'room.closeGo': '关闭',
        'room.leaveTitle': '离开牌桌？',
        'room.leaveBody': '你会离开这一局，你的座位会交给电脑继续。',
        'room.joined': '有人加入了牌桌',
        'room.left': '{name} 离开了牌桌',
        'room.joinTitle': '加入牌桌', 'room.joinHint': '输入朋友念给你的六位数字。',
        'room.join': '加入', 'room.joining': '⏳ 连接中…',
        'room.looking': '正在寻找牌桌…',
        'room.connected': '已连接。等房主发牌…',
        'room.sixDigits': '房号是六位数字。',
        'room.youAreIn': '已加入',
        'room.waitHost': '等房主开始这一局。请保持这个标签页开着。',
        'room.closedTitle': '牌桌已关闭',
        'room.closedBody': '房主离开了。',
        'room.cantOpen': '无法开桌', 'room.cantJoin': '无法加入',
        'room.notReady': '牌桌还没准备好',
        'room.notReadyBody': '还没有收到房主的数据。请稍后再试。',
        'room.waitDeal': '等房主再发一局…',
        'room.noCoins': '金币不足',
        'room.noCoinsBody': '进入{room}需要 {n} 金币。',

        'rooms.beginner': '新手房', 'rooms.beginner.blurb': '免费入座，先学会玩。',
        'rooms.casual': '休闲房', 'rooms.casual.blurb': '小注怡情，输赢真实。',
        'rooms.pro': '高手房', 'rooms.pro.blurb': '给懂概率的人。',
        'rooms.master': '大师房', 'rooms.master.blurb': '家底厚的才进来。',

        'title.Novice': '新手', 'title.Beginner': '入门', 'title.Player': '玩家',
        'title.Veteran': '老手', 'title.Expert': '高手', 'title.Master': '大师',
        'title.Legend': '传奇',
        'game.twentyone': '21点',
        'game.twentyone.blurb': '比庄家接近 21 点。五张牌不超 21 赢过一切。',
        'game.doudizhu': '斗地主', 'game.doudizhu.blurb': '地主对农民。炸弹与王炸。',
        'ddz.landlord': '地主', 'ddz.farmer': '农民',
        'ddz.noBid': '不叫', 'ddz.bidN': '{n}分',
        'ddz.bidNote': '叫得最高的拿底牌、先出牌，叫的分数就是底分。',
        'ddz.play': '出牌', 'ddz.pass': '不出', 'ddz.hint': '提示',
        'ddz.bottom': '底牌', 'ddz.base': '底分 {n}',
        'ddz.worth': '一家 🪙 {n}',
        'ddz.cardsLeft': '{n} 张',
        'ddz.yourBid': '轮到你叫地主。',
        'ddz.waitingBid': '{name} 正在叫牌…',
        'ddz.yourLead': '你先出，随便出什么都行。',
        'ddz.beat': '要大过{what}，不然就不出。',
        'ddz.waiting': '{name} 想牌中…',
        'ddz.cannotBeat': '这几张管不了。',
        'ddz.notACombo': '这几张凑不成牌型。',
        'ddz.noPlay': '手上没牌管得了。',
        'ddz.wentOut': '走完',
        'ddz.spring': '春天', 'ddz.antiSpring': '反春',
        'ddz.detailLandlord': '地主 {name}', 'ddz.detailBase': '底分 {n}', 'ddz.detailMult': '×{n}',
        'ddz.type.single': '单牌', 'ddz.type.pair': '对子', 'ddz.type.triple': '三张',
        'ddz.type.triple1': '三带一', 'ddz.type.triple2': '三带二',
        'ddz.type.straight': '顺子', 'ddz.type.pairs': '连对',
        'ddz.type.plane': '飞机', 'ddz.type.plane1': '飞机带单',
        'ddz.type.plane2': '飞机带对',
        'ddz.type.four2': '四带二', 'ddz.type.four2pair': '四带两对',
        'ddz.type.bomb': '炸弹', 'ddz.type.rocket': '王炸',
        'ddz.rule1': '三个人，54 张牌。一个地主打两个农民——每人 17 张，剩三张底牌。',
        'ddz.rule2': '可以不叫，或者叫 1 分、2 分、3 分。叫得最高的拿底牌、先出牌，叫的分数就是底分。有人叫 3 分就立刻结束叫牌。',
        'ddz.rule3': '大小是 3 4 5 6 7 8 9 10 J Q K A 2，然后小王、大王。2 大过 A，花色不影响大小。',
        'ddz.rule4': '要管上一手，牌型和张数都要一样，而且要更大。六张的顺子管不了五张的顺子。',
        'ddz.rule5': '炸弹是四张一样的，能管任何普通牌型；大炸弹管小炸弹。王炸是两只王，管全部。',
        'ddz.rule6': '2 和王永远不能进顺子、连对或飞机，A 也不能当 1 用。',
        'ddz.rule7': '连着两家不出就清桌，最后出牌的那家重新出，想出什么都行。',
        'ddz.rule8': '先出完牌的赢。任何一个农民走完，两个农民都赢。每个炸弹和王炸都翻倍，春天、反春也翻倍。',

        'game.bigtwo': '锄大D', 'game.bigtwo.blurb': '大老二。方块 3 先出，花色分大小，先出完就赢。',
        'b2.play': '出牌', 'b2.pass': '不出', 'b2.hint': '提示',
        'b2.cardsLeft': '{n} 张', 'b2.wentOut': '出完',
        'b2.onTable': '要管的牌', 'b2.opens': '方块 3 先出', 'b2.free': '自由出牌',
        'b2.waiting': '{name} 想牌中…',
        'b2.youOpen': '方块 3 在你手上——第一手一定要带上它。',
        'b2.yourLead': '你先出，随便出什么都行。',
        'b2.beat': '要大过{what}，不然就不出。',
        'b2.notACombo': '这几张凑不成牌型。',
        'b2.mustOpen': '第一手一定要带方块 3。',
        'b2.cannotBeat': '这几张管不了。',
        'b2.noPlay': '手上没牌管得了。',
        'b2.detail': '{name} 先出完 · 桌上还剩 {n} 张',
        'b2.type.SINGLE': '单牌', 'b2.type.PAIR': '对子', 'b2.type.TRIPLE': '三条',
        'b2.type.STRAIGHT': '顺子', 'b2.type.FLUSH': '同花',
        'b2.type.FULL_HOUSE': '葫芦', 'b2.type.FOUR_OF_A_KIND': '四条',
        'b2.type.STRAIGHT_FLUSH': '同花顺',
        'b2.rule1': '四个人，52 张牌，没有鬼牌，每人 13 张。先出完牌的赢，其他三家都输。',
        'b2.rule2': '拿到方块 3 的人先出，而且第一手一定要带上方块 3——单出、成对，或者放在五张牌型里都行。',
        'b2.rule3': '大小是 3 4 5 6 7 8 9 10 J Q K A 2，所以 2 最大。同点数看花色：♦ < ♣ < ♥ < ♠，黑桃 3 大过梅花 3；但方块 4 还是大过黑桃 3，因为先比点数。',
        'b2.rule4': '要出一样张数的牌，不然就不出。单张管单张，对子管对子，五张管五张，不能跨。这里没有炸弹。',
        'b2.rule5': '五张牌型的大小是：顺子 < 同花 < 葫芦 < 四条带一 < 同花顺。小同花也大过 A 的顺子。',
        'b2.rule6': '顺子只有 3-4-5-6-7 到 10-J-Q-K-A 这几种。J-Q-K-A-2 和 A-2-3-4-5 都不算顺子。',
        'b2.rule7': '一旦不出，这一圈就轮不到你了。等其他人都不出，最后出牌的那家重新出，想出什么都行。',
        'b2.rule8': '输的人手上还剩几张，就按桌上的注码赔几注，全部归赢家。',

        'game.poker': '德州扑克', 'game.poker.blurb': '德州扑克。两张底牌，五张公共牌，七选五。',
        'pk.fold': '弃牌', 'pk.check': '过牌', 'pk.call': '跟注', 'pk.raise': '加注',
        'pk.bet': '下注', 'pk.callN': '跟 {n}', 'pk.raiseTo': '加注到', 'pk.betTo': '下注',
        'pk.allIn': '全下', 'pk.min': '最小', 'pk.halfPot': '半池', 'pk.potBet': '一池',
        'pk.pot': '底池', 'pk.dealer': '庄家位',
        'pk.satOut': '未入座', 'pk.folded': '已弃牌', 'pk.mucked': '盖牌',
        'pk.showdown': '摊牌', 'pk.waiting': '{name} 想牌中…',
        'pk.toCall': '要跟 {n}——弃牌、跟注或加注。',
        'pk.yourMove': '轮到你了——过牌或下注。',
        'pk.inFront': '已下 {n}',
        'pk.preflop': '发牌中…', 'pk.flop': '翻牌', 'pk.turn': '转牌', 'pk.river': '河牌',
        'pk.detailShow': '{name} 以{hand}获胜',
        'pk.detailFold': '无人跟到底 · 底池 🪙 {n}',
        'pk.hand.ROYAL_FLUSH': '皇家同花顺',
        'pk.hand.STRAIGHT_FLUSH': '同花顺，{r} 最大',
        'pk.hand.FOUR_OF_A_KIND': '四条 {r}',
        'pk.hand.FULL_HOUSE': '{r} 带 {s} 葫芦',
        'pk.hand.FLUSH': '同花，{r} 最大',
        'pk.hand.STRAIGHT': '顺子，{r} 最大',
        'pk.hand.THREE_OF_A_KIND': '三条 {r}',
        'pk.hand.TWO_PAIR': '两对，{r} 和 {s}',
        'pk.hand.ONE_PAIR': '一对 {r}',
        'pk.hand.HIGH_CARD': '{r} 高牌',
        'pk.rule1': '2 到 9 个人，52 张牌。每人两张底牌，桌上五张公共牌，七张里选五张最强的赢底池。',
        'pk.rule2': '两张底牌可以都用、用一张，或者一张都不用。桌上如果是 A♠ K♠ Q♠ J♠ 10♠，还没弃牌的人都是皇家同花顺。',
        'pk.rule3': '牌型由小到大：高牌、一对、两对、三条、顺子、同花、葫芦、四条、同花顺、皇家同花顺。花色完全不分大小。',
        'pk.rule4': 'A 一般最大，只有在 A-2-3-4-5 里当 1，那是最小的顺子。A 不能绕圈——Q-K-A-2-3 和 K-A-2-3-4 都不算顺子。',
        'pk.rule5': '庄家位每局往左移一位，它左边两家分别下小盲和大盲。',
        'pk.rule6': '一共四轮下注：翻牌前、翻牌后、转牌后、河牌后。可以弃牌，不欠注时可以过牌，也可以跟注或加注。',
        'pk.rule7': '全下就是把手上筹码全推出去。如果别人下的比你能跟的多，多出来的会另开边池，你分不到。',
        'pk.rule8': '最强五张完全一样就平分底池。入座筹码是 100 个大盲，或者你全部余额，取小的那个。',

        'game.bullbull': '斗牛', 'game.bullbull.blurb': '三张凑十，两张比大小。',
        'game.mahjong': '麻将', 'game.mahjong.blurb': '摸牌、吃碰、打牌。四副面子加一对将，三人或四人。',
        'mj.win': '胡', 'mj.pung': '碰', 'mj.chow': '吃',
        'mj.kong': '杠', 'mj.pass': '过',
        'mj.wall': '剩 {n} 张', 'mj.mode': '{n} 人麻将',
        'mj.yourTurn': '轮到你了——点一张牌打出去。',
        'mj.yourClaim': '这张牌你可以要，也可以过。',
        'mj.waiting': '{name} 想牌中…',
        'mj.tapToDiscard': '点一张牌打出去。',
        'mj.drawn': '流局——牌摸完了',
        'mj.won': '{name} 以 {n} 番和牌',
        'mj.dealtIn': '放铳', 'mj.lost': '没和',
        'mj.selfDraw': '自摸', 'mj.byDiscard': '放铳',
        'mj.detailWin': '{name} · {how} · {n}番',
        'mj.detailDraw': '流局——没人和牌',
        'mj.rule1': '三个人打 108 张，四个人打 136 张。没有花牌，没有季节牌。每人 13 张，庄家多摸一张先打。',
        'mj.rule2': '和牌是四副面子加一对将。面子可以是吃（同花色三张连着）、碰（三张一样）或杠（四张一样）。',
        'mj.rule3': '另外两种也能和：七对子，七组对子；十三幺，十三张幺九字牌加其中一张。',
        'mj.rule4': '先摸后打。别人打出的牌大家都可以要：胡大过碰和杠，碰杠大过吃，而吃只有下家能叫。',
        'mj.rule5': '字牌不能吃——没有风的顺子。杠会拿走四张牌，所以要补一张。',
        'mj.rule6': '自己摸到叫自摸，别人打出来的叫放铳。牌摸完还没人和就是流局，这局作废。',
        'mj.rule7': '每次和牌都算番，而且同一个番不会算两次：清一色加碰碰胡就是清碰，不再另算；大三元也不再算小三元。',
        'mj.rule8': '入座前先选一番多少钱。只有钱跟着变，牌和规则都不变。庄家赢了继续坐庄，输了就轮庄。',
        'mj.rule9': '三人麻将有底线：不够 5 番就不能胡，牌型再漂亮也一样。四人麻将没有最低番数。',
        'mj.rule10': '10 番以上就是爆番，一律按 20 番结算，所以 11 番和 16 番赔一样多。三人自摸时两家都赔双倍；放铳时放铳的那家赔双倍，另一家赔正常。四人自摸时三家各赔一份，放铳则由打出那张牌的人全包。',
        'mj.fanUnit': '桌码', 'mj.fanUnitNote': '一番值多少。三人要 5 番才能胡，所以这就是一手牌真正的价钱。',
        'mj.unit': '一番 🪙 {n}', 'mj.min': '最低 {n} 番',
        'mj.short': '牌是和了——但只有 {have} 番，要 {need} 番才能胡。继续做大。',
        'mj.bao': '💥 爆番，按 {n} 番算',
 'out.win': '赢',
        'out.push': '和局', 'out.loss': '输', 'out.bust': '爆牌',
        'note.dealerStands': '{n} 点停牌', 'note.dealerBust': '爆牌',
        'detail.dealerBusts': '庄家爆牌', 'detail.dealer': '庄家 {n} 点', 'x.busts': '爆牌次数', 'x.doubles': '加倍次数', 'x.dealerBusts': '庄家爆牌次数',
        'x.forfeits': '中途离开',

        'achv.first-game': '欢迎来到 CardVerse', 'achv.first-game.desc': '完成第一局游戏。',
        'achv.first-win': '首胜', 'achv.first-win.desc': '赢下第一局。',
        'achv.streak-3': '渐入佳境', 'achv.streak-3.desc': '连胜 3 局。',
        'achv.streak-5': '手气正旺', 'achv.streak-5.desc': '连胜 5 局。',
        'achv.streak-10': '势不可挡', 'achv.streak-10.desc': '连胜 10 局。',
        'achv.games-50': '常客', 'achv.games-50.desc': '完成 50 局。',
        'achv.games-250': '牌桌老将', 'achv.games-250.desc': '完成 250 局。',
        'achv.level-10': '认真起来了', 'achv.level-10.desc': '达到等级 10。',
        'achv.level-30': '高手', 'achv.level-30.desc': '达到等级 30。',
        'achv.rich-25k': '家底丰厚', 'achv.rich-25k.desc': '一次持有 25,000 金币。',
        'achv.sampler': '玩遍全场', 'achv.sampler.desc': '每个游戏都至少玩过一次。',
        'achv.high-roller': '豪客', 'achv.high-roller.desc': '在大师房赢下一局。',

        'achv.to-first': '整数之美',
        'achv.to-exact': '不偏不倚',
        'achv.to-wins-50': '21 点常客',
        'achv.to-streak-5': '五连不倒',

        'miss.play3': '玩 3 局', 'miss.play5': '玩 5 局',
        'miss.win2': '赢 2 局', 'miss.win4': '赢 4 局',
        'miss.variety': '玩 2 种不同的游戏', 'miss.variety3': '玩 3 种不同的游戏',
        'miss.streak2': '连胜 2 局', 'miss.earn500': '一天内赢得 500 金币',
        'miss.casual': '在新手房以外的房间玩一局',
        'miss.playGame': '玩一局{name}',
        'miss.r100': '100 金币', 'miss.r150': '150 金币', 'miss.r200': '200 金币',
        'miss.r250xp': '250 金币 + 100 经验', 'miss.r500': '500 金币', 'miss.r300xp': '300 经验',
        'miss.r1500': '1,500 金币 + 500 经验',

        'setup.aiNote': '所有电脑都按正确的基本策略出牌 — 没有难度分级，也看不到你看不到的牌。',
        'set.aiNote': '对手按正确的基本策略出牌。没有难度设置，电脑也永远看不到你看不到的牌。',
        'set.fastNote': '缩短发牌和回合之间的停顿',
        'prof.formNote': '最近 12 局结果 — 胜、负、平。',

        'game.baccarat': '百家乐', 'game.baccarat.blurb': '压闲、压庄或压和。不用决策，只看胆色。',
        'game.slots': '老虎机', 'game.slots.blurb': '三轮一线。三个一样就开奖。',
        'game.dragongate': '射龙门', 'game.dragongate.blurb': '两张牌开门，赌第三张能不能穿过去。',
        'dg.house': '龙门', 'dg.open': '开门', 'dg.shooting': '射门中…',
        'dg.higher': '大过', 'dg.lower': '小过',
        'dg.chooseAsk': '两边都是 {rank}。要大过还是小过？',
        'dg.chooseNote': '第三张必须严格大过或小过，一样大就输。',
        'dg.gate': '射中龙门！',
        'dg.post': '压线 — 撞到柱了。',
        'dg.outside': '龙门外。',
        'dg.odds': '{of} 张里有 {n} 张能赢 · {pct}%',
        'dg.pays': '赔 ×{mult}',
        'dg.shut': '这道门穿不过去 — 两柱相邻。',
        'dg.detail': '龙门 {lo} 到 {hi}',
        'dg.detailEqual': '两张 {rank} · 叫{dir}',
        'dg.rule1': '两张牌开龙门，第三张要严格落在中间才算赢。只看点数，花色不影响。',
        'dg.rule2': 'A 永远算 1，不算 14。J 是 11，Q 是 12，K 是 13。两根柱子的先后顺序不影响。',
        'dg.rule3': '和柱子一样大是压线，输；在门外也是输。只有严格在中间才赢。',
        'dg.rule4': '两根柱子一样大时不算输——你要叫大过或小过，第三张必须严格大过或小过那个点数。',
        'dg.rule5': '相邻的柱子（例如 7 和 8）中间没有牌，所以怎么开都赢不了。这一局照样打完。',
        'dg.rule6': '赔率跟着门走：门越窄赔越多。开牌前会显示还有几张能赢、赔多少。牌打完之前不会重新洗。',

        'slots.spin': '开始', 'slots.spinning': '转动中…',
        'slots.cashout': '下机', 'slots.finished': '本轮结束。',
        'slots.bet': '每次下注', 'slots.max': '最大',
        'slots.range': '每次 {lo}–{hi}',
        'slots.auto': '自动', 'slots.stopAuto': '停止自动（还剩 {n}）',
        'slots.autoStopped': '自动停止 — 金币不够了。',
        'slots.paytable': '赔率表',
        'slots.payNote': '一线上三个相同才算赢，两个不算。',
        'slots.session': '本轮统计', 'slots.history': '最近几把',
        'slots.spins': '总次数', 'slots.spinsShort': '{n} 次',
        'slots.totalBet': '总下注', 'slots.totalWon': '总赢得', 'slots.net': '净额',
        'slots.biggest': '最大单次', 'slots.jackpots': '头奖次数',
        'slots.wins': '赢', 'slots.losses': '输', 'slots.winRate': '胜率',
        'slots.noSpins': '还没有记录。',
        'slots.won': '赢 ×{mult} — 🪙 {n}', 'slots.jackpot': '头奖！🪙 {n}',
        'slots.noWin': '没中',
        'slots.note': '{spins} 次 · 中奖 {rate}%',
        'slots.detail': '{spins} 次 · 最大 🪙 {biggest}',
        'slots.rule1': '三个轮盘，一条中奖线。先选注码再转——注码在转动前先扣。',
        'slots.rule2': '只有一线上三个完全相同的图案才赔。两个相同不赔，三个不同也不赔。',
        'slots.rule3': '赔金 = 注码 × 倍数：🍒 ×5、🍋 ×8、🍊 ×10、🍉 ×15、🔔 ×25、⭐ ×40、💎 ×75、7️⃣ ×100。',
        'slots.rule4': '7️⃣ 7️⃣ 7️⃣ 是头奖，×100。每次下注 1 到 1,000，且不能超过你手上的金币。',
        'slots.rule5': '自动可选 10、25、50 或 100 次，金币不够会自动停，你也可以随时停。只用虚拟金币——这里的一切都不值钱。',

        'out.dragons': '五龙',
        'to.rules': '单副牌 · 庄家 17 点停牌 · 五龙赔 2:1',
        'to.dealerDragons': '庄家凑成五龙，{n} 点。',
        'detail.dealerDragons': '庄家五龙 {n}',
        'to.rule1': '比庄家接近 21 点，但不能超过。A 算 1 或 11，哪个划算算哪个；公牌算 10。',
        'to.rule2': '要牌拿一张；停牌不拿；加倍把注码翻倍，只拿一张，然后自动停牌。',
        'to.rule3': '超过 21 点就是爆，当场就输，不管庄家后面怎么摸。',
        'to.rule4': '没有什么两张牌的特殊 21。A + K、A + 10、10 + 5 + 6 都只是 21 点，赔率一样。',
        'to.rule5': '五龙 — 刚好五张牌且不超过 21 点。它赢过所有普通牌型，包括普通的 21 点，赔 2:1，且当场结束——没有第六张。庄家也可以凑五龙。',
        'to.rule6': '庄家 16 点以下要牌，17 点以上停牌。普通赢赔 1:1，五龙赔 2:1，和局退回注码。',
        'achv.to-first.desc': '赢下第一局 21 点。',
        'achv.to-exact.desc': '拿到刚好 21 点。',
        'achv.to-dragons': '五龙', 'achv.to-dragons.desc': '凑成五龙 — 五张牌不超 21 点。',
        'achv.to-dragons-10': '驯龙师', 'achv.to-dragons-10.desc': '用五龙赢下 10 局。',
        'achv.to-double-win': '加倍好运', 'achv.to-double-win.desc': '加倍后赢下一局。',
        'achv.to-wins-50.desc': '赢下 50 局 21 点。',
        'achv.to-streak-5.desc': '21 点连胜 5 局。',
        'x.dragons': '五龙次数', 'x.dragonWins': '五龙赢局', 'x.exact21': '拿到 21 点',


        'bac.player': '闲', 'bac.banker': '庄', 'bac.tie': '和',
        'bac.pays.player': '赔 1:1', 'bac.pays.banker': '赔 0.95:1', 'bac.pays.tie': '赔 8:1',
        'bac.place': '下注', 'bac.yourBet': '选一边，再下注',
        'bac.dealing': '发牌中…', 'bac.wins': '{side}赢',
        'bac.win': '赢', 'bac.push': '和', 'bac.loss': '输',
        'bac.rules': '八副牌 · 闲 1:1 · 庄 0.95:1 · 和 8:1',
        'bac.detail': '闲 {p} · 庄 {b} — {side}',
        'bac.rule1': '压闲、压庄或压和。你赌的是结果，不是自己出牌。',
        'bac.rule2': 'A 算 1，2–9 算牌面，10 和公牌算 0。只看总和的个位——7 + 8 是 5，9 + 8 + 6 是 3。',
        'bac.rule3': '两边各发两张。任一边是 8 或 9 就是例牌——不再补牌，直接比点数。',
        'bac.rule4': '否则闲家 0–5 补牌，6–7 不补。庄家再看自己的表：0–2 一定补，7 一定不补，3 到 6 要看闲家的第三张。全部自动，没人可以选。',
        'bac.rule5': '点数大的赢，一样就是和。闲赔 1:1；庄赢面略大，赔 0.95:1；和赔 8:1。开和时，压闲压庄的注码原封退回。',

        'rules.title': '{game}怎么玩',
        'rules.play': '明白了 — 开牌',
        'rules.again': '规则',
        'rules.first': '第一次玩，先看看规则。',
    };

    const PACKS = { en: EN, zh: ZH };
    const ORDER = ['en', 'zh'];

    /* ------------------------------------------------------------------ *
     * The API
     * ------------------------------------------------------------------ */

    let lang = 'en';

    function detect() {
        let stored = null;
        try { stored = localStorage.getItem(KEY); } catch (_) { stored = null; }
        if (stored && PACKS[stored]) return stored;
        // navigator.language is "zh", "zh-CN", "zh-Hans-SG"… — the primary
        // subtag is the only part that matters for a two-pack app.
        const nav = (navigator.language || 'en').toLowerCase().split('-')[0];
        return PACKS[nav] ? nav : 'en';
    }

    /**
     * Look a key up, filling `{braces}`. An unknown key falls back to English
     * and, failing that, returns the key itself — visible in testing, and
     * never a blank space in front of a player.
     */
    function t(key, params) {
        let s = PACKS[lang][key];
        if (s === undefined) s = EN[key];
        if (s === undefined) return key;
        if (!params) return s;
        return s.replace(/\{(\w+)\}/g, (m, name) =>
            (params[name] === undefined ? m : params[name]));
    }

    /**
     * Translate the data the app reads by property rather than by key —
     * game names, room names, achievements, and so on. The English original
     * is kept in `__en` so switching language twice is lossless, and so a
     * pack with no entry falls back rather than blanking a name.
     */
    function apply(obj, prop, key) {
        if (!obj) return;
        const enField = '__en_' + prop;
        if (obj[enField] === undefined) obj[enField] = obj[prop];
        const translated = PACKS[lang][key];
        obj[prop] = (translated === undefined) ? obj[enField] : translated;
    }

    function localize() {
        // Games, and the extra-stat labels they invent.
        for (const g of CV.Registry.all()) {
            apply(g, 'name', 'game.' + g.code);
            apply(g, 'blurb', 'game.' + g.code + '.blurb');
            if (g.extraLabels) {
                for (const k of Object.keys(g.extraLabels)) {
                    const key = 'x.' + k;
                    if (PACKS[lang][key] || EN[key]) g.extraLabels[k] = t(key);
                }
            }
            for (const a of (g.achievements || [])) {
                apply(a, 'name', 'achv.' + a.id);
                apply(a, 'desc', 'achv.' + a.id + '.desc');
            }
        }
        for (const r of CV.Registry.ROOMS) {
            apply(r, 'name', 'rooms.' + r.id);
            apply(r, 'blurb', 'rooms.' + r.id + '.blurb');
        }
        for (const a of CV.Achievements.GLOBAL) {
            apply(a, 'name', 'achv.' + a.id);
            apply(a, 'desc', 'achv.' + a.id + '.desc');
        }
        for (const m of CV.Missions.POOL) apply(m, 'text', 'miss.' + m.id);
        for (const ttl of CV.Profile.TITLES) {
            apply(ttl, 'name', 'title.' + (ttl.__en_name || ttl.name));
        }
        // Static markup in index.html that no screen ever re-renders.
        // Guarded because the headless test shim has no querySelectorAll.
        if (document.querySelectorAll) {
            document.querySelectorAll('[data-i18n]').forEach((el) => {
                el.textContent = t(el.dataset.i18n);
            });
        }
        document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
    }

    function set(next) {
        if (!PACKS[next] || next === lang) return false;
        lang = next;
        try { localStorage.setItem(KEY, next); } catch (_) { /* private window */ }
        localize();
        return true;
    }

    function init() {
        lang = detect();
        localize();
    }

    CV.I18n = {
        PACKS, ORDER, t, set, init, localize,
        get lang() { return lang; },
        name: (code) => (PACKS[code] || {})['lang.name'] || code,
    };
    CV.t = t;
})();
