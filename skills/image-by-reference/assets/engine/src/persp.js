// A pinhole camera for scenes that need real perspective (streets, rooms, vehicles, coastlines
// seen from a height). Build the scene in meters (x right, y up, z forward), project to design
// units, then draw the projected polygons with the 2D kits. Rules of thumb in references/engine.md.
//
//   const cam = camera({ eye: [0, 1.7, 0], pitch: -0.15, fov: 50, W: env.W, H: env.H });
//   const [sx, sy, z] = cam.P(x, y, z);        // design units + depth (meters)
//   l.fill(path(cam.poly([[x0,y0,z0], ...])));  // any planar polygon
//   cam.horizon                                  // screen y of the horizon (eye level)
export function camera({ eye = [0, 1.7, 0], pitch = 0, yaw = 0, fov = 50, W = 1000, H = 1353, cx = W / 2, cy = H / 2 } = {}) {
  const f = (W / 2) / Math.tan((fov * Math.PI) / 360);
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const view = (x, y, z) => {
    let X = x - eye[0], Y = y - eye[1], Z = z - eye[2];
    [X, Z] = [X * cyw - Z * syw, X * syw + Z * cyw];        // yaw about y
    [Y, Z] = [Y * cp - Z * sp, Y * sp + Z * cp];            // pitch about x (negative looks down)
    return [X, Y, Z];
  };
  const P = (x, y, z) => {
    const [X, Y, Z] = view(x, y, z);
    const z0 = Math.max(Z, 0.05);
    return [cx + (f * X) / z0, cy - (f * Y) / z0, Z];
  };
  return {
    f, eye, P, view,
    poly: pts => pts.map(([x, y, z]) => P(x, y, z).slice(0, 2)),
    // screen size of `meters` at depth z (for line widths, mark sizes, figure heights)
    size: (meters, z) => (f * meters) / Math.max(z, 0.05),
    horizon: cy - f * Math.tan(-pitch),
    // a quad on a plane given by an origin and two axis vectors, in local (u, v) meters
    plane: (o, U, V) => (u, v) => [o[0] + U[0] * u + V[0] * v, o[1] + U[1] * u + V[1] * v, o[2] + U[2] * u + V[2] * v],
  };
}
