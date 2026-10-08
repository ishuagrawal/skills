// Synth engine on an OfflineAudioContext: buses, reverbs, instruments and Foley-style SFX.
// Everything is generated (no samples), deterministic, and scheduled in absolute seconds.
import { rng } from '../core.js';

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function makeEngine(ctx) {
  const SR = ctx.sampleRate;
  const R = rng(1234);

  // ---------- buses ----------
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20; glue.knee.value = 8; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.2;
  const master = ctx.createGain(); master.gain.value = 0.9;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32; hp.Q.value = 0.7;
  const trim = ctx.createGain(); trim.gain.value = 0.82;
  master.connect(hp); hp.connect(glue); glue.connect(limiter); limiter.connect(trim); trim.connect(ctx.destination);
  const bus = (g) => { const n = ctx.createGain(); n.gain.value = g; n.connect(master); return n; };
  const music = bus(0.62), sfx = bus(0.95), amb = bus(0.5);

  // ---------- noise ----------
  const noiseBuf = ctx.createBuffer(2, SR * 3, SR);
  for (let c = 0; c < 2; c++) { const d = noiseBuf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
  const brownBuf = ctx.createBuffer(2, SR * 4, SR);
  for (let c = 0; c < 2; c++) { const d = brownBuf.getChannelData(c); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (R() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }

  // ---------- reverbs ----------
  const makeIR = (dur, decay, color = 1, spring = false) => {
    const b = ctx.createBuffer(2, Math.floor(SR * dur), SR);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const tt = i / SR;
        let v = (R() * 2 - 1);
        lp += (v - lp) * color; v = lp;
        if (spring) v = v * 0.5 + Math.sin(2 * Math.PI * (2400 - 1800 * ((tt * 33) % 1)) * tt) * 0.5 * Math.exp(-((tt * 33) % 1) * 3);
        d[i] = v * Math.pow(1 - i / d.length, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  };
  const verb = ctx.createConvolver(); verb.buffer = makeIR(2.4, 3.2, 0.35);
  const verbRet = ctx.createGain(); verbRet.gain.value = 0.32; verb.connect(verbRet); verbRet.connect(master);
  const spring = ctx.createConvolver(); spring.buffer = makeIR(1.6, 2.6, 0.6, true);
  const springRet = ctx.createGain(); springRet.gain.value = 0.25; spring.connect(springRet); springRet.connect(music);

  // ---------- primitives ----------
  const out = (node, dest = sfx, pan = 0, rev = 0, rv = verb) => {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(p); p.connect(dest);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(rv); }
    return p;
  };
  const env = (param, t, peak, a, d, s = 0, hold = 0, r = 0.05) => {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (s > 0) {
      param.setTargetAtTime(peak * s, t + a, d / 3);
      param.setValueAtTime(peak * s, t + a + hold);
      param.setTargetAtTime(0.0001, t + a + hold, r / 3);
    } else param.setTargetAtTime(0.0001, t + a, d / 4);
  };
  const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const noise = (t, dur, brown = false) => {
    const s = ctx.createBufferSource(); s.buffer = brown ? brownBuf : noiseBuf; s.loop = true;
    s.start(t, R() * 2); s.stop(t + dur + 0.05); return s;
  };
  const shaper = (k = 2) => { const w = ctx.createWaveShaper(); const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } w.curve = c; return w; };

  // generic tone with pitch sweep
  function tone(t, { type = 'sine', f0 = 440, f1 = null, dur = 0.2, g = 0.3, a = 0.005, curve = 'exp', dest = sfx, pan = 0, rev = 0, filter = null, vib = 0, vibRate = 6 }) {
    const o = osc(type, f0);
    if (f1 !== null) curve === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur) : o.frequency.linearRampToValueAtTime(f1, t + dur);
    if (vib) { const l = osc('sine', vibRate), lg = gain(vib); l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const gn = gain(0); env(gn.gain, t, g, a, dur);
    let n = o;
    if (filter) { const f = filt(...filter); o.connect(f); n = f; }
    n.connect(gn); out(gn, dest, pan, rev);
    o.start(t); o.stop(t + dur + 0.3);
  }
  // filtered noise burst
  function hiss(t, { dur = 0.2, g = 0.3, type = 'bandpass', f0 = 2000, f1 = null, q = 0.8, a = 0.003, dest = sfx, pan = 0, rev = 0, brown = false, sustain = 0, rel = 0.05 }) {
    const s = noise(t, dur + rel + 0.2, brown);
    const f = filt(type, f0, q);
    if (f1 !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gn = gain(0);
    if (sustain) env(gn.gain, t, g, a, dur * 0.3, sustain, dur, rel); else env(gn.gain, t, g, a, dur);
    s.connect(f); f.connect(gn); out(gn, dest, pan, rev);
  }

  // ---------- drums ----------
  const drums = {
    kick(t, v = 1) {
      const o = osc('sine', 160); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      const g = gain(0); env(g.gain, t, 0.95 * v, 0.002, 0.42); o.connect(g); out(g, music); o.start(t); o.stop(t + 0.6);
      hiss(t, { dur: 0.012, g: 0.25 * v, type: 'highpass', f0: 3000, dest: music });
    },
    snare(t, v = 1, pan = 0) {
      hiss(t, { dur: 0.2, g: 0.42 * v, type: 'bandpass', f0: 2200, q: 0.6, dest: music, pan, rev: 0.25 });
      hiss(t, { dur: 0.08, g: 0.22 * v, type: 'highpass', f0: 6000, dest: music, pan });
      tone(t, { type: 'triangle', f0: 210, f1: 160, dur: 0.12, g: 0.35 * v, dest: music, pan });
    },
    hat(t, v = 1, open = false) {
      hiss(t, { dur: open ? 0.28 : 0.045, g: 0.16 * v, type: 'highpass', f0: 8000, q: 0.5, dest: music, pan: 0.25 });
    },
    crash(t, v = 1) {
      hiss(t, { dur: 2.2, g: 0.32 * v, type: 'highpass', f0: 4500, q: 0.4, dest: music, pan: -0.15, rev: 0.4 });
      hiss(t, { dur: 1.2, g: 0.12 * v, type: 'bandpass', f0: 9000, q: 2, dest: music, pan: 0.2 });
    },
    tom(t, f = 140, v = 1, pan = 0) { tone(t, { f0: f, f1: f * 0.7, dur: 0.25, g: 0.55 * v, dest: music, pan, rev: 0.15 }); },
    clap(t, v = 1) { for (let i = 0; i < 3; i++) hiss(t + i * 0.011, { dur: 0.06 + (i === 2 ? 0.1 : 0), g: 0.3 * v, f0: 1500, q: 1.2, dest: music, rev: 0.3 }); },
  };

  // ---------- pitched instruments ----------
  const ksCache = new Map();
  function ksBuffer(m, bright = 0.5, decay = 0.996, len = 1.6) {
    const key = `${m}|${bright}|${decay}|${len}`;
    if (ksCache.has(key)) return ksCache.get(key);
    const f = mtof(m), N = Math.max(2, Math.round(SR / f));
    const b = ctx.createBuffer(1, Math.floor(SR * len), SR), d = b.getChannelData(0);
    const ring = new Float32Array(N);
    const r = rng(m * 31 + 7);
    let lp = 0;
    for (let i = 0; i < N; i++) { const x = r() * 2 - 1; lp += (x - lp) * bright; ring[i] = lp; }
    let idx = 0, prev = 0;
    for (let i = 0; i < d.length; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % N];
      const v = (cur + nxt) * 0.5 * decay;
      ring[idx] = v; d[i] = cur; idx = (idx + 1) % N; prev = v;
    }
    ksCache.set(key, b);
    return b;
  }
  const gtrIn = gain(1);
  const drive = shaper(2.2), gtrLP = filt('lowpass', 4200, 0.6), gtrHP = filt('highpass', 120, 0.7), gtrOut = gain(0.55);
  gtrIn.connect(drive); drive.connect(gtrLP); gtrLP.connect(gtrHP); gtrHP.connect(gtrOut);
  out(gtrOut, music, 0.18, 0.0);
  const gs = gain(0.6); gtrOut.connect(gs); gs.connect(spring);
  const slap = ctx.createDelay(1); slap.delayTime.value = 0.11; const slapG = gain(0.22); gtrOut.connect(slap); slap.connect(slapG); slapG.connect(music);

  const inst = {
    // surf guitar pluck
    gtr(t, m, dur = 0.18, v = 1, mute = 0.3) {
      const s = ctx.createBufferSource(); s.buffer = ksBuffer(m, 0.55, mute > 0.5 ? 0.99 : 0.997);
      const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.8 * v, t + 0.002);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.03 + (1 - mute) * 0.08);
      s.connect(g); g.connect(gtrIn); s.start(t); s.stop(t + dur + 0.6);
    },
    // clean, soft guitar for the morning
    clean(t, m, dur = 0.5, v = 1, pan = -0.1) {
      const s = ctx.createBufferSource(); s.buffer = ksBuffer(m, 0.3, 0.998, 2.4);
      const lp = filt('lowpass', 2600, 0.5);
      const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6 * v, t + 0.004); g.gain.setTargetAtTime(0.0001, t + dur, 0.25);
      s.connect(lp); lp.connect(g); out(g, music, pan, 0.45); s.start(t); s.stop(t + dur + 1.5);
    },
    bass(t, m, dur = 0.16, v = 1) {
      const o1 = osc('sawtooth', mtof(m)), o2 = osc('sine', mtof(m - 12));
      const f = filt('lowpass', 1800, 2); f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.12);
      const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32 * v, t + 0.004); g.gain.setTargetAtTime(0.0001, t + dur, 0.03);
      const g2 = gain(0.9);
      o1.connect(f); f.connect(g); o2.connect(g2); g2.connect(g); out(g, music, 0);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.3); o2.stop(t + dur + 0.3);
    },
    // brass-ish stab chord
    stab(t, notes, dur = 0.25, v = 1, rev = 0.25) {
      const f = filt('lowpass', 500, 1.2);
      f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(3600, t + 0.03); f.frequency.setTargetAtTime(1300, t + 0.05, 0.08);
      const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * v, t + 0.02); g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
      notes.forEach(m => [-7, 0, 7].forEach(c => { const o = osc('sawtooth', mtof(m)); o.detune.value = c; o.connect(f); o.start(t); o.stop(t + dur + 0.5); }));
      f.connect(g); out(g, music, 0, rev);
    },
    // glockenspiel / music box
    bell(t, m, dur = 1.2, v = 1, pan = 0, rev = 0.4, dest = music) {
      [[1, 1], [2.756, 0.35], [5.404, 0.12]].forEach(([r, a]) => tone(t, { f0: mtof(m) * r, dur: dur * (r > 1 ? 0.4 : 1), g: 0.16 * v * a, a: 0.001, dest, pan, rev }));
    },
    musicbox(t, m, v = 1) {
      tone(t, { f0: mtof(m), dur: 1.3, g: 0.13 * v, a: 0.001, dest: music, pan: 0.1, rev: 0.5 });
      tone(t, { f0: mtof(m) * 4.01, dur: 0.35, g: 0.03 * v, a: 0.001, dest: music, pan: 0.1, rev: 0.5 });
    },
    pad(t, notes, dur, v = 1, cutoff = 1200) {
      const f = filt('lowpass', cutoff, 0.6);
      const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07 * v, t + dur * 0.4); g.gain.setTargetAtTime(0.0001, t + dur, 0.3);
      notes.forEach(m => [-9, 9].forEach(c => { const o = osc('sawtooth', mtof(m)); o.detune.value = c; o.connect(f); o.start(t); o.stop(t + dur + 1.5); }));
      f.connect(g); out(g, music, 0, 0.5);
    },
    whistle(t, m, dur, v = 1) {
      tone(t, { f0: mtof(m) * 0.97, f1: mtof(m), curve: 'lin', dur: 0.05, g: 0.0001, dest: sfx });
      const o = osc('sine', mtof(m)); o.frequency.setValueAtTime(mtof(m) * 0.96, t); o.frequency.linearRampToValueAtTime(mtof(m), t + 0.05);
      const l = osc('sine', 5.5), lg = gain(mtof(m) * 0.012); l.connect(lg); lg.connect(o.frequency);
      const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * v, t + 0.04); g.gain.setTargetAtTime(0.0001, t + dur, 0.03);
      o.connect(g); out(g, sfx, -0.3, 0.3); o.start(t); l.start(t); o.stop(t + dur + 0.3); l.stop(t + dur + 0.3);
      hiss(t, { dur, g: 0.012 * v, f0: mtof(m) * 2, q: 3, dest: sfx, pan: -0.3 });
    },
  };

  // ---------- SFX ----------
  const fx = {
    key(t, v = 1, pan = 0) {
      hiss(t, { dur: 0.018, g: 0.22 * v, f0: 3500 + R() * 1500, q: 1.5, pan });
      tone(t, { type: 'triangle', f0: 260 + R() * 60, f1: 180, dur: 0.03, g: 0.12 * v, pan });
    },
    thunk(t, v = 1) { // heavy key / switch
      tone(t, { f0: 120, f1: 50, dur: 0.18, g: 0.7 * v });
      hiss(t, { dur: 0.04, g: 0.4 * v, f0: 1800, q: 1, rev: 0.1 });
      hiss(t + 0.03, { dur: 0.02, g: 0.2 * v, f0: 4000, q: 2 });
    },
    click(t, v = 1, f = 3000, pan = 0) { hiss(t, { dur: 0.012, g: 0.35 * v, f0: f, q: 2.5, pan }); },
    blip(t, f = 1200, v = 1, dur = 0.06, pan = 0) { tone(t, { type: 'square', f0: f, dur, g: 0.05 * v, pan, filter: ['lowpass', 3000] }); },
    sub(t, v = 1, f0 = 90, dur = 0.8) { tone(t, { f0, f1: 28, dur, g: 0.85 * v }); },
    boom(t, v = 1, dur = 1.2, pan = 0) {
      this.sub(t, v * 0.9, 80, dur);
      hiss(t, { dur: dur * 0.6, g: 0.55 * v, type: 'lowpass', f0: 900, f1: 120, q: 0.5, pan, rev: 0.35 });
      hiss(t, { dur: 0.12, g: 0.35 * v, type: 'highpass', f0: 2500, pan });
    },
    whoosh(t, dur = 0.5, v = 1, f0 = 400, f1 = 3000, pan = 0) {
      hiss(t, { dur, g: 0.28 * v, f0, f1, q: 1.4, a: dur * 0.6, pan, rev: 0.15 });
    },
    swoosh(t, v = 1) { this.whoosh(t - 0.12, 0.2, v, 600, 4000); hiss(t, { dur: 0.08, g: 0.3 * v, f0: 2500, q: 0.7 }); },
    zap(t, dur = 0.12, v = 1, pan = 0) {
      const o = osc('square', 200);
      for (let i = 0; i < dur / 0.012; i++) o.frequency.setValueAtTime(200 + R() * 2400, t + i * 0.012);
      const f = filt('bandpass', 2400, 0.8), g = gain(0); env(g.gain, t, 0.12 * v, 0.002, dur);
      o.connect(f); f.connect(g); out(g, sfx, pan, 0.2); o.start(t); o.stop(t + dur + 0.2);
      hiss(t, { dur, g: 0.15 * v, f0: 5000, q: 0.6, pan });
    },
    crackle(t, dur, rate = 60, v = 1, f = 6000, pan = 0) {
      const n = Math.floor(dur * rate);
      for (let i = 0; i < n; i++) hiss(t + R() * dur, { dur: 0.006 + R() * 0.01, g: (0.05 + R() * 0.12) * v, f0: f * (0.6 + R() * 0.8), q: 1.5, pan: pan + (R() - 0.5) * 0.6 });
    },
    riser(t, dur, v = 1) {
      hiss(t, { dur, g: 0.22 * v, type: 'bandpass', f0: 300, f1: 6000, q: 1.2, a: dur * 0.95, rev: 0.3 });
      tone(t, { type: 'sawtooth', f0: 110, f1: 880, dur, g: 0.06 * v, a: dur * 0.9, filter: ['lowpass', 2500], rev: 0.3 });
    },
    reverse(t, dur = 0.6, v = 1) { hiss(t, { dur, g: 0.35 * v, type: 'highpass', f0: 3000, q: 0.5, a: dur * 0.98, rev: 0.2 }); },
    glass(t, v = 1, pan = 0) {
      for (let i = 0; i < 9; i++) tone(t + R() * 0.07, { f0: 2500 + R() * 5500, dur: 0.15 + R() * 0.25, g: 0.06 * v, a: 0.001, pan: pan + (R() - 0.5) * 0.5, rev: 0.2 });
      hiss(t, { dur: 0.15, g: 0.4 * v, type: 'highpass', f0: 3500, pan });
      tone(t, { f0: 180, f1: 90, dur: 0.1, g: 0.3 * v, pan });
    },
    clang(t, v = 1, pan = 0) {
      [[310, 1], [523, 0.6], [887, 0.45], [1340, 0.3], [2210, 0.2]].forEach(([f, a]) => tone(t, { f0: f * (0.97 + R() * 0.06), dur: 0.45, g: 0.12 * v * a, a: 0.001, pan, rev: 0.2 }));
      hiss(t, { dur: 0.05, g: 0.3 * v, f0: 2000, q: 0.8, pan });
      tone(t, { f0: 140, f1: 70, dur: 0.12, g: 0.4 * v, pan });
    },
    boing(t, v = 1) {
      const o = osc('sine', 180); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.08); o.frequency.exponentialRampToValueAtTime(190, t + 0.7);
      const l = osc('sine', 22), lg = gain(70); l.connect(lg); lg.connect(o.frequency); lg.gain.setTargetAtTime(0, t + 0.1, 0.2);
      const g = gain(0); env(g.gain, t, 0.5 * v, 0.004, 0.8); o.connect(g); out(g, sfx, 0, 0.2);
      o.start(t); l.start(t); o.stop(t + 1); l.stop(t + 1);
      const o2 = osc('triangle', 90); o2.frequency.exponentialRampToValueAtTime(60, t + 0.4); const g2 = gain(0); env(g2.gain, t, 0.4 * v, 0.003, 0.4); o2.connect(g2); out(g2, sfx); o2.start(t); o2.stop(t + 0.6);
    },
    squeak(t, v = 1, pan = 0) {
      const o = osc('sawtooth', 900);
      o.frequency.setValueAtTime(820, t); o.frequency.linearRampToValueAtTime(1350, t + 0.06); o.frequency.linearRampToValueAtTime(1180, t + 0.16); o.frequency.linearRampToValueAtTime(980, t + 0.24);
      const l = osc('sine', 38), lg = gain(40); l.connect(lg); lg.connect(o.frequency);
      const f1 = filt('bandpass', 1600, 3), f2 = filt('bandpass', 2900, 4), g = gain(0);
      env(g.gain, t, 0.5 * v, 0.012, 0.22, 0.8, 0.18, 0.05);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); out(g, sfx, pan, 0.15);
      o.start(t); l.start(t); o.stop(t + 0.5); l.stop(t + 0.5);
      hiss(t, { dur: 0.25, g: 0.04 * v, f0: 3000, q: 1, pan });
    },
    scratch(t, v = 1) {
      const s = noise(t, 0.5), f = filt('bandpass', 800, 3), g = gain(0);
      const pts = [800, 2600, 500, 3200, 700];
      pts.forEach((fr, i) => f.frequency.linearRampToValueAtTime(fr, t + i * 0.07));
      env(g.gain, t, 0.55 * v, 0.005, 0.3, 0.9, 0.3, 0.04);
      s.connect(f); f.connect(g); out(g, sfx);
      const o = osc('sawtooth', 300); [300, 900, 200, 1100, 260].forEach((fr, i) => o.frequency.linearRampToValueAtTime(fr, t + i * 0.07));
      const og = gain(0); env(og.gain, t, 0.08 * v, 0.005, 0.3, 0.9, 0.3, 0.04); const of = filt('lowpass', 2000); o.connect(of); of.connect(og); out(og, sfx); o.start(t); o.stop(t + 0.5);
    },
    paper(t, dur = 1.5, v = 1, pan = 0) {
      const n = Math.floor(dur * 28);
      for (let i = 0; i < n; i++) { const tt = t + (i / n) * dur * (0.4 + R() * 0.6); hiss(tt, { dur: 0.03 + R() * 0.07, g: (0.07 + R() * 0.12) * v * (1 - i / n * 0.7), f0: 2500 + R() * 3500, q: 0.9, pan: pan + (R() - 0.5) }); }
    },
    domino(t, v = 1, pan = 0) {
      hiss(t, { dur: 0.012, g: 0.35 * v, f0: 2600 + R() * 800, q: 3, pan });
      tone(t, { type: 'triangle', f0: 1100 + R() * 300, dur: 0.04, g: 0.08 * v, a: 0.001, pan });
    },
    thud(t, v = 1, pan = 0) { tone(t, { f0: 95, f1: 45, dur: 0.22, g: 0.75 * v, pan }); hiss(t, { dur: 0.06, g: 0.25 * v, type: 'lowpass', f0: 700, pan }); },
    step(t, v = 1, pan = 0) { hiss(t, { dur: 0.07, g: 0.22 * v, type: 'lowpass', f0: 500, pan }); tone(t, { f0: 80, f1: 55, dur: 0.08, g: 0.25 * v, pan }); },
    creak(t, dur = 0.6, v = 1, f = 160, pan = 0) {
      const o = osc('sawtooth', f); for (let i = 0; i < dur / 0.02; i++) o.frequency.setValueAtTime(f * (0.85 + R() * 0.4), t + i * 0.02);
      const bp = filt('bandpass', 900, 4), g = gain(0); env(g.gain, t, 0.08 * v, dur * 0.2, dur * 0.6, 0.8, dur * 0.6, 0.1);
      o.connect(bp); bp.connect(g); out(g, sfx, pan, 0.2); o.start(t); o.stop(t + dur + 0.2);
    },
    tick(t, v = 1, tock = false) { hiss(t, { dur: 0.01, g: 0.22 * v, f0: tock ? 1800 : 2600, q: 6, rev: 0.25, pan: -0.35 }); tone(t, { f0: tock ? 900 : 1300, dur: 0.03, g: 0.04 * v, a: 0.001, pan: -0.35 }); },
    bell(t, v = 1, f = 2093) { [1, 1.26, 2.01].forEach((r, i) => tone(t + i * 0.002, { f0: f * r, dur: 0.9, g: 0.08 * v / (i + 1), a: 0.001, rev: 0.3 })); },
    ching(t, v = 1) { this.bell(t, v, 2637); this.bell(t + 0.09, v, 3520); hiss(t, { dur: 0.15, g: 0.15 * v, f0: 4000, q: 1 }); tone(t, { f0: 200, f1: 120, dur: 0.1, g: 0.2 * v }); },
    whistleUp(t, dur = 0.6, v = 1, pan = 0) {
      tone(t, { f0: 700, f1: 2600, dur, g: 0.05 * v, a: 0.05, pan, curve: 'exp' });
      hiss(t, { dur, g: 0.12 * v, f0: 3000, f1: 6000, q: 1, a: 0.04, pan });
    },
    whistleDown(t, dur = 1.4, v = 1) { tone(t, { f0: 2200, f1: 500, dur, g: 0.07 * v, a: 0.05, curve: 'exp', vib: 30, vibRate: 7 }); },
    pop(t, v = 1, pan = 0) { tone(t, { f0: 400, f1: 900, dur: 0.06, g: 0.3 * v, a: 0.002, pan }); hiss(t, { dur: 0.03, g: 0.2 * v, f0: 1500, q: 1, pan }); },
    burst(t, v = 1, pan = 0, size = 1) {
      this.boom(t, 0.7 * v * size, 0.8 + size * 0.5, pan);
      this.crackle(t + 0.12, 0.9 + size * 0.6, 45 * size, 0.7 * v, 5500, pan);
    },
    sparkle(t, v = 1) { [0, 0.05, 0.1].forEach((d, i) => tone(t + d, { f0: 2800 + i * 700, dur: 0.25, g: 0.05 * v, a: 0.001, rev: 0.4 })); },
    drip(t, v = 1) { tone(t, { f0: 900, f1: 2400, dur: 0.07, g: 0.15 * v, a: 0.001, rev: 0.3 }); },
    smash(t, v = 1) {
      this.glass(t, v * 1.3); this.thud(t, v);
      hiss(t, { dur: 0.5, g: 0.3 * v, f0: 600, q: 0.6, rev: 0.3 });
      for (let i = 0; i < 6; i++) tone(t + 0.05 + R() * 0.35, { f0: 3000 + R() * 4000, dur: 0.12, g: 0.04 * v, a: 0.001, pan: (R() - 0.5) });
      hiss(t + 0.02, { dur: 0.4, g: 0.15 * v, type: 'lowpass', f0: 1200, q: 0.5 }); // splash
    },
    fwump(t, v = 1) { hiss(t, { dur: 0.25, g: 0.3 * v, type: 'lowpass', f0: 900, f1: 300, q: 0.6 }); tone(t, { f0: 110, f1: 60, dur: 0.12, g: 0.25 * v }); },
    birds(t, dur, v = 1) {
      const n = Math.floor(dur * 4);
      for (let i = 0; i < n; i++) {
        const tt = t + R() * dur, f = 2800 + R() * 1800;
        for (let k = 0; k < 2 + Math.floor(R() * 3); k++) tone(tt + k * 0.07, { f0: f, f1: f * (1.25 + R() * 0.3), dur: 0.05, g: 0.035 * v, a: 0.003, pan: (R() - 0.5) * 1.2, rev: 0.3, dest: amb });
      }
    },
    crickets(t, dur, v = 1) {
      for (let c = 0; c < 3; c++) {
        const f = 4300 + c * 260, pan = (c - 1) * 0.6;
        for (let tt = t + R() * 0.4; tt < t + dur; tt += 0.55 + R() * 0.3) {
          for (let k = 0; k < 3; k++) tone(tt + k * 0.035, { f0: f, dur: 0.02, g: 0.025 * v, a: 0.002, pan, dest: amb });
        }
      }
    },
    roomTone(t, dur, v = 1) { hiss(t, { dur, g: 0.05 * v, type: 'lowpass', f0: 380, q: 0.4, a: 0.3, sustain: 1, rel: 0.3, dest: amb, brown: true }); },
    hum(t, dur, v = 1) { tone(t, { f0: 60, dur, g: 0.012 * v, a: 0.2, dest: amb }); tone(t, { f0: 120, dur, g: 0.006 * v, a: 0.2, dest: amb }); },
    city(t, dur, v = 1) { hiss(t, { dur, g: 0.06 * v, type: 'lowpass', f0: 500, q: 0.5, a: 0.4, sustain: 1, rel: 0.4, dest: amb, brown: true }); },
  };

  return { ctx, SR, buses: { music, sfx, amb, master }, drums, inst, fx, tone, hiss, R };
}
