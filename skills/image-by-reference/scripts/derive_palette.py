#!/usr/bin/env python3
"""Build a palette for the PROMPT that has the REFERENCE's palette structure.

The reference's hues are content; its palette structure is style: how many inks, their value
ladder (how light/dark each step is), how saturated they are, how one accent stands out. This
tool keeps your hues (chosen for the prompt) and fits their lightness and chroma to the
reference's structure.

Usage:
  python3 derive_palette.py <ref-analysis/report.json> --colors "sky=#46507a,sea=#2c6b80,glow=#f0a24a,rock=#1c2030,foam=#efe9dc,coral=#dc8676,haze=#9aa6b8"
        [--value-fit 1.0] [--chroma-fit 1.0] [--chroma-scale 1.0] [--out DIR]

- Lightness: colors are sorted by their own L* and placed on the reference's value ladder
  (interpolated when the counts differ). --value-fit 0..1 blends from your L* (0) to the
  ladder (1). Lower it when the prompt deliberately changes the key (night, snow, fog) and keep
  the ladder's spacing in mind instead.
- Chroma: colors are ranked by their own chroma and given the reference's chroma levels by
  rank, so the prompt's most saturated color stays the accent and near-neutrals stay neutral.
  --chroma-fit blends (0 = keep yours); --chroma-scale multiplies the reference levels (use it
  when the prompt demands more or less saturation than the reference, e.g. "neon").
- Hue is always yours. Append "!" to lock a color exactly ("brand=#d2232a!").
- Out-of-gamut results lose chroma (never hue or lightness) until they fit sRGB.

Prints a table and a palette.js snippet; writes DIR/palette-fit.png (reference ladder, your
input, fitted result) when --out is given.
"""
import argparse, json, os, sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imgstats as S  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402


def lab_of(hexs):
    rgb = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in hexs], np.uint8)
    return S.srgb_to_lab(rgb[None])[0].astype(np.float64)


def to_lab(L, C, h):
    return np.array([L, C * np.cos(np.radians(h)), C * np.sin(np.radians(h))])


def in_gamut(lab):
    rgb = S.lab_to_srgb(lab[None, None].astype(np.float32))[0, 0]
    back = S.srgb_to_lab(rgb[None, None])[0, 0]
    return float(S.de2000(lab, back)) < 1.0, rgb


def fit_gamut(L, C, h):
    c = C
    for _ in range(60):
        ok, rgb = in_gamut(to_lab(L, c, h))
        if ok:
            return rgb, c
        c *= 0.95
    return in_gamut(to_lab(L, c, h))[1], c


def ladder_at(ladder, n):
    """n lightness values spread over the reference ladder (same values when n matches)."""
    if n == len(ladder):
        return list(ladder)
    q = np.linspace(0, 1, n)
    return list(np.interp(q, np.linspace(0, 1, len(ladder)), ladder))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report")
    ap.add_argument("--colors", required=True, help='"role=#hex,role=#hex!,..." (! = lock)')
    ap.add_argument("--value-fit", type=float, default=1.0)
    ap.add_argument("--chroma-fit", type=float, default=1.0)
    ap.add_argument("--chroma-scale", type=float, default=1.0)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    rep = json.load(open(a.report))
    ps = rep["palette_structure"]
    ref_L = ps["L_ladder"]
    ref_C = sorted(i["C"] for i in rep["palette"])

    items = []
    for part in a.colors.split(","):
        role, hx = part.strip().split("=")
        lock = hx.endswith("!")
        items.append({"role": role.strip(), "hex": hx.strip().rstrip("!").lower(), "lock": lock})
    labs = lab_of([i["hex"] for i in items])
    for it, lab in zip(items, labs):
        L, C, h = S.lch(lab)
        it.update(L=float(L), C=float(C), h=float(h))

    n = len(items)
    if abs(n - ps["n_inks"]) > 1:
        print(f"note: the reference uses {ps['n_inks']} inks and you gave {n}. Ink count is a style trait; "
              f"aim for {ps['n_inks']} (±1) and reuse inks across planes the way the reference does.\n")
    Ls = ladder_at(ref_L, n)
    Cs = ladder_at(ref_C, n)
    for rank, it in enumerate(sorted(items, key=lambda i: i["L"])):
        it["L_target"] = Ls[rank]
    for rank, it in enumerate(sorted(items, key=lambda i: i["C"])):
        it["C_target"] = Cs[rank] * a.chroma_scale
    for it in items:
        if it["lock"]:
            it.update(L2=it["L"], C2=it["C"], out=it["hex"])
            continue
        L2 = it["L"] + (it["L_target"] - it["L"]) * a.value_fit
        C2 = it["C"] + (it["C_target"] - it["C"]) * a.chroma_fit
        rgb, C2 = fit_gamut(L2, C2, it["h"])
        it.update(L2=L2, C2=C2, out=S.hexof(rgb))

    print(f"Reference structure: {ps['n_inks']} inks, L* ladder {ref_L}, chroma levels {[round(c, 1) for c in ref_C]}, "
          f"{ps['harmony']} harmony (spread {ps['hue_spread_deg']}°), accent {ps['accent']['ratio_to_median_C']}× median chroma.")
    print(f"Ladder shares (dark→light): {ps['L_ladder_shares']}: give your big areas to the same ladder steps.\n")
    print("| role | input | L C h | fitted | L C |")
    print("| --- | --- | --- | --- | --- |")
    for it in sorted(items, key=lambda i: i["L2"]):
        print(f"| {it['role']} | `{it['hex']}` | {it['L']:.0f} {it['C']:.0f} {it['h']:.0f} | `{it['out']}` | {it['L2']:.0f} {it['C2']:.0f}"
              + (" (locked)" if it["lock"] else "") + " |")
    print("\npalette.js:\nexport const P = {")
    for it in sorted(items, key=lambda i: i["L2"]):
        print(f"  {it['role']}: '{it['out']}',")
    print("};")

    if a.out:
        os.makedirs(a.out, exist_ok=True)
        W, h = 1200, 110
        img = Image.new("RGB", (W, h * 3 + 40), (255, 255, 255))
        d = ImageDraw.Draw(img)
        f = S.font(15)
        rows = [("reference ladder", [S.hexof(S.lab_to_srgb(to_lab(i["L"], i["C"], i["h"])[None, None].astype(np.float32))[0, 0]) for i in sorted(rep["palette"], key=lambda i: i["L"])]),
                ("your input", [i["hex"] for i in sorted(items, key=lambda i: i["L"])]),
                ("fitted", [i["out"] for i in sorted(items, key=lambda i: i["L2"])])]
        for r, (name, hexes) in enumerate(rows):
            y = 10 + r * (h + 10)
            w = (W - 160) // max(len(hexes), 1)
            d.text((8, y + h // 2 - 8), name, fill=(0, 0, 0), font=f)
            for j, hx in enumerate(hexes):
                col = tuple(int(hx[k:k + 2], 16) for k in (1, 3, 5))
                d.rectangle([150 + j * w, y, 150 + (j + 1) * w - 4, y + h], fill=col)
                L = S.lch(lab_of([hx])[0])[0]
                d.text((156 + j * w, y + 6), hx, fill=(0, 0, 0) if L > 55 else (255, 255, 255), font=f)
        img.save(os.path.join(a.out, "palette-fit.png"))
        print("\nwrote", os.path.join(a.out, "palette-fit.png"))


if __name__ == "__main__":
    main()
