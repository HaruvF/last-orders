'use strict';
const GameBase = require('../gamebase');
const { shuffle, secs } = require('../util');
const QUIPS = require('../content/quips.json');

const VOTE_POOL = 300; // split across a match's voters, so scores don't scale with player count
const WIN_BONUS = 250;
const KO_BONUS = 150;
const NO_ANSWER = '*nervous silence*';

class BarBrawl extends GameBase {
  constructor(room) {
    super(room);
    this.id = 'brawl';
    this.name = 'Bar Brawl';
    this.phase = 'intro';
    const order = shuffle(this.players.map(p => p.name));
    const prompts = shuffle(QUIPS);
    // Ring pairing: every player appears in exactly 2 matches
    this.matches = order.map((n, i) => ({
      a: n, b: order[(i + 1) % order.length],
      prompt: prompts[i % prompts.length],
      answers: {}, votes: {},
    }));
    this.matchIndex = -1;
  }

  start() {
    this.phase = 'intro';
    this.room.bartender('roundStart');
    this.room.setTimer(secs(6), () => this.startWrite());
    this.room.sync();
  }

  startWrite() {
    this.phase = 'write';
    this.room.sfx('stinger');
    this.room.setTimer(secs(80), () => this.startNextMatch());
    this.room.sync();
  }

  myPrompts(name) {
    return this.matches.filter(m => m.a === name || m.b === name);
  }

  allWritten() {
    return this.matches.every(m => m.answers[m.a] !== undefined && m.answers[m.b] !== undefined);
  }

  startNextMatch() {
    this.matchIndex++;
    if (this.matchIndex >= this.matches.length) return this.showStandings();
    const m = this.matches[this.matchIndex];
    if (m.answers[m.a] === undefined) m.answers[m.a] = NO_ANSWER;
    if (m.answers[m.b] === undefined) m.answers[m.b] = NO_ANSWER;
    this.phase = 'vote';
    this.room.sfx('bell');
    this.room.setTimer(secs(22), () => this.revealMatch());
    this.room.sync();
  }

  voters(m) {
    return this.players.filter(p => p.name !== m.a && p.name !== m.b).map(p => p.name);
  }

  emojiOK() {
    return ['vote', 'spill', 'standings'].includes(this.phase);
  }

  revealMatch() {
    const m = this.matches[this.matchIndex];
    this.phase = 'spill';
    const va = Object.values(m.votes).filter(v => v === 'a').length;
    const vb = Object.values(m.votes).filter(v => v === 'b').length;
    const perVote = Math.round(VOTE_POOL / Math.max(1, this.voters(m).length));
    this.addPoints(m.a, va * perVote);
    this.addPoints(m.b, vb * perVote);
    m.result = { va, vb, winner: null, ko: false };
    if (va !== vb) {
      m.result.winner = va > vb ? m.a : m.b;
      this.addPoints(m.result.winner, WIN_BONUS);
      const total = va + vb;
      if (total >= 2 && (va === 0 || vb === 0)) {
        m.result.ko = true;
        this.addPoints(m.result.winner, KO_BONUS);
        this.room.awardPunish(m.result.winner); // a Knockout earns Pub Justice
      }
    }
    this.room.sfx(m.result.ko ? 'death' : 'splash');
    this.room.fx(m.result.ko ? 'shake' : 'confetti');
    this.room.bartender('playerDid');
    // MC commentary: cowards first, then knockouts, then plain wins
    const silent = [m.a, m.b].find(n => m.answers[n] === NO_ANSWER);
    if (silent) this.room.roast('silence', silent);
    else if (m.result.ko) this.room.roast('knockout', m.result.winner);
    else if (m.result.winner) this.room.roast('brawlWin', m.result.winner);
    this.room.setTimer(secs(7), () => this.startNextMatch());
    this.room.sync();
  }

  showStandings() {
    this.phase = 'standings';
    this.room.sfx('stinger');
    this.room.setTimer(secs(8), () => this.finish());
    this.room.sync();
  }

  onInput(player, data) {
    const name = player.name;
    if (this.phase === 'write' && data.action === 'lie') {
      const text = String(data.text || '').trim().slice(0, 90);
      if (!text) return;
      const mine = this.myPrompts(name);
      const target = mine.find(m => m.answers[name] === undefined);
      if (!target) return;
      target.answers[name] = text;
      this.room.sfx('tick');
      if (this.allWritten()) this.room.setTimer(secs(1.5), () => this.startNextMatch());
      this.room.sync();
    } else if (this.phase === 'vote' && data.action === 'vote') {
      const m = this.matches[this.matchIndex];
      if (!this.voters(m).includes(name) || m.votes[name]) return;
      if (data.id !== 'a' && data.id !== 'b') return;
      m.votes[name] = data.id;
      this.room.sfx('tick');
      if (Object.keys(m.votes).length >= this.voters(m).length) {
        this.room.setTimer(secs(1.2), () => this.revealMatch());
      }
      this.room.sync();
    }
  }

  hostView() {
    const base = { game: 'brawl', phase: this.phase };
    if (this.phase === 'intro') {
      return { ...base, type: 'game-intro', title: 'BAR BRAWL',
        blurb: 'Two patrons. One prompt. Everyone else votes. Loser wears a drink.' };
    }
    if (this.phase === 'write') {
      return { ...base, type: 'bb-write',
        submitted: this.players.map(p => ({
          name: p.name,
          done: this.myPrompts(p.name).every(m => m.answers[p.name] !== undefined),
        })) };
    }
    if (this.phase === 'vote' || this.phase === 'spill') {
      const m = this.matches[this.matchIndex];
      const v = { ...base, type: 'bb-match', matchNum: this.matchIndex + 1, matchTotal: this.matches.length,
        prompt: m.prompt, a: { name: m.a, text: m.answers[m.a] }, b: { name: m.b, text: m.answers[m.b] },
        voted: this.voters(m).map(n => ({ name: n, done: !!m.votes[n] })),
        result: this.phase === 'spill' ? m.result : null };
      return v;
    }
    if (this.phase === 'standings') {
      return { ...base, type: 'round-scores', title: 'BRAWL RESULTS',
        rows: this.players.map(p => ({ name: p.name, delta: null, total: this.gameScore(p.name) }))
          .sort((a, b) => b.total - a.total) };
    }
    return { ...base, type: 'wait' };
  }

  playerView(player) {
    const name = player.name;
    if (this.phase === 'write') {
      const mine = this.myPrompts(name);
      const target = mine.find(m => m.answers[name] === undefined);
      if (!target) return { type: 'wait', message: 'Both answers in. Stretch those knuckles.' };
      const done = mine.length - mine.filter(m => m.answers[name] === undefined).length;
      return { type: 'text', prompt: `(${done + 1} of ${mine.length}) ${target.prompt}`,
        placeholder: 'Your best shot...', maxLen: 90, submitLabel: 'SWING!', action: 'lie', error: null };
    }
    if (this.phase === 'vote') {
      const m = this.matches[this.matchIndex];
      if (m.a === name || m.b === name) return { type: 'wait', message: "You're IN this brawl. Look tough." };
      if (m.votes[name]) return { type: 'wait', message: 'Vote in. Fight! Fight! Fight!' };
      return { type: 'choices', prompt: m.prompt, action: 'vote',
        options: [{ id: 'a', label: m.answers[m.a] }, { id: 'b', label: m.answers[m.b] }] };
    }
    if (this.phase === 'spill') {
      const m = this.matches[this.matchIndex];
      if (m.result.winner === name) return { type: 'wait', message: m.result.ko ? '💥 KNOCKOUT! +' + (WIN_BONUS + KO_BONUS) : '🍺 You win the round!' };
      if ((m.a === name || m.b === name) && m.result.winner) return { type: 'wait', message: 'A pint to the face. Refreshing.' };
      return { type: 'wait', message: 'The crowd roars...' };
    }
    return { type: 'wait', message: 'Roll up those sleeves...' };
  }
}

module.exports = BarBrawl;
