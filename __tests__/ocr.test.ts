import { describe, expect, it } from '@jest/globals';
import {
  OCR_VERSION,
  documentText,
  escapeLike,
  findSnippet,
  groupRows,
  joinHyphenation,
  normalizeForSearch,
  ocrKey,
  pageText,
  parseLines,
  readingOrder,
  searchTerms,
  searchTextOf,
  serializeLines,
} from '../src/ocr/text';
import { boxFromVision, cleanText, linesFromVision, proportionalBoxes, type VisionLine } from '../src/ocr/vision';
import type { OcrBox, OcrLine } from '../src/ocr/types';
import { parseCorners, serializeCorners } from '../src/imaging/pageState';
import type { Quad } from '../src/imaging/types';

const line = (text: string, box: OcrBox, words?: OcrLine['words']): OcrLine => ({
  text,
  confidence: 1,
  box,
  words: words ?? text.split(' ').map((t) => ({ text: t, box })),
});

describe('ocrKey (staleness of the stored text)', () => {
  const quad: Quad = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  const base = { originalUri: 'file:///scans/p1.jpg', corners: null, rotation: 0 as const };

  it('is pinned – a change re-recognizes every page (bump OCR_VERSION on purpose)', () => {
    expect(OCR_VERSION).toBe(1);
    expect(ocrKey(base)).toBe('7b599755');
    expect(ocrKey({ ...base, corners: quad, rotation: 90 })).toBe('ec4252eb');
  });

  it('changes with retake, crop and rotation', () => {
    const k = ocrKey(base);
    expect(ocrKey({ ...base, originalUri: 'file:///scans/p1-retake.jpg' })).not.toBe(k);
    expect(ocrKey({ ...base, corners: quad })).not.toBe(k);
    expect(ocrKey({ ...base, rotation: 180 })).not.toBe(k);
  });

  it('is stable across the SQLite round trip of the corners', () => {
    const raw: Quad = [
      { x: 0.123456789, y: 0.0500001 },
      { x: 0.912345678, y: 0.06 },
      { x: 0.95, y: 0.93333333 },
      { x: 0.08, y: 0.9 },
    ];
    const stored = parseCorners(serializeCorners(raw));
    expect(ocrKey({ ...base, corners: stored })).toBe(ocrKey({ ...base, corners: raw }));
    expect(ocrKey({ ...base, corners: parseCorners(serializeCorners(stored)) })).toBe(ocrKey({ ...base, corners: stored }));
  });
});

describe('plain text and reading order', () => {
  // two columns on one row, a heading above, a footer below – given out of order
  const lines = [
    line('Betrag 120,00 €', { x: 0.6, y: 0.3, w: 0.3, h: 0.03 }),
    line('Fußzeile', { x: 0.1, y: 0.9, w: 0.3, h: 0.02 }),
    line('Rechnung', { x: 0.1, y: 0.1, w: 0.4, h: 0.05 }),
    line('Position 1', { x: 0.1, y: 0.305, w: 0.3, h: 0.03 }),
  ];

  it('groups rows top to bottom, lines left to right', () => {
    expect(groupRows(lines).map((r) => r.map((l) => l.text))).toEqual([
      ['Rechnung'],
      ['Position 1', 'Betrag 120,00 €'],
      ['Fußzeile'],
    ]);
    expect(readingOrder(lines).map((l) => l.text)).toEqual(['Rechnung', 'Position 1', 'Betrag 120,00 €', 'Fußzeile']);
  });

  it('joins lines of a row with a tab and rows with a newline', () => {
    expect(pageText(lines)).toBe('Rechnung\nPosition 1\tBetrag 120,00 €\nFußzeile');
    expect(pageText([])).toBe('');
  });

  it('labels pages for "copy all" and skips pages without text', () => {
    expect(
      documentText([
        { label: 'Seite 1', text: ' Hallo ' },
        { label: 'Seite 2', text: '' },
        { label: 'Seite 3', text: null },
        { label: 'Seite 4', text: 'Welt' },
      ])
    ).toBe('Seite 1\nHallo\n\nSeite 4\nWelt');
    expect(documentText([])).toBe('');
  });
});

describe('search normalization', () => {
  it('ignores case, diacritics, ligatures and typographic characters', () => {
    expect(normalizeForSearch('Größe  STRASSE\tStraße')).toBe('grosse strasse strasse');
    expect(normalizeForSearch('Ä Ö Ü ä ö ü é ç ñ ø')).toBe('a o u a o u e c n o');
    expect(normalizeForSearch('\ufb01nanz \ufb02ug Œuvre')).toBe('finanz flug oeuvre');
    expect(normalizeForSearch('A–B — „Zitat“ ‚x‘')).toBe('a-b - "zitat" \'x\'');
    expect(normalizeForSearch('Cafe\u0301 Trenn\u00adung zero\u200bwidth')).toBe('cafe trennung zerowidth');
    expect(normalizeForSearch('  \n ')).toBe('');
  });

  it('joins words hyphenated at a line break, keeps real hyphens', () => {
    expect(joinHyphenation('Die Rech-\nnung ist da')).toBe('Die Rechnung ist da');
    expect(joinHyphenation('Baden-\nWürttemberg')).toBe('Baden-\nWürttemberg');
    expect(joinHyphenation('Telefon-\n0711')).toBe('Telefon-\n0711');
    expect(searchTextOf('Ge-\nbühren\tÜBER  100 €')).toBe('gebuhren uber 100 €');
  });

  it('splits queries into at most six terms', () => {
    expect(searchTerms('  Müller   Straße ')).toEqual(['muller', 'strasse']);
    expect(searchTerms('a b c d e f g h')).toHaveLength(6);
    expect(searchTerms('')).toEqual([]);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('snippets', () => {
  const text = 'Sehr geehrte Damen und Herren,\nbitte überweisen Sie den Betrag bis zum 3. März\nauf das Konto der Müller GmbH, Hauptstraße 5, 70173 Stuttgart.';

  it('marks the match in the original spelling', () => {
    const s = findSnippet(text, normalizeForSearch('marz'));
    expect(s?.match).toBe('März');
    const m = findSnippet(text, normalizeForSearch('MÜLLER'));
    expect(m?.match).toBe('Müller');
    const st = findSnippet(text, normalizeForSearch('hauptstrasse'));
    expect(st?.match).toBe('Hauptstraße');
  });

  it('shortens long context at word boundaries with ellipses', () => {
    const s = findSnippet(text, 'betrag', 12);
    expect(s).not.toBeNull();
    expect(s!.before.startsWith('…')).toBe(true);
    expect(s!.after.endsWith('…')).toBe(true);
    expect(`${s!.before}${s!.match}${s!.after}`.replace(/…/g, '')).toContain('Betrag');
    expect(s!.before.length).toBeLessThanOrEqual(14);
  });

  it('works across hyphenated line breaks and returns null without a match', () => {
    expect(findSnippet('Die Rech-\nnung', 'rechnung')?.match).toBe('Rech-\nnung'.replace('-\n', ''));
    expect(findSnippet(text, 'rechnung')).toBeNull();
    expect(findSnippet(text, '')).toBeNull();
    const short = findSnippet('Kurz', 'kurz');
    expect(short).toEqual({ before: '', match: 'Kurz', after: '' });
  });
});

describe('storage format', () => {
  it('round-trips lines and words with 4-decimal precision', () => {
    const lines: OcrLine[] = [
      {
        text: 'Hallo Welt',
        confidence: 0.987654,
        box: { x: 0.123456, y: 0.2, w: 0.5, h: 0.04 },
        words: [
          { text: 'Hallo', box: { x: 0.123456, y: 0.2, w: 0.2, h: 0.04 } },
          { text: 'Welt', box: { x: 0.4, y: 0.2, w: 0.22, h: 0.04 } },
        ],
      },
    ];
    const back = parseLines(serializeLines(lines));
    expect(back).toHaveLength(1);
    expect(back[0].text).toBe('Hallo Welt');
    expect(back[0].confidence).toBe(0.9877);
    expect(back[0].box).toEqual({ x: 0.1235, y: 0.2, w: 0.5, h: 0.04 });
    expect(back[0].words.map((w) => w.text)).toEqual(['Hallo', 'Welt']);
  });

  it('skips invalid entries instead of failing', () => {
    expect(parseLines(null)).toEqual([]);
    expect(parseLines('not json')).toEqual([]);
    expect(parseLines('{"a":1}')).toEqual([]);
    const json = JSON.stringify([
      ['ok', 0.9, 0.1, 0.1, 0.2, 0.05, [['ok', 0.1, 0.1, 0.2, 0.05], ['bad', 0.1, 0.1, 0, 0.05], 'x']],
      ['no box', 0.9],
      [42, 0.9, 0.1, 0.1, 0.2, 0.05, []],
      ['zero', 0.9, 0.1, 0.1, 0, 0.05, []],
    ]);
    const lines = parseLines(json);
    expect(lines.map((l) => l.text)).toEqual(['ok']);
    expect(lines[0].words.map((w) => w.text)).toEqual(['ok']);
  });
});

describe('Apple Vision result conversion', () => {
  it('flips the y axis (Vision: origin bottom-left) and clamps to the page', () => {
    expect(boxFromVision([0.1, 0.7, 0.3, 0.2])).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 });
    expect(boxFromVision([-0.1, 0.95, 0.3, 0.2])).toEqual({ x: 0, y: 0, w: 0.2, h: 0.05 });
    expect(boxFromVision([0.5, 0.5, 0, 0.1])).toBeNull();
    expect(boxFromVision([0.5, Number.NaN, 0.1, 0.1])).toBeNull();
    expect(boxFromVision(null)).toBeNull();
  });

  it('cleans control and invisible characters', () => {
    expect(cleanText('  Ha\u0000llo\u00ad  \u200bWelt\n ')).toBe('Hallo Welt');
  });

  it('spreads fallback word boxes over the line by character count', () => {
    const boxes = proportionalBoxes(['ab', 'cdef'], { x: 0.1, y: 0.2, w: 0.7, h: 0.05 });
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x).toBeCloseTo(0.1, 4);
    expect(boxes[0].w).toBeCloseTo(0.2, 4); // 2 of 7 units (2 + space + 4)
    expect(boxes[1].x).toBeCloseTo(0.4, 4);
    expect(boxes[1].x + boxes[1].w).toBeCloseTo(0.8, 4);
    expect(boxes.every((b) => b.y === 0.2 && b.h === 0.05)).toBe(true);
  });

  const vLine = (over: Partial<VisionLine> = {}): VisionLine => ({
    text: 'Summe 120,00',
    confidence: 0.9,
    box: [0.1, 0.5, 0.5, 0.04],
    words: [
      { text: 'Summe', box: [0.1, 0.5, 0.2, 0.04] },
      { text: '120,00', box: [0.35, 0.5, 0.25, 0.04] },
    ],
    ...over,
  });

  it('uses plausible native word boxes', () => {
    const [l] = linesFromVision({ width: 1000, height: 1400, lines: [vLine()] });
    expect(l.text).toBe('Summe 120,00');
    expect(l.box).toEqual({ x: 0.1, y: 0.46, w: 0.5, h: 0.04 });
    expect(l.words.map((w) => w.box.x)).toEqual([0.1, 0.35]);
    expect(l.confidence).toBe(0.9);
  });

  it('falls back to proportional boxes when native boxes do not fit', () => {
    const spanning = vLine({
      words: [
        { text: 'Summe', box: [0.1, 0.5, 0.5, 0.04] },
        { text: '120,00', box: [0.1, 0.5, 0.5, 0.04] },
      ],
    });
    const missing = vLine({ words: [{ text: 'Summe', box: [0.1, 0.5, 0.2, 0.04] }] });
    const reversed = vLine({
      words: [
        { text: 'Summe', box: [0.4, 0.5, 0.2, 0.04] },
        { text: '120,00', box: [0.1, 0.5, 0.2, 0.04] },
      ],
    });
    const elsewhere = vLine({
      words: [
        { text: 'Summe', box: [0.1, 0.5, 0.2, 0.04] },
        { text: '120,00', box: [0.35, 0.1, 0.25, 0.04] },
      ],
    });
    for (const v of [spanning, missing, reversed, elsewhere, vLine({ words: null })]) {
      const [l] = linesFromVision({ width: 1000, height: 1400, lines: [v] });
      expect(l.words).toHaveLength(2);
      expect(l.words[0].box.x).toBeCloseTo(0.1, 4);
      expect(l.words[1].box.x).toBeGreaterThan(l.words[0].box.x + l.words[0].box.w);
      expect(l.words[1].box.x + l.words[1].box.w).toBeCloseTo(0.6, 3);
    }
  });

  it('drops empty or invalid lines, clamps confidence and sorts in reading order', () => {
    const lines = linesFromVision({
      width: 1000,
      height: 1400,
      lines: [
        { text: 'unten', confidence: 2, box: [0.1, 0.1, 0.2, 0.03] },
        { text: '   ', confidence: 0.5, box: [0.1, 0.5, 0.2, 0.03] },
        { text: 'kaputt', confidence: 0.5, box: [0.1, 0.5, 0, 0.03] },
        { text: 'oben', confidence: Number.NaN, box: [0.1, 0.9, 0.2, 0.03] },
      ],
    });
    expect(lines.map((l) => l.text)).toEqual(['oben', 'unten']);
    expect(lines[0].confidence).toBe(0);
    expect(lines[1].confidence).toBe(1);
    expect(linesFromVision(null)).toEqual([]);
    expect(linesFromVision({ width: 1, height: 1, lines: [] })).toEqual([]);
  });
});
