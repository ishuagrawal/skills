// 2D multiplane camera. World units are centimetres on the desk; `z` is px per cm.
// Layers with parallax < 1 sit behind the desk (wall, window), > 1 in front (desk edge).
import { W, H } from './core.js';

export function cam(x, y, z, rot = 0, ox = 0, oy = 0) { return { x, y, z, rot, ox, oy }; }

export function apply(ctx, c, par = 1) {
  ctx.translate(W / 2 + c.ox, H / 2 + c.oy);
  ctx.rotate(c.rot);
  ctx.scale(c.z, c.z);
  ctx.translate(-c.x * par, -c.y * par);
}

export function withCam(ctx, c, par, fn) {
  ctx.save();
  apply(ctx, c, par);
  fn();
  ctx.restore();
}

// world -> screen (for placing overlays)
export function toScreen(c, x, y, par = 1) {
  const dx = (x - c.x * par) * c.z, dy = (y - c.y * par) * c.z;
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  return [W / 2 + c.ox + dx * cs - dy * sn, H / 2 + c.oy + dx * sn + dy * cs];
}
