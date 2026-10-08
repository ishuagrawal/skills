# Studying the reference

The goal is a **style bible**: measured facts about how the reference is made, plus the
principle behind each, kept separate from what it depicts. "Warm and vintage" is not usable;
"7 flat inks on a value ladder from L* 20 to 82, moderate chroma with one accent at 2× the
median, edges hard (0.5 px blur at 1600 px), atmosphere drawn with interlocking horizontal
spears" is. The reference's subjects, layout, text and actual colors are content: record them
only so you know what not to copy.

## Contents
1. Get the image
2. Run the analyzer and read every number
3. Look: crops, marks, light
4. The style axes for stills
5. Style bible template and worked example
6. Validating the tools

---

## 1. Get the image

- Use the largest version available (original upload, museum or library scan, the artist's
  site). Thumbnails and recompressed social images hide edges and texture, the traits that
  separate a convincing match from a vague one.
- Downloading needs explicit permission (state source, filename and size). If the user gave a
  file, use it.
- Record metadata: title, artist, date, medium, source, license. The medium explains the
  traits (a screenprint has flat opaque inks and hand-cut edges; a risograph has transparent
  inks, grain and misregistration; a woodblock has a key-block line and wood grain).
- **Crop to the art.** Scanner beds, mats, frames, watermarks and UI pollute the palette,
  value, border and composition numbers. `--crop x0,y0,x1,y1` (fractions or pixels) saves the
  cropped `reference.png`; use it for everything after. Keep any paper margin that belongs to
  the work.
- Several references in one style: analyze each, keep the traits they share, note the
  variation range.

## 2. Run the analyzer and read every number

```bash
python3 <skill>/scripts/analyze_image.py ref.jpg --out ref-analysis --crop 0.02,0.02,0.98,0.98
```

All measurements are taken at a 1600 px analysis height, so pixel numbers compare across
images; widths are also given in per-mille of the height (‰H), the unit to design with.

| Section | Numbers | How to read them |
| --- | --- | --- |
| Palette structure (style) | ink count, value ladder (L* of each ink, dark→light, with shares), chroma by ladder step, share-weighted chroma, accent strength, hue spread/harmony, shape scale | The transferable part of color. Your palette keeps the count, ladder, chroma levels and accent behavior with the prompt's hues (`derive_palette.py`). Harmony type is a soft trait: follow the prompt if its colors need a wider spread. |
| Inks (content) | hex, share, L/C/h, position, feature width p10/med/p90, roles | k-means over-segments, near-duplicates (ΔE00 < 5) merge, blend clusters on the line between two inks are dropped as edges. Quantization error < 4 ΔE00 = flat-ink style; > 7 = continuous tone. Feature width says how an ink is used: < 3 ‰H = lines, hatching, specks; large = fields. The hexes themselves are content. |
| Value | percentiles, key, 2- and 3-value thresholds and shares, 3×3 mean L*, histogram | Contrast range and the number of value steps are style; where masses sit and the key are mostly content (they follow the new composition and the prompt's time of day). |
| Color | chroma p50/p90/p99, saturation key, warm share, hue histogram | Saturation discipline is style; temperature and hues are content. |
| Edges | density, orientation mix, edge blur (px), hard-edge share | Density = busyness. Orientation = the direction of marks (horizontal strata, diagonal slope streaks). Edge blur ≈ 0.5 px is an anti-aliased hard edge; 1.5–3 px is soft or brushed; > 8 px (clipped at 20) is very soft or blended. |
| Line | dark share, dark stroke width, thin share of dark | Whether the darkest ink draws (outlines, hatching: high thin share) or masses (silhouettes: low). |
| Surface | flat share, grain σ, mottle σ, local std | Grain = fine noise in flat areas (paper, film, ink tooth); mottle = low-frequency unevenness (ink density, aging, wash). Both in L* units. |
| Composition | detail grid + Gini, focal point, salient peaks, visual-weight center and balance, symmetry | Detail spread (Gini > 0.45 concentrated, < 0.3 even) is style; the focal point and balance describe this picture's layout (content). |
| Bands, border | horizontal/vertical boundaries with colors either side; border width/color per side | Horizons, title bands, panel edges, margins: layout features. Content unless the prompt asks for that kind of artifact. |

Images: `notan.png` (original | 2-value | 3-value | quantized), `palette.png`, `detail.png`
(heat map, thirds grid, bands in cyan, focal point in red), `edges.png`, `crops/` (most-detail,
focal, flattest, dark strokes; 10 % of the height each, from the full-resolution file).

## 3. Look: crops, marks, light

Numbers don't tell you how the picture is made. Crop the reference yourself (PIL is enough) at
two scales: regions of about a third of the image to see construction, and 1:1 crops to see
edges and texture. For each region answer:

- **What are the marks?** The handful of shape types everything is built from. Name them
  precisely (e.g. "tapered spears, 4–14 ‰H wide, ragged ends", "wing crescents: flat lunes
  with hooked horns", "fall-line ribbons along slopes", "olive dabs inside dark masses",
  "parallel hatching at 30°, 1.5 ‰H", "dry-brush strokes", "2×2 px dither"). You will build
  everything from these.
- **How is volume made?** Number of value steps per object; whether steps are interlocking
  shapes, hatching density, soft gradients, or color temperature.
- **How do masses get internal structure?** A large dark or light mass is rarely plain: look
  for highlight dabs, crescents, pockets, trunk lines, glints.
- **Light**: direction, how many sources, rim lights, how the light side differs from the
  shadow side of each motif.
- **Edges at 1:1**: cut (stencil), printed (slight spread), drawn (line with weight variation),
  painted (soft, broken), pixel (stair-stepped). Irregularity amplitude and wavelength.
- **Surface at 1:1**: paper grain, ink mottling, specks, misregistration gaps or overlaps,
  halftone dots, canvas weave, brush texture, scan artifacts and aging (decide whether aging is
  part of the look you're matching; usually a light touch of it is).
- **Type**: family class (geometric sans, humanist sans, slab, script, hand-lettered), weight,
  width, tracking, case, color, size hierarchy in ‰H, alignment, how type sits in bands.

Then write the **principles**: for each trait, why it works ("the plume is the same ink as the
sky; only its lit crescents define it, so the eye reads atmosphere, not outline").

## 4. The style axes for stills

| Axis | Questions | Example findings |
| --- | --- | --- |
| Rendering model | flat/screenprint, woodblock, riso/halftone, vector, line/ink/engraving, painterly, pixel, low-poly/3D, collage, photographic, mixed | "silkscreen, 6 opaque inks + paper, hand-cut stencils" |
| Form | shapes or lines; geometric or organic; outlines; silhouette clarity | "no outlines; flat interlocking shapes; scalloped cumulus" |
| Marks | the 3–6 mark types; their size range in ‰H | "spears 3–16 ‰H; wing crescents; ribbons; dabs" |
| Light | direction, value steps per object, rim lights, highlight shapes | "one low warm light; 3–4 flat steps; crescent highlights" |
| Color structure | ink count, value ladder, saturation level, accent use, reuse of one ink across planes | "7 inks, L* 20→82, chroma ~22 with one accent at 44; one ink is sky, plume and far forest" |
| Value | steps per object, contrast range, hero contrast | "3–4 flat steps per form; range 65 L*" |
| Surface | grain, mottle, specks, paper, halftone, brush, aging | "faint mottle 1.8 L*, grain 0.5 L*" |
| Detail | density, where it concentrates, what stays quiet | "even spread; lake and mid sky quiet" |
| Space | depth cues (overlap, ink, scale, haze, blur), number of planes | "depth by ink: far mauve/peach, mid olive, near black" |
| Composition habits | depth construction, silhouette use, viewpoint class, negative space | "flat stacked planes; silhouettes against a light band" |
| Type (only used if the prompt asks for text) | family class, weight, width, tracking, hierarchy | "bold humanist sans caps, tracked, hand-cut" |

## 5. Style bible template and worked example

```markdown
# Style bible: <title> (<artist, date, medium>; <source, license>)
## Style numbers (analyze_image.py)
- Palette structure: N inks; L* ladder …; chroma by step …; accent …× median; harmony …
- Flatness: quantization error …   Contrast range: …   Value steps per form: …
- Edges: blur … px (hard/soft); busyness …   Line: …
- Surface: grain …, mottle …, specks/halftone/paper …
- Detail: Gini …; shape scale … ‰H
## Marks (from crops)
1. <mark>: size ‰H, edge, where used, what it depicts in the reference
## Style axes (trait → principle)
rendering model · form · marks · light · color structure · value · surface · detail · space · habits · type
## Rendering approach
family (style-techniques.md), kits/motifs, ink order, post settings
## Content not to copy
subjects, layout, hues, text, borders/emblems
```

Worked example (the test case these tools were built on, abridged): 1938 WPA silkscreen
poster. Style: 7 flat inks, quantization error 2.05; value ladder L* 20 / 39 / 50 / 70 / 73 /
78 / 82 with the mid-dark step covering 35 %; share-weighted chroma 22, one accent at 2.1× the
median; contrast range 65; edge blur 0.53 px (hard, hand-cut wobble at 1:1); grain 0.47,
mottle 1.8 L*; detail even (Gini 0.24). Marks: interlocking horizontal spears (atmosphere,
water), lit caps with wing crescents and bird-shaped pockets (billowing masses), fall-line
ribbons (slopes), dark silhouettes with lighter dabs and trunk lines (foliage). Content not to
copy: the volcano, lake and conifers, the olive/mauve/yellow hues, the title and name bands,
the emblem. A painterly or pixel reference produces a very different bible.

## 6. Validating the tools

The analyzer was calibrated on synthetic images with known answers: an anti-aliased hard edge
reads 0.6–0.7 px of edge blur, a σ = 1.5 px blur reads 1.7 px, σ = 3 px reads 3.2 px; a
three-ink image with anti-aliased edges reads 3 inks. If a number disagrees with your eyes,
build a tiny synthetic test with a known answer before trusting either. Known limits:

- Ink counts on scans include paper and stains; tiny accents (< 0.4 % of pixels) are dropped.
  Look for small accent colors by eye.
- The focal-point estimate likes high contrast and detail; text blocks can win. Confirm by eye.
- Edge blur measures strong isolated edges only; very busy textures inflate it.
- Orientation bins use image coordinates (y down), so 22° and 157° are mirror images; read
  them as "diagonal one way / the other way".
