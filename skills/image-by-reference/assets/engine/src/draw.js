// Shape kit for stills. Shapes are point arrays first (so they can be smoothed, resampled and
// roughened like a hand-cut stencil, brush or woodblock edge) and become Path2D only to fill.
// All coordinates are design units (see picture.js). Extend or replace this kit to fit the
// reference's rendering model (references/style-techniques.md).
import { TAU, clamp, lerp, rng, fbm1, noise } from './core.js';

// ---------- point lists
export function path(pts, close = true) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}
export function union(...paths) { const p = new Path2D(); paths.flat().forEach(q => q && p.addPath(q)); return p; }
export const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export const ellipse = (cx, cy, rx, ry, n = 48, rot = 0) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * TAU, c = Math.cos(rot), s = Math.sin(rot);
  const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
  return [cx + x * c - y * s, cy + x * s + y * c];
});
export const translate = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
export const scale = (pts, sx, sy = sx, ox = 0, oy = 0) => pts.map(([x, y]) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);

// Catmull-Rom through the points (seg samples per span)
export function catmull(pts, closed = false, seg = 8) {
  const n = pts.length, out = [];
  const P = i => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// evenly spaced points along a polyline (step in design units)
export function resample(pts, step, closed = false) {
  const src = closed ? [...pts, pts[0]] : pts, out = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const [x0, y0] = src[i - 1], [x1, y1] = src[i];
    const L = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d <= L) { const t = d / L; out.push([lerp(x0, x1, t), lerp(y0, y1, t)]); d += step; }
    carry = L - (d - step);
  }
  if (closed) out.pop(); else if (out.length && out[out.length - 1] !== src[src.length - 1]) out.push(src[src.length - 1]);
  return out;
}

// Displace points along their normals: `amp` with wavelength `scale` (fbm) plus per-point
// `jitter` (fraction of amp). Gives the slightly irregular edge of a hand-cut stencil, torn
// paper or a woodblock. Resample first so the edge has enough points.
export function rough(pts, { amp = 1, scale = 20, jitter = 0.3, seed = 1, closed = true, octaves = 3 } = {}) {
  const r = rng(seed), n = pts.length;
  let s = 0;
  return pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const d = amp * (fbm1(s / scale, { seed, octaves }) + (r() - 0.5) * 2 * jitter);
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

// irregular closed blob
export function blob(cx, cy, rx, ry, { n = 32, irr = 0.2, seed = 1, rot = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const k = 1 + irr * noise(i / n * 6, seed) + irr * 0.4 * noise(i / n * 17, seed + 9);
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });
}

// Silhouette line from x0 to x1 through key points [[x,y],...] with midpoint-displacement
// detail; returns the open top edge. Close it with `toBase(edge, yBottom)`.
export function ridge(keys, { detail = 6, amp = 0.35, seed = 1, rough: rr = 0 } = {}) {
  const r = rng(seed);
  let pts = keys.map(p => [...p]);
  let a = amp;
  for (let d = 0; d < detail; d++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      next.push(pts[i], [(x0 + x1) / 2 + (r() - 0.5) * Math.abs(x1 - x0) * 0.2, (y0 + y1) / 2 + (r() - 0.5) * Math.abs(x1 - x0) * a]);
    }
    next.push(pts[pts.length - 1]);
    pts = next; a *= 0.55;
  }
  return rr ? rough(pts, { amp: rr, scale: 8, seed: seed + 3, closed: false }) : pts;
}
export const toBase = (edge, yb) => [...edge, [edge[edge.length - 1][0], yb], [edge[0][0], yb]];

// Tapered sliver ("spear"): pointed at both ends, widest at `head` (0..1 along its length),
// optionally bent. The basic mark of screenprint skies, water reflections and slope streaks.
export function spear(x, y, len, w, { ang = 0, bend = 0, head = 0.35, n = 14, belly = 0 } = {}) {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const prof = t < head ? Math.sin((t / head) * Math.PI / 2) : Math.cos(((t - head) / (1 - head)) * Math.PI / 2);
    const hw = (w / 2) * Math.pow(Math.max(prof, 0), 0.8);
    const cx = t * len, cy = bend * Math.sin(t * Math.PI) * len;
    top.push([cx, cy - hw * (1 - belly)]); bot.push([cx, cy + hw * (1 + belly)]);
  }
  const c = Math.cos(ang), s = Math.sin(ang);
  return [...top, ...bot.reverse()].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}

// Polygon around a polyline whose width goes w0 -> w1 (brush/tapered line)
export function taper(pts, w0, w1, { cap = true } = {}) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const t = n > 1 ? i / (n - 1) : 0;
    const w = lerp(w0, w1, t) / 2 * (cap ? Math.min(1, Math.sin(Math.PI * Math.min(t, 1 - t) * 2 + 0.6)) : 1);
    L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return [...L, ...R.reverse()];
}

// Scalloped edge: circles strung along a contour (cumulus clouds, foam, foliage). Returns Path2D.
export function scallop(pts, { r = 10, rv = 0.4, seed = 1, step = 0.8 } = {}) {
  const R = rng(seed), p = new Path2D();
  p.addPath(path(pts));
  for (const [x, y] of resample(pts, r * step, true)) {
    const rr = r * (1 - rv / 2 + R() * rv);
    p.moveTo(x + rr, y); p.arc(x, y, rr, 0, TAU);
  }
  return p;
}

// stencil edge: resample + rough in one call (hand-cut screen, woodblock, cut paper)
export const stencil = (pts, seed = 1, amp = 0.45, closed = true) => rough(resample(pts, 1.6, closed), { amp, scale: 4, jitter: 0.35, seed, closed });
export const offset = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
export const norm = ([x, y]) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
export const distTo = (line, x, y) => Math.min(...line.map(([a, b]) => Math.hypot(a - x, b - y)));
export function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// A minus B for two closed loops of the same orientation, as ONE polygon. Prefer this to
// clip + even-odd fills: those leave a faint anti-aliased ring along the cut edge, visible at 1:1.
export function lune(A, B) {
  const run = flags => {
    const n = flags.length, s0 = flags.findIndex((f, i) => f && !flags[(i - 1 + n) % n]);
    if (s0 < 0) return flags.every(Boolean) ? flags.map((_, i) => i) : [];
    const idx = [];
    for (let i = 0; i < n && flags[(s0 + i) % n]; i++) idx.push((s0 + i) % n);
    return idx;
  };
  const ra = run(A.map(([x, y]) => !inPoly(B, x, y))), rb = run(B.map(([x, y]) => inPoly(A, x, y)));
  if (!ra.length) return [];
  if (!rb.length) return ra.map(i => A[i]);
  return [...ra.map(i => A[i]), ...rb.reverse().map(i => B[i])];
}

// Lit crescent of an oval lobe: the oval minus itself shifted toward the shadow (`away`, unit
// vector) by k·2ry, nudged sideways by up to `skew`·rx so one horn is longer (a hooked "wing").
// Flat ovals (ry ≈ 0.4–0.6 rx) give pointed wings; round ones give moons. Returns points.
export function crescent(cx, cy, rx, ry, away, k, { seed = 1, skew = 0.35, jitter = 0.5 } = {}) {
  const r = rng(seed);
  const rot = Math.atan2(away[1], away[0]) + Math.PI / 2 + (r() - 0.5) * jitter;
  const side = (r() - 0.5) * 2 * skew * rx, px = Math.cos(rot), py = Math.sin(rot);
  const A = ellipse(cx, cy, rx, ry, 48, rot);
  const B = ellipse(cx + away[0] * k * ry * 2 + px * side, cy + away[1] * k * ry * 2 + py * side, rx * (1.02 + r() * 0.1), ry * (1 + r() * 0.15), 48, rot + (r() - 0.5) * 0.3);
  return lune(A, B);
}

// Points inside `poly` (and outside `exclude`) with a minimum spacing spacing(x, y): even,
// non-gridded placement for marks (crescents, dabs, stars, flowers). Returns [[x, y, s], ...].
export function scatter(poly, n, seed, spacing, exclude = null) {
  const r = rng(seed), out = [];
  const [x0, y0, x1, y1] = bbox(poly);
  for (let t = 0; t < n * 30 && out.length < n; t++) {
    const x = lerp(x0, x1, r()), y = lerp(y0, y1, r());
    if (!inPoly(poly, x, y) || (exclude && inPoly(exclude, x, y))) continue;
    const s = spacing(x, y);
    if (out.some(([a, b, sa]) => Math.hypot(a - x, b - y) < (s + sa) * 0.5)) continue;
    out.push([x, y, s]);
  }
  return out;
}

// ---------- filling
export function fill(ctx, shape, color) {
  ctx.fillStyle = color;
  ctx.fill(shape instanceof Path2D ? shape : path(shape));
}
export const bbox = pts => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};
export function withClip(ctx, shape, fn) {
  ctx.save(); ctx.clip(shape instanceof Path2D ? shape : path(shape)); fn(); ctx.restore();
}

// Parallel strokes clipped to a shape: hatching/engraving/woodcut texture. Value = spacing/width.
export function hatch(ctx, shape, box, { angle = 0.6, spacing = 6, width = 1.2, color = '#000', jitter = 0.2, seed = 1, wobble = 0 } = {}) {
  const r = rng(seed), [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + spacing;
  withClip(ctx, shape, () => {
    ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.fillStyle = color;
    for (let y = -R; y <= R; y += spacing) {
      const yy = y + (r() - 0.5) * spacing * jitter, w = width * (1 + (r() - 0.5) * jitter);
      const line = Array.from({ length: 24 }, (_, i) => [-R + (2 * R * i) / 23, yy + wobble * noise(i * 0.7, seed + y)]);
      ctx.fill(path(taper(line, w, w, { cap: false })));
    }
  });
}

// Dots scattered inside a shape (stipple, speckle, stars, snow)
export function stipple(ctx, shape, box, { count = 200, r = 1, rv = 0.5, color = '#000', seed = 1 } = {}) {
  const R = rng(seed), [x0, y0, x1, y1] = box;
  withClip(ctx, shape, () => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const x = lerp(x0, x1, R()), y = lerp(y0, y1, R()), rr = r * (1 - rv / 2 + R() * rv);
      ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU);
    }
    ctx.fill();
  });
}

// ---------- type
// font: CSS family list; sx: horizontal scale (condense/expand like hand lettering); track: em
export function text(ctx, s, x, y, { size = 40, font = '"Gill Sans", sans-serif', weight = 700, track = 0, align = 'left', color = '#000', sx = 1, base = 'alphabetic' } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${track * size}px`;
  ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillStyle = color;
  ctx.translate(x, y); ctx.scale(sx, 1);
  ctx.fillText(s, 0, 0);
  const w = ctx.measureText(s).width * sx;
  ctx.restore();
  return w;
}
// Fit a line to an exact width by horizontal scaling (poster lettering filling a band)
export function fitText(ctx, s, x, y, width, o = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 700} ${o.size ?? 40}px ${o.font ?? '"Gill Sans", sans-serif'}`;
  ctx.letterSpacing = `${(o.track ?? 0) * (o.size ?? 40)}px`;
  const w = ctx.measureText(s).width - (o.track ?? 0) * (o.size ?? 40);
  ctx.restore();
  return text(ctx, s, x, y, { ...o, sx: width / w });
}
