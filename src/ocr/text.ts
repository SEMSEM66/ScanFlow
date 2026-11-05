import { fnv1a, serializeCorners } from '../imaging/pageState';
import type { Quad, Rotation } from '../imaging/types';
import type { OcrBox, OcrLine, OcrWord } from './types';

/**
 * Pure text helpers for OCR results: plain text, search normalization,
 * snippets, (de)serialization and the staleness key. Unit-tested
 * (__tests__/ocr.test.ts).
 */

/** Bump when the recognition setup changes so all pages are recognized again. */
export const OCR_VERSION = 1;

/** What the recognized text depends on (filter / adjustments / page format do not change text or normalized positions). */
export interface OcrSourceState {
  originalUri: string;
  corners: Quad | null;
  rotation: Rotation;
}

/** Staleness key of a page's text: changes with retake, crop or rotation. */
export function ocrKey(s: OcrSourceState): string {
  return fnv1a(JSON.stringify([OCR_VERSION, s.originalUri, serializeCorners(s.corners), s.rotation]));
}

// ── Plain text ────────────────────────────────────────────────────────

/**
 * Groups lines into visual rows (vertical centre inside the first line of the
 * row), rows top to bottom, lines in a row left to right.
 */
export function groupRows(lines: OcrLine[]): OcrLine[][] {
  const sorted = [...lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    const ref = row?.[0];
    const cy = line.box.y + line.box.h / 2;
    if (ref && cy >= ref.box.y && cy <= ref.box.y + ref.box.h) row.push(line);
    else rows.push([line]);
  }
  for (const row of rows) row.sort((a, b) => a.box.x - b.box.x);
  return rows;
}

/** Reading order used everywhere (text, copy, PDF layer). */
export function readingOrder(lines: OcrLine[]): OcrLine[] {
  return groupRows(lines).flat();
}

/** Plain text of a page: one row per line, lines of the same row separated by a tab. */
export function pageText(lines: OcrLine[]): string {
  return groupRows(lines)
    .map((row) => row.map((l) => l.text).join('\t'))
    .join('\n');
}

/** Text of several pages for "copy all". Pages without text are skipped. */
export function documentText(pages: { label: string; text: string | null | undefined }[]): string {
  return pages
    .filter((p) => !!p.text && p.text.trim().length > 0)
    .map((p) => `${p.label}\n${(p.text as string).trim()}`)
    .join('\n\n');
}

// ── Search ────────────────────────────────────────────────────────────

const FOLD_GROUPS: [string, string][] = [
  ['àáâãäåāăą', 'a'],
  ['æ', 'ae'],
  ['çćĉċč', 'c'],
  ['ďđð', 'd'],
  ['èéêëēĕėęě', 'e'],
  ['ĝğġģ', 'g'],
  ['ĥħ', 'h'],
  ['ìíîïĩīĭįı', 'i'],
  ['ĳ', 'ij'],
  ['ĵ', 'j'],
  ['ķĸ', 'k'],
  ['ĺļľŀł', 'l'],
  ['ñńņňŉŋ', 'n'],
  ['òóôõöøōŏő', 'o'],
  ['œ', 'oe'],
  ['ŕŗř', 'r'],
  ['śŝşšſș', 's'],
  ['ß', 'ss'],
  ['ţťŧț', 't'],
  ['þ', 'th'],
  ['ùúûüũūŭůűų', 'u'],
  ['ŵ', 'w'],
  ['ýÿŷ', 'y'],
  ['źżž', 'z'],
  ['\ufb00', 'ff'],
  ['\ufb01', 'fi'],
  ['\ufb02', 'fl'],
  ['\ufb03', 'ffi'],
  ['\ufb04', 'ffl'],
  ['\ufb05\ufb06', 'st'],
  ['\u2018\u2019\u201a\u201b\u2032', "'"],
  ['\u201c\u201d\u201e\u201f\u2033', '"'],
  ['\u2010\u2011\u2012\u2013\u2014\u2212', '-'],
];
const FOLD = new Map<string, string>();
for (const [chars, to] of FOLD_GROUPS) for (const c of chars) FOLD.set(c, to);

const isSpace = (c: string) => /\s/.test(c);
const isDropped = (c: string) => /[\u0300-\u036f\u00ad\u200b-\u200d\u2060\ufeff]/.test(c);

/** Folded form of one character ('' = dropped, ' ' = whitespace). */
function foldChar(c: string): string {
  if (isSpace(c)) return ' ';
  if (isDropped(c)) return '';
  const lower = c.toLowerCase();
  return FOLD.get(lower) ?? lower;
}

/**
 * Search form: lower case, diacritics removed (ä → a, ß → ss), ligatures
 * and typographic dashes / quotes unified, whitespace collapsed.
 */
export function normalizeForSearch(text: string): string {
  let out = '';
  let space = true; // drop leading whitespace
  for (const c of text) {
    const f = foldChar(c);
    if (f === ' ') {
      if (!space) out += ' ';
      space = true;
    } else if (f.length > 0) {
      out += f;
      space = false;
    }
  }
  return out.endsWith(' ') ? out.slice(0, -1) : out;
}

const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿ';
const LOWER = 'a-zß-öø-ÿ';
const HYPHEN_BREAK = new RegExp(`([${LETTER}])[-\\u00ad\\u2010\\u2011]\\n([${LOWER}])`, 'g');

/** Joins words hyphenated at the end of a line ("Rech-\nnung" → "Rechnung"). */
export function joinHyphenation(text: string): string {
  return text.replace(HYPHEN_BREAK, '$1$2');
}

/** Stored search column of a page. */
export function searchTextOf(text: string): string {
  return normalizeForSearch(joinHyphenation(text));
}

/** Search terms of a query (normalized, max. 6). */
export function searchTerms(query: string): string[] {
  return normalizeForSearch(query)
    .split(' ')
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

/** Escapes LIKE wildcards; use with ESCAPE '\'. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/**
 * Short excerpt around the first occurrence of `term` (already normalized)
 * in `text`, with ellipses. Matching ignores case and diacritics.
 */
export function findSnippet(text: string, term: string, radius = 36): Snippet | null {
  if (!term) return null;
  const flat = joinHyphenation(text).replace(/\s+/g, ' ').trim();
  // folded string + source index of every folded character
  let folded = '';
  const src: number[] = [];
  const chars = Array.from(flat);
  const offsets: number[] = [];
  let pos = 0;
  for (const c of chars) {
    offsets.push(pos);
    pos += c.length;
  }
  offsets.push(pos);
  chars.forEach((c, i) => {
    const f = foldChar(c);
    for (let k = 0; k < f.length; k++) {
      folded += f[k];
      src.push(i);
    }
  });
  const at = folded.indexOf(term);
  if (at < 0) return null;
  const first = src[at];
  const last = src[at + term.length - 1];
  const startChar = Math.max(0, first - radius);
  const endChar = Math.min(chars.length, last + 1 + radius * 2);
  let before = flat.slice(offsets[startChar], offsets[first]);
  let after = flat.slice(offsets[last + 1], offsets[endChar]);
  if (startChar > 0) before = `…${before.replace(/^\S*\s/, '')}`;
  if (endChar < chars.length) after = `${after.replace(/\s\S*$/, '')}…`;
  return { before, match: flat.slice(offsets[first], offsets[last + 1]), after };
}

// ── Storage format ────────────────────────────────────────────────────

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const boxArr = (b: OcrBox) => [r4(b.x), r4(b.y), r4(b.w), r4(b.h)];

/** Compact JSON: [[text, confidence, x, y, w, h, [[word, x, y, w, h], …]], …] */
export function serializeLines(lines: OcrLine[]): string {
  return JSON.stringify(
    lines.map((l) => [l.text, r4(l.confidence), ...boxArr(l.box), l.words.map((w) => [w.text, ...boxArr(w.box)])])
  );
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseBox(a: unknown[], from: number): OcrBox | null {
  const [x, y, w, h] = [num(a[from]), num(a[from + 1]), num(a[from + 2]), num(a[from + 3])];
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Parses serializeLines() output; invalid entries are skipped. */
export function parseLines(json: string | null | undefined): OcrLine[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const lines: OcrLine[] = [];
  for (const l of raw) {
    if (!Array.isArray(l) || typeof l[0] !== 'string') continue;
    const box = parseBox(l, 2);
    if (!box) continue;
    const words: OcrWord[] = [];
    if (Array.isArray(l[6])) {
      for (const w of l[6]) {
        if (!Array.isArray(w) || typeof w[0] !== 'string') continue;
        const wb = parseBox(w, 1);
        if (wb) words.push({ text: w[0], box: wb });
      }
    }
    lines.push({ text: l[0], confidence: num(l[1]) ?? 0, box, words });
  }
  return lines;
}
