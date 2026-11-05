import type { Mat3, Point, Quad, Rotation } from './types';

/** Full image as a quad in normalized (0…1) coordinates. */
export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function insetQuad(inset: number): Quad {
  return [
    { x: inset, y: inset },
    { x: 1 - inset, y: inset },
    { x: 1 - inset, y: 1 - inset },
    { x: inset, y: 1 - inset },
  ];
}

export function scaleQuad(q: Quad, sx: number, sy: number): Quad {
  return q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad;
}

export function rectQuad(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/** Solves A·x = b (n×n) with partial pivoting. Returns null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homography H with H·src[i] ~ dst[i] (row-major, h22 = 1). */
export function computeHomography(src: Quad, dst: Quad): Mat3 | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(H: Mat3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv,
    B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv,
    C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv,
  ];
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Signed shoelace area (positive for clockwise order in screen coordinates). */
export function polygonArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Sorts 4 arbitrary points into TL, TR, BR, BL. */
export function orderQuad(points: Point[]): Quad {
  const c = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
  // atan2 order in screen coords (y down) is clockwise starting near -π (left). Find TL = min(x+y).
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  }
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]) as Quad;
}

export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const z = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(z) < 1e-9) return false;
    const s = Math.sign(z);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Interior angles in degrees, in corner order. */
export function quadAngles(q: Quad): number[] {
  return q.map((p, i) => {
    const prev = q[(i + 3) % 4];
    const next = q[(i + 1) % 4];
    const v1 = { x: prev.x - p.x, y: prev.y - p.y };
    const v2 = { x: next.x - p.x, y: next.y - p.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
}

export interface QuadValidation {
  valid: boolean;
  reason?: 'notConvex' | 'tooSmall' | 'badAngles' | 'shortSide';
}

/** Sanity checks for a quad in pixel coordinates of an image of size width×height. */
export function validateQuad(
  q: Quad,
  width: number,
  height: number,
  opts: { minAreaFraction?: number; minAngle?: number; maxAngle?: number; minSideFraction?: number } = {}
): QuadValidation {
  const { minAreaFraction = 0.12, minAngle = 40, maxAngle = 140, minSideFraction = 0.12 } = opts;
  if (!isConvexQuad(q)) return { valid: false, reason: 'notConvex' };
  if (Math.abs(polygonArea(q)) < minAreaFraction * width * height) return { valid: false, reason: 'tooSmall' };
  const angles = quadAngles(q);
  if (angles.some((a) => a < minAngle || a > maxAngle)) return { valid: false, reason: 'badAngles' };
  const minSide = minSideFraction * Math.min(width, height);
  for (let i = 0; i < 4; i++) {
    if (dist(q[i], q[(i + 1) % 4]) < minSide) return { valid: false, reason: 'shortSide' };
  }
  return { valid: true };
}

/**
 * Estimates the real width/height ratio of a photographed rectangle from its
 * projected corners (pixel coordinates), using the pinhole-camera method of
 * Zhang & He ("Whiteboard scanning and image enhancement", 2007) with the
 * principal point at the image centre. Falls back to averaging opposite
 * sides when the perspective is too weak to recover the focal length.
 */
export function estimateAspectRatio(q: Quad, imageWidth: number, imageHeight: number): number {
  const [tl, tr, br, bl] = q;
  const avgW = (dist(tl, tr) + dist(bl, br)) / 2;
  const avgH = (dist(tl, bl) + dist(tr, br)) / 2;
  const fallback = avgW / Math.max(avgH, 1e-6);

  const u0 = imageWidth / 2;
  const v0 = imageHeight / 2;
  const m = (p: Point): [number, number, number] => [p.x - u0, p.y - v0, 1];
  const m1 = m(tl), m2 = m(tr), m3 = m(bl), m4 = m(br);
  const cr = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const k2den = dot(cr(m2, m4), m3);
  const k3den = dot(cr(m3, m4), m2);
  if (Math.abs(k2den) < 1e-9 || Math.abs(k3den) < 1e-9) return fallback;
  const k2 = dot(cr(m1, m4), m3) / k2den;
  const k3 = dot(cr(m1, m4), m2) / k3den;
  const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];

  const denom = n2[2] * n3[2];
  const longSide = Math.max(imageWidth, imageHeight);
  // Nearly fronto-parallel: focal length is unobservable, but then the average is accurate.
  if (Math.abs(n2[2]) < 1e-3 || Math.abs(n3[2]) < 1e-3 || Math.abs(denom) < 1e-9) return fallback;
  const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / denom;
  if (!(f2 > 0)) return fallback;
  const f = Math.sqrt(f2);
  // Phone cameras: f is roughly 0.6–2.5 × the long image side. Outside → unreliable.
  if (f < 0.4 * longSide || f > 4 * longSide) return fallback;

  const w2 = (n2[0] * n2[0] + n2[1] * n2[1]) / f2 + n2[2] * n2[2];
  const h2 = (n3[0] * n3[0] + n3[1] * n3[1]) / f2 + n3[2] * n3[2];
  const ratio = Math.sqrt(w2 / h2);
  if (!Number.isFinite(ratio) || ratio <= 0) return fallback;
  // Guard against wild results: stay within a factor 1.6 of the simple estimate.
  if (ratio / fallback > 1.6 || fallback / ratio > 1.6) return fallback;
  return ratio;
}

/**
 * Source quad re-ordered so that output corner i (TL, TR, BR, BL of the rotated
 * page) maps to the right source corner for a clockwise rotation.
 */
export function rotateQuadOrder(q: Quad, rotation: Rotation): Quad {
  const steps = ((rotation / 90) % 4 + 4) % 4;
  return [0, 1, 2, 3].map((i) => q[(i + 4 - steps) % 4]) as Quad;
}

/**
 * Homography mapping output pixel coordinates (0…outW, 0…outH) of the
 * rotated, de-warped page to source pixel coordinates.
 */
export function outputToSourceHomography(sourceQuadPx: Quad, outW: number, outH: number, rotation: Rotation): Mat3 | null {
  return computeHomography(rectQuad(outW, outH), rotateQuadOrder(sourceQuadPx, rotation));
}

export function clampQuad(q: Quad, min = 0, max = 1): Quad {
  return q.map((p) => ({ x: Math.min(max, Math.max(min, p.x)), y: Math.min(max, Math.max(min, p.y)) })) as Quad;
}

export function isQuadLike(value: unknown): value is Quad {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y))
  );
}
