# Sound: synthesized score and Foley

Everything is generated in an `OfflineAudioContext` from the cue sheet — no samples, no licensing,
sample-accurate sync. Quality comes from arrangement and dynamics more than from synthesis
fidelity: a modest synth with deliberate silence beats a dense bed that never breathes.

## Contents
1. Composing to the reference
2. Arranging around the story
3. Instrument recipes
4. Foley recipes
5. Mix chain and loudness
6. Verifying without hearing
7. Gotchas

---

## 1. Composing to the reference

From the style bible take: tempo, tonal center/mode, genre feel (e.g. 160 BPM surf-rock in F#,
dominant-7 flavor), where accents fall, and where silence is used. Then write **original**
material in that idiom:

- A one- or two-bar riff (8 eighth notes) built from the mode's scale, transposed per chord
  (I, I, III, IV … or whatever the genre implies). Bass follows roots with octave jumps.
- Drums: kick on 1, "and of 2", 3; snare on 2 and 4; eighth hats; 16th hats for intensity
  sections; tom fills on section ends; snare rolls into big moments.
- Stabs (detuned saw chords through a filter envelope) on section starts and hits.
- A softer arrangement of the same theme for calm sections (clean plucks, music box, pad), so the
  film feels scored, not looped.

The surf-rock recipe above is one example. Match whatever the reference uses:

| Reference sound | Synthesis approach |
| --- | --- |
| Rock / surf / punk | plucked strings (Karplus-Strong) + drive, saw bass, acoustic-style drum synthesis |
| Electronic / EDM / synthwave | saw/square leads with filter envelopes, sidechain-style gain ducking on the kick, arpeggios, big reverbs |
| Chiptune / pixel games | square/pulse/triangle waves, noise-channel drums, fast arpeggios for chords, no reverb |
| Orchestral / cinematic | layered detuned saws through slow filters for strings, low drones + taiko-like toms + braams (detuned saw stacks with pitch drop) for hits; keep it sparse, since thin synthesis shows when dense |
| Lo-fi / ambient / storybook | soft pads, bell/music-box plucks, vinyl crackle (filtered clicks), tape wobble (slow pitch LFO) |
| Jazz / funk / swing | swung timing (delay every second 8th by ~1/6 beat), walking bass, brushed snare (noise swells), stabs |
| Comedic / cartoon | pizzicato plucks, slide whistles, bassoon-like square bass, boings and stingers |

If the reference relies on something synthesis can't fake convincingly (vocals, a famous theme, a
realistic orchestra), say so to the user and offer either a stylized version or to drop in
music they supply or license. Don't imitate a recognizable copyrighted melody.

## 2. Arranging around the story

Lay the score out bar by bar against the beat sheet:

- **Section starts on cues** (title cards land on bar 1 of a section with a hit + crash).
- **Stop-time** for rule-of-three gags: band silent, a hit on each chop.
- **Drop-outs** for suspense: at a cliff edge the band thins to one held note and a pad; during
  a fall, silence except the falling whistle; the band crashes back in on the landing/BOING.
- **Slow-motion beats**: stop the band, hold a thin high tremolo; resume with a hit when the
  thing falls.
- **The mix peak** on the biggest spectacle; ring it out ~1.5 s, then **smash-cut** to silence
  for the next act (automate the master gain to ~0 in 15 ms at the cut).
- **Comedic silence**: before the punchline, cut the music entirely (a record scratch is a
  classic way in), leave room tone + clock ticks, then the button sound.
- Ending: end-card stinger (bells + chord), short final button, fade the last ~0.4 s.

## 3. Instrument recipes (all in `src/audio/engine.js`)

| Instrument | Recipe |
| --- | --- |
| Kick | sine 160→46 Hz exp in 0.11 s, amp env ~0.4 s, + 12 ms high-passed noise click |
| Snare | band-passed noise (~2.2 kHz) 0.2 s + high noise 0.08 s + triangle 210→160 Hz, reverb send |
| Hat | high-passed noise > 8 kHz, 45 ms (open 280 ms) |
| Crash | high-passed noise 2.2 s + narrow 9 kHz shimmer, reverb |
| Surf guitar | Karplus-Strong pluck buffer (cached per note) → soft-clip → LP 4.2 k → spring-ish reverb + 110 ms slapback; tremolo = repeated 16ths |
| Clean guitar | darker KS (bright 0.3, long decay) → LP 2.6 k, big reverb |
| Bass | saw + sine sub (−12) through LP 1.8 k→380 Hz env |
| Stab | 3 detuned saws per note → LP env 500→3.6 k→1.3 k |
| Bell / music box | sine partials 1, 2.756, 5.404 with fast attack |
| Pad | detuned saws, slow attack, LP ~1 k |
| Whistle (human) | sine with 5.5 Hz vibrato + faint band noise |

## 4. Foley recipes

Give every visible action a sound, timed from the same cues/data as the picture:

| Sound | Recipe |
| --- | --- |
| Key press | 18 ms band noise 3.5–5 kHz + triangle thock 260→180 Hz; randomize per key |
| Heavy key / switch | sine 120→50 Hz + band noise 1.8 kHz + tiny click |
| Impact / boom | sub sweep 80→28 Hz + low-passed noise sweep + high noise transient, reverb |
| Whoosh | band-pass noise sweeping f0→f1 with slow attack (length = motion length) |
| Glass / ceramic | many short high sines (2.5–8 kHz) + high noise burst + low thud |
| Metal clang | inharmonic partials (310, 523, 887, 1340, 2210 Hz) decaying 0.45 s |
| Boing | sine 140→320→190 Hz with 22 Hz vibrato decaying |
| Rubber squeak | saw 820→1350→980 Hz, 38 Hz FM, two formant band-passes (1.6 k, 2.9 k) |
| Record scratch | band noise + saw zig-zagging frequency over 0.35 s |
| Paper flurry | dozens of 30–100 ms band-noise bursts 2.5–6 kHz, thinning out |
| Domino/tile click | 12 ms 2.6 kHz noise + short triangle ping |
| Electric zap | square wave with random frequency every 12 ms through a band-pass + hiss |
| Riser | band-noise sweep up + saw glide up, ending on the hit |
| Firework | boom + crackle (many tiny clicks); rocket = rising whistle + hiss |
| Birds / crickets | quick sine chirps; crickets = 4.3–4.8 kHz triplets every ~0.6 s |
| Room tone | brown noise low-passed ~380 Hz at −45 dBFS — under every "silent" moment |

## 5. Mix chain and loudness

`buses (music 0.62, sfx 0.95, ambience 0.5) → master → high-pass 32 Hz → glue compressor
(-20 dB, 2.5:1) → limiter (-2 dB, 20:1, fast) → trim 0.82 → destination`, plus a convolution
reverb (generated decaying-noise IR, ~2.4 s) on sends. At mux time ffmpeg adds a true-peak
safety limiter (`alimiter=limit=0.89`). Targets: integrated −14…−16 LUFS, true peak ≤ −1 dBTP.
Leave the quiet beats genuinely quiet (≈ −40 dBFS RMS); don't normalize them away.

## 6. Verifying without hearing

You cannot listen, so verify like a mixing engineer reading meters, and say so to the user:

1. `python3 scripts/review.py out/film.mp4` → integrated loudness + true peak (ebur128),
   a loudness trace (RMS per 0.5 s) and a spectrogram PNG.
2. Read the trace against the cue sheet: hits where you expect peaks, drop-outs where you
   planned them, silence before the punchline, nothing missing (a flat −90 means a broken bus).
3. Read the spectrogram: no constant low rumble (add/raise the high-pass), no stuck whine (an
   oscillator never stopped), crackle visible where fireworks are.
4. If a section is too dense, it shows as a flat wall at −14 dB with no dynamics — thin it.

## 7. Gotchas

- `exponentialRampToValueAtTime` cannot target 0 — use 0.0001 or `setTargetAtTime`.
- Every oscillator/source needs a `stop()`; leaked nodes ring forever and cost memory.
- Rendering audio and capturing thousands of frames in the same browser session can exhaust
  memory; render audio in its own pass (`--audio-only`) and reuse it (`--reuse-audio`).
- Bus-gain automation is how you do smash cuts and "music stops here"; reverb returns that
  bypass the bus keep ringing — cut at the master if everything must stop.
