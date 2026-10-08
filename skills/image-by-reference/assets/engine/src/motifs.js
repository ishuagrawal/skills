// Composite motifs for flat, stencil and print styles (screenprint, poster, riso, woodblock,
// cut paper). Each is a recipe of the reference-style marks in draw.js, printed through
// env.ink so every ink keeps its own surface. Tune every number against the reference's crops;
// none of these is a default look. All coordinates are design units.
import { TAU, rng, lerp, clamp, noise } from './core.js';
import { path, resample, spear, ellipse, rough, stencil, offset, norm, inPoly, distTo, crescent, scatter, lune } from './draw.js';

const oval = (cx, cy, rx, ry, rot, seed, amp = 0.5) => rough(resample(ellipse(cx, cy, rx, ry, 40, rot), 1.6, true), { amp, scale: 4, jitter: 0.35, seed });

// A stencil-cut spear (tapered sliver). The base mark for sky bands, water glints, slope streaks.
export const spearShape = (x, y, len, w, o, seed) => path(stencil(spear(x, y, len, w, o), seed, Math.min(0.55, w * 0.08)));

// Billowing mass (cloud, smoke plume, spray, foliage clump) lit from one side:
//   body  closed outline of the whole mass        top   open line along the lit edge
//   term  open line where light turns to shadow   light unit-ish vector toward the light
// Prints: the body in `base`; a lit cap in `lit` with a scalloped edge (big billows + small
// scallops), lumpy lobes hanging over the terminator and shadow pockets ("birds") along internal
// billow tiers; wing crescents scattered over the shadow side (large and thick near the light,
// small and thin deeper in); optional thin rim wings in `rim` and deeper-shadow wings in `deep`.
// Regularity is the failure mode: rows of equal crescents read as fish scales, isolated round
// ones as moons. Keep sizes varied and spacing uneven.
export function billow(ink, { body, top, term, light, seed = 1, base, lit, rim, deep, frill = 7, hang = 30, depth = 180, wingMax = 30, wingMin = 9, wings = 60, pockets = 18, skipBody = false, rimCount = 0.5 }) {
  const away = norm([-light[0], -light[1]]), toward = [-away[0], -away[1]];
  const rot = Math.atan2(away[1], away[0]) + Math.PI / 2;
  const r = rng(seed);
  const wing = (l, x, y, rx, ry, dir, k, s, skew) => { const L = crescent(x, y, rx, ry, dir, k, { seed: s, skew }); if (L.length > 3) l.fill(path(stencil(L, s, Math.min(1.1, 0.3 + rx * 0.03)))); };
  const bodyPath = path(stencil(body, seed + 1, 0.6));
  if (!skipBody) ink(base, l => {
    l.fill(bodyPath);
    for (const [x, y] of resample(body, frill * 1.5, true)) { l.beginPath(); l.arc(x, y, frill * (0.6 + r() * 0.7), 0, TAU); l.fill(); }
  }, { seed: seed + 2 });
  const lobes = resample(term, hang * 0.8, false).map(([x, y], i) => {
    const big = r() < 0.35 ? 1.6 : 1;
    return { x: x + away[0] * hang * (0.1 + r() * 0.4) * big, y: y + away[1] * hang * (0.1 + r() * 0.4) * big, rx: hang * (0.6 + r() * 0.7) * big, ry: hang * (0.45 + r() * 0.35) * big, i };
  });
  const cap = [...top, ...[...term].reverse()];
  ink(lit, l => {
    l.fill(path(stencil(cap, seed + 3, 0.6)));
    for (const [x, y] of resample(top, frill * 4, false)) if (r() < 0.7) l.fill(path(oval(x + away[0] * frill, y + away[1] * frill, frill * (1.4 + r() * 1.6), frill * (1.2 + r() * 1.2), rot, seed + (x | 0), 0.6)));
    for (const [x, y] of resample(top, frill * 1.3, false)) { l.beginPath(); l.arc(x + (r() - 0.5) * 4 - away[0] * frill * 0.6, y + (r() - 0.5) * 4 - away[1] * frill * 0.6, frill * (0.45 + Math.pow(r(), 2) * 0.8), 0, TAU); l.fill(); }
    lobes.forEach(o => l.fill(path(oval(o.x, o.y, o.rx, o.ry, rot + (r() - 0.5) * 0.4, seed + 10 + o.i, 0.9))));
    l.globalCompositeOperation = 'destination-out';
    let pi = 0;
    [hang * 1.4, hang * 2.6, hang * 3.8].forEach((d, t) => {
      resample(offset(top, away[0] * d, away[1] * d), hang * (0.9 + t * 0.2), false).forEach(([x, y]) => {
        if (!inPoly(cap, x, y) || r() < 0.4 || pi >= pockets) return;
        const s = hang * (0.3 + r() * 0.45), i = pi++;
        wing(l, x, y, s, s * 0.62, toward, 0.36 + r() * 0.12, seed + 40 + i, 0.5);
        if (r() < 0.55) wing(l, x + s * 1.05 * Math.cos(rot), y + s * 1.05 * Math.sin(rot), s * 0.8, s * 0.55, toward, 0.4, seed + 140 + i, 0.5);
      });
    });
    l.globalCompositeOperation = 'source-over';
    scatter(body, wings, seed + 50, (x, y) => lerp(wingMax, wingMin, clamp(distTo(term, x, y) / depth)) * 1.5, cap).forEach(([x, y, s], i) => {
      const d = clamp(distTo(term, x, y) / depth);
      if (d >= 1 || r() < d * 0.5) return;
      const rx = (s / 1.5) * (0.7 + r() * 0.6);
      wing(l, x, y, rx, rx * (0.42 + r() * 0.15), away, lerp(0.5, 0.18, d) * (0.75 + r() * 0.5), seed + 200 + i, 0.35);
    });
  }, { seed: seed + 4 });
  if (rim) ink(rim, l => {
    lobes.forEach(o => { if (r() < rimCount) wing(l, o.x + away[0] * o.ry * 0.9, o.y + away[1] * o.ry * 0.9, o.rx * 0.6, o.ry * 0.45, away, 0.22, seed + 400 + o.i, 0.35); });
    scatter(body, Math.round(wings * 0.35), seed + 60, () => wingMax * 1.6, cap).forEach(([x, y], i) => {
      const d = clamp(distTo(term, x, y) / depth);
      if (d > 0.8) return;
      const s = lerp(wingMax * 0.8, wingMin, d) * (0.6 + r() * 0.6);
      wing(l, x, y, s, s * 0.32, away, 0.24, seed + 500 + i, 0.35);
    });
  }, { seed: seed + 5 });
  if (deep) ink(deep, l => {
    l.save(); l.clip(bodyPath);
    scatter(body, Math.round(wings * 0.4), seed + 70, () => wingMax * 1.4, cap).forEach(([x, y], i) => {
      const d = clamp(distTo(term, x, y) / depth);
      if (d < 0.35) return;
      const s = lerp(wingMax, wingMin, d) * (0.7 + r() * 0.6);
      wing(l, x, y, s, s * 0.4, toward, 0.5, seed + 600 + i, 0.35);
    });
    l.restore();
  }, { seed: seed + 6 });
}

// Interlocking streaks along a direction field, clipped to a shape: how flat print styles model
// a slope, rock face, snowfield or hillside (light planes in one ink, gullies in another).
//   clip  Path2D                     box [x0, y0, x1, y1] where streaks start
//   angle (x, y) => radians          the fall line / grain direction at that point
export function ribbons(ink, color, { clip, box, angle, n = 50, w = [6, 16], len = [60, 200], seed = 1, place = null, inkOpts = {} }) {
  ink(color, l => {
    l.save(); if (clip) l.clip(clip);
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const [x, y] = place ? place(r) : [lerp(box[0], box[2], r()), lerp(box[1], box[3], r())];
      l.fill(spearShape(x, y, lerp(len[0], len[1], r()), lerp(w[0], w[1], r()), { ang: angle(x, y), head: 0.15 + r() * 0.4, bend: (r() - 0.5) * 0.04 }, seed + i));
    }
    l.restore();
  }, { seed, ...inkOpts });
}

// A band where two inks interlock through horizontal spears (sky strata, water, mist):
// `edge(x)` is the boundary; spears of `up` reach above it, spears of `down` reach below.
export function interlock(ink, { up, down, edge, x0, x1, reach = 130, n = 120, w = [3, 14], len = [50, 280], seed = 1, keep = () => true, inkOpts = {} }) {
  const r = rng(seed);
  const band = (color, dir, s0) => ink(color, l => {
    for (let i = 0; i < n; i++) {
      const x = x0 - 60 + r() * (x1 - x0 + 60), d = Math.pow(r(), 1.3);
      const y = edge(x + 60) + dir * (4 + d * reach);
      const L = lerp(len[1], len[0], d) * (0.45 + 0.8 * r()), W = lerp(w[1], w[0], d) * (0.55 + 0.7 * r());
      if (!keep(x, y, L)) continue;
      l.fill(spearShape(x, y, L, W, { head: 0.15 + 0.6 * r(), ang: (r() - 0.5) * 0.03 }, s0 + i));
    }
  }, { seed: s0, ...inkOpts });
  band(up, -1, seed);
  band(down, 1, seed + 1000);
}

// ---------------------------------------------------------------- form-first motifs
// Build the object's FORM first (lobes, facets, a wave profile, a fog layer), then render that
// form in the style's inks. Scattering style marks as texture does not describe a form: viewers
// read it as noise (see references/style-techniques.md §5).

// Lobes for a cumulus mass: lobes strung along the outline (they make the scalloped silhouette)
// plus larger interior lobes. Lobes whose center falls below `baseY(x)` are dropped (flat base).
export function cloudLobes(outline, { rMin = 14, rMax = 34, seed = 1, interior = 0.6, baseY = null } = {}) {
  const r = rng(seed), out = [];
  const [cx, cy] = outline.reduce((a, p) => [a[0] + p[0] / outline.length, a[1] + p[1] / outline.length], [0, 0]);
  for (const [x, y] of resample(outline, (rMin + rMax) * 0.45, true)) {
    const R = lerp(rMin, rMax, r()), d = Math.hypot(cx - x, cy - y) || 1;
    const lx = x + ((cx - x) / d) * R * 0.55, ly = y + ((cy - y) / d) * R * 0.55;
    if (baseY && ly > baseY(lx) - R * 0.2) continue;
    out.push({ x: lx, y: ly, r: R, edge: true });
  }
  scatter(outline, Math.round(80 * interior), seed + 7, () => rMax * 1.5).forEach(([x, y]) => {
    if (baseY && y > baseY(x) - rMax * 0.5) return;
    out.push({ x, y, r: rMax * (0.8 + r() * 0.6), edge: false });
  });
  return out.sort((a, b) => a.y - b.y);
}

// Cumulus: lobes drawn top to bottom so each lower lobe covers the underside of the ones above,
// leaving their lit tops showing (the stacked-cauliflower read). How much of each lobe is lit
// depends on which side of the mass it sits: lobes facing the light are mostly lit and merge into
// one bright mass; lobes on the far side keep only a rim. Each ink layer erases the current lobe
// before adding its crescent, so occlusion is right in every ink.
//   light   vector toward the light       shadow/mid/lit/rim   inks (mid and rim optional)
//   lit: [k on the shadow side, k on the light side] as fractions of the lobe radius; mid: same
//   squash  lobe height/width (0.3 for flat fog or stratus mounds)   clip  optional Path2D
export function cumulus(ink, { lobes, light, shadow, mid = null, lit, rim = null, kLit = [0.25, 1.35], kMid = [0.6, 1.8], kRim = 0.14, squash = 0.86, clip = null, seed = 1, inkOpts = {} }) {
  const L = norm(light), away = [-L[0], -L[1]];
  const cx = lobes.reduce((a, o) => a + o.x, 0) / lobes.length, cy = lobes.reduce((a, o) => a + o.y, 0) / lobes.length;
  const spread = Math.max(...lobes.map(o => Math.hypot(o.x - cx, o.y - cy))) || 1;
  const facing = o => clamp(0.5 + 0.5 * (((o.x - cx) * L[0] + (o.y - cy) * L[1]) / spread) * 1.6);
  const shape = (o, dx = 0, dy = 0, s = 0) => rough(resample(ellipse(o.x + dx, o.y + dy, o.r * (1 + s), o.r * squash * (1 + s), 36), 1.6, true), { amp: Math.min(1.2, o.r * 0.03), scale: 4, seed: seed + Math.round(o.x * 7 + o.y), jitter: 0.3 });
  const crescentOf = (o, k) => lune(shape(o), shape(o, away[0] * k * o.r, away[1] * k * o.r * squash, 0.03));
  const layer = (color, kOf, only = () => true) => ink(color, l => {
    l.save(); if (clip) l.clip(clip);
    for (const o of lobes) {
      l.globalCompositeOperation = 'destination-out';
      l.fill(path(shape(o)));
      l.globalCompositeOperation = 'source-over';
      if (!only(o)) continue;
      const C = crescentOf(o, kOf(o));
      if (C.length > 3) l.fill(path(C));
    }
    l.restore();
  }, { seed: seed + color.length * 13, ...inkOpts });
  ink(shadow, l => { l.save(); if (clip) l.clip(clip); lobes.forEach(o => l.fill(path(shape(o)))); l.restore(); }, { seed, ...inkOpts });
  if (mid) layer(mid, o => lerp(kMid[0], kMid[1], facing(o)));
  layer(lit, o => lerp(kLit[0], kLit[1], facing(o)), o => facing(o) > 0.15);
  if (rim) layer(rim, () => kRim, o => o.edge && facing(o) > 0.45);
}

// Jointed rock: split a polygon into blocks with near-vertical joints and near-horizontal bedding
// (a little tilt and offset, like masonry laid by nature). Returns quads (clipped to the poly).
function clipHalf(poly, nx, ny, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const polyArea = p => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
const centroid = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
export function blocks(poly, { w = 60, h = 34, tilt = 0.12, seed = 1, bedding = 0 } = {}) {
  const r = rng(seed), [x0, y0, x1, y1] = [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))];
  const out = [];
  for (let y = y0, row = 0; y < y1; row++) {
    const rh = h * (0.6 + r() * 0.8), a0 = bedding + (r() - 0.5) * tilt, a1 = bedding + (r() - 0.5) * tilt;
    let band = clipHalf(poly, Math.sin(a0), -Math.cos(a0), Math.sin(a0) * x0 - Math.cos(a0) * y);      // below the top line
    band = clipHalf(band, -Math.sin(a1), Math.cos(a1), -(Math.sin(a1) * x0 - Math.cos(a1) * (y + rh)));   // above the bottom line
    let x = x0 - r() * w;
    while (x < x1 && band.length >= 3) {
      const bw = w * (0.5 + r()), j0 = (r() - 0.5) * tilt * 2, j1 = (r() - 0.5) * tilt * 2;
      let b = clipHalf(band, -Math.cos(j0), -Math.sin(j0), -(Math.cos(j0) * x + Math.sin(j0) * (y + rh / 2)));
      b = clipHalf(b, Math.cos(j1), Math.sin(j1), Math.cos(j1) * (x + bw) + Math.sin(j1) * (y + rh / 2));
      if (b.length >= 3 && polyArea(b) > 6) out.push({ pts: b, row, x, y, w: bw, h: rh });
      x += bw;
    }
    y += rh;
  }
  return out;
}
// Shade a block: its face value from the macro surface facing (normalAt) vs the light plus jitter,
// and two edge strips: a lit ledge on the light-facing top/side, a shadow under its lower edge.
export function shadeBlocks(list, { light, normalAt = () => -Math.PI / 2, jitter = 0.8, seed = 1 }) {
  const r = rng(seed), la = Math.atan2(light[1], light[0]);
  return list.map(b => { const [cx, cy] = centroid(b.pts), a = normalAt(cx, cy) + (r() - 0.5) * jitter; return { ...b, c: [cx, cy], v: Math.cos(a - la), ledge: 0.18 + r() * 0.2, under: 0.1 + r() * 0.12 }; });
}
// strip of a block along its top edge (frac of its height), for lit ledges / undercut shadows
export function blockStrip(b, frac, where = 'top') {
  const ys = b.pts.map(p => p[1]), top = Math.min(...ys), bot = Math.max(...ys), hgt = bot - top;
  return where === 'top' ? clipHalf(b.pts, 0, 1, top + hgt * frac) : clipHalf(b.pts, 0, -1, -(bot - hgt * frac));
}
export const facetCentroid = centroid;

// Foam lace: a foam area perforated by irregular holes into a network of lines, the way foam
// spreads over water after a wave. Hole sizes follow a long-tailed distribution and holes are
// stretched along the water (squash < 1), so the network reads as foam, not polka dots.
export function lace(l, poly, { cell = 12, squash = 0.4, seed = 1, fray = 1.8, open = 1 } = {}) {
  const r = rng(seed);
  l.fill(path(stencil(poly, seed, 0.8)));
  l.globalCompositeOperation = 'destination-out';
  const edge = resample(poly, cell, true);
  scatter(poly, 500, seed + 1, () => cell * (0.7 + r() * 0.9)).forEach(([x, y], i) => {
    const near = Math.min(...edge.map(([a, b]) => Math.hypot(a - x, b - y))) < cell * 2;
    const rx = cell * open * (0.25 + Math.pow(r(), 2.2) * 1.1) * (near ? fray : 1);
    const pts = resample(ellipse(x, y, rx, rx * squash * (0.6 + r() * 0.8), 18, (r() - 0.5) * 0.4), 1.2, true);
    l.fill(path(rough(pts, { amp: rx * 0.22, scale: 2.5, seed: seed + i })));
  });
  l.globalCompositeOperation = 'source-over';
}

// Fog bank: a low blanket whose top rolls in soft, wide mounds (flat cumulus lobes, squash ≈ 0.3),
// lit on the sun side, frayed into wisps along the top and pouring over ridges in tongues
// [{ x, w, drop, ang }]. Fog is wide and low; tall round lobes read as cloud or smoke instead.
export function fogBank(ink, { x0, x1, top, bottom, body, mid = null, lit, seed = 1, wisps = 40, tongues = [], mound = 40, light = [0.6, -0.8], inkOpts = {} }) {
  const r = rng(seed);
  const lobes = [];
  for (let x = x0; x <= x1; x += mound * (0.7 + r() * 0.6)) {
    const R = mound * (0.8 + r() * 0.7);
    lobes.push({ x, y: top(x) + R * 0.3, r: R, edge: true });
    lobes.push({ x: x + mound * 0.4, y: top(x) + R * 0.3 + mound * 0.45, r: R * 1.1, edge: false });
  }
  lobes.sort((a, b) => a.y - b.y);
  const B = [];
  for (let x = x0; x <= x1; x += 8) B.push([x, bottom(x)]);
  ink(body, l => {
    const T = [];
    for (let x = x0; x <= x1; x += 8) T.push([x, top(x) + mound * 0.35]);
    l.fill(path(stencil([...T, ...B.reverse()], seed, 0.6)));
    tongues.forEach(({ x, w, drop, ang = 0.3 }, i) => {
      const y0 = top(x) + mound * 0.3, pts = [[x - w / 2, y0]];
      for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([x - w / 2 + w * t + Math.sin(t * Math.PI) * drop * Math.sin(ang), y0 + Math.pow(Math.sin(t * Math.PI), 0.7) * drop * (0.8 + 0.2 * noise(t * 6, seed + i))]); }
      l.fill(path(stencil(pts, seed + 10 + i, 0.8)));
      for (let j = 0; j < 7; j++) l.fill(spearShape(x - w * 0.4 + r() * w * 0.8, y0 + drop * (0.5 + r() * 0.5), 30 + r() * 60, 3 + r() * 5, { ang: Math.PI / 2 - 0.3 + r() * 0.6, head: 0.15 }, seed + 20 + i * 10 + j));
    });
  }, { seed, ...inkOpts });
  cumulus(ink, { lobes, light, shadow: body, mid, lit, squash: 0.32, kLit: [0.35, 1.2], kMid: [0.7, 1.7], seed: seed + 50, inkOpts });
  ink(lit, l => {
    for (let i = 0; i < wisps; i++) {
      const x = lerp(x0, x1, r()), len = 40 + r() * 170;
      l.fill(spearShape(x - len / 2, top(x) - 4 - r() * 20, len, 2 + r() * 5, { head: 0.3 + r() * 0.4 }, seed + 400 + i));
    }
  }, { seed: seed + 400, ...inkOpts });
}
