// 2D shape kit (for shape-based styles: flat/graphic, cel fills, cut-out, motion graphics):
// shapes, crescent shadow/rim bands, glows, light cones, speed lines, type. Extend or replace it
// for other rendering models (see references/style-techniques.md).
import { P, rgba } from './palette.js';
import { TAU, hash, rng } from './core.js';

export const rectP = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
export const rrP = (x, y, w, h, r) => { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; };
export const circP = (x, y, r) => { const p = new Path2D(); p.arc(x, y, Math.max(0.01, r), 0, TAU); return p; };
export const ellP = (x, y, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); return p; };
export function polyP(pts, close = true) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}
// closed smooth blob through points (quadratic midpoints)
export function blobP(pts) {
  const p = new Path2D();
  const n = pts.length;
  const mid = i => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  const m0 = mid(0);
  p.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) {
    const c = pts[i % n], m = mid(i);
    p.quadraticCurveTo(c[0], c[1], m[0], m[1]);
  }
  p.closePath();
  return p;
}
export function union(...paths) { const p = new Path2D(); paths.forEach(q => q && p.addPath(q)); return p; }
export function moved(p, dx, dy, s = 1) { const q = new Path2D(); q.addPath(p, new DOMMatrix([s, 0, 0, s, dx, dy])); return q; }

export function fill(ctx, p, c) { ctx.fillStyle = c; ctx.fill(p); }

// Crescent band inside `p` on the side the vector (dx,dy) points to. For simple (non self-overlapping) paths.
export function crescent(ctx, p, color, dx, dy) {
  ctx.save();
  ctx.clip(p);
  const q = new Path2D();
  q.addPath(p);
  q.addPath(p, new DOMMatrix([1, 0, 0, 1, -dx, -dy]));
  ctx.fillStyle = color;
  ctx.fill(q, 'evenodd');
  ctx.restore();
}

// Same, but robust for paths built from overlapping pieces (uses an offscreen layer).
let layer = null;
export function crescentX(ctx, p, color, dx, dy) {
  const c = ctx.canvas;
  if (!layer || layer.width !== c.width || layer.height !== c.height) {
    layer = new OffscreenCanvas(c.width, c.height);
  }
  const l = layer.getContext('2d');
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, layer.width, layer.height);
  // the band = p minus p shifted against (dx,dy)
  l.setTransform(ctx.getTransform());
  l.globalCompositeOperation = 'source-over';
  l.fillStyle = color;
  l.fill(p);
  l.globalCompositeOperation = 'destination-out';
  const q = new Path2D();
  q.addPath(p, new DOMMatrix([1, 0, 0, 1, -dx, -dy]));
  l.fill(q);
  l.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

// Fill + shadow + rim in one go. light: {sh:[color,dx,dy], rim:[color,dx,dy], rim2:[...]}
export function solid(ctx, p, base, light = {}, complex = false) {
  fill(ctx, p, base);
  const cr = complex ? crescentX : crescent;
  if (light.sh) cr(ctx, p, light.sh[0], light.sh[1], light.sh[2]);
  if (light.rim) cr(ctx, p, light.rim[0], light.rim[1], light.rim[2]);
  if (light.rim2) cr(ctx, p, light.rim2[0], light.rim2[1], light.rim2[2]);
}

// soft light glow (additive feel via 'screen')
export function glow(ctx, x, y, r, color, a = 1, op = 'screen') {
  if (r <= 0 || a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = op;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.35, rgba(color, a * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// hard-edged light cone (flat) + soft falloff
export function cone(ctx, x, y, ang, spread, len, color, a = 0.35) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const p = new Path2D();
  p.moveTo(x, y);
  p.arc(x, y, len, ang - spread, ang + spread);
  p.closePath();
  const g = ctx.createRadialGradient(x, y, 0, x, y, len);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.7, rgba(color, a * 0.6));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fill(p);
  ctx.restore();
}

// Radial speed lines (anime impact frame). Wedges from rIn..rOut around (cx,cy).
export function speedLines(ctx, cx, cy, rIn, rOut, n, seed, color, maxW = 0.04, alpha = 1) {
  const r = rng(seed);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const w = (0.2 + r() * 0.8) * maxW;
    const ri = rIn * (0.8 + r() * 0.6);
    const ro = rOut * (0.85 + r() * 0.3);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
    ctx.lineTo(cx + Math.cos(a - w) * ro, cy + Math.sin(a - w) * ro);
    ctx.lineTo(cx + Math.cos(a + w) * ro, cy + Math.sin(a + w) * ro);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Parallel motion lines (horizontal-ish streaks) for fast moves
export function streaks(ctx, x, y, w, h, n, seed, color, ang = 0, alpha = 1) {
  const r = rng(seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const yy = (r() - 0.5) * h;
    const len = w * (0.3 + r() * 0.7);
    const xx = (r() - 0.5) * (w - len);
    const th = 2 + r() * 5;
    ctx.beginPath();
    ctx.moveTo(xx - len / 2, yy);
    ctx.lineTo(xx + len / 2, yy - th / 2);
    ctx.lineTo(xx + len / 2, yy + th / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Type. family: 'display' | 'mono' | 'slab' | css family
const FAM = {
  display: '"Futura", "Avenir Next Condensed", "Impact", sans-serif',
  cond: '"Avenir Next Condensed", "DIN Condensed", "Futura", sans-serif',
  mono: '"SF Mono", ui-monospace, "Menlo", monospace',
  slab: '"Rockwell", "Futura", serif',
  din: '"DIN Condensed", "Avenir Next Condensed", sans-serif',
};
export function font(ctx, size, { fam = 'display', weight = 800, italic = false, stretch = 'normal', track = 0 } = {}) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FAM[fam] || fam}`;
  ctx.fontStretch = stretch;
  ctx.letterSpacing = track + 'px';
}
export function text(ctx, s, x, y, color, size, o = {}) {
  font(ctx, size, o);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

// little 4-point sparkle
export function sparkle(ctx, x, y, r, color, rot = 0) {
  if (r <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  const k = 0.18;
  ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * k, -r * k, r, 0);
  ctx.quadraticCurveTo(r * k, r * k, 0, r);
  ctx.quadraticCurveTo(-r * k, r * k, -r, 0);
  ctx.quadraticCurveTo(-r * k, -r * k, 0, -r);
  ctx.fill();
  ctx.restore();
}

// contact shadow
export function contact(ctx, x, y, rx, ry, a = 0.5, color = P.ink) {
  ctx.save();
  ctx.fillStyle = rgba(color, a);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// full-frame flat fill
export function bg(ctx, color, W = 1920, H = 1080) { ctx.fillStyle = color; ctx.fillRect(-W, -H, W * 3, H * 3); }

export { hash };
