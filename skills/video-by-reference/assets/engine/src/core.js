// Timing, easing, randomness. Everything is a pure function of time so any frame renders identically.
export const W = 1920, H = 1080, FPS = 24;
export const BPM = 160, BEAT = 60 / BPM, BAR = BEAT * 4; // 9 frames per beat at 24fps

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const mix2 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
export const TAU = Math.PI * 2;

export const ease = {
  lin: t => t,
  in: t => t * t * t,
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  in2: t => t * t,
  out2: t => 1 - (1 - t) * (1 - t),
  inOut2: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t, s = 1.70158) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2)),
  inBack: (t, s = 1.70158) => (t <= 0 ? 0 : t >= 1 ? 1 : (s + 1) * t * t * t - s * t * t),
  outElastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

// progress through [a,b] with easing
export const seg = (t, a, b, f = ease.inOut) => f(inv(a, b, t));

// Hold drawings for n frames ("on twos" = n 2) so character/FX motion reads hand-drawn
export const onN = (t, n = 2) => Math.floor(t * FPS / n + 1e-6) * n / FPS;
export const frameOf = t => Math.floor(t * FPS + 1e-6);

// Keyframes: [[time, value, easeIntoThisKey?], ...]; values may be numbers or arrays
export function key(t, list) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1, e] = list[i];
    if (t <= t1) {
      const [t0, v0] = list[i - 1];
      const p = (e || ease.inOut)(inv(t0, t1, t));
      return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], p)) : lerp(v0, v1, p);
    }
  }
  return list[list.length - 1][1];
}

// deterministic hash -> [0,1)
export function hash(n) {
  n = (n | 0) ^ 0x9e3779b9;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export const hash2 = (a, b) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// smooth 1D value noise in [-1,1]
export function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed) * 2 - 1, hash2(i + 1, seed) * 2 - 1, u);
}
// stepped (held-on-twos) camera shake, amplitude in px
export function shake(t, amp, freq = 12, seed = 1) {
  const ts = onN(t, 2);
  return [noise(ts * freq, seed) * amp, noise(ts * freq, seed + 99) * amp, noise(ts * freq, seed + 7) * amp * 0.002];
}
// decaying impulse shake triggered at time t0
export function hit(t, t0, amp, dur = 0.5) {
  if (t < t0 || t > t0 + dur) return 0;
  return amp * Math.pow(1 - (t - t0) / dur, 2);
}
