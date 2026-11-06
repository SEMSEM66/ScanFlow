import { describe, expect, it } from '@jest/globals';
import {
  daysRemainingInTrash,
  extractFirstLineFromOcr,
  extractSmartDateFromText,
  formatSmartDocumentTitle,
  hasTag,
  isTrashExpired,
  normalizeTag,
  normalizeTagList,
  parseTags,
  serializeTags,
  TRASH_RETENTION_DAYS,
  TRASH_RETENTION_MS,
} from '../src/utils/organization';

describe('M3 Organization: 30-day Trash retention', () => {
  it('correctly calculates expiration and remaining days', () => {
    const now = 1770000000000;
    // Exactly at trash time -> not expired, 30 days remaining
    expect(isTrashExpired(now, now)).toBe(false);
    expect(daysRemainingInTrash(now, now)).toBe(TRASH_RETENTION_DAYS);

    // 15 days in trash -> 15 days remaining
    const halfTime = now - 15 * 24 * 60 * 60 * 1000;
    expect(isTrashExpired(halfTime, now)).toBe(false);
    expect(daysRemainingInTrash(halfTime, now)).toBe(15);

    // 30 days and 1 second in trash -> expired, 0 days remaining
    const expiredTime = now - TRASH_RETENTION_MS - 1000;
    expect(isTrashExpired(expiredTime, now)).toBe(true);
    expect(daysRemainingInTrash(expiredTime, now)).toBe(0);

    // Invalid / null deletedAt
    expect(isTrashExpired(null, now)).toBe(false);
    expect(daysRemainingInTrash(Number.NaN, now)).toBe(0);
  });
});

describe('M3 Organization: Tags normalization & serialization', () => {
  it('normalizes single tags and trims whitespace/hashes', () => {
    expect(normalizeTag('  #Steuer 2025  ')).toBe('Steuer 2025');
    expect(normalizeTag('###')).toBeNull();
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag(null)).toBeNull();
  });

  it('deduplicates tag list case-insensitively while preserving first case', () => {
    const input = ['Rechnung', 'steuer', 'RECHNUNG', 'Finanzen', 'Steuer'];
    expect(normalizeTagList(input)).toEqual(['Rechnung', 'steuer', 'Finanzen']);
  });

  it('round-trips tag lists via JSON serialization', () => {
    const tags = ['Versicherung', 'Auto', 'Vertrag'];
    const json = serializeTags(tags);
    expect(json).toBe('["Versicherung","Auto","Vertrag"]');
    expect(parseTags(json)).toEqual(tags);

    expect(serializeTags([])).toBeNull();
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('invalid json')).toEqual([]);
  });

  it('checks tag membership case-insensitively', () => {
    const tags = ['Rechnung', 'Telekom'];
    expect(hasTag(tags, 'rechnung')).toBe(true);
    expect(hasTag(tags, 'TELEKOM')).toBe(true);
    expect(hasTag(tags, 'Privat')).toBe(false);
    expect(hasTag([], 'Rechnung')).toBe(false);
  });
});

describe('M3 Organization: Deterministic Smart Naming', () => {
  it('extracts German numeric dates (DD.MM.YYYY)', () => {
    const ocr = 'Telekom Deutschland GmbH\nRechnungsdatum: 18.04.2026\nGesamtbetrag: 49,95 €';
    expect(extractSmartDateFromText(ocr)).toBe('2026-04-18');
  });

  it('extracts ISO dates (YYYY-MM-DD)', () => {
    const ocr = 'INVOICE INV-2026-001\nDate: 2026-05-22\nDue date: 2026-06-22';
    expect(extractSmartDateFromText(ocr)).toBe('2026-05-22');
  });

  it('extracts German written dates (DD. Monat YYYY)', () => {
    const ocr = 'Mietvertrag vom 3. Oktober 2025 zwischen den Parteien';
    expect(extractSmartDateFromText(ocr)).toBe('2025-10-03');

    const ocr2 = 'Berlin, den 14. März 2026';
    expect(extractSmartDateFromText(ocr2)).toBe('2026-03-14');
  });

  it('extracts first meaningful line from OCR text', () => {
    const ocr = 'Seite 1 von 3\n1 / 3\n  \nAllianz Versicherungs-AG\nSchadensmeldung KFZ';
    expect(extractFirstLineFromOcr(ocr)).toBe('Allianz Versicherungs-AG');
  });

  it('formats document title with tokens {date}, {time}, {folder}, {firstLine}, {counter}', () => {
    const ocr = 'Vodafone GmbH\nRechnung vom 12.06.2026';
    const title = formatSmartDocumentTitle('{date} - {folder} - {firstLine}', {
      ocrText: ocr,
      folderName: 'Verträge',
      counter: 4,
    });
    expect(title).toBe('2026-06-12 - Verträge - Vodafone GmbH');
  });

  it('cleans up dangling separators when optional tokens are empty', () => {
    const title = formatSmartDocumentTitle('{folder} - {date} - {firstLine}', {
      timestampMs: new Date('2026-11-06T15:30:00Z').getTime(),
      folderName: null,
      ocrText: '',
    });
    // folder and firstLine are empty, date fallback is used
    expect(title).toBe('2026-11-06');
  });
});
