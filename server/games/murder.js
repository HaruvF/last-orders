'use strict';
const GameBase = require('../gamebase');
const { shuffle, pick, secs } = require('../util');
const TRIVIA = require('../content/trivia.json');

const QUESTIONS = 6;
const Q_TIME = 14;
const CORRECT_PTS = 150;
const GHOST_PTS = 50;
const SURVIVE_PTS = 75;
const ESCAPE_PTS = 600;
const CLOSEST_PTS = 300;
const PUNISH_STREAK = 2; // correct answers in a row to earn Pub Justice
const FINALE_TARGET = 7;
const FINALE_MAX_Q = 10;
const MEMORY_SYMBOLS = ['🍺', '🎯', '💀', '🥨', '🎲', '🕯️'];

class TriviaMurderPub extends GameBase {
  constructor(room) {
    super(room);
    this.id = 'murder';
    this.name = 'Trivia Murder Pub';
    this.questions = shuffle(TRIVIA).slice(0, QUESTIONS + FINALE_MAX_Q);
    this.qIndex = 0;
    this.phase = 'intro';
    this.alive = new Set(this.players.map(p => p.name));
    this.punishOrder = shuffle(['pint', 'math', 'darts', 'memory']);
    this.punishCount = 0;
    this.streak = {}; // name -> consecutive correct answers (Pub Justice)
  }

  isAlive(name) { return this.alive.has(name); }

  emojiOK() {
    return ['qresult', 'punish-result', 'finale-result', 'finale-end'].includes(this.phase);
  }

  start() {
    this.phase = 'intro';
    this.room.setTimer(secs(7), () => this.askQuestion());
    this.room.sync();
  }

  askQuestion() {
    if (this.qIndex >= QUESTIONS) return this.startFinale();
    // Shuffle the choice order each time so the correct answer isn't positionally predictable
    const raw = this.questions[this.qIndex];
    const order = shuffle(raw.choices.map((c, i) => ({ c, i })));
    this.q = { q: raw.q, cat: raw.cat, choices: order.map(o => o.c), answer: order.findIndex(o => o.i === raw.answer) };
    this.answers = {};
    this.phase = 'question';
    this.room.sfx('stinger');
    this.room.setTimer(secs(Q_TIME), () => this.questionResult());
    this.room.sync();
  }

  questionResult() {
    this.phase = 'qresult';
    this.losers = [];
    for (const p of this.players) {
      const a = this.answers[p.name];
      const correct = a === this.q.answer;
      if (this.isAlive(p.name)) {
        if (correct) this.addPoints(p.name, CORRECT_PTS);
        else this.losers.push(p.name);
      } else if (correct) {
        this.addPoints(p.name, GHOST_PTS);
      }
      // Pub Justice streak: 2 right in a row (alive or ghost) earns a punishment
      if (correct) {
        this.streak[p.name] = (this.streak[p.name] || 0) + 1;
        if (this.streak[p.name] >= PUNISH_STREAK) {
          this.streak[p.name] = 0;
          this.room.awardPunish(p.name);
        }
      } else {
        this.streak[p.name] = 0;
      }
    }
    this.room.sfx(this.losers.length ? 'wrong' : 'stamp');
    this.room.setTimer(secs(5), () => {
      this.qIndex++;
      if (this.losers.length > 0) this.startPunishment();
      else this.askQuestion();
    });
    this.room.sync();
  }

  // ---------- Punishments ----------
  startPunishment() {
    this.ptype = this.punishOrder[this.punishCount % this.punishOrder.length];
    this.punishCount++;
    this.picks = {};
    this.phase = 'punish-intro';
    this.room.sfx('doom');
    this.room.fx('shake');
    this.room.setTimer(secs(5), () => this.runPunishment());
    this.room.sync();
  }

  runPunishment() {
    this.phase = 'punish';
    if (this.ptype === 'pint') {
      const mugs = this.losers.length > 3 ? 7 : 5;
      const poison = this.losers.length > 3 ? 3 : 2;
      this.pdata = { mugs, poisoned: shuffle([...Array(mugs).keys()]).slice(0, poison) };
      this.room.setTimer(secs(15), () => this.resolvePunishment());
    } else if (this.ptype === 'math') {
      this.pdata = { problems: {} };
      for (const n of this.losers) this.pdata.problems[n] = this.makeMath();
      this.room.setTimer(secs(22), () => this.resolvePunishment());
    } else if (this.ptype === 'darts') {
      this.pdata = { wedges: 6, loaded: shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2) };
      this.room.setTimer(secs(15), () => this.resolvePunishment());
    } else if (this.ptype === 'memory') {
      this.pdata = { seq: Array.from({ length: 4 }, () => Math.floor(Math.random() * MEMORY_SYMBOLS.length)), stage: 'memorize' };
      this.room.setTimer(secs(5), () => {
        this.pdata.stage = 'recall';
        this.room.sfx('stinger');
        this.room.setTimer(secs(14), () => this.resolvePunishment());
        this.room.sync();
      });
    }
    this.room.sync();
  }

  makeMath() {
    const start = 2 + Math.floor(Math.random() * 8);
    let val = start;
    const steps = [];
    const ops = shuffle([
      () => { const n = 2 + Math.floor(Math.random() * 9); val += n; return `add ${n}`; },
      () => { val *= 2; return 'double it'; },
      () => { const n = 1 + Math.floor(Math.random() * Math.min(9, val - 1)); val -= n; return `subtract ${n}`; },
      () => { val *= 3; return 'triple it'; },
    ]).slice(0, 3);
    for (const op of ops) steps.push(op());
    return { text: `Start with ${start}, then ${steps.join(', then ')}. What do you get?`, answer: val };
  }

  resolvePunishment() {
    this.phase = 'punish-result';
    this.deaths = [];
    const L = this.losers;
    if (this.ptype === 'pint') {
      for (const n of L) {
        const m = this.picks[n];
        if (m === undefined || this.pdata.poisoned.includes(m)) this.deaths.push(n);
      }
    } else if (this.ptype === 'math') {
      for (const n of L) {
        if (parseInt(this.picks[n], 10) !== this.pdata.problems[n].answer) this.deaths.push(n);
      }
    } else if (this.ptype === 'darts') {
      const counts = {};
      for (const n of L) { const w = this.picks[n]; if (w !== undefined) counts[w] = (counts[w] || 0) + 1; }
      for (const n of L) {
        const w = this.picks[n];
        if (w === undefined || counts[w] > 1 || this.pdata.loaded.includes(w)) this.deaths.push(n);
      }
    } else if (this.ptype === 'memory') {
      const want = this.pdata.seq.join(',');
      for (const n of L) {
        if (!Array.isArray(this.picks[n]) || this.picks[n].join(',') !== want) this.deaths.push(n);
      }
    }
    for (const n of this.deaths) this.alive.delete(n);
    for (const n of L) if (!this.deaths.includes(n)) this.addPoints(n, SURVIVE_PTS);
    if (this.deaths.length) {
      this.room.sfx('death'); this.room.fx('shake');
    } else this.room.sfx('foam');
    this.room.setTimer(secs(6), () => this.askQuestion());
    this.room.sync();
  }

  // ---------- Finale ----------
  startFinale() {
    this.phase = 'finale-intro';
    this.steps = {};
    for (const p of this.players) this.steps[p.name] = this.isAlive(p.name) ? 2 : 0;
    this.finaleQ = 0;
    this.escaped = null;
    this.room.sfx('doom');
    this.room.setTimer(secs(7), () => this.finaleQuestion());
    this.room.sync();
  }

  finaleQuestion() {
    if (this.finaleQ >= FINALE_MAX_Q) return this.finaleTimeUp();
    const q = this.questions[QUESTIONS + this.finaleQ];
    // Trim to 3 fast choices, keeping the correct one
    const wrong = q.choices.map((c, i) => ({ c, i })).filter(x => x.i !== q.answer);
    const opts = shuffle([{ c: q.choices[q.answer], i: q.answer }, ...shuffle(wrong).slice(0, 2)]);
    this.fq = { text: q.q, opts, answer: q.answer };
    this.answers = {};
    this.phase = 'finale-q';
    this.room.sfx('stinger');
    this.room.setTimer(secs(9), () => this.finaleResult());
    this.room.sync();
  }

  finaleResult() {
    this.phase = 'finale-result';
    this.movers = [];
    for (const p of this.players) {
      if (this.answers[p.name] === this.fq.answer) {
        this.steps[p.name]++;
        this.movers.push(p.name);
      }
    }
    const winners = this.players.filter(p => this.steps[p.name] >= FINALE_TARGET);
    if (winners.length) {
      winners.sort((a, b) => this.steps[b.name] - this.steps[a.name]);
      this.escaped = winners[0].name;
      this.stoleBody = !this.isAlive(this.escaped);
      this.addPoints(this.escaped, ESCAPE_PTS);
      this.phase = 'finale-end';
      this.room.sfx('foam');
      this.room.fx('confetti');
      this.room.setTimer(secs(8), () => this.finish());
    } else {
      this.finaleQ++;
      this.room.sfx(this.movers.length ? 'stamp' : 'wrong');
      this.room.setTimer(secs(3.5), () => this.finaleQuestion());
    }
    this.room.sync();
  }

  finaleTimeUp() {
    // Nobody reached the door — closest gets a consolation prize
    const sorted = this.players.slice().sort((a, b) =>
      (this.steps[b.name] - this.steps[a.name]) || (this.isAlive(b.name) - this.isAlive(a.name)));
    this.escaped = sorted[0] ? sorted[0].name : null;
    this.stoleBody = false;
    this.timeUp = true;
    if (this.escaped) this.addPoints(this.escaped, CLOSEST_PTS);
    this.phase = 'finale-end';
    this.room.sfx('death');
    this.room.setTimer(secs(8), () => this.finish());
    this.room.sync();
  }

  // ---------- IO ----------
  onInput(player, data) {
    const name = player.name;
    if (this.phase === 'question' && data.action === 'answer') {
      if (this.answers[name] !== undefined) return;
      this.answers[name] = data.id;
      this.room.sfx('tick');
      if (Object.keys(this.answers).length >= this.players.length) {
        this.room.setTimer(secs(1.2), () => this.questionResult());
      }
      this.room.sync();
    } else if (this.phase === 'punish' && this.losers.includes(name) && this.isAlive(name)) {
      if (this.picks[name] !== undefined) return;
      if (this.ptype === 'pint' && data.action === 'pick') this.picks[name] = data.id;
      else if (this.ptype === 'math' && data.action === 'lie') this.picks[name] = String(data.text || '').trim();
      else if (this.ptype === 'darts' && data.action === 'pick') this.picks[name] = data.id;
      else if (this.ptype === 'memory' && data.action === 'memory' && this.pdata.stage === 'recall') this.picks[name] = data.seq;
      else return;
      this.room.sfx('tick');
      const need = this.losers.filter(n => this.isAlive(n));
      if (need.every(n => this.picks[n] !== undefined)) {
        this.room.setTimer(secs(1.2), () => this.resolvePunishment());
      }
      this.room.sync();
    } else if (this.phase === 'finale-q' && data.action === 'answer') {
      if (this.answers[name] !== undefined) return;
      this.answers[name] = data.id;
      if (Object.keys(this.answers).length >= this.players.length) {
        this.room.setTimer(secs(0.8), () => this.finaleResult());
      }
      this.room.sync();
    }
  }

  // ---------- Views ----------
  hostView() {
    const base = { game: 'murder', phase: this.phase,
      players: this.players.map(p => ({ name: p.name, alive: this.isAlive(p.name) })) };
    if (this.phase === 'intro') {
      return { ...base, type: 'game-intro', title: 'TRIVIA MURDER PUB',
        blurb: 'The landlord locked the cellar. Answer right or face PUNISHMENT. The dead become thirsty ghosts.' };
    }
    if (this.phase === 'question') {
      return { ...base, type: 'mp-question', qNum: this.qIndex + 1, qTotal: QUESTIONS,
        q: this.q.q, cat: this.q.cat, choices: this.q.choices,
        answered: this.players.map(p => ({ name: p.name, done: this.answers[p.name] !== undefined })) };
    }
    if (this.phase === 'qresult') {
      return { ...base, type: 'mp-result', q: this.q.q, cat: this.q.cat, choices: this.q.choices, correct: this.q.answer,
        results: this.players.map(p => ({ name: p.name, pick: this.answers[p.name],
          right: this.answers[p.name] === this.q.answer, alive: this.isAlive(p.name) })),
        losers: this.losers };
    }
    if (this.phase === 'punish-intro') {
      const titles = { pint: 'THE POISONED PINT', math: "LANDLORD'S ARITHMETIC", darts: 'LOADED DARTBOARD', memory: 'LAST ROUND RECALL' };
      const blurbs = {
        pint: 'Pick a mug. Some are poisoned. Cheers!',
        math: 'Solve it fast or drink the consequences.',
        darts: 'Pick a wedge. Share a wedge — or hit a loaded one — and you die.',
        memory: 'Memorize the order of drinks. Repeat it. Or else.',
      };
      return { ...base, type: 'mp-punish-intro', title: titles[this.ptype], blurb: blurbs[this.ptype], losers: this.losers };
    }
    if (this.phase === 'punish') {
      const v = { ...base, type: 'mp-punish', ptype: this.ptype, losers: this.losers,
        picked: this.losers.map(n => ({ name: n, done: this.picks[n] !== undefined })) };
      if (this.ptype === 'pint') v.mugs = this.pdata.mugs;
      if (this.ptype === 'darts') v.wedges = this.pdata.wedges;
      if (this.ptype === 'memory') { v.stage = this.pdata.stage; v.seq = this.pdata.stage === 'memorize' ? this.pdata.seq.map(i => MEMORY_SYMBOLS[i]) : null; v.symbols = MEMORY_SYMBOLS; }
      return v;
    }
    if (this.phase === 'punish-result') {
      const v = { ...base, type: 'mp-punish-result', ptype: this.ptype, deaths: this.deaths,
        survivors: this.losers.filter(n => !this.deaths.includes(n)) };
      if (this.ptype === 'pint') v.poisoned = this.pdata.poisoned;
      if (this.ptype === 'darts') v.loaded = this.pdata.loaded;
      if (this.ptype === 'memory') v.seq = this.pdata.seq.map(i => MEMORY_SYMBOLS[i]);
      return v;
    }
    if (this.phase === 'finale-intro') {
      return { ...base, type: 'mp-finale-intro',
        blurb: 'THE ESCAPE. Answer fast to run for the door. Ghosts: keep pace and STEAL A BODY.' };
    }
    if (this.phase === 'finale-q' || this.phase === 'finale-result') {
      return { ...base, type: 'mp-finale', q: this.fq ? this.fq.text : '',
        choices: this.fq ? this.fq.opts.map(o => o.c) : [],
        showResult: this.phase === 'finale-result',
        correct: this.phase === 'finale-result' ? this.fq.opts.findIndex(o => o.i === this.fq.answer) : null,
        target: FINALE_TARGET,
        track: this.players.map(p => ({ name: p.name, step: this.steps[p.name], alive: this.isAlive(p.name),
          moved: this.phase === 'finale-result' && this.movers.includes(p.name) })) };
    }
    if (this.phase === 'finale-end') {
      return { ...base, type: 'mp-end', winner: this.escaped, stoleBody: !!this.stoleBody, timeUp: !!this.timeUp,
        rows: this.players.map(p => ({ name: p.name, total: this.gameScore(p.name), alive: this.isAlive(p.name) }))
          .sort((a, b) => b.total - a.total) };
    }
    return { ...base, type: 'wait' };
  }

  playerView(player) {
    const name = player.name;
    const ghost = !this.isAlive(name);
    const tag = ghost ? '👻 GHOST — ' : '';
    if (this.phase === 'question') {
      if (this.answers[name] !== undefined) return { type: 'wait', message: 'Answer locked. Sweat quietly.' };
      return { type: 'choices', prompt: tag + this.q.q, action: 'answer',
        options: this.q.choices.map((c, i) => ({ id: i, label: c })) };
    }
    if (this.phase === 'qresult') {
      const right = this.answers[name] === this.q.answer;
      if (ghost) return { type: 'wait', message: right ? '+' + GHOST_PTS + ' ghost points.' : 'Even dead, you got that wrong.' };
      return { type: 'wait', message: right ? 'CORRECT. You live. +' + CORRECT_PTS : '☠️ WRONG. To the punishment round...' };
    }
    if (this.phase === 'punish' && this.losers.includes(name) && !ghost) {
      if (this.picks[name] !== undefined) return { type: 'wait', message: 'Choice made. Good luck.' };
      if (this.ptype === 'pint') {
        return { type: 'choices', prompt: 'Pick a pint. Some are poisoned.', action: 'pick',
          options: Array.from({ length: this.pdata.mugs }, (_, i) => ({ id: i, label: '🍺 Mug ' + (i + 1) })) };
      }
      if (this.ptype === 'math') {
        return { type: 'text', prompt: this.pdata.problems[name].text, placeholder: 'Number...',
          maxLen: 10, submitLabel: 'ANSWER', action: 'lie', numeric: true, error: null };
      }
      if (this.ptype === 'darts') {
        return { type: 'choices', prompt: 'Pick a wedge. Duplicates die. Some wedges are LOADED.', action: 'pick',
          options: Array.from({ length: 6 }, (_, i) => ({ id: i, label: '🎯 Wedge ' + (i + 1) })) };
      }
      if (this.ptype === 'memory') {
        if (this.pdata.stage === 'memorize') return { type: 'wait', message: '👀 WATCH THE BIG SCREEN. Memorize the order!' };
        return { type: 'memory', prompt: 'Tap the 4 drinks in order!', symbols: MEMORY_SYMBOLS, length: 4 };
      }
    }
    if (this.phase === 'punish' || this.phase === 'punish-intro') {
      return { type: 'wait', message: this.losers.includes(name) && !ghost ? 'Punishment incoming...' : 'Watch them squirm.' };
    }
    if (this.phase === 'punish-result') {
      if (this.deaths && this.deaths.includes(name)) return { type: 'wait', message: '💀 YOU DIED. You are now a ghost. Keep answering to steal a body in the finale!' };
      if (this.losers.includes(name)) return { type: 'wait', message: 'You survived. +' + SURVIVE_PTS };
      return { type: 'wait', message: 'The reaper passes...' };
    }
    if (this.phase === 'finale-q') {
      if (this.answers[name] !== undefined) return { type: 'wait', message: 'RUN!' };
      return { type: 'choices', prompt: (ghost ? '👻 CHASE! ' : '🚪 RUN! ') + this.fq.text, action: 'answer',
        options: this.fq.opts.map((o, i) => ({ id: this.fq.opts[i].i, label: o.c })) };
    }
    if (this.phase === 'finale-result') {
      return { type: 'wait', message: this.movers && this.movers.includes(name) ? '✔ You surge forward!' : '✘ You stumble!' };
    }
    if (this.phase === 'finale-end') {
      if (this.escaped === name) return { type: 'wait', message: this.stoleBody ? '👻 YOU STOLE A BODY AND ESCAPED! +' + ESCAPE_PTS : '🚪 YOU ESCAPED! +' + ESCAPE_PTS };
      return { type: 'wait', message: 'The door slams shut.' };
    }
    return { type: 'wait', message: ghost ? 'You are a ghost. Boo.' : 'The landlord is watching...' };
  }
}

module.exports = TriviaMurderPub;
