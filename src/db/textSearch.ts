import { escapeLike, normalizeForSearch } from '../ocr/text';

/**
 * SQL of the text search and of the page_text table (schema v3). Kept free
 * of expo-sqlite imports so it can be executed against real SQLite in Node
 * (__tests__/textSearch.test.ts).
 */

/** Max. number of query words that are matched. */
export const MAX_SEARCH_WORDS = 6;

/**
 * WHERE clauses (AND-ed) for a library search on `documents`: every word of
 * the query must occur in the title (LIKE, case-insensitive for ASCII) or in
 * the recognized text of one of the document's pages (normalized: case and
 * diacritics ignored).
 */
export function documentSearchClauses(query: string | null | undefined): { clauses: string[]; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  const words = (query ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, MAX_SEARCH_WORDS);
  for (const word of words) {
    const folded = normalizeForSearch(word);
    if (folded.length > 0) {
      clauses.push(
        `(title LIKE ? ESCAPE '\\' OR id IN (SELECT p.document_id FROM pages p JOIN page_text t ON t.page_id = p.id WHERE t.search_text LIKE ? ESCAPE '\\'))`
      );
      params.push(`%${escapeLike(word)}%`, `%${escapeLike(folded)}%`);
    } else {
      clauses.push(`title LIKE ? ESCAPE '\\'`);
      params.push(`%${escapeLike(word)}%`);
    }
  }
  return { clauses, params };
}

/** First word of the query that has a text form (used for snippets). */
export function snippetTerm(query: string | null | undefined): string {
  for (const word of (query ?? '').trim().split(/\s+/)) {
    const folded = normalizeForSearch(word);
    if (folded.length > 0) return folded;
  }
  return '';
}

export const PAGE_TEXT_COLUMNS = 'page_id, ocr_key, engine, languages, text, lines, created_at';

/** Params: page_id, ocr_key, engine, languages, text, search_text, lines, created_at */
export const UPSERT_PAGE_TEXT_SQL = `INSERT OR REPLACE INTO page_text (page_id, ocr_key, engine, languages, text, search_text, lines, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

/** Params: target page_id, target ocr_key, source page_id, source ocr_key (copied only while still current). */
export const COPY_PAGE_TEXT_SQL = `INSERT OR REPLACE INTO page_text (page_id, ocr_key, engine, languages, text, search_text, lines, created_at)
SELECT ?, ?, engine, languages, text, search_text, lines, created_at FROM page_text WHERE page_id = ? AND ocr_key = ?`;

/** Every page with the data its OCR key is computed from and the key of its stored text (NULL = none). */
export const PAGE_STATES_SQL = `SELECT p.id, p.document_id, p.page_number, p.original_uri, p.corners, p.rotation,
       d.created_at AS doc_created_at, t.ocr_key
  FROM pages p
  JOIN documents d ON d.id = p.document_id
  LEFT JOIN page_text t ON t.page_id = p.id`;

/**
 * Text of the first matching page (page order) per document; param: LIKE
 * pattern on search_text. SQLite takes bare columns of a MIN() aggregate
 * from the row with the minimum.
 */
export const SNIPPET_SQL = `SELECT p.document_id, MIN(p.page_number) AS n, t.text
  FROM page_text t JOIN pages p ON p.id = t.page_id
 WHERE t.search_text LIKE ? ESCAPE '\\'
 GROUP BY p.document_id`;
