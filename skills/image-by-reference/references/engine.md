# The picture engine

`assets/engine/` is a small dependency-free browser project: a deterministic picture authored
in design units, ink layers with their own surface, shape/texture kits, composite motifs, a
WebGL finishing pass, a preview page and a headless renderer that writes PNGs. The pipeline is
style-neutral; the kits suit shape-based styles and are meant to be extended or replaced.

## Contents
1. Layout and the PICTURE contract
2. Design units, size and supersampling
3. Determinism
4. Ink layers and surfaces
5. The kits: draw.js, texture.js, motifs.js
6. Type
7. Rendering commands
8. Performance and gotchas

---

## 1. Layout and the PICTURE contract

```
index.html          preview (seed, 3-value view, beside-reference view, draft/full)
src/main.js         scene canvas, downsampling, post; ?render=1 exposes window.PICTURE
src/picture.js      THE picture: size, design, render, notan, seed, load(), draw(ctx, env)
src/palette.js      this picture's inks by role: prompt hues fitted to the reference's structure
src/core.js         clamp/lerp/ease, seeded rng/hash, value noise, fbm
src/draw.js         shapes as point lists: catmull, resample, rough/stencil, spear, taper,
                    ridge, scallop, blob, crescent/lune, scatter, inPoly, hatch, stipple, text
src/texture.js      paper, grain, mottle, speck, stains, noise canvases; makeInk (ink layers)
src/motifs.js       billow, ribbons, interlock, spearShape (print/poster recipes)
src/post.js         WebGL: grade, vignette, grain, chromatic aberration, palette lock + dither
render/render.mjs   headless Chrome -> out/*.png (full, draft, crop, notan, seed variants)
```

`picture.draw(ctx, env)` paints back to front and returns post params. `env` provides:
`W, H` (design units), `px` (scene pixels per unit), `seed`, `rng` (seeded), `ink(color, fn,
opts)`, `pixels(fn)` (raw scene-pixel access for surfaces), `base` (the design→scene transform).

`window.PICTURE` (render mode): `ready`, `info()`, `render({ scale, seed, crop, view })` → PNG
data URL. Anything honoring it renders with `render.mjs`, including a page drawing with
Three.js.

## 2. Design units, size and supersampling

- `size` is the output in pixels at scale 1; default to the reference's aspect, long edge
  ≥ 2400. `design.w` (default 1000) is the authoring width; the height follows the aspect.
  Author everything in design units so drafts, crops and full renders agree.
- Convert reference measurements: a feature of `w ‰H` is `w × H / 1000` design units.
- `render.supersample` (default 2) renders the scene larger and downsamples in halving steps:
  crisp anti-aliased edges. Raise it for very fine linework; `render.pixelate: <native height>`
  for pixel art (nearest-neighbour upscale).

## 3. Determinism

Every render is a pure function of the seed: no `Math.random()`, no clock, no state carried
between renders. Use `rng(seed)`, `hash`, `noise`, `fbm`. Give every element its own seed so
changing one element doesn't reshuffle the rest. Generated textures are cached per size and
seed. Same seed → identical PNG; `--variants 1,2,3` explores alternatives.

## 4. Ink layers and surfaces

`env.ink(color, draw, opts)` draws `draw(layerCtx)` (design units) on a transparent layer,
recolors everything on it to exactly `color`, applies that ink's surface, and composites:

| opt | meaning |
| --- | --- |
| `offset: [dx, dy]` | registration error of this screen/plate (design units) |
| `mottle`, `mottleCell` | uneven ink density (0–1), feature size (fraction of H) |
| `speckle`, `speckleSize` | tiny unprinted specks where paper shows through |
| `opacity`, `blend` | `'source-over'` for opaque inks, `'multiply'` for transparent (riso, woodblock) |
| `seed` | per-ink texture seed |

Inside `draw`, any fill color works (it is recolored); `destination-out` carves holes (pockets
in a lit cap). For multi-color passes without print texture, draw directly on `ctx`.

Surfaces in pixel space via `env.pixels((c, w, h) => …)`: `paper(c, w, h, {color, mottle,
mottleCell, grain, grainSize, fibers, seed})`, `stains(...)`, or your own texture canvases
(`noiseCanvas`, `grainCanvas`, `speckCanvas`). Sizes are fractions of the height.

## 5. The kits

- **draw.js**: build shapes as point arrays, then `path(pts)` to fill. `stencil(pts, seed, amp)`
  = resample + rough edge. `spear`, `taper`, `ridge`/`toBase`, `scallop`, `blob`,
  `crescent`/`lune` (subtraction as one polygon), `scatter` (spaced placement), `inPoly`,
  `distTo`, `offset`, `hatch`, `stipple`, `withClip`, `text`, `fitText`.
- **motifs.js**: `billow` (lit mass: cap, lobes, pockets, wings), `ribbons` (direction-field
  streaks), `interlock` (two inks meeting through spears), `spearShape`. Recipes, not looks:
  tune every parameter against reference crops.
- Write style-specific motifs in your project (a tree, a wave, a figure) as functions that
  return point lists or draw through `ink`, with their own seeds.

## 6. Type

`text(ctx, s, x, y, {size, font, weight, track, align, sx, color})` and `fitText(...)` (scales
horizontally to an exact width, like hand lettering fitted to a band). System fonts work in
headless Chrome (e.g. Gill Sans, Futura, Avenir, DIN on macOS); for others self-host the font
file next to the project and load it with `FontFace` in `picture.load()`. Verify spelling,
fit and margins on a full-resolution crop.

## 7. Rendering commands

```bash
node render/render.mjs                               # out/<name>.png at full size
node render/render.mjs --scale 0.5                   # fast draft
node render/render.mjs --crop 0.3,0.2,0.25,0.2       # x,y,w,h fractions at full resolution
node render/render.mjs --view notan --scale 0.4      # 3-value study (picture.notan thresholds)
node render/render.mjs --variants 1,2,3,4 --scale 0.3 --sheet seeds   # seed variants + sheet
python3 <skill>/scripts/compare.py refs/reference.png out/<name>.png --palette "#…,#…"  # style score + sheet
```

Options: `--seed N`, `--out file.png`, `--name`, `--chrome <path>`, `--root <dir>`. The
renderer prefers Playwright's `chrome-headless-shell`; set `CHROME_PATH` to override.
Preview: `npx serve .` and open `index.html` (the agent's built-in browser usually can't reach
servers it starts; review with PNGs instead).

## 8. Performance and gotchas

- A 1774×2400 poster at supersample 2 with ~60 ink layers renders in about 15–20 s; drafts at
  0.5 in about 4 s. Crops render the full picture, then cut.
- **Clip + even-odd subtraction leaves a faint anti-aliased ring** along the cut edge (visible
  at 1:1). Use `lune()` / `crescent()` or `destination-out` on a layer instead.
- `stencil`/`rough` on tiny shapes: keep `amp` below ~8 % of the shape's width or it frays.
- Always `save()`/`restore()` around clips in a layer; a leaked clip blanks later drawing.
- Large canvases: every full-size layer at supersample 2 is ~70 MB. The ink layer is reused,
  mottle masks are built at reduced resolution, and the texture cache keeps at most 10
  canvases. A render that comes back solid black means GPU memory ran out: look for
  full-size canvases you create per ink or per element and share or shrink them. Very large
  outputs (> 6000 px) may need supersample 1.5.
- Text measured before fonts load comes out wrong: `ready` waits for `document.fonts.ready`
  and `picture.load()`.
- When something is missing: draw order (covered by a later ink), clip leak, a shape outside
  the frame, or a `scatter` predicate that never passes.
