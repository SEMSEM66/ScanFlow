import {
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib';
import type { OcrBox, OcrLine } from './types';

/**
 * Invisible OCR text layer ("searchable PDF"): every recognized word is drawn
 * with text render mode 3 (neither filled nor stroked) exactly over its box
 * in the page image – font size from the box height, horizontal scaling (Tz)
 * from the box width. PDF viewers can then search, select and copy the text.
 */

/** Close ASCII fallbacks for letters outside WinAnsi (pdf-lib standard fonts). */
const FALLBACK: Record<string, string> = {
  ł: 'l', Ł: 'L', ś: 's', Ś: 'S', ź: 'z', Ź: 'Z', ż: 'z', Ż: 'Z', ć: 'c', Ć: 'C', ń: 'n', Ń: 'N',
  ę: 'e', Ę: 'E', ą: 'a', Ą: 'A', č: 'c', Č: 'C', ř: 'r', Ř: 'R', ě: 'e', Ě: 'E', ů: 'u', Ů: 'U',
  ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ş: 's', Ş: 'S', ș: 's', Ș: 'S', ț: 't', Ț: 'T', ő: 'o', Ő: 'O',
  ű: 'u', Ű: 'U', ď: 'd', Ď: 'D', ť: 't', Ť: 'T', ň: 'n', Ň: 'N', ĺ: 'l', Ĺ: 'L', ľ: 'l', Ľ: 'L',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2212': '-', '\u00a0': ' ', '\u202f': ' ',
};

const charsets = new WeakMap<PDFFont, Set<number>>();
function charsetOf(font: PDFFont): Set<number> {
  let set = charsets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsets.set(font, set);
  }
  return set;
}

/** Text restricted to characters the font can encode (fallback letter or '?'). */
export function encodableText(text: string, font: PDFFont): string {
  const set = charsetOf(font);
  let out = '';
  for (const c of text) {
    const cp = c.codePointAt(0) as number;
    if (set.has(cp)) out += c;
    else {
      const f = FALLBACK[c];
      out += f !== undefined && Array.from(f).every((x) => set.has(x.codePointAt(0) as number)) ? f : '?';
    }
  }
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function clampBox(b: OcrBox): OcrBox {
  const x = clamp(b.x, 0, 1);
  const y = clamp(b.y, 0, 1);
  return { x, y, w: clamp(b.w, 0, 1 - x), h: clamp(b.h, 0, 1 - y) };
}

/** Advance width at size 1, without kerning (Tj does not kern). */
function widthAt1(font: PDFFont, text: string, cache: Map<string, number>): number {
  let w = 0;
  for (const c of text) {
    let cw = cache.get(c);
    if (cw === undefined) {
      cw = font.widthOfTextAtSize(c, 1);
      cache.set(c, cw);
    }
    w += cw;
  }
  return w;
}

/**
 * Draws the invisible text of `lines` (normalized, origin top-left) onto a
 * page of widthPt × heightPt. Returns the number of words drawn.
 */
export function drawTextLayer(page: PDFPage, font: PDFFont, lines: OcrLine[], widthPt: number, heightPt: number): number {
  if (lines.length === 0) return 0;
  const fullHeight = font.heightAtSize(1, { descender: true }); // ascent + descent (Helvetica 0.925)
  const descent = fullHeight - font.heightAtSize(1, { descender: false }); // Helvetica 0.207
  const widths = new Map<string, number>();
  const ops: PDFOperator[] = [];
  let words = 0;
  for (const line of lines) {
    line.words.forEach((word, i) => {
      const text = encodableText(word.text, font);
      if (!text.trim()) return;
      const box = clampBox(word.box);
      const wPt = box.w * widthPt;
      const hPt = box.h * heightPt;
      if (wPt < 0.5 || hPt < 0.5) return;
      const size = hPt / fullHeight;
      const natural = widthAt1(font, text, widths) * size;
      if (natural <= 0) return;
      const scale = clamp((100 * wPt) / natural, 5, 1000);
      const x = box.x * widthPt;
      const baseline = heightPt - (box.y + box.h) * heightPt + descent * size;
      // a trailing space keeps words apart when the text is copied (it lies in the gap to the next word)
      const shown = i < line.words.length - 1 ? `${text} ` : text;
      ops.push(
        setFontAndSize(fontKeyOf(page, font), round2(size)),
        setCharacterSqueeze(round2(scale)),
        setTextMatrix(1, 0, 0, 1, round2(x), round2(baseline)),
        showText(font.encodeText(shown))
      );
      words++;
    });
  }
  if (words === 0) return 0;
  page.pushOperators(pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible), ...ops, endText(), popGraphicsState());
  return words;
}

const fontKeys = new WeakMap<PDFPage, { font: PDFFont; key: ReturnType<PDFPage['node']['newFontDictionary']> }>();
/** One font resource entry per page. */
function fontKeyOf(page: PDFPage, font: PDFFont) {
  const hit = fontKeys.get(page);
  if (hit && hit.font === font) return hit.key;
  const key = page.node.newFontDictionary(font.name, font.ref);
  fontKeys.set(page, { font, key });
  return key;
}
