# Story, concept and pacing

## Contents
1. DNA vs. surface
2. Pitching concepts
3. Grounding the story in facts
4. Structures that work
5. Pacing for comprehension (the rules)
6. Tempo grid and the cue sheet
7. Beat sheet and color script
8. Comedy and emotion mechanics
9. On-screen text and UI

---

## 1. DNA vs. surface

From the style bible, sort everything into two lists.

**DNA: transferable principles.** Examples across styles (yours will come from your bible):
- *Flat-2D game trailer*: withhold the hero (silhouette + parts-only close-ups) until a
  full-color reveal on a musical hit; cut on 2–4 beat multiples; impact frames and flash frames on
  hits; near-silence for one beat before the punchline; a held deadpan button.
- *Painterly storybook short*: long gentle shots, parallax drifts instead of cuts, warm/cool
  lighting telling time of day, sound dominated by ambience with a solo instrument motif.
- *Anime action opening*: fast cuts on the beat, sakuga bursts on 1s inside held 3s animation,
  smears and speed-line backgrounds, a title drop on the chorus.
- *Cinematic CG trailer*: slow push-ins, shallow depth of field, volumetric light, a rising
  drone with hits on black frames, the title on the final hit.
- *Kinetic-type explainer*: one idea per beat, text as the hero, strict grid, snappy expo easing,
  whooshes for every move.

**Surface: do not copy.** Its specific scenes, props, characters, banner text and gags
(e.g. a ramp, a ring of fire, a moon jump, fireworks that backfire). A user who asks for "the vibe" still
reacts badly to a near-copy ("I don't want to copy it directly").

When you design, every major shot should be traceable to at least one DNA item, and none to a
surface item.

## 2. Pitching concepts

Pitch only when the user asks for suggestions or the direction is genuinely open. Otherwise pick
the strongest concept and go. A good pitch set:

- 3–5 concepts that differ in setting and tone (spectacle, wonder, satire, sweet), not five
  variations of one idea.
- Each: **logline** · 5–8 beat outline · **the reveal** · **the button** (final beat) · *why it
  works* (which DNA it carries, why it suits this character).
- Mine the character's intrinsic traits. A pixel-art mascot suggests a resolution reveal (pixels
  → smooth shapes) or a game-world escape; a tiny mascot suggests a miniature world where desk
  objects become monumental; a helpful assistant suggests "takes the work, not the credit".
- Recommend one or two picks and say why. Offer combinations if two concepts merge well.

When the user picks or redirects ("use concept X but make it about Y"), take their direction
whole and re-derive the beats from it rather than patching the old outline.

## 3. Grounding the story in facts

If the film is about something real (a product feature, a risky practice, an event):

1. Read the official documentation for the exact behavior, names, UI strings and warnings
   (e.g. mode names, status-line text, warning screen wording, recommended safe usage).
2. Search for real incidents/case studies; note what actually happened and how it was reported.
   Prefer primary sources; flag vendor-blog framing.
3. Build gags as *exaggerations of true failure modes*, one per set piece, each with a visible
   command/label so the viewer connects joke → real risk.
4. **Accuracy pass**: if the docs say the product blocks or prompts for something, don't show it
   happening. Choose the nearest true thing (e.g. deleting `~/Documents ~/Desktop ~/Pictures`
   instead of `~/`, which still prompts). Compute numbers instead of inventing them
   (e.g. instance count × on-demand price).
5. Message films should end on the right behavior shown positively (a visual pun works well:
   a literal sandbox for "run it in a sandbox"), plus one plain-language sentence of advice.
6. Keep source links for your final summary.

## 4. Structures that work

**Micro-trailer (10–20 s):** tease (silhouette/parts, 3–4 shots ≈ 1 s each) → spectacle (2–3
shots) → reveal (longest shot) → reversal → held button.

**Show / set-piece short (60–120 s):**
- Act I setup (10–15 s): the inciting action, the stakes made legible (show what will be lost,
  e.g. `du -sh ~` → 1.8T, failing tests count), the hero's transformation/arrival.
- Act II set pieces (each 6–12 s): **title → setup → action → held payoff**. Vary the physical
  verb of each (swing, topple, chop, fall, launch) and the camera grammar.
- Act III consequence (12–20 s): calm → the reveal of what happened (read-time!) → reaction →
  silence → button.
- Epilogue/resolution + end card (8–12 s).

Budget length from content, not from the reference's length: the reference may be 16 s, your
story with five set pieces will not be.

## 5. Pacing for comprehension (the rules)

These came from direct viewer feedback ("too fast for key moments; hard to absorb everything at
once"). Apply them from the first cut.

- **Action can be fast; information cannot.** Motion reads in a few frames; text and cause-effect
  need time.
- **Read time**: on-screen text needs ≈ 0.3 s per word + 0.5 s, counted from when it is fully
  visible. Typing animations should run ≤ ~26 characters/s for text the viewer must read.
- **Title cards** (set-piece name + command/label): hold ≥ 2.5 s. Stagger: name first, the
  detail line ~0.45 s later. Place them in free space, never over the subject they introduce.
- **One new idea at a time.** Don't introduce a title, a new prop, and a gag in the same second.
  Dim background information (old transcript lines, signage) so the current beat dominates.
- **Held payoffs.** After each set piece, give the consequence its own close-up for 1–2 s (the
  photo landing, the "ALL PASSING" board, the note in the trash, the cost meter maxing out).
- **Slow motion for the emotional beat.** The one thing the audience should *feel* (the
  colleague's three weeks of work teetering) gets a slow, close, quiet moment — stop the music.
- **Breathing beats.** Insert cutaways/reaction shots (a silent onlooker character) between
  dense sections.
- **Long text → line-by-line reveal**, each line timed for reading, and a cut-away reaction
  after the last line, before the punchline.
- **Review at 1 frame/second**: if a title or payoff appears in fewer than ~3 consecutive
  samples, it's too short.

## 6. Tempo grid and the cue sheet

- Pick fps and BPM so frames-per-beat is an integer: `fps × 60 / BPM`. 24 fps: 160 BPM → 9,
  120 → 12, 144 → 10, 180 → 8.
- Anchor the music at a cue (`MUSIC`), then `bar(n)`, `beat(n, b)` helpers. Put every event in one
  `C` object: `C.s2Slam = bar(14)`, `C.s2Plant = beat(16, 3)`, `C.squeak = C.react + 2.6`.
- Shots import `C`; sound imports `C`; data shared by both (rocket launch times, burst list,
  landing times) is exported from the shot module and imported by the score — never duplicated.
- Shot boundaries in the shot list use cues. A literal like `21.0` in a shot file is a bug
  waiting to happen when you re-pace.

## 7. Beat sheet and color script

Beat sheet row: `cue range | shot name | framing/lens | action | on-screen text | sound`.

Color script: one lighting state per act, derived from the reference palette, each a small
object (wall, desk, tint color + amount, rim color, shadow color, light source position). A
story-motivated switch (e.g. the character turns the smart lights to a "showtime" scene) lets you
move between your calm palette and the reference's loud palette diegetically. Reserve the
hero's signature color: nothing else in frame uses it.

## 8. Comedy and emotion mechanics

- Silence before the punchline; the button is a tiny sound (one squeak, one tick).
- Rule of three for repeated actions (three chops on three beats), the fourth beat breaks.
- A silent judge (a rubber duck, a cat, a plant) reacting with a blink is funnier than any line.
- Visual puns land the message (literal sandbox; "the only green in the film is the fake pass").
- The hero is never malicious: let it be proudly, cheerfully wrong (eager helper energy); the
  consequence lands on the human, then the hero *realizes* (eyes: happy → wide → tiny, a sweat
  drop).
- A cheerful summary of the damage in the hero's own voice (a status report) is a strong
  reveal — but it is long text, so pace it (rule above).

## 9. On-screen text and UI

- Recreate UI faithfully but from scratch (no screenshots of real apps); paraphrase long
  warning text; keep short UI strings exact (mode names, status lines) when they're the point.
- Never impersonate a real person/company beyond depicting a public product's UI for commentary;
  invented people get first names only.
- Use monospace for terminal text, a condensed heavy italic for stunt/title cards, and check the
  fonts exist in the rendering browser (system fonts like Futura/Avenir Next Condensed/Menlo on
  macOS; Google Fonts need network at render time).
- Make on-screen numbers internally consistent across the film (1.8 TB in the setup = 1.8 TB
  "freed" in the summary; 500 × $55.04 = $27,520/hr everywhere).
