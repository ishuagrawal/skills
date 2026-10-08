// Named swatches. REPLACE the values with your style bible's measured palette (k-means of the
// reference) and keep a role comment per swatch. The bundled 2D kits (draw.js, fx.js) refer to
// these names; rename consistently if you change them.
export const P = {
  ink: '#07060b',
  ink2: '#121022',
  ink3: '#1d1a35',
  navyDeep: '#08104f',
  navy: '#0e1f96',
  night: '#152585',
  blue: '#425bdf',
  blueLt: '#7489ff',
  sky: '#a9b8ff',
  cyan: '#8ff0ff',
  red: '#f22a52',
  redDk: '#b3123a',
  redDeep: '#6e0a2a',
  pink: '#ff7a9a',
  lemon: '#faf691',
  lemonDk: '#e9d85a',
  gold: '#f5c542',
  cream: '#f2f3ee',
  paper: '#fbf7e6',
  coral: '#da7758',
  coralDk: '#a94a30',
  coralLt: '#f7a283',
  green: '#3cff8f',
  term: '#0d0c18',
  termDim: '#7c80a8',
};

// mix two hex colors
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
export function rgba(hex, a) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}
