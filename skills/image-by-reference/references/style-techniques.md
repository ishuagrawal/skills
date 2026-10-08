# From style traits to techniques (stills)

First decompose the style into traits (reference-analysis.md §4), then pick the technique that
reproduces each trait at the highest fidelity at full size, then prove it with a patch test
beside a reference crop at the same scale. The quality bar is HIGH: choose a simpler technique
only when its result is indistinguishable at 1:1.

## Contents
0. Palette structure (colors from the prompt)
1. The patch test
2. Mark recipes (shared by many styles)
3. Style families
   - 3.1 Flat graphic / screenprint / travel poster
   - 3.2 Woodblock (ukiyo-e, linocut)
   - 3.3 Risograph, halftone, comic print
   - 3.4 Vector / flat illustration / geometric
   - 3.5 Line art, ink, engraving, etching
   - 3.6 Painterly (gouache, watercolor, oil, pastel)
   - 3.7 Pixel art
   - 3.8 Low-poly, isometric, 3D toon (Three.js)
   - 3.9 Collage / cut paper
   - 3.10 Typographic and Swiss/Bauhaus posters
   - 3.11 Photographic or cinematic looks (limits)
4. Post-pass presets
5. What reads wrong (and why)

---

## 0. Palette structure (colors from the prompt)

The reference's hues are content; its palette structure is style. Choose hues for the prompt's
content, then fit them with `scripts/derive_palette.py`:

- **Ink count**: as many colors as the reference (±1). More colors than that is the most common
  way a flat style stops looking like itself.
- **Value ladder**: each ink's lightness lands on the reference's ladder (sorted by L*), so the
  value steps between forms feel the same.
- **Chroma by rank**: your most saturated hue gets the reference's accent chroma, near-neutrals
  stay near-neutral, everything else gets the reference's typical chroma.
- **Area roles**: give the big areas to the same ladder steps as the reference (if its
  dominant ink is a mid-dark covering a third of the picture, make your dominant ink a
  mid-dark too, whatever its hue).
- **Reuse**: one ink plays several roles across planes, like the reference.
- Prompt-driven exceptions: a night prompt lowers the key (`--value-fit` below 1), a "neon"
  prompt raises chroma (`--chroma-scale`). Note the exception in your summary.

## 1. The patch test

Pick the hardest element of the new subject. Render it at full resolution with `--crop`, and
tile it beside the reference crop that shows the same kind of element or mark (a cloud beside
its cloud, a figure's shading beside its shading, any flat area beside its flat area) at the
same relative scale (compare.py's close-up row does this for the busiest and focal areas). Compare
edge, mark size, value steps and texture. Iterate here, where a render is a few seconds, before
building the rest. Repeat whenever you introduce a new kind of element.

## 2. Mark recipes (shared by many styles)

All in `assets/engine/src/draw.js` and `motifs.js`; sizes in design units.

- **Spear** (`spear`, `motifs.spearShape`): a sliver pointed at both ends, widest at `head`.
  Sky strata, water glints, reflections, slope streaks, rain, grass. Ragged ends via `stencil`.
- **Interlocking band** (`motifs.interlock`): spears of ink A reaching into ink B and vice
  versa along a boundary: how flat prints make atmosphere, haze and water without gradients.
- **Crescent / wing** (`crescent`): oval minus shifted oval, as one polygon (`lune`). Flat ovals
  give hooked "wings" (cloud highlights, foam, feathers, leaves); round ones give moons.
- **Billow** (`motifs.billow`): a mass lit from one side: lit cap with a scalloped edge, lumpy
  lobes over the terminator, bird-shaped shadow pockets along internal tiers, wing crescents
  thinning into the shadow. Clouds, smoke, spray, foam, foliage clumps, hair.
- **Ribbons** (`motifs.ribbons`): streaks along a direction field (the fall line), interlocking
  in 2–3 inks. Mountains, rock faces, dunes, snowfields, drapery.
- **Dabs**: short slanted spears in clusters, in a lighter ink inside a dark mass (lit needles,
  scrub, texture in silhouettes). Trunk lines: thin tapered verticals with forks.
- **Stencil edge** (`stencil`, `rough`): resample + displace along normals; amp ≈ the
  reference's edge wobble at 1:1 (often 0.3–1 design unit), wavelength 3–6 units.
- **Ridge** (`ridge`): midpoint-displaced silhouette for mountains, tree lines, coastlines.
- **Hatching / stipple** (`hatch`, `stipple`): value by density; see 3.5.
- **Scatter** (`scatter`): Poisson-ish placement with spacing that varies with position, so
  marks thin out with distance from the light, the focal point or an edge. Never place marks
  on a grid or along one offset line: rows of equal marks read as scales or bead borders.

## 3. Style families

### 3.1 Flat graphic / screenprint / travel poster (worked example)
- Measure: ink count and value ladder, which planes share an ink, edge wobble at 1:1, mottle
  and grain, misregistration (gaps or overlaps between inks), lettering style (if text is
  wanted).
- Build: paper first (`paper`, light `stains` if the reference is aged), then `env.ink` per
  screen in print order (light to dark is typical, but follow the reference's overlaps).
  Big flat masses, then interlocking bands, then marks, then type. Same ink across planes when
  the reference does it. Offsets ≤ 0.5 unit unless visible misregistration is a trait.
- Post: none or grain only; the surface lives in the ink layers.
- Pitfalls: gradients and transparency (instant stray colors); uniform mark sizes; large
  plain areas where the reference has internal structure; clip-based crescents (seams); copying
  the reference's poster bands and emblem when the prompt didn't ask for a poster.

### 3.2 Woodblock (ukiyo-e, linocut)
- Measure: key-block line weight and taper, flat color blocks, bokashi (graded wipes on sky or
  water), wood grain in flats, paper fibers, registration.
- Build: color blocks as ink layers with `mottle` and a wood-grain texture (stretched noise
  drawn with `source-atop`); bokashi as a few stepped bands or a gradient restricted to the
  sky block (it is the one gradient this family allows); key block last with tapered lines
  (`taper`) and slight irregular breaks; `multiply` blend if inks are transparent.
- Pitfalls: uniform line weight; gradients outside bokashi areas; too clean paper.

### 3.3 Risograph, halftone, comic print
- Measure: number of drums/inks, transparency (overlaps make a third color), grain, halftone
  screen (period and angle from a 1:1 crop), misregistration amount.
- Build: each ink layer with `blend: 'multiply'`, visible `offset`, strong `speckle` and grain;
  halftone by filling the layer through a dot-pattern mask (draw dots whose radius encodes
  value, or `post` `lock` + `dither`). Ben-Day dots: regular dot grid clipped to the area.
- Pitfalls: opaque inks where the reference shows overprint colors.

### 3.4 Vector / flat illustration / geometric
- Measure: corner radii, stroke usage, gradient use (some modern flat styles do use gentle
  linear gradients — then they are a trait), grid/geometry, texture (often grain overlays).
- Build: precise geometry (no `stencil` roughness), consistent radii, shapes snapped to a grid;
  grain as a final overlay only if the reference has it.
- Pitfalls: hand-made wobble in a precise style; inconsistent stroke widths.

### 3.5 Line art, ink, engraving, etching
- Measure: line weight range and taper, hatching angles and spacing per value step,
  cross-hatching layers, stipple density, contour vs. form lines, paper tone.
- Build: lines as filled tapered polygons (`taper`), weight from a pressure curve; value by
  `hatch` density (spacing and width) per region, with angles that follow form (contour
  hatching) for engraving; `stipple` for dot work. Use `scatter` for organic placement.
- Pitfalls: mechanical parallel lines where the reference curves them with the form; too
  little contrast between value steps.

### 3.6 Painterly (gouache, watercolor, oil, pastel)
- Measure: stroke size and direction field, edge softness (edge blur > 1.5 px), color variation
  inside a mass, paper/canvas texture, wet edges (watercolor darkening), impasto highlights.
- Build: many strokes per mass along a direction field (`ribbons` with soft, partly transparent
  strokes, or custom brush stamps), color jitter within a small ΔE of each mass's base; soft
  edges via `ctx.filter = 'blur(…)'` on offscreen layers; watercolor: wash = blurred shape +
  darker rim (edge darkening) + paper texture `multiply`; gouache: flat opaque strokes with
  dry-brush breakup (speckle). Canvas weave via a texture overlay.
- Pitfalls: noise textures standing in for brushwork; strokes without a direction field;
  edges too uniformly soft (painters vary them: lost and found edges).

### 3.7 Pixel art
- Measure: native resolution (pixels per image height), palette size, dithering pattern,
  outline policy (selective outlining), sub-pixel AA (usually none).
- Build: `render.pixelate = <native height>`; integer coordinates; `post` `palette` + `lock: 1`
  to snap to the palette, `dither` for ordered dithering if the reference dithers.
- Pitfalls: anti-aliased paths adding colors (lock to palette); rotated sprites breaking the grid.

### 3.8 Low-poly, isometric, 3D toon (Three.js)
- Measure: polygon size, flat vs. smooth shading, outline (inverted hull), light colors,
  isometric angle, ambient occlusion.
- Build: Three.js in the page (vendor the module), render into a WebGL canvas with
  `preserveDrawingBuffer`, `drawImage` into the scene canvas inside `draw()`; flat-shaded
  materials or toon ramps; draw 2D overlays and type on top. Low-poly 2D: triangulate shapes
  and color each triangle by its normal against the light.
- Pitfalls: default lighting (looks like a tech demo); perspective where the reference is
  isometric.

### 3.9 Collage / cut paper
- Measure: paper textures per piece, torn vs. cut edges, drop shadows, layering order.
- Build: each piece its own layer with a texture (`noiseCanvas`), `stencil` with larger
  roughness for torn edges plus a lighter fibrous rim, a soft offset shadow below.

### 3.10 Typographic and Swiss/Bauhaus posters
- Measure: grid, margins, type families and weights, sizes in ‰H, color blocks, rotation.
- Build: a strict grid in design units; type with `text`/`fitText`, tracking from the
  reference; geometric shapes exact. Check every line's width at full resolution.

### 3.11 Photographic or cinematic looks (limits)
Code can match grade, grain, lens character and composition, but not photoreal subjects. Say
so up front and offer the closest stylized route (e.g. a painterly or 3D-toon interpretation
with the photo's grade and composition), or ask for photo assets to composite.

## 4. Post-pass presets

`picture.draw()` returns post params: `{ grain, grainSize (fraction of H), vig, contrast,
saturation, tint, tintAmt, ca, palette, lock, dither }`.

| Look | grain | vig | other |
| --- | --- | --- | --- |
| Screenprint / poster | 0–0.02 | 0 | surface in ink layers |
| Riso / halftone | 0.03–0.05 | 0 | `multiply` inks, offsets |
| Woodblock | 0.02 | 0 | paper fibers, wood grain on blocks |
| Painterly | 0.02–0.04 | 0.1–0.2 | canvas/paper texture |
| Pixel | 0 | 0 | `palette`, `lock: 1`, `dither` |
| Vector flat | 0–0.03 | 0 | — |
| Cinematic | 0.04 | 0.3 | contrast/tint grade, `ca` 0.5 |

Use only what the reference shows.

## 5. What reads wrong (and why)

From the worked example's review passes. The motif was right in principle; the placement or
regularity made it read as something else.

| Built as | Read as | Fix |
| --- | --- | --- |
| Isolated round crescents on a dark field | crescent moons | flat ovals, clustered, attached to a lit mass |
| Crescents in rows along offset lines | fish scales, pinecone | `scatter` with size varying by depth; fewer |
| Separate equal circles along a wave crest | pearls | one continuous scalloped band (billow) |
| A round lumpy ball for spray | cauliflower, brain | a plume shape leaning the way the water falls back |
| Narrow jets ending in round puffs | fountain, mushrooms | one plume with a few short fingers |
| Long horizontal strata across a cliff | layer cake, terraces | fall-line ribbons, like the reference's mountain |
| Vertical cracks with lit edges | icicles | ribbons; cracks only as short dark marks |
| Uniform tiny bumps along a cloud edge | bead border | mix big billows with small scallops |
| Thin dark dashes inside a lit cap | eyebrows | fatter pockets, paired like birds |
| Lit marks crossing the hero's silhouette | clutter | keep the hero's outline clean (print the beam behind the cloud) |
| Clip + even-odd crescents | faint rings at 1:1 | `lune` polygons |
| A big area in one dark ink | dead slab | the reference's internal texture (dabs, ribbons, trunk lines) |
