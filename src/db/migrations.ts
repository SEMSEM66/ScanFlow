/**
 * Versioned SQLite migrations (PRAGMA user_version).
 *
 * Kept free of expo-sqlite imports so the logic can be unit-tested in Node
 * (see __tests__/migrations.test.ts). The adapter interface is the subset of
 * expo-sqlite's SQLiteDatabase that we need.
 */
import { CREATE_PAGE_TEXT_TABLE, CREATE_SIGNATURES_TABLE } from './schema';

export interface MigrationDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string): Promise<unknown>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
}

export const SCHEMA_VERSION = 4;

async function columnNames(db: MigrationDb, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => r.name));
}

/** v2 columns of `pages` (non-destructive editing model). */
export const PAGE_V2_COLUMNS: [string, string][] = [
  // normalized TL,TR,BR,BL corners on the original as JSON, NULL = full image
  ['corners', 'TEXT'],
  ["page_format", "TEXT NOT NULL DEFAULT 'auto'"],
  // JSON Adjustments, NULL = defaults
  ['adjustments', 'TEXT'],
  // ≤ 2000 px proxy of the original for crop UI / previews
  ['proxy_uri', 'TEXT'],
  // cache key of the rendered preview stored in preview_uri
  ['render_key', 'TEXT'],
  // original photo of pages migrated from v1 (preview had crop/filter baked in)
  ['legacy_original_uri', 'TEXT'],
];

/**
 * v1 → v2. Before v2 the crop and filter were baked into preview_uri, rotation
 * was baked into both files. To keep exactly what the user saw, migrated pages
 * use the old preview as their new source ("original"), the untouched photo is
 * kept in legacy_original_uri, filter becomes 'original' where something was
 * baked in, rotation 0, corners NULL (full image).
 */
async function migrateToV2(db: MigrationDb): Promise<void> {
  const cols = await columnNames(db, 'pages');
  for (const [name, type] of PAGE_V2_COLUMNS) {
    if (!cols.has(name)) await db.execAsync(`ALTER TABLE pages ADD COLUMN ${name} ${type};`);
  }
  await db.runAsync(
    `UPDATE pages
       SET legacy_original_uri = original_uri,
           original_uri = preview_uri,
           filter = 'original'
     WHERE preview_uri IS NOT NULL AND preview_uri <> original_uri AND legacy_original_uri IS NULL`
  );
  // Rotation was always applied to the pixels in v1.
  await db.runAsync(`UPDATE pages SET rotation = 0 WHERE rotation <> 0`);
  // Unknown filter names → original
  await db.runAsync(
    `UPDATE pages SET filter = 'original'
     WHERE filter NOT IN ('original','auto','magicColor','grayscale','blackAndWhite','removeShadows','lighten')`
  );
}

/** v2 → v3: recognized text per page (OCR). Purely additive. */
async function migrateToV3(db: MigrationDb): Promise<void> {
  await db.execAsync(CREATE_PAGE_TEXT_TABLE);
}

/** v3 → v4: non-destructive page annotations (`pages.annotations`) and saved visual `signatures` table. */
async function migrateToV4(db: MigrationDb): Promise<void> {
  const cols = await columnNames(db, 'pages');
  if (!cols.has('annotations')) {
    await db.execAsync('ALTER TABLE pages ADD COLUMN annotations TEXT;');
  }
  await db.execAsync(CREATE_SIGNATURES_TABLE);
}

const STEPS: { version: number; up: (db: MigrationDb) => Promise<void> }[] = [
  { version: 2, up: migrateToV2 },
  { version: 3, up: migrateToV3 },
  { version: 4, up: migrateToV4 },
];

/**
 * Runs all pending migrations inside one transaction. The base tables must
 * already exist (CREATE TABLE IF NOT EXISTS). Fresh installs created with the
 * current pages schema only get the additive steps (page_text) and their
 * user_version bumped.
 */
export async function runMigrations(db: MigrationDb): Promise<{ from: number; to: number }> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  if (from >= SCHEMA_VERSION) return { from, to: from };
  await db.execAsync('BEGIN IMMEDIATE;');
  try {
    for (const step of STEPS) {
      if (from < step.version) await step.up(db);
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
  return { from, to: SCHEMA_VERSION };
}
