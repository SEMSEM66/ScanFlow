/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { MigrationDb, SCHEMA_VERSION, runMigrations } from '../src/db/migrations';
import { CREATE_DOCUMENTS_TABLE, CREATE_FOLDERS_TABLE, CREATE_INDEXES, CREATE_PAGES_TABLE } from '../src/db/schema';

const tableNames = async (db: MigrationDb) =>
  (await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)).map((r) => r.name);

/* eslint-disable @typescript-eslint/no-require-imports */
// Real SQLite (Node ≥ 22 built-in) behind the expo-sqlite-like adapter.
function openDb(): MigrationDb {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql) => db.prepare(sql).run(),
    getAllAsync: async <T,>(sql: string) => db.prepare(sql).all() as T[],
    getFirstAsync: async <T,>(sql: string) => (db.prepare(sql).get() as T) ?? null,
  };
}

const V1_PAGES = `
CREATE TABLE pages (
  id TEXT PRIMARY KEY NOT NULL, document_id TEXT NOT NULL, page_number INTEGER NOT NULL,
  original_uri TEXT NOT NULL, preview_uri TEXT NOT NULL, filter TEXT NOT NULL DEFAULT 'original',
  rotation INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);`;

describe('migrations', () => {
  it('migrates a v1 database without losing what the user saw', async () => {
    const db = openDb();
    await db.execAsync(CREATE_FOLDERS_TABLE);
    await db.execAsync(CREATE_DOCUMENTS_TABLE);
    await db.execAsync(V1_PAGES);
    await db.runAsync(`INSERT INTO documents VALUES ('d1','Rechnung',NULL,2,'prev1.jpg',1,1)`);
    await db.runAsync(`INSERT INTO pages VALUES ('p1','d1',1,'orig1.jpg','prev1.jpg','blackAndWhite',90,1,1)`);
    await db.runAsync(`INSERT INTO pages VALUES ('p2','d1',2,'orig2.jpg','orig2.jpg','original',0,1,1)`);
    // app start: CREATE IF NOT EXISTS (no-op for pages) + migrations
    await db.execAsync(CREATE_PAGES_TABLE);
    await db.execAsync(CREATE_INDEXES);
    const r = await runMigrations(db);
    expect(r).toEqual({ from: 0, to: SCHEMA_VERSION });
    const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM pages ORDER BY page_number');
    expect(rows[0]).toMatchObject({
      original_uri: 'prev1.jpg',
      preview_uri: 'prev1.jpg',
      legacy_original_uri: 'orig1.jpg',
      filter: 'original',
      rotation: 0,
      corners: null,
      page_format: 'auto',
    });
    expect(rows[1]).toMatchObject({ original_uri: 'orig2.jpg', legacy_original_uri: null, filter: 'original' });
    // idempotent
    expect(await runMigrations(db)).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
    const again = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM pages ORDER BY page_number');
    expect(again).toEqual(rows);
  });

  it('fresh installs get the additive tables and the current version', async () => {
    const db = openDb();
    for (const s of [CREATE_FOLDERS_TABLE, CREATE_DOCUMENTS_TABLE, CREATE_PAGES_TABLE, CREATE_INDEXES]) await db.execAsync(s);
    expect(await runMigrations(db)).toEqual({ from: 0, to: SCHEMA_VERSION });
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);
    expect(await tableNames(db)).toEqual(['documents', 'folders', 'page_text', 'pages']);
  });

  it('v2 → v3 adds page_text and keeps all data', async () => {
    const db = openDb();
    for (const s of [CREATE_FOLDERS_TABLE, CREATE_DOCUMENTS_TABLE, CREATE_PAGES_TABLE, CREATE_INDEXES]) await db.execAsync(s);
    await db.execAsync('PRAGMA user_version = 2;');
    await db.runAsync(`INSERT INTO documents VALUES ('d1','Vertrag',NULL,1,NULL,1,1)`);
    await db.runAsync(
      `INSERT INTO pages (id, document_id, page_number, original_uri, preview_uri, filter, rotation, corners, created_at, updated_at)
       VALUES ('p1','d1',1,'o.jpg','v.jpg','auto',90,'[{"x":0.1,"y":0.1},{"x":0.9,"y":0.1},{"x":0.9,"y":0.9},{"x":0.1,"y":0.9}]',1,1)`
    );
    const before = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM pages');
    expect(await runMigrations(db)).toEqual({ from: 2, to: 3 });
    // v2 data untouched (no v1 → v2 rewrite of rotation / filter / uris)
    expect(await db.getAllAsync<Record<string, unknown>>('SELECT * FROM pages')).toEqual(before);
    expect(await tableNames(db)).toContain('page_text');
    const cols = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(page_text)')).map((c) => c.name);
    expect(cols).toEqual(['page_id', 'ocr_key', 'engine', 'languages', 'text', 'search_text', 'lines', 'created_at']);
    const fk = await db.getAllAsync<{ table: string; on_delete: string }>('PRAGMA foreign_key_list(page_text)');
    expect(fk).toEqual([expect.objectContaining({ table: 'pages', on_delete: 'CASCADE' })]);
    expect(await runMigrations(db)).toEqual({ from: 3, to: 3 });
  });

  it('rolls back on failure', async () => {
    const db = openDb();
    await db.execAsync(V1_PAGES.replace('CREATE TABLE pages', 'CREATE TABLE other'));
    // no pages table → ALTER fails → rollback, version stays 0
    await expect(runMigrations(db)).rejects.toBeTruthy();
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(0);
  });
});
