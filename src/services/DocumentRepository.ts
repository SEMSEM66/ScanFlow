import { getDatabase } from '../db/database';
import {
  Document,
  DocumentPage,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentFilterOptions,
  NewPageInput,
  PageEditState,
} from '../types';
import {
  normalizeAdjustments,
  normalizeFilter,
  normalizePageFormat,
  normalizeRotation,
  parseAdjustments,
  parseCorners,
  serializeAdjustments,
  serializeCorners,
} from '../imaging/pageState';
import { storageService } from './StorageService';

interface PageRow {
  id: string;
  document_id: string;
  page_number: number;
  original_uri: string;
  preview_uri: string;
  filter: string;
  rotation: number;
  corners: string | null;
  page_format: string | null;
  adjustments: string | null;
  proxy_uri: string | null;
  render_key: string | null;
  legacy_original_uri: string | null;
  created_at: number;
  updated_at: number;
}

const PAGE_COLUMNS =
  'id, document_id, page_number, original_uri, preview_uri, filter, rotation, corners, page_format, adjustments, proxy_uri, render_key, legacy_original_uri, created_at, updated_at';

function mapPage(p: PageRow): DocumentPage {
  return {
    id: p.id,
    documentId: p.document_id,
    pageNumber: p.page_number,
    originalUri: p.original_uri,
    previewUri: p.preview_uri,
    filter: normalizeFilter(p.filter),
    rotation: normalizeRotation(p.rotation),
    corners: parseCorners(p.corners),
    pageFormat: normalizePageFormat(p.page_format),
    adjustments: parseAdjustments(p.adjustments),
    proxyUri: p.proxy_uri,
    renderKey: p.render_key,
    legacyOriginalUri: p.legacy_original_uri,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

const newId = (prefix: string, i = 0) => `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}_${i}`;

/** All files that belong to a page (deduplicated). */
function pageFiles(p: Pick<PageRow, 'original_uri' | 'preview_uri' | 'proxy_uri' | 'legacy_original_uri'>): string[] {
  return Array.from(new Set([p.original_uri, p.preview_uri, p.proxy_uri, p.legacy_original_uri].filter((u): u is string => !!u)));
}

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

    const pageRows = await db.getAllAsync<PageRow>(
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE document_id = ? ORDER BY page_number ASC`,
      [id]
    );

    const document: Document = {
      id: docRow.id,
      title: docRow.title,
      folderId: docRow.folder_id,
      pageCount: docRow.page_count,
      thumbnailUri: docRow.thumbnail_uri,
      createdAt: docRow.created_at,
      updatedAt: docRow.updated_at,
    };

    const pages = pageRows.map(mapPage);

    return { document, pages };
  }

  async create(input: CreateDocumentInput): Promise<Document> {
    const db = await getDatabase();
    const docId = newId('doc');
    const now = Date.now();
    await db.runAsync(
      'INSERT INTO documents (id, title, folder_id, page_count, thumbnail_uri, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [docId, input.title.trim(), input.folderId || null, 0, null, now, now]
    );
    await this.addPages(docId, input.pages);
    const doc = await this.getById(docId);
    return doc!.document;
  }

  /**
   * Appends pages to a document. Files outside app storage are copied in;
   * files already inside scanflow/ (pipeline imports) are used as they are.
   * Returns the ids of the new pages (in order).
   */
  async addPages(documentId: string, pages: NewPageInput[]): Promise<string[]> {
    const db = await getDatabase();
    const now = Date.now();
    const last = await db.getFirstAsync<{ n: number | null }>('SELECT MAX(page_number) AS n FROM pages WHERE document_id = ?', [documentId]);
    let pageNumber = last?.n ?? 0;
    const ids: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      pageNumber++;
      const pageId = newId('page', i);
      ids.push(pageId);
      const originalUri = storageService.isStored(page.originalUri)
        ? page.originalUri
        : await storageService.saveImage(page.originalUri, `doc_${documentId}_p${pageNumber}_orig`);
      const previewUri =
        page.previewUri && page.previewUri !== page.originalUri
          ? storageService.isStored(page.previewUri)
            ? page.previewUri
            : await storageService.saveImage(page.previewUri, `doc_${documentId}_p${pageNumber}_prev`)
          : originalUri;
      await db.runAsync(
        `INSERT INTO pages (id, document_id, page_number, original_uri, preview_uri, filter, rotation, corners, page_format, adjustments, proxy_uri, render_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pageId,
          documentId,
          pageNumber,
          originalUri,
          previewUri,
          normalizeFilter(page.filter ?? 'original'),
          normalizeRotation(page.rotation ?? 0),
          serializeCorners(page.corners ?? null),
          normalizePageFormat(page.pageFormat),
          serializeAdjustments(page.adjustments ? normalizeAdjustments(page.adjustments) : null),
          page.proxyUri ?? null,
          previewUri !== originalUri ? page.renderKey ?? null : null,
          now,
          now,
        ]
      );
    }
    await this.refreshSummary(documentId);
    return ids;
  }

  /** Recomputes page_count and thumbnail (preview of page 1). */
  async refreshSummary(documentId: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM pages WHERE document_id = ?', [documentId]);
    const first = await db.getFirstAsync<{ preview_uri: string }>(
      'SELECT preview_uri FROM pages WHERE document_id = ? ORDER BY page_number ASC LIMIT 1',
      [documentId]
    );
    await db.runAsync('UPDATE documents SET page_count = ?, thumbnail_uri = ?, updated_at = ? WHERE id = ?', [
      count?.n ?? 0,
      first?.preview_uri ?? null,
      now,
      documentId,
    ]);
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
    const pageRows = await db.getAllAsync<PageRow>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE document_id = ?`, [id]);

    // Delete image files from disk (original, proxy, rendered preview, legacy photo)
    for (const page of pageRows) {
      for (const f of pageFiles(page)) await storageService.deleteFile(f);
    }

    // Delete document row (foreign key CASCADE deletes pages rows)
    await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  }

  /** Duplicates a document incl. its files (previews are re-rendered on demand). */
  async duplicate(id: string, copySuffix = 'Kopie'): Promise<Document | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const { document, pages } = existing;
    const copied: NewPageInput[] = [];
    for (const p of pages) {
      const originalUri = await storageService.saveImage(p.originalUri, 'orig_copy');
      const proxyUri =
        p.proxyUri && p.proxyUri !== p.originalUri ? await storageService.saveImage(p.proxyUri, 'proxy_copy', 'proxies') : null;
      copied.push({
        originalUri,
        proxyUri: proxyUri ?? (p.proxyUri ? originalUri : null),
        filter: p.filter,
        rotation: p.rotation,
        corners: p.corners,
        pageFormat: p.pageFormat,
        adjustments: p.adjustments,
      });
    }
    return this.create({ title: `${document.title} (${copySuffix})`, folderId: document.folderId, pages: copied });
  }

  /** Updates the edit state of a page (does not touch files). */
  async updatePage(pageId: string, updates: PageEditState): Promise<void> {
    const db = await getDatabase();
    const setClauses: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [Date.now()];
    if (updates.filter !== undefined) {
      setClauses.push('filter = ?');
      params.push(normalizeFilter(updates.filter));
    }
    if (updates.rotation !== undefined) {
      setClauses.push('rotation = ?');
      params.push(normalizeRotation(updates.rotation));
    }
    if (updates.corners !== undefined) {
      setClauses.push('corners = ?');
      params.push(serializeCorners(updates.corners));
    }
    if (updates.pageFormat !== undefined) {
      setClauses.push('page_format = ?');
      params.push(normalizePageFormat(updates.pageFormat));
    }
    if (updates.adjustments !== undefined) {
      setClauses.push('adjustments = ?');
      params.push(serializeAdjustments(updates.adjustments));
    }
    params.push(pageId);
    await db.runAsync(`UPDATE pages SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }

  /** Same edit state for every page of a document (e.g. "apply to all pages"). */
  async updateAllPages(documentId: string, updates: Pick<PageEditState, 'filter' | 'adjustments'>): Promise<void> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM pages WHERE document_id = ?', [documentId]);
    for (const r of rows) await this.updatePage(r.id, updates);
  }

  async getPage(pageId: string): Promise<DocumentPage | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<PageRow>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ?`, [pageId]);
    return row ? mapPage(row) : null;
  }

  /** Stores a new rendered preview; deletes the previous render file. */
  async setPreview(pageId: string, previewUri: string, renderKeyValue: string): Promise<void> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<PageRow>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ?`, [pageId]);
    if (!row) {
      await storageService.deleteFile(previewUri);
      return;
    }
    await db.runAsync('UPDATE pages SET preview_uri = ?, render_key = ? WHERE id = ?', [previewUri, renderKeyValue, pageId]);
    const old = row.preview_uri;
    if (old && old !== previewUri && old !== row.original_uri && old !== row.proxy_uri && old !== row.legacy_original_uri) {
      await storageService.deleteFile(old);
    }
    if (row.page_number === 1) await this.refreshSummary(row.document_id);
  }

  /** Sets new source files (retake / legacy upgrade). Old files are deleted unless still referenced. */
  async replacePageSource(
    pageId: string,
    source: { originalUri: string; proxyUri: string | null },
    edit: PageEditState = {}
  ): Promise<void> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<PageRow>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ?`, [pageId]);
    if (!row) return;
    await db.runAsync(
      'UPDATE pages SET original_uri = ?, proxy_uri = ?, preview_uri = ?, render_key = NULL, updated_at = ? WHERE id = ?',
      [source.originalUri, source.proxyUri, source.originalUri, Date.now(), pageId]
    );
    if (Object.keys(edit).length > 0) await this.updatePage(pageId, edit);
    const keep = new Set([source.originalUri, source.proxyUri, row.legacy_original_uri]);
    for (const f of [row.original_uri, row.preview_uri, row.proxy_uri]) {
      if (f && !keep.has(f)) await storageService.deleteFile(f);
    }
    if (row.page_number === 1) await this.refreshSummary(row.document_id);
  }

  /** Deletes one page (row + files) and renumbers the remaining pages. */
  async deletePage(pageId: string): Promise<void> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<PageRow>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ?`, [pageId]);
    if (!row) return;
    await db.runAsync('DELETE FROM pages WHERE id = ?', [pageId]);
    for (const f of pageFiles(row)) await storageService.deleteFile(f);
    const rest = await db.getAllAsync<{ id: string }>('SELECT id FROM pages WHERE document_id = ? ORDER BY page_number ASC', [
      row.document_id,
    ]);
    await this.writeOrder(rest.map((r) => r.id));
    await this.refreshSummary(row.document_id);
  }

  /** Persists a new page order (ids in display order). */
  async reorderPages(documentId: string, orderedPageIds: string[]): Promise<void> {
    await this.writeOrder(orderedPageIds);
    await this.refreshSummary(documentId);
  }

  private async writeOrder(ids: string[]): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.runAsync('UPDATE pages SET page_number = ? WHERE id = ?', [i + 1, ids[i]]);
      }
    });
  }
}

export const documentRepository = new DocumentRepository();
