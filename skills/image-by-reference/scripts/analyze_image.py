#!/usr/bin/env python3
"""Measure a reference image for a style bible.

Usage:
  python3 analyze_image.py <image> [--out DIR] [--height 1600] [--seed 0] [--crop x0,y0,x1,y1]

--crop keeps only the artwork (fractions 0–1 or pixels): cut away scanner beds, mats, frames,
watermarks and UI chrome first, or they pollute the palette, value and border numbers. The
cropped image is saved as DIR/reference.png; use that file for compare.py too.

Writes into DIR (default: <image dir>/<image name>-analysis):
  report.md / report.json   all numbers below
  palette.png               the measured inks, swatch width = share of the image
  notan.png                 original | 2-value | 3-value | quantized to the palette (value design)
  detail.png                detail heat map, thirds grid, band boundaries (cyan), focal point (red)
  edges.png                 edge strength map (dark = strong edge)
  crops.png + crops/*.png   close-ups at 10 % of image height from the full-resolution file:
                            most-detailed tile, focal area, flattest area (texture), dark strokes

Measures: palette (k-means in Lab with an elbow estimate of distinct inks, CIEDE2000 merge),
per-ink share/position/typical feature width; value (percentiles, key, 2- and 3-value notan
shares, thirds grid); color (chroma, warm/cool, hue histogram); edges (density, orientation,
edge width = hardness); dark line work (stroke width); surface (flat share, grain, mottle);
composition (detail map + Gini concentration, focal point, salient peaks, visual-weight balance,
symmetry); bands (horizontal/vertical boundaries: horizons, title bands); border.

Widths are in per-mille of image height (‰H) so they transfer to any output size. Requires numpy
and Pillow. Numbers are evidence, not truth: confirm each against the pictures and the crops.
"""
import argparse, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imgstats as S  # noqa: E402


def fmt_report(path, st, crop_info):
    v, c, e, ln, s, comp = st["value"], st["color"], st["edges"], st["line"], st["surface"], st["composition"]
    L = []
    L.append(f"# Reference analysis: {os.path.basename(path)}\n")
    L.append(f"- Size {st['size'][0]}×{st['size'][1]} (aspect {st['aspect']}), analysed at {st['analysis_size'][0]}×{st['analysis_size'][1]}")
    L.append(f"- Distinct inks: **{len(st['palette'])}** (over-segmented k-means, near-duplicates merged, edge/transition blends dropped); "
             f"quantization error mean ΔE00 {st['quant_de_mean']} (p90 {st['quant_de_p90']}). "
             + ("Low error → flat-color / limited-ink style." if st["quant_de_mean"] < 4 else
                "Moderate error → limited palette with texture or gradients." if st["quant_de_mean"] < 7 else
                "High error → continuous tone (painterly / photographic / gradients)."))
    L.append("- k-means error curve (k, mean ΔE76; a steady slow decline = continuous tone): " + ", ".join(f"{k}:{e}" for k, e in st["palette_curve"]))
    ps = st["palette_structure"]
    L.append("\n## Style vs. content\n")
    L.append("Carry the STYLE: rendering, marks, edges, surface, value ladder, chroma discipline, detail, "
             "light. The CONTENT comes from the prompt: subjects, layout, hues, text, borders, emblems. "
             "The reference's actual colors are content; use its palette *structure* with the prompt's hues "
             "(scripts/derive_palette.py).")
    L.append("\n## Palette structure (style: carry this)\n")
    L.append(f"- {ps['n_inks']} inks; value ladder L* (dark→light) {ps['L_ladder']} with shares {ps['L_ladder_shares']}; "
             f"range {ps['L_range']}, mean step {ps['L_gap_mean']}, smallest step {ps['L_gap_min']}")
    L.append(f"- Chroma by ladder position {ps['C_by_L']}; share-weighted chroma {ps['chroma_mean_weighted']}; "
             f"accent ink C {ps['accent']['C']} at {ps['accent']['share'] * 100:.1f}% ({ps['accent']['ratio_to_median_C']}× the median ink)")
    L.append(f"- Hue spread {ps['hue_spread_deg']}° → {ps['harmony']} harmony (a structure trait; the hues themselves follow the prompt)")
    L.append(f"- Shape scale (share-weighted feature width) {ps['shape_scale_pmH']} ‰H")
    L.append("\n## Palette hues (content: reference only, don't copy unless the prompt calls for these colors)\n")
    L.append("| ink | share | L | C | h° | where (x, y ± spread) | feature width ‰H (p10 / med / p90) | roles |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for ink in st["palette"]:
        L.append(f"| `{ink['hex']}` | {ink['share'] * 100:.1f}% | {ink['L']} | {ink['C']} | {ink['h']:.0f} | "
                 f"{ink['x']}, {ink['y']} ± {ink['y_spread']} | {ink['width_p10_pmH']} / {ink['width_med_pmH']} / {ink['width_p90_pmH']} | "
                 f"{', '.join(ink.get('roles', []))} |")
    L.append("\nFeature width = typical thickness of that ink's shapes (min run over 4 directions). Small "
             "medians (< 3 ‰H) mean the ink is used for lines, hatching or specks; large medians mean big fields.")
    L.append("\n## Value\n")
    L.append(f"- L* mean {v['mean']} ± {v['std']}; percentiles 1/5/25/50/75/95/99: {v['p1_5_25_50_75_95_99']}; "
             f"key **{v['key']}**, range {v['range_p1_p99']}")
    L.append(f"- 3-value notan thresholds L*={v['notan3_thresholds']}: dark/mid/light = {v['notan3_shares_dark_mid_light']}")
    L.append(f"- 2-value notan threshold L*={v['notan2_threshold']}: dark share {v['notan2_dark_share']}")
    L.append(f"- Mean L* on a 3×3 grid (top row first): {v['thirds_grid_meanL']}")
    L.append(f"- Histogram (10 bins of L*): {v['hist10']}")
    L.append("\n## Color (saturation discipline is style; temperature and hues are content)\n")
    L.append(f"- Chroma p50/p90/p99 {c['chroma_p50_p90_p99']} → **{c['saturation_key']}**; chromatic pixels {c['chromatic_share']}")
    L.append(f"- Warm share of chroma {c['warm_share_of_chromatic']}; mean a*, b* {c['mean_a_b']}")
    L.append(f"- Hue histogram (30° bins from 0° = magenta-red; 90° ≈ yellow, 150° ≈ green, 240° ≈ blue): {c['hue_hist_30deg']}")
    L.append("\n## Edges and line\n")
    L.append(f"- Edge density {e['density']} (strong-edge ridge pixels {e['strong_edge_px_share']}); dominant orientation **{e['dominant_orientation']}**; "
             f"8 bins from horizontal: {e['orientation_8bins_from_horizontal']}")
    L.append(f"- Edge blur median {e['edge_blur_med_px']} px at analysis size ({e['edge_blur_med_pmH']} ‰H; an anti-aliased vector edge ≈ 0.5 px); "
             f"hard-edge share {e['hard_edge_share']} "
             + ("→ hard, cut edges." if e["hard_edge_share"] > 0.6 else "→ mixed edges." if e["hard_edge_share"] > 0.35 else "→ soft, blended edges."))
    L.append(f"- Dark ink share {ln['dark_share']}; dark stroke width median {ln['dark_stroke_width_med_pmH']} ‰H; "
             f"thin share of dark {ln['thin_dark_share_of_dark']} " + ("(line-driven)" if ln["thin_dark_share_of_dark"] > 0.4 else "(mass-driven)"))
    L.append("\n## Surface\n")
    L.append(f"- Flat share {s['flat_share']}; grain σ in flats {s['grain_std_in_flats']} L*; mottle σ {s['mottle_std_in_flats']} L*; "
             f"local std p50/p90 {s['local_std_p50_p90']}")
    L.append("\n## Composition (habits only; the prompt decides the layout)\n")
    L.append(f"- Focal point (x, y) {comp['focal_xy']}; distance to nearest thirds point {comp['focal_dist_to_nearest_thirds_pt']}; "
             f"salient peaks {comp['salient_peaks_xy']}")
    L.append(f"- Detail concentration (Gini of 8-column tile energies) {comp['detail_gini']} "
             + ("→ detail concentrated in a few areas." if comp["detail_gini"] > 0.45 else "→ detail spread fairly evenly."))
    L.append(f"- Visual weight center {comp['visual_weight_center_xy']}; left/right {comp['lr_weight_ratio']}; top/bottom {comp['tb_weight_ratio']}; "
             f"L-R symmetry {comp['lr_symmetry_corr']}")
    L.append("- Detail grid (rows top→bottom, 8 columns, shares of total):")
    for row in comp["detail_grid_rows_x8"]:
        L.append("  " + " ".join(f"{x * 100:4.1f}" for x in row))
    L.append("\n## Bands and border (layout features: content, include only if the prompt calls for them)\n")
    for b in st["bands"]["horizontal"]:
        L.append(f"- Horizontal boundary at y={b['y']} (ΔE {b['dE']}): {b['above']} above → {b['below']} below")
    for b in st["bands"]["vertical"]:
        L.append(f"- Vertical boundary at x={b['x']} (ΔE {b['dE']})")
    L.append(f"- Border: {st['border']}")
    L.append("\n## Crops (from the full-resolution file, 10 % of height each)\n")
    for name, box in crop_info:
        L.append(f"- {name}: x,y,w,h = {box}")
    L.append("\nNext: look at notan.png, detail.png and every crop at full size, then write the style bible "
             "(references/reference-analysis.md §5). Confirm each number by eye.")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out", default=None)
    ap.add_argument("--height", type=int, default=1600)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--crop", default=None, help="x0,y0,x1,y1 as fractions (0-1) or pixels")
    a = ap.parse_args()
    base = os.path.splitext(os.path.basename(a.image))[0]
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.image)), base + "-analysis")
    os.makedirs(os.path.join(out, "crops"), exist_ok=True)

    im = S.load_rgb(a.image)
    if a.crop:
        v = [float(x) for x in a.crop.split(",")]
        if all(x <= 1 for x in v):
            v = [v[0] * im.width, v[1] * im.height, v[2] * im.width, v[3] * im.height]
        im = im.crop(tuple(int(round(x)) for x in v))
        im.save(os.path.join(out, "reference.png"))
    st = S.measure(im, height=min(a.height, im.height), seed=a.seed)

    small, n2, n3, q = S.notan_images(im, st)
    S.hstack([S.label(small.copy(), "original"), S.label(n2, "2-value"), S.label(n3, "3-value"),
              S.label(q, f"{len(st['palette'])} inks")]).save(os.path.join(out, "notan.png"))
    S.palette_strip(st["palette"]).save(os.path.join(out, "palette.png"))
    S.detail_overlay(im, st).save(os.path.join(out, "detail.png"))
    S.edge_image(st).save(os.path.join(out, "edges.png"))
    cr = S.crops(im, st)
    for name, img, _ in cr:
        img.save(os.path.join(out, "crops", name + ".png"))
    S.hstack([S.label(img.copy(), name) for name, img, _ in cr]).save(os.path.join(out, "crops.png"))

    crop_info = [(n, b) for n, _, b in cr]
    report = fmt_report(a.image, st, crop_info)
    with open(os.path.join(out, "report.md"), "w") as f:
        f.write(report)
    with open(os.path.join(out, "report.json"), "w") as f:
        json.dump({**S.public(st), "crops": dict(crop_info)}, f, indent=1)
    print(report)
    print("wrote", out)


if __name__ == "__main__":
    main()
