import type { Point, Quad, RgbaImage } from './types';
import { insetQuad, orderQuad } from './geometry';

/**
 * Document corner detection (pure TypeScript, designed for Hermes / Expo Go).
 *
 * Input: a downscaled RGBA copy of the photo (the pipeline passes ≤ 400 px long
 * side; much larger inputs are box-downscaled internally by an integer factor).
 *
 *  1. Luminance + chroma planes, Gaussian blur, Sobel gradients (per pixel the
 *     stronger of both channels → paper on a light wooden table still has an
 *     edge), non-maximum suppression.
 *  2. Orientation-restricted Hough transform: every edge pixel only votes for
 *     lines perpendicular to its own gradient (±4°) – long straight edges win,
 *     wood grain / noise do not.
 *  3. Peak lines are refined by a total-least-squares fit and get a support
 *     profile (where along the line an edge with matching orientation exists).
 *     The image borders are added as "virtual" lines so a page that is cut off
 *     by the frame can still be found.
 *  4. Every combination of two roughly parallel line pairs forms a candidate
 *     quadrilateral (stage 1: edge coverage between the corners × shape ×
 *     area). The best candidates are re-scored (stage 2): a document side must
 *     separate the paper from a *different* surface (text rows, table rules,
 *     printed frames and paragraph boundaries have paper on both sides), its
 *     corners must not be T-junctions (an inner line meeting a page side that
 *     keeps going), and a border side is only plausible where the page
 *     visibly runs out of the frame.
 *  5. A sheet lying on a larger light object (sleeve, binder, the next sheet
 *     of a stack) is preferred over the outer outline when the strip between
 *     both is plain and visibly a different surface – like the reference
 *     scanners do.
 *
 * Returns normalized corners (TL, TR, BR, BL). If nothing plausible is found,
 * an inset full rectangle with `detected: false` is returned.
 */

export interface DetectionResult {
  /** Normalized (0…1) corners TL, TR, BR, BL. */
  corners: Quad;
  detected: boolean;
  /** 0…1, heuristic. */
  confidence: number;
  method: 'lines' | 'fallback';
}

export const FALLBACK_INSET = 0.04;
/** Quads scoring below this are not reported as detected. */
export const DETECTION_THRESHOLD = 0.4;

const WORK_LONG_SIDE = 320;
const MIN_EDGE = 0.012;
const VOTE_SPREAD = 4; // degrees
const ORIENT_TOL = 12; // degrees, support check
const MAX_LINES = 44;
const PER_BUCKET = 6;
const BUCKET_DEG = 6;
const VIRTUAL_Q = 0.42;
const MIN_AREA = 0.06;
const STAGE2 = 60;
const HOUGH_SAT = 0.025;

interface Plane {
  w: number;
  h: number;
  /** luminance 0…1 */
  L: Float32Array;
  /** chroma (max − min) 0…1 – paper is achromatic */
  C: Float32Array;
  /** opponent colour channels red–green and blue–yellow (hue edges: navy header on brown wood) */
  A: Float32Array;
  B: Float32Array;
}

interface Line {
  theta: number; // radians, [0, π)
  cos: number;
  sin: number;
  rho: number;
  tMin: number;
  len: number;
  prefix: Int32Array | null; // null = virtual border line
  votes: number;
}

interface Candidate {
  pts: Point[]; // polygon order along lines (a1∩b1, a1∩b2, a2∩b2, a2∩b1)
  lines: [number, number, number, number]; // side lines in polygon order
  cov: number[];
  area: number;
  shape: number;
  areaTerm: number;
  score: number;
  sideQ?: number[];
  contrast?: number[];
  paperOut?: number[];
  paper?: PaperRef;
  inL?: number[];
  outL?: number[];
  cont?: number;
}

export function detectDocument(image: RgbaImage): DetectionResult {
  const fallback: DetectionResult = { corners: insetQuad(FALLBACK_INSET), detected: false, confidence: 0, method: 'fallback' };
  if (image.width < 16 || image.height < 16) return fallback;
  const plane = prepare(image);
  const { w, h, L } = plane;

  // Blank / featureless frame → nothing to detect.
  let mean = 0;
  for (let i = 0; i < L.length; i++) mean += L[i];
  mean /= L.length;
  let variance = 0;
  for (let i = 0; i < L.length; i++) variance += (L[i] - mean) * (L[i] - mean);
  if (Math.sqrt(variance / L.length) < 0.02) return fallback;

  const edges = edgeMap(plane);
  const lines = houghLines(edges, w, h);
  addBorderLines(lines, w, h);
  const best = bestQuad(lines, plane, edges);
  if (!best || best.score < DETECTION_THRESHOLD) {
    return { ...fallback, confidence: best ? Math.max(0, Math.min(1, best.score)) : 0 };
  }
  const ordered = orderQuad(best.pts);
  const snap = (v: number) => (v < 0.004 ? 0 : v > 0.996 ? 1 : v);
  const corners = ordered.map((p) => ({
    x: snap(Math.min(1, Math.max(0, (p.x + 0.5) / w))),
    y: snap(Math.min(1, Math.max(0, (p.y + 0.5) / h))),
  })) as Quad;
  return { corners, detected: true, confidence: Math.min(1, best.score), method: 'lines' };
}

// ---------------------------------------------------------------------------
// 1. Planes, gradients, edges
// ---------------------------------------------------------------------------

function prepare(image: RgbaImage): Plane {
  const { width: W, height: H, data } = image;
  const f = Math.max(1, Math.round(Math.max(W, H) / WORK_LONG_SIDE));
  const w = Math.floor(W / f);
  const h = Math.floor(H / f);
  const L0 = new Float32Array(w * h);
  const C0 = new Float32Array(w * h);
  const A0 = new Float32Array(w * h);
  const B0 = new Float32Array(w * h);
  const inv = 1 / (255 * f * f);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let l = 0;
      let c = 0;
      let ra = 0;
      let rb = 0;
      for (let dy = 0; dy < f; dy++) {
        let j = ((y * f + dy) * W + x * f) * 4;
        for (let dx = 0; dx < f; dx++, j += 4) {
          const r = data[j];
          const g = data[j + 1];
          const b = data[j + 2];
          l += 0.299 * r + 0.587 * g + 0.114 * b;
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
          c += mx - mn;
          ra += r - g;
          rb += b - 0.5 * (r + g);
        }
      }
      const k = y * w + x;
      L0[k] = l * inv;
      C0[k] = c * inv;
      A0[k] = ra * inv;
      B0[k] = rb * inv;
    }
  }
  return { w, h, L: blur5(L0, w, h), C: blur5(C0, w, h), A: blur5(A0, w, h), B: blur5(B0, w, h) };
}

/** Separable [1 4 6 4 1]/16 blur with clamped borders. */
function blur5(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const x0 = x > 1 ? x - 2 : 0;
      const x1 = x > 0 ? x - 1 : 0;
      const x3 = x < w - 1 ? x + 1 : w - 1;
      const x4 = x < w - 2 ? x + 2 : w - 1;
      tmp[r + x] = (src[r + x0] + 4 * src[r + x1] + 6 * src[r + x] + 4 * src[r + x3] + src[r + x4]) * 0.0625;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = (y > 1 ? y - 2 : 0) * w;
    const y1 = (y > 0 ? y - 1 : 0) * w;
    const y3 = (y < h - 1 ? y + 1 : h - 1) * w;
    const y4 = (y < h - 2 ? y + 2 : h - 1) * w;
    const r = y * w;
    for (let x = 0; x < w; x++) {
      out[r + x] = (tmp[y0 + x] + 4 * tmp[y1 + x] + 6 * tmp[r + x] + 4 * tmp[y3 + x] + tmp[y4 + x]) * 0.0625;
    }
  }
  return out;
}

interface Edges {
  /** NMS magnitude (0 = no edge). */
  mag: Float32Array;
  /** Gradient orientation in degrees 0…179 (valid where mag > 0). */
  ang: Uint8Array;
  /** Indices of edge pixels. */
  idx: Int32Array;
  count: number;
}

const CHROMA_WEIGHT = 0.8;

function edgeMap(p: Plane): Edges {
  const { w, h, L, A, B } = p;
  const n = w * h;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const m = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lx = (L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1]) * 0.125;
      const ly = (L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1]) * 0.125;
      const ax = (A[i - w + 1] + 2 * A[i + 1] + A[i + w + 1] - A[i - w - 1] - 2 * A[i - 1] - A[i + w - 1]) * 0.125 * CHROMA_WEIGHT;
      const ay = (A[i + w - 1] + 2 * A[i + w] + A[i + w + 1] - A[i - w - 1] - 2 * A[i - w] - A[i - w + 1]) * 0.125 * CHROMA_WEIGHT;
      const bx = (B[i - w + 1] + 2 * B[i + 1] + B[i + w + 1] - B[i - w - 1] - 2 * B[i - 1] - B[i + w - 1]) * 0.125 * CHROMA_WEIGHT;
      const by = (B[i + w - 1] + 2 * B[i + w] + B[i + w + 1] - B[i - w - 1] - 2 * B[i - w] - B[i - w + 1]) * 0.125 * CHROMA_WEIGHT;
      const ml = lx * lx + ly * ly;
      const ma = ax * ax + ay * ay;
      const mb = bx * bx + by * by;
      if (ml >= ma && ml >= mb) {
        gx[i] = lx;
        gy[i] = ly;
        m[i] = Math.sqrt(ml);
      } else if (ma >= mb) {
        gx[i] = ax;
        gy[i] = ay;
        m[i] = Math.sqrt(ma);
      } else {
        gx[i] = bx;
        gy[i] = by;
        m[i] = Math.sqrt(mb);
      }
    }
  }
  const mag = new Float32Array(n);
  const ang = new Uint8Array(n);
  const idx = new Int32Array(n);
  let count = 0;
  const T = 0.41421356;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = m[i];
      if (v < MIN_EDGE) continue;
      const ax = Math.abs(gx[i]);
      const ay = Math.abs(gy[i]);
      let a: number;
      let b: number;
      if (ay <= T * ax) {
        a = m[i - 1];
        b = m[i + 1];
      } else if (ax <= T * ay) {
        a = m[i - w];
        b = m[i + w];
      } else if (gx[i] * gy[i] > 0) {
        a = m[i - w - 1];
        b = m[i + w + 1];
      } else {
        a = m[i - w + 1];
        b = m[i + w - 1];
      }
      if (v < a || v <= b) continue;
      mag[i] = v;
      let deg = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI;
      if (deg < 0) deg += 180;
      let d = Math.round(deg);
      if (d >= 180) d -= 180;
      ang[i] = d;
      idx[count++] = i;
    }
  }
  return { mag, ang, idx, count };
}

// ---------------------------------------------------------------------------
// 2./3. Hough lines, refinement, support profiles
// ---------------------------------------------------------------------------

const COS = new Float32Array(180);
const SIN = new Float32Array(180);
for (let t = 0; t < 180; t++) {
  COS[t] = Math.cos((t * Math.PI) / 180);
  SIN[t] = Math.sin((t * Math.PI) / 180);
}

function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

function houghLines(e: Edges, w: number, h: number): Line[] {
  const R = Math.ceil(Math.hypot(w, h));
  const NR = 2 * R + 1;
  const acc = new Float32Array(180 * NR);
  const { mag, ang, idx, count } = e;
  for (let k = 0; k < count; k++) {
    const i = idx[k];
    const x = i % w;
    const y = (i - x) / w;
    const wgt = mag[i] >= HOUGH_SAT ? 1 : mag[i] / HOUGH_SAT;
    const c = ang[i];
    for (let d = -VOTE_SPREAD; d <= VOTE_SPREAD; d++) {
      let t = c + d;
      if (t < 0) t += 180;
      else if (t >= 180) t -= 180;
      const r = Math.round(x * COS[t] + y * SIN[t]) + R;
      acc[t * NR + r] += wgt * (1 - Math.abs(d) / (VOTE_SPREAD + 2));
    }
  }
  const minVotes = 0.07 * Math.min(w, h);
  const peaks: { t: number; r: number; v: number }[] = [];
  for (let t = 0; t < 180; t++) {
    const row = t * NR;
    for (let r = 0; r < NR; r++) {
      const v = acc[row + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -2; dt <= 2 && isMax; dt++) {
        let tt = t + dt;
        let flip = false;
        if (tt < 0) {
          tt += 180;
          flip = true;
        } else if (tt >= 180) {
          tt -= 180;
          flip = true;
        }
        for (let dr = -3; dr <= 3; dr++) {
          if (dt === 0 && dr === 0) continue;
          let rr = r + dr;
          if (flip) rr = NR - 1 - rr;
          if (rr < 0 || rr >= NR) continue;
          const o = acc[tt * NR + rr];
          if (o > v || (o === v && (dt < 0 || (dt === 0 && dr < 0)))) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ t, r, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);

  // Diversity: at most PER_BUCKET strongest lines per orientation bucket, plus
  // the outermost lines of each bucket (page borders are usually outermost).
  const buckets = new Map<number, { t: number; r: number; v: number }[]>();
  for (const p of peaks) {
    const b = Math.floor(p.t / BUCKET_DEG);
    const list = buckets.get(b);
    if (list) list.push(p);
    else buckets.set(b, [p]);
  }
  const chosen: { t: number; r: number; v: number }[] = [];
  const near = (a: { t: number; r: number }, b: { t: number; r: number }) => {
    const dt = angDiff(a.t, b.t);
    if (dt > 3) return false;
    const ra = a.r - R;
    let rb = b.r - R;
    if (Math.abs(a.t - b.t) > 90) rb = -rb;
    return Math.abs(ra - rb) <= 5;
  };
  const tryAdd = (p: { t: number; r: number; v: number }) => {
    if (chosen.length >= MAX_LINES) return;
    for (const c of chosen) if (near(c, p)) return;
    chosen.push(p);
  };
  buckets.forEach((list) => {
    let added = 0;
    for (const p of list) {
      if (added >= PER_BUCKET) break;
      const before = chosen.length;
      tryAdd(p);
      if (chosen.length > before) added++;
    }
    // outermost (signed distance from image centre) strong-enough lines
    const cx = w / 2;
    const cy = h / 2;
    let minP: { t: number; r: number; v: number } | null = null;
    let maxP: { t: number; r: number; v: number } | null = null;
    let minD = Infinity;
    let maxD = -Infinity;
    const ref = list[0].t;
    for (const p of list) {
      if (p.v < 1.6 * minVotes) continue;
      let d = p.r - R - (cx * COS[p.t] + cy * SIN[p.t]);
      if (Math.abs(p.t - ref) > 90) d = -d;
      if (d < minD) {
        minD = d;
        minP = p;
      }
      if (d > maxD) {
        maxD = d;
        maxP = p;
      }
    }
    if (minP) tryAdd(minP);
    if (maxP) tryAdd(maxP);
  });

  const lines: Line[] = [];
  for (const p of chosen) {
    const line = refineLine(e, w, h, p.t, p.r - R, p.v);
    if (line) lines.push(line);
  }
  return lines;
}

function makeLine(theta: number, rho: number, w: number, h: number, votes: number): Line | null {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // parametric: p(t) = (ρ cos − t sin, ρ sin + t cos); clip t to the image
  let t0 = -Infinity;
  let t1 = Infinity;
  const clip = (p0: number, dp: number, lo: number, hi: number) => {
    if (Math.abs(dp) < 1e-9) {
      if (p0 < lo || p0 > hi) {
        t0 = Infinity;
        t1 = -Infinity;
      }
      return;
    }
    let a = (lo - p0) / dp;
    let b = (hi - p0) / dp;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
  };
  clip(rho * cos, -sin, 0, w - 1);
  clip(rho * sin, cos, 0, h - 1);
  if (!(t1 - t0 >= 4)) return null;
  return { theta, cos, sin, rho, tMin: t0, len: Math.floor(t1 - t0), prefix: null, votes };
}

/** Total-least-squares refinement + support profile of a Hough line. */
function refineLine(e: Edges, w: number, h: number, tDeg: number, rho: number, votes: number): Line | null {
  let line = makeLine((tDeg * Math.PI) / 180, rho, w, h, votes);
  if (!line) return null;
  // collect supporting edge pixels within ±2 px
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  const { mag, ang } = e;
  const thetaDeg = tDeg;
  for (let s = 0; s <= line.len; s++) {
    const t = line.tMin + s;
    const px = line.rho * line.cos - t * line.sin;
    const py = line.rho * line.sin + t * line.cos;
    for (let o = -2; o <= 2; o++) {
      const x = Math.round(px + o * line.cos);
      const y = Math.round(py + o * line.sin);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x;
      const m = mag[i];
      if (m <= 0 || angDiff(ang[i], thetaDeg) > ORIENT_TOL) continue;
      const wt = m;
      sw += wt;
      sx += wt * x;
      sy += wt * y;
      sxx += wt * x * x;
      syy += wt * y * y;
      sxy += wt * x * y;
    }
  }
  if (sw > 0) {
    const mx = sx / sw;
    const my = sy / sw;
    const cxx = sxx / sw - mx * mx;
    const cyy = syy / sw - my * my;
    const cxy = sxy / sw - mx * my;
    // direction of largest variance → line direction; normal is perpendicular
    const dirAngle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    let nTheta = dirAngle + Math.PI / 2;
    while (nTheta < 0) nTheta += Math.PI;
    while (nTheta >= Math.PI) nTheta -= Math.PI;
    const nRho = mx * Math.cos(nTheta) + my * Math.sin(nTheta);
    const dTheta = angDiff((nTheta * 180) / Math.PI, thetaDeg);
    // same line in (θ, ρ) or its flipped representation
    const sameRho =
      Math.abs(nTheta - line.theta) < Math.PI / 2 ? Math.abs(nRho - rho) : Math.abs(-nRho - rho);
    if (dTheta < 2.5 && sameRho < 2) {
      const refined = makeLine(nTheta, nRho, w, h, votes);
      if (refined) line = refined;
    }
  }
  // support profile: 1 where an edge with matching orientation is within ±1 px
  const lineDeg = (line.theta * 180) / Math.PI;
  const prefix = new Int32Array(line.len + 2);
  for (let s = 0; s <= line.len; s++) {
    const t = line.tMin + s;
    const px = line.rho * line.cos - t * line.sin;
    const py = line.rho * line.sin + t * line.cos;
    let hit = 0;
    for (let o = -1; o <= 1 && !hit; o++) {
      const x = Math.round(px + o * line.cos);
      const y = Math.round(py + o * line.sin);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x;
      if (mag[i] > 0 && angDiff(ang[i], lineDeg) <= ORIENT_TOL) hit = 1;
    }
    prefix[s + 1] = prefix[s] + hit;
  }
  line.prefix = prefix;
  return line;
}

function addBorderLines(lines: Line[], w: number, h: number): void {
  const add = (theta: number, rho: number) => {
    const l = makeLine(theta, rho, w, h, 0);
    if (l) lines.push(l);
  };
  add(Math.PI / 2, 0); // top
  add(Math.PI / 2, h - 1); // bottom
  add(0, 0); // left
  add(0, w - 1); // right
}

// ---------------------------------------------------------------------------
// 4. Quad candidates & scoring
// ---------------------------------------------------------------------------

function intersect(a: Line, b: Line): Point | null {
  const det = a.cos * b.sin - a.sin * b.cos;
  if (Math.abs(det) < 0.34) return null; // < 20° apart
  return {
    x: (a.rho * b.sin - b.rho * a.sin) / det,
    y: (b.rho * a.cos - a.rho * b.cos) / det,
  };
}

function paramOf(l: Line, p: Point): number {
  return -p.x * l.sin + p.y * l.cos - l.tMin;
}

function coverage(l: Line, p: Point, q: Point): number {
  if (!l.prefix) return -1;
  let a = paramOf(l, p);
  let b = paramOf(l, q);
  if (a > b) [a, b] = [b, a];
  const lo = Math.max(0, Math.round(a));
  const hi = Math.min(l.len + 1, Math.round(b));
  if (hi - lo < 3) return 0;
  return (l.prefix[hi] - l.prefix[lo]) / (b - a);
}

function cornerAngleDeg(prev: Point, p: Point, next: Point): number {
  const v1x = prev.x - p.x;
  const v1y = prev.y - p.y;
  const v2x = next.x - p.x;
  const v2y = next.y - p.y;
  const c = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-9);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

function shapeTerm(pts: Point[]): number {
  let f = 1;
  for (let i = 0; i < 4; i++) {
    const a = cornerAngleDeg(pts[(i + 3) % 4], pts[i], pts[(i + 1) % 4]);
    const dev = Math.abs(a - 90);
    if (dev > 30) f = Math.min(f, Math.max(0.2, 1 - (dev - 30) / 30));
  }
  const s = [0, 1, 2, 3].map((i) => Math.hypot(pts[(i + 1) % 4].x - pts[i].x, pts[(i + 1) % 4].y - pts[i].y));
  for (let k = 0; k < 2; k++) {
    const a = s[k];
    const b = s[k + 2];
    const r = Math.max(a, b) / Math.max(1e-6, Math.min(a, b));
    if (r > 1.6) f = Math.min(f, Math.max(0.2, 1 - (r - 1.6) / 1.4));
  }
  const aspect = (s[0] + s[2]) / Math.max(1e-6, s[1] + s[3]);
  const ar = aspect >= 1 ? aspect : 1 / aspect;
  if (ar > 3.2) f = Math.min(f, Math.max(0.2, 1 - (ar - 3.2) / 2));
  return f;
}

function convexArea(pts: Point[]): number {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-6) return 0;
    const s = z > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return 0;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function bilinear(P: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0;
  else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0;
  else if (y > h - 1.001) y = h - 1.001;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const ax = x - x0;
  const ay = y - y0;
  const i = y0 * w + x0;
  return (P[i] * (1 - ax) + P[i + 1] * ax) * (1 - ay) + (P[i + w] * (1 - ax) + P[i + w + 1] * ax) * ay;
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/** 0 below lo, 1 above hi, linear in between. */
function ramp(v: number, lo: number, hi: number): number {
  return v <= lo ? 0 : v >= hi ? 1 : (v - lo) / (hi - lo);
}

interface PaperRef {
  L: number;
  C: number;
}

/** Paper colour of a candidate: the bright mode of its interior (text is darker than paper). */
function paperReference(p: Plane, pts: Point[]): PaperRef {
  const Ls: number[] = [];
  const Cs: number[] = [];
  for (let i = 1; i <= 9; i++) {
    const u = i / 10;
    for (let j = 1; j <= 9; j++) {
      const v = j / 10;
      const x = (1 - u) * (1 - v) * pts[0].x + u * (1 - v) * pts[1].x + u * v * pts[2].x + (1 - u) * v * pts[3].x;
      const y = (1 - u) * (1 - v) * pts[0].y + u * (1 - v) * pts[1].y + u * v * pts[2].y + (1 - u) * v * pts[3].y;
      if (x < 0 || y < 0 || x > p.w - 1 || y > p.h - 1) continue;
      Ls.push(bilinear(p.L, p.w, p.h, x, y));
      Cs.push(bilinear(p.C, p.w, p.h, x, y));
    }
  }
  if (Ls.length === 0) return { L: 1, C: 0 };
  const L = percentile(Ls, 0.8);
  const bright: number[] = [];
  for (let k = 0; k < Ls.length; k++) if (Ls[k] >= L - 0.06) bright.push(Cs[k]);
  return { L, C: percentile(bright, 0.5) };
}

interface SideEval {
  q: number;
  /** Colour separation between the bands inside and outside the side. */
  sep: number;
  /** Fraction of outside samples that look like the candidate's paper. */
  paperOut: number;
  inL: number;
  outL: number;
}

const BAND = [2.5, 5, 8];
const VBAND = [1.5, 4, 7];

function insideNormal(a: Point, b: Point, cen: Point): { nx: number; ny: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if ((cen.x - (a.x + b.x) / 2) * nx + (cen.y - (a.y + b.y) / 2) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

/**
 * A document side separates paper (inside) from something else (outside).
 * Text rows, table rules, printed frames and paragraph boundaries have paper
 * on both sides – they get a low separation and a high paperOut.
 */
function evalSide(p: Plane, a: Point, b: Point, cen: Point, paper: PaperRef, cov: number): SideEval {
  const { w, h } = p;
  const { nx, ny } = insideNormal(a, b, cen);
  const inL: number[] = [];
  const inC: number[] = [];
  const outL: number[] = [];
  const outC: number[] = [];
  let paperLike = 0;
  const N = 16;
  for (let k = 0; k < N; k++) {
    const t = 0.08 + (0.84 * k) / (N - 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (let bi = 0; bi < BAND.length; bi++) {
      const d = BAND[bi];
      const xi = x + d * nx;
      const yi = y + d * ny;
      if (xi >= 0 && yi >= 0 && xi <= w - 1 && yi <= h - 1) {
        inL.push(bilinear(p.L, w, h, xi, yi));
        inC.push(bilinear(p.C, w, h, xi, yi));
      }
      const xo = x - d * nx;
      const yo = y - d * ny;
      if (xo >= 0 && yo >= 0 && xo <= w - 1 && yo <= h - 1) {
        const l = bilinear(p.L, w, h, xo, yo);
        const c = bilinear(p.C, w, h, xo, yo);
        outL.push(l);
        outC.push(c);
        if (Math.abs(l - paper.L) <= 0.06 && Math.abs(c - paper.C) <= 0.05) paperLike++;
      }
    }
  }
  const expected = N * BAND.length;
  if (inL.length < expected * 0.3) return { q: 0, sep: 0, paperOut: 1, inL: 0, outL: 0 };
  const iL = percentile(inL, 0.75);
  if (outL.length < expected * 0.3) {
    // side hugs the image border – outside is not visible, judge by coverage only
    return { q: Math.pow(Math.max(0, cov), 0.85) * 0.75, sep: 0.05, paperOut: 0, inL: iL, outL: iL };
  }
  const oL = percentile(outL, 0.75);
  const sep = Math.max(Math.abs(iL - oL), 0.8 * Math.abs(percentile(inC, 0.5) - percentile(outC, 0.5)));
  const paperOut = paperLike / outL.length;
  const sepF = 0.25 + 0.75 * ramp(sep, 0.015, 0.07);
  const paperF = 1 - 0.4 * ramp(paperOut, 0.35, 0.85);
  return { q: Math.pow(Math.max(0, cov), 0.85) * sepF * paperF, sep, paperOut, inL: iL, outL: oL };
}

/**
 * Side on the image border (page cut off by the frame). Plausible only when
 * the page visibly continues there (paper / print along the border) and both
 * adjacent sides really run into the border (`endSupport`).
 */
function evalVirtual(p: Plane, a: Point, b: Point, cen: Point, paper: PaperRef, endSupport: number): number {
  const { w, h } = p;
  const { nx, ny } = insideNormal(a, b, cen);
  let n = 0;
  let paperN = 0;
  let printN = 0;
  const N = 16;
  for (let k = 0; k < N; k++) {
    const t = 0.06 + (0.88 * k) / (N - 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (let bi = 0; bi < VBAND.length; bi++) {
      const d = VBAND[bi];
      const xi = x + d * nx;
      const yi = y + d * ny;
      if (xi < 0 || yi < 0 || xi > w - 1 || yi > h - 1) continue;
      n++;
      const l = bilinear(p.L, w, h, xi, yi);
      const c = bilinear(p.C, w, h, xi, yi);
      if (Math.abs(c - paper.C) > 0.07) continue;
      if (Math.abs(l - paper.L) <= 0.08) paperN++;
      else if (l < paper.L && l >= paper.L - 0.4) printN++;
    }
  }
  if (n === 0) return 0.2;
  const like = (paperN + 0.5 * printN) / n;
  return 0.2 + 0.55 * ramp(like, 0.3, 0.8) * ramp(endSupport, 0.25, 0.6);
}

/** Support of line `l` on the last stretch of a side before `end` (coming from `start`). */
function endSupport(l: Line, start: Point, end: Point): number {
  if (!l.prefix) return 1;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const D = Math.max(8, Math.min(30, 0.2 * len));
  return Math.max(0, coverage(l, { x: end.x - (dx / len) * D, y: end.y - (dy / len) * D }, end));
}

/**
 * Support of line `l` just beyond `corner` (away from `other`, the opposite
 * end of the side). A real document corner ends both lines; an inner line
 * (text row, header boundary) meets a page side that keeps going → T-junction.
 */
function continuation(l: Line, corner: Point, other: Point): number {
  if (!l.prefix) return 0;
  const dx = corner.x - other.x;
  const dy = corner.y - other.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const D = Math.max(10, Math.min(24, 0.15 * len));
  let a = paramOf(l, { x: corner.x + 6 * ux, y: corner.y + 6 * uy });
  let b = paramOf(l, { x: corner.x + (6 + D) * ux, y: corner.y + (6 + D) * uy });
  if (a > b) [a, b] = [b, a];
  if (a < 0) a = 0;
  if (b > l.len) b = l.len;
  if (b - a < 5) return 0;
  const lo = Math.round(a);
  const hi = Math.round(b);
  return (l.prefix[hi] - l.prefix[lo]) / (hi - lo);
}

function bestQuad(lines: Line[], plane: Plane, edges: Edges): Candidate | null {
  const { w, h } = plane;
  const n = lines.length;
  const minDim = Math.min(w, h);
  const imgArea = w * h;
  const margin = 0.03 * Math.max(w, h);
  const minSep = 0.12 * minDim;
  const cx = w / 2;
  const cy = h / 2;

  // roughly parallel, separated pairs
  const pairs: { i: number; j: number; dir: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = lines[i];
      const b = lines[j];
      const ta = (a.theta * 180) / Math.PI;
      const tb = (b.theta * 180) / Math.PI;
      if (angDiff(ta, tb) > 30) continue;
      const da = cx * a.cos + cy * a.sin - a.rho;
      let db = cx * b.cos + cy * b.sin - b.rho;
      const aligned = a.cos * b.cos + a.sin * b.sin >= 0;
      if (!aligned) db = -db;
      if (Math.abs(da - db) < minSep) continue;
      let mean = (ta + (Math.abs(ta - tb) > 90 ? (tb < ta ? tb + 180 : tb - 180) : tb)) / 2;
      if (mean < 0) mean += 180;
      if (mean >= 180) mean -= 180;
      pairs.push({ i, j, dir: mean });
    }
  }

  const cands: Candidate[] = [];
  for (let p = 0; p < pairs.length; p++) {
    for (let q = p + 1; q < pairs.length; q++) {
      const P = pairs[p];
      const Q = pairs[q];
      if (angDiff(P.dir, Q.dir) < 50) continue;
      if (P.i === Q.i || P.i === Q.j || P.j === Q.i || P.j === Q.j) continue;
      const a1 = lines[P.i];
      const a2 = lines[P.j];
      const b1 = lines[Q.i];
      const b2 = lines[Q.j];
      const virt = (a1.prefix ? 0 : 1) + (a2.prefix ? 0 : 1) + (b1.prefix ? 0 : 1) + (b2.prefix ? 0 : 1);
      if (virt > 2) continue;
      const c1 = intersect(a1, b1);
      const c2 = intersect(a1, b2);
      const c3 = intersect(a2, b2);
      const c4 = intersect(a2, b1);
      if (!c1 || !c2 || !c3 || !c4) continue;
      const pts = [c1, c2, c3, c4];
      let inside = true;
      for (let k = 0; k < 4; k++) {
        const c = pts[k];
        if (c.x < -margin || c.y < -margin || c.x > w - 1 + margin || c.y > h - 1 + margin) {
          inside = false;
          break;
        }
      }
      if (!inside) continue;
      const area = convexArea(pts);
      if (area < MIN_AREA * imgArea) continue;
      // sides in polygon order: a1 (c1→c2), b2 (c2→c3), a2 (c3→c4), b1 (c4→c1)
      const sideLines: [number, number, number, number] = [P.i, Q.j, P.j, Q.i];
      const cov: number[] = [];
      let ok = true;
      for (let s = 0; s < 4; s++) {
        const A = pts[s];
        const B = pts[(s + 1) % 4];
        if (Math.hypot(B.x - A.x, B.y - A.y) < 0.1 * minDim) {
          ok = false;
          break;
        }
        const c = coverage(lines[sideLines[s]], A, B);
        cov.push(c < 0 ? VIRTUAL_Q : c);
      }
      if (!ok) continue;
      const shape = shapeTerm(pts);
      if (shape < 0.25) continue;
      const areaTerm = Math.pow(Math.min(1, area / (0.25 * imgArea)), 0.35);
      const g = Math.pow(Math.max(1e-4, cov[0] * cov[1] * cov[2] * cov[3]), 0.25);
      cands.push({ pts, lines: sideLines, cov, area, shape, areaTerm, score: g * shape * areaTerm });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.score - a.score);
  const top = cands.slice(0, STAGE2);
  for (let k = 0; k < top.length; k++) scoreStage2(top[k], lines, plane);
  top.sort((a, b) => b.score - a.score);
  let best = top[0];
  const nested = preferNested(best, top, lines, plane, edges);
  if (nested) best = nested;
  return best;
}

function centroidOf(pts: Point[]): Point {
  return { x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4, y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4 };
}

function scoreStage2(c: Candidate, lines: Line[], plane: Plane): void {
  const cen = centroidOf(c.pts);
  const paper = paperReference(plane, c.pts);
  const q: number[] = [];
  const contrast: number[] = [];
  const paperOut: number[] = [];
  const inL: number[] = [];
  const outL: number[] = [];
  for (let s = 0; s < 4; s++) {
    const l = lines[c.lines[s]];
    const A = c.pts[s];
    const B = c.pts[(s + 1) % 4];
    if (!l.prefix) {
      const prev = lines[c.lines[(s + 3) % 4]];
      const next = lines[c.lines[(s + 1) % 4]];
      const es = Math.min(endSupport(prev, c.pts[(s + 3) % 4], A), endSupport(next, c.pts[(s + 2) % 4], B));
      q.push(evalVirtual(plane, A, B, cen, paper, es));
      contrast.push(-1);
      paperOut.push(-1);
      inL.push(-1);
      outL.push(-1);
      continue;
    }
    const ev = evalSide(plane, A, B, cen, paper, c.cov[s]);
    q.push(ev.q);
    contrast.push(ev.sep);
    paperOut.push(ev.paperOut);
    inL.push(ev.inL);
    outL.push(ev.outL);
  }
  // corner continuation (T-junction) penalty; corner s joins side s-1 and side s
  let cont = 1;
  for (let s = 0; s < 4; s++) {
    const corner = c.pts[s];
    const prevSide = (s + 3) % 4; // runs pts[s-1] → pts[s]
    const lPrev = lines[c.lines[prevSide]];
    const lNext = lines[c.lines[s]]; // runs pts[s] → pts[s+1]
    const cp = continuation(lPrev, corner, c.pts[(s + 3) % 4]);
    const cn = continuation(lNext, corner, c.pts[(s + 1) % 4]);
    cont *= 1 - 0.5 * ramp(cp, 0.4, 0.8);
    cont *= 1 - 0.5 * ramp(cn, 0.4, 0.8);
  }
  c.sideQ = q;
  c.contrast = contrast;
  c.paperOut = paperOut;
  c.paper = paper;
  c.inL = inL;
  c.outL = outL;
  c.cont = cont;
  const g = Math.pow(Math.max(1e-6, q[0] * q[1] * q[2] * q[3]), 0.25);
  c.score = g * c.shape * c.areaTerm * cont;
}

/** Inward half-planes of a convex quad: [ax, ay, nx, ny] × 4. */
function halfPlanes(pts: Point[]): Float64Array {
  const cen = centroidOf(pts);
  const hp = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const { nx, ny } = insideNormal(a, pts[(i + 1) % 4], cen);
    hp[i * 4] = a.x;
    hp[i * 4 + 1] = a.y;
    hp[i * 4 + 2] = nx;
    hp[i * 4 + 3] = ny;
  }
  return hp;
}

/** Distance of (x, y) from the boundary of the quad given by its half-planes (positive inside). */
function insideDist(hp: Float64Array, x: number, y: number): number {
  let d = Infinity;
  for (let i = 0; i < 16; i += 4) {
    const v = (x - hp[i]) * hp[i + 2] + (y - hp[i + 1]) * hp[i + 3];
    if (v < d) d = v;
  }
  return d;
}

/** Signed distances (positive = inside) of a and b from the outer side most parallel to a→b. */
function offsetFromParallelSide(outer: Point[], a: Point, b: Point): { dA: number; dB: number } {
  const cen = centroidOf(outer);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  let bestJ = 0;
  let bestDiff = Infinity;
  for (let j = 0; j < 4; j++) {
    const p = outer[j];
    const q = outer[(j + 1) % 4];
    let d = Math.abs(Math.atan2(q.y - p.y, q.x - p.x) - ang) % Math.PI;
    if (d > Math.PI / 2) d = Math.PI - d;
    if (d < bestDiff) {
      bestDiff = d;
      bestJ = j;
    }
  }
  const p = outer[bestJ];
  const q = outer[(bestJ + 1) % 4];
  const { nx, ny } = insideNormal(p, q, cen);
  return { dA: (a.x - p.x) * nx + (a.y - p.y) * ny, dB: (b.x - p.x) * nx + (b.y - p.y) * ny };
}

/**
 * Strip between an inner side (a→b) and the outer outline: light and plain
 * (binder, sleeve, the next sheet of a stack) – not print (text rows,
 * paragraph boundaries) and not a dark header bar.
 */
function plainLightStrip(p: Plane, e: Edges, a: Point, b: Point, cen: Point, outer: Float64Array, paper: PaperRef): boolean {
  const { w, h } = p;
  const { nx, ny } = insideNormal(a, b, cen);
  const vals: number[] = [];
  let edgeHits = 0;
  for (let k = 0; k < 16; k++) {
    const t = 0.08 + (0.84 * k) / 15;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (let d = 3; d < 80; d += 1.5) {
      const sx = x - d * nx;
      const sy = y - d * ny;
      if (sx < 1 || sy < 1 || sx > w - 2 || sy > h - 2) break;
      if (insideDist(outer, sx, sy) < 3) break;
      vals.push(bilinear(p.L, w, h, sx, sy));
      const i = Math.round(sy) * w + Math.round(sx);
      if (e.mag[i] >= 0.03 || e.mag[i + 1] >= 0.03 || e.mag[i + w] >= 0.03) edgeHits++;
    }
  }
  if (vals.length < 10) return true; // very thin strip: nothing to judge
  const med = percentile(vals, 0.5);
  // light (not a dark header bar), but visibly a different surface than the paper
  if (med < 0.5 * paper.L || paper.L - med < 0.09) return false;
  return edgeHits / vals.length < 0.08;
}

/**
 * A sheet lying on a larger light object (sleeve, binder, paper stack): the
 * outer outline usually has the stronger edges, but the user wants the sheet –
 * like the reference scanners. A nested candidate wins when its own sides lie
 * clearly inside the outer outline, are real steps from brighter paper to a
 * different surface, and the strip beyond them is plain and light (no print,
 * no dark header bar).
 */
function preferNested(best: Candidate, cands: Candidate[], lines: Line[], plane: Plane, edges: Edges): Candidate | null {
  let pick: Candidate | null = null;
  let pickBase = 0;
  const outerHp = halfPlanes(best.pts);
  for (let k = 0; k < cands.length; k++) {
    const c = cands[k];
    if (c === best || !c.sideQ || !c.contrast || !c.inL || !c.outL || !c.paperOut) continue;
    const base = c.score / Math.max(1e-6, c.cont ?? 1);
    if (base < 0.6 * best.score || base < DETECTION_THRESHOLD) continue;
    if (c.area > 0.985 * best.area || c.area < 0.3 * best.area) continue;
    if (!c.pts.every((p) => insideDist(outerHp, p.x, p.y) > -2)) continue;
    const cen = centroidOf(c.pts);
    const paper = c.paper ?? paperReference(plane, c.pts);
    let own = 0;
    let ok = true;
    for (let s = 0; s < 4; s++) {
      const A = c.pts[s];
      const B = c.pts[(s + 1) % 4];
      // distance of both ends from the most parallel side of the outer outline
      const { dA, dB } = offsetFromParallelSide(best.pts, A, B);
      if (Math.max(Math.abs(dA), Math.abs(dB)) <= 3) continue; // (approximately) shared with the outer outline
      if (Math.min(dA, dB) < 3 || !lines[c.lines[s]].prefix) {
        ok = false;
        break;
      }
      own++;
      if (c.cov[s] < 0.6 || c.contrast[s] < 0.04 || c.inL[s] < c.outL[s] + 0.015) {
        ok = false;
        break;
      }
      if (!plainLightStrip(plane, edges, A, B, cen, outerHp, paper)) {
        ok = false;
        break;
      }
    }
    if (!ok || own === 0) continue;
    if (!pick || base > pickBase) {
      pick = c;
      pickBase = base;
    }
  }
  if (pick) pick.score = Math.max(pick.score, Math.min(pickBase, best.score));
  return pick;
}
