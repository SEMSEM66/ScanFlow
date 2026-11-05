/**
 * OCR data model (pure, no React Native imports).
 *
 * Coordinates are normalized to the rendered page (0…1), origin top-left –
 * the same page geometry as the exported PDF page (crop, perspective,
 * rotation and page format applied; filter and adjustments do not matter).
 */

/** Axis-aligned box, normalized, origin top-left. */
export interface OcrBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrWord {
  text: string;
  box: OcrBox;
}

export interface OcrLine {
  text: string;
  /** 0…1 as reported by the engine. */
  confidence: number;
  box: OcrBox;
  words: OcrWord[];
}

/** Stored recognition result of one page. */
export interface PageTextRecord {
  pageId: string;
  /** ocrKey() of the page state the text was recognized on. */
  key: string;
  engine: string;
  languages: string[];
  /** Plain text, one recognized line per row (as printed, hyphens kept). */
  text: string;
  lines: OcrLine[];
  createdAt: number;
}
