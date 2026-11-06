/**
 * Pure M3 Organization & Automation logic:
 * 1. 30-day Trash retention helpers
 * 2. Favorites & Tag normalization/serialization
 * 3. Deterministic Smart Naming template engine (tokens: {date}, {time}, {folder}, {firstLine}, {counter})
 *
 * Free of React / Expo imports so it can be unit-tested in Node.
 */

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS_PER_DOCUMENT = 12;

export const DEFAULT_SMART_NAMING_TEMPLATE = 'Scan {date} {time}';

export const SMART_NAMING_PRESETS: readonly string[] = [
  'Scan {date} {time}',
  '{date} {firstLine}',
  '{folder} - {date} - {firstLine}',
  '{date}_{counter}',
];

/** Returns true when a trashed document has exceeded the 30-day retention window. */
export function isTrashExpired(
  deletedAt: number | null | undefined,
  nowMs = Date.now()
): boolean {
  if (typeof deletedAt !== 'number' || !Number.isFinite(deletedAt)) return false;
  return nowMs - deletedAt >= TRASH_RETENTION_MS;
}

/** Returns remaining whole days (`0..30`) before a trashed document is automatically purged. */
export function daysRemainingInTrash(deletedAt: number, nowMs = Date.now()): number {
  if (!Number.isFinite(deletedAt)) return 0;
  const remainingMs = deletedAt + TRASH_RETENTION_MS - nowMs;
  if (remainingMs <= 0) return 0;
  return Math.min(TRASH_RETENTION_DAYS, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

/** Cleans a single tag string; returns `null` if empty after trimming. */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\r\n\t#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/** Deduplicates tags case-insensitively while preserving the first occurrence's display case. */
export function normalizeTagList(input: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const tag = normalizeTag(item);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase('de-DE');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_DOCUMENT) break;
  }
  return out;
}

/** Parses the `documents.tags` JSON column into a clean string array. */
export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return normalizeTagList(parsed);
  } catch {
    return [];
  }
}

/** Serializes a tag list into compact JSON, or `null` when empty. */
export function serializeTags(tags: readonly string[] | null | undefined): string | null {
  const clean = normalizeTagList(tags);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

/** Case-insensitive check whether `tags` contains `filterTag`. */
export function hasTag(tags: readonly string[] | undefined, filterTag: string): boolean {
  const target = normalizeTag(filterTag)?.toLocaleLowerCase('de-DE');
  if (!target || !tags || tags.length === 0) return false;
  return tags.some((t) => t.toLocaleLowerCase('de-DE') === target);
}

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1,
  jan: 1,
  februar: 2,
  feb: 2,
  märz: 3,
  maerz: 3,
  mrz: 3,
  april: 4,
  apr: 4,
  mai: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  dez: 12,
};

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1990 || year > 2099) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Deterministic date extraction from recognized OCR text (no ML).
 * Recognizes:
 * - German numeric dates: `DD.MM.YYYY` (e.g. `14.03.2026`)
 * - ISO dates: `YYYY-MM-DD` (e.g. `2026-03-14`)
 * - German written dates: `14. März 2026`, `3. Oktober 2025`
 * Returns ISO `YYYY-MM-DD` when found, or `null`.
 */
export function extractSmartDateFromText(ocrText: string | null | undefined): string | null {
  if (!ocrText) return null;
  const sample = ocrText.slice(0, 4000);

  // 1. DD.MM.YYYY
  const dmyRegex = /\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\.(199\d|20\d{2})\b/g;
  let match: RegExpExecArray | null;
  while ((match = dmyRegex.exec(sample)) !== null) {
    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // 2. YYYY-MM-DD
  const isoRegex = /\b(199\d|20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
  while ((match = isoRegex.exec(sample)) !== null) {
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // 3. DD. <MonthName> YYYY (German)
  const writtenRegex =
    /\b(0?[1-9]|[12]\d|3[01])\.?\s+(Januar|Jan|Februar|Feb|März|Maerz|Mrz|April|Apr|Mai|Juni|Jun|Juli|Jul|August|Aug|September|Sep|Sept|Oktober|Okt|November|Nov|Dezember|Dez)\.?\s+(199\d|20\d{2})\b/gi;
  while ((match = writtenRegex.exec(sample)) !== null) {
    const day = Number.parseInt(match[1], 10);
    const month = GERMAN_MONTHS[match[2].toLocaleLowerCase('de-DE')];
    const year = Number.parseInt(match[3], 10);
    if (month && isValidCalendarDate(year, month, day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return null;
}

/**
 * Deterministically picks the first meaningful heading/line from OCR text for
 * the `{firstLine}` token. Skips pure page numbers, dates, and very short fragments.
 */
export function extractFirstLineFromOcr(ocrText: string | null | undefined): string {
  if (!ocrText) return '';
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((l) => l.length >= 3);

  for (const line of lines) {
    // Skip lines that are just page numbers ("Seite 1 von 2", "Page 1", "1 / 3")
    if (/^(seite|page)\s+\d+/i.test(line)) continue;
    if (/^\d+\s*[/|-]\s*\d+$/.test(line)) continue;
    // Require at least 3 letters (including German umlauts)
    const letterMatches = line.match(/[A-Za-zÄÖÜäöüß]/g);
    if (!letterMatches || letterMatches.length < 3) continue;
    return line.slice(0, 48).trim();
  }
  return '';
}

export interface SmartNamingContext {
  /** Fallback timestamp (epoch ms) when no date is found in OCR text. */
  timestampMs?: number;
  /** Optional folder name (`{folder}`). */
  folderName?: string | null;
  /** Optional recognized OCR text on page 1 (used for `{firstLine}` and deterministic date detection). */
  ocrText?: string | null;
  /** 1-based document counter (`{counter}`). */
  counter?: number;
}

/**
 * Formats a document title using a user-configured template with tokens:
 * `{date}`, `{time}`, `{folder}`, `{firstLine}`, `{counter}`.
 */
export function formatSmartDocumentTitle(
  template: string | null | undefined,
  ctx: SmartNamingContext = {}
): string {
  const activeTemplate =
    typeof template === 'string' && template.trim().length > 0
      ? template.trim()
      : DEFAULT_SMART_NAMING_TEMPLATE;

  const d = new Date(ctx.timestampMs ?? Date.now());
  const fallbackDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const detectedDate = extractSmartDateFromText(ctx.ocrText) ?? fallbackDate;
  const timeStr = `${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
  const folderStr = (ctx.folderName ?? '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const firstLineStr = extractFirstLineFromOcr(ctx.ocrText);
  const counterStr = String(Math.max(1, Math.floor(ctx.counter ?? 1))).padStart(3, '0');

  const raw = activeTemplate
    .replace(/\{date\}/g, detectedDate)
    .replace(/\{time\}/g, timeStr)
    .replace(/\{folder\}/g, folderStr)
    .replace(/\{firstLine\}/g, firstLineStr)
    .replace(/\{counter\}/g, counterStr);

  // Clean up dangling separators when an optional token ({folder} or {firstLine}) is empty
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-_–—,:;]+|[\s\-_–—,:;]+$/g, '')
    .replace(/(\s*[-_–—]\s*){2,}/g, ' - ')
    .trim()
    .slice(0, 96);

  return cleaned.length > 0 ? cleaned : `Scan ${fallbackDate} ${timeStr}`;
}
