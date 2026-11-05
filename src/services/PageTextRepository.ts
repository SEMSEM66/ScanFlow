import { getDatabase } from '../db/database';
import {
  COPY_PAGE_TEXT_SQL,
  PAGE_STATES_SQL,
  PAGE_TEXT_COLUMNS,
  SNIPPET_SQL,
  UPSERT_PAGE_TEXT_SQL,
} from '../db/textSearch';
import { normalizeRotation, parseCorners } from '../imaging/pageState';
import type { OcrCandidate } from '../ocr/scheduler';
import { escapeLike, findSnippet, ocrKey, pageText, parseLines, searchTextOf, serializeLines, type Snippet } from '../ocr/text';
import type { OcrLine, PageTextRecord } from '../ocr/types';

/**
 * Recognized text per page (table page_text, schema v3). Rows are deleted
 * with their page (ON DELETE CASCADE); a row is stale when its ocr_key no
 * longer matches the page state (retake, crop, rotation).
 */

interface TextRow {
  page_id: string;
  ocr_key: string;
  engine: string;
  languages: string;
  text: string;
  lines: string;
  created_at: number;
}

interface StateRow {
  id: string;
  document_id: string;
  page_number: number;
  original_uri: string;
  corners: string | null;
  rotation: number;
  doc_created_at: number;
  ocr_key: string | null;
}

export interface OcrStats {
  /** All pages of all documents. */
  total: number;
  /** Pages whose text matches their current state. */
  recognized: number;
}

const COLS = PAGE_TEXT_COLUMNS;

function mapRow(r: TextRow): PageTextRecord {
  return {
    pageId: r.page_id,
    key: r.ocr_key,
    engine: r.engine,
    languages: r.languages ? r.languages.split(',') : [],
    text: r.text,
    lines: parseLines(r.lines),
    createdAt: r.created_at,
  };
}

const keyOfRow = (r: Pick<StateRow, 'original_uri' | 'corners' | 'rotation'>) =>
  ocrKey({ originalUri: r.original_uri, corners: parseCorners(r.corners), rotation: normalizeRotation(r.rotation) });

export class PageTextRepository {
  async get(pageId: string): Promise<PageTextRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<TextRow>(`SELECT ${COLS} FROM page_text WHERE page_id = ?`, [pageId]);
    return row ? mapRow(row) : null;
  }

  /** Text of all pages of a document, by page id. */
  async getForDocument(documentId: string): Promise<Map<string, PageTextRecord>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<TextRow>(
      `SELECT ${COLS.split(', ').map((c) => `t.${c}`).join(', ')}
         FROM page_text t JOIN pages p ON p.id = t.page_id
        WHERE p.document_id = ?`,
      [documentId]
    );
    return new Map(rows.map((r) => [r.page_id, mapRow(r)]));
  }

  /** Stores (replaces) the text of a page. */
  async save(pageId: string, data: { key: string; engine: string; languages: string[]; lines: OcrLine[] }): Promise<void> {
    const db = await getDatabase();
    const text = pageText(data.lines);
    await db.runAsync(UPSERT_PAGE_TEXT_SQL, [
      pageId,
      data.key,
      data.engine,
      data.languages.join(','),
      text,
      searchTextOf(text),
      serializeLines(data.lines),
      Date.now(),
    ]);
  }

  /**
   * Copies up-to-date text to pages with the same image content (duplicated
   * documents): `fromKey` must still match the source row, `key` is the
   * target page's own key.
   */
  async copy(pairs: { from: string; fromKey: string; to: string; key: string }[]): Promise<void> {
    const db = await getDatabase();
    for (const { from, fromKey, to, key } of pairs) {
      await db.runAsync(COPY_PAGE_TEXT_SQL, [to, key, from, fromKey]);
    }
  }

  async deleteAll(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM page_text');
  }

  /** Every page with its current OCR key and the key of its stored text. */
  private async states(): Promise<(StateRow & { key: string })[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<StateRow>(PAGE_STATES_SQL);
    return rows.map((r) => ({ ...r, key: keyOfRow(r) }));
  }

  /** Pages without text or with outdated text. */
  async pending(): Promise<OcrCandidate[]> {
    return (await this.states())
      .filter((r) => r.ocr_key !== r.key)
      .map((r) => ({
        pageId: r.id,
        documentId: r.document_id,
        key: r.key,
        pageNumber: r.page_number,
        documentCreatedAt: r.doc_created_at,
      }));
  }

  async stats(): Promise<OcrStats> {
    const all = await this.states();
    return { total: all.length, recognized: all.filter((r) => r.ocr_key === r.key).length };
  }

  /**
   * Excerpt of the first page (in page order) of each document whose text
   * contains `term` (normalized search term).
   */
  async snippets(documentIds: string[], term: string): Promise<Map<string, Snippet>> {
    const out = new Map<string, Snippet>();
    if (!term || documentIds.length === 0) return out;
    const db = await getDatabase();
    const wanted = new Set(documentIds);
    const rows = await db.getAllAsync<{ document_id: string; n: number; text: string }>(SNIPPET_SQL, [`%${escapeLike(term)}%`]);
    for (const r of rows) {
      if (!wanted.has(r.document_id)) continue;
      const s = findSnippet(r.text, term);
      if (s) out.set(r.document_id, s);
    }
    return out;
  }
}

export const pageTextRepository = new PageTextRepository();
