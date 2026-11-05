/// <reference types="node" />
import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  CREATE_DOCUMENTS_TABLE,
  CREATE_FOLDERS_TABLE,
  CREATE_INDEXES,
  CREATE_PAGES_TABLE,
  CREATE_PAGE_TEXT_TABLE,
} from '../src/db/schema';
import {
  COPY_PAGE_TEXT_SQL,
  PAGE_STATES_SQL,
  SNIPPET_SQL,
  UPSERT_PAGE_TEXT_SQL,
  documentSearchClauses,
  snippetTerm,
} from '../src/db/textSearch';
import { escapeLike, findSnippet, searchTextOf } from '../src/ocr/text';

/* eslint-disable @typescript-eslint/no-require-imports */
type Row = Record<string, unknown>;
type Db = {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  all<T = Row>(sql: string, params?: unknown[]): T[];
};

// Real SQLite (Node ≥ 22 built-in) with the app's schema and foreign keys on (like database.ts)
function openDb(): Db {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const s of [CREATE_FOLDERS_TABLE, CREATE_DOCUMENTS_TABLE, CREATE_PAGES_TABLE, CREATE_INDEXES, CREATE_PAGE_TEXT_TABLE]) db.exec(s);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => void db.prepare(sql).run(...params),
    all: <T,>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as T[],
  };
}

let db: Db;

function addDoc(id: string, title: string, createdAt = 1) {
  db.run('INSERT INTO documents (id, title, page_count, created_at, updated_at) VALUES (?, ?, 0, ?, ?)', [id, title, createdAt, createdAt]);
}

function addPage(id: string, documentId: string, pageNumber: number, text?: string, key = `key-${id}`) {
  db.run(
    `INSERT INTO pages (id, document_id, page_number, original_uri, preview_uri, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1)`,
    [id, documentId, pageNumber, `file:///${id}.jpg`, `file:///${id}.jpg`]
  );
  if (text !== undefined) {
    db.run(UPSERT_PAGE_TEXT_SQL, [id, key, 'apple-vision', 'de-DE,en-US', text, searchTextOf(text), '[]', 1]);
  }
}

/** Same WHERE as DocumentRepository.getAll. */
function search(query: string): string[] {
  const { clauses, params } = documentSearchClauses(query);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.all<{ id: string }>(`SELECT id FROM documents ${where} ORDER BY id`, params).map((r) => r.id);
}

beforeEach(() => {
  db = openDb();
  addDoc('d-invoice', 'Rechnung Stadtwerke');
  addPage('p1', 'd-invoice', 1, 'Stadtwerke Stuttgart\nKundennummer 4711\nBetrag 50% Rabatt');
  addDoc('d-letter', 'Brief');
  addPage('p2', 'd-letter', 1, 'Sehr geehrter Herr MÜLLER,\nHauptstraße 5\nIhre Rech-\nnung vom 3. März 2024');
  addPage('p3', 'd-letter', 2, 'Seite zwei ohne Treffer');
  addDoc('d-scan', 'Scan 12.03.2024');
  addPage('p4', 'd-scan', 1); // not recognized yet
  addDoc('d-percent', 'Preisliste');
  addPage('p5', 'd-percent', 1, 'Artikel 500 Euro, Code a_b');
});

describe('library search (title + recognized text)', () => {
  it('finds titles and page text, ignoring case and diacritics', () => {
    expect(search('rechnung')).toEqual(['d-invoice', 'd-letter']); // title / hyphenated text
    expect(search('Müller')).toEqual(['d-letter']);
    expect(search('muller')).toEqual(['d-letter']);
    expect(search('HAUPTSTRASSE')).toEqual(['d-letter']);
    expect(search('maerz')).toEqual([]);
    expect(search('märz')).toEqual(['d-letter']);
    expect(search('12.03')).toEqual(['d-scan']);
  });

  it('requires every word (in the title or in the text)', () => {
    expect(search('Rechnung 4711')).toEqual(['d-invoice']);
    expect(search('Brief Hauptstraße')).toEqual(['d-letter']);
    expect(search('Brief 4711')).toEqual([]);
    expect(search('  ')).toEqual(['d-invoice', 'd-letter', 'd-percent', 'd-scan']);
  });

  it('treats LIKE wildcards literally', () => {
    expect(search('50%')).toEqual(['d-invoice']);
    expect(search('a_b')).toEqual(['d-percent']);
    expect(search('5_0')).toEqual([]);
    expect(search('%')).toEqual(['d-invoice']);
  });

  it('finds a document only through text that belongs to its pages', () => {
    db.run('DELETE FROM page_text WHERE page_id = ?', ['p1']);
    expect(search('4711')).toEqual([]);
  });
});

describe('snippets', () => {
  it('takes the first matching page of each document', () => {
    addPage('p6', 'd-letter', 3, 'Noch einmal Müller am Ende');
    const term = snippetTerm('Müller Brief');
    expect(term).toBe('muller');
    const rows = db.all<{ document_id: string; n: number; text: string }>(SNIPPET_SQL, [`%${escapeLike(term)}%`]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ document_id: 'd-letter', n: 1 });
    expect(findSnippet(rows[0].text, term)?.match).toBe('MÜLLER');
  });

  it('uses the lowest page number, not the insertion order', () => {
    addDoc('d-multi', 'Mehrseitig');
    addPage('m3', 'd-multi', 3, 'Treffer drei');
    addPage('m2', 'd-multi', 2, 'Treffer zwei');
    addPage('m1', 'd-multi', 1, 'nichts');
    const rows = db.all<{ document_id: string; n: number; text: string }>(SNIPPET_SQL, ['%treffer%']);
    const multi = rows.find((r) => r.document_id === 'd-multi');
    expect(multi).toMatchObject({ n: 2, text: 'Treffer zwei' });
  });

  it('has no term for queries without searchable characters', () => {
    expect(snippetTerm('')).toBe('');
    expect(snippetTerm('  \u00ad ')).toBe('');
    expect(documentSearchClauses('\u00ad').clauses).toEqual(["title LIKE ? ESCAPE '\\'"]);
  });
});

describe('page_text rows', () => {
  it('lists every page with the key of its stored text', () => {
    const rows = db.all<{ id: string; ocr_key: string | null; doc_created_at: number }>(PAGE_STATES_SQL);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(rows).toHaveLength(5);
    expect(byId.get('p1')?.ocr_key).toBe('key-p1');
    expect(byId.get('p4')?.ocr_key).toBeNull();
    expect(byId.get('p4')?.doc_created_at).toBe(1);
  });

  it('copies text to duplicated pages only while the source text is current', () => {
    addDoc('d-copy', 'Rechnung Stadtwerke (Kopie)');
    addPage('c1', 'd-copy', 1);
    addPage('c2', 'd-copy', 2);
    db.run(COPY_PAGE_TEXT_SQL, ['c1', 'key-c1', 'p1', 'key-p1']);
    db.run(COPY_PAGE_TEXT_SQL, ['c2', 'key-c2', 'p2', 'outdated-key']);
    const copied = db.all<{ page_id: string; ocr_key: string; text: string; search_text: string }>(
      'SELECT page_id, ocr_key, text, search_text FROM page_text WHERE page_id IN (?, ?)',
      ['c1', 'c2']
    );
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ page_id: 'c1', ocr_key: 'key-c1' });
    expect(copied[0].text).toContain('Kundennummer 4711');
    expect(search('4711')).toEqual(['d-copy', 'd-invoice']);
  });

  it('replaces the text of a page on save', () => {
    db.run(UPSERT_PAGE_TEXT_SQL, ['p1', 'key-new', 'apple-vision', 'de-DE', 'Neu', searchTextOf('Neu'), '[]', 2]);
    const rows = db.all<{ ocr_key: string; text: string }>('SELECT ocr_key, text FROM page_text WHERE page_id = ?', ['p1']);
    expect(rows).toEqual([{ ocr_key: 'key-new', text: 'Neu' }]);
  });

  it('disappears with its page and with its document', () => {
    db.run('DELETE FROM pages WHERE id = ?', ['p3']);
    expect(db.all('SELECT page_id FROM page_text WHERE page_id = ?', ['p3'])).toEqual([]);
    db.run('DELETE FROM documents WHERE id = ?', ['d-letter']);
    expect(db.all('SELECT page_id FROM page_text WHERE page_id = ?', ['p2'])).toEqual([]);
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM page_text')[0].n).toBe(2);
  });

  it('rejects text for pages that do not exist', () => {
    expect(() => db.run(UPSERT_PAGE_TEXT_SQL, ['ghost', 'k', 'apple-vision', '', '', '', '[]', 1])).toThrow();
  });
});
