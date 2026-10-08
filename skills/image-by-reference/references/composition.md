# From prompt to composition

The prompt decides what is in the picture, where it goes and what colors it has. The reference
decides how it is drawn. Composition is mostly content: design it for the prompt. Carry over
only the reference's compositional *habits*, and only when they serve the prompt.

## Contents
1. Read the prompt
2. Style vs. content, applied to composition
3. Designing the composition
4. Colors from the prompt
5. Text and layout devices
6. Thumbnails and the notan check
7. Worked example

---

## 1. Read the prompt

Write down, before drawing:

- **Subject(s)** and what must be recognizable at a glance (a lighthouse needs a lantern room
  and gallery; a cable car needs its open benches and grip; a cat needs ears and whiskers).
- **Setting, time of day, weather, season**: they decide the lighting and the color scheme.
- **Action or moment** ("waves crashing", "climbing the hill") and how to make it legible in one
  frame.
- **Mood** and how to express it with the style's tools (value key, contrast, scale of sky).
- **Colors** the prompt names or implies ("dusk" implies warm glow + cool shadows; "foggy
  morning" implies low contrast and pale tones).
- **Explicit constraints**: size or aspect, text and its exact words, things to avoid.
- **Gaps**: choose what serves the subject best. Don't fill gaps with the reference's content.

If the subject is real (a landmark, a species, a vehicle), check what it looks like.

## 2. Style vs. content, applied to composition

| Habits that can transfer (if they suit the prompt) | Content that must not be copied |
| --- | --- |
| How depth is built (flat stacked planes, atmospheric steps, overlap) | The reference's subjects and their arrangement |
| Preference for silhouettes against a light band, or for full-frame pattern | Its horizon height, hero position and dark mass placement as such |
| Typical viewpoint class (low, eye-level, aerial, isometric) | Its specific shapes (that mountain, that cloud) |
| How much negative space the artist tends to leave | Its layout devices: title bands, info columns, borders, emblems |
| How the eye is led (rhythm of marks, diagonal vs. horizontal) | Its text and lettering content |

Test: put your thumbnail beside the reference's. If the big shapes line up (same horizon, same
hero spot, same dark mass in the same corner), you copied the layout; recompose.

## 3. Designing the composition

1. **Format**: the reference's aspect unless the prompt or platform needs another.
2. **Hero**: what the prompt is about, placed and scaled for the prompt's story; give it the
   strongest contrast in the picture, made with the style's means.
3. **Planes**: foreground, middle, background as the subject needs; build depth the way the
   style does (flat value steps, overlap, haze bands, line weight).
4. **Value masses**: decide where darks and lights sit for this subject. Keep the reference's
   number of value steps per object and its contrast range.
5. **Rhythm and eye path**: use the style's mark direction where it helps (horizontal strata
   calm a scene, diagonals energize it), but follow the subject (fog is horizontal, rain falls,
   streets climb).
6. **Detail distribution**: the reference's density, placed on the new subject's points of
   interest; leave quiet areas so the hero reads.

## 4. Colors from the prompt

- Pick one hue per role in the new scene: dominant field, shadow, darkest, light, highlight,
  accent (as many roles as the reference has inks, ±1).
- Fit them to the reference's palette structure with `scripts/derive_palette.py` (value ladder,
  chroma levels by rank, gamut). Lower `--value-fit` when the prompt shifts the key on purpose
  (night, fog, snow); raise `--chroma-scale` only when the prompt demands it ("neon", "vivid").
- Reuse inks across planes the way the reference does (one ink can be sky, distant hills and
  shadows) rather than adding a new color per object.
- If the prompt names a color the structure can't hold (a brand red), lock it with `!` and fit
  the others around it.

## 5. Text and layout devices

- Add text, titles, borders, emblems or frames only if the prompt asks for that kind of artifact
  (a poster, a cover, a label) or names the words. Then letter it in the reference's manner:
  family class, weight, width (horizontal scaling to fit bands, like hand lettering), tracking,
  case, size hierarchy in ‰H.
- Never imitate a real organization's name, logo or emblem unless the user owns it or asks.
- Check that every line fits its margins at full resolution and stays clear of the hero.

## 6. Thumbnails and the notan check

Block the composition in three values, render a draft, `--view notan`, and check: the hero reads
as a shape; light and dark masses are balanced for this subject; the eye path works; the layout
is not the reference's. Fix big shapes now; detail can't rescue a weak notan.

## 7. Worked example

Reference: a 1938 WPA screenprint of a volcano and lake (olive/mauve/straw-yellow inks, poster
text bands). Prompt: "a lighthouse on a rocky headland at dusk, waves crashing, a storm
clearing out to sea."

- Carried: flat opaque inks with hand-cut edges; 7-ink structure and value ladder; atmosphere
  as interlocking horizontal spears; billowing masses as a lit cap with wing crescents; slopes
  as fall-line ribbons; dark silhouettes with lighter dabs; faint mottle and paper grain.
- From the prompt: dusk colors (slate-indigo storm, teal sea, apricot glow, coral reflections,
  blue-black rocks), the headland, lighthouse, breaking wave and storm, and a composition
  designed for them. No poster text or emblem, since the prompt didn't ask for a poster.
