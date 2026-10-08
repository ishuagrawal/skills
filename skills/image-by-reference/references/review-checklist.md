# Review checklist

Run on every draft and on the final: first `compare.py` (numbers + sheet), then your eyes at
full size and in 1:1 crops beside matching reference crops. The eye outranks the table.

## Style fidelity (against the bible)
- [ ] Palette structure: same ink count (±1), value ladder within ~7 L* per step, similar
      saturation and accent strength; hues chosen for the prompt; stray colors < 3 %.
- [ ] Value: same number of steps per form and contrast range; the hero gets the strongest
      contrast, made with the style's means.
- [ ] Edges: same hardness (edge blur) and the same irregularity at 1:1 (stencil wobble,
      brush breakup, pixel steps).
- [ ] Marks: every element is built from the reference's mark types, at the reference's sizes
      (shape-scale ratio 0.7–1.4). No invented mark types.
- [ ] Surface: grain and mottle match; specks/halftone/paper/aging only if the reference has them.
- [ ] Detail: density and its distribution match (edge density ratio 0.75–1.33, Gini within
      ~0.08); quiet zones exist where the reference has them.
- [ ] Type (only if the prompt asked for text): same class, weight, width, tracking, hierarchy.

## Readability (what it reads as)
- [ ] Each element reads as what it is at thumbnail size and at full size. Check the "reads as"
      table in style-techniques.md §5: moons, fish scales, pearls, cauliflower, fountains,
      layer cake, icicles, bead borders, eyebrows.
- [ ] The hero's silhouette is clean: nothing busy crosses its outline.
- [ ] The prompt's action is legible (the wave is crashing, the storm is clearing).
- [ ] Light direction is consistent across every motif (lit crescents, lit faces, rim lights).
- [ ] Repeated marks vary in size, spacing and angle; nothing sits in rows or on a grid unless
      the reference does that.

## Content and composition (from the prompt)
- [ ] Subjects, colors and layout come from the prompt; nothing is lifted from the reference
      (its objects, horizon/hero placement, bands, borders, emblems, text, hues).
- [ ] The notan works for this subject: hero readable, masses balanced, eye path clear.
- [ ] No dead areas: big masses carry the reference's kind of internal texture.

## Craft at 1:1
- [ ] No seams, halos or rings along subtracted shapes; no hairline gaps between abutting
      inks unless misregistration is a trait.
- [ ] No frayed tiny shapes (roughness too large for their size).
- [ ] Text: spelled right, fits inside the margins (check the longest line), no clipped
      glyphs, not touching the hero.

## Content and safety
- [ ] Everything the prompt asked for is present and recognizable.
- [ ] No real organization's name, logo or emblem unless the user owns it or asked.
- [ ] Facts in any text (places, dates) are right or clearly fictional.

## Delivery
- [ ] Output size and aspect as intended; PNG opens; file size reasonable.
- [ ] Summary: traits carried over, how the prompt was staged, what could not be matched.
- [ ] Scratch renders cleaned up; nothing committed unless asked.
