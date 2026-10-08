// Entry point. ?render=1 exposes window.PICTURE for render/render.mjs; otherwise a preview page.
// The picture is authored in design units (picture.design.w wide, height from the aspect), drawn
// on a supersampled scene canvas, downsampled to the output size and finished by the post pass.
import { picture } from './picture.js';
import { Post } from './post.js';
import { makeInk } from './texture.js';
import { rng } from './core.js';

const R = { supersample: 2, pixelate: 0, ...(picture.render || {}) };
const W = picture.size.w, H = picture.size.h;
const DW = picture.design?.w ?? 1000, DH = (DW * H) / W;
const posts = new Map();

function draw({ scale = 1, seed = picture.seed ?? 1 } = {}) {
  const ow = Math.round(W * scale), oh = Math.round(H * scale);
  // pixel art renders at its native resolution and is upscaled with nearest-neighbour
  const ss = R.pixelate ? R.pixelate / oh : R.supersample;
  const sw = Math.round(ow * ss), sh = Math.round(oh * ss);
  const scene = new OffscreenCanvas(sw, sh);
  const ctx = scene.getContext('2d', { alpha: false });
  const k = sw / DW;
  const base = new DOMMatrix([k, 0, 0, k, 0, 0]);
  ctx.setTransform(base);
  const env = {
    W: DW, H: DH, px: k, seed, scale, base, rng: rng(seed),
    // run fn(ctx, widthPx, heightPx) in raw scene pixels (paper, grain, textures)
    pixels: fn => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); fn(ctx, sw, sh); ctx.restore(); },
  };
  env.ink = makeInk(ctx, env);
  const fx = picture.draw(ctx, env) || {};

  // downsample in halving steps for clean anti-aliasing
  let src = scene;
  if (!R.pixelate) {
    while (src.width / 2 >= ow * 1.001) {
      const half = new OffscreenCanvas(Math.round(src.width / 2), Math.round(src.height / 2));
      const hc = half.getContext('2d');
      hc.imageSmoothingQuality = 'high';
      hc.drawImage(src, 0, 0, half.width, half.height);
      src = half;
    }
  }
  const out = new OffscreenCanvas(ow, oh);
  const oc = out.getContext('2d', { alpha: false });
  oc.imageSmoothingEnabled = !R.pixelate;
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(src, 0, 0, ow, oh);

  const key = `${ow}x${oh}`;
  if (!posts.has(key)) posts.set(key, new Post(ow, oh, { nearest: !!R.pixelate }));
  // post sizes in fractions of the height: grainSize (e.g. 0.0004) -> px
  return posts.get(key).run(out, { seed: (seed % 997) * 0.731, ...fx, grainSize: Math.max(1, (fx.grainSize ?? 0) * oh) });
}

// 3-value value study of the render (thresholds in L*), for comparing against the reference notan
function notan(c, [t1, t2] = picture.notan || [33, 66]) {
  const x = c.getContext('2d'), img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  for (let i = 0; i < d.length; i += 4) {
    const Y = 0.2126 * lin(d[i] / 255) + 0.7152 * lin(d[i + 1] / 255) + 0.0722 * lin(d[i + 2] / 255);
    const L = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    d[i] = d[i + 1] = d[i + 2] = L <= t1 ? 30 : L <= t2 ? 128 : 235;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function finish(src, { crop = null, view = 'color' } = {}) {
  let c = document.createElement('canvas');
  if (crop) {
    const [x, y, w, h] = crop;
    c.width = Math.round(w * src.width); c.height = Math.round(h * src.height);
    c.getContext('2d').drawImage(src, -Math.round(x * src.width), -Math.round(y * src.height));
  } else {
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
  }
  if (view === 'notan') c = notan(c);
  return c;
}

const params = new URLSearchParams(location.search);
if (params.has('render')) {
  window.PICTURE = {
    ready: document.fonts.ready.then(() => picture.load?.()).then(() => true),
    info: () => ({ w: W, h: H, design: [DW, +DH.toFixed(2)], seed: picture.seed ?? 1, supersample: R.supersample }),
    // opts: { scale, seed, crop: [x,y,w,h] fractions, view: 'color' | 'notan' }
    render: opts => finish(draw(opts), opts).toDataURL('image/png'),
  };
} else {
  preview();
}

async function preview() {
  await document.fonts.ready;
  await picture.load?.();
  const view = document.getElementById('view');
  const seedIn = document.getElementById('seed'), modeIn = document.getElementById('mode'), sizeIn = document.getElementById('size');
  seedIn.value = picture.seed ?? 1;
  let ref = null;
  if (picture.reference) { ref = new Image(); ref.src = picture.reference; await ref.decode().catch(() => (ref = null)); }
  const show = () => {
    const scale = +sizeIn.value;
    const c = finish(draw({ scale, seed: +seedIn.value }), { view: modeIn.value === 'notan' ? 'notan' : 'color' });
    const side = modeIn.value === 'side' && ref;
    view.width = side ? c.width * 2 + 16 : c.width; view.height = c.height;
    const v = view.getContext('2d');
    v.fillStyle = '#111'; v.fillRect(0, 0, view.width, view.height);
    if (side) v.drawImage(ref, 0, 0, c.height * ref.width / ref.height, c.height);
    v.drawImage(c, side ? c.width + 16 : 0, 0);
  };
  [seedIn, modeIn, sizeIn].forEach(el => (el.onchange = show));
  show();
}
