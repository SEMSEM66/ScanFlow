/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  base64ToUint8,
  buildDocx,
  buildDocxBase64,
  buildZip,
  crc32,
  escapeXml,
  extractPdfTextFromBytes,
  reconstructPageBlocks,
  uint8ToBase64,
  utf8Encode,
} from '../src/docx';
import { buildPdf } from '../src/imaging/pdf';
import { A4_PT } from '../src/imaging/pageFormat';
import type { OcrLine } from '../src/ocr/types';

// 8×8 white JPEG for searchable PDF test
const WHITE_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AQH//2Q==';

/** Reads stored (method 0) entries out of a ZIP byte array for verification. */
function readZipEntries(zip: Uint8Array): Map<string, string> {
  const entries = new Map<string, string>();
  let pos = 0;
  const u16 = (o: number) => zip[o] | (zip[o + 1] << 8);
  const u32 = (o: number) =>
    (zip[o] | (zip[o + 1] << 8) | (zip[o + 2] << 16) | (zip[o + 3] << 24)) >>> 0;

  while (pos + 4 <= zip.length) {
    const sig = u32(pos);
    if (sig !== 0x04034b50) break;
    const compSize = u32(pos + 18);
    const nameLen = u16(pos + 26);
    const extraLen = u16(pos + 28);
    const nameStart = pos + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const name = Buffer.from(zip.subarray(nameStart, nameStart + nameLen)).toString('utf8');
    const content = Buffer.from(zip.subarray(dataStart, dataStart + compSize)).toString('utf8');
    entries.set(name, content);
    pos = dataStart + compSize;
  }
  return entries;
}

describe('ZIP & Base64 helpers (src/docx/zip.ts)', () => {
  it('computes standard IEEE 802.3 CRC-32 and round-trips Base64 for all byte lengths', () => {
    expect(crc32(utf8Encode('123456789'))).toBe(0xcbf43926);
    for (let len = 0; len <= 35; len++) {
      const input = new Uint8Array(len);
      for (let i = 0; i < len; i++) input[i] = (i * 37 + 11) & 0xff;
      const b64 = uint8ToBase64(input);
      expect(b64).toBe(Buffer.from(input).toString('base64'));
      expect(base64ToUint8(b64)).toEqual(input);
    }
  });

  it('builds a valid ZIP container with local headers, central directory and EOCD', () => {
    const zip = buildZip([
      { name: 'hello.txt', data: 'Größe 12 €' },
      { name: 'sub/data.xml', data: '<root/>' },
    ]);
    // Local header PK\x03\x04
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    // EOCD at the end PK\x05\x06
    const eocd = zip.length - 22;
    expect(zip[eocd]).toBe(0x50);
    expect(zip[eocd + 1]).toBe(0x4b);
    expect(zip[eocd + 2]).toBe(0x05);
    expect(zip[eocd + 3]).toBe(0x06);

    const parsed = readZipEntries(zip);
    expect(parsed.get('hello.txt')).toBe('Größe 12 €');
    expect(parsed.get('sub/data.xml')).toBe('<root/>');
  });
});

describe('DOCX layout reconstruction & OpenXML builder (src/docx/docxBuilder.ts)', () => {
  it('escapes XML special characters and strips invalid control chars', () => {
    expect(escapeXml('A & B < C > "D" \'E\'\u0000\u0007')).toBe(
      'A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;'
    );
  });

  it('detects headings, merges wrapped body lines, joins hyphenated words and splits paragraphs', () => {
    const lines: OcrLine[] = [
      {
        text: 'Mietvertrag',
        confidence: 0.99,
        box: { x: 0.1, y: 0.08, w: 0.35, h: 0.04 },
        words: [{ text: 'Mietvertrag', box: { x: 0.1, y: 0.08, w: 0.35, h: 0.04 } }],
      },
      {
        text: 'Zwischen dem Vermieter und der Rechnungs-',
        confidence: 0.96,
        box: { x: 0.1, y: 0.16, w: 0.78, h: 0.02 },
        words: [],
      },
      {
        text: 'stelle wird folgender Vertrag geschlossen.',
        confidence: 0.96,
        box: { x: 0.1, y: 0.185, w: 0.65, h: 0.02 },
        words: [],
      },
      {
        text: 'Der Mietzins beträgt monatlich 850 €.',
        confidence: 0.97,
        box: { x: 0.1, y: 0.25, w: 0.62, h: 0.02 },
        words: [],
      },
    ];

    const blocks = reconstructPageBlocks({ pageNumber: 1, lines });
    expect(blocks).toEqual([
      { style: 'Heading1', text: 'Mietvertrag' },
      {
        style: 'Normal',
        text: 'Zwischen dem Vermieter und der Rechnungsstelle wird folgender Vertrag geschlossen.',
      },
      { style: 'Normal', text: 'Der Mietzins beträgt monatlich 850 €.' },
    ]);
  });

  it('builds a complete OpenXML .docx archive with styles, metadata and page breaks', () => {
    const docxBytes = buildDocx({
      title: 'Quartalsbericht & Analyse',
      pages: [
        {
          pageNumber: 1,
          text: 'Quartalsbericht 2026\n\nDies ist der erste Absatz auf Seite 1.\nEr geht über zwei Zeilen.',
        },
        {
          pageNumber: 2,
          text: 'Zweite Seite mit weiteren Details.',
        },
      ],
    });

    const entries = readZipEntries(docxBytes);
    expect([...entries.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'word/_rels/document.xml.rels',
      'word/styles.xml',
      'word/document.xml',
    ]);

    const coreXml = entries.get('docProps/core.xml')!;
    expect(coreXml).toContain('<dc:title>Quartalsbericht &amp; Analyse</dc:title>');

    const docXml = entries.get('word/document.xml')!;
    expect(docXml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(docXml).toContain('Quartalsbericht 2026');
    expect(docXml).toContain('Dies ist der erste Absatz auf Seite 1. Er geht über zwei Zeilen.');
    expect(docXml).toContain('<w:br w:type="page"/>');
    expect(docXml).toContain('Zweite Seite mit weiteren Details.');

    const b64 = buildDocxBase64({ title: 'Test', pages: [{ text: 'Hallo Welt' }] });
    expect(b64.startsWith('UEsDB')).toBe(true); // Base64 of "PK\x03\x04"
  });
});

describe('Pure-TS PDF text extractor & PDF-to-Word round-trip (src/docx/pdfTextExtractor.ts)', () => {
  it('extracts text and layout lines from a digital PDF created with pdf-lib', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page1 = pdf.addPage([A4_PT.width, A4_PT.height]);
    page1.drawText('Projektauftrag 2026', { x: 50, y: 760, size: 22, font });
    page1.drawText('Die Lieferung erfolgt frei Haus.', { x: 50, y: 700, size: 12, font });

    const page2 = pdf.addPage([A4_PT.width, A4_PT.height]);
    page2.drawText('Anhang A: Preisliste', { x: 50, y: 760, size: 16, font });

    const bytes = await pdf.save();
    const extracted = await extractPdfTextFromBytes(bytes);

    expect(extracted).toHaveLength(2);
    expect(extracted[0].text).toContain('Projektauftrag 2026');
    expect(extracted[0].text).toContain('Die Lieferung erfolgt frei Haus.');
    expect(extracted[1].text).toContain('Anhang A: Preisliste');
  });

  it('extracts the invisible OCR text layer from a ScanFlow searchable PDF and converts it to .docx', async () => {
    const ocrLines: OcrLine[] = [
      {
        text: 'Rechnung Nr. 2026-42',
        confidence: 0.99,
        box: { x: 0.1, y: 0.1, w: 0.5, h: 0.035 },
        words: [
          { text: 'Rechnung', box: { x: 0.1, y: 0.1, w: 0.22, h: 0.035 } },
          { text: 'Nr.', box: { x: 0.34, y: 0.1, w: 0.07, h: 0.035 } },
          { text: '2026-42', box: { x: 0.43, y: 0.1, w: 0.17, h: 0.035 } },
        ],
      },
      {
        text: 'Betrag: 120 € inklusive MwSt.',
        confidence: 0.95,
        box: { x: 0.1, y: 0.22, w: 0.55, h: 0.02 },
        words: [
          { text: 'Betrag:', box: { x: 0.1, y: 0.22, w: 0.12, h: 0.02 } },
          { text: '120', box: { x: 0.24, y: 0.22, w: 0.06, h: 0.02 } },
          { text: '€', box: { x: 0.32, y: 0.22, w: 0.03, h: 0.02 } },
          { text: 'inklusive', box: { x: 0.37, y: 0.22, w: 0.15, h: 0.02 } },
          { text: 'MwSt.', box: { x: 0.54, y: 0.22, w: 0.11, h: 0.02 } },
        ],
      },
    ];

    const pdfDoc = await buildPdf(
      1,
      async () => ({
        jpeg: WHITE_JPEG,
        widthPt: A4_PT.width,
        heightPt: A4_PT.height,
        text: ocrLines,
      }),
      { title: 'Rechnung' }
    );
    const pdfBytes = await pdfDoc.save();

    const extractedPages = await extractPdfTextFromBytes(pdfBytes);
    expect(extractedPages).toHaveLength(1);
    expect(extractedPages[0].text).toContain('Rechnung Nr. 2026-42');
    expect(extractedPages[0].text).toContain('Betrag: 120 € inklusive MwSt.');

    const docxBytes = buildDocx({
      title: 'Rechnung',
      pages: extractedPages,
    });
    const docxXml = readZipEntries(docxBytes).get('word/document.xml')!;
    expect(docxXml).toContain('Rechnung Nr. 2026-42');
    expect(docxXml).toContain('Betrag: 120 € inklusive MwSt.');
  });
});
