// browser_probe.js — measure a reference video that only plays in a web page (e.g. YouTube).
// Paste the whole file into the built-in browser's javascript tool on the video page. It installs
// window.__vbr; then call its methods in later tool calls. Long jobs run in the background and
// store results on window.__vbr (tool calls time out after ~45 s), so poll their status.
// Navigation (even in-app route changes) wipes window — re-paste after navigating.
// Before pasting: pause the video right after navigating and check title/duration (autoplay can
// jump to another video within seconds). Frame scans need the browser pane VISIBLE (hidden tabs
// don't decode frames on seek); audio capture works hidden because it runs on the audio thread.
//
//   __vbr.meta()                               → {duration, w, h, title, ad, t}  ← CHECK the title/duration:
//                                                 YouTube can silently land on another video (autoplay/queue)
//   __vbr.stop()                               → abort any running scan/holds job
//   __vbr.guard()                              → pause at the end so autoplay can't switch videos
//   __vbr.scan({step: 1/30})                   → starts frame-difference scan; poll __vbr.scanStatus()
//   __vbr.cuts({thr: 18})                      → [[t, diff, luma], …] spikes = cuts / flashes
//   await __vbr.sheet([0, .5, 1, …])           → vertical stack overlay; __vbr.page(i) to scroll, screenshot each page
//   __vbr.closeSheet()
//   __vbr.holds([[a, b], …])                   → starts 60 Hz hold detection; poll __vbr.holdsResult
//   await __vbr.palette([t1, t2, …], 10)       → k-means hex palette with shares
//   await __vbr.captureAudio()                 → plays from 0 silently, captures PCM on the audio thread
//   __vbr.audioStatus()                        → {done, seconds}
//   __vbr.analyzeAudio({from, to})             → summary per 0.25 s, onsets, tempo, bass tonal center, key
//                                                 (pass the music section as from/to: SFX and silences skew tempo/key)
(() => {
  const V = () => document.querySelector('video');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const seek = t => new Promise(r => { const v = V(); const f = () => { v.removeEventListener('seeked', f); r(); }; v.addEventListener('seeked', f); v.currentTime = t; });
  if (window.__vbr) window.__vbr._stop = true; // abort jobs from a previous paste
  const S = window.__vbr = { scanRows: null, holdsResult: null, pcm: null, _stop: false };
  S.stop = () => { S._stop = true; V()?.pause(); return 'stopped'; };

  S.meta = () => { const v = V(); return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, title: document.title, ad: !!document.querySelector('.ad-showing'), t: v.currentTime }; };
  S.guard = () => { const v = V(); v.loop = false; v.addEventListener('timeupdate', () => { if (v.currentTime > v.duration - 0.08) v.pause(); }); return 'guarded'; };

  // ---------- frame-difference scan (cuts, flashes, motion)
  S.scan = ({ step = 1 / 30, w = 96, h = 54, maxSeconds = 600 } = {}) => {
    S.scanRows = []; S._scanDone = false; S._stop = false;
    if (V().duration > maxSeconds) return `refusing: duration ${V().duration}s > maxSeconds ${maxSeconds} — wrong video? (pass maxSeconds to override)`;
    (async () => {
      const v = V(); v.pause(); v.muted = true;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      let prev = null;
      for (let t = 0; t < v.duration - 0.02 && !S._stop; t += step) {
        await seek(t);
        x.drawImage(v, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data;
        let sl = 0, diff = 0, sr = 0, sg = 0, sb = 0;
        for (let i = 0; i < d.length; i += 4) {
          sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sl += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (prev) diff += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]);
        }
        const n = w * h;
        S.scanRows.push({ t: +t.toFixed(3), L: Math.round(sl / n), D: prev ? +(diff / n / 3).toFixed(1) : 0, rgb: [sr / n | 0, sg / n | 0, sb / n | 0] });
        prev = d;
        // A hidden tab doesn't decode frames on seek: every capture is the same image.
        if (S.scanRows.length === 45 && S.scanRows.every(r => r.D === 0)) {
          S.scanError = `frames are not updating (document.hidden=${document.hidden}). Make the browser pane visible (Cmd/Ctrl+Shift+B) and re-run, or use the local-file route.`;
          break;
        }
      }
      S._scanDone = true;
    })();
    return 'scanning';
  };
  S.scanStatus = () => ({ done: !!S._scanDone, n: S.scanRows?.length || 0, error: S.scanError || null });
  S.cuts = ({ thr = 18 } = {}) => (S.scanRows || []).filter(r => r.D > thr).map(r => [r.t, r.D, r.L]);

  // ---------- contact-sheet overlay (stack vertically for a narrow pane)
  S.sheet = async (times, { cols = 1, cw = 313 } = {}) => {
    const v = V(); v.pause();
    S.closeSheet();
    const ov = document.createElement('div'); ov.id = '__vbr_ov';
    ov.style.cssText = `position:fixed;inset:0;z-index:2147483647;background:#111;display:grid;gap:0;align-content:start;grid-template-columns:repeat(${cols},${cw}px);overflow:auto`;
    document.body.appendChild(ov);
    for (const t of times) {
      await seek(t);
      const wrap = document.createElement('div'); wrap.style.position = 'relative';
      const c = document.createElement('canvas'); c.width = cw; c.height = Math.round(cw * 9 / 16);
      c.style.display = 'block'; c.style.borderBottom = '1px solid #444';
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const l = document.createElement('span'); l.textContent = t.toFixed(2);
      l.style.cssText = 'position:absolute;left:2px;top:2px;background:#000c;color:#ff0;font:bold 11px monospace;padding:1px 3px';
      wrap.append(c, l); ov.appendChild(wrap);
    }
    return { n: times.length, pageHeight: ov.clientHeight, cellHeight: Math.round(cw * 9 / 16) + 1 };
  };
  S.page = i => { const ov = document.getElementById('__vbr_ov'); ov.scrollTop = i * ov.clientHeight; return ov.scrollTop; };
  S.closeSheet = () => document.getElementById('__vbr_ov')?.remove();

  // ---------- holds: sample at 60 Hz; identical consecutive samples = held drawings
  S.holds = ranges => {
    S.holdsResult = null;
    (async () => {
      const v = V(); v.pause(); v.muted = true;
      const W = 128, H = 72, c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      const res = {};
      for (const [a, b] of ranges) {
        let prev = null; const ds = [];
        for (let t = a; t < b && !S._stop; t += 1 / 60) {
          await seek(t); x.drawImage(v, 0, 0, W, H);
          const d = x.getImageData(0, 0, W, H).data;
          if (prev) { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]); ds.push(+(s / (W * H)).toFixed(1)); }
          prev = d;
        }
        res[`${a}-${b}`] = ds.join(' ');
      }
      S.holdsResult = res;
    })();
    return 'sampling (read: runs of ~0 between changes; changes every 2 samples = 30 fps on 1s; every 5 ≈ 24 fps on 2s)';
  };

  // ---------- palette (k-means)
  S.palette = async (times, K = 10) => {
    const v = V(); v.pause();
    const W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    const px = [];
    for (const t of times) { await seek(t); x.drawImage(v, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data; for (let i = 0; i < d.length; i += 8) px.push([d[i], d[i + 1], d[i + 2]]); }
    let cen = []; for (let k = 0; k < K; k++) cen.push(px[Math.floor(k * px.length / K + 37) % px.length]);
    for (let it = 0; it < 15; it++) {
      const s = cen.map(() => [0, 0, 0, 0]);
      for (const p of px) { let bi = 0, bd = 1e9; cen.forEach((c2, i) => { const dd = (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2 + (p[2] - c2[2]) ** 2; if (dd < bd) { bd = dd; bi = i; } }); const q = s[bi]; q[0] += p[0]; q[1] += p[1]; q[2] += p[2]; q[3]++; }
      cen = s.map((q, i) => (q[3] ? [q[0] / q[3], q[1] / q[3], q[2] / q[3], q[3]] : cen[i]));
    }
    const hex = c2 => '#' + c2.slice(0, 3).map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
    return cen.sort((a, b) => (b[3] || 0) - (a[3] || 0)).map(c2 => `${hex(c2)} ${((c2[3] || 0) / px.length * 100).toFixed(1)}%`);
  };

  // ---------- audio capture on the audio thread (immune to background-tab throttling)
  S.captureAudio = async () => {
    const v = V(); v.pause(); v.loop = false;
    const ctx = S._ac || (S._ac = new AudioContext());
    if (!S._src) S._src = ctx.createMediaElementSource(v);
    const sp = ctx.createScriptProcessor(4096, 2, 1), g = ctx.createGain(); g.gain.value = 0;
    S.pcm = { chunks: [], done: false, sr: ctx.sampleRate };
    sp.onaudioprocess = e => {
      if (v.paused || S.pcm.done) return;
      const L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.getChannelData(1);
      const m = new Float32Array(L.length); for (let i = 0; i < L.length; i++) m[i] = (L[i] + R[i]) / 2;
      S.pcm.chunks.push(m);
    };
    S._src.disconnect(); S._src.connect(sp); sp.connect(g); g.connect(ctx.destination);
    await ctx.resume();
    v.muted = false; v.volume = 1;
    v.addEventListener('timeupdate', () => { if (v.currentTime > v.duration - 0.08) { S.pcm.done = true; v.pause(); } });
    v.addEventListener('ended', () => { S.pcm.done = true; }, { once: true });
    await seek(0);
    await v.play();
    return `capturing ${v.duration.toFixed(1)}s in real time; poll __vbr.audioStatus()`;
  };
  S.audioStatus = () => ({ done: !!S.pcm?.done, seconds: S.pcm ? +(S.pcm.chunks.length * 4096 / S.pcm.sr).toFixed(1) : 0 });

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let l = 2; l <= n; l <<= 1) {
      const a = -2 * Math.PI / l, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += l) {
        let cr = 1, ci = 0;
        for (let k = 0; k < l / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + l / 2] * cr - im[i + k + l / 2] * ci, vi = re[i + k + l / 2] * ci + im[i + k + l / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + l / 2] = ur - vr; im[i + k + l / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function spectra(x, sr, N, H) {
    const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const out = [];
    for (let s = 0; s + N <= x.length; s += H) {
      const re = new Float32Array(N), im = new Float32Array(N);
      for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
      fft(re, im);
      const mag = new Float32Array(N / 2);
      for (let k = 1; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      out.push({ t: s / sr, mag });
    }
    return out;
  }
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const corr = (a, b) => { const ma = a.reduce((s, v) => s + v) / 12, mb = b.reduce((s, v) => s + v) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };

  S.analyzeAudio = ({ from = 0, to = Infinity } = {}) => {
    const P = S.pcm; if (!P?.chunks.length) return 'no audio captured';
    const x = new Float32Array(P.chunks.length * 4096); P.chunks.forEach((c, i) => x.set(c, i * 4096));
    const sr = P.sr, N = 2048, H = Math.round(sr * 0.01), bin = sr / N;
    const inRange = t => t >= from && t < to;
    const F = spectra(x, sr, N, H);
    let prev = null;
    const rows = F.map(({ t, mag }) => {
      let tot = 0, cen = 0, flux = 0; const b = [0, 0, 0, 0, 0];
      for (let k = 1; k < N / 2; k++) {
        const m = mag[k], f = k * bin, p = m * m; tot += m; cen += m * f;
        if (f < 80) b[0] += p; else if (f < 250) b[1] += p; else if (f < 1000) b[2] += p; else if (f < 4000) b[3] += p; else b[4] += p;
        if (prev) { const d = Math.log1p(m) - Math.log1p(prev[k]); if (d > 0) flux += d; }
      }
      prev = mag;
      return { t, cen: cen / (tot || 1), b: b.map(v => 10 * Math.log10(v + 1e-12)), flux };
    });
    // RMS per 0.25 s
    const hop = Math.round(sr * 0.25), trace = [];
    for (let i = 0; i < x.length; i += hop) { let e = 0, n = 0; for (let j = i; j < Math.min(x.length, i + hop); j++) { e += x[j] * x[j]; n++; } trace.push(+(10 * Math.log10(e / n + 1e-12)).toFixed(0)); }
    // onsets (adaptive peak picking on flux)
    const fl = rows.map(r => r.flux), onsets = [];
    for (let i = 3; i < fl.length - 3; i++) {
      const loc = fl.slice(Math.max(0, i - 30), i + 30).sort((a, b) => a - b), med = loc[loc.length >> 1];
      if (fl[i] > med * 1.6 + 15 && fl[i] >= Math.max(...fl.slice(i - 3, i + 4))) onsets.push(+rows[i].t.toFixed(2));
    }
    // tempo: autocorrelation of flux over 60-200 BPM, inside the music range
    const flr = fl.filter((_, i) => inRange(rows[i].t));
    const fr = 1 / 0.01, m = flr.reduce((a, b) => a + b) / flr.length, z = flr.map(v => v - m), ac = [];
    for (let lag = Math.floor(fr * 60 / 200); lag <= Math.ceil(fr * 60 / 60); lag++) { let s = 0; for (let i = 0; i + lag < z.length; i++) s += z[i] * z[i + lag]; ac.push([lag, s]); }
    ac.sort((a, b) => b[1] - a[1]);
    const tempos = []; for (const [lag] of ac) { const bpm = +(60 * fr / lag).toFixed(1); if (tempos.every(t => Math.abs(t - bpm) > 3)) tempos.push(bpm); if (tempos.length === 4) break; }
    // tonal center: ~1.5 Hz bins (32k FFT), spectral peaks only, power-weighted; bass (<300 Hz) is
    // the most reliable root. (Short FFTs misplace low notes by a semitone.)
    const xs = x.subarray(Math.floor(from * sr), Math.min(x.length, Math.floor((to === Infinity ? x.length / sr : to) * sr)));
    const NN = 32768, cb = sr / NN, lo = new Array(12).fill(0), hi = new Array(12).fill(0);
    for (const { mag } of spectra(xs, sr, NN, NN / 4)) {
      const k0 = Math.floor(55 / cb), k1 = Math.floor(2000 / cb);
      const sorted = Array.from(mag.subarray(k0, k1)).sort((a, b) => a - b), med = sorted[sorted.length >> 1];
      for (let k = k0; k < k1; k++) {
        const v = mag[k]; if (!(v > mag[k - 1] && v >= mag[k + 1] && v > med * 6)) continue;
        const f = k * cb, pc = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12;
        (f < 300 ? lo : hi)[pc] += v * v;
      }
    }
    const nrm = a => { const mx = Math.max(...a) || 1; return a.map(v => v / mx); };
    const lon = nrm(lo), hin = nrm(hi), chroma = lon.map((v, i) => 0.6 * v + 0.4 * hin[i]);
    const keys = [];
    for (let i = 0; i < 12; i++) for (const [mode, prof] of [['major', MAJ], ['minor', MIN]]) keys.push([corr(chroma, prof.map((_, j) => prof[(j - i + 12) % 12])), `${NOTES[i]} ${mode}`]);
    keys.sort((a, b) => b[0] - a[0]);
    // per-0.25 s band summary (sub, low, mid, hi-mid, hi) + centroid
    const sum = [];
    for (let t = 0; t < x.length / sr; t += 0.25) {
      const fs = rows.filter(r => r.t >= t && r.t < t + 0.25); if (!fs.length) continue;
      const avg = k => fs.reduce((a, r) => a + r.b[k], 0) / fs.length;
      sum.push(`${t.toFixed(2)} c${Math.round(fs.reduce((a, r) => a + r.cen, 0) / fs.length)} [${[0, 1, 2, 3, 4].map(k => Math.round(avg(k))).join(' ')}]`);
    }
    return {
      seconds: +(x.length / sr).toFixed(2),
      tempo: tempos, bassCenter: NOTES[lon.indexOf(1)], keys: keys.slice(0, 3).map(([r, k]) => `${k} ${r.toFixed(2)}`),
      bassPitchClasses: NOTES.map((n, i) => `${n}:${lon[i].toFixed(2)}`).join(' '),
      onsets, rmsPer025: trace.join(' '),
      bandsPer025: 'time c<centroid Hz> [sub<80 low mid hi-mid hi] dB:\n' + sum.join('\n'),
    };
  };
  return 'installed window.__vbr';
})();
