// The soundtrack: an original score + Foley, synthesized offline from the cue sheet so it is
// sample-accurate to the picture. Replace the demo with sections that follow your beat sheet.
import { makeEngine } from './engine.js';
import { C, MUSIC, bar, beat } from '../timeline.js';
import { BEAT } from '../core.js';

export const SR = 48000;
const E8 = BEAT / 2, S16 = BEAT / 4;

export async function renderSoundtrack(duration) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  const A = makeEngine(ctx);
  music(A);
  foley(A);
  // final fade (master automation also does smash cuts: ramp to 0.0001 in ~15 ms)
  const g = A.buses.master.gain;
  g.setValueAtTime(0.9, Math.max(0, duration - 0.4)); g.linearRampToValueAtTime(0.0001, duration - 0.02);
  return ctx.startRendering();
}

// ------------------------------------------------------------- music
// Write the riff/progression in the reference's tempo, tonal center and genre feel (style bible).
const RIFF = [54, 54, 57, 54, 59, 54, 60, 59]; // demo: 8 eighth notes (MIDI)
function music(A) {
  const { drums: D, inst: I } = A;
  const groove = (n, o = {}) => {
    for (let i = 0; i < 8; i++) {
      const t = bar(n) + i * E8;
      if (i === 0 || i === 3 || i === 4) D.kick(t, i ? 0.8 : 1);
      if (i === 2 || i === 6) D.snare(t, 0.9);
      D.hat(t, i % 2 ? 0.6 : 0.9);
      I.bass(t, [42, 42, 54, 42, 49, 42, 54, 52][i], E8 * 0.8);
      if (!o.noGtr) I.gtr(t, RIFF[i], E8 * 0.8, 0.8);
    }
  };
  D.kick(C.drop, 1.2); D.crash(C.drop, 1); I.stab(C.drop, [54, 58, 61, 64], 0.3, 1);
  groove(1, { noGtr: true });
  groove(2);
  for (let k = 0; k < 8; k++) D.snare(beat(2, 3) + k * S16, 0.5 + k * 0.06); // roll into the flash
  D.kick(C.flash, 1.2); D.crash(C.flash, 1); I.stab(C.flash, [54, 58, 61, 66], 0.9, 1.1);
  [66, 70, 73, 78].forEach((m, k) => I.bell(C.flash + 0.1 + k * 0.08, m, 1.4, 0.7));
}

// ------------------------------------------------------------- foley
function foley(A) {
  const { fx } = A;
  fx.roomTone(0, C.end, 0.8);
  fx.whistleDown(C.drop - 0.5, 0.45, 0.7);
  fx.thud(C.drop, 1.2); fx.sub(C.drop, 0.6, 90, 0.5);
  fx.swoosh(C.title, 1); fx.swoosh(C.title + 0.45, 0.6);
  fx.blip(C.look + 0.6, 1400, 0.6, 0.04);
  fx.reverse(C.flash - 0.4, 0.4, 0.8); fx.sparkle(C.flash + 0.05, 1);
}

// 16-bit PCM WAV
export function toWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length;
  const out = new Uint8Array(44 + n * ch * 2);
  const v = new DataView(out.buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return out;
}
