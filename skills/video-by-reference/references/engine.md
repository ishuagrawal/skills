# The animation engine

The template in `assets/engine/` is a small, dependency-free browser project with a deterministic
`frame(t)` renderer, a cue sheet, a camera, a configurable post pass, a Web Audio synth, a
preview player and a headless renderer that turns it into an MP4. The **pipeline is
style-neutral**. The bundled 2D drawing kits (`draw.js`, `fx.js`) are one option for
shape-based styles. Choose, extend or replace the drawing layer per `style-techniques.md`
(e.g. painterly textures, pixel canvases, or Three.js for 3D) while keeping the rest.

## Contents
1. Layout and the FILM contract
2. Determinism rules
3. Render settings (supersample, pixelate, motion blur) and post
4. Coordinates, camera, parallax
5. Rigs (characters from a reference image)
6. Sets, props and lighting states
7. The bundled 2D kits (draw.js, fx.js)
8. Text inside the world
9. Using a different drawing layer (3D etc.)
10. Performance and engine gotchas

---

## 1. Layout and the FILM contract

```
index.html            preview player (play/scrub/step), loads src/main.js
src/main.js           canvases, render settings, post; ?render=1 exposes window.FILM
src/core.js           W,H,FPS,BPM; easing; seg/key; onN (holds); seeded rng/noise; shake/hit
src/timeline.js       THE cue sheet (MUSIC, bar(), beat(), C = {...})
src/film.js           shot list → draw(ctx, t) → post params; `render` settings
src/palette.js        colors + mix/rgba helpers (replace with the bible's palette)
src/draw.js           2D kit: shapes, solid/crescent shading, glow, cone, lines, text
src/camera.js         cam(), withCam() (parallax), toScreen()
src/fx.js             2D FX: puffs, sparks, bolt, ring, papers, explosion, firework, shards, titleCard…
src/post.js           WebGL: barrel lens, vignette, grain, grade, chromatic aberration, flash
src/audio/engine.js   synth: buses, reverbs, drums, plucks, bass, stabs, bells, pads, Foley
src/audio/score.js    renderSoundtrack(duration) → AudioBuffer; toWav()
src/shots/*.js        your scenes (export arrays of {name, start, end, draw})
render/render.mjs     headless renderer → out/*.mp4, stills, contact sheets
```

`window.FILM` (render mode) provides `ready` (Promise), `info()` → `{duration,fps,w,h}`,
`frame(t, scale)` → PNG data URL, `audioWav()` → base64 WAV. Anything honoring this contract
renders with `render/render.mjs`, including a page that draws with WebGL/Three.js.

## 2. Determinism rules

The renderer jumps to arbitrary times, renders stills out of order, and re-renders ranges. Every
frame must be a pure function of `t`:

- No `Math.random()`, no wall clock, no simulation stepping, no state carried between frames.
  Particles are analytic (p0 + v·t + ½g·t², drag via `(1 − e^{−kt})/k`), seeded per particle.
- Use `rng(seed)` / `hash()` / `noise()` from core.js. Generated textures are built once at load
  from fixed seeds and reused.
- Drawing rate is a style choice from the bible. `onN(t, n)` holds a pose for n frames (2s/3s for
  limited animation, cut-out and stop-motion). Pass raw `t` for styles that move on 1s. Camera
  usually moves on 1s even when drawings hold, except in stop-motion and cut-out styles.
- Shots receive absolute `t` and compute progress against cues: `seg(t, C.a, C.b, ease)`,
  `key(t, [[time, value, ease], ...])`.

## 3. Render settings and post

`film.render = { supersample, pixelate, motionBlur, shutter }` (all optional):
- `supersample` (default 1.25): the scene canvas resolution multiplier before post, giving crisp
  edges after lens distortion.
- `pixelate` (e.g. 240): render into a canvas this many pixels tall and upscale with
  nearest-neighbour for pixel-art styles.
- `motionBlur` (subframes, e.g. 6) and `shutter` (0..1 of the frame interval, 0.5 ≈ 180°):
  averages subframes for cinematic/motion-graphics styles. Costs `motionBlur×` render time.

Per-shot post params returned from `film.draw()`: `k` (barrel lens), `vig`, `grain` (held on
twos), `contrast`, `saturation`, `tint` + `tintAmt` (grade), `ca` (chromatic aberration in px),
`flash` + `flashCol` (flash frames). Presets per style family are in `style-techniques.md` §4. Use
only what the reference shows: a lens curve or grain the reference doesn't have is style drift.

## 4. Coordinates, camera, parallax

- Author overlays in a 1920×1080 screen space.
- Author sets in **world units that mean something** (cm on a desk, m in a street). `cam(x, y, z)`
  centers world (x, y) with `z` px per unit. The frame's half extents are `960/z × 540/z`. Compute
  them when placing props a shot needs.
- Multiplane: draw background layers with parallax < 1 (`withCam(ctx, c, 0.92, fn)`) and the
  foreground with parallax > 1. A character interacting with a background-layer object (sitting
  on a window sill) is drawn in that layer's coordinates.
- `toScreen(cam, x, y)` converts world points to screen for impact lines, labels and trackers.
- Camera behavior comes from the bible: stepped shake vs. smooth handheld, push-ins vs.
  locked-off, fisheye vs. long lens. Follow cameras must track the action's extents. Recompute
  the target every frame so a jump apex never leaves the frame.

## 5. Rigs (characters from a reference image)

1. Decode the image and measure proportions from the pixels (Python `zlib` + `struct` reads PNGs
   without dependencies): bounding boxes of the main color, row spans (head, body, limbs), eye
   positions and sizes, exact hex colors. Keep the numbers in the rig file's header comment.
2. Build the rig in the image's own units, with the origin at the ground point, scaled by
   `s / bodyWidth`. Parameters that pay off: squash/stretch about the feet, rotation about the
   center, shear (lean), per-limb lift/swing/rotation/length, eye expressions (open, happy,
   wide, tiny, closed, x, squint, worried, star, none), look direction, blink, silhouette amount,
   glowing eyes, light/shadow specs, alpha.
3. Return anchors in caller space (hands, head top, eyes, feet) so props attach without guessing.
4. Render the rig in the reference's rendering model (style-techniques §5). The rig's geometry
   is the character; its shading, line and texture come from the reference.
5. Acting (any style): anticipation before big moves, squash on landings, overshoot on pops,
   eyes carry most emotion, small bounces on the beat when happy, a freeze for realization.

## 6. Sets, props and lighting states

- One world per location, with a `room(ctx, cam, L, options)` composer that draws layers in order
  and hook callbacks (`wallExtra`, `deskBack`, `deskMid`, `deskFront`, `fg`) so shots inject
  characters and FX at the right depth.
- Props are functions `(ctx, L, x, y, opts)` in world units that read the lighting state `L`.
- Lighting state per act: background colors, tint color/amount, rim color, shadow color, light
  position (or, in 3D, a light rig preset). A story-motivated switch makes the lighting change a
  beat.
- Detail sells "high quality": labels, notes, objects that pay off later, a clock that advances.
- Plan placement against shots. Key props must be inside the frames that need them, must not hide
  behind larger props (draw order), and must leave room for the action. Avoid dead regions (a
  black slab under a desk, a wall that fills half the frame): add environment or reframe.

## 7. The bundled 2D kits (draw.js, fx.js)

For shape-based 2D styles (flat/graphic, cel fills, cut-out, motion graphics):

- `solid(ctx, path, base, {sh, rim, rim2}, complex)` = fill + shadow band + rim band(s).
  `crescent()` uses an even-odd clip (fast, for simple paths). `crescentX()` uses an offscreen layer
  (needed for unions of overlapping pieces, where even-odd would punch holes).
- `glow` (screen blend), `cone` (light shafts; keep them subtle), `speedLines` (impact frames),
  `streaks` (motion), `sparkle`, `text` with font families.
- `fx.js`: puffs (smoke/dust/sand), sparks, bolt (electricity, re-seed per held frame), ring
  (shockwave), papers/makeSheets (flurries, confetti, photos), explosion (cel fireball), firework
  (+ shapes from sampled paths), rocketTrail, shards, titleCard (name slab + delayed detail line,
  held for `dur`).
- Recipe for an impact frame (if the reference uses them): 1–3 frames with a flat accent background,
  the subject in silhouette and radial speed lines, then a 1–2 frame flash and a decaying camera hit.

For other styles, write the equivalent kit (textures and brushes, tapered lines with boil, pixel
sprites, 3D materials) following `style-techniques.md`, and keep the same determinism and
lighting-state conventions.

## 8. Text inside the world

Screens, signs and scoreboards are drawn in a **virtual canvas space** (e.g. 1600×900 for a
monitor) mapped into the prop's rectangle. Write helpers that convert virtual points to world
(`scr(vx, vy)`) and give the zoom at which N virtual pixels fill the frame (`scrZoom(vw)`). Use
them to frame text deliberately with margins, so lines are never clipped or hidden under
foreground silhouettes. Typing: `typed(str, t, t0, cps)` plus a blinking cursor. Dim old text when
new text is the point.

## 9. Using a different drawing layer (3D etc.)

Keep `main.js`'s contract and swap what `film.draw()` paints:
- **Three.js**: render into a WebGL canvas with `preserveDrawingBuffer: true`, then
  `drawImage` it into the scene canvas each frame, or adapt `main.js` to read it directly. Vendor
  `three.module.js` into the project. Set object transforms, camera and material uniforms from
  `t` before each render. Overlays (titles, UI) are drawn in 2D on top.
- **SVG / DOM** for type-heavy work: rasterize via `drawImage` of an SVG image or render on
  canvas. Avoid CSS animations, which are clock-driven and not seekable.
- **Image assets** (when the user supplies art): preload in `film.load()` and draw transformed.
  `load()` must resolve before `FILM.ready`.

## 10. Performance and engine gotchas

- Expect ~8–9 fps at 1080p with ×1.25 supersampling on a fast laptop (PNG encoding dominates), so
  a 100 s film takes about 5 minutes. Motion-blur subframes and 3D shadows multiply that. Contact
  sheets of stills are the fast iteration loop.
- Always `save()/restore()` around clips and transforms in hooks. A leaked clip blanks the layers
  drawn after it.
- `DOMMatrix` order: `translate → rotate → scale` reads outside-in. Return anchors by transforming
  local points through the same matrix you drew with.
- Clamp radii (`Math.max(0.01, r)`); shrinking FX hit 0.
- When something disappears, check in order: wrong layer or draw order, outside frame bounds,
  alpha 0 from a clamped easing, a state condition that never becomes true.
- Duplicate characters mean a state-machine bug. Give each character one position function per
  shot that returns `{x, y, mode}`, and derive everything from it.
