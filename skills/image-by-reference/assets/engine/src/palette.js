// Inks by role for THIS picture: hues chosen for the prompt, fitted to the reference's palette
// structure (count, value ladder, chroma levels) with scripts/derive_palette.py. Keep a role
// comment per ink and fill with these exact hexes: blends, gradients and transparency create
// colors the style may not have.
export const P = {
  paper: '#e9e1cf',  // unprinted paper / lightest
  ink: '#22201c',    // darkest: silhouettes, type
  field: '#5b6e7a',  // dominant mid field
  light: '#d8cfb8',  // highlights
  accent: '#c8553d', // most saturated, used sparingly
};

const toRGB = hex => { const p = parseInt(hex.slice(1), 16); return [(p >> 16) & 255, (p >> 8) & 255, p & 255]; };
export const rgb = toRGB;
export function mix(a, b, t) {
  const pa = toRGB(a), pb = toRGB(b);
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('');
}
export function rgba(hex, a) { const [r, g, b] = toRGB(hex); return `rgba(${r},${g},${b},${a})`; }
// palette as 0..1 RGB triples for post.paletteLock
export const lockList = inks => inks.map(h => toRGB(h).map(x => x / 255));
