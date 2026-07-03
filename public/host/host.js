/* global io, Avatars, PubAudio */
'use strict';

const socket = io();
const stage = document.getElementById('stage');
const bubble = document.getElementById('bubble');
const playersbar = document.getElementById('playersbar');
const roomcodeEl = document.getElementById('roomcode');
const timerEl = document.getElementById('timer');

let lastSfxSeq = 0, lastFxSeq = 0, lastToastSeq = null, timerEndsAt = null, lastUrgentTick = 0;
let currentViewKey = '';
let currentAmbient = '';

// ---------- animated ambient backgrounds (one theme per game) ----------
const AMBIENT_THEMES = {
  pub:       { bits: ['🍺', '🫧', '🫧', '🍂'], op: 0.13, sway: true },
  talltales: { bits: ['📜', '🪶', '✒️', '❓'], op: 0.14, sway: true },
  murder:    { bits: ['💀', '🕯️', '🩸', '🕸️'], op: 0.16, sway: false },
  brawl:     { bits: ['🍺', '🥊', '💥', '🪑'], op: 0.15, sway: true },
  darts:     { bits: ['🎯', '🏹', '❌', '🎯'], op: 0.14, sway: true },
};
function setAmbient(theme) {
  if (theme === currentAmbient) return;
  currentAmbient = theme;
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
  document.body.classList.add('theme-' + theme);
  const t = AMBIENT_THEMES[theme] || AMBIENT_THEMES.pub;
  const box = document.getElementById('ambient');
  box.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.className = 'amb' + (t.sway && i % 2 ? ' sway' : '');
    s.textContent = t.bits[i % t.bits.length];
    const dur = 14 + Math.random() * 18;
    s.style.left = Math.random() * 100 + 'vw';
    s.style.fontSize = (18 + Math.random() * 42) + 'px';
    s.style.animationDuration = dur + 's';
    s.style.animationDelay = (-Math.random() * dur) + 's'; // pre-scatter across the screen
    s.style.setProperty('--amb-op', t.op * (0.6 + Math.random() * 0.8));
    s.style.setProperty('--amb-rot', (Math.random() * 500 - 250) + 'deg');
    box.appendChild(s);
  }
}
function showToast(text) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toastmsg';
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

document.getElementById('openpub').addEventListener('click', () => {
  PubAudio.unlock();
  PubAudio.play('bell');
  document.getElementById('tapstart').remove();
  speak('Welcome to Last Orders! I will be your host, your judge, and your biggest disappointment.');
});

// ---------- MC voice (Web Speech API — no assets, no internet) ----------
let voiceOn = localStorage.getItem('lo-voice') !== 'off';
let mcVoice = null;
function pickMcVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  mcVoice =
    vs.find(v => /Google UK English Male/i.test(v.name)) ||
    vs.find(v => /Daniel|George|Arthur|Ryan/i.test(v.name) && v.lang.startsWith('en')) ||
    vs.find(v => v.lang === 'en-GB') ||
    vs.find(v => v.lang && v.lang.startsWith('en')) || null;
}
if ('speechSynthesis' in window) {
  pickMcVoice();
  speechSynthesis.onvoiceschanged = pickMcVoice;
}
function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  try {
    // Don't let commentary back up — drop the backlog, keep the freshest line
    if (speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (mcVoice) u.voice = mcVoice;
    u.pitch = 0.75; // gravelly landlord
    u.rate = 1.05;
    u.volume = 1;
    u.onstart = () => barkeepEl.classList.add('talking');
    u.onend = () => barkeepEl.classList.remove('talking');
    u.onerror = () => barkeepEl.classList.remove('talking');
    speechSynthesis.speak(u);
    // Safety net: never leave the mouth flapping if onend is missed
    clearTimeout(speak._guard);
    speak._guard = setTimeout(() => barkeepEl.classList.remove('talking'), Math.min(20000, 60 * text.length + 3000));
  } catch (e) { /* voice is a garnish, never break the game for it */ }
}
const voiceBtn = document.getElementById('voicebtn');
function renderVoiceBtn() { voiceBtn.textContent = voiceOn ? '🗣️' : '🔇'; }
renderVoiceBtn();
voiceBtn.addEventListener('click', () => {
  voiceOn = !voiceOn;
  localStorage.setItem('lo-voice', voiceOn ? 'on' : 'off');
  if (!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel();
  renderVoiceBtn();
});

socket.on('say', (d) => {
  bubble.textContent = d.text; // the bartender's bubble mouths along
  bubble.classList.remove('pop'); void bubble.offsetWidth;
  bubble.classList.add('pop');
  window.__lastSay = d.text;   // handy for debugging
  speak(d.text);
});

// ---------- floating emoji reactions ----------
socket.on('emoji', (d) => {
  const el = document.createElement('div');
  el.className = 'emojifloat';
  el.innerHTML = `<span class="e">${d.e}</span><span class="who">${escStr(d.name)}</span>`;
  el.style.left = (8 + Math.random() * 84) + 'vw';
  document.body.appendChild(el);
  const drift = (Math.random() * 120 - 60);
  el.animate([
    { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
    { transform: `translate(${drift * 0.3}px, -20vh) scale(1.15)`, opacity: 1, offset: 0.15 },
    { transform: `translate(${drift}px, -70vh) scale(1)`, opacity: 0.9, offset: 0.8 },
    { transform: `translate(${drift * 1.2}px, -85vh) scale(0.9)`, opacity: 0 },
  ], { duration: 2800 + Math.random() * 1200, easing: 'ease-out' }).onfinish = () => el.remove();
});
function escStr(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// Bartender character (original, comic style, animatable parts)
document.getElementById('barkeep').innerHTML = `
<svg width="110" height="110" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="60" cy="112" rx="44" ry="8" fill="#0d0805"/>
  <g class="bk-body">
    <rect x="30" y="62" width="60" height="44" rx="8" fill="#5a3d2b" stroke="#1a120c" stroke-width="5"/>
    <rect x="44" y="66" width="32" height="40" fill="#e9d9ae" stroke="#1a120c" stroke-width="4"/>
    <g class="bk-head">
      <circle cx="60" cy="40" r="24" fill="#e8bfa0" stroke="#1a120c" stroke-width="5"/>
      <path d="M38 34 Q60 16 82 34 L82 28 Q60 10 38 28 Z" fill="#3d3d3d" stroke="#1a120c" stroke-width="4"/>
      <circle cx="51" cy="40" r="3.5" fill="#1a120c"/><circle cx="69" cy="40" r="3.5" fill="#1a120c"/>
      <path class="bk-brow" d="M46 36 L56 33" stroke="#1a120c" stroke-width="4" stroke-linecap="round"/>
      <path class="bk-brow" d="M74 36 L64 33" stroke="#1a120c" stroke-width="4" stroke-linecap="round"/>
      <ellipse class="bk-mouth" cx="60" cy="54" rx="10" ry="3" fill="#1a120c"/>
      <path d="M40 58 Q60 70 80 58 L78 66 Q60 76 42 66 Z" fill="#8a6f4d" stroke="#1a120c" stroke-width="4"/>
    </g>
    <g class="bk-mug">
      <rect x="88" y="70" width="14" height="20" rx="3" fill="#f5a623" stroke="#1a120c" stroke-width="4"/>
      <rect x="88" y="66" width="14" height="6" fill="#fffbe8" stroke="#1a120c" stroke-width="3"/>
    </g>
  </g>
</svg>`;
const barkeepEl = document.getElementById('barkeep');

socket.on('connect', () => {
  const reclaim = sessionStorage.getItem('lo-hostcode') || null;
  socket.emit('host:create', { reclaim }, (res) => {
    sessionStorage.setItem('lo-hostcode', res.code);
  });
});

socket.on('state', render);

// ---------- timer loop ----------
setInterval(() => {
  if (!timerEndsAt) { timerEl.style.visibility = 'hidden'; return; }
  const left = Math.max(0, (timerEndsAt - Date.now()) / 1000);
  timerEl.style.visibility = 'visible';
  timerEl.textContent = Math.ceil(left);
  const urgent = left > 0 && left <= 5;
  timerEl.classList.toggle('urgent', urgent);
  if (urgent && Math.ceil(left) !== lastUrgentTick) {
    lastUrgentTick = Math.ceil(left);
    PubAudio.play('urgent');
  }
}, 200);

// ---------- helpers ----------
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function headRow(list, doneKey = 'done') {
  return `<div class="headrow">` + list.map(x =>
    `<div class="hp ${x[doneKey] ? 'done' : 'notdone'}">${Avatars.render(x.avatar || avatarOf(x.name), 52)}<span class="tag">${esc(x.name)}${x[doneKey] ? ' ✔' : ''}</span></div>`
  ).join('') + '</div>';
}
let playerAvatars = {};
function avatarOf(name) { return playerAvatars[name] || 'ghost'; }

function foamBurst() {
  for (let i = 0; i < 40; i++) {
    const b = document.createElement('div');
    b.className = 'foam-bit';
    const s = 8 + Math.random() * 22;
    b.style.width = b.style.height = s + 'px';
    b.style.left = Math.random() * 100 + 'vw';
    b.style.top = '-30px';
    document.body.appendChild(b);
    const fall = 2500 + Math.random() * 2000;
    b.animate([
      { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { transform: `translateY(105vh) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0.7 },
    ], { duration: fall, easing: 'ease-in' }).onfinish = () => b.remove();
  }
}

// ---------- main render ----------
function render(st) {
  playerAvatars = {};
  for (const p of st.players) playerAvatars[p.name] = p.avatar;

  roomcodeEl.innerHTML = `<small>JOIN AT ${location.hostname}:${location.port || 80}/play — CODE</small>${st.code}`;
  bubble.textContent = st.bartender || '';
  timerEndsAt = st.timerEndsAt;

  // players bar
  const inMurder = st.game && st.game.game === 'murder';
  playersbar.innerHTML = st.players.map(p => {
    const dead = inMurder && st.game.players && st.game.players.some(gp => gp.name === p.name && !gp.alive);
    return `<div class="pchip ${p.connected ? '' : 'gone'} ${dead ? 'deadp' : ''}">
      ${dead ? '<span class="skull">💀</span>' : ''}${Avatars.render(p.avatar, 54)}
      <span class="pname">${p.vip ? '👑' : ''}${esc(p.name)}</span>
      <span class="pscore">${p.score}</span></div>`;
  }).join('');

  // ambient background follows the current game
  setAmbient(st.scene === 'game' && st.game ? (st.game.game || 'pub') : 'pub');

  // toast banners (Pub Justice announcements). First paint adopts the seq
  // silently so a stale toast isn't replayed after a host reload.
  if (st.toast) {
    if (lastToastSeq === null) lastToastSeq = st.toast.seq;
    else if (st.toast.seq !== lastToastSeq) {
      lastToastSeq = st.toast.seq;
      if (st.toast.text) showToast(st.toast.text);
    }
  }

  // sfx / fx
  if (st.sfx && st.sfx.seq !== lastSfxSeq) { lastSfxSeq = st.sfx.seq; PubAudio.play(st.sfx.name); }
  if (st.fx && st.fx.seq !== lastFxSeq) {
    lastFxSeq = st.fx.seq;
    if (st.fx.name === 'shake') {
      document.body.classList.remove('shaking'); void document.body.offsetWidth;
      document.body.classList.add('shaking');
    } else if (st.fx.name === 'confetti') foamBurst();
  }

  // stage
  const key = st.scene + ':' + (st.game ? JSON.stringify(st.game) : JSON.stringify(st.players) + st.queueIndex + JSON.stringify(st.selected || ''));
  if (key === currentViewKey) return; // avoid pointless re-render flicker
  currentViewKey = key;

  if (st.scene === 'lobby') return renderLobby(st);
  if (st.scene === 'menu') return renderMenu(st);
  if (st.scene === 'bartab') return renderBarTab(st, false);
  if (st.scene === 'final') return renderBarTab(st, true);
  if (st.scene === 'game' && st.game) {
    const fn = GAME_VIEWS[st.game.type];
    if (fn) return fn(st.game, st);
  }
  stage.innerHTML = `<div class="poster wanted"><h2>…</h2></div>`;
}

function renderLobby(st) {
  stage.innerHTML = `
    <div class="poster wanted tilt-l" style="max-width:640px">
      <h1 class="hugetitle" style="font-size:3rem;color:var(--blood)">WANTED: PATRONS</h1>
      <p style="font-size:1.5rem">Grab your phone → <b>${location.hostname}:${location.port || 80}/play</b><br>
      Room code: <span class="display" style="font-size:2.6rem;letter-spacing:8px">${st.code}</span></p>
      <p class="marker">${st.players.length} / 8 stumbled in ${st.players.length < st.minPlayers ? `(need ${st.minPlayers}+, best with 4–8)` : '— leader hits START on their phone'}</p>
    </div>
    <div class="headrow">${st.players.map(p =>
      `<div class="hp done pop">${Avatars.render(p.avatar, 84)}<span class="tag" style="font-size:1.1rem">${p.vip ? '👑 ' : ''}${esc(p.name)}</span></div>`).join('')}
    </div>`;
}

function renderMenu(st) {
  stage.innerHTML = `
    <div class="chalkboard" style="max-width:760px;width:90%">
      <h2 style="margin-top:0">TONIGHT'S ENTERTAINMENT</h2>
      ${st.gamesMeta.map(g => `
        <div style="font-size:1.6rem;padding:6px 0;${st.selected.includes(g.id) ? '' : 'opacity:0.35;text-decoration:line-through'}">
          ${st.selected.includes(g.id) ? '🍺' : '·'} ${esc(g.name)} <span style="font-size:1rem;opacity:0.8">— ${esc(g.desc)}</span>
        </div>`).join('')}
      <p style="font-size:1.1rem;opacity:0.8">The party leader picks games on their phone… or orders the FULL PUB CRAWL.</p>
    </div>`;
}

function renderBarTab(st, isFinal) {
  const sorted = st.players.slice().sort((a, b) => b.score - a.score);
  const last = st.lastResults;
  stage.innerHTML = `
    <div class="chalkboard" style="min-width:60%">
      <h2 style="margin-top:0;text-align:center">${isFinal ? '🏆 FINAL RECKONING 🏆' : '🧾 THE BAR TAB'}</h2>
      ${last && !isFinal ? `<p style="text-align:center;opacity:0.85">after ${esc(last.game)}</p>` : ''}
      <div class="scorelist">${sorted.map((p, i) => `
        <div class="row ${i === 0 ? 'pop' : ''}">
          <span>${i === 0 && isFinal ? '👑 ' : ''}${i + 1}. ${Avatars.render(p.avatar, 36)} ${esc(p.name)}</span>
          <span class="delta">${p.score}</span>
        </div>`).join('')}
      </div>
      ${isFinal
        ? `<p class="marker" style="text-align:center;font-size:1.6rem">ALL HAIL ${esc(sorted[0] ? sorted[0].name : '???')} — CHAMPION OF LAST ORDERS!</p>`
        : `<p style="text-align:center">Next up: <b>${esc(st.queue[st.queueIndex] || '')}</b> — leader taps NEXT</p>`}
    </div>`;
}

// ---------- per-game views ----------
const GAME_VIEWS = {
  'game-intro': (g) => {
    stage.innerHTML = `
      <div class="poster wanted tilt-r pop" style="max-width:720px">
        <h1 class="hugetitle" style="color:var(--blood)">${esc(g.title)}</h1>
        <p class="subblurb marker" style="font-size:1.5rem">${esc(g.blurb)}</p>
      </div>`;
  },

  'tt-write': (g) => {
    stage.innerHTML = `
      <div class="poster tilt-l" style="max-width:75%"><h3 class="marker" style="margin:0;color:var(--blood)">${esc(g.round)}</h3>
        <div class="bigprompt display" style="color:var(--ink)">${esc(g.prompt)}</div></div>
      <p class="marker" style="font-size:1.3rem">Everyone: type a LIE on your phone!</p>
      ${headRow(g.submitted)}`;
  },

  'tt-vote': (g) => {
    stage.innerHTML = `
      <div class="poster tilt-r" style="max-width:75%"><div class="bigprompt display" style="font-size:1.6rem;color:var(--ink)">${esc(g.prompt)}</div></div>
      <div class="answer-grid">${g.options.map((o, i) =>
        `<div class="answer-card poster pop" style="animation-delay:${i * 0.1}s"><span class="letter">${String.fromCharCode(65 + i)}</span>${esc(o.text)}</div>`).join('')}
      </div>
      ${headRow(g.voted)}`;
  },

  'tt-reveal': (g) => {
    const s = g.step;
    stage.innerHTML = `
      <div class="poster revealcard ${s.isTruth ? '' : 'tilt-l'} pop">
        <div class="display" style="color:var(--ink)">“${esc(s.text)}”</div>
        <div class="slam stamp ${s.isTruth ? 'truth' : 'lie'}" style="font-size:2rem">${s.isTruth ? 'THE TRUTH' : 'A DIRTY LIE'}</div>
        ${s.isTruth ? '' : `<div class="who marker" style="color:var(--ink)">— penned by ${esc(s.author)}</div>`}
        <div class="who" style="color:var(--ink)">${s.pickedBy.length
          ? (s.isTruth ? 'Sniffed it out: ' : 'Fooled: ') + s.pickedBy.map(esc).join(', ')
          : (s.isTruth ? 'NOBODY found the truth!' : 'Nobody fell for it.')}</div>
      </div>
      <p class="marker">${g.stepNum} / ${g.stepTotal}</p>`;
  },

  'round-scores': (g) => {
    stage.innerHTML = `
      <div class="chalkboard" style="min-width:55%">
        <h2 style="margin-top:0;text-align:center">${esc(g.title)}</h2>
        <div class="scorelist">${g.rows.map(r => `
          <div class="row"><span>${Avatars.render(avatarOf(r.name), 34)} ${esc(r.name)}</span>
          <span class="delta">${r.delta != null ? (r.delta > 0 ? '+' + r.delta : r.delta) + ' → ' : ''}${r.total}</span></div>`).join('')}
        </div>
      </div>`;
  },

  'mp-question': (g) => {
    stage.innerHTML = `
      <p class="marker" style="font-size:1.3rem;margin:0">Question ${g.qNum} of ${g.qTotal} — answer or DIE</p>
      <div class="poster tilt-l" style="max-width:80%"><div class="bigprompt display" style="color:var(--ink)">${esc(g.q)}</div></div>
      <div class="answer-grid">${g.choices.map((c, i) =>
        `<div class="answer-card poster"><span class="letter">${String.fromCharCode(65 + i)}</span>${esc(c)}</div>`).join('')}
      </div>
      ${headRow(g.answered)}`;
  },

  'mp-result': (g) => {
    stage.innerHTML = `
      <div class="poster tilt-r" style="max-width:80%"><div class="bigprompt display" style="font-size:1.6rem;color:var(--ink)">${esc(g.q)}</div></div>
      <div class="answer-grid">${g.choices.map((c, i) =>
        `<div class="answer-card poster ${i === g.correct ? 'correct pop' : 'wrongpick'}"><span class="letter">${String.fromCharCode(65 + i)}</span>${esc(c)}</div>`).join('')}
      </div>
      ${g.losers.length
        ? `<div class="slam stamp dead" style="font-size:1.8rem;background:var(--paper)">TO PUNISHMENT: ${g.losers.map(esc).join(', ')}</div>`
        : `<div class="slam stamp truth" style="font-size:1.8rem;background:var(--paper)">EVERYONE LIVES… FOR NOW</div>`}`;
  },

  'mp-punish-intro': (g) => {
    stage.innerHTML = `
      <div class="poster wanted tilt-l pop" style="max-width:680px;background:#d8c090">
        <h1 class="hugetitle" style="color:var(--blood);font-size:3rem">☠ ${esc(g.title)} ☠</h1>
        <p class="subblurb marker" style="color:var(--ink);font-size:1.4rem">${esc(g.blurb)}</p>
        <p style="color:var(--ink)">On trial: <b>${g.losers.map(esc).join(', ')}</b></p>
      </div>`;
  },

  'mp-punish': (g) => {
    let center = '';
    if (g.ptype === 'pint') {
      center = `<div class="mugrow">${Array.from({ length: g.mugs }, (_, i) => `<div class="mug">🍺<div class="picks">${i + 1}</div></div>`).join('')}</div>`;
    } else if (g.ptype === 'darts') {
      center = `<div class="mugrow">${Array.from({ length: g.wedges }, (_, i) => `<div class="mug">🎯<div class="picks">${i + 1}</div></div>`).join('')}</div>`;
    } else if (g.ptype === 'memory') {
      center = g.stage === 'memorize'
        ? `<div class="poster"><div class="memseq">${g.seq.join('')}</div></div><p class="marker" style="font-size:1.5rem">MEMORIZE THE ORDER!</p>`
        : `<div class="poster"><div class="memseq">❓❓❓❓</div></div><p class="marker" style="font-size:1.5rem">Repeat it on your phones!</p>`;
    } else {
      center = `<div class="poster"><h2 style="color:var(--ink);margin:0">🧮 Heads down, doing landlord math…</h2></div>`;
    }
    stage.innerHTML = center + headRow(g.picked);
  },

  'mp-punish-result': (g) => {
    let extra = '';
    if (g.ptype === 'pint') extra = `<div class="mugrow">${Array.from({ length: Math.max(...g.poisoned) + 1 > 5 ? 7 : 5 }, (_, i) => `<div class="mug ${g.poisoned.includes(i) ? 'poison' : ''}">🍺<div class="picks">${i + 1}</div></div>`).join('')}</div>`;
    if (g.ptype === 'darts') extra = `<div class="mugrow">${Array.from({ length: 6 }, (_, i) => `<div class="mug ${g.loaded.includes(i) ? 'poison' : ''}">🎯<div class="picks">${i + 1}</div></div>`).join('')}</div>`;
    if (g.ptype === 'memory') extra = `<div class="poster"><div class="memseq">${g.seq.join('')}</div></div>`;
    stage.innerHTML = `${extra}
      ${g.deaths.length
        ? `<div class="slam stamp dead" style="font-size:2.4rem;background:var(--paper)">💀 DEAD: ${g.deaths.map(esc).join(', ')}</div>`
        : `<div class="slam stamp truth" style="font-size:2.4rem;background:var(--paper)">ALL SURVIVED!</div>`}
      ${g.survivors.length && g.deaths.length ? `<p class="marker" style="font-size:1.4rem">Survived: ${g.survivors.map(esc).join(', ')}</p>` : ''}`;
  },

  'mp-finale-intro': (g) => {
    stage.innerHTML = `
      <div class="poster wanted pop" style="max-width:700px">
        <h1 class="hugetitle" style="color:var(--blood);font-size:3.4rem">THE ESCAPE</h1>
        <p class="subblurb marker" style="color:var(--ink);font-size:1.5rem">${esc(g.blurb)}</p>
      </div>`;
  },

  'mp-finale': (g) => {
    stage.innerHTML = `
      <div class="poster tilt-l" style="max-width:78%"><div class="bigprompt display" style="font-size:1.7rem;color:var(--ink)">${esc(g.q)}</div>
      ${g.showResult ? `<div class="stamp truth slam">${esc(g.choices[g.correct] || '')}</div>` : ''}</div>
      <div class="track">${g.track.map(t => `
        <div class="lane ${t.alive ? '' : 'ghostlane'}">
          <span style="width:130px;text-align:right" class="marker">${t.alive ? '' : '👻'}${esc(t.name)}${t.moved ? ' 💨' : ''}</span>
          <div class="steps">${Array.from({ length: g.target }, (_, i) => `<div class="cell ${i < t.step ? 'fill' : ''}"></div>`).join('')}</div>
          <span class="door">🚪</span>
        </div>`).join('')}
      </div>`;
  },

  'mp-end': (g) => {
    stage.innerHTML = `
      <div class="poster wanted pop" style="max-width:700px">
        ${g.winner
          ? `<h1 class="hugetitle" style="color:var(--blood);font-size:2.8rem">${g.timeUp ? 'NOBODY ESCAPED…' : (g.stoleBody ? '👻 ' + esc(g.winner) + ' STOLE A BODY!' : '🚪 ' + esc(g.winner) + ' ESCAPED!')}</h1>`
          : '<h1 class="hugetitle" style="color:var(--blood)">THE PUB KEEPS THEM ALL…</h1>'}
        ${g.timeUp && g.winner ? `<p class="marker" style="color:var(--ink);font-size:1.4rem">${esc(g.winner)} was closest to the door.</p>` : ''}
        <div class="scorelist" style="color:var(--ink);width:100%">${g.rows.map(r =>
          `<div class="row"><span>${r.alive ? '' : '💀 '}${esc(r.name)}</span><span>${r.total}</span></div>`).join('')}</div>
      </div>`;
  },

  'bb-write': (g) => {
    stage.innerHTML = `
      <div class="poster wanted tilt-r" style="max-width:640px">
        <h2 style="color:var(--blood);margin:0">✍ WRITING INSULTS…</h2>
        <p class="marker" style="color:var(--ink);font-size:1.3rem">Each patron answers 2 prompts on their phone. Make it hurt.</p>
      </div>
      ${headRow(g.submitted)}`;
  },

  'bb-match': (g) => {
    const r = g.result;
    const side = (f, votes, isWinner, isLoser) => `
      <div class="fighter poster ${isLoser ? 'spilled' : ''} ${isWinner ? 'pop' : ''}">
        <p class="marker" style="font-size:1rem;margin:0;color:var(--blood)">${Avatars.render(avatarOf(f.name), 44)} ${esc(f.name)}</p>
        <div class="display" style="font-size:1.5rem;color:var(--ink)">“${esc(f.text)}”</div>
        ${r ? `<div class="votecount">${votes} vote${votes === 1 ? '' : 's'}${isWinner ? ' 🏆' : ''}</div>` : ''}
      </div>`;
    stage.innerHTML = `
      <p class="marker" style="margin:0;font-size:1.2rem">BRAWL ${g.matchNum} of ${g.matchTotal}</p>
      <div class="poster tilt-l" style="max-width:70%"><div class="bigprompt display" style="font-size:1.6rem;color:var(--ink)">${esc(g.prompt)}</div></div>
      <div class="vsrow">
        ${side(g.a, r ? r.va : 0, r && r.winner === g.a.name, r && r.winner && r.winner !== g.a.name)}
        <div class="vs">VS</div>
        ${side(g.b, r ? r.vb : 0, r && r.winner === g.b.name, r && r.winner && r.winner !== g.b.name)}
      </div>
      ${r
        ? (r.ko ? '<div class="slam stamp dead" style="font-size:2.2rem;background:var(--paper)">💥 KNOCKOUT!</div>'
           : (r.winner ? '' : '<div class="stamp" style="color:var(--amber)">DRAW — nobody buys a round</div>'))
        : headRow(g.voted)}`;
  },

  'dd-throw': (g) => {
    stage.innerHTML = `
      <p class="marker" style="margin:0;font-size:1.2rem">DART ${g.round} of ${g.roundTotal}</p>
      <div class="poster tilt-r" style="max-width:78%"><div class="bigprompt display" style="color:var(--ink)">${esc(g.q)}</div>
      <p class="marker" style="color:var(--blood);margin:4px 0 0">Answer in: ${esc(g.unit)} — beware the hidden GUTTER!</p></div>
      <div class="numline"><span class="endlab" style="left:0">${g.min}</span><span class="endlab" style="right:0">${g.max}</span></div>
      ${headRow(g.thrown)}`;
  },

  'dd-bets': (g) => {
    const pct = v => Math.max(3, Math.min(97, ((v - g.min) / (g.max - g.min)) * 100));
    stage.innerHTML = `
      <div class="poster tilt-l" style="max-width:78%"><div class="bigprompt display" style="font-size:1.5rem;color:var(--ink)">${esc(g.q)}</div>
      <p class="marker" style="color:var(--blood);margin:4px 0 0">💰 Side bets open — back the dart you trust!</p></div>
      <div class="numline">
        ${g.darts.map(d => `<div class="dartpin pop" style="left:${pct(d.value)}%">${esc(d.name)}<br>${d.value}</div>`).join('')}
        <span class="endlab" style="left:0">${g.min}</span><span class="endlab" style="right:0">${g.max}</span>
      </div>
      ${headRow(g.betsIn)}`;
  },

  'dd-reveal': (g) => {
    const pct = v => Math.max(3, Math.min(97, ((v - g.min) / (g.max - g.min)) * 100));
    stage.innerHTML = `
      <div class="poster tilt-r" style="max-width:75%"><div class="bigprompt display" style="font-size:1.4rem;color:var(--ink)">${esc(g.q)}</div>
      <div class="slam stamp truth" style="font-size:1.9rem">ANSWER: ${g.answer} ${esc(g.unit)}</div></div>
      <div class="numline">
        ${g.gutter ? `<div class="gutterzone" style="left:${pct(g.gutter.lo)}%;width:${pct(g.gutter.hi) - pct(g.gutter.lo)}%"></div>` : ''}
        ${g.darts.map(d => `<div class="dartpin ${d.gutter ? 'gut' : ''} ${d.winner ? 'win' : ''}" style="left:${pct(d.value)}%">${esc(d.name)}${d.gutter ? ' ☠' : ''}${d.winner ? ' 🏆' : ''}<br>${d.value}</div>`).join('')}
        <div class="ansmark" style="left:${pct(g.answer)}%">${g.answer}</div>
        <span class="endlab" style="left:0">${g.min}</span><span class="endlab" style="right:0">${g.max}</span>
      </div>
      <div style="display:flex;gap:30px;font-size:1.1rem">
        ${g.bets.length ? `<div class="marker">Bets: ${g.bets.map(b => `${esc(b.name)}→${esc(b.on)} ${b.won ? '✔+' + b.delta : '✘-' + b.amount}`).join(' · ')}</div>` : ''}
      </div>`;
  },

  wait: () => { stage.innerHTML = ''; },
};
