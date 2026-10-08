// Demo scene: proves the pipeline and shows the patterns (cue-driven timing, held drawings,
// a world-unit camera, a parametric character, shading bands, FX, a title card, a flash frame).
// Delete it once your own shots exist. Nothing here is a style recommendation.
import { P, mix } from '../palette.js';
import { cam, withCam, toScreen } from '../camera.js';
import { rrP, rectP, circP, fill, solid, glow, contact, bg } from '../draw.js';
import { puffs, sparks, ring, titleCard, speedLines } from '../fx.js';
import { C } from '../timeline.js';
import { ease, seg, onN, shake, hit, clamp, lerp } from '../core.js';

// A tiny parametric character in its own units (origin = feet). Real projects build a rig from
// the reference/character sheet (see references/engine.md §5).
function hero(ctx, { x, y, s = 1, sx = 1, sy = 1, look = 0, blink = 0, light }) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s * sx, s * sy);
  const body = rrP(-10, -24, 20, 24, 8);
  solid(ctx, body, P.coral, light);
  const ex = look * 2;
  [-4.5, 4.5].forEach(dx => fill(ctx, rrP(dx - 1.6 + ex, -17 + blink * 2.2, 3.2, 4.4 * (1 - blink) + 0.4, 1.2), P.ink));
  ctx.restore();
}

function stage(ctx, c, t) {
  // background layer (parallax 0.85): sky + a big disc
  withCam(ctx, c, 0.85, () => {
    fill(ctx, rectP(-400, -300, 800, 400), P.navy);
    glow(ctx, 0, -40, 120, P.lemon, 0.25);
    fill(ctx, circP(0, -40, 34), P.lemon);
  });
  // main layer: the ground
  withCam(ctx, c, 1, () => {
    fill(ctx, rectP(-400, 0, 800, 200), P.ink2);
    fill(ctx, rectP(-400, 0, 800, 1.2), P.blueLt);
  });
}

function sDemo(ctx, t) {
  const tc = onN(t, 2);                         // held time for character + FX (drawn on 2s)
  const push = seg(t, 0, C.end, ease.inOut);    // camera moves on 1s
  const c = cam(0, -16, lerp(14, 18, push));
  const [sx, sy] = shake(t, hit(t, C.drop, 18, 0.4), 16, 3);
  c.ox = sx; c.oy = sy;
  bg(ctx, P.ink);
  stage(ctx, c, t);
  // hero drops in on the downbeat, squashes, recovers
  const fall = seg(tc, C.drop - 0.35, C.drop, ease.in2);
  const land = tc >= C.drop ? 1 - ease.out(clamp((tc - C.drop) / 0.3)) : 0;
  const light = { sh: [P.coralDk, -5, 0], rim: [P.lemon, 2.5, -2] };
  withCam(ctx, c, 1, () => {
    contact(ctx, 0, 0.3, 11, 1.4, 0.4);
    hero(ctx, { x: 0, y: lerp(-60, 0, fall), sx: 1 + land * 0.3, sy: 1 - land * 0.3, look: tc > C.look ? 1 : 0, blink: tc > C.look + 0.6 && tc < C.look + 0.7 ? 1 : 0, light });
    puffs(ctx, -8, -1, onN(t - C.drop, 2), { n: 5, dir: Math.PI + 0.2, spread: 0.4, speed: 40, size: 3, seed: 3 });
    puffs(ctx, 8, -1, onN(t - C.drop, 2), { n: 5, dir: -0.2, spread: 0.4, speed: 40, size: 3, seed: 5 });
    ring(ctx, 0, -10, onN(t - C.drop, 2), { r0: 4, r1: 60, life: 0.45, w: 1.2, col: P.cream });
    sparks(ctx, 0, -12, onN(t - C.drop, 2), { n: 14, speed: 70, len: 2.5, w: 0.5, grav: 90, life: 0.45, seed: 9 });
  });
  if (t >= C.drop && t < C.drop + 2 / 24) {
    const [hx, hy] = toScreen(c, 0, -10);
    speedLines(ctx, hx, hy, 100, 1500, 60, 7, mix(P.cream, P.ink, 0.1), 0.035);
  }
  titleCard(ctx, t - C.title, { num: 'DEMO', name: 'PIPELINE OK', cmd: 'node render/render.mjs', dur: C.flash - C.title - 0.3, y: 140 });
  const flash = t >= C.flash && t < C.flash + 2 / 24 ? 1 : 0;
  return { k: 0.15, vig: 0.35, flash };
}

export const demo = [{ name: 'demo', start: 0, end: C.end, draw: sDemo }];
