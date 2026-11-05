/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, type PDFPage } from 'pdf-lib';
import { buildPdf } from '../src/imaging/pdf';
import { A4_PT } from '../src/imaging/pageFormat';
import { drawTextLayer, encodableText } from '../src/ocr/pdfTextLayer';
import type { OcrLine } from '../src/ocr/types';

/* eslint-disable @typescript-eslint/no-require-imports */

// 8×8 white JPEG – the page image does not matter for the text layer
const JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AQH//2Q==';

const W = A4_PT.width;
const H = A4_PT.height;

const LINES: OcrLine[] = [
  {
    text: 'Rechnung Nr. 2024-17',
    confidence: 0.98,
    box: { x: 0.1, y: 0.1, w: 0.5, h: 0.025 },
    words: [
      { text: 'Rechnung', box: { x: 0.1, y: 0.1, w: 0.22, h: 0.025 } },
      { text: 'Nr.', box: { x: 0.34, y: 0.1, w: 0.07, h: 0.025 } },
      { text: '2024-17', box: { x: 0.43, y: 0.1, w: 0.17, h: 0.025 } },
    ],
  },
  {
    text: 'Größe: 12 € – Łódź',
    confidence: 0.9,
    box: { x: 0.1, y: 0.5, w: 0.6, h: 0.02 },
    words: [
      { text: 'Größe:', box: { x: 0.1, y: 0.5, w: 0.14, h: 0.02 } },
      { text: '12', box: { x: 0.26, y: 0.5, w: 0.05, h: 0.02 } },
      { text: '€', box: { x: 0.33, y: 0.5, w: 0.03, h: 0.02 } },
      { text: '–', box: { x: 0.38, y: 0.5, w: 0.03, h: 0.02 } },
      { text: 'Łódź', box: { x: 0.43, y: 0.5, w: 0.12, h: 0.02 } },
    ],
  },
];

async function pageContent(page: PDFPage): Promise<string> {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
}

/** Number of font resources of a page. */
function fontCount(page: PDFPage): number {
  const fonts = page.node.Resources()?.lookup(PDFName.of('Font'));
  return fonts instanceof PDFDict ? fonts.keys().length : 0;
}

async function build(text: OcrLine[] | null): Promise<Uint8Array> {
  const doc = await buildPdf(1, async () => ({ jpeg: JPEG, widthPt: W, heightPt: H, text }), {
    title: 'Test',
    creationDate: new Date('2025-01-02T03:04:05Z'),
  });
  return doc.save();
}

function pdftotextAvailable(): boolean {
  try {
    require('node:child_process').execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('invisible OCR text layer (searchable PDF)', () => {
  it('draws the words with render mode 3 inside one text object', async () => {
    const doc = await PDFDocument.load(await build(LINES));
    const content = await pageContent(doc.getPage(0));
    expect(content).toMatch(/\bBT\b[\s\S]*\b3 Tr\b[\s\S]*\bET\b/);
    expect((content.match(/\bTj\b/g) ?? []).length).toBe(8);
    expect((content.match(/\bTz\b/g) ?? []).length).toBe(8);
    expect((content.match(/\bTm\b/g) ?? []).length).toBe(8);
    // one font resource for the whole page
    expect(fontCount(doc.getPage(0))).toBe(1);
  });

  it('leaves pages without text untouched (no font, no text object)', async () => {
    for (const text of [null, []]) {
      const doc = await PDFDocument.load(await build(text));
      const content = await pageContent(doc.getPage(0));
      expect(content).not.toMatch(/\bBT\b/);
      expect(fontCount(doc.getPage(0))).toBe(0);
    }
  });

  it('skips words with unusable boxes', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([W, H]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const words = drawTextLayer(
      page,
      font,
      [
        {
          text: 'a b c',
          confidence: 1,
          box: { x: 0, y: 0, w: 1, h: 0.02 },
          words: [
            { text: 'a', box: { x: 0.1, y: 0.1, w: 0, h: 0.02 } },
            { text: ' ', box: { x: 0.2, y: 0.1, w: 0.1, h: 0.02 } },
            { text: 'c', box: { x: 0.3, y: 0.1, w: 0.05, h: 0.02 } },
          ],
        },
      ],
      W,
      H
    );
    expect(words).toBe(1);
    expect(drawTextLayer(page, font, [], W, H)).toBe(0);
  });

  it('maps characters outside WinAnsi to close fallbacks', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(encodableText('Größe € – „ok“', font)).toBe('Größe € – „ok“');
    expect(encodableText('Łódź Kraków', font)).toBe('Lódz Kraków');
    expect(encodableText('ab✓→', font)).toBe('ab??');
  });

  const maybe = pdftotextAvailable() ? it : it.skip;
  maybe('is found by a PDF reader at the right positions (pdftotext)', async () => {
    const { execFileSync } = require('node:child_process');
    const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { tmpdir } = require('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'scanflow-ocr-'));
    const file = join(dir, 'layer.pdf');
    writeFileSync(file, await build(LINES));

    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' }) as string;
    expect(text).toContain('Rechnung Nr. 2024-17');
    expect(text).toContain('Größe: 12 € – Lódz');

    execFileSync('pdftotext', ['-bbox', '-enc', 'UTF-8', file, join(dir, 'bbox.html')]);
    const html = readFileSync(join(dir, 'bbox.html'), 'utf8') as string;
    const boxes = [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
      (m) => ({ text: m[5], x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] })
    );
    const expected = LINES.flatMap((l) => l.words);
    expect(boxes).toHaveLength(expected.length);
    boxes.forEach((b, i) => {
      const e = expected[i].box;
      // horizontal extent: Tz scales the word to its box
      expect(Math.abs(b.x0 - e.x * W)).toBeLessThan(1);
      expect(Math.abs(b.x1 - (e.x + e.w) * W)).toBeLessThan(2);
      // vertical extent: font size from the box height (Helvetica ascent + descent)
      expect(Math.abs(b.y0 - e.y * H)).toBeLessThan(2.5);
      expect(Math.abs(b.y1 - (e.y + e.h) * H)).toBeLessThan(2.5);
    });
  });
});
