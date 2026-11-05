/// <reference types="node" />
/**
 * Optional: writes before/after sample images and a sample PDF for visual
 * review. Skipped unless SCANFLOW_SAMPLES_DIR is set, e.g. (PowerShell):
 *   $env:SCANFLOW_SAMPLES_DIR = "samples"; npx jest __tests__/samples.test.ts
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { loadHeadlessSkia } from './helpers/skia';
import { makeFlatPage, photograph } from './helpers/synthetic';
import { PageRenderer } from '../src/imaging/renderer';
import { detectDocument } from '../src/imaging/edgeDetection';
import { buildPdf, JPEG_QUALITY } from '../src/imaging/pdf';
import { FILTER_ORDER } from '../src/imaging/filters';
import type { Quad } from '../src/imaging/types';

const OUT = process.env.SCANFLOW_SAMPLES_DIR;
const d = OUT ? describe : describe.skip;

d('sample renders', () => {
  it('writes photo, detection, all filters and a PDF', async () => {
    const dir = path.resolve(OUT as string);
    fs.mkdirSync(dir, { recursive: true });
    const { Skia } = await loadHeadlessSkia();
    const r = new PageRenderer(Skia);
    const FW = 900;
    const FH = 1200;
    const page = makeFlatPage(1240, 1754, 11);
    const corners = [[150, 120], [770, 150], [810, 1090], [110, 1060]].map(([x, y]) => ({ x, y })) as Quad;
    const photo = photograph(page, { frameWidth: FW, frameHeight: FH, corners, background: 'wood', gradient: 0.4, shadow: 0.5, noise: 0.02 });
    const src = r.imageFromRgba(photo.data, FW, FH);
    fs.writeFileSync(path.join(dir, '00-photo.jpg'), Buffer.from(r.encodeJpeg(src, 90), 'base64'));

    const small = r.downscale(src, 300);
    const det = detectDocument(r.readRgba(small));
    expect(det.detected).toBe(true);

    for (const f of FILTER_ORDER) {
      const res = r.render(src, { corners: det.corners, rotation: 0, filter: f, pageFormat: 'auto', dpi: 150 });
      fs.writeFileSync(path.join(dir, `${String(FILTER_ORDER.indexOf(f) + 1).padStart(2, '0')}-${f}.jpg`), Buffer.from(r.encodeJpeg(res.image, 85), 'base64'));
      res.image.dispose?.();
    }

    const doc = await buildPdf(
      2,
      async (i) => {
        const res = r.render(src, { corners: det.corners, rotation: 0, filter: i === 0 ? 'auto' : 'blackAndWhite', pageFormat: 'a4', dpi: 200 });
        const jpeg = r.encodeJpeg(res.image, JPEG_QUALITY.medium);
        res.image.dispose?.();
        return { jpeg, widthPt: res.page.widthPt, heightPt: res.page.heightPt };
      },
      { title: 'ScanFlow Beispiel', watermark: 'VERTRAULICH' }
    );
    fs.writeFileSync(path.join(dir, 'sample.pdf'), await doc.save());
    fs.writeFileSync(path.join(dir, 'detection.json'), JSON.stringify({ detected: det, truth: corners.map((p) => ({ x: p.x / FW, y: p.y / FH })) }, null, 2));
  });
});
