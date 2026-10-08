// Surface kit: paper, grain, mottling, speckle, stains, and ink layers (print-style inks with
// their own texture and misregistration). Textures are generated from seeds and cached, so the
// same seed always gives the same surface. Sizes are given as fractions of the image height so
// the surface looks the same in a draft and in the full render.
import { fbm, hash3, rng, clamp } from './core.js';

// Bounded cache: every full-size canvas costs w*h*4 bytes (~70 MB at 1774x2400 with 2x
// supersampling), and a picture with dozens of ink layers would otherwise exhaust GPU memory
// (the symptom is a black render).
const cache = new Map();
const MAX_CACHE = 10;
function remember(key, make) {
  if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
  const v = make();
  cache.set(key, v);
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return v;
}
const canvas = (w, h) => new OffscreenCanvas(Math.max(1, w | 0), Math.max(1, h | 0));

// Grayscale fbm noise, feature size `cell` px. Computed on a coarse grid and smoothly upscaled.
export function noiseCanvas(w, h, { cell = 64, octaves = 4, gain = 0.5, seed = 1, contrast = 1.4 } = {}) {
  return remember(`n${w}x${h}c${cell | 0}o${octaves}g${gain}s${seed}k${contrast}`, () => {
  const step = Math.max(1, Math.floor(cell / 6));
  const sw = Math.ceil(w / step) + 1, sh = Math.ceil(h / step) + 1;
  const small = canvas(sw, sh), sc = small.getContext('2d');
  const img = sc.createImageData(sw, sh), d = img.data;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const v = clamp(0.5 + 0.5 * contrast * fbm((x * step) / cell, (y * step) / cell, { octaves, gain, seed }), 0, 1) * 255;
    const i = (y * sw + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  const c = canvas(w, h), cx = c.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(small, 0, 0, sw * step, sh * step);
  return c;
  });
}

// Two alpha masks from one noise field: black where noise is high, white where it is low.
// Drawn with 'source-atop' they darken/lighten an ink unevenly (screenprint/riso mottling).
// Mottle is low-frequency, so the masks are built at reduced resolution: draw them stretched
// to the full size (drawImage(m.dark, 0, 0, w, h)).
export function mottleMasks(W, H, { cell = 64, seed = 1, octaves = 4, bias = 0 } = {}) {
  const f = Math.max(1, Math.min(8, Math.floor(cell / 24)));
  const w = Math.ceil(W / f), h = Math.ceil(H / f);
  return remember(`m${w}x${h}c${cell | 0}s${seed}o${octaves}b${bias}`, () => {
  const n = noiseCanvas(w, h, { cell: cell / f, octaves, seed });
  const src = n.getContext('2d').getImageData(0, 0, w, h).data;
  const dark = canvas(w, h), light = canvas(w, h);
  const di = dark.getContext('2d').createImageData(w, h), li = light.getContext('2d').createImageData(w, h);
  for (let i = 0; i < src.length; i += 4) {
    const v = src[i] / 127.5 - 1 + bias;
    di.data[i + 3] = clamp(v, 0, 1) * 255;
    li.data[i] = li.data[i + 1] = li.data[i + 2] = 255; li.data[i + 3] = clamp(-v, 0, 1) * 255;
  }
  dark.getContext('2d').putImageData(di, 0, 0); light.getContext('2d').putImageData(li, 0, 0);
  return { dark, light };
  });
}

// Per-pixel grain (white noise in blocks of `size` px), mid-gray centered, for 'overlay'/'soft-light'.
export function grainCanvas(w, h, { size = 1, seed = 1 } = {}) {
  return remember(`g${w}x${h}z${size}s${seed}`, () => {
  const gw = Math.ceil(w / size), gh = Math.ceil(h / size);
  const g = canvas(gw, gh), gc = g.getContext('2d'), img = gc.createImageData(gw, gh), d = img.data;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = (y * gw + x) * 4, v = hash3(x, y, seed) * 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  gc.putImageData(img, 0, 0);
  if (size === 1) return g;
  const c = canvas(w, h), cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(g, 0, 0, gw * size, gh * size);
  return c;
  });
}

// Sparse specks (alpha mask): ink skips, dust, paper flecks. density = share of pixels.
export function speckCanvas(w, h, { density = 0.002, size = 1.5, seed = 1, clump = 0.6 } = {}) {
  return remember(`k${w}x${h}d${density}z${size}s${seed}c${clump}`, () => {
  const c = canvas(w, h), cx = c.getContext('2d'), r = rng(seed);
  const n = Math.round(w * h * density / Math.max(1, size * size));
  const field = noiseCanvas(Math.ceil(w / 16), Math.ceil(h / 16), { cell: 24, seed: seed + 5, octaves: 2 });
  const fd = field.getContext('2d').getImageData(0, 0, field.width, field.height).data;
  cx.fillStyle = '#000';
  cx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h;
    const f = fd[((Math.min(field.height - 1, y / 16 | 0)) * field.width + Math.min(field.width - 1, x / 16 | 0)) * 4] / 255;
    if (r() > (1 - clump) + clump * f) continue;           // clump specks where the field is high
    const rr = size * (0.4 + r() * 0.8);
    cx.moveTo(x + rr, y); cx.ellipse(x, y, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
  }
  cx.fill();
  return c;
  });
}

// Paper base in pixel space (call through env.pixels). Sizes are fractions of the height.
export function paper(ctx, w, h, { color = '#efe6d2', mottle = 0.05, mottleCell = 0.06, grain = 0.05, grainSize = 0.0004, fibers = 0, seed = 1 } = {}) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  if (mottle) mottle_(ctx, w, h, { amount: mottle, cell: mottleCell * h, seed });
  if (grain) grain_(ctx, w, h, { amount: grain, size: Math.max(1, Math.round(grainSize * h)), seed: seed + 1 });
  if (fibers) {
    const r = rng(seed + 2);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < fibers * w * h / 1e5; i++) {
      const x = r() * w, y = r() * h, L = h * (0.002 + r() * 0.006), a = r() * Math.PI;
      ctx.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.06})`;
      ctx.lineWidth = Math.max(0.6, h * 0.0003);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + L * 0.2, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
    }
    ctx.restore();
  }
}
function mottle_(ctx, w, h, { amount, cell, seed }) {
  const m = mottleMasks(w, h, { cell, seed });
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = amount; ctx.drawImage(m.dark, 0, 0, w, h);
  ctx.globalAlpha = amount * 0.8; ctx.drawImage(m.light, 0, 0, w, h);
  ctx.restore();
}
function grain_(ctx, w, h, { amount, size, seed }) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  ctx.drawImage(grainCanvas(w, h, { size, seed }), 0, 0);
  ctx.restore();
}

// Faint blotches / foxing / water stains (aging), pixel space
export function stains(ctx, w, h, { count = 6, amount = 0.06, size = 0.08, color = '80,60,30', seed = 1 } = {}) {
  const r = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rr = h * size * (0.3 + r());
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(${color},${amount * r()})`);
    g.addColorStop(0.7, `rgba(${color},${amount * 0.4 * r()})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  ctx.restore();
}

// Ink layers. `ink(color, draw, opts)` draws `draw(lctx)` on its own layer, recolors everything
// on it to exactly `color` (so shapes can be filled with any style), adds that ink's surface,
// and lays it on the picture with an optional misregistration offset and blend mode. Pass
// color = null for a multi-color group (one object drawn back to front in several inks, e.g. a
// building or a vehicle in a painter's-order scene): it keeps its fills and still gets the surface.
//   offset   [dx, dy] design units (registration error of this screen/plate)
//   mottle   0..1 uneven ink density; mottleCell fraction of height
//   speckle  0..1 density of tiny unprinted specks (paper shows through)
//   opacity, blend ('source-over' opaque inks; 'multiply' transparent riso/woodblock inks)
export function makeInk(ctx, env) {
  let layer = null;
  return function ink(color, draw, { offset = [0, 0], mottle = 0, mottleCell = 0.05, speckle = 0, speckleSize = 0.0005, opacity = 1, blend = 'source-over', seed = 1 } = {}) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    if (!layer || layer.width !== w || layer.height !== h) layer = canvas(w, h);
    const l = layer.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over'; l.globalAlpha = 1;
    l.clearRect(0, 0, w, h);
    l.setTransform(env.base);
    l.fillStyle = color; l.strokeStyle = color;
    draw(l);
    l.setTransform(1, 0, 0, 1, 0, 0);
    if (color) {                       // null = a multi-color group printed as one layer
      l.globalCompositeOperation = 'source-in';
      l.fillStyle = color; l.fillRect(0, 0, w, h);
    }
    if (mottle) {
      const m = mottleMasks(w, h, { cell: mottleCell * h, seed: seed + 11 });
      l.globalCompositeOperation = 'source-atop';
      l.imageSmoothingQuality = 'high';
      l.globalAlpha = mottle; l.drawImage(m.dark, 0, 0, w, h);
      l.globalAlpha = mottle * 0.8; l.drawImage(m.light, 0, 0, w, h);
      l.globalAlpha = 1;
    }
    if (speckle) {
      l.globalCompositeOperation = 'destination-out';
      l.drawImage(speckCanvas(w, h, { density: 0.004 * speckle, size: Math.max(1, speckleSize * h), seed: seed + 23 }), 0, 0);
    }
    l.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity; ctx.globalCompositeOperation = blend;
    ctx.drawImage(layer, offset[0] * env.px, offset[1] * env.px);
    ctx.restore();
  };
}
