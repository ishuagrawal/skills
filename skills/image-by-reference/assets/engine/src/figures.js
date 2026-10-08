// People built from proportion rules, for any style that simplifies figures into flat shapes.
// A believable figure needs a head (≈ 1/7.5 of the height), a neck, shoulders wider than the
// hips, arms reaching mid-thigh, legs half the height, and feet. Blobs and bells read as
// chess pieces, not people. Returns polygon groups to fill with your own inks.
//
//   const f = figure({ x, y, h: 160, view: 'side', dir: -1, lean: 0.15, reach: [px, py] });
//   ink(P.coat, l => f.coat.forEach(p => l.fill(path(p))));   // also f.skin, f.legs, f.hair, f.shoes
import { taper, ellipse } from './draw.js';

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// two-bone IK in the plane: elbow position for shoulder S reaching T (bend: +1/-1 side)
function ik(S, T, a, b, bend) {
  const d = Math.min(len(S, T), a + b - 0.01), ang = Math.atan2(T[1] - S[1], T[0] - S[0]);
  const alpha = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const e = ang + bend * alpha;
  return [S[0] + Math.cos(e) * a, S[1] + Math.sin(e) * a];
}

// view: 'side' (profile, facing dir = +1 right / -1 left) | 'front' | 'back'
// pose: 'stand' | 'step' | 'sit' | 'lean-out' (hanging off a pole: hips out, one arm up)
// reach: [x, y] world point one hand holds (a pole, a strap); the other arm hangs
// coat: 0..1 how far the coat/jacket hangs below the hips; hat: true draws a brimmed hat
export function figure({ x, y, h, view = 'side', dir = 1, lean = 0, pose = 'stand', reach = null, coat = 0.4, hat = false, bulk = 1 }) {
  const H = h, s = dir;
  const rot = (u, v) => { const c = Math.cos(lean), n = Math.sin(lean); return [x + s * (u * c + v * n), y - (-u * n + v * c)]; };
  const side = view === 'side';
  const sw = (side ? 0.06 : 0.125) * H * bulk, hw = (side ? 0.055 : 0.1) * H * bulk;
  const hipV = pose === 'sit' ? 0.3 * H : 0.5 * H, shV = hipV + 0.32 * H, headV = shV + 0.115 * H;
  const out = { skin: [], coat: [], legs: [], hair: [], shoes: [] };

  // legs
  const legW0 = 0.07 * H * bulk, legW1 = 0.04 * H;
  if (pose === 'sit') {
    for (const k of side ? [0] : [-1, 1]) {
      const hip = rot(k * hw * 0.5, hipV), knee = rot(k * hw * 0.5 + 0.22 * H, hipV + 0.01 * H), ankle = rot(k * hw * 0.5 + 0.22 * H, 0.04 * H);
      out.legs.push(taper([hip, knee, ankle], legW0, legW1, { cap: false }));
      out.shoes.push(ellipse(ankle[0] + s * 0.03 * H, ankle[1] + 0.012 * H, 0.05 * H, 0.022 * H, 16));
    }
  } else {
    const stride = pose === 'step' ? 0.09 * H : side ? 0.03 * H : 0;
    const legs = side ? [[-stride, -1], [stride, 1]] : [[-hw * 0.55, 0], [hw * 0.55, 0]];
    for (const [u, k] of legs) {
      const hip = rot(side ? 0 : u * 0.8, hipV), knee = rot(u * 0.6 + (side ? 0.01 * H : 0), 0.27 * H), ankle = rot(u, 0.035 * H);
      out.legs.push(taper([hip, knee, ankle], legW0, legW1, { cap: false }));
      out.shoes.push(side ? ellipse(ankle[0] + s * 0.035 * H, ankle[1] + 0.012 * H, 0.06 * H, 0.022 * H, 16) : ellipse(ankle[0], ankle[1] + 0.012 * H, 0.035 * H, 0.022 * H, 16));
    }
  }

  // torso + coat (a slightly tapered block from shoulders to hips, longer if coat > 0)
  const bot = hipV - coat * 0.2 * H;
  const chest = side ? 0.015 * H : 0;
  out.coat.push([rot(-sw, shV), rot(sw + chest, shV), rot(hw + chest * 0.5, (shV + hipV) / 2), rot(hw * 1.08, bot), rot(-hw * 1.08, bot), rot(-hw, (shV + hipV) / 2)]);

  // neck and head
  out.skin.push(taper([rot(0, shV - 0.01 * H), rot(side ? 0.008 * H : 0, shV + 0.045 * H)], 0.045 * H, 0.04 * H, { cap: false }));
  const hc = rot(side ? 0.012 * H : 0, headV);
  out.skin.push(ellipse(hc[0], hc[1], 0.058 * H, 0.07 * H, 24, side ? s * 0.1 : 0));
  if (hat) {
    out.hair.push(ellipse(hc[0], hc[1] - 0.045 * H, 0.085 * H, 0.016 * H, 20));
    out.hair.push([[hc[0] - 0.05 * H, hc[1] - 0.045 * H], [hc[0] - 0.045 * H, hc[1] - 0.105 * H], [hc[0] + 0.045 * H, hc[1] - 0.105 * H], [hc[0] + 0.05 * H, hc[1] - 0.045 * H]]);
  } else {
    // hair cap on the back/top of the head
    out.hair.push(ellipse(hc[0] - s * (side ? 0.012 * H : 0), hc[1] - 0.025 * H, 0.06 * H, 0.05 * H, 20));
  }

  // arms: one may reach a point, the other hangs (slightly bent)
  const ua = 0.19 * H, fa = 0.17 * H, aw0 = 0.05 * H * bulk, aw1 = 0.035 * H;
  const shoulders = side ? [rot(0.01 * H, shV - 0.02 * H)] : [rot(-sw * 0.92, shV - 0.02 * H), rot(sw * 0.92, shV - 0.02 * H)];
  shoulders.forEach((S, i) => {
    let E, Wr;
    if (reach && i === shoulders.length - 1) { Wr = reach; E = ik(S, Wr, ua, fa, s * (side ? -1 : 1)); }
    else {
      const sideOut = side ? 0.03 * H : (i === 0 ? -1 : 1) * 0.03 * H;
      E = rot((side ? 0.02 * H : (i === 0 ? -sw - 0.01 * H : sw + 0.01 * H)), shV - ua);
      Wr = rot((side ? 0.05 * H : (i === 0 ? -sw : sw)) + sideOut * 0.3, shV - ua - fa * 0.95);
    }
    out.coat.push(taper([S, E], aw0, aw1 * 1.1, { cap: false }));
    out.coat.push(taper([E, Wr], aw1 * 1.1, aw1, { cap: false }));
    out.skin.push(ellipse(Wr[0], Wr[1], 0.025 * H, 0.03 * H, 14));
  });
  return out;
}
