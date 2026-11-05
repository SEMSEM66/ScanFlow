import { describe, expect, it } from '@jest/globals';
import { detectDocument, FALLBACK_INSET } from '../src/imaging/edgeDetection';
import type { Quad } from '../src/imaging/types';
import { boxDownscale, cornerError, makeFlatPage, photograph, PhotoOptions } from './helpers/synthetic';

const page = makeFlatPage(620, 877, 3); // 75 dpi is plenty for 300 px detection
const FW = 600;
const FH = 800;
const q = (pts: number[][]): Quad => pts.map(([x, y]) => ({ x, y })) as Quad;
const norm = (c: Quad): Quad => c.map((p) => ({ x: p.x / FW, y: p.y / FH })) as Quad;

function run(o: Omit<PhotoOptions, 'frameWidth' | 'frameHeight'>) {
  const photo = photograph(page, { frameWidth: FW, frameHeight: FH, ...o });
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
