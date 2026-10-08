// 2D effects (shape-based styles), all analytic functions of (time since spawn) so they scrub
// deterministically. Pass held time (onN) when the style holds drawings on 2s/3s.
import { P, mix, rgba } from './palette.js';
import { circP, ellP, polyP, blobP, fill, solid, crescent, glow, sparkle, text, font, rrP, rectP, speedLines } from './draw.js';
import { TAU, clamp, lerp, rng, hash, ease, inv, noise } from './core.js';

// Cotton-ball smoke/dust puffs bursting outward. dir: angle, spread: radians
export function puffs(ctx, x, y, t, o = {}) {
  const { n = 7, seed = 1, dir = -Math.PI / 2, spread = 1.2, speed = 30, size = 6, life = 0.9, col = P.cream, shCol = '#b9b9d6', grav = -8, drag = 2.2 } = o;
  if (t < 0 || t > life * 1.6) return;
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = dir + (r() - 0.5) * spread * 2;
    const sp = speed * (0.5 + r() * 0.7);
    const delay = r() * 0.12;
    const tt = t - delay;
    if (tt < 0) continue;
    const lf = life * (0.7 + r() * 0.6);
    const p = tt / lf;
    if (p >= 1) continue;
    const d = sp * (1 - Math.exp(-drag * tt)) / drag;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + 0.5 * grav * tt * tt;
    const rr = size * (0.6 + r() * 0.6) * (p < 0.2 ? ease.outBack(p / 0.2) : 1 - ease.in2((p - 0.2) / 0.8) * 0.85);
    const shape = blobP([...Array(7)].map((_, j) => {
      const aa = j / 7 * TAU, rad = rr * (0.85 + 0.25 * hash(i * 31 + j));
      return [px + Math.cos(aa) * rad, py + Math.sin(aa) * rad];
    }));
    fill(ctx, shape, col);
    crescent(ctx, shape, shCol, -rr * 0.25, rr * 0.3);
  }
}

// Sharp spark shards flying out (lemon/cream)
export function sparks(ctx, x, y, t, o = {}) {
  const { n = 14, seed = 3, dir = -Math.PI / 2, spread = Math.PI, speed = 60, len = 3, life = 0.5, col = P.lemon, col2 = P.cream, grav = 60, w = 0.5 } = o;
  if (t < 0) return;
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = dir + (r() - 0.5) * spread * 2;
    const sp = speed * (0.4 + r() * 0.8);
    const lf = life * (0.5 + r() * 0.7);
    if (t > lf) continue;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
    const px = x + vx * t, py = y + vy * t + 0.5 * grav * t * t;
    const vyt = vy + grav * t;
    const ang = Math.atan2(vyt, vx);
    const l = len * (0.5 + r()) * (1 - t / lf);
    const ww = w * (0.6 + r() * 0.8);
    ctx.fillStyle = r() < 0.6 ? col : col2;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l);
    ctx.lineTo(px + Math.cos(ang + 1.57) * ww, py + Math.sin(ang + 1.57) * ww);
    ctx.lineTo(px - Math.cos(ang) * l * 1.6, py - Math.sin(ang) * l * 1.6);
    ctx.lineTo(px + Math.cos(ang - 1.57) * ww, py + Math.sin(ang - 1.57) * ww);
    ctx.closePath();
    ctx.fill();
  }
}

// Jagged lightning bolt between two points (seeded, re-seed per held frame for flicker)
export function bolt(ctx, x0, y0, x1, y1, seed, o = {}) {
  const { segs = 8, jag = 0.18, w = 1.2, col = P.cyan, glowCol = P.cyan, glowA = 0.6, branch = true } = o;
  const r = rng(seed);
  const pts = [[x0, y0]];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  for (let i = 1; i < segs; i++) {
    const tt = i / segs, off = (r() - 0.5) * 2 * jag * L;
    pts.push([x0 + dx * tt + nx * off, y0 + dy * tt + ny * off]);
  }
  pts.push([x1, y1]);
  const draw = (ps, ww) => {
    ctx.beginPath();
    for (let i = 0; i < ps.length; i++) {
      const [px, py] = ps[i];
      const k = ww * (1 - i / ps.length * 0.6);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      ctx.lineWidth = k;
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  glow(ctx, (x0 + x1) / 2, (y0 + y1) / 2, L * 0.7, glowCol, glowA);
  ctx.strokeStyle = col;
  draw(pts, w);
  ctx.strokeStyle = P.cream;
  draw(pts, w * 0.35);
  if (branch) {
    const bi = 2 + Math.floor(r() * (segs - 3));
    const b0 = pts[bi];
    const ba = Math.atan2(dy, dx) + (r() - 0.5) * 2;
    const bl = L * 0.3;
    const bp = [b0, [b0[0] + Math.cos(ba) * bl * 0.5 + (r() - 0.5) * bl * 0.3, b0[1] + Math.sin(ba) * bl * 0.5], [b0[0] + Math.cos(ba) * bl, b0[1] + Math.sin(ba) * bl]];
    ctx.strokeStyle = col;
    draw(bp, w * 0.6);
  }
  ctx.restore();
}

// expanding ring shockwave
export function ring(ctx, x, y, t, o = {}) {
  const { r0 = 2, r1 = 40, life = 0.4, w = 3, col = P.cyan } = o;
  if (t < 0 || t > life) return;
  const p = ease.outExpo(t / life);
  const r = lerp(r0, r1, p);
  ctx.save();
  glow(ctx, x, y, r * 1.2, col, 0.25 * (1 - p));
  ctx.strokeStyle = col;
  ctx.globalAlpha *= 1 - ease.in2(t / life);
  ctx.lineWidth = w * (1 - p * 0.7);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = w * 0.3;
  ctx.strokeStyle = P.cream;
  ctx.beginPath(); ctx.arc(x, y, r * 0.96, 0, TAU); ctx.stroke();
  ctx.restore();
}

// paper sheets / photos tumbling: flutter with flip (cos scale) and drift
export function papers(ctx, sheets, t, o = {}) {
  for (const s of sheets) {
    const tt = t - (s.delay || 0);
    if (tt < 0) continue;
    const vx = s.vx * Math.exp(-1.6 * tt), vxInt = s.vx * (1 - Math.exp(-1.6 * tt)) / 1.6;
    const fallV = s.fall || 9;
    const vyInt = s.vy * (1 - Math.exp(-2.4 * tt)) / 2.4 + fallV * Math.max(0, tt - 0.25);
    let px = s.x + vxInt + Math.sin(tt * s.wob + s.ph) * s.sway;
    let py = s.y + vyInt;
    if (s.floor !== undefined && py > s.floor) py = s.floor;
    const landed = s.floor !== undefined && py >= s.floor;
    const rot = landed ? s.restRot : s.rot0 + tt * s.spin;
    const flip = landed ? 1 : Math.cos(tt * s.flip + s.ph);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.scale(1, Math.abs(flip) < 0.08 ? 0.08 : flip);
    const w = s.w, h = s.h;
    const front = flip >= 0;
    if (s.kind === 'photo') {
      fill(ctx, rectP(-w / 2, -h / 2, w, h), front ? P.cream : '#d8d5c8');
      if (front) s.draw ? s.draw(ctx, w, h) : fill(ctx, rectP(-w / 2 + w * 0.08, -h / 2 + w * 0.08, w * 0.84, h * 0.68), P.blue);
    } else if (s.kind === 'folder') {
      fill(ctx, polyP([[-w / 2, -h / 2], [-w / 2 + w * 0.35, -h / 2], [-w / 2 + w * 0.42, -h / 2 - h * 0.12], [-w / 2 + w * 0.8, -h / 2 - h * 0.12], [-w / 2 + w * 0.86, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]), front ? P.lemon : P.lemonDk);
    } else {
      fill(ctx, rectP(-w / 2, -h / 2, w, h), front ? P.paper : '#d9d4c0');
      if (front) {
        ctx.fillStyle = rgba(P.navy, 0.55);
        for (let i = 0; i < 5; i++) ctx.fillRect(-w / 2 + w * 0.12, -h / 2 + h * (0.18 + i * 0.14), w * (0.5 + hash(i + s.ph * 10) * 0.3), h * 0.045);
      }
    }
    ctx.restore();
  }
}
export function makeSheets(seed, n, x, y, o = {}) {
  const r = rng(seed);
  const { vx = 40, vy = -40, spreadX = 1, w = 3, h = 4, kinds = ['paper'], floor } = o;
  return [...Array(n)].map((_, i) => ({
    x: x + (r() - 0.5) * (o.jx || 4), y: y + (r() - 0.5) * (o.jy || 4),
    vx: (r() - 0.5) * 2 * vx * spreadX + (o.bias || 0), vy: vy * (0.4 + r() * 0.9),
    fall: 6 + r() * 7, wob: 2 + r() * 3, sway: 1 + r() * 3, ph: r() * TAU,
    rot0: r() * TAU, spin: (r() - 0.5) * 6, flip: 3 + r() * 6,
    w: w * (0.7 + r() * 0.5), h: h * (0.7 + r() * 0.5), kind: kinds[Math.floor(r() * kinds.length)],
    delay: r() * (o.delay || 0.1), floor: floor !== undefined ? floor - r() * 0.6 : undefined, restRot: (r() - 0.5) * 0.4,
  }));
}

// Cel explosion: outlined blobby fireball (the only outlined FX, like the reference)
export function explosion(ctx, x, y, t, o = {}) {
  const { size = 30, life = 0.9, seed = 9, n = 9 } = o;
  if (t < 0 || t > life) return;
  const p = t / life;
  const r = rng(seed);
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = size * (0.2 + r() * 0.7) * ease.outExpo(Math.min(1, p * 2.5));
    const rr = size * (0.25 + r() * 0.3) * (p < 0.15 ? ease.outBack(p / 0.15) : 1 - ease.in2((p - 0.15) / 0.85) * 0.9);
    blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d - p * size * 0.4, rr, i]);
  }
  const mk = (bx, by, rr, i, g) => blobP([...Array(8)].map((_, j) => {
    const aa = j / 8 * TAU, rad = (rr + g) * (0.8 + 0.35 * hash(i * 13 + j + Math.floor(t * 12)));
    return [bx + Math.cos(aa) * rad, by + Math.sin(aa) * rad];
  }));
  const outline = Math.max(0.6, size * 0.06);
  for (const [bx, by, rr, i] of blobs) fill(ctx, mk(bx, by, rr, i, outline), p > 0.55 ? P.ink : P.red);
  for (const [bx, by, rr, i] of blobs) fill(ctx, mk(bx, by, rr, i, 0), p > 0.55 ? P.ink3 : P.lemon);
  for (const [bx, by, rr, i] of blobs) if (p < 0.55) fill(ctx, mk(bx - rr * 0.15, by - rr * 0.15, rr * 0.45, i + 50, 0), P.cream);
}

// Firework burst: radial streak particles with gravity + twinkle; shape 'ring' | 'dollar' | 'peony'
export function firework(ctx, x, y, t, o = {}) {
  const { size = 40, life = 1.6, seed = 5, cols = [P.lemon, P.cream], n = 36, shape = 'peony' } = o;
  if (t < 0 || t > life) return;
  const p = t / life;
  const r = rng(seed);
  if (t < 0.12) {
    glow(ctx, x, y, size * 1.4, cols[0], 0.7 * (1 - t / 0.12));
    fill(ctx, circP(x, y, size * 0.12 * (1 - t / 0.12)), P.cream);
  }
  glow(ctx, x, y, size * 1.6, cols[0], 0.22 * (1 - p));
  const pts = [];
  if (shape === 'dollar') {
    // sample an S curve + vertical bar
    for (let i = 0; i < n; i++) {
      const u = i / n;
      let px, py;
      if (i % 4 === 0) { px = 0; py = lerp(-1.25, 1.25, u); }
      else {
        const s = u * 1.0;
        const a = lerp(-Math.PI * 0.15, Math.PI * 2.15, s);
        const top = a < Math.PI * 1.0;
        px = top ? Math.cos(a + Math.PI * 0.5) * -0.8 : Math.cos(a - Math.PI * 0.5) * -0.8;
        px = Math.sin(a) * 0.75 * (top ? -1 : 1) * -1;
        py = top ? -0.5 - Math.cos(a) * 0.5 : 0.5 - Math.cos(a - Math.PI) * 0.5;
      }
      pts.push([px, py]);
    }
  } else {
    for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.1; const rr = shape === 'ring' ? 1 : 0.55 + r() * 0.5; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  }
  const ex = ease.outExpo(Math.min(1, p * 1.6));
  const drop = p * p * size * 0.6;
  for (let i = 0; i < pts.length; i++) {
    const [ux, uy] = pts[i];
    const px = x + ux * size * ex, py = y + uy * size * ex + drop;
    const tw = hash(i * 7 + Math.floor(t * 12)) > 0.25 || p < 0.5;
    if (!tw) continue;
    const c = cols[i % cols.length];
    const tail = size * 0.25 * (1 - ex) + size * 0.04;
    const ang = Math.atan2(uy * size + drop * 0.5, ux * size);
    ctx.save();
    ctx.globalAlpha *= p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
    ctx.fillStyle = c;
    ctx.beginPath();
    const ww = size * 0.025;
    ctx.moveTo(px + Math.cos(ang) * ww * 2, py + Math.sin(ang) * ww * 2);
    ctx.lineTo(px + Math.cos(ang + 1.57) * ww, py + Math.sin(ang + 1.57) * ww);
    ctx.lineTo(px - Math.cos(ang) * tail, py - Math.sin(ang) * tail);
    ctx.lineTo(px + Math.cos(ang - 1.57) * ww, py + Math.sin(ang - 1.57) * ww);
    ctx.closePath(); ctx.fill();
    if (p > 0.35 && i % 3 === 0) sparkle(ctx, px, py, size * 0.05, P.cream, t * 3);
    ctx.restore();
  }
}

// rocket streak rising
export function rocketTrail(ctx, x0, y0, x1, y1, p, o = {}) {
  const { col = P.lemon, w = 0.7 } = o;
  const x = lerp(x0, x1, ease.out2(p)), y = lerp(y0, y1, ease.out2(p));
  const tx = lerp(x0, x1, Math.max(0, ease.out2(p) - 0.25)), ty = lerp(y0, y1, Math.max(0, ease.out2(p) - 0.25));
  ctx.save();
  ctx.fillStyle = col;
  const ang = Math.atan2(y - ty, x - tx);
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(ang) * w * 2, y + Math.sin(ang) * w * 2);
  ctx.lineTo(x + Math.cos(ang + 1.57) * w, y + Math.sin(ang + 1.57) * w);
  ctx.lineTo(tx, ty);
  ctx.lineTo(x + Math.cos(ang - 1.57) * w, y + Math.sin(ang - 1.57) * w);
  ctx.fill();
  glow(ctx, x, y, w * 6, col, 0.6);
  ctx.restore();
  return [x, y];
}

// glass shards
export function shards(ctx, x, y, t, o = {}) {
  const { n = 10, seed = 11, speed = 30, size = 1.4, col = P.red, col2 = P.cream, grav = 80, life = 0.8, dir = -Math.PI / 2, spread = 1.4 } = o;
  if (t < 0 || t > life) return;
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = dir + (r() - 0.5) * spread * 2, sp = speed * (0.4 + r() * 0.8);
    const px = x + Math.cos(a) * sp * t, py = y + Math.sin(a) * sp * t + 0.5 * grav * t * t;
    const s = size * (0.4 + r() * 0.8);
    ctx.save(); ctx.translate(px, py); ctx.rotate(r() * TAU + t * (r() - 0.5) * 20);
    fill(ctx, polyP([[0, -s], [s * 0.7, s * 0.4], [-s * 0.5, s * 0.7]]), r() < 0.5 ? col : col2);
    ctx.restore();
  }
}

// Title card (screen space): a name slab, an optional tag, and a detail line that arrives ~0.45 s
// later. Restyle freely to match the reference's title treatment. t relative to its start.
export function titleCard(ctx, t, o) {
  const { num = '', name = 'TITLE', cmd = '', dur = 1.6, x = 120, y = 150, accent = P.red, small = false } = o;
  if (t < 0 || t > dur + 0.25) return;
  const pin = ease.outBack(clamp(t / 0.28), 2.0);
  const pout = t > dur ? ease.in2((t - dur) / 0.25) : 0;
  const dx = lerp(-1300, 0, pin) - pout * 1500;
  ctx.save();
  ctx.translate(x + dx, y);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  // red slab with ink drop shadow
  font(ctx, 118, { fam: 'display', weight: 800, italic: true });
  const wName = ctx.measureText(name).width;
  const bw = Math.max(wName + 120, 760);
  fill(ctx, rectP(14, 18, bw, 168), P.ink);
  fill(ctx, rectP(0, 0, bw, 168), accent);
  fill(ctx, rectP(0, 0, bw, 10), mix(accent, P.cream, 0.35));
  // tag
  if (num) {
    fill(ctx, rectP(26, -38, 300, 60), P.ink);
    fill(ctx, rectP(20, -44, 300, 60), P.lemon);
    text(ctx, num, 38, 2, P.ink, 46, { fam: 'display', weight: 800, italic: true, track: 2 });
    sparkle(ctx, 300, -14, 16, P.ink, 0);
  }
  text(ctx, name, 44, 136, P.ink, 118, { fam: 'display', weight: 800, italic: true });
  text(ctx, name, 38, 130, P.cream, 118, { fam: 'display', weight: 800, italic: true });
  ctx.restore();
  if (cmd) {
    const pc = ease.outBack(clamp((t - 0.45) / 0.28), 1.8);
    ctx.save();
    ctx.translate(x + 40 + lerp(-1400, 0, pc) - pout * 1600, y + 210);
    font(ctx, small ? 34 : 42, { fam: 'mono', weight: 700 });
    const tw = ctx.measureText('$ ' + cmd).width;
    fill(ctx, rrP(10, 10, tw + 64, 74, 10), P.ink);
    fill(ctx, rrP(0, 0, tw + 64, 74, 10), P.term);
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(0, 0, tw + 64, 74, 10); ctx.stroke();
    const ty = 50;
    ctx.textBaseline = 'alphabetic';
    font(ctx, small ? 34 : 42, { fam: 'mono', weight: 700 });
    ctx.fillStyle = accent; ctx.fillText('$ ', 32, ty);
    ctx.fillStyle = P.cream; ctx.fillText(cmd, 32 + ctx.measureText('$ ').width, ty);
    ctx.restore();
  }
}

// white/colored flash frame helper value (returns 0..1)
export const flashAt = (t, t0, dur = 2 / 24) => (t >= t0 && t < t0 + dur ? 1 : 0);

export { speedLines };
export const marquee = titleCard; // legacy name
