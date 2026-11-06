/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import {
  MIN_PDF_PASSWORD_LENGTH,
  deduplicateFileNames,
  planPageExtraction,
  planPageSplit,
  sanitizeFileName,
  validatePdfPassword,
} from '../src/db/documentOperations';
import { runMigrations, type MigrationDb } from '../src/db/migrations';
import { CREATE_DOCUMENTS_TABLE, CREATE_FOLDERS_TABLE, CREATE_INDEXES, CREATE_PAGES_TABLE } from '../src/db/schema';

async function openMigratedDb(): Promise<DatabaseSync> {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CREATE_FOLDERS_TABLE);
  db.exec(CREATE_DOCUMENTS_TABLE);
  db.exec(CREATE_PAGES_TABLE);
  db.exec(CREATE_INDEXES);
  const adapter: MigrationDb = {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql) => db.prepare(sql).run(),
    getAllAsync: async <T,>(sql: string) => db.prepare(sql).all() as T[],
    getFirstAsync: async <T,>(sql: string) => (db.prepare(sql).get() as T) ?? null,
  };
  await runMigrations(adapter);
  return db;
}

describe('documentOperations (M1 PDF Toolkit)', () => {
  describe('planPageSplit', () => {
    it('returns null when document has fewer than 2 pages or splitPageNumber is invalid', () => {
      expect(planPageSplit([], 2)).toBeNull();
      expect(planPageSplit(['p1'], 1)).toBeNull();
      expect(planPageSplit(['p1', 'p2'], 1)).toBeNull();
      expect(planPageSplit(['p1', 'p2'], 3)).toBeNull();
      expect(planPageSplit(['p1', 'p2'], 1.5)).toBeNull();
    });

    it('partitions pages into keepPageIds (1..N-1) and movePageIds (N..end)', () => {
      expect(planPageSplit(['p1', 'p2', 'p3', 'p4'], 2)).toEqual({
        keepPageIds: ['p1'],
        movePageIds: ['p2', 'p3', 'p4'],
      });
      expect(planPageSplit(['p1', 'p2', 'p3', 'p4'], 3)).toEqual({
        keepPageIds: ['p1', 'p2'],
        movePageIds: ['p3', 'p4'],
      });
      expect(planPageSplit(['p1', 'p2', 'p3', 'p4'], 4)).toEqual({
        keepPageIds: ['p1', 'p2', 'p3'],
        movePageIds: ['p4'],
      });
    });

    it('preserves foreign-key page_text rows when moving split pages in SQLite', async () => {
      const db = await openMigratedDb();
      const now = 1700000000000;
      db.prepare(
        'INSERT INTO documents (id, title, folder_id, page_count, thumbnail_uri, created_at, updated_at) VALUES (?, ?, NULL, 3, ?, ?, ?)'
      ).run('doc1', 'Vertrag', 'file:///p1.jpg', now, now);

      for (const [idx, pid] of ['p1', 'p2', 'p3'].entries()) {
        db.prepare(
          'INSERT INTO pages (id, document_id, page_number, original_uri, preview_uri, filter, rotation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
        ).run(pid, 'doc1', idx + 1, `file:///${pid}.jpg`, `file:///${pid}_prev.jpg`, 'auto', now, now);
        db.prepare(
          'INSERT INTO page_text (page_id, ocr_key, engine, languages, text, search_text, lines, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(pid, `key_${pid}`, 'apple-vision', 'de-DE', `Text ${pid}`, `text ${pid}`, '[]', now);
      }

      const plan = planPageSplit(['p1', 'p2', 'p3'], 2)!;
      db.prepare(
        'INSERT INTO documents (id, title, folder_id, page_count, thumbnail_uri, created_at, updated_at) VALUES (?, ?, NULL, 0, NULL, ?, ?)'
      ).run('doc2', 'Vertrag (Teil 2)', now, now);

      for (let i = 0; i < plan.movePageIds.length; i++) {
        db.prepare('UPDATE pages SET document_id = ?, page_number = ? WHERE id = ?').run(
          'doc2',
          i + 1,
          plan.movePageIds[i]
        );
      }

      const doc1Pages = db
        .prepare('SELECT id, page_number FROM pages WHERE document_id = ? ORDER BY page_number ASC')
        .all('doc1') as { id: string; page_number: number }[];
      const doc2Pages = db
        .prepare('SELECT id, page_number FROM pages WHERE document_id = ? ORDER BY page_number ASC')
        .all('doc2') as { id: string; page_number: number }[];
      const textCount = db.prepare('SELECT COUNT(*) AS n FROM page_text').get() as { n: number };

      expect(doc1Pages).toEqual([{ id: 'p1', page_number: 1 }]);
      expect(doc2Pages).toEqual([
        { id: 'p2', page_number: 1 },
        { id: 'p3', page_number: 2 },
      ]);
      expect(textCount.n).toBe(3);
      db.close();
    });
  });

  describe('planPageExtraction', () => {
    it('returns selected pages in their original document order and ignores unknown IDs', () => {
      const all = ['p1', 'p2', 'p3', 'p4'];
      expect(planPageExtraction(all, ['p4', 'p2', 'unknown', 'p2'])).toEqual(['p2', 'p4']);
      expect(planPageExtraction(all, [])).toEqual([]);
    });
  });

  describe('deduplicateFileNames', () => {
    it('disambiguates colliding titles case-insensitively inside a ZIP archive', () => {
      const names = deduplicateFileNames(
        ['Rechnung', 'rechnung', 'Vertrag', 'Rechnung', ''],
        'pdf',
        sanitizeFileName
      );
      expect(names).toEqual([
        'Rechnung.pdf',
        'rechnung (2).pdf',
        'Vertrag.pdf',
        'Rechnung (3).pdf',
        'Scan.pdf',
      ]);
    });
  });

  describe('validatePdfPassword', () => {
    it('enforces minimum password length and confirmation match', () => {
      expect(MIN_PDF_PASSWORD_LENGTH).toBe(4);
      expect(validatePdfPassword('', '')).toEqual({ valid: false, reason: 'too_short' });
      expect(validatePdfPassword('123', '123')).toEqual({ valid: false, reason: 'too_short' });
      expect(validatePdfPassword('secret', 'secreX')).toEqual({ valid: false, reason: 'mismatch' });
      expect(validatePdfPassword('1234', '1234')).toEqual({ valid: true });
      expect(validatePdfPassword('StrengGeheim!2026', 'StrengGeheim!2026')).toEqual({ valid: true });
    });
  });
});
