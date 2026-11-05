import { dilateMask } from '../../src/imaging/raster';
import type { Point, Quad, RgbaImage } from '../../src/imaging/types';
import { applyHomography, computeHomography, rectQuad } from '../../src/imaging/geometry';

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FlatPage {
  width: number;
  height: number;
  /** float RGB, 3 values per pixel, 0…1 */
  rgb: Float32Array;
  ink: Uint8Array;
  /** 1 = red stamp ring, 2 = blue logo, 3 = stamp interior */
  color: Uint8Array;
}

export const PAPER: [number, number, number] = [0.98, 0.976, 0.965];
export const INK: [number, number, number] = [0.12, 0.12, 0.13];
export const STAMP: [number, number, number] = [0.78, 0.12, 0.16];
export const LOGO: [number, number, number] = [0.08, 0.31, 0.78];

/** Paints a filled rectangle (page px) onto a flat page, e.g. a coloured header bar or a printed frame line. */
export function paintRect(page: FlatPage, x0: number, y0: number, w: number, h: number, color: [number, number, number]): void {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(page.height, Math.round(y0 + h)); y++)
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(page.width, Math.round(x0 + w)); x++) {
      const i = y * page.width + x;
      page.rgb.set(color, i * 3);
      page.ink[i] = 1;
    }
}

/** Flat "invoice" page: text bars, heading, red stamp ring, blue logo. */
export function makeFlatPage(width: number, height: number, seed = 1): FlatPage {
  const r = rng(seed);
  const n = width * height;
  const rgb = new Float32Array(n * 3);
  const ink = new Uint8Array(n);
  const color = new Uint8Array(n);
  for (let i = 0; i < n; i++) rgb.set(PAPER, i * 3);
  const s = width / 1240; // geometry designed at 150 dpi A4
  const fillRect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = y * width + x;
        rgb.set(INK, i * 3);
        ink[i] = 1;
      }
  };
  fillRect(110 * s, 120 * s, 560 * s, 46 * s); // heading
  for (let y = 260 * s; y < height - 300 * s; y += (r() > 0.1 ? 44 : 90) * s) {
    let x = 110 * s;
    while (x < width - 220 * s) {
      const w = (40 + r() * 110) * s;
      // "words": strokes of 3 px with gaps to look like glyphs
      for (let gx = 0; gx < w; gx += 7 * s) fillRect(x + gx, y, 3.5 * s, 22 * s);
      fillRect(x, y + 9 * s, w, 3.5 * s);
      x += w + 18 * s;
    }
  }
  const ring = (cx: number, cy: number, rad: number, thick: number) => {
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = y * width + x;
        if (d <= rad && d >= rad - thick) {
          rgb.set(STAMP, i * 3);
          color[i] = 1;
        } else if (d < rad - thick) color[i] = 3;
      }
  };
  ring(930 * s, 1450 * s, 120 * s, 14 * s);
  for (let y = Math.floor(90 * s); y < 220 * s; y++)
    for (let x = Math.floor(1000 * s); x < 1130 * s; x++) {
      if (Math.hypot(x - 1065 * s, y - 155 * s) <= 65 * s) {
        const i = y * width + x;
        rgb.set(LOGO, i * 3);
        color[i] = 2;
      }
    }
  return { width, height, rgb, ink, color };
}

export interface PhotoOptions {
  frameWidth: number;
  frameHeight: number;
  /** page corners in frame pixels TL,TR,BR,BL */
  corners: Quad;
  background: 'dark' | 'light' | 'wood';
  /** multiplicative lighting gradient strength 0…1 */
  gradient?: number;
  /** soft shadow over the lower-right part 0…1 */
  shadow?: number;
  noise?: number;
  seed?: number;
  /** extra bright distractor rectangle (sticky note) */
  distractor?: { x: number; y: number; w: number; h: number };
  /** object below the page (binder, sleeve, next sheet of a stack): convex quad in frame px + colour */
  underlay?: { corners: Quad; color: [number, number, number] };
}

function insideConvex(q: Quad, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const z = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const s = z > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Projects the flat page into a camera frame with lighting, shadow and noise (2×2 supersampled). */
export function photograph(page: FlatPage, o: PhotoOptions): RgbaImage {
  const { frameWidth: W, frameHeight: H } = o;
  const Hinv = computeHomography(o.corners, rectQuad(page.width, page.height));
  if (!Hinv) throw new Error('bad corners');
  const r = rng(o.seed ?? 7);
  const data = new Uint8Array(W * H * 4);
  const bgColor = (x: number, y: number): [number, number, number] => {
    if (o.distractor) {
      const d = o.distractor;
      if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return [0.95, 0.92, 0.55];
    }
    if (o.underlay && insideConvex(o.underlay.corners, x, y)) return o.underlay.color;
    if (o.background === 'dark') return [0.16, 0.15, 0.15];
    if (o.background === 'light') return [0.74, 0.73, 0.71];
    const g = 0.5 + 0.5 * Math.sin(x / 9 + 3 * Math.sin(y / 140));
    return [0.3 + 0.08 * g, 0.2 + 0.05 * g, 0.12 + 0.03 * g];
  };
  const sample = (fx: number, fy: number): [number, number, number] | null => {
    if (fx < 0 || fy < 0 || fx >= page.width - 1 || fy >= page.height - 1) return null;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const ax = fx - x0;
    const ay = fy - y0;
    const out: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const i00 = (y0 * page.width + x0) * 3 + c;
      const i10 = i00 + 3;
      const i01 = i00 + page.width * 3;
      const i11 = i01 + 3;
      out[c] =
        page.rgb[i00] * (1 - ax) * (1 - ay) + page.rgb[i10] * ax * (1 - ay) + page.rgb[i01] * (1 - ax) * ay + page.rgb[i11] * ax * ay;
    }
    return out;
  };
  const gradient = o.gradient ?? 0.35;
  const shadow = o.shadow ?? 0;
  const noise = o.noise ?? 0.015;
  const subs: Point[] = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const acc = [0, 0, 0];
      for (const sp of subs) {
        const px = x + sp.x;
        const py = y + sp.y;
        const f = applyHomography(Hinv, { x: px, y: py });
        const c = sample(f.x, f.y) ?? bgColor(px, py);
        acc[0] += c[0] / 4;
        acc[1] += c[1] / 4;
        acc[2] += c[2] / 4;
      }
      const light = 0.97 - gradient * (x / W) * (y / H);
      const t = Math.min(1, Math.max(0, (x / W + y / H - 1.15) / 0.25));
      const sh = 1 - shadow * t * t * (3 - 2 * t);
      const cast = [1.0, 0.95, 0.85];
      const j = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const nz = noise * gauss(r);
        data[j + c] = Math.max(0, Math.min(255, Math.round((acc[c] * light * sh * cast[c] + nz) * 255)));
      }
      data[j + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

function gauss(r: () => number) {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Box downscale by an integer factor (for detection-size inputs). */
export function boxDownscale(img: RgbaImage, f: number): RgbaImage {
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += img.data[((y * f + dy) * img.width + x * f + dx) * 4 + c];
        out[(y * w + x) * 4 + c] = Math.round(s / (f * f));
      }
  return { width: w, height: h, data: out };
}

export function cornerError(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}

/** Metrics on an RGBA output that is aligned with a FlatPage of the same size. */
export function pageMetrics(out: RgbaImage, page: FlatPage) {
  const { width: w, height: h } = out;
  const n = w * h;
  const lum = (i: number) => 0.2126 * out.data[i * 4] + 0.7152 * out.data[i * 4 + 1] + 0.0722 * out.data[i * 4 + 2];
  const sx = page.width / w;
  const sy = page.height / h;
  // flat-page masks resampled to the output grid
  const ink = new Uint8Array(n);
  const notInk = new Uint8Array(n);
  const anyColor = new Uint8Array(n);
  const col = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fi = Math.min(page.height - 1, Math.floor(y * sy)) * page.width + Math.min(page.width - 1, Math.floor(x * sx));
      const i = y * w + x;
      ink[i] = page.ink[fi] ? 1 : 0;
      notInk[i] = page.ink[fi] ? 0 : 1;
      anyColor[i] = page.color[fi] > 0 ? 1 : 0;
      col[i] = page.color[fi];
    }
  const nearNotInk = dilateMask(notInk, w, h, 2);
  const nearInk = dilateMask(ink, w, h, 8);
  const nearColor = dilateMask(anyColor, w, h, 12);
  const isStamp = new Uint8Array(n);
  const notStamp = new Uint8Array(n);
  const isLogo = new Uint8Array(n);
  const notLogo = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    isStamp[i] = col[i] === 1 ? 1 : 0;
    notStamp[i] = col[i] === 1 ? 0 : 1;
    isLogo[i] = col[i] === 2 ? 1 : 0;
    notLogo[i] = col[i] === 2 ? 0 : 1;
  }
  const nearNotStamp = dilateMask(notStamp, w, h, 2);
  const nearNotLogo = dilateMask(notLogo, w, h, 2);

  const cells = Array.from({ length: 16 }, () => ({ s: 0, n: 0 }));
  let paperSum = 0, paperN = 0, inkSum = 0, inkN = 0;
  const stampSat: number[] = [];
  const logoSat: number[] = [];
  const stampHueOk: number[] = [];
  const marginX = Math.round(0.03 * w);
  const marginY = Math.round(0.03 * h);
  for (let y = marginY; y < h - marginY; y += 2) {
    for (let x = marginX; x < w - marginX; x += 2) {
      const i = y * w + x;
      const L = lum(i);
      if (ink[i] && !nearNotInk[i]) {
        inkSum += L;
        inkN++;
      } else if (!ink[i] && !anyColor[i] && !nearInk[i] && !nearColor[i]) {
        paperSum += L;
        paperN++;
        const c = cells[Math.min(3, Math.floor((y / h) * 4)) * 4 + Math.min(3, Math.floor((x / w) * 4))];
        c.s += L;
        c.n++;
      } else if ((isStamp[i] && !nearNotStamp[i]) || (isLogo[i] && !nearNotLogo[i])) {
        const rr = out.data[i * 4], gg = out.data[i * 4 + 1], bb = out.data[i * 4 + 2];
        const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
        const sat = mx > 0 ? (mx - mn) / mx : 0;
        if (isStamp[i]) {
          stampSat.push(sat);
          stampHueOk.push(rr > gg * 1.8 && rr > bb * 1.8 ? 1 : 0);
        } else logoSat.push(bb > rr * 1.8 && bb > gg * 1.3 ? sat : 0);
      }
    }
  }
  const cellMeans = cells.filter((c) => c.n > 200).map((c) => c.s / c.n);
  const band = Math.max(2, Math.round(0.006 * Math.max(w, h)));
  const border: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x < band || y < band || x >= w - band || y >= h - band) border.push(lum(y * w + x));
  border.sort((a, b) => a - b);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  return {
    paperMean: paperSum / paperN,
    paperGradient: Math.max(...cellMeans) - Math.min(...cellMeans),
    textMean: inkSum / inkN,
    borderP1: border[Math.floor(border.length * 0.01)],
    stampSat: mean(stampSat),
    stampRedFraction: mean(stampHueOk),
    logoSat: mean(logoSat),
  };
}
