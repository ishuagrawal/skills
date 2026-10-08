# Studying the reference

The goal is a **style bible**: a short document of measured facts about the reference that you
will design against. "It feels punchy" is not usable; "14 cuts in 16 s, tease shots ≈ 3 beats at
160 BPM, payoff shot 4 s, 1.7 s held gag at the end" is.

## Contents
1. Get the material (local file vs. browser-only)
2. Picture measurements (cuts, holds, palette, motion)
3. Looking at every shot (the qualitative pass)
4. Audio measurements without hearing
5. Writing the style bible (template)
6. Browser gotchas (learned the hard way)

---

## 1. Get the material

**Metadata first.** Fetching a YouTube page with WebFetch usually returns only the title. Read
the rest from the player itself (built-in browser → `javascript_tool`):
`document.querySelector('video').duration`, `videoWidth/Height`, `document.title`, channel name.
Note re-uploads/cuts (a "16 s official trailer" may be a teaser cut of a longer piece) and look up
the official context (game/brand/character lore) — it explains *why* the reference makes its
choices (e.g. a crash-test robot's trailer ends with a crash gag).

**Two routes for the frames and audio:**

| Route | When | How |
| --- | --- | --- |
| Local file | User gave a file, or the user approves a download | `python3 scripts/analyze_media.py ref.mp4 --out ref-analysis/` |
| Browser-only | Streaming page, no download permission | built-in browser + `scripts/browser_probe.js` |

Downloading needs explicit permission (state source, filename, size). Don't install downloaders
without asking. The browser route measures everything you need; it is just slower.

## 2. Picture measurements

Run the analyzer (either route) and record:

- **Cut list**: timestamps where the mean absolute frame difference spikes (normalized diff
  ≳ 18–25 of 255 on small downscaled frames). Runs of high-but-not-spiky difference are camera
  moves or shake, not cuts. Flash frames show as a spike to near-white luminance.
- **Shot lengths** → average shot length, the longest shot (usually the payoff/reveal), the
  rhythm of the tease (e.g. 0.75 s / 1.1 s / 1.1 s).
- **Rhythm vs. tempo**: divide shot lengths by the beat length. If most are ≈ 2, 3 or 4 beats,
  the editor cut on the music grid — copy that habit.
- **Holds / "on twos"**: sample the same second at 60 Hz. Identical consecutive frames reveal
  the drawing rate. Typical findings: characters/FX change every 2–3 frames at 24 fps
  (8–12 drawings/s) while camera moves change every frame. That split is a signature of
  hand-crafted 2D and is cheap to reproduce (`onN(t, 2)` in the engine).
- **Palette**: k-means (k≈10) on pixels from 10–15 representative frames. Report hex + share.
  Most stylized work is 3–5 inks plus white; name them by role (sky, shadow ink, highlight,
  accent).
- **Luminance/saturation curve** over time: dark→bright reveals, flash frames, end-card fades.

## 3. Looking at every shot

Numbers don't tell you the art direction. Build contact sheets and *look*:

- Browser route: `__vbr.sheet()` stacks frames in an overlay; the built-in browser pane may be
  narrow (≈330 px), so stack vertically (≈4 frames per screenshot) and page with `scrollTop`.
  Screenshots are capped at pane size — zooming does not add resolution.
- File route: the analyzer writes `sheet_shots.png` (one frame per shot) and timed sheets.

For each shot write one line: time range · framing (ECU/CU/MS/WS, angle, lens) · subject ·
action · FX · purpose in the story. Then classify and describe the style along the eight axes in
`style-techniques.md` §1 (form, light, surface, color, motion, lens & camera, edit, sound):

- **Rendering model**: 2D flat, 2D painterly, cel/anime, 3D toon, 3D realistic, pixel art,
  line/sketch, collage/cut-out, kinetic type, live-action-like, or a mix (say which layer is
  which). This decides the technical approach, so get it right and zoom in on frames to check.
- **Form & light**: outlines (where, weight, color), how volume is shown (flat fills, hard
  shadow shapes, cel tones, soft gradients, PBR), rim lights, glows/bloom, ambient occlusion.
- **Surface & color**: textures, grain, paper, dithering; palette roles; grade; how color shifts
  across the piece (color script).
- **Motion**: the drawing rate per element (characters vs. FX vs. camera), easing character,
  smears, squash/stretch, motion blur, physicality.
- **Lens & camera**: angles, focal feel (wide/fisheye vs. long), depth of field, parallax,
  shake (stepped or smooth), signature moves.
- **Edit & transitions**: cut rhythm, flash frames, match/whip/smash cuts, dissolves, title
  treatment and duration.
- **Character presentation**: silhouette use, how identity/color is revealed, expression tools.
- **Typography/UI**: families, weights, layouts, on-screen time.
- **Narrative shape**: what is withheld until when, where the longest shot sits, where the joke
  or emotional peak is.

Then write the **principles**: for each notable trait, a sentence on *why* it works (e.g. "the
hero stays a silhouette for 60% of the runtime so the color reveal is the payoff"). Principles
are what you transfer; traits are how you check fidelity.

## 4. Audio measurements without hearing

You cannot listen. Measure, then interpret with domain knowledge:

| Measure | How | Read it as |
| --- | --- | --- |
| Loudness trace (RMS per 0.25 s) | analyzer / probe | dynamic shape; drops = intentional silence |
| Band energies (sub <80, low, mid, hi-mid 1–4 k, air) | FFT bands | sub spikes = booms on reveals; hi-mid bursts with no bass = skids/scrapes |
| Spectral flux onsets | positive log-magnitude change | hits, cuts synced to sound |
| Tempo | autocorrelation of the onset envelope **over the music section only** (also check half/double) | BPM; check onset spacing ≈ beat |
| Tonal center / key | **high-resolution** FFT (~1.5 Hz bins), spectral peaks only, power-weighted; bass (<300 Hz) pitch classes separately; correlate with major/minor profiles | the bass center is the most reliable number; treat mode/key as approximate |
| Silence | RMS < -35 dBFS stretches | the comedic "dead air" beat |
| Spectral centroid | weighted mean frequency | high + quiet = sizzles/fuses/sparkles |

Two traps, both hit in practice: (1) short FFTs (~20 Hz bins) put low notes a semitone off
(a D-centered track read as C#/F#); (2) explosions, skids and silences drag tempo and key off,
so pass the music range (`--music-range a-b` / `analyzeAudio({from, to})`). **Validate your
tools on a file whose answers you know** (e.g. your own synthesized test track) before trusting
them on the reference.

Then map sound events onto the shot list: which hits land on cuts, where the loudest moment is
(often the first big reveal, ~30% in), where music cuts out and what replaces it (a click, a
fizz), how the ending decays. Say explicitly in your bible which sound reads are inferred.

## 5. Style bible template

```markdown
# Style bible — <reference title> (<duration>, <source>)
## Numbers
- Cuts: N in T s (avg shot X s; rhythm ≈ k beats; longest shot Y s = <what>)
- Drawing rate: <per element: characters / FX / camera>; source fps …
- Palette / grade: #… (role, %), …; contrast/saturation/temperature notes
- Music: BPM …, tonal center …, genre feel …; accents at …; silence at … (before …)
- Loudness shape: …
## Shot list
| t | framing | subject/action | FX | sound | purpose |
## Style axes (trait → principle)
form · light · surface · color · motion · lens & camera · edit · sound
## Rendering model and approach
<family from style-techniques.md>, drawing layer to use, post settings to start from
## Narrative DNA (transferable principles)
1. …
## Surface (do not copy)
the specific scenes, props, characters, gags
```

Worked example (abridged, from the source production, a 16 s flat-2D game trailer): 14 cuts;
tease shots ≈ 3 beats at 160 BPM; reveal shot 4 s; characters/FX on 2s–3s and camera on 1s;
4-ink screenprint palette (hot red, ink, lemon, blue); no outlines except explosions; fisheye low
angles; hero kept in silhouette until a full-color reveal; music cut to near-silence (−36 dBFS)
before the gag; held deadpan ending. A painterly or 3D reference produces a very different
bible. Measure, don't assume.

## 6. Browser gotchas (learned the hard way)

- **The page may not be the video you asked for.** YouTube can autoplay/queue into another video
  within seconds of loading, and even land mid-way through a long stream. Pause right after
  navigating, then check `title`/`duration` before measuring (the probe refuses > 10-minute
  scans by default). Autoplay also fires at the end: pause at `duration - 0.08`.
- **Hidden pane = frozen frames.** When the built-in browser pane is hidden, the tab doesn't
  decode new frames on seek, so every capture is identical (the probe detects this). Ask the user
  to show the pane (Cmd/Ctrl+Shift+B), or use the local-file route. Audio capture still works
  hidden because it runs on the audio thread.
- **Background-tab throttling**: if the pane is hidden, `setInterval`/`requestAnimationFrame`
  samplers fire ~1×/s. Capture audio on the audio thread instead (`ScriptProcessorNode` or an
  AudioWorklet) and analyze offline in JS.
- **Ads** can play first: check `.ad-showing` before measuring; wait or skip.
- **Seeking for frame-accurate scans** works without playback: set `currentTime`, await
  `seeked`, `drawImage` to a small canvas. YouTube's MSE blob is same-origin, so `getImageData`
  is not tainted. Long scans: start them async, store results on `window`, poll — the tool call
  times out after ~45 s.
- **Navigation wipes `window` state** (SPA route changes included). Re-inject the probe after
  any navigation.
- **Unmuted capture without sound**: route `MediaElementSource → processor → gain(0) →
  destination` so you capture full-level audio while the user hears nothing.
- **Narrow pane**: screenshots are limited to the pane's pixels; build vertical frame stacks
  rather than wide grids, or ask for the file.
