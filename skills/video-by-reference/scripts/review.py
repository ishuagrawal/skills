#!/usr/bin/env python3
"""QA a rendered film: contact sheets you can "watch", plus an audio report you can read.

Usage:
  python3 review.py <film.mp4> [--out DIR] [--fps 1] [--cols 5] [--rows 5] [--cues cues.json]

Writes into DIR (default: <film dir>/review):
  sheet_00.png …     frames at --fps, tiled cols×rows (row-major, left→right, top→bottom);
                     each sheet covers cols*rows/fps seconds — sheet k starts at k*cols*rows/fps s
  spectrogram.png    log-frequency spectrogram of the soundtrack
  report.md          specs, loudness (integrated LUFS, true peak), RMS trace per 0.5 s,
                     silent stretches, and warnings

Optional --cues: a JSON object {"name": seconds, …}. The template's renderer writes out/cues.json
from src/timeline.js automatically. The trace is annotated so you can check that hits and drops
land where the cue sheet says.
"""
import argparse, json, math, os, re, subprocess, sys


def run(cmd, binary=False, check=True):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {p.stderr.decode(errors='ignore')[-600:]}")
    return p if binary else (p.stdout.decode(errors="ignore"), p.stderr.decode(errors="ignore"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film")
    ap.add_argument("--out", default=None)
    ap.add_argument("--fps", type=float, default=1.0)
    ap.add_argument("--cols", type=int, default=5)
    ap.add_argument("--rows", type=int, default=5)
    ap.add_argument("--width", type=int, default=400)
    ap.add_argument("--cues", default=None)
    a = ap.parse_args()
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.film)), "review")
    os.makedirs(out, exist_ok=True)
    warn, L = [], []

    meta = json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", a.film])[0])
    v = next((s for s in meta["streams"] if s["codec_type"] == "video"), {})
    au = next((s for s in meta["streams"] if s["codec_type"] == "audio"), None)
    dur = float(meta["format"]["duration"])
    size_mb = int(meta["format"]["size"]) / 1e6
    L.append(f"# Review: {os.path.basename(a.film)}\n")
    L.append(f"- {dur:.2f}s · {v.get('width')}x{v.get('height')} · {v.get('r_frame_rate')} fps · {v.get('codec_name')}/{v.get('pix_fmt')}"
             f" · audio {au and au.get('codec_name')} {au and au.get('sample_rate')} Hz · {size_mb:.1f} MB")
    if size_mb > 30:
        L.append(f"- Note: {size_mb:.0f} MB exceeds typical 25–30 MB upload limits; offer a compressed copy if the user needs to share it.")

    # ---------- contact sheets
    for f in os.listdir(out):
        if f.startswith("sheet_") and f.endswith(".png"):
            os.remove(os.path.join(out, f))
    per = a.cols * a.rows
    run(["ffmpeg", "-v", "error", "-y", "-i", a.film, "-vf",
         f"fps={a.fps},scale={a.width}:-2,tile={a.cols}x{a.rows}:padding=4:color=white",
         "-start_number", "0", os.path.join(out, "sheet_%02d.png")])
    sheets = sorted(f for f in os.listdir(out) if f.startswith("sheet_"))
    L.append(f"- Contact sheets: {len(sheets)} × {per} frames at {a.fps} fps (sheet k starts at {per / a.fps:.0f}·k s)")

    if not au:
        warn.append("no audio stream")
    else:
        # ---------- loudness (EBU R128) + true peak
        _, err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", a.film, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"])
        summ = err[err.rfind("Summary:"):]
        I = re.search(r"I:\s+(-?[\d.]+) LUFS", summ)
        LRA = re.search(r"LRA:\s+(-?[\d.]+) LU", summ)
        TP = re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ)
        I, LRA, TP = (float(x.group(1)) if x else None for x in (I, LRA, TP))
        L.append(f"- Loudness: integrated {I} LUFS · range {LRA} LU · true peak {TP} dBTP")
        if I is not None and not (-17.5 <= I <= -12.5):
            warn.append(f"integrated loudness {I} LUFS outside -17.5…-12.5")
        if TP is not None and TP > -1.0:
            warn.append(f"true peak {TP} dBTP above -1.0 (add/raise a limiter)")
        # ---------- RMS trace
        raw = run(["ffmpeg", "-v", "error", "-i", a.film, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], binary=True).stdout
        import array
        x = array.array("h", raw)
        hop = 8000
        trace = []
        for i in range(0, len(x), hop):
            seg = x[i:i + hop:4]
            if not seg:
                break
            trace.append(20 * math.log10(math.sqrt(sum(s * s for s in seg) / len(seg)) / 32768 + 1e-9))
        cues = {}
        if a.cues:
            raw = json.load(open(a.cues))
            # flatten list-valued cues (e.g. "shake": [18.5, 19, 19.5]) into shake0, shake1, ...
            for k, v in raw.items():
                if isinstance(v, (int, float)): cues[k] = v
                elif isinstance(v, list): cues.update({f"{k}{i}": x for i, x in enumerate(v) if isinstance(x, (int, float))})
        L.append("\n## RMS per 0.5 s (dBFS)")
        line = []
        for i, db in enumerate(trace):
            t = i * 0.5
            tag = "".join(f" ←{k}" for k, c in cues.items() if t <= c < t + 0.5)
            line.append(f"{t:6.1f}: {db:6.1f} {'#' * max(0, int((db + 60) / 2))}{tag}")
        L.extend(line)
        # silent stretches and suspicious flatlines
        quiet = [i for i, db in enumerate(trace) if db < -38]
        runs, start = [], None
        for i in range(len(trace) + 1):
            q = i < len(trace) and trace[i] < -38
            if q and start is None:
                start = i
            if not q and start is not None:
                runs.append((start * 0.5, i * 0.5)); start = None
        L.append("\n## Quiet stretches (< -38 dBFS)\n" + (", ".join(f"{a_:.1f}–{b_:.1f}s" for a_, b_ in runs) or "none"))
        dead = [r for r in runs if r[1] - r[0] >= 2.0 and min(trace[int(r[0] * 2):int(r[1] * 2)]) < -80]
        if dead:
            warn.append(f"digital silence ≥2 s at {dead} (missing room tone or a broken bus?)")
        flat = sum(1 for i in range(1, len(trace)) if abs(trace[i] - trace[i - 1]) < 0.3) / max(1, len(trace) - 1)
        if flat > 0.6:
            warn.append("loudness trace is very flat — the mix may lack dynamics/drop-outs")
        # ---------- spectrogram
        run(["ffmpeg", "-v", "error", "-y", "-i", a.film, "-lavfi", "showspectrumpic=s=1600x420:legend=1:scale=log:fscale=log:color=intensity",
             os.path.join(out, "spectrogram.png")])
        L.append("\nSpectrogram: spectrogram.png (look for constant low rumble, stuck tones, missing highs)")

    L.insert(2, "\n## Warnings\n" + ("\n".join(f"- {w}" for w in warn) if warn else "- none") + "\n")
    with open(os.path.join(out, "report.md"), "w") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L[:12]))
    print(f"\n→ {out}/report.md, {len(sheets)} sheets, spectrogram.png")


if __name__ == "__main__":
    main()
