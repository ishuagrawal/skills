---
name: image-by-reference
description: Make a fully code-generated still image of whatever the user prompts, at the highest achievable visual quality, in the art style of a reference image (flat poster or screenprint, woodblock, risograph, vector illustration, ink or engraving, painterly, pixel art, low-poly, collage…). Only the style transfers (rendering, marks, edges, texture, value and saturation structure, level of detail, lighting approach); subjects, layout, colors and text come from the prompt. Measures the reference, writes a style bible that separates style from content, builds a prompt-driven palette with the reference's palette structure, draws the picture as a deterministic browser canvas rendered to PNG with headless Chrome, and scores the style against the reference. Use it whenever the user shares an image and wants something new "in this style", "drawn like this", "with this art style", a style transfer, or a set of images that share one look, even if they never say "reference" or "skill".
license: MIT
---

# Image by Reference

Turn "make me *this prompt* in the style of *this image*" into a finished, high-resolution PNG.
The reference supplies **how** things are drawn; the prompt supplies **what** is drawn and in
what colors. A viewer should say "same artist, same technique" and never "same picture with
the subject swapped".

| Style: carry it from the reference | Content: take it from the prompt |
| --- | --- |
| Rendering model and medium (screenprint, watercolor, pixel art, …) | Subjects, setting, time of day, weather, action |
| Mark vocabulary: the 3–6 kinds of marks everything is built from | Layout, viewpoint, which objects go where |
| Edge character, line use, texture and surface | Hues and color scheme |
| Palette **structure**: number of colors, value ladder, saturation level, how an accent is used | Text, titles, borders, emblems, frames (only if the prompt asks for that kind of artifact) |
| How light and volume are shown (value steps, highlight shapes) | Mood words in the prompt ("eerie", "cheerful") |
| Level of simplification and detail, and how it is distributed | |
| Compositional *habits* (flat stacked planes, silhouettes), when they suit the prompt | |

The skill is **style-agnostic**. Everything is drawn in code (Canvas 2D, optionally
WebGL/Three.js) and rendered headless; there is no image model, so fidelity comes from
measuring, studying close-ups and iterating. The worked example in these files (a 1938 WPA
screenprint) illustrates the method; it is not a default look.

## Quality bar: HIGH

The picture must look like the work of a skilled professional working in the reference's style.
Not programmer art, not "good for code".

- **Match the reference's fidelity, not a simplified version of it.** If the reference has
  internal structure in every mass, rim lights, texture in the flats, hand-cut edges or dense
  linework, build that level of craft into the new subject.
- **Use the reference's own marks.** Identify the mark types the artist builds everything from
  (tapered streaks, crescents, ribbons, dabs, hatching, stipple, brush strokes, pixels) and
  build every element of the new picture from them. New mark types look off-style immediately.
- **Use the reference's palette structure with the prompt's hues.** Same number of colors, same
  lightness steps, same saturation discipline, an accent used the same way
  (`scripts/derive_palette.py`). Never default to the reference's actual colors.
- **Value design.** The light/dark masses follow the new composition, but keep the reference's
  approach: how many value steps per object, how much contrast the hero gets.
- **Every area finished; check 1:1 crops.** No dead slabs, no placeholder props, no seams.
- **High quality is not more effects.** Don't add gradients, glows or textures the reference
  doesn't use.
- **Iterate past "works".** Ask what the reference's artist would change, then change it.

## What "done" looks like

- A PNG at the requested size (default: the reference's aspect, long edge ≥ 2400 px), delivered
  the way the user asked.
- Someone who knows the reference recognizes the style; `compare.py` shows the style traits in
  range and you confirmed it by eye at full size and in 1:1 crops.
- The content, layout and colors are what the prompt asked for and read at a glance. No
  object, layout device, text or color scheme is lifted from the reference unless the prompt
  asked for it.
- Text appears only if the prompt asks for it; it is spelled right, fits its margins and is
  lettered in the reference's manner. Nothing imitates a real organization's branding.

## How to work with the user

Make the decisions yourself: what is style vs. content, how to stage the prompt, the palette,
composition, size. Ask (AskUserQuestion, recommended option first) only when blocked:

- The prompt is too open to stage (a single word) and a wrong guess would waste the render.
- The prompt asks for something the style can't express (photoreal faces in a pixel style).
  Propose the closest in-style route and ask.
- The deliverable is unclear in a way that matters (exact size for print, aspect, words of text).
- You need permission: downloading the reference, installing software, publishing.

Post a one-line update when a phase completes. When you deliver, show the image, say how you
read the prompt, which style traits you carried over, and what you could not match. Expect
feedback; the loop is the product.

## Phase 0: Set up

1. Check tools: `node` ≥ 22, a Chromium (Playwright's `chrome-headless-shell` preferred, Chrome
   works), Python 3 with numpy and Pillow, optionally ffmpeg (variant contact sheets).
2. Scaffold: `cp -r <skill>/assets/engine <project-dir>` and prove the pipeline before any art:
   `node render/render.mjs --scale 0.4`, then a full render. Put the reference under
   `<project-dir>/refs/`.

## Phase 1: Study the reference (style only)

Read `references/reference-analysis.md`.

1. Get the largest version. Crop away anything that isn't the art (scanner bed, mat, frame,
   watermark, UI) with `--crop`.
2. Measure: `python3 scripts/analyze_image.py ref.jpg --out ref-analysis [--crop x0,y0,x1,y1]`.
   The report separates **palette structure** (style) from **palette hues** (content), and gives
   edges, line, surface, detail and composition habits, plus notan/palette/detail/edge images
   and 1:1 crops.
3. Look at every crop at full size and crop more yourself. Name the **marks**, how volume and
   light are made, how big masses get internal structure, and the edge and surface at 1:1.
4. Write the style bible: style traits with numbers and principles, then a short list of the
   reference's content (subjects, layout devices, colors) that you will **not** carry over.

## Phase 2: Read the prompt and compose

Read `references/composition.md`.

- List the prompt's subjects, setting, time, mood, action, colors it implies, and any text.
  Fill gaps with sensible choices for the subject, staged the way this style likes to stage
  things (e.g. silhouettes against a light band, flat stacked planes), not by copying the
  reference's layout.
- Design an original composition for the prompt. Thumbnail it in three values first
  (`--view notan`) and fix the big shapes before any detail.

## Phase 3: Palette and look development

- Choose hues for the prompt's content (one per role: field, shadow, light, darkest, accent…),
  as many colors as the reference uses (±1). Then fit them to the reference's structure:
  `python3 scripts/derive_palette.py ref-analysis/report.json --colors "sky=#…,sea=#…,…" --out out`.
  Lower `--value-fit` when the prompt changes the key on purpose (night, fog, snow).
- **Patch test**: render the hardest element of the new subject at full resolution with
  `--crop` beside the matching kind of reference crop (its hero, its cloud, its texture). Iterate
  until they look like the same hand.

## Phase 4: Build the picture

Read `references/engine.md` and `references/style-techniques.md`.

- Paint back to front: surface, big value masses, secondary shapes, marks and texture, details,
  any text, finish. For print styles use `env.ink(color, draw, opts)` (exact ink, its own
  mottle, specks and registration). Motifs in `motifs.js` (billow, ribbons, interlock) are
  recipes to tune against the reference's crops, not looks.
- Draft at `--scale 0.5`; check marks and edges at full scale with `--crop`. Use
  `references/review-checklist.md` on every pass.

## Phase 5: Review

1. `python3 scripts/compare.py refs/reference.png out/<name>.png --palette "<your palette hexes>"`
   → style-trait table (ink count, flatness, value ladder, saturation, accent, contrast,
   busyness, edge hardness, line use, grain, mottle, flat share, detail spread, shape scale,
   stray colors) and `compare.png`. Hues, value masses and composition are information only.
2. Fix every ✗ unless the prompt explains it (a night scene moves the value ladder; say so).
3. Judge by eye, which outranks the table: full size, then 1:1 crops beside reference crops.
   Name anything that reads wrong (see the checklist) and fix the cause.

## Phase 6: Deliver and iterate

- Deliver the PNG (and the compare sheet if useful). Summarize how you read the prompt, the
  style traits you carried, and what you could not match.
- On feedback, diagnose the category (style fidelity: marks/edges/texture/palette structure;
  content: subject, colors, layout, text), fix it systemically, re-run `compare.py`, show
  before/after. Offer `--variants` for alternatives.
- Don't commit unless asked; keep renders out of git.

## Bundled resources

| Path | Use it when |
| --- | --- |
| `references/reference-analysis.md` | Phase 1: getting the image, reading each metric, style vs. content, style-bible template |
| `references/composition.md` | Phase 2: reading the prompt, original composition, which habits transfer, text |
| `references/style-techniques.md` | Phases 3–4: palette structure, style families for stills, mark recipes, pitfalls |
| `references/engine.md` | Phase 4: PICTURE contract, design units, ink layers, textures, motifs, rendering, gotchas |
| `references/review-checklist.md` | Every review pass |
| `scripts/analyze_image.py` | Measure the reference (report, notan, palette, detail, edges, crops) |
| `scripts/derive_palette.py` | Fit the prompt's hues to the reference's palette structure |
| `scripts/compare.py` | Score the render's style against the reference; side-by-side sheet |
| `scripts/imgstats.py` | Shared measurement code |
| `assets/engine/` | Starter project: deterministic picture, ink layers, texture and shape kits, motifs, post pass, headless renderer |
