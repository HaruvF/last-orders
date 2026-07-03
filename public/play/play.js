/* global io, Avatars, PubAudio */
'use strict';

const socket = io();
const widget = document.getElementById('widget');
const youbar = document.getElementById('youbar');
let joined = false;
let timerEndsAt = null;
let lastViewJSON = '';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function send(data) {
  PubAudio.play('tick');
  socket.emit('player:input', data);
}

// ---------- join flow ----------
function showJoin(error) {
  joined = false;
  youbar.style.display = 'none';
  const saved = JSON.parse(localStorage.getItem('lo-player') || '{}');
  widget.innerHTML = `
    <div class="poster joinbox">
      <h1>LAST ORDERS</h1>
      <p class="marker" style="color:var(--ink)">Get in here, you reprobate.</p>
      ${error ? `<div class="w-error">${esc(error)}</div>` : ''}
      <input type="text" id="jcode" maxlength="4" placeholder="ROOM CODE" autocomplete="off" value="${esc(saved.code || '')}">
      <input type="text" id="jname" maxlength="12" placeholder="NICKNAME" autocomplete="off" value="${esc(saved.name || '')}">
      <button class="btn brew big" id="jgo" style="margin-top:14px;width:100%">ENTER THE PUB</button>
    </div>`;
  document.getElementById('jgo').addEventListener('click', () => {
    PubAudio.unlock();
    const code = document.getElementById('jcode').value.trim().toUpperCase();
    const name = document.getElementById('jname').value.trim();
    if (code.length !== 4 || !name) return showJoin('Need a 4-letter code and a nickname.');
    socket.emit('player:join', { code, name }, (res) => {
      if (res.error) return showJoin(res.error);
      joined = true;
      localStorage.setItem('lo-player', JSON.stringify({ code: res.code, name: res.name }));
      widget.innerHTML = '<div class="poster w-wait">In! Eyes on the big screen…</div>';
    });
  });
}

socket.on('connect', () => {
  // Auto-rejoin if we were in a room (reconnect / page reload)
  const saved = JSON.parse(localStorage.getItem('lo-player') || '{}');
  if (saved.code && saved.name) {
    socket.emit('player:join', { code: saved.code, name: saved.name }, (res) => {
      if (res.error) showJoin();
      else joined = true;
    });
  } else {
    showJoin();
  }
});

socket.on('disconnect', () => {
  widget.innerHTML = '<div class="poster w-wait">Connection lost… reconnecting to the pub 🍺</div>';
});

// timer chip
setInterval(() => {
  const el = document.getElementById('ptimer');
  if (!el) return;
  if (!timerEndsAt) { el.style.visibility = 'hidden'; return; }
  const left = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
  el.style.visibility = 'visible';
  el.textContent = left;
  el.classList.toggle('urgent', left <= 5 && left > 0);
}, 250);

// ---------- state render ----------
socket.on('state', (st) => {
  if (!joined) return;
  timerEndsAt = st.timerEndsAt;
  youbar.style.display = 'flex';
  document.getElementById('youavatar').innerHTML = Avatars.render(st.you.avatar, 42);
  document.getElementById('youname').textContent = (st.you.vip ? '👑 ' : '') + st.you.name;
  document.getElementById('youscore').textContent = st.you.score;

  const vj = JSON.stringify(st.view);
  if (vj === lastViewJSON) return; // don't blow away in-progress input
  lastViewJSON = vj;
  renderView(st.view);
});

const EMOJI_SET = ['😂', '🔥', '💀', '🍺', '👏', '🤮', '😱', '🖕'];
function appendEmojiBar() {
  const bar = document.createElement('div');
  bar.className = 'emojibar';
  bar.innerHTML = `<div class="marker" style="text-align:center;opacity:0.7">heckle the big screen:</div>
    <div class="emojirow">${EMOJI_SET.map(e => `<button class="ebtn">${e}</button>`).join('')}</div>`;
  bar.querySelectorAll('.ebtn').forEach(b => {
    b.addEventListener('click', () => {
      socket.emit('player:input', { action: 'emoji', e: b.textContent });
      // client-side cooldown mirrors the server's
      bar.querySelectorAll('.ebtn').forEach(x => { x.disabled = true; });
      setTimeout(() => bar.querySelectorAll('.ebtn').forEach(x => { x.disabled = false; }), 700);
    });
  });
  widget.appendChild(bar);
}

function renderView(v) {
  const fn = WIDGETS[v.type] || WIDGETS.wait;
  fn(v);
  if (v.allowEmoji) appendEmojiBar();
}

const WIDGETS = {
  wait(v) {
    widget.innerHTML = `<div class="poster w-wait tilt-l">${esc(v.message || 'Hold tight…')}</div>`;
  },

  text(v) {
    widget.innerHTML = `
      <div class="poster w-prompt">${esc(v.prompt)}</div>
      ${v.error ? `<div class="w-error">${esc(v.error)}</div>` : ''}
      <input type="${v.numeric ? 'number' : 'text'}" id="tin" maxlength="${v.maxLen || 80}"
        placeholder="${esc(v.placeholder || '')}" autocomplete="off" ${v.numeric ? 'inputmode="numeric"' : ''}>
      <button class="btn brew big" id="tgo">${esc(v.submitLabel || 'SUBMIT')}</button>`;
    const input = document.getElementById('tin');
    const go = () => {
      const text = input.value.trim();
      if (!text) return;
      send({ action: v.action, text });
    };
    document.getElementById('tgo').addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    input.focus();
  },

  choices(v) {
    widget.innerHTML = `
      <div class="poster w-prompt">${esc(v.prompt)}</div>
      ${v.options.map((o, i) => `<button class="btn choice" data-i="${i}" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}`;
    widget.querySelectorAll('.btn.choice').forEach(b => {
      b.addEventListener('click', () => {
        const o = v.options[Number(b.dataset.i)];
        send({ action: v.action, id: o.id });
      });
    });
  },

  slider(v) {
    const mid = Math.round((v.min + v.max) / 2);
    widget.innerHTML = `
      <div class="poster w-prompt">${esc(v.prompt)}</div>
      <div class="sliderwrap poster" style="background:var(--chalk-bg);border-color:var(--ink)">
        <div class="val" id="sval">${mid}</div>
        <div class="marker" style="color:var(--chalk)">${esc(v.unit)}</div>
        <input type="range" id="srange" min="${v.min}" max="${v.max}" step="${v.step || 1}" value="${mid}">
        <input type="number" id="sexact" value="${mid}" inputmode="numeric" style="margin-top:8px">
      </div>
      <button class="btn danger big" id="sthrow">🎯 THROW DART</button>`;
    const range = document.getElementById('srange');
    const exact = document.getElementById('sexact');
    const val = document.getElementById('sval');
    range.addEventListener('input', () => { val.textContent = range.value; exact.value = range.value; });
    exact.addEventListener('input', () => { val.textContent = exact.value; range.value = exact.value; });
    document.getElementById('sthrow').addEventListener('click', () => {
      send({ action: v.action, value: Number(exact.value) });
    });
  },

  bet(v) {
    let on = null, amount = 0;
    widget.innerHTML = `
      <div class="poster w-prompt">${esc(v.prompt)}</div>
      <div id="betwho">${v.options.map((o, i) => `<button class="btn choice" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>
      <div id="betamt" style="display:none">
        <div class="poster w-prompt">How much?</div>
        <div class="gamecard">
          ${v.amounts.map(a => `<button class="btn" data-a="${a}">${a}</button>`).join('')}
        </div>
      </div>
      <button class="btn ghostly big" id="nobet">NO BET — I trust nobody</button>`;
    widget.querySelectorAll('#betwho .btn').forEach(b => {
      b.addEventListener('click', () => {
        widget.querySelectorAll('#betwho .btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        on = v.options[Number(b.dataset.i)].id;
        const amtDiv = document.getElementById('betamt');
        if (v.amounts.length === 0) return send({ action: v.action, on: null });
        amtDiv.style.display = 'block';
      });
    });
    widget.querySelectorAll('#betamt .btn').forEach(b => {
      b.addEventListener('click', () => {
        amount = Number(b.dataset.a);
        if (on) send({ action: v.action, on, amount });
      });
    });
    document.getElementById('nobet').addEventListener('click', () => send({ action: v.action, on: null }));
  },

  memory(v) {
    const seq = [];
    widget.innerHTML = `
      <div class="poster w-prompt">${esc(v.prompt)}</div>
      <div class="memtrace poster" id="mtrace" style="background:var(--chalk-bg);color:var(--chalk)">_ _ _ _</div>
      <div class="memrow">${v.symbols.map((s, i) => `<button class="btn" data-i="${i}">${s}</button>`).join('')}</div>
      <button class="btn ghostly" id="mclear">CLEAR</button>`;
    const trace = document.getElementById('mtrace');
    const redraw = () => {
      trace.textContent = Array.from({ length: v.length }, (_, i) => seq[i] !== undefined ? v.symbols[seq[i]] : '_').join(' ');
    };
    widget.querySelectorAll('.memrow .btn').forEach(b => {
      b.addEventListener('click', () => {
        if (seq.length >= v.length) return;
        seq.push(Number(b.dataset.i));
        redraw();
        if (seq.length === v.length) send({ action: 'memory', seq });
      });
    });
    document.getElementById('mclear').addEventListener('click', () => { seq.length = 0; redraw(); });
  },

  lobby(v) {
    widget.innerHTML = `
      <div class="poster w-prompt" style="text-align:center">${v.vip ? '👑 You\'re the party leader.<br>' : ''}
        ${v.count} in the pub${v.canStart ? '' : ` — need at least ${v.min}`}.<br>
        <span class="marker">Tap a patron to change your look:</span></div>
      <div class="avgrid">${v.avatars.map(a => `
        <button class="avbtn ${a.id === v.current ? 'mine' : ''}" data-id="${a.id}" ${a.taken ? 'disabled' : ''}>
          ${Avatars.render(a.id, 64)}
        </button>`).join('')}
      </div>
      ${v.vip ? `<button class="btn brew big" id="vstart" ${v.canStart ? '' : 'disabled'}>EVERYONE'S IN — CHOOSE GAMES</button>`
              : '<div class="poster w-wait" style="margin-top:4px">Waiting for the party leader to start…</div>'}`;
    widget.querySelectorAll('.avbtn').forEach(b => {
      b.addEventListener('click', () => send({ action: 'setAvatar', id: b.dataset.id }));
    });
    const vs = document.getElementById('vstart');
    if (vs) vs.addEventListener('click', () => send({ action: 'toLobbyMenu' }));
  },

  punish(v) {
    widget.innerHTML = `
      <div class="poster w-prompt" style="background:var(--blood);color:var(--paper)">${esc(v.prompt)}</div>
      ${v.options.map((o, i) => `<button class="btn choice" data-i="${i}">${Avatars.render(o.avatar, 40)} ${esc(o.label)}</button>`).join('')}
      <button class="btn danger big" id="prand">🎲 RANDOM ROLL — fate decides</button>`;
    widget.querySelectorAll('.btn.choice').forEach(b => {
      b.addEventListener('click', () => send({ action: 'punish', target: v.options[Number(b.dataset.i)].id }));
    });
    document.getElementById('prand').addEventListener('click', () => send({ action: 'punish', random: true }));
  },

  menu(v) {
    widget.innerHTML = `
      <div class="poster w-prompt">👑 Pick tonight's games (3 is a good session):</div>
      ${v.games.map(g => `
        <button class="btn choice ${v.selected.includes(g.id) ? 'selected' : ''}" data-id="${g.id}">
          ${v.selected.includes(g.id) ? '🍺 ' : '○ '}${esc(g.name)} — ${esc(g.desc)}
        </button>`).join('')}
      <button class="btn brew big" id="mstart" ${v.selected.length ? '' : 'disabled'}>START (${v.selected.length} game${v.selected.length === 1 ? '' : 's'})</button>
      <button class="btn danger big" id="mcrawl">🍻 FULL PUB CRAWL — ALL 4</button>`;
    widget.querySelectorAll('.btn.choice').forEach(b => {
      b.addEventListener('click', () => send({ action: 'toggleGame', id: b.dataset.id }));
    });
    document.getElementById('mstart').addEventListener('click', () => send({ action: 'startGames' }));
    document.getElementById('mcrawl').addEventListener('click', () => send({ action: 'pubcrawl' }));
  },
};
