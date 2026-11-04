import { getDatabase } from '../db/database';
import { Folder } from '../types';

export class FolderRepository {
  async getAll(): Promise<Folder[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      created_at: number;
      updated_at: number;
    }>('SELECT id, name, created_at, updated_at FROM folders ORDER BY created_at ASC');

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getById(id: string): Promise<Folder | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      id: string;
      name: string;
      created_at: number;
      updated_at: number;
    }>('SELECT id, name, created_at, updated_at FROM folders WHERE id = ?', [id]);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(name: string): Promise<Folder> {
    const db = await getDatabase();
    const id = 'folder_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const now = Date.now();

    await db.runAsync(
      'INSERT INTO folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [id, name.trim(), now, now]
    );

    return {
      id,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
    };
  }

  async rename(id: string, name: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    await db.runAsync(
      'UPDATE folders SET name = ?, updated_at = ? WHERE id = ?',
      [name.trim(), now, id]
    );
  }

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    // Foreign key will set folder_id to NULL on documents
    await db.runAsync('DELETE FROM folders WHERE id = ?', [id]);
  }
}

export const folderRepository = new FolderRepository();
