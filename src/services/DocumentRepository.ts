import { getDatabase } from '../db/database';
import { Document, DocumentPage, CreateDocumentInput, UpdateDocumentInput, DocumentFilterOptions, FilterType } from '../types';
import { storageService } from './StorageService';

export class DocumentRepository {
  async getAll(options?: DocumentFilterOptions): Promise<Document[]> {
    const db = await getDatabase();
    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (options?.folderId) {
      whereClauses.push('folder_id = ?');
      params.push(options.folderId);
    }

    if (options?.searchQuery && options.searchQuery.trim().length > 0) {
      whereClauses.push('title LIKE ?');
      params.push(`%${options.searchQuery.trim()}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let orderBySql = 'ORDER BY created_at DESC';
    if (options?.sortBy === 'date_asc') {
      orderBySql = 'ORDER BY created_at ASC';
    } else if (options?.sortBy === 'title_asc') {
      orderBySql = 'ORDER BY title COLLATE NOCASE ASC';
    } else if (options?.sortBy === 'title_desc') {
      orderBySql = 'ORDER BY title COLLATE NOCASE DESC';
    }

    const sql = `
      SELECT id, title, folder_id, page_count, thumbnail_uri, created_at, updated_at
      FROM documents
      ${whereSql}
      ${orderBySql}
    `;

    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      folder_id: string | null;
      page_count: number;
      thumbnail_uri: string | null;
      created_at: number;
      updated_at: number;
    }>(sql, params);

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      folderId: row.folder_id,
      pageCount: row.page_count,
      thumbnailUri: row.thumbnail_uri,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getById(id: string): Promise<{ document: Document; pages: DocumentPage[] } | null> {
    const db = await getDatabase();

    const docRow = await db.getFirstAsync<{
      id: string;
      title: string;
      folder_id: string | null;
      page_count: number;
      thumbnail_uri: string | null;
      created_at: number;
      updated_at: number;
    }>('SELECT id, title, folder_id, page_count, thumbnail_uri, created_at, updated_at FROM documents WHERE id = ?', [id]);

    if (!docRow) return null;

    const pageRows = await db.getAllAsync<{
      id: string;
      document_id: string;
      page_number: number;
      original_uri: string;
      preview_uri: string;
      filter: string;
      rotation: number;
      created_at: number;
      updated_at: number;
    }>('SELECT id, document_id, page_number, original_uri, preview_uri, filter, rotation, created_at, updated_at FROM pages WHERE document_id = ? ORDER BY page_number ASC', [id]);

    const document: Document = {
      id: docRow.id,
      title: docRow.title,
      folderId: docRow.folder_id,
      pageCount: docRow.page_count,
      thumbnailUri: docRow.thumbnail_uri,
      createdAt: docRow.created_at,
      updatedAt: docRow.updated_at,
    };

    const pages: DocumentPage[] = pageRows.map((p) => ({
      id: p.id,
      documentId: p.document_id,
      pageNumber: p.page_number,
      originalUri: p.original_uri,
      previewUri: p.preview_uri,
      filter: p.filter as FilterType,
      rotation: p.rotation,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return { document, pages };
  }

  async create(input: CreateDocumentInput): Promise<Document> {
    const db = await getDatabase();
    const docId = 'doc_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const now = Date.now();

    const savedPages: {
      id: string;
      originalUri: string;
      previewUri: string;
      pageNumber: number;
      filter: FilterType;
      rotation: number;
    }[] = [];

    for (let i = 0; i < input.pages.length; i++) {
      const page = input.pages[i];
      const pageId = 'page_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now() + '_' + i;
      const savedOriginal = await storageService.saveImage(page.originalUri, `doc_${docId}_p${i + 1}_orig`);
      const savedPreview = page.previewUri
        ? await storageService.saveImage(page.previewUri, `doc_${docId}_p${i + 1}_prev`)
        : savedOriginal;

      savedPages.push({
        id: pageId,
        originalUri: savedOriginal,
        previewUri: savedPreview,
        pageNumber: i + 1,
        filter: page.filter || 'original',
        rotation: page.rotation || 0,
      });
    }

    const thumbnailUri = savedPages[0]?.previewUri || null;
    const pageCount = savedPages.length;

    await db.runAsync(
      'INSERT INTO documents (id, title, folder_id, page_count, thumbnail_uri, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [docId, input.title.trim(), input.folderId || null, pageCount, thumbnailUri, now, now]
    );

    for (const p of savedPages) {
      await db.runAsync(
        'INSERT INTO pages (id, document_id, page_number, original_uri, preview_uri, filter, rotation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [p.id, docId, p.pageNumber, p.originalUri, p.previewUri, p.filter, p.rotation, now, now]
      );
    }

    return {
      id: docId,
      title: input.title.trim(),
      folderId: input.folderId || null,
      pageCount,
      thumbnailUri,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, input: UpdateDocumentInput): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (input.title !== undefined) {
      updates.push('title = ?');
      params.push(input.title.trim());
    }

    if (input.folderId !== undefined) {
      updates.push('folder_id = ?');
      params.push(input.folderId);
    }

    params.push(id);
    await db.runAsync(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  async moveToFolder(documentId: string, folderId: string | null): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    await db.runAsync(
      'UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?',
      [folderId, now, documentId]
    );
  }

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    const pageRows = await db.getAllAsync<{ original_uri: string; preview_uri: string }>(
      'SELECT original_uri, preview_uri FROM pages WHERE document_id = ?',
      [id]
    );

    // Delete image files from disk
    for (const page of pageRows) {
      await storageService.deleteFile(page.original_uri);
      if (page.preview_uri !== page.original_uri) {
        await storageService.deleteFile(page.preview_uri);
      }
    }

    // Delete document row (foreign key CASCADE deletes pages rows)
    await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  }

  async updatePage(pageId: string, updates: { previewUri?: string; filter?: FilterType; rotation?: number }): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: (string | number)[] = [now];

    if (updates.previewUri !== undefined) {
      setClauses.push('preview_uri = ?');
      params.push(updates.previewUri);
    }

    if (updates.filter !== undefined) {
      setClauses.push('filter = ?');
      params.push(updates.filter);
    }

    if (updates.rotation !== undefined) {
      setClauses.push('rotation = ?');
      params.push(updates.rotation);
    }

    params.push(pageId);
    await db.runAsync(`UPDATE pages SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }
}

export const documentRepository = new DocumentRepository();
