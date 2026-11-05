/// <reference types="node" />
import { beforeAll, describe, expect, it } from '@jest/globals';
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib';
import { buildPdf, estimatePdfKb, PDF_PRODUCER } from '../src/imaging/pdf';
import { A4_PT, LETTER_PT, pagePixelSize } from '../src/imaging/pageFormat';
import { PageRenderer } from '../src/imaging/renderer';
import { loadHeadlessSkia } from './helpers/skia';

let jpegA4: string;
let jpegLetter: string;
const DPI = 150;

beforeAll(async () => {
  const { Skia } = await loadHeadlessSkia();
  const r = new PageRenderer(Skia);
  const make = (w: number, h: number) => {
    const data = new Uint8Array(w * h * 4).fill(255);
    for (let y = 40; y < 60; y++) for (let x = 40; x < w - 40; x++) data.set([20, 20, 20, 255], (y * w + x) * 4);
    const img = r.imageFromRgba(data, w, h);
    const b64 = r.encodeJpeg(img, 75);
    img.dispose?.();
    return b64;
  };
  const a4 = pagePixelSize({ widthPt: A4_PT.width, heightPt: A4_PT.height, standard: 'a4' }, DPI);
  const lt = pagePixelSize({ widthPt: LETTER_PT.width, heightPt: LETTER_PT.height, standard: 'letter' }, DPI);
  jpegA4 = make(a4.width, a4.height);
  jpegLetter = make(lt.width, lt.height);
});

function imageXObjects(doc: PDFDocument) {
  const out: { width: number; height: number; filter: string }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
      out.push({
        width: (obj.dict.get(PDFName.of('Width')) as PDFNumber).asNumber(),
        height: (obj.dict.get(PDFName.of('Height')) as PDFNumber).asNumber(),
        filter: String(obj.dict.get(PDFName.of('Filter'))),
      });
    }
  }
  return out;
}

describe('PDF export (pdf-lib)', () => {
  it('one full-bleed JPEG per page at the exact page size, with metadata', async () => {
    const hookCalls: number[] = [];
    const progress: number[] = [];
    const doc = await buildPdf(
      2,
      async (i) =>
        i === 0
          ? { jpeg: jpegA4, widthPt: A4_PT.width, heightPt: A4_PT.height }
          : { jpeg: jpegLetter, widthPt: LETTER_PT.width, heightPt: LETTER_PT.height },
      {
        title: 'Rechnung März – Ä Ö Ü',
        creationDate: new Date('2025-01-02T03:04:05Z'),
        textLayer: ({ pageIndex }) => void hookCalls.push(pageIndex),
        onProgress: (d) => progress.push(d),
      }
    );
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(loaded.getPageCount()).toBe(2);
    const [p1, p2] = loaded.getPages();
    expect(p1.getMediaBox().width).toBeCloseTo(A4_PT.width, 2);
    expect(p1.getMediaBox().height).toBeCloseTo(A4_PT.height, 2);
    expect(p2.getMediaBox().width).toBeCloseTo(LETTER_PT.width, 2);
    expect(p2.getMediaBox().height).toBeCloseTo(LETTER_PT.height, 2);
    expect(loaded.getTitle()).toBe('Rechnung März – Ä Ö Ü');
    expect(loaded.getProducer()).toBe(PDF_PRODUCER);
    expect(loaded.getCreator()).toBe(PDF_PRODUCER);
    expect(loaded.getCreationDate()?.toISOString()).toBe('2025-01-02T03:04:05.000Z');
    const imgs = imageXObjects(loaded);
    expect(imgs).toHaveLength(2);
    expect(imgs.every((i) => i.filter === '/DCTDecode')).toBe(true);
    // pixel size / page size ⇒ effective DPI
    const a4img = imgs.find((i) => i.width < 1260 && i.width > 1230)!;
    expect((a4img.width / A4_PT.width) * 72).toBeCloseTo(DPI, 0);
    expect((a4img.height / A4_PT.height) * 72).toBeCloseTo(DPI, 0);
    // content stream draws the image over the full page
    const contents = p1.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const content = refs
      .map((r) => {
        const s = (r instanceof PDFRef ? loaded.context.lookup(r) : r) as PDFRawStream;
        return Buffer.from(decodePDFRawStream(s).decode()).toString('latin1');
      })
      .join('\n');
    expect(content).toMatch(new RegExp(`${A4_PT.width} 0 0 ${A4_PT.height} 0 0 cm`));
    expect(hookCalls).toEqual([0, 1]);
    expect(progress).toEqual([1, 2]);
  });

  it('adds a watermark without changing the page size', async () => {
    const doc = await buildPdf(1, async () => ({ jpeg: jpegA4, widthPt: A4_PT.width, heightPt: A4_PT.height }), {
      title: 'x',
      watermark: 'VERTRAULICH',
    });
    const loaded = await PDFDocument.load(await doc.save());
    expect(loaded.getPage(0).getMediaBox().width).toBeCloseTo(A4_PT.width, 2);
    const fonts = loaded.getPage(0).node.Resources()?.get(PDFName.of('Font'));
    expect(fonts).toBeTruthy();
  });

  it('size estimate scales with pages, DPI and quality', () => {
    expect(estimatePdfKb(2, 150, 'medium')).toBeGreaterThan(estimatePdfKb(1, 150, 'medium'));
    expect(estimatePdfKb(1, 300, 'medium')).toBeGreaterThan(estimatePdfKb(1, 200, 'medium'));
    expect(estimatePdfKb(1, 200, 'high')).toBeGreaterThan(estimatePdfKb(1, 200, 'low'));
  });
});
