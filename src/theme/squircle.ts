/**
 * Smooth ("squircle") rounded rectangles as SVG path data, for shapes drawn
 * with Skia (`Skia.Path.MakeFromSVGString(squirclePath(w, h, r))`). Views use
 * `borderCurve: 'continuous'` instead (see shape.ts).
 *
 * Corner smoothing as in Figma ("Desperately seeking squircles"): each corner
 * is a short circular arc between two cubic Bézier transitions, so the
 * curvature grows gradually instead of jumping at the tangent point.
 * `smoothing` 0 = plain circular corners, 0.6 ≈ iOS, 1 = maximum smoothing.
 * The radius is clamped to half the shortest side; if a corner then has no
 * room for full smoothing, the smoothing is reduced (a capsule stays a capsule).
 */

export type Point = readonly [number, number];

export type SquircleSegment =
  | { type: 'M'; to: Point }
  | { type: 'L'; to: Point }
  | { type: 'C'; c1: Point; c2: Point; to: Point }
  | { type: 'Z' };

const DEG = Math.PI / 180;

const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);

interface CornerParams {
  r: number;
  p: number;
  a: number;
  b: number;
  c: number;
  d: number;
  /** Smoothing actually used (may be lower than requested when space is short). */
  beta: number;
}

function cornerParams(r: number, smoothing: number, budget: number): CornerParams {
  if (r <= 0) return { r: 0, p: 0, a: 0, b: 0, c: 0, d: 0, beta: 0 };
  // Not enough room for the smoothed transitions: reduce the smoothing
  const s = Math.min(smoothing, budget / r - 1);
  const p = Math.min((1 + s) * r, budget);
  const arcMeasure = 90 * (1 - s);
  const arcLength = Math.sin((arcMeasure / 2) * DEG) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3ToP4 = r * Math.tan((alpha / 2) * DEG);
  const beta = 45 * s;
  const c = p3ToP4 * Math.cos(beta * DEG);
  const d = c * Math.tan(beta * DEG);
  const b = (p - arcLength - c - d) / 3;
  return { r, p, a: 2 * b, b, c, d, beta };
}

/**
 * One corner in a local frame: origin at the corner vertex, u along the
 * incoming edge (towards the vertex), v along the outgoing edge.
 * Starts at (−p, 0), ends at (0, p).
 */
function localCorner({ r, p, a, b, c, d, beta }: CornerParams): { start: Point; curves: [Point, Point, Point][] } {
  if (r <= 0) return { start: [0, 0], curves: [] };
  // Circular middle part: centre (−r, r), from −90° + β to −β, as one cubic
  const from = (-90 + beta) * DEG;
  const to = -beta * DEG;
  const k = (4 / 3) * Math.tan((to - from) / 4) * r;
  const arcStart: Point = [-r + r * Math.cos(from), r + r * Math.sin(from)];
  const arcEnd: Point = [-r + r * Math.cos(to), r + r * Math.sin(to)];
  return {
    start: [-p, 0],
    curves: [
      [[-p + a, 0], [-p + a + b, 0], arcStart],
      [
        [arcStart[0] - k * Math.sin(from), arcStart[1] + k * Math.cos(from)],
        [arcEnd[0] + k * Math.sin(to), arcEnd[1] - k * Math.cos(to)],
        arcEnd,
      ],
      [[0, p - a - b], [0, p - a], [0, p]],
    ],
  };
}

/** Corner vertices with the directions of their incoming (u) and outgoing (v) edges, clockwise from top right. */
function frames(w: number, h: number): { origin: Point; u: Point; v: Point }[] {
  return [
    { origin: [w, 0], u: [1, 0], v: [0, 1] },
    { origin: [w, h], u: [0, 1], v: [-1, 0] },
    { origin: [0, h], u: [-1, 0], v: [0, -1] },
    { origin: [0, 0], u: [0, -1], v: [1, 0] },
  ];
}

/** Path segments of a smoothed rounded rectangle (0,0)–(width,height), clockwise from the top edge. */
export function squircleSegments(width: number, height: number, radius: number, smoothing = 0.6): SquircleSegment[] {
  const w = Math.max(0, finite(width));
  const h = Math.max(0, finite(height));
  const budget = Math.min(w, h) / 2;
  const r = Math.min(Math.max(0, finite(radius)), budget);
  const s = Math.min(1, Math.max(0, finite(smoothing, 0.6)));
  const params = cornerParams(r, s, budget);
  const shape = localCorner(params);

  const segments: SquircleSegment[] = [];
  frames(w, h).forEach(({ origin, u, v }, i) => {
    const map = ([x, y]: Point): Point => [origin[0] + x * u[0] + y * v[0], origin[1] + x * u[1] + y * v[1]];
    segments.push({ type: i === 0 ? 'M' : 'L', to: map(shape.start) });
    for (const [c1, c2, to] of shape.curves) segments.push({ type: 'C', c1: map(c1), c2: map(c2), to: map(to) });
  });
  segments.push({ type: 'Z' });
  return segments;
}

const num = (v: number) => {
  const rounded = Math.round(v * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
const pt = ([x, y]: Point) => `${num(x)} ${num(y)}`;

/** SVG path data ("M … C … Z") of a smoothed rounded rectangle; see `squircleSegments`. */
export function squirclePath(width: number, height: number, radius: number, smoothing = 0.6): string {
  return squircleSegments(width, height, radius, smoothing)
    .map((seg) => {
      switch (seg.type) {
        case 'M':
        case 'L':
          return `${seg.type}${pt(seg.to)}`;
        case 'C':
          return `C${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.to)}`;
        default:
          return 'Z';
      }
    })
    .join(' ');
}