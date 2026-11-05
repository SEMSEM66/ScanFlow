import type { RgbaImage } from './types';
import { boxBlur, floodFromBorder, rankFilter } from './raster';

/**
 * Paper background ("illumination") estimation on a small (≈128 px) copy of
 * the de-warped page. Port of tools/prototype/enhance_prototype.py
 * (estimate_background) – keep both in sync.
 *
 *  1. Per-channel morphological closing (dilate → erode, radius 2): removes
 *     dark ink/strokes but keeps smooth gradients unbiased.
 *  2. Paper mask: bright relative to the local paper level (max over a
 *     17×17 window), OR moderately dark but neutral (= shadowed paper).
 *     Large coloured / dark areas (logos, photos, stamps) are excluded …
 *  3. … and filled by normalized convolution from surrounding paper with
 *     growing radii, then lightly smoothed.
 *  4. Border mask: pixels much darker than the paper estimate that are
 *     connected to the image border within an 8 % band (table / background
 *     that survived the warp). The shader paints them white.
 */

export const BG_LONG_SIDE = 128;

export const BG_PARAMS = {
  closeRadius: 2,
  paperWindow: 8,
  paperRatio: 0.72,
  shadowRatio: 0.5,
  neutralChroma: 0.28,
  fillRadii: [2, 4, 8, 16, 32, 64],
  smoothPasses: 2,
  minBackground: 0.04,
  borderRatio: 0.62,
  borderBand: 0.08,
} as const;

export interface BackgroundResult {
  width: number;
  height: number;
  /** RGBA8 paper colour estimate (alpha = 255). */
  background: Uint8Array;
  /** RGBA8 border mask in R=G=B (255 = paint white), alpha = 255. */
  borderMask: Uint8Array;
}

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

export function estimateBackground(small: RgbaImage, p = BG_PARAMS): BackgroundResult {
  const { width: w, height: h, data } = small;
  const n = w * h;
  const ch: Float32Array[] = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    ch[0][i] = data[j] / 255;
    ch[1][i] = data[j + 1] / 255;
    ch[2][i] = data[j + 2] / 255;
  }
  // 1. closing
  const D = ch.map((c) => rankFilter(rankFilter(c, w, h, p.closeRadius, 'max'), w, h, p.closeRadius, 'min'));
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = LR * D[0][i] + LG * D[1][i] + LB * D[2][i];
  // 2. paper mask
  const M = rankFilter(L, w, h, p.paperWindow, 'max');
  const mask = new Float32Array(n);
  let maskCount = 0;
  for (let i = 0; i < n; i++) {
    const mx = Math.max(D[0][i], D[1][i], D[2][i]);
    const mn = Math.min(D[0][i], D[1][i], D[2][i]);
    const chroma = (mx - mn) / Math.max(mx, 1e-3);
    const isPaper = L[i] >= p.paperRatio * M[i] || (L[i] >= p.shadowRatio * M[i] && chroma < p.neutralChroma);
    mask[i] = isPaper ? 1 : 0;
    maskCount += mask[i];
  }
  // 3. fill non-paper by normalized convolution
  const B = D.map((c) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = c[i] * mask[i];
    return out;
  });
  const out = B.map((c) => c.slice());
  const filled = mask.slice();
  let remaining = n - maskCount;
  for (const r of p.fillRadii) {
    if (remaining <= 0) break;
    const den = boxBlur(mask, w, h, r);
    const num = B.map((c) => boxBlur(c, w, h, r));
    for (let i = 0; i < n; i++) {
      if (filled[i] === 0 && den[i] > 0.02) {
        out[0][i] = num[0][i] / den[i];
        out[1][i] = num[1][i] / den[i];
        out[2][i] = num[2][i] / den[i];
        filled[i] = 1;
        remaining--;
      }
    }
  }
  if (remaining > 0) {
    const med = medianOfMasked(D, mask, maskCount);
    for (let i = 0; i < n; i++) {
      if (filled[i] === 0) {
        out[0][i] = med[0];
        out[1][i] = med[1];
        out[2][i] = med[2];
      }
    }
  }
  let bg: Float32Array[] = out;
  for (let k = 0; k < p.smoothPasses; k++) bg = bg.map((c) => boxBlur(c, w, h, 1));

  // 4. border mask
  const band = Math.max(2, Math.round(p.borderBand * Math.max(w, h)));
  const cand = new Uint8Array(n);
  const limit = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y);
      limit[i] = edgeDist < band ? 1 : 0;
      const ls = LR * ch[0][i] + LG * ch[1][i] + LB * ch[2][i];
      const lb = Math.max(p.minBackground, LR * bg[0][i] + LG * bg[1][i] + LB * bg[2][i]);
      cand[i] = ls / lb < p.borderRatio ? 1 : 0;
    }
  }
  const reached = floodFromBorder(cand, w, h, limit);
  const mf = new Float32Array(n);
  for (let i = 0; i < n; i++) mf[i] = reached[i];
  const maskSoft = boxBlur(rankFilter(mf, w, h, 1, 'max'), w, h, 1);

  const background = new Uint8Array(n * 4);
  const borderMask = new Uint8Array(n * 4);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    background[j] = toByte(Math.max(p.minBackground, bg[0][i]));
    background[j + 1] = toByte(Math.max(p.minBackground, bg[1][i]));
    background[j + 2] = toByte(Math.max(p.minBackground, bg[2][i]));
    background[j + 3] = 255;
    const m = toByte(maskSoft[i]);
    borderMask[j] = m;
    borderMask[j + 1] = m;
    borderMask[j + 2] = m;
    borderMask[j + 3] = 255;
  }
  return { width: w, height: h, background, borderMask };
}

function medianOfMasked(D: Float32Array[], mask: Float32Array, count: number): [number, number, number] {
  if (count === 0) return [1, 1, 1];
  const res: number[] = [];
  for (const c of D) {
    const vals: number[] = [];
    for (let i = 0; i < c.length; i++) if (mask[i]) vals.push(c[i]);
    vals.sort((a, b) => a - b);
    res.push(vals[Math.floor(vals.length / 2)]);
  }
  return [res[0], res[1], res[2]];
}

function toByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** Small-image size for a page of outW×outH. */
export function backgroundSize(outW: number, outH: number, longSide = BG_LONG_SIDE): { width: number; height: number } {
  const s = longSide / Math.max(outW, outH);
  return { width: Math.max(4, Math.round(outW * s)), height: Math.max(4, Math.round(outH * s)) };
}
