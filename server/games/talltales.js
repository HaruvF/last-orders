'use strict';
const GameBase = require('../gamebase');
const { shuffle, normalize, secs } = require('../util');
const FACTS = require('../content/facts.json');

const ROUNDS = 4; // 3 escalating rounds + final double
const MULT = [1, 2, 2, 3]; // balanced so this game tops out near the other minigames (~1200)
const ROUND_LABEL = ['ROUND 1', 'ROUND 2', 'ROUND 3', 'LAST CALL — DOUBLE POINTS'];
const TRUTH_PTS = 150;
const FOOL_PTS = 75;

class TallTales extends GameBase {
  constructor(room) {
    super(room);
    this.id = 'talltales';
    this.name = 'Tall Tales';
    this.facts = shuffle(FACTS).slice(0, ROUNDS);
    this.round = 0;
    this.phase = 'intro';
  }

  start() {
    this.phase = 'intro';
    this.room.bartender('roundStart');
    this.room.setTimer(secs(6), () => this.startRound());
    this.room.sync();
  }

  startRound() {
    this.fact = this.facts[this.round];
    this.lies = {};       // name -> lie text
    this.votes = {};      // name -> option id
    this.phase = 'write';
    this.errors = {};     // name -> rejection message
    this.room.sfx('stinger');
    this.room.setTimer(secs(55), () => this.startVote());
    this.room.sync();
  }

  startVote() {
    this.phase = 'vote';
    // Build shuffled option list: all lies + truth
    const opts = Object.entries(this.lies).map(([name, text]) => ({ id: 'lie:' + name, text, author: name }));
    opts.push({ id: 'truth', text: this.fact.answer, author: null });
    this.options = shuffle(opts);
    this.room.sfx('stinger');
    this.room.setTimer(secs(30), () => this.startReveal());
    this.room.sync();
  }

  startReveal() {
    this.phase = 'reveal';
    // Order: lies by fewest votes first, truth last
    const count = (id) => Object.values(this.votes).filter(v => v === id).length;
    const lieOpts = this.options.filter(o => o.id !== 'truth');
    const revealed = lieOpts
      .filter(o => count(o.id) > 0 || true) // reveal all lies, even unpicked
      .sort((a, b) => count(a.id) - count(b.id));
    this.revealSteps = revealed.map(o => ({
      text: o.text, author: o.author, isTruth: false,
      pickedBy: Object.entries(this.votes).filter(([, v]) => v === o.id).map(([n]) => n),
    }));
    this.revealSteps.push({
      text: this.fact.answer, author: null, isTruth: true,
      pickedBy: Object.entries(this.votes).filter(([, v]) => v === 'truth').map(([n]) => n),
    });
    this.revealIndex = -1;
    this.deltas = {};
    const m = MULT[this.round];
    for (const step of this.revealSteps) {
      if (step.isTruth) {
        for (const n of step.pickedBy) this.deltas[n] = (this.deltas[n] || 0) + TRUTH_PTS * m;
      } else {
        for (const _ of step.pickedBy) this.deltas[step.author] = (this.deltas[step.author] || 0) + FOOL_PTS * m;
      }
    }
    this.nextRevealStep();
  }

  emojiOK() {
    return ['vote', 'reveal', 'scores'].includes(this.phase);
  }

  nextRevealStep() {
    this.revealIndex++;
    if (this.revealIndex >= this.revealSteps.length) return this.showRoundScores();
    const step = this.revealSteps[this.revealIndex];
    this.room.sfx(step.isTruth ? 'foam' : 'stamp');
    if (step.isTruth) this.room.fx('shake');
    // MC commentary on the juicy reveals
    if (!step.isTruth && step.pickedBy.length >= 2) this.room.roast('fooled', step.author);
    else if (step.isTruth && step.pickedBy.length === 0) this.room.roast('nobodyTruth', this.players[0] && this.players[0].name);
    this.room.setTimer(secs(step.isTruth ? 5 : 4), () => this.nextRevealStep());
    this.room.sync();
  }

  showRoundScores() {
    this.phase = 'scores';
    for (const [n, d] of Object.entries(this.deltas)) this.addPoints(n, d);
    // Pub Justice: fooling 2+ patrons with one lie earns a punishment token
    for (const step of this.revealSteps) {
      if (!step.isTruth && step.author && step.pickedBy.length >= 2) this.room.awardPunish(step.author);
    }
    this.room.bartender('playerDid');
    this.room.sfx('stinger');
    this.room.setTimer(secs(7), () => {
      this.round++;
      if (this.round >= ROUNDS) this.finish();
      else this.startRound();
    });
    this.room.sync();
  }

  onInput(player, data) {
    const name = player.name;
    if (this.phase === 'write' && data.action === 'lie') {
      if (this.lies[name]) return; // already accepted
      const text = String(data.text || '').trim().slice(0, 80);
      if (!text) return;
      const norm = normalize(text);
      if (norm === normalize(this.fact.answer)) {
        this.errors[name] = "That's suspiciously close to the TRUTH. Write a lie!";
      } else if (Object.values(this.lies).some(l => normalize(l) === norm)) {
        this.errors[name] = 'Another patron already wrote that. Be original!';
      } else {
        this.lies[name] = text;
        delete this.errors[name];
        this.room.sfx('tick');
        if (Object.keys(this.lies).length >= this.players.length) {
          this.room.setTimer(secs(1.5), () => this.startVote());
        }
      }
      this.room.sync();
    } else if (this.phase === 'vote' && data.action === 'vote') {
      if (this.votes[name]) return;
      const opt = this.options.find(o => o.id === data.id);
      if (!opt || opt.author === name) return; // can't pick your own lie
      this.votes[name] = data.id;
      this.room.sfx('tick');
      if (Object.keys(this.votes).length >= this.players.length) {
        this.room.setTimer(secs(1.5), () => this.startReveal());
      }
      this.room.sync();
    }
  }

  hostView() {
    const base = { game: 'talltales', round: ROUND_LABEL[this.round] || '', phase: this.phase };
    if (this.phase === 'intro') {
      return { ...base, type: 'game-intro', title: 'TALL TALES',
        blurb: 'Write a lie. Fool your mates. Find the truth. Points for both.' };
    }
    if (this.phase === 'write') {
      return { ...base, type: 'tt-write', prompt: this.fact.prompt,
        submitted: this.players.map(p => ({ name: p.name, done: !!this.lies[p.name] })) };
    }
    if (this.phase === 'vote') {
      return { ...base, type: 'tt-vote', prompt: this.fact.prompt,
        options: this.options.map(o => ({ id: o.id, text: o.text })),
        voted: this.players.map(p => ({ name: p.name, done: !!this.votes[p.name] })) };
    }
    if (this.phase === 'reveal') {
      const step = this.revealSteps[this.revealIndex];
      return { ...base, type: 'tt-reveal', prompt: this.fact.prompt, step,
        stepNum: this.revealIndex + 1, stepTotal: this.revealSteps.length };
    }
    if (this.phase === 'scores') {
      return { ...base, type: 'round-scores', title: 'ROUND SCORES',
        rows: this.players.map(p => ({ name: p.name, delta: this.deltas[p.name] || 0, total: this.gameScore(p.name) }))
          .sort((a, b) => b.total - a.total) };
    }
    return { ...base, type: 'wait' };
  }

  playerView(player) {
    const name = player.name;
    if (this.phase === 'write') {
      if (this.lies[name]) return { type: 'wait', message: 'Lie locked in. Look innocent.' };
      return { type: 'text', prompt: this.fact.prompt, placeholder: 'Type a convincing lie...',
        maxLen: 80, submitLabel: 'LOCK IT IN', action: 'lie', error: this.errors[name] || null };
    }
    if (this.phase === 'vote') {
      if (this.votes[name]) return { type: 'wait', message: 'Vote cast. Pray.' };
      return { type: 'choices', prompt: 'Which one is the TRUTH?', action: 'vote',
        options: this.options.map(o => ({ id: o.id, label: o.text, disabled: o.author === name })) };
    }
    if (this.phase === 'reveal') return { type: 'wait', message: 'The truth comes out...' };
    if (this.phase === 'scores') {
      const d = this.deltas[name] || 0;
      return { type: 'wait', message: d > 0 ? `+${d} points!` : 'Nothing this round. Brutal.' };
    }
    return { type: 'wait', message: 'Get ready...' };
  }
}

module.exports = TallTales;
