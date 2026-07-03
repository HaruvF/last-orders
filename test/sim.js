// Simulated game night: spins up a host + N fake players and plays a FULL PUB CRAWL
// with random inputs. Run the server with FAST=1 first (timers 10x shorter), then:
//   node test/sim.js
// Or let this script tell you what it sees. Exits 0 when the final scoreboard is reached.
'use strict';
const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3044';
const N = Number(process.env.PLAYERS || 5);
const NAMES = ['Alice', 'Bob', 'Cleo', 'Dorn', 'Ezra', 'Fig', 'Gob', 'Hex'].slice(0, N);

let code = null;
let lastScene = '';
let finished = false;

const host = io(URL);
host.on('connect', () => {
  host.emit('host:create', {}, (res) => {
    code = res.code;
    console.log('[host] room created:', code);
    NAMES.forEach((name, i) => setTimeout(() => spawnPlayer(name), 150 * i));
  });
});
host.on('state', (st) => {
  const key = st.scene + (st.game ? '/' + st.game.type : '');
  if (key !== lastScene) {
    lastScene = key;
    console.log('[host]', key, st.timerEndsAt ? `(timer ${Math.round((st.timerEndsAt - Date.now()) / 1000)}s)` : '');
  }
  if (st.scene === 'final' && !finished) {
    finished = true;
    console.log('[host] FINAL SCORES:', st.players.map(p => `${p.name}=${p.score}`).join(' '));
    console.log('SIM OK — full pub crawl completed.');
    process.exit(0);
  }
});

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function spawnPlayer(name) {
  const s = io(URL);
  let lastView = '';
  s.on('connect', () => {
    s.emit('player:join', { code, name }, (res) => {
      if (res.error) console.error('[' + name + '] join failed:', res.error);
      else console.log('[' + name + '] joined');
    });
  });
  s.on('state', (st) => {
    const v = st.view;
    const vj = JSON.stringify(v);
    if (vj === lastView) return;
    lastView = vj;
    const isVip = st.you.vip;
    const delay = 200 + Math.random() * 800;
    setTimeout(() => act(s, name, v, isVip), delay);
  });
}

const EMOJIS = ['😂', '🔥', '💀', '🍺', '👏', '🤮', '😱', '🖕'];
function act(s, name, v, isVip) {
  const send = (data) => s.emit('player:input', data);
  if (v.allowEmoji && Math.random() < 0.35) send({ action: 'emoji', e: rnd(EMOJIS) });
  switch (v.type) {
    case 'lobby':
      // exercise the avatar picker, then the VIP starts once the room can start
      if (Math.random() < 0.5) {
        const free = v.avatars.filter(a => !a.taken && a.id !== v.current);
        if (free.length) send({ action: 'setAvatar', id: rnd(free).id });
      }
      if (isVip && v.canStart) setTimeout(() => send({ action: 'toLobbyMenu' }), 1000);
      break;
    case 'punish':
      if (Math.random() < 0.5) send({ action: 'punish', random: true });
      else send({ action: 'punish', target: rnd(v.options).id });
      console.log(`[${name}] ⚖️ spending Pub Justice`);
      break;
    case 'menu':
      send({ action: 'pubcrawl' });
      break;
    case 'text':
      send({ action: v.action, text: v.numeric ? String(Math.floor(Math.random() * 100)) : `blorp ${name} ${Math.floor(Math.random() * 9999)}` });
      break;
    case 'choices': {
      const opts = v.options.filter(o => !o.disabled);
      if (opts.length) send({ action: v.action, id: rnd(opts).id });
      break;
    }
    case 'slider': {
      const val = v.min + Math.random() * (v.max - v.min);
      send({ action: v.action, value: Math.round(val) });
      break;
    }
    case 'bet': {
      if (Math.random() < 0.3 || !v.options.length || !v.amounts.length) send({ action: v.action, on: null });
      else send({ action: v.action, on: rnd(v.options).id, amount: rnd(v.amounts) });
      break;
    }
    case 'memory': {
      const seq = Array.from({ length: v.length }, () => Math.floor(Math.random() * v.symbols.length));
      send({ action: 'memory', seq });
      break;
    }
    default:
      break; // wait
  }
}

setTimeout(() => {
  console.error('SIM TIMEOUT — never reached final scoreboard. Last scene: ' + lastScene);
  process.exit(1);
}, 8 * 60 * 1000);
