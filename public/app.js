const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const tableCode = params.get('table')?.toUpperCase();
const joinCode = params.get('join')?.toUpperCase();
const hostKey = params.get('key');
const mode = tableCode ? 'table' : joinCode ? 'player' : 'home';
const socket = io({ autoConnect: mode !== 'home' });
let state = null;
let raiseValue = 0;
let lastTurnKey = '';
let soundEnabled = localStorage.getItem('va-sound') !== 'off';
let audioContext;
const nf = new Intl.NumberFormat('en-US');

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function cardMarkup(card, back = false, small = false) {
  if (!card && !back) return '<div class="card card-empty"></div>';
  if (back) return `<div class="card card-back ${small ? 'card-small' : ''}"><span>♠</span></div>`;
  const red = card.suit === '♥' || card.suit === '♦';
  return `<div class="card ${red ? 'card-red' : 'card-black'} ${small ? 'card-small' : ''}"><span class="card-index">${card.rank}<small>${card.suit}</small></span><span class="card-center">${card.suit}</span></div>`;
}
function avatar(name, seat) { return `<div class="avatar avatar-${seat % 6}">${escapeHtml(name[0] || '?').toUpperCase()}</div>`; }
function money(value) { return nf.format(value ?? 0); }
function sound(type) {
  if (!soundEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const notes = type === 'win' ? [523, 659, 784] : type === 'turn' ? [587, 784] : [370, 494];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
      const at = audioContext.currentTime + index * .08;
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(.045, at + .01); gain.gain.exponentialRampToValueAtTime(.0001, at + .15);
      oscillator.connect(gain).connect(audioContext.destination); oscillator.start(at); oscillator.stop(at + .17);
    });
  } catch { /* Sound is optional. */ }
}
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(node._timer); node._timer = setTimeout(() => node.classList.remove('show'), 3200); }
function request(event, payload, callback = () => {}) { socket.emit(event, payload, (result) => { if (result?.error) toast(result.error); callback(result); }); }

function renderHome() {
  $('#app').innerHTML = `<main class="home-page"><div class="home-top"><span class="logo-mark">♠</span><span class="wordmark">VELVET <b>ACE</b></span><span class="edition">PRIVATE POKER CLUB</span></div><div class="home-body"><div class="home-copy"><span class="eyebrow"><i></i> THE TABLE IS YOURS</span><h1>Good cards.<br><em>Better company.</em></h1><p>Bring everyone to the same table. Put the game on a TV, scan the code with your phones, and play a proper poker night together.</p><div class="home-actions"><button id="create-room" class="button button-gold">Create a table <span>♠</span></button><span>No account needed · 2–6 players</span></div><div class="join-quick"><label for="room-code">Have a table code?</label><div><input id="room-code" maxlength="6" placeholder="ENTER CODE" autocomplete="off" spellcheck="false"><button id="go-join" class="button button-outline">Join table</button></div></div></div><div class="home-art"><div class="art-glow"></div><div class="art-table"><div class="art-ring"><div class="art-felt"><div class="art-line"></div><div class="art-cards">${cardMarkup({rank:'A',suit:'♠'})}${cardMarkup({rank:'K',suit:'♥'})}</div><div class="art-chip art-chip-one"></div><div class="art-chip art-chip-two"></div><div class="art-chip art-chip-three"></div></div></div></div></div></div><footer class="home-footer"><span>♠  VELVET ACE</span><span>FICTIONAL CHIPS · REAL PEOPLE</span></footer></main>`;
  $('#create-room').addEventListener('click', async () => {
    const button = $('#create-room'); button.disabled = true; button.textContent = 'Creating table…';
    try { const response = await fetch('/api/rooms', { method: 'POST' }); const room = await response.json(); if (!response.ok) throw new Error(room.error); location.href = `/?table=${room.code}&key=${encodeURIComponent(new URL(room.tableUrl).searchParams.get('key'))}`; }
    catch { toast('Could not create a table. Check the server.'); button.disabled = false; button.textContent = 'Create a table'; }
  });
  function join() { const code = $('#room-code').value.trim().toUpperCase(); if (code.length === 6) location.href = `/?join=${encodeURIComponent(code)}`; else toast('Enter the six-character code from the TV.'); }
  $('#go-join').addEventListener('click', join);
  $('#room-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') join(); });
}

function rosterSeats(game) {
  const players = game?.players ?? state.roster;
  return Array.from({ length: 6 }, (_, index) => {
    const player = players[index];
    if (!player) return `<div class="table-seat seat-${index} empty-seat"><div class="empty-avatar">+</div><span>OPEN SEAT</span></div>`;
    const roster = state.roster.find((item) => item.id === player.id);
    const turn = game?.turn === index;
    const winner = game?.winners?.some((item) => item.seat === index);
    const cards = game?.phase === 'showdown' && player.cards ? player.cards.map((item) => cardMarkup(item, false, true)).join('') : player.cardCount ? cardMarkup(null, true, true) + cardMarkup(null, true, true) : '';
    return `<div class="table-seat seat-${index} ${turn ? 'is-turn' : ''} ${winner ? 'is-winner' : ''} ${player.folded ? 'is-folded' : ''}"><div class="seat-cards">${cards}</div>${avatar(player.name, index)}<div class="seat-meta"><strong>${escapeHtml(player.name)}</strong><span>${money(player.stack ?? 1500)} chips</span></div>${roster?.connected === false ? '<span class="offline-dot" title="Disconnected"></span>' : ''}${player.lastAction ? `<div class="action-tag">${escapeHtml(player.lastAction)}</div>` : ''}${player.bet ? `<div class="seat-bet"><i></i>${money(player.bet)}</div>` : ''}</div>`;
  }).join('');
}

function renderTable() {
  if (!state) return;
  const game = state.game;
  const lobby = !game || game.phase === 'waiting' || game.phase === 'gameover';
  const ended = game?.phase === 'showdown';
  const canDeal = state.roster.filter((player) => player.connected).length >= 2;
  const board = Array.from({ length: 5 }, (_, index) => cardMarkup(game?.board?.[index])).join('');
  $('#app').innerHTML = `<main class="tv-page"><header class="tv-header"><div class="tv-brand"><span class="logo-mark">♠</span><span class="wordmark">VELVET <b>ACE</b></span><span class="header-rule"></span><span>PRIVATE TABLE</span></div><div class="tv-header-right"><span class="connection-pill"><i></i> LIVE TABLE</span><span class="table-code-label">TABLE <strong>${state.code}</strong></span><button class="sound-toggle" id="sound-toggle" aria-label="Toggle sound">${soundEnabled ? '♫' : '♪̸'}</button></div></header><div class="tv-content"><div class="room-hud"><span>${game ? `HAND ${game.hand}` : 'WELCOME TO THE TABLE'}</span><span>NO LIMIT TEXAS HOLD’EM <b>·</b> BLINDS 10 / 20</span></div><div class="table-scene"><div class="table-wood"><div class="table-leather"><div class="table-felt"><div class="felt-line"></div><div class="felt-watermark">♠<span>VELVET ACE</span></div></div></div></div><div class="board-zone"><span class="pot-caption">TOTAL POT</span><strong class="pot-number">${money(game?.pot ?? 0)} <small>CHIPS</small></strong><div class="community-cards">${board}</div><div class="street-name">${game ? game.phase === 'showdown' ? 'SHOWDOWN' : game.phase === 'gameover' ? 'TABLE FINISHED' : game.phase.toUpperCase() : 'WAITING FOR PLAYERS'}</div></div><div class="table-seats">${rosterSeats(game)}</div>${game?.dealer >= 0 ? `<div class="dealer-button dealer-${game.dealer}">D</div>` : ''}</div><div class="tv-lower"><div class="table-message"><span class="message-icon">✦</span><div><span class="message-kicker">${lobby ? 'POKER NIGHT STARTS HERE' : ended ? 'HAND COMPLETE' : game?.turn >= 0 ? 'ACTION ON' : 'AT THE TABLE'}</span><strong>${lobby ? canDeal ? `${state.roster.filter((player) => player.connected).length} players ready` : 'Waiting for players to join' : ended ? escapeHtml(game.history.find((entry) => entry.kind === 'win')?.message ?? 'Hand complete') : game?.turn >= 0 ? escapeHtml(game.players[game.turn].name) : 'Dealing cards'}</strong></div></div><div class="tv-actions">${lobby || ended ? `<button id="deal-button" class="button button-gold" ${canDeal ? '' : 'disabled'}>${ended ? 'Deal next hand' : game?.phase === 'gameover' ? 'New game' : 'Deal first hand'} <span>♠</span></button>` : `<span class="turn-clock" id="countdown">—</span>`}</div></div></div><aside class="invite-panel"><div class="invite-head"><span class="eyebrow">YOUR SEAT AWAITS</span><h2>Join the table.</h2><p>Scan with your phone. Your cards stay private on your screen.</p></div><div class="qr-frame"><img src="/api/rooms/${state.code}/qr.svg" alt="QR code to join table ${state.code}"></div><div class="invite-code"><span>OR ENTER THE CODE</span><strong>${state.code}</strong></div><div class="invite-steps"><span><i>1</i> Scan the code</span><span><i>2</i> Choose your name</span><span><i>3</i> Play from your phone</span></div><div class="invite-foot"><span class="invite-dot"></span>${state.roster.filter((player) => player.connected).length} / 6 PLAYERS CONNECTED</div></aside></div><footer class="tv-footer"><span>♠  EVERY HAND HAS A STORY</span><span>FICTIONAL CHIPS · REAL PEOPLE</span></footer></main>`;
  $('#sound-toggle').addEventListener('click', () => { soundEnabled = !soundEnabled; localStorage.setItem('va-sound', soundEnabled ? 'on' : 'off'); renderTable(); });
  $('#deal-button')?.addEventListener('click', () => request('host:deal', { fresh: !game || game.phase === 'gameover' }));
  updateClock();
}

function renderJoin() {
  const savedName = localStorage.getItem('va-name') || '';
  $('#app').innerHTML = `<main class="join-page"><div class="join-logo"><span class="logo-mark">♠</span><span class="wordmark">VELVET <b>ACE</b></span></div><div class="join-card"><span class="eyebrow"><i></i> TABLE ${escapeHtml(joinCode)}</span><h1>Take your seat.</h1><p>Enter your name and play from this phone. Your cards are visible only to you.</p><form id="join-form"><label for="player-name">YOUR NAME</label><input id="player-name" maxlength="18" minlength="2" autocomplete="nickname" value="${escapeHtml(savedName)}" placeholder="What should we call you?" required><button class="button button-gold" type="submit">Join the table <span>♠</span></button></form></div><div class="join-note">♠  PRIVATE TABLE · FICTIONAL CHIPS</div></main>`;
  $('#join-form').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#player-name').value.trim(); connectPlayer(name, null); });
}

function connectPlayer(name, token) {
  if (!socket.connected) socket.connect();
  socket.emit('player:join', { code: joinCode, name, token }, (result) => {
    if (result?.error) { localStorage.removeItem(`va-token-${joinCode}`); toast(result.error); if (token) renderJoin(); return; }
    localStorage.setItem(`va-token-${joinCode}`, result.token);
    localStorage.setItem('va-name', result.name);
  });
}

function playerSeat(game) { return game?.players.find((player) => player.id === state.playerId); }
function playerActions(game, me) {
  if (!game) return '<div class="waiting-copy">The host will deal when everyone is ready.</div>';
  if (game.phase === 'showdown') return `<div class="waiting-copy">${escapeHtml(game.history.find((item) => item.kind === 'win')?.message || 'Hand complete')}<small>Waiting for the next hand.</small></div>`;
  if (game.phase === 'gameover') return '<div class="waiting-copy">The table has a winner. Waiting for a new game.</div>';
  if (!me) return '<div class="waiting-copy">Waiting for the next game to join.</div>';
  if (me.folded) return '<div class="waiting-copy">You folded this hand.<small>Watch the table for the result.</small></div>';
  if (me.stack === 0) return '<div class="waiting-copy">You are all in.<small>Good luck at showdown.</small></div>';
  const legal = game.legal;
  if (!legal) return `<div class="waiting-copy">${escapeHtml(game.players[game.turn]?.name || 'Another player')} is thinking…<small>Your turn is coming.</small></div>`;
  raiseValue = Math.max(legal.minTotal, Math.min(legal.maxTotal, raiseValue || legal.minTotal));
  return `<div class="action-heading"><span>YOUR MOVE</span><span id="countdown">—</span></div><div class="action-row"><button class="action-fold" data-action="fold">Fold</button><button class="action-call" data-action="${legal.canCheck ? 'check' : 'call'}">${legal.canCheck ? 'Check' : `Call ${money(legal.toCall)}`}</button></div>${legal.canRaise ? `<div class="bet-box"><div class="bet-top"><span>RAISE TO</span><strong id="raise-display">${money(raiseValue)}</strong></div><input id="raise-slider" type="range" min="${legal.minTotal}" max="${legal.maxTotal}" step="1" value="${raiseValue}" aria-label="Raise amount"><div class="bet-presets"><button data-preset="min">MIN</button><button data-preset="half">½ POT</button><button data-preset="pot">POT</button><button data-preset="all">ALL IN</button></div></div><button class="button button-gold action-raise" data-action="raise">Raise to ${money(raiseValue)} <span>♠</span></button>` : ''}`;
}

function renderPlayer() {
  if (!state) return;
  const game = state.game;
  const me = playerSeat(game);
  const cards = me?.cards ?? [];
  const players = game?.players ?? state.roster;
  $('#app').innerHTML = `<main class="player-page"><header class="player-header"><div><span class="logo-mark">♠</span><span class="wordmark">VELVET <b>ACE</b></span></div><span class="player-room">TABLE <b>${state.code}</b></span></header><section class="player-table"><div class="player-table-head"><span>NO LIMIT HOLD’EM</span><span>10 / 20 BLINDS</span></div><div class="mini-table"><div class="mini-felt-line"></div><div class="mini-brand">♠</div><div class="mini-pot"><span>POT</span><strong>${money(game?.pot ?? 0)}</strong></div><div class="mini-board">${Array.from({ length: 5 }, (_, index) => cardMarkup(game?.board?.[index], false, true)).join('')}</div></div><div class="opponents">${players.filter((player) => player.id !== state.playerId).map((player) => `<div class="opponent ${game?.turn === player.seat ? 'opponent-turn' : ''}">${avatar(player.name, player.seat)}<span>${escapeHtml(player.name)}</span><b>${money(player.stack ?? 1500)}</b></div>`).join('')}</div></section><section class="my-section"><div class="my-heading"><div><span class="my-kicker">YOUR SEAT</span><h1>${escapeHtml(me?.name ?? state.roster.find((item) => item.id === state.playerId)?.name ?? 'Welcome')}</h1></div><div class="my-stack"><span>YOUR CHIPS</span><strong>${money(me?.stack ?? 1500)}</strong></div></div><div class="my-hand"><div class="my-cards">${cards.length ? cards.map((item) => cardMarkup(item)).join('') : cardMarkup(null) + cardMarkup(null)}</div><div class="hand-label"><span>YOUR HAND</span><strong>${game ? game.phase === 'showdown' ? 'Showdown' : game.phase.toUpperCase() : 'WAITING TO DEAL'}</strong></div></div></section><section class="controls"><div id="actions">${playerActions(game, me)}</div></section><footer class="player-footer"><span><i></i> CONNECTED TO TABLE ${state.code}</span><span>♠ VELVET ACE</span></footer></main>`;
  $('#raise-slider')?.addEventListener('input', (event) => { raiseValue = Number(event.target.value); $('#raise-display').textContent = money(raiseValue); $('.action-raise').innerHTML = `Raise to ${money(raiseValue)} <span>♠</span>`; });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const legal = game.legal; const value = { min: legal.minTotal, half: game.currentBet + Math.round(game.pot / 2), pot: game.currentBet + game.pot, all: legal.maxTotal }[button.dataset.preset];
    raiseValue = Math.max(legal.minTotal, Math.min(legal.maxTotal, value));
    $('#raise-slider').value = String(raiseValue); $('#raise-display').textContent = money(raiseValue); $('.action-raise').innerHTML = `Raise to ${money(raiseValue)} <span>♠</span>`;
  }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => { button.disabled = true; request('player:action', { type: button.dataset.action, total: raiseValue }, (result) => { if (result?.error) button.disabled = false; else sound('chip'); }); }));
  updateClock();
}

function updateClock() {
  const node = $('#countdown'); if (!node) return;
  const seconds = state?.deadline ? Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) : 0;
  node.textContent = `${seconds}s`;
  node.classList.toggle('urgent', seconds <= 10);
}

socket.on('connect', () => {
  if (mode === 'table') request('host:watch', { code: tableCode, key: hostKey });
  if (mode === 'player') {
    const token = localStorage.getItem(`va-token-${joinCode}`);
    if (token) connectPlayer(localStorage.getItem('va-name') || '', token);
  }
});
socket.on('room:state', (next) => {
  const turnKey = `${next.game?.hand}:${next.game?.phase}:${next.game?.turn}`;
  if (state && turnKey !== lastTurnKey && next.game?.turn >= 0 && (mode === 'table' || next.game?.players[next.game.turn]?.id === next.playerId)) sound('turn');
  if (state?.game?.phase !== 'showdown' && next.game?.phase === 'showdown') sound('win');
  lastTurnKey = turnKey; state = next;
  if (mode === 'table') renderTable(); else renderPlayer();
});
socket.on('room:deadline', (deadline) => { if (state) { state.deadline = deadline; updateClock(); } });
socket.on('disconnect', () => { if (mode !== 'home') toast('Connection lost. Reconnecting…'); });
setInterval(updateClock, 1000);

if (mode === 'home') renderHome();
else if (mode === 'player') { renderJoin(); if (socket.connected) { const token = localStorage.getItem(`va-token-${joinCode}`); if (token) connectPlayer(localStorage.getItem('va-name') || '', token); } }
else $('#app').innerHTML = '<div class="loading">♠<span>Opening the table…</span></div>';
