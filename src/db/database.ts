import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';
import { CREATE_FOLDERS_TABLE, CREATE_DOCUMENTS_TABLE, CREATE_PAGES_TABLE, CREATE_INDEXES } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

const DEFAULT_FOLDERS = ['Rechnungen', 'Verträge', 'Ausweise', 'Privat'];

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const db = await SQLite.openDatabaseAsync('scanflow.db');
  
  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');
  
  // Execute table migrations
  await db.execAsync(CREATE_FOLDERS_TABLE);
  await db.execAsync(CREATE_DOCUMENTS_TABLE);
  await db.execAsync(CREATE_PAGES_TABLE);
  await db.execAsync(CREATE_INDEXES);
  // Versioned, transactional migrations (v1 → v2: non-destructive page model)
  await runMigrations(db);

  // Check if default folders exist, if not seed them
  const existingFolders = await db.getAllAsync<{ count: number }>(
    'SELECT count(*) as count FROM folders'
  );

  if (existingFolders.length === 0 || existingFolders[0].count === 0) {
    const now = Date.now();
    for (const folderName of DEFAULT_FOLDERS) {
      const id = 'folder_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      await db.runAsync(
        'INSERT INTO folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [id, folderName, now, now]
      );
    }
  }

  dbInstance = db;
  return db;
}
