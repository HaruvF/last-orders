'use strict';
const { shuffle, pick, makeCode, secs } = require('./util');

const TallTales = require('./games/talltales');
const TriviaMurderPub = require('./games/murder');
const BarBrawl = require('./games/brawl');
const DartsOfDestiny = require('./games/darts');

const GAMES = {
  talltales: { cls: TallTales, name: 'Tall Tales', desc: 'Bluff your way to glory' },
  murder: { cls: TriviaMurderPub, name: 'Trivia Murder Pub', desc: 'Answer right or die trying' },
  brawl: { cls: BarBrawl, name: 'Bar Brawl', desc: 'Roast battles, pub rules' },
  darts: { cls: DartsOfDestiny, name: 'Darts of Destiny', desc: 'Guess, wager, thunk' },
};

const AVATARS = ['wizard', 'gnome', 'knight', 'bard', 'goblin', 'vampire', 'orc', 'pirate', 'druid', 'dwarf', 'lizard', 'ghost'];
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2; // playable floor for testing; 4–8 recommended
const PUNISH_PTS = 100; // Pub Justice: how many points a punishment splashes away
const EMOJIS = ['😂', '🔥', '💀', '🍺', '👏', '🤮', '😱', '🖕'];
const EMOJI_COOLDOWN_MS = 600;

class Room {
  constructor(io, code, hostSocketId) {
    this.io = io;
    this.code = code;
    this.hostSocketId = hostSocketId;
    this.players = new Map(); // name -> player
    this.scene = 'lobby';
    this.selected = new Set(['talltales', 'murder', 'brawl']);
    this.queue = [];
    this.queueIndex = 0;
    this.currentGame = null;
    this.timerEndsAt = null;
    this._timeout = null;
    this._sfx = { seq: 0, name: null };
    this._fx = { seq: 0, name: null };
    this._toast = { seq: 0, text: null };
    this.avatarPool = shuffle(AVATARS);
    this.lastResults = null;
    this.pendingPunish = {}; // player key -> true while they hold an unspent Pub Justice token
  }

  playerList() {
    return [...this.players.values()];
  }

  vip() {
    return this.playerList().find(p => p.isVip) || this.playerList()[0] || null;
  }

  // ---------- join / reconnect ----------
  addPlayer(name, socketId) {
    name = String(name || '').trim().slice(0, 12);
    if (!name) return { error: 'Pick a nickname first.' };
    const existing = this.players.get(name.toUpperCase());
    if (existing) {
      if (existing.connected) return { error: 'That name is taken (and they look nothing like you).' };
      existing.socketId = socketId; // reconnect
      existing.connected = true;
      this.sync();
      return { player: existing, reconnected: true };
    }
    if (this.scene !== 'lobby') return { error: 'Game already started. Wait for the next session or rejoin with your old nickname.' };
    if (this.players.size >= MAX_PLAYERS) return { error: 'Pub is full (8 max). Try the tavern down the road.' };
    const player = {
      name, key: name.toUpperCase(), socketId, connected: true,
      avatar: this.avatarPool[this.players.size % this.avatarPool.length],
      score: 0, isVip: this.players.size === 0,
    };
    this.players.set(player.key, player);
    this.sfx('bell');
    this.sync();
    return { player };
  }

  playerBySocket(socketId) {
    return this.playerList().find(p => p.socketId === socketId);
  }

  disconnectPlayer(socketId) {
    const p = this.playerBySocket(socketId);
    if (p) { p.connected = false; this.sync(); }
  }

  // ---------- helpers used by games ----------
  setTimer(seconds, cb) {
    this.clearTimer();
    this.timerEndsAt = Date.now() + seconds * 1000;
    this._timeout = setTimeout(() => {
      this.timerEndsAt = null;
      this._timeout = null;
      try { cb(); } catch (e) { console.error('[room ' + this.code + '] timer error:', e); }
    }, seconds * 1000);
  }

  clearTimer() {
    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = null;
    this.timerEndsAt = null;
  }

  sfx(name) { this._sfx = { seq: this._sfx.seq + 1, name }; }
  fx(name) { this._fx = { seq: this._fx.seq + 1, name }; }
  toast(text) { this._toast = { seq: this._toast.seq + 1, text }; }

  // ---------- Pub Justice (punish mechanic) ----------
  // Games call this when someone performs really well (streaks, knockouts, bullseyes).
  awardPunish(name) {
    const key = String(name || '').toUpperCase();
    const p = this.players.get(key);
    if (!p || this.pendingPunish[key]) return;
    this.pendingPunish[key] = true;
    this.toast(`⚖️ PUB JUSTICE: ${p.name} earned a punishment! Check your phone…`);
    this.sfx('bell');
  }

  applyPunish(punisher, data) {
    const others = this.playerList().filter(p => p.key !== punisher.key);
    if (!others.length) { delete this.pendingPunish[punisher.key]; return; }
    let target;
    if (data.random) {
      target = pick(others);
    } else {
      target = this.players.get(String(data.target || '').toUpperCase());
      if (!target || target.key === punisher.key) return; // invalid pick — keep the token
    }
    delete this.pendingPunish[punisher.key];
    target.score = Math.max(0, target.score - PUNISH_PTS);
    this.toast(`🍻 ${punisher.name}${data.random ? ' rolled the dice and' : ''} drenched ${target.name}! -${PUNISH_PTS}`);
    this.sfx('splash');
    this.fx('shake');
    this.sync();
  }

  // ---------- session flow ----------
  handleInput(socketId, data) {
    const player = this.playerBySocket(socketId);
    if (!player || !data) return;
    // Room-level actions that work in (almost) any scene
    if (data.action === 'emoji') {
      const now = Date.now();
      if (!EMOJIS.includes(data.e)) return;
      if (now - (player.lastEmoji || 0) < EMOJI_COOLDOWN_MS) return;
      player.lastEmoji = now;
      const h = this.io.sockets.sockets.get(this.hostSocketId);
      if (h) h.emit('emoji', { e: data.e, name: player.name });
      return;
    }
    if (data.action === 'punish' && this.pendingPunish[player.key]) {
      return this.applyPunish(player, data);
    }
    if (data.action === 'setAvatar' && this.scene === 'lobby') {
      const id = String(data.id || '');
      const taken = this.playerList().some(p => p.avatar === id && p.key !== player.key);
      if (AVATARS.includes(id) && !taken) {
        player.avatar = id;
        this.sfx('tick');
        this.sync();
      }
      return;
    }
    if (this.scene === 'game' && this.currentGame) {
      this.currentGame.onInput(player, data);
      return;
    }
    if (!player.isVip) return;
    if (this.scene === 'lobby' && data.action === 'toLobbyMenu') {
      if (this.players.size < MIN_PLAYERS) return;
      this.scene = 'menu';
      this.sfx('stinger');
      this.sync();
    } else if (this.scene === 'menu') {
      if (data.action === 'toggleGame' && GAMES[data.id]) {
        if (this.selected.has(data.id)) this.selected.delete(data.id);
        else this.selected.add(data.id);
        this.sync();
      } else if (data.action === 'pubcrawl') {
        this.selected = new Set(Object.keys(GAMES));
        this.startSession();
      } else if (data.action === 'startGames' && this.selected.size > 0) {
        this.startSession();
      }
    } else if (this.scene === 'bartab' && data.action === 'next') {
      this.nextGame();
    } else if (this.scene === 'final' && data.action === 'again') {
      for (const p of this.players.values()) p.score = 0;
      this.scene = 'menu';
      this.sync();
    }
  }

  startSession() {
    this.queue = Object.keys(GAMES).filter(id => this.selected.has(id));
    this.queueIndex = 0;
    this.pendingPunish = {};
    for (const p of this.players.values()) p.score = 0;
    this.launchGame(this.queue[0]);
  }

  launchGame(id) {
    this.scene = 'game';
    this.currentGame = new GAMES[id].cls(this);
    this.sfx('stinger');
    this.currentGame.start();
  }

  gameFinished(gameScores) {
    this.lastResults = { game: this.currentGame.name, scores: { ...gameScores } };
    for (const [name, pts] of Object.entries(gameScores)) {
      const p = this.players.get(name.toUpperCase());
      if (p) p.score += Math.max(0, pts);
    }
    this.currentGame = null;
    this.queueIndex++;
    if (this.queueIndex >= this.queue.length) {
      this.scene = 'final';
      this.fx('confetti');
      this.sfx('foam');
    } else {
      this.scene = 'bartab';
      this.sfx('bell');
    }
    this.clearTimer();
    this.sync();
  }

  nextGame() {
    this.launchGame(this.queue[this.queueIndex]);
  }

  // ---------- state broadcast ----------
  hostState() {
    return {
      scene: this.scene,
      code: this.code,
      timerEndsAt: this.timerEndsAt,
      sfx: this._sfx,
      fx: this._fx,
      toast: this._toast,
      minPlayers: MIN_PLAYERS,
      players: this.playerList().map(p => ({
        name: p.name, avatar: p.avatar, score: p.score, connected: p.connected, vip: p.isVip,
      })),
      queue: this.queue.map(id => GAMES[id].name),
      queueIndex: this.queueIndex,
      lastResults: this.lastResults,
      selected: [...this.selected],
      gamesMeta: Object.entries(GAMES).map(([id, g]) => ({ id, name: g.name, desc: g.desc })),
      game: this.currentGame ? this.currentGame.hostView() : null,
    };
  }

  playerState(player) {
    let view;
    if (this.scene === 'lobby') {
      view = {
        type: 'lobby',
        vip: player.isVip,
        canStart: this.players.size >= MIN_PLAYERS,
        count: this.players.size,
        min: MIN_PLAYERS,
        current: player.avatar,
        avatars: AVATARS.map(id => ({
          id, taken: this.playerList().some(p => p.avatar === id && p.key !== player.key),
        })),
      };
    } else if (this.scene === 'menu') {
      view = player.isVip
        ? { type: 'menu', selected: [...this.selected],
            games: Object.entries(GAMES).map(([id, g]) => ({ id, name: g.name, desc: g.desc })) }
        : { type: 'wait', message: pick(['The leader is choosing games...', 'Order another round while you wait...']) };
    } else if (this.scene === 'game' && this.currentGame) {
      view = this.currentGame.playerView(player);
    } else if (this.scene === 'bartab') {
      view = player.isVip
        ? { type: 'choices', prompt: 'Scores are up on the big screen.', action: 'next', options: [{ id: 'go', label: '▶ NEXT GAME' }] }
        : { type: 'wait', message: 'Check the Bar Tab on the big screen.' };
    } else if (this.scene === 'final') {
      view = player.isVip
        ? { type: 'choices', prompt: 'That’s LAST ORDERS!', action: 'again', options: [{ id: 'go', label: '🔄 PLAY AGAIN' }] }
        : { type: 'wait', message: 'That’s last orders! Final scores on the big screen.' };
    } else {
      view = { type: 'wait', message: '...' };
    }
    // Emoji reactions: allowed in voting/reveal phases (games decide) + scoreboards
    if ((this.scene === 'game' && this.currentGame && typeof this.currentGame.emojiOK === 'function' && this.currentGame.emojiOK())
      || this.scene === 'bartab' || this.scene === 'final') {
      view.allowEmoji = true;
    }
    // A held Pub Justice token takes over any idle screen until it's spent
    if (this.pendingPunish[player.key] && view.type === 'wait') {
      view = {
        type: 'punish',
        prompt: '⚖️ PUB JUSTICE! Pick a victim to drench (-' + PUNISH_PTS + ' pts)…',
        options: this.playerList().filter(p => p.key !== player.key)
          .map(p => ({ id: p.name, label: p.name, avatar: p.avatar })),
      };
    }
    return {
      scene: this.scene,
      code: this.code,
      timerEndsAt: this.timerEndsAt,
      you: { name: player.name, avatar: player.avatar, score: player.score, vip: player.isVip },
      view,
    };
  }

  sync() {
    const host = this.io.sockets.sockets.get(this.hostSocketId);
    if (host) host.emit('state', this.hostState());
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      const s = this.io.sockets.sockets.get(p.socketId);
      if (s) s.emit('state', this.playerState(p));
    }
  }

  destroy() {
    this.clearTimer();
  }
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  create(hostSocketId, reclaimCode) {
    if (reclaimCode && this.rooms.has(reclaimCode)) {
      const room = this.rooms.get(reclaimCode);
      room.hostSocketId = hostSocketId;
      room.sync();
      return room;
    }
    const code = makeCode(new Set(this.rooms.keys()));
    const room = new Room(this.io, code, hostSocketId);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase());
  }

  bySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.hostSocketId === socketId || room.playerBySocket(socketId)) return room;
    }
    return null;
  }

  remove(code) {
    const room = this.rooms.get(code);
    if (room) { room.destroy(); this.rooms.delete(code); }
  }
}

module.exports = { RoomManager, GAMES, secs };
