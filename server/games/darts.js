'use strict';
const GameBase = require('../gamebase');
const { shuffle, secs } = require('../util');
const NUMERIC = require('../content/numeric.json');

const ROUNDS = 5;
const START_BANK = 150;
const CLOSEST_PTS = 250;
const GUTTER_PENALTY = 100;
const BET_AMOUNTS = [50, 100, 150];

class DartsOfDestiny extends GameBase {
  constructor(room) {
    super(room);
    this.id = 'darts';
    this.name = 'Darts of Destiny';
    this.qs = shuffle(NUMERIC).slice(0, ROUNDS);
    this.round = 0;
    this.phase = 'intro';
    this.closestWins = {}; // name -> bullseye count (Pub Justice at 2)
    for (const p of this.players) this.scores[p.name] = START_BANK;
  }

  start() {
    this.phase = 'intro';
    this.room.bartender('roundStart');
    this.room.setTimer(secs(7), () => this.startThrow());
    this.room.sync();
  }

  startThrow() {
    this.q = this.qs[this.round];
    this.darts = {}; // name -> number
    this.bets = {};  // name -> {on, amount}
    // Hidden gutter zone around the decoy (skipped if it would swallow the answer)
    const range = this.q.max - this.q.min;
    const gw = range * 0.04;
    this.gutter = null;
    if (this.q.decoy !== undefined && Math.abs(this.q.decoy - this.q.answer) > range * 0.08) {
      this.gutter = { lo: this.q.decoy - gw, hi: this.q.decoy + gw };
    }
    this.phase = 'throw';
    this.room.sfx('stinger');
    this.room.setTimer(secs(30), () => this.startBets());
    this.room.sync();
  }

  startBets() {
    this.phase = 'bets';
    this.throwers = Object.keys(this.darts);
    if (this.throwers.length === 0) { this.round++; return this.nextOrEnd(); }
    this.room.sfx('bell');
    this.room.setTimer(secs(20), () => this.reveal());
    this.room.sync();
  }

  inGutter(v) {
    return this.gutter && v >= this.gutter.lo && v <= this.gutter.hi;
  }

  emojiOK() {
    return ['bets', 'reveal', 'standings'].includes(this.phase);
  }

  reveal() {
    this.phase = 'reveal';
    const ans = this.q.answer;
    let best = Infinity;
    this.results = {};
    for (const [n, v] of Object.entries(this.darts)) {
      const gut = this.inGutter(v);
      const dist = Math.abs(v - ans);
      this.results[n] = { value: v, dist, gutter: gut, winner: false };
      if (!gut && dist < best) best = dist;
    }
    this.winners = [];
    for (const [n, r] of Object.entries(this.results)) {
      if (!r.gutter && r.dist === best) { r.winner = true; this.winners.push(n); }
      if (r.gutter) this.addPoints(n, -GUTTER_PENALTY);
      if (r.winner) {
        this.addPoints(n, CLOSEST_PTS);
        this.closestWins[n] = (this.closestWins[n] || 0) + 1;
        if (this.closestWins[n] === 2) this.room.awardPunish(n); // two bullseyes = Pub Justice
      }
    }
    // Resolve side bets: even money — win +stake, loss -stake
    this.betResults = {};
    for (const [n, b] of Object.entries(this.bets)) {
      if (!b || !b.on || !b.amount) continue;
      const won = this.winners.includes(b.on);
      const delta = won ? b.amount : -b.amount;
      this.addPoints(n, delta);
      this.betResults[n] = { on: b.on, amount: b.amount, won, delta };
    }
    for (const p of this.players) if (this.scores[p.name] < 0) this.scores[p.name] = 0;
    this.room.sfx(this.winners.length ? 'foam' : 'wrong');
    this.room.fx('shake');
    // MC commentary: mock a gutter victim, or crown the sharpshooter
    const gutterFolk = Object.entries(this.results).filter(([, r]) => r.gutter).map(([n]) => n);
    if (gutterFolk.length) this.room.roast('gutter', gutterFolk[Math.floor(Math.random() * gutterFolk.length)]);
    else if (this.winners.length && Math.random() < 0.7) this.room.roast('bullseye', this.winners[0]);
    this.room.setTimer(secs(10), () => { this.round++; this.nextOrEnd(); });
    this.room.sync();
  }

  nextOrEnd() {
    if (this.round >= ROUNDS) {
      this.phase = 'standings';
      this.room.bartender('scores');
      this.room.sfx('stinger');
      this.room.setTimer(secs(8), () => this.finish());
      this.room.sync();
    } else {
      this.startThrow();
    }
  }

  onInput(player, data) {
    const name = player.name;
    if (this.phase === 'throw' && data.action === 'throw') {
      if (this.darts[name] !== undefined) return;
      let v = Number(data.value);
      if (!isFinite(v)) return;
      v = Math.max(this.q.min, Math.min(this.q.max, v));
      this.darts[name] = v;
      this.room.sfx('thunk');
      if (Object.keys(this.darts).length >= this.players.length) {
        this.room.setTimer(secs(1.5), () => this.startBets());
      }
      this.room.sync();
    } else if (this.phase === 'bets' && data.action === 'bet') {
      if (this.bets[name] !== undefined) return;
      if (data.on === null || data.on === 'none') { this.bets[name] = null; }
      else {
        if (!this.throwers.includes(data.on)) return;
        const amount = Math.min(Number(data.amount) || 0, this.gameScore(name));
        this.bets[name] = amount > 0 ? { on: data.on, amount } : null;
      }
      this.room.sfx('tick');
      if (Object.keys(this.bets).length >= this.players.length) {
        this.room.setTimer(secs(1.2), () => this.reveal());
      }
      this.room.sync();
    }
  }

  hostView() {
    const base = { game: 'darts', phase: this.phase, round: this.round + 1, roundTotal: ROUNDS };
    if (this.phase === 'intro') {
      return { ...base, type: 'game-intro', title: 'DARTS OF DESTINY',
        blurb: 'Throw a dart at the answer. Closest wins — unless you land in the hidden GUTTER. Bet your bank on whose dart you trust.' };
    }
    if (this.phase === 'throw') {
      return { ...base, type: 'dd-throw', q: this.q.q, unit: this.q.unit, min: this.q.min, max: this.q.max,
        thrown: this.players.map(p => ({ name: p.name, done: this.darts[p.name] !== undefined })) };
    }
    if (this.phase === 'bets') {
      return { ...base, type: 'dd-bets', q: this.q.q, unit: this.q.unit, min: this.q.min, max: this.q.max,
        darts: Object.entries(this.darts).map(([n, v]) => ({ name: n, value: v })).sort((x, y) => x.value - y.value),
        betsIn: this.players.map(p => ({ name: p.name, done: this.bets[p.name] !== undefined })) };
    }
    if (this.phase === 'reveal') {
      return { ...base, type: 'dd-reveal', q: this.q.q, unit: this.q.unit, min: this.q.min, max: this.q.max,
        answer: this.q.answer, gutter: this.gutter,
        darts: Object.entries(this.results).map(([n, r]) => ({ name: n, ...r })).sort((x, y) => x.value - y.value),
        winners: this.winners,
        bets: Object.entries(this.betResults).map(([n, b]) => ({ name: n, ...b })),
        banks: this.players.map(p => ({ name: p.name, bank: this.gameScore(p.name) })).sort((a, b) => b.bank - a.bank) };
    }
    if (this.phase === 'standings') {
      return { ...base, type: 'round-scores', title: 'FINAL BANKS',
        rows: this.players.map(p => ({ name: p.name, delta: null, total: this.gameScore(p.name) }))
          .sort((a, b) => b.total - a.total) };
    }
    return { ...base, type: 'wait' };
  }

  playerView(player) {
    const name = player.name;
    if (this.phase === 'throw') {
      if (this.darts[name] !== undefined) return { type: 'wait', message: `Dart thrown: ${this.darts[name]} ${this.q.unit}. THUNK.` };
      return { type: 'slider', prompt: this.q.q, action: 'throw',
        min: this.q.min, max: this.q.max, unit: this.q.unit,
        step: this.q.max - this.q.min > 1000 ? Math.ceil((this.q.max - this.q.min) / 1000) : 1 };
    }
    if (this.phase === 'bets') {
      if (this.bets[name] !== undefined) return { type: 'wait', message: 'Bet placed. No take-backs.' };
      const bank = this.gameScore(name);
      return { type: 'bet', prompt: `Whose dart do you trust? (Your bank: ${bank})`, action: 'bet',
        options: Object.entries(this.darts).map(([n, v]) => ({ id: n, label: `${n}: ${v} ${this.q.unit}` })),
        amounts: BET_AMOUNTS.filter(a => a <= bank), bank };
    }
    if (this.phase === 'reveal') {
      const r = this.results[name];
      const b = this.betResults[name];
      let msg = `Answer: ${this.q.answer} ${this.q.unit}. `;
      if (r) {
        if (r.gutter) msg += `Your dart hit the GUTTER! -${GUTTER_PENALTY}. `;
        else if (r.winner) msg += `🎯 CLOSEST! +${CLOSEST_PTS}. `;
        else msg += `You missed by ${Math.round(r.dist)}. `;
      }
      if (b) msg += b.won ? `Bet on ${b.on} paid +${b.delta}!` : `Bet on ${b.on} lost ${b.amount}.`;
      return { type: 'wait', message: msg };
    }
    return { type: 'wait', message: 'Chalk your hands...' };
  }
}

module.exports = DartsOfDestiny;
