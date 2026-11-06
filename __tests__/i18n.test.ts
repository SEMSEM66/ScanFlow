import { describe, expect, it } from '@jest/globals';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';

function collectLeafEntries(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      entries.set(path, value);
    } else if (value && typeof value === 'object') {
      for (const [subPath, subVal] of collectLeafEntries(value as Record<string, unknown>, path)) {
        entries.set(subPath, subVal);
      }
    }
  }
  return entries;
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{[a-zA-Z0-9_]+\}\}/g) ?? [];
  return [...new Set(matches)].sort();
}

describe('i18n parity (M0 foundation)', () => {
  const deEntries = collectLeafEntries(de as unknown as Record<string, unknown>);
  const enEntries = collectLeafEntries(en as unknown as Record<string, unknown>);

  it('has identical translation key paths in German (de.ts) and English (en.ts)', () => {
    const deKeys = [...deEntries.keys()].sort();
    const enKeys = [...enEntries.keys()].sort();
    expect(enKeys).toEqual(deKeys);
    expect(deKeys.length).toBeGreaterThan(200);
  });

  it('has non-empty strings for every translation key in both locales', () => {
    for (const [path, val] of deEntries) {
      expect({ path, locale: 'de', length: val.trim().length }).toEqual({
        path,
        locale: 'de',
        length: expect.any(Number),
      });
      expect(val.trim().length).toBeGreaterThan(0);
    }
    for (const [path, val] of enEntries) {
      expect(val.trim().length).toBeGreaterThan(0);
    }
  });

  it('preserves identical {{placeholder}} tokens across German and English strings', () => {
    for (const [path, deVal] of deEntries) {
      const enVal = enEntries.get(path) ?? '';
      expect({ path, placeholders: extractPlaceholders(enVal) }).toEqual({
        path,
        placeholders: extractPlaceholders(deVal),
      });
    }
  });
});
