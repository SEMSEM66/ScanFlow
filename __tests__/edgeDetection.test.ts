import { describe, expect, it } from '@jest/globals';
import { detectDocument, FALLBACK_INSET } from '../src/imaging/edgeDetection';
import type { Quad } from '../src/imaging/types';
import { boxDownscale, cornerError, makeFlatPage, paintRect, photograph, PhotoOptions, type FlatPage } from './helpers/synthetic';

const page = makeFlatPage(620, 877, 3); // 75 dpi is plenty for 300 px detection
const FW = 600;
const FH = 800;
const q = (pts: number[][]): Quad => pts.map(([x, y]) => ({ x, y })) as Quad;
const norm = (c: Quad): Quad => c.map((p) => ({ x: p.x / FW, y: p.y / FH })) as Quad;

// page with a dark blue header bar across the top (part of the document)
const headerPage: FlatPage = makeFlatPage(620, 877, 5);
paintRect(headerPage, 0, 0, 620, 70, [0.1, 0.17, 0.36]);
// page with a printed frame line close to the paper edge
const framedPage: FlatPage = makeFlatPage(620, 877, 6);
for (const [x, y, w, h] of [
  [22, 22, 576, 3],
  [22, 852, 576, 3],
  [22, 22, 3, 833],
  [595, 22, 3, 833],
]) paintRect(framedPage, x, y, w, h, [0.15, 0.15, 0.16]);

function run(o: Omit<PhotoOptions, 'frameWidth' | 'frameHeight'>, p: FlatPage = page) {
  const photo = photograph(p, { frameWidth: FW, frameHeight: FH, ...o });
  const small = boxDownscale(photo, 2); // 300×400, like the app's detection input
  const t0 = Date.now();
  const res = detectDocument(small);
  return { res, ms: Date.now() - t0 };
}

describe('detectDocument', () => {
  const cases: [string, Omit<PhotoOptions, 'frameWidth' | 'frameHeight'>][] = [
    ['dark table, mild perspective', { corners: q([[110, 95], [505, 120], [530, 710], [80, 690]]), background: 'dark' }],
    ['wood table + shadow', { corners: q([[130, 90], [510, 120], [540, 700], [70, 680]]), background: 'wood', shadow: 0.45 }],
    ['light table (low contrast) + gradient', { corners: q([[95, 80], [500, 100], [520, 720], [85, 705]]), background: 'light', gradient: 0.4 }],
    ['strong perspective + rotation', { corners: q([[190, 70], [470, 140], [560, 740], [40, 610]]), background: 'wood' }],
    ['with bright distractor on table', { corners: q([[150, 160], [520, 175], [530, 740], [140, 725]]), background: 'dark', distractor: { x: 20, y: 20, w: 120, h: 90 } }],
  ];

  it.each(cases)('%s → corners within 2 %% of the frame', (_name, opts) => {
    const { res, ms } = run(opts);
    expect(res.detected).toBe(true);
    const err = cornerError(res.corners, norm(opts.corners));
    expect(err).toBeLessThan(0.02);
    expect(ms).toBeLessThan(1500);
  });

  // Scenes the line-based detector must not get wrong: inner lines that look
  // like page edges (header bar boundary, printed frame) and a sheet lying on
  // a larger light object (the reference scanners pick the sheet).
  const hard: [string, Omit<PhotoOptions, 'frameWidth' | 'frameHeight'>, FlatPage][] = [
    ['dark header bar is part of the page', { corners: q([[120, 100], [500, 110], [525, 705], [95, 690]]), background: 'wood' }, headerPage],
    ['printed frame near the paper edge', { corners: q([[105, 90], [495, 105], [520, 700], [90, 690]]), background: 'dark' }, framedPage],
    [
      'sheet on a light binder → the sheet',
      {
        corners: q([[110, 110], [470, 120], [480, 640], [100, 630]]),
        background: 'wood',
        underlay: { corners: q([[80, 80], [540, 90], [560, 720], [70, 705]]), color: [0.7, 0.72, 0.76] },
      },
      page,
    ],
  ];

  it.each(hard)('%s', (_name, opts, p) => {
    const { res } = run(opts, p);
    expect(res.detected).toBe(true);
    expect(cornerError(res.corners, norm(opts.corners))).toBeLessThan(0.02);
  });

  it('falls back to an inset rectangle on a blank image', () => {
    const blank = { width: 300, height: 400, data: new Uint8Array(300 * 400 * 4).fill(200) };
    const res = detectDocument(blank);
    expect(res.detected).toBe(false);
    expect(res.method).toBe('fallback');
    expect(res.corners[0].x).toBeCloseTo(FALLBACK_INSET);
  });

  it('never returns corners outside the image when the page is cut off', () => {
    const { res } = run({ corners: q([[-60, 60], [520, 80], [540, 760], [-40, 740]]), background: 'dark' });
    res.corners.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    });
  });
});
