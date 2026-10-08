// THE picture. Replace this demo with your composition; keep the contract:
//   size     output pixels at scale 1 (match the reference's aspect unless the brief says otherwise)
//   design   authoring units: x in [0, design.w], y in [0, design.w * h / w]
//   render   { supersample (crisp edges; 2 is a good default), pixelate: <native height> for pixel art }
//   notan    [t1, t2] L* thresholds from the reference analysis (for --view notan)
//   draw(ctx, env) paints back to front in design units and returns post params
//            ({ grain, grainSize, vig, contrast, saturation, tint, tintAmt, ca, palette, lock, dither })
// env: { W, H (design units), px (scene px per unit), seed, rng, ink(color, fn, opts), pixels(fn) }
// The demo shows the patterns (paper, ink layers with misregistration, interlocking spears, a
// billow, a fractal ridge, hatching, fitted type). None of it is a style recommendation.
import { P } from './palette.js';
import { path, ridge, toBase, hatch, rect, fitText, text } from './draw.js';
import { paper } from './texture.js';
import { billow, interlock } from './motifs.js';

export const picture = {
  size: { w: 1800, h: 2400 },
  design: { w: 1000 },
  render: { supersample: 2 },
  notan: [33, 66],
  seed: 1,
  // reference: '../refs/reference.png',   // shown by the preview's "beside reference" view
  async load() {},

  draw(ctx, env) {
    const { W, H, seed } = env;
    env.pixels((c, w, h) => paper(c, w, h, { color: P.paper, mottle: 0.05, grain: 0.06, seed }));

    // sky field, slightly misregistered like a separate screen
    env.ink(P.field, l => l.fill(path(rect(30, 30, W - 60, H * 0.62))), { offset: [1.2, -0.8], mottle: 0.06, speckle: 0.3, seed: 1 });

    // horizontal spears interlocking the field with a light band (motifs.interlock)
    env.ink(P.light, l => l.fill(path(rect(30, H * 0.5, W - 60, H * 0.12 + 2))), { mottle: 0.06, seed: 2 });
    interlock(env.ink, { up: P.light, down: P.field, edge: () => H * 0.5, x0: 30, x1: W - 30, n: 50, reach: 110, seed: 20 });

    // a cloud lit from the upper left (motifs.billow): lit cap, hanging lobes, wing crescents
    const top = [[60, 330], [120, 250], [220, 215], [330, 230], [420, 290], [470, 360]];
    const term = [[80, 380], [150, 320], [240, 300], [330, 310], [410, 350], [452, 400]];
    billow(env.ink, { body: [...top, [480, 420], [300, 450], [80, 440]], top, term, light: [-0.6, -0.8], seed: 30,
      base: P.field, lit: P.light, rim: P.accent, hang: 22, depth: 120, wingMax: 22, wingMin: 7, wings: 30, pockets: 10 });

    // mountains: fractal ridge, then a hatched shadow side
    const edge = ridge([[30, H * 0.62], [380, H * 0.33], [640, H * 0.47], [W - 30, H * 0.4]], { detail: 7, amp: 0.3, seed: 7, rough: 0.8 });
    const mountain = toBase(edge, H * 0.8);
    env.ink(P.accent, l => l.fill(path(mountain)), { mottle: 0.15, speckle: 0.5, seed: 4 });
    env.ink(P.ink, l => hatch(l, path(mountain), [30, H * 0.3, W - 30, H * 0.8], { angle: -0.9, spacing: 9, width: 2.2, jitter: 0.4, seed: 8 }), { opacity: 0.85, seed: 5 });

    // type band
    env.ink(P.ink, l => {
      l.fill(path(rect(30, H * 0.8, W - 60, H * 0.2 - 30)));
    }, { mottle: 0.08, seed: 6 });
    env.ink(P.paper, l => {
      fitText(l, 'PICTURE BY REFERENCE', 70, H * 0.9, W - 140, { size: 90, font: '"Gill Sans", "Futura", sans-serif', weight: 700, track: 0.04 });
      text(l, 'demo — replace src/picture.js', W / 2, H * 0.95, { size: 30, align: 'center', font: '"Gill Sans", sans-serif', weight: 400, track: 0.12 });
    }, { seed: 7 });

    return { grain: 0.02, grainSize: 0.0004, vig: 0.08 };
  },
};
