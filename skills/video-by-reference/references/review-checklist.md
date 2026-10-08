# Review checklist

Run this on every contact sheet and on the full render at 1 frame/second. Each item is a
correction that actually had to be made in a production; they recur.

## Framing
- [ ] Every story-critical prop/character is inside the frame (compute `x ± 960/z`, `y ± 540/z`)
      — a clock meant to show 11:59 → 12:00 was cropped out of the wide shot.
- [ ] Moving subjects stay in frame for the whole move (follow cameras on jumps/bounces; a
      character exited the top of frame at the apex of a rebound; another ended a pull-out below
      the bottom edge).
- [ ] Text is framed with margins: no clipped line starts or headers (a status line lost its
      first words; a summary lost its header when the camera also tried to keep a character in
      frame — split into two shots instead).
- [ ] Foreground silhouettes (over-the-shoulder heads, hands) don't cover text or the subject.
- [ ] Emotional close-ups are actually close: the eyes/expression must be big enough to read.

## Readability of shapes
- [ ] Silhouettes read as what they are: a hand needs fingers/cuff (an arm without them read as a
      pole); a head needs the right outline (pointy hair read as cat ears); a finger must be
      finger-wide relative to the keys it presses and aimed through the same transform as the
      target.
- [ ] Decorative shadows/shapes read as something or get cut (a projected character shadow in
      an odd pose read as a random blob; removed).
- [ ] One visual metaphor per idea: don't show the same concept twice in different forms (three
      red test bulbs + a scoreboard with three more red bulbs was confusing → one beacon).
- [ ] Iconic compositions are built deliberately: silhouette *against* the disc (lower the
      skyline, place sun/moon directly behind), no structural bar (window mullion) bisecting the
      subject.

## Draw order and continuity
- [ ] Nothing important is hidden behind another prop (a lamp head drawn before the monitor
      disappeared behind it).
- [ ] One instance of each character per frame — check state transitions (a rider remained on
      the swing while the same character tumbled into the pile).
- [ ] Props persist across shots in the state the story left them (window left open after the
      finale is still open in the morning; wreckage remains; the board stays green).
- [ ] Clock/time-of-day and lighting state match the act.

## Composition and detail
- [ ] No dead regions: large solid black/flat areas get environment detail or a reframe (the
      underside of a desk rendered as a black slab; fixed with a drawer pedestal, wall shadow,
      outlet, plant).
- [ ] Wide shots carry story detail (labels, notes, objects that pay off later).
- [ ] Overlays (title cards, receipts, meters) sit in free space, never on the subject they
      introduce, and don't stack with other overlays.

## Pacing and information (see story-and-pacing §5)
- [ ] Every title card is on screen for ≥ 3 samples at 1 fps; the detail line arrives after the
      name.
- [ ] Every on-screen sentence has read time (≈ 0.3 s/word + 0.5 s after fully visible).
- [ ] Each set piece shows: title → setup → action → **held payoff** (≥ 1 s close-up).
- [ ] The emotional beat has slow motion/closeness/quiet.
- [ ] Background information is dimmed when foreground information matters.
- [ ] Long text is revealed line by line, followed by a reaction cut.

## Style fidelity (against the bible, whatever the style)
- [ ] Side-by-side with reference frames: would a stranger believe they're from the same
      production? Check each axis (form, light, surface, color, motion, lens, edit).
- [ ] Palette/grade within the bible's range; a reserved hero color stays reserved.
- [ ] Drawing rate per element matches the bible (e.g. holds on 2s for limited animation, smooth
      1s + motion blur for cinematic). No accidental mix.
- [ ] Post treatment matches: lens curvature, grain, CA, flash frames only if the reference has
      them.
- [ ] Cuts follow the reference's rhythm (on the beat grid if it cuts to music).

## Visual quality (bar: HIGH; see SKILL.md "Quality bar")
- [ ] Viewed at full resolution, each frame holds up next to reference frames as a finished
      still from a professional production, not a draft or programmer art.
- [ ] Composition has a clear focal point, strong value structure and real depth (fg/mid/bg).
- [ ] Shapes are refined and edges crisp (raise `supersample` if soft); no placeholder props,
      unfinished areas or rough geometry.
- [ ] Motion is designed: anticipation, follow-through, overlap, secondary motion, shaped easing.
      No linear tweens or stiff rigs unless the reference moves that way.
- [ ] Type is set with care: hierarchy, spacing, grid alignment, treatment matching the
      reference.
- [ ] Every reference trait is built at full richness, not a simplified stand-in, and nothing
      the reference doesn't use was added.
- [ ] Asked "what would a top artist in this style improve here?" and fixed the answer.

## Sound (measured)
- [ ] Integrated −14…−16 LUFS, true peak ≤ −1 dBTP.
- [ ] Loudness trace shows the planned hits, drop-outs and silence; room tone under silence.
- [ ] Spectrogram has no rumble or stuck tones.

## Delivery
- [ ] Duration, resolution, fps, codecs as intended (`ffprobe`).
- [ ] Facts on screen verified; source links ready for the summary.
- [ ] Scratch files cleaned; large outputs git-ignored; nothing committed unless asked.
