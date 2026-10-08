# From style traits to techniques

The reference decides the look. This file is how you turn the style bible into concrete
techniques for *any* style: first decompose the style into traits, then pick the technique that
reproduces each trait at the highest fidelity at viewing size, then prove it with a look-dev frame
compared side by side with reference frames. The quality bar is HIGH: choose a simpler technique
only when its result is indistinguishable, never because the better one is more work.

## Contents
1. Decompose the style (eight axes)
2. Look development: the side-by-side test
3. Style families (what to measure, how to build, pitfalls)
   - 3.1 Flat / graphic 2D (poster, screenprint, motion design)
   - 3.2 Cel / anime (limited animation)
   - 3.3 Painterly / textured 2D (gouache, watercolor, storybook)
   - 3.4 Line / sketch / hand-drawn
   - 3.5 Pixel art
   - 3.6 3D (toon or realistic CG)
   - 3.7 Collage / cut-out / stop-motion feel
   - 3.8 Kinetic typography / motion graphics / UI explainers
   - 3.9 Cinematic / live-action feel
   - 3.10 Mixed media
4. Post pass presets
5. Adapting a fixed character to a different style

---

## 1. Decompose the style (eight axes)

Write one line per axis in the style bible. Each line should name a measurable trait and the
principle behind it ("why the reference does it").

| Axis | Questions | Example findings |
| --- | --- | --- |
| Form | Shapes or lines? Geometric or organic? Outlines (where, what weight)? Silhouette clarity? | "no outlines except explosions; chunky geometric silhouettes" · "tapered ink lines, 2–4 px, darker inside folds" |
| Light | Shading model (flat, 2-tone cel, soft gradient, PBR)? Rim lights? Ambient occlusion? Glows/bloom? | "hard shadow shapes + cool rim" · "soft painted gradients, warm key/cool fill" |
| Surface | Texture, grain, paper, brush marks, noise, dithering, film grain | "fine grain held 2 frames" · "watercolor blooms at edges" |
| Color | Palette (k-means), saturation, value structure, grade, how color changes per act | "4 inks + white" · "teal-orange grade, crushed blacks" |
| Motion | Drawing rate/holds, easing character, smears, squash/stretch, motion blur, physics feel | "characters on 2s–3s, camera on 1s" · "smooth 60 fps with motion blur" |
| Lens & camera | Angles, focal feel, distortion, depth of field, parallax, shake, moves | "fisheye low angles, stepped shake" · "shallow DOF rack focus, slow dolly" |
| Edit | Shot lengths, cut rhythm vs. music, transitions (flash, match, whip), title treatment | "cuts on 2–4 beats; white flash frames" · "long takes, dissolves" |
| Sound | Genre, tempo, key, accents, silence, Foley density | "160 BPM surf rock in F#; silence before punchline" |

## 2. Look development: the side-by-side test

Before producing shots, build one **look-dev frame**: a representative set + the hero + one FX +
one piece of text, lit with the act's lighting. Render it and place it next to 2–3 reference
frames in one contact sheet (the analyzer's sheets give you reference frames; tile with ffmpeg
`hstack`/`tile`). Compare axis by axis at full resolution. Iterate until a stranger would believe
they belong to the same production and your frame looks as finished as the reference's. This one
step catches most style drift early. Repeat it whenever you add a
new kind of element (new FX, new location).

## 3. Style families

### 3.1 Flat / graphic 2D (poster, screenprint, motion design)
- Measure: palette (often 3–6 inks), outline policy, shadow shapes, grain, drawing rate.
- Build: Canvas 2D paths; `solid()` = fill + hard shadow crescent + rim crescent
  (`crescentX` for unions of overlapping parts); glows via screen blend; speed lines/impact
  frames; flat backgrounds with silhouetted midgrounds; held drawings (`onN(t, 2)`).
- Post: optional barrel lens, vignette, fine grain held on twos, flash frames.
- Pitfalls: big empty flat areas look unfinished; fill with environment detail. Heavy
  translucent light shafts look cheap; keep them subtle. A reserved hero color must stay
  reserved.
- Worked example (from the source production): flat red/ink/lemon/blue screenprint, coral hero,
  fisheye low angles, silhouette → color reveal, impact frames on hits.

### 3.2 Cel / anime (limited animation)
- Measure: line weight and color (colored lines in lit areas?), 2-tone vs. 3-tone cel, highlight
  shapes, background painting style vs. character flatness, held frames (often 3s), smears,
  impact frames, camera pans across still art, lens flares, chromatic aberration, bloom.
- Build: characters as filled shapes plus stroked lines (draw lines as filled tapered polygons
  for weight variation); cel shadow = second flat shape clipped to the form; backgrounds as
  painted layers (gradients + texture, §3.3) moving with parallax; smear frames (stretched
  shapes for 1–2 frames on fast moves); speed-line backgrounds for action; "sakuga" moments on
  1s, everything else on 2s/3s.
- Post: bloom (blur the bright pass and add), slight chromatic aberration, light grain, flares
  as additive shapes.
- Pitfalls: uniform line weight looks vector-flat; inconsistent line color between shots.

### 3.3 Painterly / textured 2D (gouache, watercolor, storybook)
- Measure: brush texture scale, edge softness, paper grain, color bleeding, value range
  (usually compressed), whether things move as rigid paintings or are animated.
- Build: generate textures once at load from seeded noise (multi-octave value noise into an
  offscreen canvas) and reuse via `createPattern` + `multiply`/`overlay` blending; soft edges
  with `ctx.filter = 'blur(…)'` on offscreen layers; stroke-like shapes (many short, slightly
  varied quadrilaterals) for brushwork; edge darkening (draw the shape slightly smaller and lighter
  on top of a darker base); atmospheric perspective (lerp distant layers toward the sky color).
- Motion: gentle, eased, often parallax-driven; limited character animation.
- Post: paper grain overlay, slight vignette, warm grade.
- Pitfalls: noise regenerated per frame (shimmers, breaks determinism); generate once, seed it.

### 3.4 Line / sketch / hand-drawn
- Measure: line boil (does the line wobble every frame?), stroke pressure, hatching for shade,
  color fills off-register from lines, paper color.
- Build: draw strokes as filled polygons with width from a pressure curve; **boil** by
  re-seeding a small jitter per held frame (`hash(Math.floor(t * 8))`); hatching = clipped
  parallel strokes whose density encodes value; fills offset 1–3 px from lines.
- Pitfalls: jitter too large reads as broken; boil on 2s or 3s, not every frame.

### 3.5 Pixel art
- Measure: native resolution (count pixels per screen height, e.g. 180 or 240), palette size,
  sprite frame counts (often 4–8 per cycle), dithering, sub-pixel motion (usually none),
  CRT/scanline treatment.
- Build: render the scene into a low-res offscreen canvas at native resolution with integer
  positions, `imageSmoothingEnabled = false`, then upscale with nearest-neighbour (the template
  supports a `pixelate` option in the post settings). Quantize colors to the palette; use
  ordered dithering for gradients; animate sprites by frame index, not by tweening rotation.
- Pitfalls: rotated or scaled sprites break the pixel grid; anti-aliased canvas paths add colors
  outside the palette (snap and quantize).

### 3.6 3D (toon or realistic CG)
- Measure: shading model (toon ramps, outlines, PBR), lighting rig (key/rim/fill colors),
  materials, DOF, bloom, motion blur, camera lenses (wide vs. tele), animation style
  (keyframed vs. physics).
- Build: Three.js in the same page (vendor the module file into the project so renders don't
  depend on the network). Drive everything from `t`; never use `Clock`. Toon: `MeshToonMaterial`
  with a gradient map, inverted-hull outlines, rim via a Fresnel term. Realistic: PBR materials
  and an environment map. Model with primitives, extrusions, lathes and simple rigs (bones or
  hierarchical groups). `preserveDrawingBuffer: true` for capture. Composite 2D overlays (titles)
  in the 2D scene canvas or a second canvas.
- Post: bloom, DOF (render depth or blur background layers), motion blur via subframes,
  grade, grain.
- Pitfalls: render time grows fast (shadows, high-res buffers, subframes); test throughput early.
  Default lighting looks like a tech demo, so match the reference's light colors deliberately.

### 3.7 Collage / cut-out / stop-motion feel
- Measure: frame rate (often 12 fps for everything, camera included), replacement jitter,
  paper or photo textures, drop shadows from cut paper, torn edges, light flicker.
- Build: hold the whole frame on 2s (camera too); add per-held-frame micro jitter to positions
  and rotations; shapes with rough edges (noise-displaced polygons) and a soft drop shadow
  underneath; textures from seeded noise; exposure flicker as a tiny brightness change per frame.
- Pitfalls: smooth camera moves break the illusion.

### 3.8 Kinetic typography / motion graphics / UI explainers
- Measure: type families/weights, grid and margins, easing signatures (expo-out, back,
  spring), how text enters (masks, slides, per-letter), sync to beats, color blocking, 60 vs.
  24 fps.
- Build: text as the hero: per-glyph animation with `measureText` layouts, masks with clip paths,
  strict alignment to a grid, custom easing curves, transitions as shape wipes. Motion blur
  subframes help a lot at speed.
- Pitfalls: too many simultaneous moves; information pacing rules apply doubly.

### 3.9 Cinematic / live-action feel
- Measure: aspect ratio (letterbox 2.39:1?), shot lengths (longer), DOF, grade, grain, gate
  weave, handheld camera, lens flares, motion blur, practical-light glow.
- Build: depth-layered scenes with blur that increases with distance from the focal plane
  (`ctx.filter = blur(px)` on layer canvases); smooth (not stepped) handheld noise; slow
  dollies; subframe motion blur (180° shutter ≈ half the frame interval); bloom on practicals.
- Post: grade (contrast/saturation/tint split), grain every frame, letterbox bars, slight
  vignette, very slight chromatic aberration.
- Pitfalls: stepped shake or on-twos holds instantly read as "animation". Don't use them here.

### 3.10 Mixed media
Treat each layer per its family (e.g. painted backgrounds + cel characters + 3D props) and unify
with a shared grade, grain and lighting direction. The side-by-side test matters most here.

## 4. Post pass presets

The template's `post.run()` parameters, returned per shot from `film.draw()`:

| Look | k (barrel) | vig | grain | grade | ca | other |
| --- | --- | --- | --- | --- | --- | --- |
| Flat graphic / trailer | 0.12–0.3 | 0.3–0.45 | 0.03 | neutral | 0 | flash frames |
| Anime | 0–0.05 | 0.25 | 0.015 | sat +10% | 0.6–1.2 px | bloom (draw glows), flares |
| Painterly | 0 | 0.35 | 0.04 | warm tint, contrast −10% | 0 | paper overlay |
| Pixel | 0 | 0 | 0 | palette-locked | 0 | `pixelate` to native res |
| Cinematic | 0–0.05 | 0.4 | 0.05 | contrast +, tint split | 0.5 px | `motionBlur` 4–8 subframes, letterbox |
| Motion graphics | 0 | 0 | 0 | neutral | 0 | `motionBlur` 4 subframes |

Settings: `{k, vig, grain, seed, flash, flashCol, contrast, saturation, tint:[r,g,b], tintAmt,
ca}`; render settings in `film.render`: `{supersample, pixelate, motionBlur, shutter}`.

## 5. Adapting a fixed character to a different style

When the brief fixes a character (a mascot sheet in `refs/`) and the reference has another style:
keep what makes the character recognizable (silhouette, proportions, signature color, eye
design) and restyle everything else to the reference's rules: line, shading model, texture,
frame rate, lighting. Measure the character from its sheet, build the rig in its own units, then
apply the reference's rendering model to the rig's parts. A blocky pixel mascot can be extruded
into voxels for a 3D reference, drawn with tapered ink lines for an anime reference, or kept as
true pixels for a pixel-art reference. Check the side-by-side test with both the character sheet
and the reference frames.
