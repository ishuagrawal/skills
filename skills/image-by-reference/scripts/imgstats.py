"""Shared still-image measurements for analyze_image.py and compare.py (numpy + Pillow only).

Every measurement is taken on an image resized to a fixed analysis height (default 1600 px), so
numbers in pixels compare across images of different sizes. Widths are also reported in
per-mille of the image height (‰H), which is the unit to design against.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

Image.MAX_IMAGE_PIXELS = 400_000_000


# ---------------------------------------------------------------- loading

def load_rgb(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    return im.convert("RGB")


def resize_h(im, h):
    if im.height == h:
        return im
    w = max(1, round(im.width * h / im.height))
    return im.resize((w, h), Image.LANCZOS)


# ---------------------------------------------------------------- color

_M = np.array([[0.4124564, 0.3575761, 0.1804375],
               [0.2126729, 0.7151522, 0.0721750],
               [0.0193339, 0.1191920, 0.9503041]], np.float32)
_WHITE = np.array([0.95047, 1.0, 1.08883], np.float32)


def srgb_to_lab(rgb):
    c = rgb.astype(np.float32) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = (lin @ _M.T) / _WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1).astype(np.float32)


def lab_to_srgb(lab):
    lab = np.asarray(lab, np.float32)
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * _WHITE
    lin = xyz @ np.linalg.inv(_M).T
    lin = np.clip(lin, 0, 1)
    c = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    return np.clip(np.round(c * 255), 0, 255).astype(np.uint8)


def hexof(rgb):
    r, g, b = [int(x) for x in rgb]
    return f"#{r:02x}{g:02x}{b:02x}"


def lch(lab):
    lab = np.asarray(lab, np.float32)
    C = np.hypot(lab[..., 1], lab[..., 2])
    h = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    return lab[..., 0], C, h


def de2000(x, y):
    """CIEDE2000 between broadcastable Lab arrays."""
    x = np.asarray(x, np.float64); y = np.asarray(y, np.float64)
    L1, a1, b1 = x[..., 0], x[..., 1], x[..., 2]
    L2, a2, b2 = y[..., 0], y[..., 1], y[..., 2]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb7 = ((C1 + C2) / 2) ** 7
    G = 0.5 * (1 - np.sqrt(Cb7 / (Cb7 + 25.0 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = h2p - h1p
    dh = np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh))
    zero = (C1p * C2p) == 0
    dh = np.where(zero, 0, dh)
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh) / 2)
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hs = h1p + h2p
    hbp = np.where(zero, hs, np.where(np.abs(h1p - h2p) <= 180, hs / 2,
                                      np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2)))
    T = (1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp))
         + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dth = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Cbp7 = Cbp ** 7
    Rc = 2 * np.sqrt(Cbp7 / (Cbp7 + 25.0 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dth)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


# ---------------------------------------------------------------- filters

def box(a, r):
    """Box mean with radius r (window 2r+1), edge-padded, any trailing channels."""
    r = int(r)
    if r < 1:
        return a.astype(np.float32)

    def along(x, axis):
        pad = [(0, 0)] * x.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(x, pad, mode="edge"), axis=axis, dtype=np.float64)
        n = x.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        return ((hi - lo) / (2 * r + 1)).astype(np.float32)

    return along(along(a.astype(np.float32), 0), 1)


def gauss(a, sigma):
    """Gaussian blur: exact separable kernel for small sigma, three box passes for large."""
    if sigma <= 0.3:
        return a.astype(np.float32)
    if sigma < 3:
        r = int(math.ceil(3 * sigma))
        k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
        k /= k.sum()
        x = a.astype(np.float32)
        for axis in (0, 1):
            pad = [(0, 0)] * x.ndim
            pad[axis] = (r, r)
            p = np.pad(x, pad, mode="edge")
            n = x.shape[axis]
            x = sum(k[i] * np.take(p, np.arange(i, i + n), axis=axis) for i in range(2 * r + 1)).astype(np.float32)
        return x
    w = math.sqrt(12 * sigma * sigma / 3 + 1)
    r = max(1, int(round((w - 1) / 2)))
    return box(box(box(a, r), r), r)


def local_std(a, r):
    m = box(a, r)
    return np.sqrt(np.maximum(box(a * a, r) - m * m, 0))


def maxmin(a, r):
    """Square max and min filters of radius r (separable, edge-padded)."""
    from numpy.lib.stride_tricks import sliding_window_view as sw
    p = np.pad(a, r, mode="edge")
    mx = sw(sw(p, 2 * r + 1, axis=0).max(-1), 2 * r + 1, axis=1).max(-1)
    mn = sw(sw(p, 2 * r + 1, axis=0).min(-1), 2 * r + 1, axis=1).min(-1)
    return mx, mn


# ---------------------------------------------------------------- clustering

def assign(X, C, chunk=400_000):
    out = np.empty(len(X), np.int32)
    C = np.asarray(C, np.float64)
    cc = (C ** 2).sum(1)[None]
    for i in range(0, len(X), chunk):
        x = X[i:i + chunk].astype(np.float64)
        with np.errstate(all="ignore"):  # macOS Accelerate raises spurious FPE flags in matmul
            out[i:i + chunk] = ((x ** 2).sum(1)[:, None] - 2 * x @ C.T + cc).argmin(1)
    return out


def kmeans(X, k, iters=30, seed=0):
    rng = np.random.default_rng(seed)
    C = [X[rng.integers(len(X))]]
    d2 = ((X - C[0]) ** 2).sum(1)
    for _ in range(1, k):
        p = d2 / d2.sum() if d2.sum() > 0 else None
        C.append(X[rng.choice(len(X), p=p)])
        d2 = np.minimum(d2, ((X - C[-1]) ** 2).sum(1))
    C = np.array(C, np.float32)
    for _ in range(iters):
        lab = assign(X, C)
        newC = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)], np.float32)
        if np.abs(newC - C).max() < 1e-3:
            C = newC
            break
        C = newC
    lab = assign(X, C)
    err = np.sqrt(((X - C[lab]) ** 2).sum(1)).mean()
    return C, lab, float(err)


def merge_close(C, share, thresh=3.0):
    """Merge palette entries closer than `thresh` CIEDE2000 (share-weighted)."""
    C, share = [c for c in C], [s for s in share]
    changed = True
    while changed and len(C) > 1:
        changed = False
        best = None
        for i in range(len(C)):
            for j in range(i + 1, len(C)):
                d = float(de2000(C[i], C[j]))
                if d < thresh and (best is None or d < best[0]):
                    best = (d, i, j)
        if best:
            _, i, j = best
            w = share[i] + share[j]
            C[i] = (C[i] * share[i] + C[j] * share[j]) / max(w, 1e-9)
            share[i] = w
            del C[j], share[j]
            changed = True
    return np.array(C, np.float32), np.array(share)


def prune_blends(C, share, tol=5.0):
    """Drop clusters that sit on the line between two larger clusters: anti-aliased edges,
    soft transitions and overprint fringes, not inks of their own."""
    C, share = list(C), list(share)
    changed = True
    while changed and len(C) > 2:
        changed = False
        for p in sorted(range(len(C)), key=lambda i: share[i]):
            P = C[p]
            for a in range(len(C)):
                for b in range(a + 1, len(C)):
                    if p in (a, b) or share[p] >= 0.5 * min(share[a], share[b]):
                        continue
                    A, B = C[a], C[b]
                    AB = B - A
                    t = float(np.dot(P - A, AB) / max(np.dot(AB, AB), 1e-9))
                    if 0.08 < t < 0.92 and np.linalg.norm(P - (A + t * AB)) < tol:
                        share[a] += share[p] * (1 - t)
                        share[b] += share[p] * t
                        del C[p], share[p]
                        changed = True
                        break
                if changed:
                    break
            if changed:
                break
    return np.array(C, np.float32), np.array(share)


def palette(lab_img, kmax=16, seed=0, sample=100_000, min_share=0.004):
    """Distinct inks: over-segment with k-means, merge near-duplicates (ΔE00 < 5: texture and
    mottling of one ink), drop blend clusters (edges and transitions) and specks (< min_share)."""
    X = lab_img.reshape(-1, 3)
    rng = np.random.default_rng(seed)
    S = X[rng.choice(len(X), min(sample, len(X)), replace=False)]
    curve = []
    for k in (2, 3, 4, 5, 6, 8, 10, 12):
        _, _, err = kmeans(S, k, seed=seed)
        curve.append((k, err))
    C, lab, err = kmeans(S, kmax, seed=seed)
    curve.append((kmax, err))
    share = np.bincount(lab, minlength=kmax) / len(S)
    C, share = merge_close(C, share, 5.0)
    C, share = prune_blends(C, share)
    C, share = merge_close(C, share, 5.0)
    keep = share >= min_share
    C = C[keep]
    labels = assign(X, C).reshape(lab_img.shape[:2])
    # re-center each ink on its own pixels, then re-assign
    C = np.array([X[labels.ravel() == j].mean(0) if (labels == j).any() else C[j] for j in range(len(C))], np.float32)
    labels = assign(X, C).reshape(lab_img.shape[:2])
    share = np.bincount(labels.ravel(), minlength=len(C)) / labels.size
    order = np.argsort(-share)
    remap = np.empty_like(order); remap[order] = np.arange(len(order))
    return C[order], share[order], remap[labels], curve, len(C)


# ---------------------------------------------------------------- thresholds

def otsu2(L):
    """Two thresholds (dark|mid|light) on L* maximizing between-class variance."""
    hist = np.bincount(np.clip(L, 0, 100).astype(int).ravel(), minlength=101).astype(np.float64)
    p = hist / hist.sum()
    v = np.arange(101)
    P = np.cumsum(p)
    M = np.cumsum(p * v)
    mt = M[-1]
    best, bt = -1, (33, 66)
    for t1 in range(5, 95):
        for t2 in range(t1 + 3, 98):
            w0, w1, w2 = P[t1], P[t2] - P[t1], 1 - P[t2]
            if min(w0, w1, w2) < 1e-4:
                continue
            m0, m1, m2 = M[t1] / w0, (M[t2] - M[t1]) / w1, (mt - M[t2]) / w2
            s = w0 * (m0 - mt) ** 2 + w1 * (m1 - mt) ** 2 + w2 * (m2 - mt) ** 2
            if s > best:
                best, bt = s, (t1, t2)
    return bt


def otsu1(L):
    hist = np.bincount(np.clip(L, 0, 100).astype(int).ravel(), minlength=101).astype(np.float64)
    p = hist / hist.sum()
    v = np.arange(101)
    best, bt = -1, 50
    for t in range(3, 98):
        w0, w1 = p[:t + 1].sum(), p[t + 1:].sum()
        if w0 < 1e-4 or w1 < 1e-4:
            continue
        m0, m1 = (p[:t + 1] * v[:t + 1]).sum() / w0, (p[t + 1:] * v[t + 1:]).sum() / w1
        s = w0 * w1 * (m0 - m1) ** 2
        if s > best:
            best, bt = s, t
    return bt


# ---------------------------------------------------------------- strokes

def runs(mask):
    """Length of the horizontal run each True pixel belongs to."""
    H, W = mask.shape
    p = np.zeros((H, W + 2), np.int8)
    p[:, 1:-1] = mask
    f = p.ravel()
    d = np.diff(f.astype(np.int16))
    st = np.flatnonzero(d == 1) + 1
    en = np.flatnonzero(d == -1) + 1
    acc = np.zeros(f.size + 1, np.int64)
    np.add.at(acc, st, en - st)
    np.add.at(acc, en, -(en - st))
    return np.cumsum(acc)[:-1].reshape(H, W + 2)[:, 1:-1]


def _skew(mask, flip):
    H, W = mask.shape
    m = mask[:, ::-1] if flip else mask
    S = np.zeros((H, W + H - 1), bool)
    for i in range(H):
        S[i, H - 1 - i:H - 1 - i + W] = m[i]
    return S


def _unskew(S, H, W, flip):
    out = np.empty((H, W), S.dtype)
    for i in range(H):
        out[i] = S[i, H - 1 - i:H - 1 - i + W]
    return out[:, ::-1] if flip else out


def stroke_width(mask):
    """Per-pixel local stroke width: min run length over 4 directions (diagonals × √2)."""
    H, W = mask.shape
    h = runs(mask)
    v = runs(mask.T).T
    best = np.minimum(h, v).astype(np.float32)
    if H * W <= 6_000_000:
        for flip in (False, True):
            S = _skew(mask, flip)
            d = runs(S.T).T
            best = np.minimum(best, _unskew(d, H, W, flip) * math.sqrt(2))
    return best


# ---------------------------------------------------------------- palette structure

def palette_structure(inks):
    """The transferable part of a palette: how many inks, their value ladder, chroma levels,
    hue spread and accent use. Hues themselves are content and come from the prompt."""
    if not inks:
        return {}
    by_L = sorted(inks, key=lambda i: i["L"])
    Ls = [i["L"] for i in by_L]
    gaps = [b - a for a, b in zip(Ls, Ls[1:])] or [0]
    chrom = [i for i in inks if i["C"] > 8]
    if chrom:
        w = np.array([i["share"] * i["C"] for i in chrom])
        ang = np.radians([i["h"] for i in chrom])
        R = float(np.hypot((w * np.cos(ang)).sum(), (w * np.sin(ang)).sum()) / max(w.sum(), 1e-9))
        spread = float(np.degrees(math.sqrt(max(0.0, -2 * math.log(max(R, 1e-9))))))
    else:
        spread = 0.0
    hs = sorted(i["h"] for i in chrom)
    gaps_h = [(b - a) for a, b in zip(hs, hs[1:])] + ([360 - hs[-1] + hs[0]] if hs else [])
    harmony = ("achromatic" if not chrom else "analogous" if spread < 35 else
               "complementary" if max(gaps_h, default=0) < 200 and spread > 60 and len(hs) <= 4 else "varied")
    Cs = sorted(i["C"] for i in inks)
    top = max(inks, key=lambda i: i["C"])
    widths = np.array([max(i["width_med_pmH"], 0.1) for i in inks])
    shares = np.array([i["share"] for i in inks])
    return {
        "n_inks": len(inks),
        "L_ladder": [round(x, 1) for x in Ls],
        "L_ladder_shares": [round(i["share"], 3) for i in by_L],
        "C_by_L": [round(i["C"], 1) for i in by_L],
        "L_range": round(Ls[-1] - Ls[0], 1),
        "L_gap_mean": round(float(np.mean(gaps)), 1),
        "L_gap_min": round(float(np.min(gaps)), 1),
        "chroma_mean_weighted": round(float((shares * np.array([i["C"] for i in inks])).sum() / max(shares.sum(), 1e-9)), 1),
        "chroma_median_ink": round(float(np.median(Cs)), 1),
        "hue_spread_deg": round(spread, 1),
        "harmony": harmony,
        "accent": {"C": top["C"], "share": top["share"], "ratio_to_median_C": round(top["C"] / max(np.median(Cs), 1), 2)},
        "shape_scale_pmH": round(float(np.exp((shares * np.log(widths)).sum() / max(shares.sum(), 1e-9))), 2),
    }


# ---------------------------------------------------------------- the measurement

def measure(im, height=1600, seed=0, palette_C=None):
    """All stats for one image. Pass palette_C (Lab array) to quantize against a given palette."""
    small = resize_h(im, height)
    rgb = np.asarray(small)
    H, W = rgb.shape[:2]
    lab = srgb_to_lab(rgb)
    labs = gauss(lab, 0.7)                     # tame JPEG/scan noise for clustering
    L = lab[..., 0]
    Lb = gauss(L, 1.0)
    out = {"size": [im.width, im.height], "analysis_size": [W, H], "aspect": round(im.width / im.height, 4)}

    # palette
    if palette_C is None:
        C, share, labels, curve, inks = palette(labs, seed=seed)
        out["palette_curve"] = [[k, round(e, 2)] for k, e in curve]
        out["inks_elbow"] = inks
    else:
        C = np.asarray(palette_C, np.float32)
        labels = assign(labs.reshape(-1, 3), C).reshape(H, W)
        share = np.bincount(labels.ravel(), minlength=len(C)) / labels.size
    rgbC = lab_to_srgb(C)
    Lc, Cc, hc = lch(C)
    quant_err = de2000(labs.reshape(-1, 3), C[labels.ravel()])
    out["quant_de_mean"] = round(float(quant_err.mean()), 2)
    out["quant_de_p90"] = round(float(np.percentile(quant_err, 90)), 2)
    inks = []
    yy, xx = np.mgrid[0:H, 0:W]
    for i in range(len(C)):
        m = labels == i
        sw = stroke_width(m)[m] if m.any() else np.array([0])
        inks.append({
            "hex": hexof(rgbC[i]), "share": round(float(share[i]), 4),
            "L": round(float(Lc[i]), 1), "C": round(float(Cc[i]), 1), "h": round(float(hc[i]), 0),
            "y": round(float(yy[m].mean() / H), 3) if m.any() else None,
            "x": round(float(xx[m].mean() / W), 3) if m.any() else None,
            "y_spread": round(float(yy[m].std() / H), 3) if m.any() else None,
            "width_med_pmH": round(float(np.median(sw)) / H * 1000, 2),
            "width_p10_pmH": round(float(np.percentile(sw, 10)) / H * 1000, 2),
            "width_p90_pmH": round(float(np.percentile(sw, 90)) / H * 1000, 2),
        })
    if inks:
        idx = list(range(len(inks)))
        tag = lambda i, t: inks[i].setdefault("roles", []).append(t)
        tag(min(idx, key=lambda i: inks[i]["L"]), "darkest")
        tag(max(idx, key=lambda i: inks[i]["L"]), "lightest")
        tag(max(idx, key=lambda i: inks[i]["C"]), "most saturated")
        tag(0, "dominant")
    out["palette"] = inks
    out["palette_structure"] = palette_structure(inks)
    out["_C"] = C
    out["_labels"] = labels

    # value structure
    pct = np.percentile(L, [1, 5, 25, 50, 75, 95, 99])
    t1, t2 = otsu2(L)
    t0 = otsu1(L)
    out["value"] = {
        "mean": round(float(L.mean()), 1), "std": round(float(L.std()), 1),
        "p1_5_25_50_75_95_99": [round(float(v), 1) for v in pct],
        "key": "high" if pct[3] > 65 else "low" if pct[3] < 35 else "mid",
        "range_p1_p99": round(float(pct[6] - pct[0]), 1),
        "notan3_thresholds": [t1, t2],
        "notan3_shares_dark_mid_light": [round(float((L <= t1).mean()), 3),
                                         round(float(((L > t1) & (L <= t2)).mean()), 3),
                                         round(float((L > t2).mean()), 3)],
        "notan2_threshold": t0, "notan2_dark_share": round(float((L <= t0).mean()), 3),
        "hist10": [round(float(x), 4) for x in np.histogram(L, bins=10, range=(0, 100))[0] / L.size],
    }
    g3 = []
    for r in range(3):
        row = []
        for c in range(3):
            row.append(round(float(L[r * H // 3:(r + 1) * H // 3, c * W // 3:(c + 1) * W // 3].mean()), 1))
        g3.append(row)
    out["value"]["thirds_grid_meanL"] = g3
    out["_notan"] = (t1, t2, t0)

    # color
    _, Cp, hp = lch(lab)
    chroma_pct = np.percentile(Cp, [50, 90, 99])
    sat = Cp > 8
    hue_hist = np.histogram(hp[sat], bins=12, range=(0, 360), weights=Cp[sat])[0]
    hue_hist = hue_hist / max(hue_hist.sum(), 1e-9)
    warm = ((hp < 110) | (hp >= 330)) & sat
    out["color"] = {
        "chroma_p50_p90_p99": [round(float(v), 1) for v in chroma_pct],
        "saturation_key": "muted" if chroma_pct[1] < 20 else "vivid" if chroma_pct[1] > 50 else "moderate",
        "chromatic_share": round(float(sat.mean()), 3),
        "warm_share_of_chromatic": round(float((Cp * warm).sum() / max((Cp * sat).sum(), 1e-9)), 3),
        "mean_a_b": [round(float(lab[..., 1].mean()), 1), round(float(lab[..., 2].mean()), 1)],
        "hue_hist_30deg": [round(float(x), 3) for x in hue_hist],
    }

    # edges, line, softness
    gy, gx = np.gradient(Lb)
    mag = np.hypot(gx, gy)
    edge = mag > 4.0
    ang = (np.degrees(np.arctan2(gy, gx)) + 90) % 180      # edge direction, 0 = horizontal
    # 8 bins centered on 0°, 22.5°, … so bin 0 = horizontal, bin 4 = vertical
    edges_bins = np.histogram((ang[edge] + 11.25) % 180, bins=8, range=(0, 180), weights=mag[edge])[0]
    edges_bins = edges_bins / max(edges_bins.sum(), 1e-9)
    # Edge blur: a gradient peak falls as 1/sqrt(s² + σ²) when blurred with σ, so the ratio of
    # peaks at two blur scales gives the edge's own blur s (≈0.5 px for an anti-aliased vector
    # edge, larger for soft/painted edges). Only strong, isolated step edges are measured.
    s1, s2 = 0.8, 2.5
    m1 = np.hypot(*np.gradient(gauss(L, s1)))
    m2 = np.hypot(*np.gradient(gauss(L, s2)))
    mx, mn = maxmin(gauss(L, 0.8), 6)
    p1, _ = maxmin(m1, 2)
    p2, _ = maxmin(m2, 2)
    strong = (m1 >= p1 - 1e-6) & ((mx - mn) > 15) & (m1 > 4)
    r = (p1[strong] / np.maximum(p2[strong], 1e-6)) if strong.any() else np.array([1.0])
    r = np.clip(r, 1.0001, None)
    blur = np.sqrt(np.clip((s2 ** 2 - r ** 2 * s1 ** 2) / (r ** 2 - 1), 0, 400))
    out["edges"] = {
        "density": round(float(edge.mean()), 4),
        "strong_edge_px_share": round(float(strong.mean()), 4),
        "orientation_8bins_from_horizontal": [round(float(x), 3) for x in edges_bins],
        "dominant_orientation": ["horizontal", "22°", "45°", "67°", "vertical", "112°", "135°", "157°"][int(edges_bins.argmax())],
        "edge_blur_med_px": round(float(np.median(blur)), 2),
        "edge_blur_med_pmH": round(float(np.median(blur)) / H * 1000, 2),
        "hard_edge_share": round(float((blur < 1.2).mean()), 3),
    }
    out["_mag"] = mag

    # dark line work: darkest ink, thin features
    dark = L <= max(t1, 20)
    swd = stroke_width(dark)
    thin = dark & (swd <= 0.006 * H)
    out["line"] = {
        "dark_share": round(float(dark.mean()), 4),
        "dark_stroke_width_med_pmH": round(float(np.median(swd[dark])) / H * 1000, 2) if dark.any() else 0,
        "thin_dark_share_of_dark": round(float(thin.sum() / max(dark.sum(), 1)), 3),
    }

    # surface: grain and mottle in flat areas
    res = L - gauss(L, 1.5)
    flat = local_std(gauss(L, 1.5), 6) < 1.5
    big = local_std(gauss(L, 2), 12) < 3.0
    mott = gauss(L, 2) - gauss(L, 12)
    out["surface"] = {
        "flat_share": round(float(flat.mean()), 3),
        "grain_std_in_flats": round(float(res[flat].std()), 2) if flat.any() else None,
        "mottle_std_in_flats": round(float(mott[big].std()), 2) if big.any() else None,
        "local_std_p50_p90": [round(float(v), 2) for v in np.percentile(local_std(L, 2), [50, 90])],
    }

    # bands (horizontal and vertical boundaries) and border
    labg = gauss(lab, 2)
    def boundaries(profile, size):
        w = max(3, int(size * 0.015))
        d = np.zeros(size)
        for y in range(w, size - w):
            d[y] = float(de2000(profile[y - w:y].mean(0), profile[y:y + w].mean(0)))
        found = []
        order = np.argsort(-d)
        for y in order:
            if d[y] < 6:
                break
            if all(abs(y - f) > size * 0.03 for f, _ in found):
                found.append((int(y), float(d[y])))
            if len(found) >= 8:
                break
        return sorted(found)
    rowp = labg.mean(1)
    colp = labg.mean(0)
    hb = boundaries(rowp, H)
    vb = boundaries(colp, W)
    out["bands"] = {
        "horizontal": [{"y": round(y / H, 3), "dE": round(dv, 1),
                        "above": hexof(lab_to_srgb(rowp[max(0, y - 8):y].mean(0))),
                        "below": hexof(lab_to_srgb(rowp[y:y + 8].mean(0)))} for y, dv in hb],
        "vertical": [{"x": round(x / W, 3), "dE": round(dv, 1)} for x, dv in vb],
    }
    border = {}
    for side, prof, size in (("top", rowp, H), ("bottom", rowp[::-1], H), ("left", colp, W), ("right", colp[::-1], W)):
        e0 = prof[:max(2, int(size * 0.004))].mean(0)
        width = 0
        for i in range(int(size * 0.08)):
            if float(de2000(prof[i], e0)) > 10:
                width = i
                break
        border[side] = {"width_pm": round(width / size * 1000, 1), "color": hexof(lab_to_srgb(e0))} if width else None
    out["border"] = border
    # detail map and focal point
    rows_n = max(3, round(8 * H / W))
    tiles = np.zeros((rows_n, 8))
    for r in range(rows_n):
        for c in range(8):
            tiles[r, c] = mag[r * H // rows_n:(r + 1) * H // rows_n, c * W // 8:(c + 1) * W // 8].mean()
    tn = tiles / max(tiles.sum(), 1e-9)
    s = np.sort(tn.ravel())
    n = len(s)
    gini = float((2 * np.arange(1, n + 1) - n - 1).dot(s) / (n * s.sum())) if s.sum() > 0 else 0
    cs = np.linalg.norm(gauss(lab, 2) - gauss(lab, max(8, H / 40)), axis=-1)
    dens = gauss(edge.astype(np.float32), H / 80)
    sal = cs / max(np.percentile(cs, 99), 1e-6) * 0.6 + dens / max(np.percentile(dens, 99), 1e-6) * 0.4
    sal_s = gauss(sal, H / 60)
    # ignore the frame: border width + 2 % of the size on every side
    bw = {k: (v["width_pm"] / 1000 if v else 0) + 0.02 for k, v in border.items()}
    sal_s[:int(bw["top"] * H)] = 0; sal_s[H - int(bw["bottom"] * H):] = 0
    sal_s[:, :int(bw["left"] * W)] = 0; sal_s[:, W - int(bw["right"] * W):] = 0
    top = sal_s >= np.percentile(sal_s, 98)
    fy, fx = float(yy[top].mean() / H), float(xx[top].mean() / W)
    peaks = []
    S2 = sal_s.copy()
    for _ in range(3):
        i = int(S2.argmax()); py, px = divmod(i, W)
        peaks.append([round(px / W, 3), round(py / H, 3)])
        rr = int(H * 0.12)
        S2[max(0, py - rr):py + rr, max(0, px - rr):px + rr] = -1
    thirds = [(a, b) for a in (1 / 3, 2 / 3) for b in (1 / 3, 2 / 3)]
    dth = min(math.hypot(fx - a, fy - b) for a, b in thirds)
    wgt = (1 - L / 100) + Cp / 100
    out["composition"] = {
        "detail_grid_rows_x8": [[round(float(v), 4) for v in row] for row in tn],
        "detail_gini": round(gini, 3),
        "focal_xy": [round(fx, 3), round(fy, 3)],
        "salient_peaks_xy": peaks,
        "focal_dist_to_nearest_thirds_pt": round(dth, 3),
        "visual_weight_center_xy": [round(float((wgt * xx).sum() / wgt.sum() / W), 3),
                                    round(float((wgt * yy).sum() / wgt.sum() / H), 3)],
        "lr_weight_ratio": round(float(wgt[:, :W // 2].sum() / max(wgt[:, W // 2:].sum(), 1e-9)), 3),
        "tb_weight_ratio": round(float(wgt[:H // 2].sum() / max(wgt[H // 2:].sum(), 1e-9)), 3),
        "lr_symmetry_corr": round(float(np.corrcoef(L.ravel(), L[:, ::-1].ravel())[0, 1]), 3),
    }
    out["_sal"] = sal_s
    out["_tiles"] = tn

    return out


def public(stats):
    return {k: v for k, v in stats.items() if not k.startswith("_")}


# ---------------------------------------------------------------- pictures

def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def notan_images(im, stats, height=900):
    small = resize_h(im, height)
    L = srgb_to_lab(np.asarray(small))[..., 0]
    t1, t2, t0 = stats["_notan"]
    n2 = np.where(L <= t0, 30, 235).astype(np.uint8)
    n3 = np.where(L <= t1, 30, np.where(L <= t2, 128, 235)).astype(np.uint8)
    C = stats["_C"]
    lab = gauss(srgb_to_lab(np.asarray(small)), 0.7)
    q = lab_to_srgb(C)[assign(lab.reshape(-1, 3), C).reshape(L.shape)]
    return small, Image.fromarray(n2).convert("RGB"), Image.fromarray(n3).convert("RGB"), Image.fromarray(q)


def hstack(images, pad=8, bg=(255, 255, 255)):
    h = max(i.height for i in images)
    w = sum(i.width for i in images) + pad * (len(images) + 1)
    out = Image.new("RGB", (w, h + 2 * pad), bg)
    x = pad
    for i in images:
        out.paste(i, (x, pad))
        x += i.width + pad
    return out


def vstack(images, pad=8, bg=(255, 255, 255)):
    w = max(i.width for i in images)
    h = sum(i.height for i in images) + pad * (len(images) + 1)
    out = Image.new("RGB", (w + 2 * pad, h), bg)
    y = pad
    for i in images:
        out.paste(i, (pad, y))
        y += i.height + pad
    return out


def label(img, text, size=22):
    d = ImageDraw.Draw(img)
    f = font(size)
    bb = d.textbbox((0, 0), text, font=f)
    d.rectangle([0, 0, bb[2] + 16, bb[3] + 12], fill=(255, 255, 255))
    d.text((8, 6), text, fill=(0, 0, 0), font=f)
    return img


def palette_strip(inks, width=1200, height=140, usage=None):
    """Swatches sized by share. usage: optional list of shares to draw underneath as bars."""
    img = Image.new("RGB", (width, height + (40 if usage is not None else 0)), (255, 255, 255))
    d = ImageDraw.Draw(img)
    f = font(16)
    total = sum(i["share"] for i in inks) or 1
    x = 0
    for j, ink in enumerate(inks):
        w = max(54, int(width * ink["share"] / total))
        col = tuple(int(ink["hex"][k:k + 2], 16) for k in (1, 3, 5))
        d.rectangle([x, 0, x + w - 2, height], fill=col)
        tc = (0, 0, 0) if ink["L"] > 55 else (255, 255, 255)
        d.text((x + 6, 6), ink["hex"], fill=tc, font=f)
        d.text((x + 6, 26), f"{ink['share'] * 100:.1f}%", fill=tc, font=f)
        if usage is not None:
            # bar length = render share / reference share, the tick marks equal use (capped at 2x)
            u = usage[j]
            d.rectangle([x, height + 6, x + int((w - 2) * min(2, u / max(ink['share'], 1e-6)) / 2), height + 20], fill=col)
            d.line([x + (w - 2) // 2, height + 3, x + (w - 2) // 2, height + 23], fill=(0, 0, 0), width=2)
            d.text((x + 6, height + 22), f"render {u * 100:.1f}%", fill=(0, 0, 0), font=font(14))
        x += w
        if x >= width:
            break
    return img


def detail_overlay(im, stats, height=900):
    small = resize_h(im, height).convert("RGB")
    W, H = small.size
    base = Image.blend(small, Image.new("RGB", small.size, (0, 0, 0)), 0.45)
    t = stats["_tiles"]
    heat = Image.new("RGBA", small.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(heat)
    mx = t.max() or 1
    for r in range(t.shape[0]):
        for c in range(t.shape[1]):
            a = int(170 * t[r, c] / mx)
            d.rectangle([c * W / 8, r * H / t.shape[0], (c + 1) * W / 8, (r + 1) * H / t.shape[0]], fill=(255, 120, 0, a))
    out = Image.alpha_composite(base.convert("RGBA"), heat)
    d = ImageDraw.Draw(out)
    for k in (1, 2):
        d.line([(W * k / 3, 0), (W * k / 3, H)], fill=(255, 255, 255, 160), width=1)
        d.line([(0, H * k / 3), (W, H * k / 3)], fill=(255, 255, 255, 160), width=1)
    for b in stats["bands"]["horizontal"]:
        y = b["y"] * H
        d.line([(0, y), (W, y)], fill=(0, 220, 255, 220), width=2)
    fx, fy = stats["composition"]["focal_xy"]
    r = 14
    d.ellipse([fx * W - r, fy * H - r, fx * W + r, fy * H + r], outline=(255, 0, 80), width=4)
    for px, py in stats["composition"]["salient_peaks_xy"]:
        d.ellipse([px * W - 6, py * H - 6, px * W + 6, py * H + 6], fill=(255, 0, 80))
    return out.convert("RGB")


def edge_image(stats, height=900):
    mag = stats["_mag"]
    v = np.clip(mag / 12 * 255, 0, 255).astype(np.uint8)
    return resize_h(Image.fromarray(255 - v), height).convert("RGB")


def crops(im, stats, frac=0.1, size=600):
    """Crops covering `frac` of the image height, picked from the analysis maps, resized to `size`."""
    W, H = im.size
    aw, ah = stats["analysis_size"]
    cs = int(frac * H)
    t = stats["_tiles"]
    rows_n = t.shape[0]
    picks = []
    r, c = divmod(int(t.argmax()), 8)
    picks.append(("most-detail", (c + 0.5) / 8, (r + 0.5) / rows_n))
    fx, fy = stats["composition"]["focal_xy"]
    picks.append(("focal", fx, fy))
    # flattest mid-value area (texture / grain study)
    L = srgb_to_lab(np.asarray(resize_h(im, 400)))[..., 0]
    sd = local_std(L, 12) + np.abs(L - 60) * 0.05
    i = int(sd[24:-24, 24:-24].argmin())
    yy, xx = divmod(i, sd.shape[1] - 48)
    picks.append(("flat-texture", (xx + 24) / sd.shape[1], (yy + 24) / sd.shape[0]))
    # darkest-ink strokes
    mag = stats["_mag"]
    dark = gauss((srgb_to_lab(np.asarray(resize_h(im, ah)))[..., 0] < 30).astype(np.float32) * (mag > 4), ah / 40)
    i = int(dark.argmax()); py, px = divmod(i, dark.shape[1])
    picks.append(("dark-strokes", px / dark.shape[1], py / dark.shape[0]))
    out = []
    for name, cx, cy in picks:
        x0 = int(min(max(cx * W - cs / 2, 0), W - cs))
        y0 = int(min(max(cy * H - cs / 2, 0), H - cs))
        crop = im.crop((x0, y0, x0 + cs, y0 + cs)).resize((size, size), Image.LANCZOS)
        out.append((name, crop, [round(x0 / W, 3), round(y0 / H, 3), round(cs / W, 3), round(cs / H, 3)]))
    return out
