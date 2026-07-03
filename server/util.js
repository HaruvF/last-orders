'use strict';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Normalize text for duplicate/truth comparison
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
function makeCode(taken) {
  let code;
  do {
    code = Array.from({ length: 4 }, () => pick(CODE_CHARS.split(''))).join('');
  } while (taken && taken.has(code));
  return code;
}

// Timer scale: set FAST=1 env to speed everything up (for simulated tests)
const FAST = !!process.env.FAST;
function secs(s) {
  return FAST ? Math.max(0.6, s / 10) : s;
}

module.exports = { shuffle, pick, normalize, makeCode, secs, FAST };
