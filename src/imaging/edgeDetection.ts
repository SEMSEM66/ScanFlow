import type { Point, Quad, RgbaImage } from './types';
import { insetQuad, isConvexQuad, orderQuad, polygonArea, validateQuad } from './geometry';
import {
  connectedComponents,
  dilateMask,
  erodeMask,
  floodFromBorder,
  gaussianBlur,
  luminance,
  otsuThreshold,
  percentile,
} from './raster';

/**
 * Best-effort document corner detection in pure TypeScript.
 *
 * Input: a downscaled RGBA copy of the photo (≈300 px long side).
 * Two independent candidates are computed and the better valid one wins:
 *  A) edges: Sobel + non-maximum suppression + hysteresis (Canny-style,
 *     thresholds from the gradient distribution), closed by a 1 px dilation;
 *     the largest region NOT reachable from the image border is the page.
 *  B) brightness: Otsu threshold on the blurred luminance; the largest
 *     bright connected component (holes filled) is the page.
 * The region's convex hull is simplified and the maximum-area quadrilateral
 * on the hull is taken as the page outline; sanity checks (area, convexity,
 * angles, side length, fill ratio) reject implausible results. If nothing
 * passes, an inset full rectangle is returned with `detected: false`.
 */

export interface DetectionResult {
  /** Normalized (0…1) corners TL, TR, BR, BL. */
  corners: Quad;
  detected: boolean;
  /** 0…1, heuristic. */
  confidence: number;
  method: 'edges' | 'brightness' | 'fallback';
}

export const FALLBACK_INSET = 0.04;

export function detectDocument(image: RgbaImage): DetectionResult {
  const fallback: DetectionResult = { corners: insetQuad(FALLBACK_INSET), detected: false, confidence: 0, method: 'fallback' };
  const { width: w, height: h } = image;
  if (w < 16 || h < 16) return fallback;

  const gray = gaussianBlur(luminance(image.data, w, h), w, h, 2);
  const candidates: { quad: Quad; score: number; method: 'edges' | 'brightness' }[] = [];

  // Blank / featureless frame → nothing to detect.
  let mean = 0;
  for (let i = 0; i < gray.length; i++) mean += gray[i];
  mean /= gray.length;
  let variance = 0;
  for (let i = 0; i < gray.length; i++) variance += (gray[i] - mean) ** 2;
  if (Math.sqrt(variance / gray.length) < 0.02) return fallback;

  // Edge candidates at several hysteresis levels: low-contrast page borders
  // (light table) only survive the relaxed levels, while busy scenes are
  // cleaner at the strict level. The scoring below picks the best quad.
  const edgeStats = edgeMagnitude(gray, w, h);
  for (const level of EDGE_LEVELS) {
    const regionA = edgeRegion(edgeStats, w, h, level);
    if (!regionA) continue;
    const c = quadFromRegion(regionA, w, h, 1.5);
    if (c) candidates.push({ ...c, method: 'edges' });
  }
  const regionB = brightRegion(gray, w, h);
  if (regionB) {
    const c = quadFromRegion(regionB, w, h, 0.5);
    if (c) candidates.push({ ...c, method: 'brightness' });
  }
  if (candidates.length === 0) return fallback;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const corners = best.quad.map((p) => ({
    x: Math.min(1, Math.max(0, p.x / w)),
    y: Math.min(1, Math.max(0, p.y / h)),
  })) as Quad;
  return { corners, detected: true, confidence: Math.min(1, best.score), method: best.method };
}

// ---------------------------------------------------------------------------
// Candidate A: edge map → enclosed region
// ---------------------------------------------------------------------------
const EDGE_LEVELS = [1, 0.5, 0.25];

interface EdgeStats {
  mag: Float32Array;
  dir: Uint8Array;
  high: number;
}

function edgeMagnitude(gray: Float32Array, w: number, h: number): EdgeStats {
  const n = w * h;
  const mag = new Float32Array(n);
  const dir = new Uint8Array(n); // 0: horizontal gradient, 1: 45°, 2: vertical, 3: 135°
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      let a = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (a < 0) a += 180;
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  }
  return { mag, dir, high: Math.max(0.08, percentile(mag, 0.9)) };
}

function edgeRegion(stats: EdgeStats, w: number, h: number, level: number): Uint8Array | null {
  const n = w * h;
  const { mag, dir } = stats;
  const high = Math.max(0.03, stats.high * level);
  const low = high * 0.4;
  // Non-maximum suppression
  const nms = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < low) continue;
      let a = 0;
      let b = 0;
      switch (dir[i]) {
        case 0: a = mag[i - 1]; b = mag[i + 1]; break;
        case 1: a = mag[i - w - 1]; b = mag[i + w + 1]; break;
        case 2: a = mag[i - w]; b = mag[i + w]; break;
        default: a = mag[i - w + 1]; b = mag[i + w - 1]; break;
      }
      if (m >= a && m >= b) nms[i] = m;
    }
  }
  // Hysteresis
  const edge = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) {
    if (nms[i] >= high && !edge[i]) {
      edge[i] = 1;
      stack[sp++] = i;
      while (sp > 0) {
        const idx = stack[--sp];
        const x = idx % w;
        const y = (idx - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!edge[j] && nms[j] >= low) {
              edge[j] = 1;
              stack[sp++] = j;
            }
          }
        }
      }
    }
  }
  const closed = dilateMask(edge, w, h, 1);
  const free = new Uint8Array(n);
  for (let i = 0; i < n; i++) free[i] = closed[i] ? 0 : 1;
  const outside = floodFromBorder(free, w, h);
  const enclosed = new Uint8Array(n);
  for (let i = 0; i < n; i++) enclosed[i] = free[i] && !outside[i] ? 1 : 0;
  const region = largestComponent(enclosed, w, h);
  if (!region) return null;
  // Region is the page interior minus text holes → fill holes.
  return fillHoles(region, w, h);
}

// ---------------------------------------------------------------------------
// Candidate B: bright paper vs. background
// ---------------------------------------------------------------------------
function brightRegion(gray: Float32Array, w: number, h: number): Uint8Array | null {
  const t = otsuThreshold(gray);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = gray[i] > t ? 1 : 0;
  // open (remove specks) then close (bridge text holes / thin gaps)
  const opened = dilateMask(erodeMask(mask, w, h, 1), w, h, 1);
  const closed = erodeMask(dilateMask(opened, w, h, 2), w, h, 2);
  const region = largestComponent(closed, w, h);
  return region ? fillHoles(region, w, h) : null;
}

function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array | null {
  const { labels, sizes } = connectedComponents(mask, w, h);
  let best = 0;
  for (let l = 1; l < sizes.length; l++) if (sizes[l] > (sizes[best] ?? 0)) best = l;
  if (best === 0 || sizes[best] < 0.1 * w * h) return null;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = labels[i] === best ? 1 : 0;
  return out;
}

function fillHoles(region: Uint8Array, w: number, h: number): Uint8Array {
  const free = new Uint8Array(region.length);
  for (let i = 0; i < free.length; i++) free[i] = region[i] ? 0 : 1;
  const outside = floodFromBorder(free, w, h);
  const out = new Uint8Array(region.length);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

// ---------------------------------------------------------------------------
// Region → quad
// ---------------------------------------------------------------------------
function quadFromRegion(region: Uint8Array, w: number, h: number, expandPx: number): { quad: Quad; score: number } | null {
  const pts: Point[] = [];
  let area = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!region[i]) continue;
      area++;
      const boundary =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 || !region[i - 1] || !region[i + 1] || !region[i - w] || !region[i + w];
      if (boundary) {
        // pixel corners give a tight hull around the pixel area
        pts.push({ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
      }
    }
  }
  if (pts.length < 8) return null;
  let hull = convexHull(pts);
  hull = simplifyClosed(hull, 24);
  if (hull.length < 4) return null;
  let quad = maxAreaQuad(hull);
  if (!quad) return null;
  quad = expandQuad(quad, expandPx);
  if (!isConvexQuad(quad)) return null;
  const v = validateQuad(quad, w, h);
  if (!v.valid) return null;
  const qArea = Math.abs(polygonArea(quad));
  const fill = area / qArea; // ≈1 for a clean quadrilateral region
  if (fill < 0.85 || fill > 1.15) return null;
  const areaFrac = qArea / (w * h);
  // Penalize quads hugging the full frame (often the table/frame, not the page).
  const touches = quad.filter((p) => p.x <= 1 || p.y <= 1 || p.x >= w - 1 || p.y >= h - 1).length;
  // Three or more corners on the frame border = the table / the frame itself.
  if (touches >= 3) return null;
  const score = (1 - Math.abs(1 - fill) * 3) * 0.7 + Math.min(areaFrac / 0.5, 1) * 0.3 - touches * 0.08;
  return { quad, score };
}

export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const crossZ = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Removes hull vertices with the smallest triangle area until ≤ maxPoints remain. */
function simplifyClosed(hull: Point[], maxPoints: number): Point[] {
  const pts = [...hull];
  const tri = (a: Point, b: Point, c: Point) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  while (pts.length > maxPoints) {
    let minI = 0;
    let minA = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = tri(pts[(i + pts.length - 1) % pts.length], pts[i], pts[(i + 1) % pts.length]);
      if (a < minA) {
        minA = a;
        minI = i;
      }
    }
    pts.splice(minI, 1);
  }
  return pts;
}

function maxAreaQuad(hull: Point[]): Quad | null {
  const n = hull.length;
  let best = -1;
  let bestIdx: number[] | null = null;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const area = Math.abs(polygonArea([hull[a], hull[b], hull[c], hull[d]]));
          if (area > best) {
            best = area;
            bestIdx = [a, b, c, d];
          }
        }
  if (!bestIdx) return null;
  return orderQuad(bestIdx.map((i) => hull[i]));
}

/** Moves every side outward by `px` (approximately; via corner displacement from the centroid). */
function expandQuad(q: Quad, px: number): Quad {
  if (px === 0) return q;
  const c = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
  return q.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    // corner moves ≈ √2·px along the diagonal for ~90° corners
    return { x: p.x + (dx / len) * px * Math.SQRT2, y: p.y + (dy / len) * px * Math.SQRT2 };
  }) as Quad;
}
