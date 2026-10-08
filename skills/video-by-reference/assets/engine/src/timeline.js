// THE cue sheet: every event time in the film, shared by picture (src/shots) and sound
// (src/audio/score.js). Shots must not contain literal absolute times — derive them here so
// re-pacing the film is a one-file change.
import { BEAT, BAR } from './core.js';

// Music anchor (bar 1, beat 1). If the edit isn't cut to music, keep MUSIC as a plain anchor.
export const MUSIC = 0.75;
export const bar = n => MUSIC + (n - 1) * BAR;             // start of bar n (1-based)
export const beat = (n, b = 1) => bar(n) + (b - 1) * BEAT;  // beat b of bar n

// Demo cues — replace with your beat sheet.
export const C = {
  drop: bar(1),             // hero lands on the downbeat
  title: beat(1, 3),        // title card slams in
  look: bar(2),             // hero turns to camera
  flash: bar(3),            // flash-frame transition
  end: bar(4) + 0.5,
};
