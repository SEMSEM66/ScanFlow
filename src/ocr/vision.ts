import type { OcrBox, OcrLine, OcrWord } from './types';
import { readingOrder } from './text';

/**
 * Conversion of the native Apple Vision result (modules/scanflow-ocr) into
 * the app's OCR model. Pure, unit-tested.
 *
 * Vision boxes are normalized with the origin bottom-left; OcrBox uses the
 * origin top-left (like the renderer and the PDF builder's page model).
 */

/** [x, y, width, height], normalized, origin bottom-left. */
export type VisionRect = [number, number, number, number];

export interface VisionWord {
  text: string;
  box?: VisionRect | null;
}

export interface VisionLine {
  text: string;
  confidence: number;
  box: VisionRect;
  words?: VisionWord[] | null;
}

export interface VisionResult {
  width: number;
  height: number;
  languages?: string[];
  lines: VisionLine[];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Vision rect → OcrBox (origin top-left), clamped to the page; null if empty / invalid. */
export function boxFromVision(r: VisionRect | null | undefined): OcrBox | null {
  if (!Array.isArray(r) || r.length !== 4) return null;
  if (!r.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [vx, vy, vw, vh] = r;
  const x0 = clamp01(vx);
  const x1 = clamp01(vx + vw);
  const top = clamp01(1 - (vy + vh));
  const bottom = clamp01(1 - vy);
  if (x1 - x0 <= 0 || bottom - top <= 0) return null;
  return { x: r4(x0), y: r4(top), w: r4(x1 - x0), h: r4(bottom - top) };
}

/** Removes control, zero-width and soft-hyphen characters, collapses whitespace. */
export function cleanText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word boxes spread over the line box by character count (fallback). */
export function proportionalBoxes(tokens: string[], line: OcrBox): OcrBox[] {
  const lengths = tokens.map((t) => Math.max(1, Array.from(t).length));
  const total = lengths.reduce((a, b) => a + b, 0) + Math.max(0, tokens.length - 1);
  let pos = 0;
  return lengths.map((len) => {
    const box = { x: r4(line.x + (pos / total) * line.w), y: line.y, w: r4((len / total) * line.w), h: line.h };
    pos += len + 1;
    return box;
  });
}

/**
 * Native word boxes are used when they look sane: one per token, left to
 * right, and (for lines with several words) none spanning the whole line.
 */
function plausibleWordBoxes(boxes: (OcrBox | null)[], line: OcrBox): boolean {
  if (boxes.some((b) => !b)) return false;
  const bs = boxes as OcrBox[];
  if (bs.length > 1 && bs.some((b) => b.w > line.w * 0.9)) return false;
  const tol = line.h * 0.5;
  for (let i = 1; i < bs.length; i++) {
    if (bs[i].x + tol < bs[i - 1].x) return false;
  }
  return bs.every((b) => {
    const cy = b.y + b.h / 2;
    return cy >= line.y - tol && cy <= line.y + line.h + tol;
  });
}

/** Native result → lines in reading order (empty lines dropped). */
export function linesFromVision(result: VisionResult | null | undefined): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const raw of result?.lines ?? []) {
    if (!raw || typeof raw.text !== 'string') continue;
    const text = cleanText(raw.text);
    const box = boxFromVision(raw.box);
    if (!text || !box) continue;
    const tokens = text.split(' ');
    const native = (raw.words ?? [])
      .map((w) => ({ text: cleanText(typeof w?.text === 'string' ? w.text : ''), box: boxFromVision(w?.box ?? null) }))
      .filter((w) => w.text.length > 0);
    const fallback = proportionalBoxes(tokens, box);
    const useNative =
      native.length === tokens.length &&
      native.every((w, i) => w.text === tokens[i]) &&
      plausibleWordBoxes(
        native.map((w) => w.box),
        box
      );
    const words: OcrWord[] = tokens.map((t, i) => ({ text: t, box: useNative ? (native[i].box as OcrBox) : fallback[i] }));
    const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? clamp01(raw.confidence) : 0;
    lines.push({ text, confidence: r4(confidence), box, words });
  }
  return readingOrder(lines);
}
