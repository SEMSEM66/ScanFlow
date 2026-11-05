import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { drawTextLayer } from '../ocr/pdfTextLayer';
import type { OcrLine } from '../ocr/types';

/**
 * PDF builder on pdf-lib (pure JS, works in Expo Go / Hermes and Node).
 * One full-bleed JPEG per page at the exact page size in points, optionally
 * with an invisible OCR text layer (searchable PDF).
 */

export interface PdfPageInput {
  /** JPEG as base64 (no data: prefix) or bytes. */
  jpeg: string | Uint8Array;
  widthPt: number;
  heightPt: number;
  /** Recognized text of the page (normalized boxes) → invisible, searchable text layer. */
  text?: OcrLine[] | null;
}

/** Extra drawing hook on a finished page (after image and text layer, before the watermark). */
export interface PdfTextLayerContext {
  doc: PDFDocument;
  page: PDFPage;
  pageIndex: number;
  widthPt: number;
  heightPt: number;
}
export type PdfTextLayerHook = (ctx: PdfTextLayerContext) => Promise<void> | void;

export interface PdfBuildOptions {
  title: string;
  creationDate?: Date;
  /** Optional diagonal watermark text (e.g. "VERTRAULICH"). Latin-1 only. */
  watermark?: string;
  textLayer?: PdfTextLayerHook;
  onProgress?: (done: number, total: number) => void;
}

export const PDF_PRODUCER = 'ScanFlow';

/**
 * Builds the PDF page by page; `getPage` is awaited sequentially so only one
 * rendered page needs to exist outside pdf-lib at a time.
 */
export async function buildPdf(
  pageCount: number,
  getPage: (index: number) => Promise<PdfPageInput>,
  opts: PdfBuildOptions
): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const now = opts.creationDate ?? new Date();
  doc.setTitle(opts.title, { showInWindowTitleBar: true });
  doc.setProducer(PDF_PRODUCER);
  doc.setCreator(PDF_PRODUCER);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  const font = opts.watermark ? await doc.embedFont(StandardFonts.HelveticaBold) : null;
  let textFont: PDFFont | null = null;

  for (let i = 0; i < pageCount; i++) {
    const input = await getPage(i);
    const page = doc.addPage([input.widthPt, input.heightPt]);
    const img = await doc.embedJpg(input.jpeg);
    page.drawImage(img, { x: 0, y: 0, width: input.widthPt, height: input.heightPt });
    if (input.text && input.text.length > 0) {
      textFont ??= await doc.embedFont(StandardFonts.Helvetica);
      try {
        drawTextLayer(page, textFont, input.text, input.widthPt, input.heightPt);
      } catch (err) {
        // the page stays an image-only page
        console.warn('[pdf] text layer skipped on page', i + 1, err);
      }
    }
    if (opts.textLayer) {
      await opts.textLayer({ doc, page, pageIndex: i, widthPt: input.widthPt, heightPt: input.heightPt });
    }
    if (opts.watermark && font) drawWatermark(page, opts.watermark, font, input.widthPt, input.heightPt);
    opts.onProgress?.(i + 1, pageCount);
  }
  return doc;
}

function drawWatermark(
  page: PDFPage,
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  w: number,
  h: number
) {
  const size = Math.min(w, h) * 0.09;
  const tw = font.widthOfTextAtSize(text, size);
  const angle = Math.atan2(h, w);
  const cx = w / 2 - (Math.cos(angle) * tw) / 2 + (Math.sin(angle) * size) / 3;
  const cy = h / 2 - (Math.sin(angle) * tw) / 2 - (Math.cos(angle) * size) / 3;
  page.drawText(text, {
    x: cx,
    y: cy,
    size,
    font,
    color: rgb(0.86, 0.08, 0.24),
    opacity: 0.2,
    rotate: degrees((angle * 180) / Math.PI),
  });
}

/** JPEG quality (0–100) per export quality preset. */
export const JPEG_QUALITY = { low: 55, medium: 75, high: 90 } as const;

/**
 * Approximate size in KB of one dense text page (A4, Auto filter) per DPI and
 * quality. 150 dpi measured with the Skia JPEG encoder on the synthetic invoice
 * (__tests__/renderer.test.ts: 213 / 274 / 410 KB); 200 / 300 dpi scaled by
 * pixel count. Real pages with more white space are usually smaller.
 */
export const ESTIMATED_PAGE_KB: Record<number, Record<'low' | 'medium' | 'high', number>> = {
  150: { low: 215, medium: 275, high: 410 },
  200: { low: 380, medium: 490, high: 730 },
  300: { low: 850, medium: 1100, high: 1640 },
};

export function estimatePdfKb(pageCount: number, dpi: number, quality: 'low' | 'medium' | 'high'): number {
  const row = ESTIMATED_PAGE_KB[dpi] ?? ESTIMATED_PAGE_KB[200];
  return pageCount * row[quality] + 2;
}
