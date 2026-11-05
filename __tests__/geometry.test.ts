import { describe, expect, it } from '@jest/globals';
import {
  applyHomography,
  computeHomography,
  estimateAspectRatio,
  invert3,
  isConvexQuad,
  orderQuad,
  outputToSourceHomography,
  validateQuad,
} from '../src/imaging/geometry';
import { pagePixelSize, resolvePageSize, A4_PT, LETTER_PT } from '../src/imaging/pageFormat';
import type { Quad } from '../src/imaging/types';

const quad = (pts: number[][]): Quad => pts.map(([x, y]) => ({ x, y })) as Quad;

/** Pinhole projection of a W×H (metres) rectangle; returns image corners. */
function project(W: number, H: number, opts: { rx: number; ry: number; rz: number; dist: number; f: number; cx: number; cy: number; ox?: number; oy?: number }): Quad {
  const { rx, ry, rz, dist, f, cx, cy, ox = 0, oy = 0 } = opts;
  const R = (v: number[]) => {
    let [x, y, z] = v;
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
    return [x + ox, y + oy, z + dist];
  };
  const pts = [[-W / 2, -H / 2, 0], [W / 2, -H / 2, 0], [W / 2, H / 2, 0], [-W / 2, H / 2, 0]].map(R);
  return pts.map(([x, y, z]) => ({ x: cx + (f * x) / z, y: cy + (f * y) / z })) as Quad;
}

describe('homography', () => {
  it('maps the four source corners exactly onto the destination corners', () => {
    const src = quad([[10, 20], [400, 35], [380, 600], [5, 580]]);
    const dst = quad([[0, 0], [1240, 0], [1240, 1754], [0, 1754]]);
    const H = computeHomography(src, dst)!;
    src.forEach((p, i) => {
      const q = applyHomography(H, p);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
    const Hi = invert3(H)!;
    const back = applyHomography(Hi, applyHomography(H, { x: 200, y: 300 }));
    expect(back.x).toBeCloseTo(200, 6);
    expect(back.y).toBeCloseTo(300, 6);
  });

  it('returns null for degenerate input', () => {
    const src = quad([[0, 0], [1, 1], [2, 2], [3, 3]]);
    expect(computeHomography(src, quad([[0, 0], [1, 0], [1, 1], [0, 1]]))).toBeNull();
  });

  it('applies clockwise rotation through corner re-ordering', () => {
    const src = quad([[0, 0], [100, 0], [100, 200], [0, 200]]);
    // 90° cw: output is 200×100, output TL must come from source BL
    const H = outputToSourceHomography(src, 200, 100, 90)!;
    const tl = applyHomography(H, { x: 0, y: 0 });
    expect(tl.x).toBeCloseTo(0, 6);
    expect(tl.y).toBeCloseTo(200, 6);
    const tr = applyHomography(H, { x: 200, y: 0 });
    expect(tr.x).toBeCloseTo(0, 6);
    expect(tr.y).toBeCloseTo(0, 6);
    const H180 = outputToSourceHomography(src, 100, 200, 180)!;
    const p = applyHomography(H180, { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(200, 6);
  });
});

describe('quad helpers', () => {
  it('orders shuffled corners as TL, TR, BR, BL', () => {
    const q = orderQuad([{ x: 90, y: 110 }, { x: 10, y: 5 }, { x: 5, y: 100 }, { x: 100, y: 10 }]);
    expect(q).toEqual(quad([[10, 5], [100, 10], [90, 110], [5, 100]]));
  });
  it('validates convexity, size and angles', () => {
    expect(validateQuad(quad([[10, 10], [290, 20], [280, 390], [20, 380]]), 300, 400).valid).toBe(true);
    expect(isConvexQuad(quad([[0, 0], [100, 0], [20, 20], [0, 100]]))).toBe(false);
    expect(validateQuad(quad([[0, 0], [30, 0], [30, 30], [0, 30]]), 300, 400).reason).toBe('tooSmall');
    expect(validateQuad(quad([[0, 0], [150, 0], [300, 100], [150, 100]]), 300, 400).reason).toBe('badAngles');
  });
});

describe('aspect ratio estimation (perspective-aware)', () => {
  const cam = { f: 3000, cx: 1500, cy: 2000 };
  it.each([
    ['A4 tilted', 0.21, 0.297, { rx: 0.45, ry: 0.15, rz: 0.12, dist: 0.5 }],
    ['A4 strong tilt', 0.21, 0.297, { rx: 0.7, ry: -0.2, rz: -0.2, dist: 0.55, ox: 0.03 }],
    ['Letter tilted', 0.2159, 0.2794, { rx: -0.4, ry: 0.3, rz: 0.05, dist: 0.5 }],
    ['receipt', 0.08, 0.26, { rx: 0.5, ry: 0.1, rz: 0.3, dist: 0.4 }],
    ['fronto-parallel', 0.21, 0.297, { rx: 0, ry: 0, rz: 0.2, dist: 0.5 }],
  ])('%s within 2 %%', (_name, W, H, pose) => {
    const q = project(W as number, H as number, { ...cam, ...(pose as object) } as never);
    const est = estimateAspectRatio(q, 3000, 4000);
    expect(Math.abs(est / ((W as number) / (H as number)) - 1)).toBeLessThan(0.02);
  });
});

describe('page format', () => {
  it('snaps to A4 / Letter within ±4 % and keeps other ratios', () => {
    expect(resolvePageSize('auto', 0.7071).standard).toBe('a4');
    expect(resolvePageSize('auto', 0.7071 * 1.035).standard).toBe('a4');
    expect(resolvePageSize('auto', 0.775).standard).toBe('letter');
    expect(resolvePageSize('auto', 1 / 0.7071)).toEqual({ widthPt: A4_PT.height, heightPt: A4_PT.width, standard: 'a4' });
    const receipt = resolvePageSize('auto', 0.33);
    expect(receipt.standard).toBeNull();
    expect(receipt.heightPt).toBeCloseTo(841.89, 1);
    expect(receipt.widthPt / receipt.heightPt).toBeCloseTo(0.33, 3);
    expect(resolvePageSize('auto', 0.62).standard).toBeNull();
    expect(resolvePageSize('a4', 0.33)).toEqual({ widthPt: A4_PT.width, heightPt: A4_PT.height, standard: 'a4' });
    expect(resolvePageSize('letter', 1.3)).toEqual({ widthPt: LETTER_PT.height, heightPt: LETTER_PT.width, standard: 'letter' });
  });
  it('computes pixel sizes per DPI', () => {
    const a4 = resolvePageSize('a4', 0.7);
    expect(pagePixelSize(a4, 300)).toEqual({ width: 2480, height: 3508 });
    expect(pagePixelSize(a4, 200)).toEqual({ width: 1654, height: 2339 });
    expect(pagePixelSize(a4, 150)).toEqual({ width: 1240, height: 1754 });
  });
});
