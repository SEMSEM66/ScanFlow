import { describe, expect, it } from '@jest/globals';
import { squirclePath, squircleSegments, type Point, type SquircleSegment } from '../src/theme/squircle';
import { capsule, concentric, corner, corners, radius } from '../src/theme/shape';

const EPS = 1e-6;

const pointsOf = (segments: SquircleSegment[]): Point[] =>
  segments.flatMap((s) => (s.type === 'Z' ? [] : s.type === 'C' ? [s.c1, s.c2, s.to] : [s.to]));

const endPoints = (segments: SquircleSegment[]): Point[] => segments.flatMap((s) => (s.type === 'Z' ? [] : [s.to]));

const hasPoint = (list: Point[], [x, y]: Point, eps = 1e-6) => list.some(([px, py]) => Math.abs(px - x) < eps && Math.abs(py - y) < eps);

/** Numbers of an SVG path string. */
const numbersOf = (path: string) => (path.match(/-?\d+(\.\d+)?(e-?\d+)?|NaN|Infinity/g) ?? []).map(Number);

describe('squirclePath', () => {
  it('starts on the top edge, ends at the top-left corner and closes', () => {
    const segs = squircleSegments(200, 100, 20); // smoothing 0.6 → corner extent 1.6 · r = 32
    expect(segs[0]).toEqual({ type: 'M', to: [168, 0] });
    expect(segs[segs.length - 1]).toEqual({ type: 'Z' });
    const last = segs[segs.length - 2];
    expect(last.type).toBe('C');
    if (last.type === 'C') {
      expect(last.to[0]).toBeCloseTo(32, 6);
      expect(last.to[1]).toBeCloseTo(0, 6);
    }
    expect(squirclePath(200, 100, 20).startsWith('M168 0 C')).toBe(true);
    expect(squirclePath(200, 100, 20).endsWith(' Z')).toBe(true);
  });

  it('touches every edge exactly where the straight part begins (tangent continuity)', () => {
    const w = 120;
    const h = 80;
    const segs = squircleSegments(w, h, 16, 0.6);
    const p = 1.6 * 16;
    const ends = endPoints(segs);
    for (const q of [[w - p, 0], [w, p], [w, h - p], [w - p, h], [p, h], [0, h - p], [0, p], [p, 0]] as Point[]) {
      expect(hasPoint(ends, q)).toBe(true);
    }
    // a corner leaves the top edge horizontally and meets the right edge vertically
    const firstCurve = segs[1];
    const thirdCurve = segs[3];
    expect(firstCurve.type === 'C' && Math.abs(firstCurve.c1[1]) < EPS && Math.abs(firstCurve.c2[1]) < EPS).toBe(true);
    expect(thirdCurve.type === 'C' && Math.abs(thirdCurve.c1[0] - w) < EPS && Math.abs(thirdCurve.c2[0] - w) < EPS).toBe(true);
  });

  it('is symmetric horizontally and vertically', () => {
    for (const [w, h, r, s] of [
      [200, 100, 20, 0.6],
      [64, 64, 14, 1],
      [300, 44, 22, 0.6],
      [90, 150, 28, 0],
    ]) {
      const pts = pointsOf(squircleSegments(w, h, r, s));
      for (const [x, y] of pts) {
        expect(hasPoint(pts, [w - x, y])).toBe(true);
        expect(hasPoint(pts, [x, h - y])).toBe(true);
      }
    }
  });

  it('never produces NaN or infinite numbers', () => {
    const cases: [number, number, number, number?][] = [
      [0, 0, 0],
      [0, 50, 10],
      [100, 100, 0],
      [100, 40, -5],
      [100, 40, NaN],
      [100, 40, Infinity],
      [NaN, 40, 10],
      [100, Infinity, 10],
      [100, 40, 10, NaN],
      [100, 40, 10, -1],
      [100, 40, 10, 5],
      [1e-4, 1e-4, 1],
    ];
    for (const [w, h, r, s] of cases) {
      const path = squirclePath(w, h, r, s);
      expect(path).not.toMatch(/NaN|Infinity/);
      expect(numbersOf(path).every(Number.isFinite)).toBe(true);
      expect(pointsOf(squircleSegments(w, h, r, s)).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    }
  });

  it('clamps the radius to half the shortest side and stays inside the bounds', () => {
    expect(squirclePath(100, 40, 999)).toBe(squirclePath(100, 40, 20));
    expect(squirclePath(40, 100, 999)).toBe(squirclePath(40, 100, 20));
    for (const [w, h, r] of [
      [100, 40, 999],
      [100, 40, 20],
      [50, 50, 30],
    ]) {
      for (const [x, y] of pointsOf(squircleSegments(w, h, r))) {
        expect(x).toBeGreaterThanOrEqual(-EPS);
        expect(x).toBeLessThanOrEqual(w + EPS);
        expect(y).toBeGreaterThanOrEqual(-EPS);
        expect(y).toBeLessThanOrEqual(h + EPS);
      }
    }
  });

  it('reduces the smoothing when there is no room (a capsule stays a capsule)', () => {
    // r = h / 2: no space for the smoothed transitions → plain half circles
    expect(squircleSegments(120, 40, 20)[0]).toEqual({ type: 'M', to: [100, 0] });
    // smoothing 0 → the corner starts exactly one radius before the vertex
    expect(squircleSegments(120, 80, 16, 0)[0]).toEqual({ type: 'M', to: [104, 0] });
  });

  it('falls back to a plain rectangle without a radius', () => {
    expect(squirclePath(30, 20, 0)).toBe('M30 0 L30 20 L0 20 L0 0 Z');
  });
});

describe('shape helpers', () => {
  it('always use continuous corners', () => {
    expect(corner(radius.md)).toEqual({ borderRadius: 14, borderCurve: 'continuous' });
    expect(corner(-3)).toEqual({ borderRadius: 0, borderCurve: 'continuous' });
    expect(corners({ topLeft: 20, topRight: 20 })).toEqual({
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderCurve: 'continuous',
    });
  });

  it('derives capsules from the real height and nested radii concentrically', () => {
    expect(capsule(44)).toEqual({ borderRadius: 22, borderCurve: 'continuous' });
    expect(concentric(radius.lg, 8)).toBe(12);
    expect(concentric(radius.xs, 8)).toBe(0);
  });

  it('keeps the radius scale', () => {
    expect(radius).toEqual({ xs: 6, sm: 10, md: 14, lg: 20, xl: 28 });
  });
});