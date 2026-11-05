import type { ExportDpi, PageFormat, PageSize, Rotation } from './types';

export const PT_PER_INCH = 72;
export const A4_PT = { width: 595.28, height: 841.89 };
export const LETTER_PT = { width: 612, height: 792 };
/** Auto mode snaps to a standard size when the ratio is within ±4 %. */
export const SNAP_TOLERANCE = 0.04;

export const EXPORT_DPI_PRESETS: ExportDpi[] = [150, 200, 300];

const ratioOf = (s: { width: number; height: number }) => s.width / s.height;

/**
 * Page size in PDF points for a page whose real-world aspect ratio
 * (width / height, after rotation) is `aspect`.
 *  - 'a4' / 'letter': forced, orientation follows the aspect ratio.
 *  - 'auto': snaps to A4 or Letter when within ±4 %, otherwise keeps the
 *    detected ratio (receipts, cards) and fits the page into an A4 box.
 */
export function resolvePageSize(format: PageFormat, aspect: number): PageSize {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : ratioOf(A4_PT);
  const landscape = safe > 1;
  const orient = (s: { width: number; height: number }) =>
    landscape ? { widthPt: s.height, heightPt: s.width } : { widthPt: s.width, heightPt: s.height };

  if (format === 'a4') return { ...orient(A4_PT), standard: 'a4' };
  if (format === 'letter') return { ...orient(LETTER_PT), standard: 'letter' };

  const portraitRatio = landscape ? 1 / safe : safe;
  const a4Dev = Math.abs(portraitRatio / ratioOf(A4_PT) - 1);
  const letterDev = Math.abs(portraitRatio / ratioOf(LETTER_PT) - 1);
  if (a4Dev <= SNAP_TOLERANCE && a4Dev <= letterDev) return { ...orient(A4_PT), standard: 'a4' };
  if (letterDev <= SNAP_TOLERANCE) return { ...orient(LETTER_PT), standard: 'letter' };

  // Custom ratio: fit into the A4 box of the same orientation.
  const box = landscape ? { w: A4_PT.height, h: A4_PT.width } : { w: A4_PT.width, h: A4_PT.height };
  const scale = Math.min(box.w / safe, box.h);
  return { widthPt: round2(safe * scale), heightPt: round2(scale), standard: null };
}

export function rotatedAspect(aspect: number, rotation: Rotation): number {
  return rotation === 90 || rotation === 270 ? 1 / aspect : aspect;
}

/** Pixel dimensions of a page at a given DPI. */
export function pagePixelSize(page: PageSize, dpi: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round((page.widthPt / PT_PER_INCH) * dpi)),
    height: Math.max(1, Math.round((page.heightPt / PT_PER_INCH) * dpi)),
  };
}

/** DPI so that the long side of the page is at most `maxLongSide` pixels. */
export function dpiForMaxLongSide(page: PageSize, maxLongSide: number, maxDpi: number): number {
  const longIn = Math.max(page.widthPt, page.heightPt) / PT_PER_INCH;
  return Math.min(maxDpi, maxLongSide / longIn);
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
