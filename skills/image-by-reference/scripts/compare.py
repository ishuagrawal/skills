#!/usr/bin/env python3
"""Score a render's STYLE against its reference, and build a side-by-side sheet.

Usage:
  python3 compare.py <reference> <render> [--out DIR] [--height 1600] [--palette "#hex,#hex,..."]

The render is supposed to differ from the reference in content: subject, layout and hues come
from the prompt. So the score covers what should transfer: ink count and flatness, the value
ladder, saturation discipline and accent use, contrast, edges, line, grain and mottle, flat
share, detail spread and shape scale. Hues, temperature, value masses and composition are
listed as information only. Pass --palette (the hexes in your palette.js) to also check for
stray colors outside the palette you planned.

Use the cropped reference.png written by analyze_image.py when the original had a frame or scan
bed. Writes into DIR (default: <render dir>/compare):
  compare.png   reference | render, each one's 3-value notan, value ladders (structure, not
                hues), stray-color map, close-ups at the same relative scale
  report.md     one row per style trait: reference, render, status (✓ close, ~ near, ✗ off),
                and what to change; then the content information
  report.json

A ✓ table does not replace looking: the sheet and 1:1 crops decide.
"""
import argparse, json, os, sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imgstats as S  # noqa: E402


def status(ok, near):
    return "✓" if ok else "~" if near else "✗"


def ladder7(lad):
    return np.interp(np.linspace(0, 1, 7), np.linspace(0, 1, len(lad)), lad)


def ladder_strip(inks, width, height=90, label=""):
    by_L = sorted(inks, key=lambda i: i["L"])
    img = Image.new("RGB", (width, height), (255, 255, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    f = S.font(14)
    w = (width - 10) // max(len(by_L), 1)
    for j, ink in enumerate(by_L):
        col = tuple(int(ink["hex"][k:k + 2], 16) for k in (1, 3, 5))
        d.rectangle([j * w, 0, (j + 1) * w - 4, height], fill=col)
        tc = (0, 0, 0) if ink["L"] > 55 else (255, 255, 255)
        d.text((j * w + 5, 5), f"L{ink['L']:.0f} C{ink['C']:.0f}", fill=tc, font=f)
        d.text((j * w + 5, 23), f"{ink['share'] * 100:.0f}%", fill=tc, font=f)
    if label:
        S.label(img, label, 14)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reference")
    ap.add_argument("render")
    ap.add_argument("--out", default=None)
    ap.add_argument("--height", type=int, default=1600)
    ap.add_argument("--palette", default=None, help="planned inks, comma-separated hexes")
    a = ap.parse_args()
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.render)), "compare")
    os.makedirs(out, exist_ok=True)

    ref = S.load_rgb(a.reference)
    ren = S.load_rgb(a.render)
    h = min(a.height, ref.height, ren.height)
    R = S.measure(ref, h)
    O = S.measure(ren, h)
    pr, po = R["palette_structure"], O["palette_structure"]

    rows = []

    def row(name, rv, ov, st, hint=""):
        rows.append({"trait": name, "reference": rv, "render": ov, "status": st, "hint": hint if st != "✓" else ""})

    # ---- color structure
    nr, no = pr["n_inks"], po["n_inks"]
    row("distinct inks/colors", nr, no, status(abs(nr - no) <= 1, abs(nr - no) <= 2),
        "more colors than the reference: blends, gradients or transparency are creating new ones; fill with exact inks"
        if no > nr else "fewer colors than the reference: add value steps (the reference models forms with more inks)")
    row("flatness: error vs own inks (mean ΔE00)", R["quant_de_mean"], O["quant_de_mean"],
        status(O["quant_de_mean"] < R["quant_de_mean"] + 1.5, O["quant_de_mean"] < R["quant_de_mean"] + 3.5),
        "less flat than the reference: texture, blending or gradients inside shapes are too strong" if O["quant_de_mean"] > R["quant_de_mean"]
        else "flatter than the reference: it has more tone inside shapes (texture, gradation)")
    dl = float(np.abs(ladder7(pr["L_ladder"]) - ladder7(po["L_ladder"])).mean())
    row("value ladder (mean |ΔL*| of ink lightness steps)", pr["L_ladder"], po["L_ladder"], status(dl < 7, dl < 13),
        "ink lightness steps differ from the reference's; refit with derive_palette.py (or keep if the prompt changes the key, e.g. night)")
    dc = po["chroma_mean_weighted"] / max(pr["chroma_mean_weighted"], 1e-6)
    row("saturation level (share-weighted ink chroma)", pr["chroma_mean_weighted"], po["chroma_mean_weighted"],
        status(0.75 < dc < 1.33, 0.55 < dc < 1.8),
        "more saturated than the reference" if dc > 1 else "more muted than the reference")
    ra, oa = pr["accent"]["ratio_to_median_C"], po["accent"]["ratio_to_median_C"]
    row("accent strength (top chroma ÷ median ink chroma)", ra, oa, status(abs(oa - ra) / ra < 0.35, abs(oa - ra) / ra < 0.7),
        "the accent stands out more than in the reference" if oa > ra else "no ink stands out the way the reference's accent does")
    vr, vo = R["value"], O["value"]
    dr = vo["range_p1_p99"] - vr["range_p1_p99"]
    row("contrast range p1–p99 (L*)", vr["range_p1_p99"], vo["range_p1_p99"], status(abs(dr) < 10, abs(dr) < 18),
        "more contrast than the reference" if dr > 0 else "less contrast than the reference")

    # ---- marks, edges, surface
    er, eo = R["edges"], O["edges"]
    ed = eo["density"] / max(er["density"], 1e-6)
    row("busyness (edge density ratio)", er["density"], eo["density"], status(0.75 < ed < 1.33, 0.55 < ed < 1.8),
        "busier than the reference: merge small shapes, fewer marks" if ed > 1 else
        "simpler than the reference: add its level of internal shapes and marks")
    db = eo["edge_blur_med_px"] - er["edge_blur_med_px"]
    row("edge hardness (edge blur, px at analysis height)", er["edge_blur_med_px"], eo["edge_blur_med_px"],
        status(abs(db) < 0.4, abs(db) < 1.0),
        "edges softer than the reference: no blur/gradients on edges, raise supersample" if db > 0 else
        "edges harder than the reference: soften (brush, wash, blur)")
    lr, lo = R["line"], O["line"]
    tw = lo["thin_dark_share_of_dark"] - lr["thin_dark_share_of_dark"]
    row("line use (thin share of the darkest ink)", lr["thin_dark_share_of_dark"], lo["thin_dark_share_of_dark"],
        status(abs(tw) < 0.1, abs(tw) < 0.2), "more thin dark lines than the reference" if tw > 0 else "fewer thin dark lines than the reference")
    sr, so = R["surface"], O["surface"]

    def close(x, y, lo_, hi_, tol):
        x, y = x or 0, y or 0
        return (lo_ < y / max(x, 1e-6) < hi_) or abs(y - x) < tol
    row("grain σ in flat areas (L*)", sr["grain_std_in_flats"], so["grain_std_in_flats"],
        status(close(sr["grain_std_in_flats"], so["grain_std_in_flats"], 0.6, 1.6, 0.25), close(sr["grain_std_in_flats"], so["grain_std_in_flats"], 0.4, 2.5, 0.5)),
        "adjust fine paper/ink grain")
    row("mottle σ in flat areas (L*)", sr["mottle_std_in_flats"], so["mottle_std_in_flats"],
        status(close(sr["mottle_std_in_flats"], so["mottle_std_in_flats"], 0.6, 1.6, 0.4), close(sr["mottle_std_in_flats"], so["mottle_std_in_flats"], 0.4, 2.5, 0.8)),
        "adjust low-frequency ink unevenness / paper tone")
    df = so["flat_share"] - sr["flat_share"]
    row("flat area share", sr["flat_share"], so["flat_share"], status(abs(df) < 0.1, abs(df) < 0.2),
        "more texture/detail inside shapes than the reference" if df < 0 else "flatter than the reference")
    dg = O["composition"]["detail_gini"] - R["composition"]["detail_gini"]
    row("detail spread (Gini; low = even)", R["composition"]["detail_gini"], O["composition"]["detail_gini"],
        status(abs(dg) < 0.08, abs(dg) < 0.16),
        "detail more concentrated than the reference (empty areas)" if dg > 0 else "detail spread more evenly than the reference")
    sc = po["shape_scale_pmH"] / max(pr["shape_scale_pmH"], 1e-6)
    row("shape scale (share-weighted feature width ratio)", pr["shape_scale_pmH"], po["shape_scale_pmH"],
        status(0.7 < sc < 1.4, 0.5 < sc < 2),
        "shapes chunkier than the reference's" if sc > 1 else "shapes finer/more fragmented than the reference's")

    # ---- stray colors vs the planned palette
    stray = None
    lab_r = S.gauss(S.srgb_to_lab(np.asarray(S.resize_h(ren, h))), 0.7)
    if a.palette:
        hexes = [x.strip() for x in a.palette.split(",") if x.strip()]
        Cp = S.srgb_to_lab(np.array([[[int(x[i:i + 2], 16) for i in (1, 3, 5)] for x in hexes]], np.uint8))[0]
        lab_flat = lab_r.reshape(-1, 3)
        idx = S.assign(lab_flat, Cp)
        dn = S.de2000(lab_flat, Cp[idx]).reshape(lab_r.shape[:2])
        stray = dn > 10
        sp = float(stray.mean())
        row("stray colors outside the planned palette (ΔE00 > 10)", "—", f"{sp * 100:.1f}%", status(sp < 0.03, sp < 0.08),
            "colors you didn't plan: gradients, transparency, blended edges, or a fill outside palette.js")

    # ---- content (informational)
    info = {
        "harmony / hue spread": [f"{pr['harmony']} {pr['hue_spread_deg']}°", f"{po['harmony']} {po['hue_spread_deg']}°"],
        "warm share of chroma": [R["color"]["warm_share_of_chromatic"], O["color"]["warm_share_of_chromatic"]],
        "value key / median L*": [f"{vr['key']} {vr['p1_5_25_50_75_95_99'][3]}", f"{vo['key']} {vo['p1_5_25_50_75_95_99'][3]}"],
        "3-value masses dark/mid/light (own thresholds)": [vr["notan3_shares_dark_mid_light"], vo["notan3_shares_dark_mid_light"]],
        "dominant edge orientation": [er["dominant_orientation"], eo["dominant_orientation"]],
        "focal point xy": [R["composition"]["focal_xy"], O["composition"]["focal_xy"]],
        "aspect": [R["aspect"], O["aspect"]],
    }

    # ---- sheet
    H1 = 900
    a1, a2 = S.resize_h(ref, H1), S.resize_h(ren, H1)
    top = S.hstack([S.label(a1.copy(), "reference"), S.label(a2.copy(), "render")])

    def notan(img, st):
        t1, t2 = st["value"]["notan3_thresholds"]
        L = S.srgb_to_lab(np.asarray(S.resize_h(img, 450)))[..., 0]
        return Image.fromarray(np.where(L <= t1, 30, np.where(L <= t2, 128, 235)).astype(np.uint8)).convert("RGB")
    mids = [S.label(notan(ref, R), "ref 3-value"), S.label(notan(ren, O), "render 3-value")]
    if stray is not None:
        fm = Image.fromarray(np.where(stray[..., None], np.array([255, 0, 150], np.uint8),
                                      (np.asarray(S.resize_h(ren, h)) * 0.35 + 140).astype(np.uint8)))
        mids.append(S.label(S.resize_h(fm, 450), f"stray colors {stray.mean() * 100:.1f}%"))
    mid = S.hstack(mids)
    wid = max(top.width - 16, 800)
    lad = S.vstack([ladder_strip(R["palette"], wid, label="reference value ladder (dark→light, with chroma and share)"),
                    ladder_strip(O["palette"], wid, label="render value ladder")])
    cref = S.crops(ref, R, size=360)[:2]
    cren = S.crops(ren, O, size=360)[:2]
    crow = S.hstack([S.label(c.copy(), "ref " + n) for n, c, _ in cref] + [S.label(c.copy(), "render " + n) for n, c, _ in cren])
    S.vstack([top, mid, lad, crow]).save(os.path.join(out, "compare.png"))

    n_ok = sum(r["status"] == "✓" for r in rows)
    L = [f"# Style comparison: {os.path.basename(a.render)} vs {os.path.basename(a.reference)}\n",
         f"**{n_ok}/{len(rows)} style traits ✓**, {sum(r['status'] == '~' for r in rows)} near, "
         f"{sum(r['status'] == '✗' for r in rows)} off. Compared at {h} px height. Hues and content are not scored.\n",
         "| style trait | reference | render | | what to change |", "| --- | --- | --- | --- | --- |"]
    for r in rows:
        L.append(f"| {r['trait']} | {r['reference']} | {r['render']} | {r['status']} | {r['hint']} |")
    L.append("\n## Content (information only: follows the prompt)\n")
    for k, (x, y) in info.items():
        L.append(f"- {k}: reference {x} · render {y}")
    L.append("\nNow open compare.png and judge by eye: marks, edges, texture and finish at full size and in 1:1 crops.")
    rep = "\n".join(L) + "\n"
    with open(os.path.join(out, "report.md"), "w") as f:
        f.write(rep)
    with open(os.path.join(out, "report.json"), "w") as f:
        json.dump({"rows": rows, "content": info}, f, indent=1, default=str)
    print(rep)
    print("wrote", out)


if __name__ == "__main__":
    main()
