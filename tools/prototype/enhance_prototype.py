"""
ScanFlow enhancement prototype (numpy / OpenCV).

Generates synthetic "phone photos" of documents (perspective, uneven light,
soft shadow, colour cast, noise, defocus, JPEG) with known ground truth,
runs the exact algorithm that is ported to SkSL/TypeScript in
src/imaging/{background,filters,shaders,renderer}.ts and reports the acceptance
metrics from docs/ARCHITECTURE.md.

Run:  python tools/prototype/enhance_prototype.py [--out OUTDIR] [--sweep]
Needs: numpy, opencv-python(-headless), Pillow. Not part of the app bundle.
"""
import argparse, json, math, os, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

RNG = np.random.default_rng(42)
FONT_DIRS = ["/usr/share/fonts/liberation-sans", "C:/Windows/Fonts"]


def font(size, bold=False):
    names = ["LiberationSans-Bold.ttf", "arialbd.ttf"] if bold else ["LiberationSans-Regular.ttf", "arial.ttf"]
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ----------------------------------------------------------------------------
# 1. Synthetic flat document (ground truth) at 150 DPI A4
# ----------------------------------------------------------------------------
def make_flat_document(w=1240, h=1754):
    img = Image.new("RGB", (w, h), (250, 249, 246))  # real paper is not 255
    d = ImageDraw.Draw(img)
    ink = Image.new("L", (w, h), 0)  # mask of dark text ink
    di = ImageDraw.Draw(ink)
    words = ("Rechnung Betrag Datum Kunde Position Menge Preis Summe Steuer Zahlung "
             "invoice amount total payment account reference document scanner").split()
    f_h, f_b = font(56, True), font(26)
    d.text((110, 120), "RECHNUNG 2026-0815", fill=(20, 20, 24), font=f_h)
    di.text((110, 120), "RECHNUNG 2026-0815", fill=255, font=f_h)
    y = 260
    while y < h - 260:
        x = 110
        line = []
        while True:
            wd = words[RNG.integers(len(words))]
            tw = d.textlength(wd + " ", font=f_b)
            if x + tw > w - 110:
                break
            line.append((x, wd)); x += tw
        for (lx, wd) in line:
            d.text((lx, y), wd, fill=(30, 30, 34), font=f_b)
            di.text((lx, y), wd, fill=255, font=f_b)
        y += 44 if RNG.random() > 0.1 else 90
    # red stamp (ring + text) and blue logo + small colour photo
    cx, cy, r = 930, 1450, 120
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(200, 30, 40), width=14)
    d.text((cx - 80, cy - 20), "BEZAHLT", fill=(200, 30, 40), font=font(40, True))
    d.ellipse((1000, 90, 1130, 220), fill=(20, 80, 200))
    photo = np.zeros((180, 260, 3), np.uint8)
    for i in range(180):
        photo[i, :, :] = (40 + i // 2, 120, 200 - i // 2)
    img.paste(Image.fromarray(photo), (120, 1430))
    color_mask = np.zeros((h, w), np.uint8)
    cv2.circle(color_mask, (cx, cy), r, 1, 14)
    cv2.circle(color_mask, (cx, cy), r - 8, 3, -1)  # stamp interior (text) - excluded from paper
    cv2.circle(color_mask, (1065, 155), 55, 2, -1)
    return np.asarray(img).astype(np.float32) / 255.0, (np.asarray(ink) > 128), color_mask


# ----------------------------------------------------------------------------
# 2. "Photograph" it: perspective, lighting, shadow, cast, noise, blur, JPEG
# ----------------------------------------------------------------------------
def photograph(flat, scenario="shadow", frame=(1500, 2000)):
    fh, fw = flat.shape[:2]
    W, H = frame
    corners = {
        "shadow": [(260, 230), (1270, 300), (1340, 1760), (170, 1690)],
        "strong": [(380, 180), (1150, 260), (1410, 1850), (90, 1720)],
        "flat":   [(200, 200), (1300, 200), (1300, 1760), (200, 1760)],
    }[scenario]
    src = np.float32([(0, 0), (fw, 0), (fw, fh), (0, fh)])
    M = cv2.getPerspectiveTransform(src, np.float32(corners))
    # textured dark wooden table
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    grain = 0.5 + 0.5 * np.sin(xx / 9.0 + 3 * np.sin(yy / 140.0))
    table = np.stack([0.30 + 0.08 * grain, 0.20 + 0.05 * grain, 0.12 + 0.03 * grain], -1)
    page = cv2.warpPerspective(flat, M, (W, H), flags=cv2.INTER_AREA)
    alpha = cv2.warpPerspective(np.ones((fh, fw), np.float32), M, (W, H), flags=cv2.INTER_LINEAR)[..., None]
    img = page * alpha + table * (1 - alpha)
    # illumination: linear gradient + vignette + warm cast
    light = 0.95 - 0.35 * (xx / W) * (yy / H) - 0.10 * (((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2) * 4
    cast = np.float32([1.0, 0.94, 0.82])
    img = img * light[..., None] * cast
    if scenario in ("shadow", "strong"):
        sh = np.zeros((H, W), np.float32)
        cv2.fillPoly(sh, [np.int32([(W * 0.55, H), (W * 0.8, H * 0.55), (W, H * 0.6), (W, H)])], 1.0)
        sh = cv2.GaussianBlur(sh, (0, 0), 60)
        img = img * (1 - 0.45 * sh[..., None])
    img = cv2.GaussianBlur(img, (0, 0), 1.1)
    img = img + RNG.normal(0, 0.018, img.shape).astype(np.float32)
    img = np.clip(img, 0, 1)
    ok, enc = cv2.imencode(".jpg", (img[..., ::-1] * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 88])
    img = cv2.imdecode(enc, cv2.IMREAD_COLOR)[..., ::-1].astype(np.float32) / 255.0
    return img, corners


# ----------------------------------------------------------------------------
# 3. Algorithm (mirrors src/imaging)
# ----------------------------------------------------------------------------
FILTERS = {
    # name: normalize, black, white, gamma, saturation, sharpen, mode(0 colour,1 gray,2 bw), thr, soft
    "original":      dict(normalize=0.0, black=0.0,  white=1.0,  gamma=1.0, sat=1.0, sharpen=0.0, mode=0, clean=0),
    "auto":          dict(normalize=1.0, black=0.20, white=0.90, gamma=1.15, sat=1.10, sharpen=0.6, mode=0, clean=1),
    "magicColor":    dict(normalize=1.0, black=0.24, white=0.88, gamma=1.05, sat=1.55, sharpen=0.7, mode=0, clean=1),
    "removeShadows": dict(normalize=1.0, black=0.05, white=0.93, gamma=1.0, sat=1.0, sharpen=0.3, mode=0, clean=1),
    "lighten":       dict(normalize=1.0, black=0.0,  white=0.95, gamma=0.70, sat=1.0, sharpen=0.2, mode=0, clean=1),
    "grayscale":     dict(normalize=1.0, black=0.22, white=0.88, gamma=1.25, sat=0.0, sharpen=0.7, mode=1, clean=1),
    "blackAndWhite": dict(normalize=1.0, black=0.0,  white=1.0,  gamma=1.0, sat=0.0, sharpen=1.0, mode=2, clean=1, thr=0.72, soft=0.10),
}
BG_LONG_SIDE = 128
LUMA = np.float32([0.2126, 0.7152, 0.0722])


def lum(x):
    return x @ LUMA


def max_filter(x, r):
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(x, k, borderType=cv2.BORDER_REPLICATE)


def min_filter(x, r):
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * r + 1, 2 * r + 1))
    return cv2.erode(x, k, borderType=cv2.BORDER_REPLICATE)


def box(x, r):
    return cv2.blur(x, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REPLICATE)


def estimate_background(small, p):
    """small: HxWx3 float. Returns (bg HxWx3, border_mask HxW). Mirrors background.ts"""
    # morphological closing: dilate removes ink, erode removes the bright-side bias
    D = np.stack([min_filter(max_filter(small[..., c], p["dilate"]), p["dilate"]) for c in range(3)], -1)
    L = lum(D)
    M = max_filter(L, p["paperWindow"])
    mx, mn = D.max(-1), D.min(-1)
    chroma = (mx - mn) / np.maximum(mx, 1e-3)
    # paper = bright relative to local paper level, OR moderately dark but neutral (= shadowed paper)
    mask = ((L >= p["paperRatio"] * M) | ((L >= p["shadowRatio"] * M) & (chroma < p["neutralChroma"]))).astype(np.float32)
    B = D * mask[..., None]
    filled = mask.copy()
    out = B.copy()
    for r in (2, 4, 8, 16, 32, 64):
        if filled.min() > 0:
            break
        num = np.stack([box(B[..., c], r) for c in range(3)], -1)
        den = box(mask, r)
        take = (filled == 0) & (den > 0.02)
        out[take] = num[take] / den[take][:, None]
        filled[take] = 1
    if filled.min() == 0:
        med = np.median(D[mask > 0], axis=0) if mask.sum() else np.ones(3)
        out[filled == 0] = med
    for _ in range(p["smoothPasses"]):
        out = np.stack([box(out[..., c], 1) for c in range(3)], -1)
    out = np.maximum(out, 0.04)
    # border mask: dark relative to paper and connected to the image border, limited to a band
    ratio = lum(small) / lum(out)
    cand = ratio < p["borderRatio"]
    h, w = cand.shape
    band = max(2, int(round(p["borderBand"] * max(h, w))))
    yy, xx = np.mgrid[0:h, 0:w]
    inband = (np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) < band)
    cand &= inband
    mask_b = np.zeros((h, w), np.uint8)
    stack = [(y, x) for y in range(h) for x in (0, w - 1) if cand[y, x]] + \
            [(y, x) for x in range(w) for y in (0, h - 1) if cand[y, x]]
    while stack:
        y, x = stack.pop()
        if mask_b[y, x] or not cand[y, x]:
            continue
        mask_b[y, x] = 1
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not mask_b[ny, nx] and cand[ny, nx]:
                stack.append((ny, nx))
    mb = max_filter(mask_b.astype(np.float32), 1)
    mb = box(mb, 1)
    return out, mb


BG_PARAMS = dict(dilate=2, paperWindow=8, paperRatio=0.72, shadowRatio=0.50, neutralChroma=0.28, smoothPasses=2, borderRatio=0.62, borderBand=0.08)


def bilinear_up(img, W, H):
    # sample small image at pixel centres of the big one (like a Skia linear image shader)
    return cv2.resize(img, (W, H), interpolation=cv2.INTER_LINEAR)


def enhance(warped, bg_small, mask_small, f, adj=None, dpi=150):
    adj = adj or dict(brightness=0.0, contrast=0.0, sharpness=None, denoise=False)
    H, W = warped.shape[:2]
    bg = bilinear_up(bg_small, W, H)
    mk = bilinear_up(mask_small, W, H)
    tap = max(0.75, dpi / 300.0)
    # 3x3 gaussian with tap distance (integer tap ok for prototype)
    k = np.float32([[1, 2, 1], [2, 4, 2], [1, 2, 1]]) / 16
    t = int(round(tap))
    kern = np.zeros((2 * t + 1, 2 * t + 1), np.float32)
    for i in range(3):
        for j in range(3):
            kern[i * t, j * t] = k[i, j]
    blur = cv2.filter2D(warped, -1, kern, borderType=cv2.BORDER_REPLICATE)
    c = warped
    if adj.get("denoise"):
        dl = np.abs(lum(c) - lum(blur))
        wgt = 1 - np.clip((dl - 0.02) / 0.06, 0, 1)
        wgt = wgt * wgt * (3 - 2 * wgt)
        c = c + (blur - c) * wgt[..., None]
    nz = f["normalize"]
    n = c * (1 - nz) + (c / bg) * nz
    nb = blur * (1 - nz) + (blur / bg) * nz
    amount = f["sharpen"] if adj.get("sharpness") is None else adj["sharpness"] * 2 * max(f["sharpen"], 0.35)
    n = n + amount * (n - nb)
    if f["mode"] >= 1:
        n = np.repeat(lum(n)[..., None], 3, -1)
    n = np.clip((n - f["black"]) / (f["white"] - f["black"]), 0, 1) ** f["gamma"]
    if f["mode"] == 0:
        l = lum(n)[..., None]
        n = l + (n - l) * f["sat"]
    if f["mode"] == 2:
        e0, e1 = f["thr"] - f["soft"], f["thr"] + f["soft"]
        v = np.clip((n[..., 0] - e0) / (e1 - e0), 0, 1)
        n = np.repeat((v * v * (3 - 2 * v))[..., None], 3, -1)
    cf = 1 + adj.get("contrast", 0) * 0.6
    n = (n - 0.5) * cf + 0.5 + adj.get("brightness", 0) * 0.25
    if f["clean"]:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        edge = np.minimum(np.minimum(xx + 0.5, W - xx - 0.5), np.minimum(yy + 0.5, H - yy - 0.5))
        band = 0.01 * max(W, H)
        eg = 1 - np.clip(edge / band, 0, 1)  # 1 at the very edge
        eg = (eg > 0).astype(np.float32) * 1.0 * (edge < band)
        m = np.maximum(mk, eg)
        n = n + (1 - n) * m[..., None]
    return np.clip(n, 0, 1)


def warp(photo, corners, W, H):
    dst = np.float32([(0, 0), (W, 0), (W, H), (0, H)])
    M = cv2.getPerspectiveTransform(np.float32(corners), dst)
    return cv2.warpPerspective(photo, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(1, 1, 1))


def run_pipeline(photo, corners, W, H, filt, dpi=150, corner_error=0.0):
    c = np.float32(corners)
    if corner_error:
        # move corners slightly OUTWARD to simulate detection error -> tests dark borders
        ctr = c.mean(0)
        c = ctr + (c - ctr) * (1 + corner_error)
    warped = warp(photo, c, W, H)
    s = BG_LONG_SIDE / max(W, H)
    small = cv2.resize(warped, (max(1, round(W * s)), max(1, round(H * s))), interpolation=cv2.INTER_AREA)
    bg, mk = estimate_background(small, BG_PARAMS)
    return enhance(warped, bg, mk, FILTERS[filt], dpi=dpi)


# ----------------------------------------------------------------------------
# 4. Metrics
# ----------------------------------------------------------------------------
def metrics(out, ink, color_mask):
    H, W = out.shape[:2]
    g = lum(out) * 255
    ink_core = cv2.erode(ink.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    near_ink = cv2.dilate(ink.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    paper = ~near_ink & (color_mask == 0)
    paper &= cv2.dilate((color_mask > 0).astype(np.uint8), np.ones((25, 25), np.uint8)) == 0
    paper[: int(0.03 * H)] = paper[-int(0.03 * H):] = False
    paper[:, : int(0.03 * W)] = paper[:, -int(0.03 * W):] = False
    paper[1400:1640, 100:400] = False  # photo block
    cells = []
    for i in range(4):
        for j in range(4):
            cell = paper[i * H // 4:(i + 1) * H // 4, j * W // 4:(j + 1) * W // 4]
            gv = g[i * H // 4:(i + 1) * H // 4, j * W // 4:(j + 1) * W // 4][cell]
            if gv.size > 500:
                cells.append(gv.mean())
    band = max(2, int(0.006 * max(W, H)))
    border = np.concatenate([g[:band].ravel(), g[-band:].ravel(), g[:, :band].ravel(), g[:, -band:].ravel()])
    hsv = cv2.cvtColor((out * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    stamp = color_mask == 1
    logo = color_mask == 2
    return dict(
        paper_mean=float(g[paper].mean()),
        paper_p5=float(np.percentile(g[paper], 5)),
        paper_gradient=float(max(cells) - min(cells)),
        text_mean=float(g[ink_core].mean()),
        border_min_p1=float(np.percentile(border, 1)),
        stamp_sat=float(hsv[..., 1][stamp].mean()),
        stamp_hue=float(np.median(hsv[..., 0][stamp])),
        logo_sat=float(hsv[..., 1][logo].mean()),
        logo_hue=float(np.median(hsv[..., 0][logo])),
    )


def jpeg_kb(out, q):
    ok, enc = cv2.imencode(".jpg", (out[..., ::-1] * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, q])
    return len(enc) / 1024


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    flat, ink, cmask = make_flat_document()
    H, W = flat.shape[:2]
    report = {"reference_flat": metrics(flat, ink, cmask)}
    for scen in ("shadow", "strong", "flat"):
        photo, corners = photograph(flat, scen)
        report[scen] = {}
        for filt in FILTERS:
            out = run_pipeline(photo, corners, W, H, filt)
            report[scen][filt] = metrics(out, ink, cmask)
            if args.out and scen == "shadow":
                os.makedirs(args.out, exist_ok=True)
                cv2.imwrite(os.path.join(args.out, f"{scen}_{filt}.jpg"), (out[..., ::-1] * 255).astype(np.uint8))
        if args.out:
            cv2.imwrite(os.path.join(args.out, f"{scen}_photo.jpg"), (photo[..., ::-1] * 255).astype(np.uint8))
        # corners 1.5 % too large (detection error) -> border check
        out = run_pipeline(photo, corners, W, H, "auto", corner_error=0.015)
        report[scen]["auto_corner_error_1.5pct"] = metrics(out, ink, cmask)
    # file sizes for one Auto page at 150/200/300 dpi and three quality presets
    photo, corners = photograph(flat, "shadow", frame=(3000, 4000))
    corners = [(x * 2, y * 2) for (x, y) in corners]
    sizes = {}
    for dpi in (150, 200, 300):
        w, h = round(595.28 / 72 * dpi), round(841.89 / 72 * dpi)
        out = run_pipeline(photo, corners, w, h, "auto", dpi=dpi)
        sizes[dpi] = {q: round(jpeg_kb(out, q)) for q in (55, 75, 90)}
        outbw = run_pipeline(photo, corners, w, h, "blackAndWhite", dpi=dpi)
        sizes[f"{dpi}_bw"] = {q: round(jpeg_kb(outbw, q)) for q in (55, 75, 90)}
    report["jpeg_kb_per_page"] = sizes
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
