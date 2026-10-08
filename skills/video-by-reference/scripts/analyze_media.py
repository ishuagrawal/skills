#!/usr/bin/env python3
"""Measure a reference video for a style bible.

Usage:
  python3 analyze_media.py <video> [--out DIR] [--max-fps 30] [--k 10] [--sheet-every 1.0]

Writes DIR/report.md and DIR/report.json plus contact sheets:
  sheet_shots.png   one frame per shot (middle of each shot), in order
  sheet_timeline_N.png  frames every --sheet-every seconds (5x5 tiles)

Measures (picture): metadata, cuts (frame-difference spikes), shot lengths, flash frames,
per-shot mean color/luma, drawing-rate holds per shot (runs of identical frames at native fps),
global palette (k-means), luminance curve.
Measures (audio): loudness trace (RMS dBFS per 0.25 s), band energies, spectral-flux onsets,
tempo (autocorrelation, with half/double alternatives), tonal center (chroma vs. major/minor
profiles), silent gaps, sub-bass accents.

Requires ffmpeg/ffprobe on PATH and numpy. Everything is approximate: read the numbers as
evidence to check against your own viewing, not as ground truth. Known biases:
- Flicker FX (lightning, strobes, impact frames) register as extra "cuts" — confirm on the sheet.
- Holds are measured on whole frames, so a moving camera masks characters animated on 2s;
  trust hold values from locked-off shots (low 'motion').
- Tempo can lock to half/double time, and SFX-heavy sections pull it off: pass --music-range.
- Key/tonal center uses high-resolution spectral peaks; the bass center is usually the most
  reliable number. Short FFTs (~20 Hz bins) misplace low notes by a semitone — don't use them.
"""
import argparse, json, math, os, subprocess, sys

try:
    import numpy as np
except ImportError:
    sys.exit("numpy is required (pip install numpy)")


def run(cmd, binary=False):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {p.stderr.decode(errors='ignore')[-800:]}")
    return p.stdout if binary else p.stdout.decode()


def probe(path):
    j = json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", path]))
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    fps = None
    if v and v.get("avg_frame_rate") and v["avg_frame_rate"] != "0/0":
        n, d = v["avg_frame_rate"].split("/")
        fps = float(n) / float(d)
    return {
        "duration": float(j["format"].get("duration", 0)),
        "width": v and v["width"], "height": v and v["height"], "fps": fps,
        "video_codec": v and v["codec_name"], "audio": bool(a),
        "audio_rate": a and int(a.get("sample_rate", 0)), "title": j["format"].get("tags", {}).get("title"),
    }


LIMIT = []  # ["-t", "<seconds>"] when --max-seconds is set


def frames(path, fps, w, h):
    raw = run(["ffmpeg", "-v", "error", *LIMIT, "-i", path, "-vf", f"fps={fps},scale={w}:{h}:flags=area",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], binary=True)
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def native_frames(path, w, h):
    # native frame cadence (no resampling), to see which frames are exact repeats (holds)
    raw = run(["ffmpeg", "-v", "error", *LIMIT, "-i", path, "-vf", f"scale={w}:{h}:flags=area",
               "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], binary=True)
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def frame_diffs(F, chunk=400):
    # mean absolute difference between consecutive frames, computed in chunks (uint8 input)
    out = [0.0]
    for i in range(1, len(F), chunk):
        a = F[i - 1:i + chunk - 1].astype(np.int16)
        b = F[i:i + chunk].astype(np.int16)
        n = min(len(a), len(b))
        out.extend(np.abs(b[:n] - a[:n]).mean((1, 2, 3)).tolist())
    return np.array(out, np.float32)


def lumas(F, chunk=400):
    w = np.array([0.2126, 0.7152, 0.0722], np.float32)
    return np.concatenate([(F[i:i + chunk].astype(np.float32) @ w).mean((1, 2)) for i in range(0, len(F), chunk)])


def kmeans(px, k, iters=14, seed=7):
    rng = np.random.default_rng(seed)
    c = px[rng.choice(len(px), k, replace=False)]
    for _ in range(iters):
        d = ((px[:, None, :] - c[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for j in range(k):
            m = px[lab == j]
            if len(m):
                c[j] = m.mean(0)
    counts = np.bincount(lab, minlength=k)
    order = counts.argsort()[::-1]
    return [("#%02x%02x%02x" % tuple(int(v) for v in c[i]), round(100 * counts[i] / len(px), 1)) for i in order]


def audio(path, sr=22050):
    raw = run(["ffmpeg", "-v", "error", *LIMIT, "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], binary=True)
    return np.frombuffer(raw, np.float32)


def stft_mag(x, n=2048, hop=512):
    win = np.hanning(n).astype(np.float32)
    frames_ = 1 + max(0, (len(x) - n) // hop)
    out = np.empty((frames_, n // 2 + 1), np.float32)
    for i in range(frames_):
        out[i] = np.abs(np.fft.rfft(x[i * hop:i * hop + n] * win))
    return out


KRUMHANSL_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KRUMHANSL_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def tonal(x, sr):
    N = 32768 if sr >= 32000 else 16384
    hop = N // 4
    win = np.hanning(N).astype(np.float32)
    f = np.fft.rfftfreq(N, 1 / sr)
    k0, k1 = int(np.searchsorted(f, 55)), int(np.searchsorted(f, 2000))
    lo, hi = np.zeros(12), np.zeros(12)
    for s0 in range(0, max(1, len(x) - N), hop):
        seg = x[s0:s0 + N]
        if len(seg) < N:
            break
        mag = np.abs(np.fft.rfft(seg * win))
        m = mag[k0:k1]
        pk = np.nonzero((m[1:-1] > m[:-2]) & (m[1:-1] >= m[2:]) & (m[1:-1] > np.median(m) * 6))[0] + 1 + k0
        if not len(pk):
            continue
        pc = (np.round(12 * np.log2(f[pk] / 440)) + 69).astype(int) % 12
        pw = mag[pk] ** 2
        bass = f[pk] < 300
        np.add.at(lo, pc[bass], pw[bass])
        np.add.at(hi, pc[~bass], pw[~bass])
    return lo / (lo.max() + 1e-12), hi / (hi.max() + 1e-12)


def analyze_audio(x, sr, duration, music=None):
    res = {}
    hop_s = 0.25
    hop = int(sr * hop_s)
    trace = []
    for i in range(0, len(x), hop):
        seg = x[i:i + hop]
        if len(seg) == 0:
            break
        trace.append(round(20 * math.log10(float(np.sqrt((seg ** 2).mean())) + 1e-9), 1))
    res["loudness_trace_dbfs_per_0.25s"] = trace
    n, h = 2048, 512
    M = stft_mag(x, n, h)
    freqs = np.fft.rfftfreq(n, 1 / sr)
    t_of = lambda i: i * h / sr
    bands = {"sub<80": (0, 80), "low80-250": (80, 250), "mid250-1k": (250, 1000), "himid1-4k": (1000, 4000), "hi4k+": (4000, sr / 2)}
    P = M ** 2
    be = {k: 10 * np.log10(P[:, (freqs >= a) & (freqs < b)].sum(1) + 1e-12) for k, (a, b) in bands.items()}
    # onset strength: positive log-magnitude flux
    L = np.log1p(M)
    flux = np.maximum(L[1:] - L[:-1], 0).sum(1)
    flux = np.concatenate([[0], flux])
    # adaptive peak picking
    onsets = []
    w = 15
    for i in range(3, len(flux) - 3):
        lo, hi = max(0, i - w), min(len(flux), i + w)
        med = np.median(flux[lo:hi])
        if flux[i] > med * 1.6 + flux.mean() * 0.3 and flux[i] == flux[max(0, i - 3):i + 4].max():
            onsets.append(round(t_of(i), 3))
    res["onsets_s"] = onsets
    # tempo via autocorrelation over 60-200 BPM (restricted to the music range if given — SFX,
    # silences and explosions elsewhere pull the estimate off)
    if music:
        a_, b_ = int(music[0] * sr / h), int(music[1] * sr / h)
        env = flux[a_:b_] - flux[a_:b_].mean()
    else:
        env = flux - flux.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    fr = sr / h
    lags = np.arange(len(ac))
    bpm_of = lambda lag: 60 * fr / lag
    lo_lag, hi_lag = int(fr * 60 / 200), int(fr * 60 / 60)
    cand = sorted(((ac[l], l) for l in range(max(1, lo_lag), min(hi_lag, len(ac) - 1))), reverse=True)[:8]
    tempos = []
    for v, l in cand:
        # parabolic refinement
        a_, b_, c_ = ac[l - 1], ac[l], ac[l + 1]
        off = 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ + 1e-12)
        bpm = round(float(bpm_of(l + off)), 1)
        if all(abs(bpm - t) > 3 for t in tempos):
            tempos.append(bpm)
    res["tempo_candidates_bpm"] = tempos[:4]
    if tempos:
        beat = 60 / tempos[0]
        res["frames_per_beat_at_24fps"] = round(24 * beat, 2)
    # tonal center: high-resolution FFT, spectral PEAKS only (rejects noise/SFX), power-weighted,
    # split into bass (<300 Hz, usually the most reliable root) and upper register.
    xs = x[int(music[0] * sr):int(music[1] * sr)] if music else x
    lo, hi = tonal(xs, sr)
    chroma = 0.6 * lo + 0.4 * hi
    res["bass_pitch_classes"] = {NOTES[i]: round(float(lo[i]), 2) for i in range(12)}
    res["bass_tonal_center"] = NOTES[int(np.argmax(lo))]
    res["chroma"] = {NOTES[i]: round(float(chroma[i]), 2) for i in range(12)}
    best = []
    for i in range(12):
        for mode, prof in (("major", KRUMHANSL_MAJ), ("minor", KRUMHANSL_MIN)):
            r = np.corrcoef(chroma, np.roll(prof, i))[0, 1]
            best.append((r, f"{NOTES[i]} {mode}"))
    best.sort(reverse=True)
    res["key_candidates"] = [(k, round(float(r), 3)) for r, k in best[:3]]
    # silence gaps (< -35 dBFS for >= 0.2 s) using a 0.05 s grid
    g = int(sr * 0.05)
    rms = np.array([20 * np.log10(np.sqrt((x[i:i + g] ** 2).mean()) + 1e-9) for i in range(0, len(x) - g, g)])
    gaps, start = [], None
    for i, v in enumerate(rms):
        if v < -35 and start is None:
            start = i
        if (v >= -35 or i == len(rms) - 1) and start is not None:
            if (i - start) * 0.05 >= 0.2:
                gaps.append([round(start * 0.05, 2), round(i * 0.05, 2)])
            start = None
    res["silent_gaps_s"] = gaps
    # sub accents: peaks of sub-band energy well above its median
    sub = be["sub<80"]
    thr = np.median(sub) + 8
    acc = [round(t_of(i), 2) for i in range(2, len(sub) - 2) if sub[i] > thr and sub[i] == sub[i - 2:i + 3].max()]
    res["sub_bass_accents_s"] = acc[:60]
    res["band_mean_db"] = {k: round(float(v.mean()), 1) for k, v in be.items()}
    loud_idx = int(np.argmax(trace)) if trace else 0
    res["loudest_moment_s"] = round(loud_idx * hop_s, 2)
    return res


def contact_sheet(path, times, out_png, cols=5, w=384):
    tmpdir = out_png + ".frames"
    os.makedirs(tmpdir, exist_ok=True)
    files = []
    for i, t in enumerate(times):
        f = os.path.join(tmpdir, f"f{i:04d}.png")
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", "-vf", f"scale={w}:-2", f])
        files.append(f)
    if not files:
        return
    rows = math.ceil(len(files) / cols)
    run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(tmpdir, "f%04d.png"), "-frames:v", "1",
         "-vf", f"tile={cols}x{rows}:padding=4:color=white", out_png])
    for f in files:
        os.remove(f)
    os.rmdir(tmpdir)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="ref-analysis")
    ap.add_argument("--max-fps", type=float, default=30)
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--sheet-every", type=float, default=1.0)
    ap.add_argument("--cut-threshold", type=float, default=0, help="override cut threshold (mean abs diff 0-255)")
    ap.add_argument("--max-seconds", type=float, default=300, help="analyze only the first N seconds (memory)")
    ap.add_argument("--music-range", default=None, help="e.g. 0.4-10.4: restrict tempo/key analysis to the music section")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    meta = probe(a.video)
    R = {"meta": meta}
    dur = meta["duration"]
    if dur > a.max_seconds:
        LIMIT.extend(["-t", str(a.max_seconds)])
        R["note"] = f"analyzed first {a.max_seconds}s of {dur:.1f}s"
        dur = a.max_seconds
    fps = min(meta["fps"] or 30, a.max_fps)

    # ---- cuts on a small fixed-rate decode
    F = frames(a.video, fps, 96, 54)
    diff = frame_diffs(F)
    luma = lumas(F)
    thr = a.cut_threshold or max(18.0, float(np.median(diff)) * 5)
    cuts = [0.0]
    for i in range(1, len(diff)):
        if diff[i] > thr and (i / fps - cuts[-1]) > 0.08:
            cuts.append(round(i / fps, 3))
    flashes = [round(i / fps, 3) for i in range(len(luma)) if luma[i] > 235]
    shots = []
    bounds = cuts + [dur]
    for s, e in zip(bounds[:-1], bounds[1:]):
        i0, i1 = int(s * fps), max(int(s * fps) + 1, int(e * fps))
        seg = F[i0:i1]
        mc = seg.reshape(-1, 3).mean(0) if len(seg) else np.zeros(3)
        motion = float(diff[i0 + 1:i1].mean()) if i1 - i0 > 1 else 0.0
        shots.append({"start": round(s, 3), "end": round(e, 3), "len": round(e - s, 3),
                      "mean_color": "#%02x%02x%02x" % tuple(int(v) for v in mc),
                      "mean_luma": round(float(luma[i0:i1].mean()) if i1 > i0 else 0, 1),
                      "motion": round(motion, 1)})
    R["cut_threshold"] = round(thr, 1)
    R["cuts_s"] = cuts[1:]
    R["flash_frames_s"] = flashes
    R["shots"] = shots
    lens = [s["len"] for s in shots]
    R["shot_stats"] = {"count": len(shots), "mean": round(float(np.mean(lens)), 3), "median": round(float(np.median(lens)), 3),
                       "longest": max(shots, key=lambda s: s["len"]) if shots else None}
    R["luma_per_second"] = [round(float(luma[int(i * fps):int((i + 1) * fps)].mean()), 1) for i in range(int(dur)) if int(i * fps) < len(luma)]

    # ---- holds at native cadence (drawing rate)
    try:
        N = native_frames(a.video, 64, 36)
        nfps = len(N) / dur if dur else 24
        nd = frame_diffs(N)[1:]
        for s in shots:
            i0, i1 = int(s["start"] * nfps), int(s["end"] * nfps)
            d = nd[i0:max(i0, i1 - 1)]
            if len(d) < 4:
                continue
            moving = d > 0.6
            # run lengths of 'same' frames between changes
            runs, r = [], 1
            for m in moving:
                if m:
                    runs.append(r); r = 1
                else:
                    r += 1
            if runs:
                vals, cnts = np.unique(runs, return_counts=True)
                s["hold_mode_frames"] = int(vals[cnts.argmax()])
                s["static_fraction"] = round(float((~moving).mean()), 2)
        R["native_fps_estimate"] = round(nfps, 2)
    except Exception as e:  # noqa
        R["holds_error"] = str(e)

    # ---- palette
    big = frames(a.video, max(0.5, min(fps, 24 / max(dur, 1))), 160, 90)
    px = big.reshape(-1, 3)[::7].astype(np.float32)
    R["palette"] = kmeans(px, a.k)

    # ---- audio
    if meta["audio"]:
        try:
            x = audio(a.video)
            mr = [float(v) for v in a.music_range.split("-")] if a.music_range else None
            R["audio"] = analyze_audio(x, 22050, dur, mr)
        except Exception as e:  # noqa
            R["audio_error"] = str(e)

    # ---- contact sheets
    mids = [(s["start"] + s["end"]) / 2 for s in shots]
    contact_sheet(a.video, mids, os.path.join(a.out, "sheet_shots.png"), cols=5)
    times = [i * a.sheet_every for i in range(int(dur / a.sheet_every) + 1)]
    for k in range(0, len(times), 25):
        contact_sheet(a.video, times[k:k + 25], os.path.join(a.out, f"sheet_timeline_{k // 25}.png"), cols=5)

    with open(os.path.join(a.out, "report.json"), "w") as f:
        json.dump(R, f, indent=1)
    write_md(R, os.path.join(a.out, "report.md"))
    print(open(os.path.join(a.out, "report.md")).read())


def write_md(R, path):
    m, L = R["meta"], []
    L.append(f"# Reference analysis\n\n- Duration {m['duration']:.2f}s · {m['width']}x{m['height']} · {m['fps'] and round(m['fps'], 3)} fps · audio: {m['audio']}")
    st = R["shot_stats"]
    L.append(f"- Shots: {st['count']} (mean {st['mean']}s, median {st['median']}s); longest {st['longest']['len']}s at {st['longest']['start']}s")
    L.append(f"- Cut threshold {R['cut_threshold']} · flash frames at {R['flash_frames_s'][:12]}")
    if "native_fps_estimate" in R:
        L.append(f"- Native cadence ≈ {R['native_fps_estimate']} fps (hold_mode_frames per shot below: 1 = on ones, 2 = on twos…)")
    L.append("\n## Shots\n| # | start | len | mean color | luma | motion | hold | static |\n|---|---|---|---|---|---|---|---|")
    for i, s in enumerate(R["shots"]):
        L.append(f"| {i} | {s['start']} | {s['len']} | {s['mean_color']} | {s['mean_luma']} | {s['motion']} | {s.get('hold_mode_frames', '')} | {s.get('static_fraction', '')} |")
    L.append("\n## Palette (k-means)\n" + ", ".join(f"{h} {p}%" for h, p in R["palette"]))
    au = R.get("audio")
    if au:
        L.append("\n## Audio")
        L.append(f"- Tempo candidates (BPM): {au['tempo_candidates_bpm']} → frames/beat @24fps {au.get('frames_per_beat_at_24fps')}")
        L.append(f"- Bass tonal center: {au['bass_tonal_center']} · key candidates: {au['key_candidates']}")
        L.append(f"- Pitch classes (bass): {au['bass_pitch_classes']}")
        L.append(f"- Pitch classes (combined): {au['chroma']}")
        L.append(f"- Loudest moment ≈ {au['loudest_moment_s']}s · silent gaps {au['silent_gaps_s']}")
        L.append(f"- Sub-bass accents (s): {au['sub_bass_accents_s'][:30]}")
        L.append(f"- Band means (dB): {au['band_mean_db']}")
        tr = au["loudness_trace_dbfs_per_0.25s"]
        L.append("- Loudness per 0.5s: " + " ".join(f"{i * 0.5:.1f}:{max(tr[i * 2:i * 2 + 2]):.0f}" for i in range(len(tr) // 2)))
        L.append(f"- Onsets (first 60): {au['onsets_s'][:60]}")
    L.append("\nContact sheets: sheet_shots.png (one per shot), sheet_timeline_*.png (every N s, 5x5).")
    open(path, "w").write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
