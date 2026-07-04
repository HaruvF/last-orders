// Procedural pub sound kit — all synthesized with Web Audio, no assets.
(function (global) {
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0 } = {}) {
    const c = ac();
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, { vol = 0.2, freq = 800, q = 1, delay = 0 } = {}) {
    const c = ac();
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }

  const SFX = {
    tick() { tone(760, 0.05, { type: 'triangle', vol: 0.05 }); },
    stinger() { [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'sawtooth', vol: 0.12, delay: i * 0.09 })); },
    bell() { tone(1318, 0.5, { type: 'triangle', vol: 0.18 }); tone(1975, 0.35, { type: 'sine', vol: 0.08 }); },
    thunk() { tone(140, 0.15, { type: 'sine', vol: 0.35, slide: -80 }); noise(0.08, { vol: 0.15, freq: 2500 }); },
    splash() { noise(0.4, { vol: 0.3, freq: 1200, q: 0.5 }); tone(300, 0.2, { type: 'sine', vol: 0.1, slide: -150 }); },
    stamp() { tone(90, 0.2, { type: 'sine', vol: 0.4, slide: -40 }); noise(0.05, { vol: 0.2, freq: 400 }); },
    wrong() { tone(220, 0.35, { type: 'sawtooth', vol: 0.18, slide: -120 }); tone(233, 0.35, { type: 'sawtooth', vol: 0.18, slide: -120 }); },
    death() { [196, 155, 98].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.16, delay: i * 0.22 })); noise(0.6, { vol: 0.08, freq: 200, delay: 0.6 }); },
    doom() { tone(55, 1.6, { type: 'sawtooth', vol: 0.22 }); tone(58, 1.6, { type: 'sawtooth', vol: 0.18 }); },
    foam() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.14, delay: i * 0.07 })); noise(0.5, { vol: 0.12, freq: 4000, q: 0.4, delay: 0.15 }); },
    // soft warm woodblock tick — gentle countdown, not a shrill beep
    urgent() { tone(560, 0.09, { type: 'triangle', vol: 0.05 }); },
    urgentLast() { tone(760, 0.14, { type: 'triangle', vol: 0.07 }); },
  };

  global.PubAudio = {
    unlock() { try { ac(); } catch (e) { /* no audio available */ } },
    play(name) { try { if (SFX[name]) SFX[name](); } catch (e) { /* ignore */ } },
  };
})(window);
