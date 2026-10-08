// Shot list -> frame renderer. Each shot module exports [{ name, start, end, draw(ctx, t) }];
// draw returns post params ({ k, vig, grain, contrast, saturation, tint, tintAmt, ca, flash, flashCol }).
import { P } from './palette.js';
import { bg } from './draw.js';
import { C } from './timeline.js';
import { demo } from './shots/demo.js';

const shots = [...demo].sort((a, b) => a.start - b.start);

export const film = {
  duration: C.end,
  shots,
  // Style-dependent render settings (see references/engine.md §3):
  // supersample (crisp 2D), pixelate: <native height> (pixel art), motionBlur: <subframes> + shutter (cinematic).
  render: { supersample: 1.25 },
  // Preload images/fonts/generated textures here; must resolve before rendering starts.
  async load() {},
  draw(ctx, t) {
    const s = shots.find(s => t >= s.start && t < s.end) || shots[shots.length - 1];
    if (!s || t >= s.end) { bg(ctx, P.ink); return { vig: 0 }; }
    ctx.save();
    const fx = s.draw(ctx, t) || {};
    ctx.restore();
    return fx;
  },
};
