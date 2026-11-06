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
import { parseAnnotations, serializeAnnotations } from '../imaging/annotations';
import { hasTag, parseTags, serializeTags, TRASH_RETENTION_MS } from '../utils/organization';
import { documentSearchClauses } from '../db/textSearch';
import { planPageExtraction, planPageSplit } from '../db/documentOperations';
import { ocrKey } from '../ocr/text';
import { storageService } from './StorageService';
import { pageTextRepository } from './PageTextRepository';

interface DocumentRow {
  id: string;
  title: string;
  folder_id: string | null;
  page_count: number;
  thumbnail_uri: string | null;
  deleted_at?: number | null;
  is_favorite?: number;
  tags?: string | null;
  title_auto?: number;
  created_at: number;
  updated_at: number;
}

const DOCUMENT_COLUMNS =
  'id, title, folder_id, page_count, thumbnail_uri, deleted_at, is_favorite, tags, title_auto, created_at, updated_at';

function mapDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    pageCount: row.page_count,
    thumbnailUri: row.thumbnail_uri,
    deletedAt: row.deleted_at ?? null,
    isFavorite: Boolean(row.is_favorite),
    tags: parseTags(row.tags),
    titleAuto: Boolean(row.title_auto),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  annotations?: string | null;
  proxy_uri: string | null;
  render_key: string | null;
  legacy_original_uri: string | null;
  created_at: number;
  updated_at: number;
}

const PAGE_COLUMNS =
  'id, document_id, page_number, original_uri, preview_uri, filter, rotation, corners, page_format, adjustments, annotations, proxy_uri, render_key, legacy_original_uri, created_at, updated_at';

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
    annotations: parseAnnotations(p.annotations),
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
    const whereClauses: string[] = ['deleted_at IS NULL'];
    const params: (string | number)[] = [];

    if (options?.folderId) {
      whereClauses.push('folder_id = ?');
      params.push(options.folderId);
    }

    if (options?.favoritesOnly) {
      whereClauses.push('is_favorite = 1');
    }

    // Every word of the query must occur in the title, tags, or recognized text of a page.
    const search = documentSearchClauses(options?.searchQuery);
    whereClauses.push(...search.clauses);
    params.push(...search.params);

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    let sortClause = 'created_at DESC';
    if (options?.sortBy === 'date_asc') {
      sortClause = 'created_at ASC';
    } else if (options?.sortBy === 'title_asc') {
      sortClause = 'title COLLATE NOCASE ASC';
    } else if (options?.sortBy === 'title_desc') {
      sortClause = 'title COLLATE NOCASE DESC';
    }

    const sql = `
      SELECT ${DOCUMENT_COLUMNS}
      FROM documents
      ${whereSql}
      ORDER BY is_favorite DESC, ${sortClause}
    `;

    const rows = await db.getAllAsync<DocumentRow>(sql, params);
    const docs = rows.map(mapDocument);

    if (options?.tag) {
      const targetTag = options.tag;
      return docs.filter((d) => hasTag(d.tags, targetTag));
    }

    return docs;
  }

  async getById(id: string): Promise<{ document: Document; pages: DocumentPage[] } | null> {
    const db = await getDatabase();

    const docRow = await db.getFirstAsync<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = ?`,
      [id]
    );

    if (!docRow) return null;

    const pageRows = await db.getAllAsync<PageRow>(
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE document_id = ? ORDER BY page_number ASC`,
      [id]
    );

    const document = mapDocument(docRow);
    const pages = pageRows.map(mapPage);

    return { document, pages };
  }

  async create(input: CreateDocumentInput): Promise<Document> {
    const db = await getDatabase();
    const docId = newId('doc');
    const now = Date.now();
    await db.runAsync(
      'INSERT INTO documents (id, title, folder_id, page_count, thumbnail_uri, is_favorite, tags, title_auto, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        docId,
        input.title.trim(),
        input.folderId || null,
        0,
        null,
        input.isFavorite ? 1 : 0,
        serializeTags(input.tags),
        input.titleAuto ? 1 : 0,
        now,
        now,
      ]
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
        `INSERT INTO pages (id, document_id, page_number, original_uri, preview_uri, filter, rotation, corners, page_format, adjustments, annotations, proxy_uri, render_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          serializeAnnotations(page.annotations),
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
      if (input.titleAuto === undefined) {
        // User-initiated rename clears the auto-generated title flag so Smart Naming never overwrites it
        updates.push('title_auto = 0');
      }
    }

    if (input.folderId !== undefined) {
      updates.push('folder_id = ?');
      params.push(input.folderId);
    }

    if (input.isFavorite !== undefined) {
      updates.push('is_favorite = ?');
      params.push(input.isFavorite ? 1 : 0);
    }

    if (input.tags !== undefined) {
      updates.push('tags = ?');
      params.push(serializeTags(input.tags));
    }

    if (input.titleAuto !== undefined) {
      updates.push('title_auto = ?');
      params.push(input.titleAuto ? 1 : 0);
    }

    params.push(id);
    await db.runAsync(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  /**
   * Smart Naming hook: updates `title` and clears `title_auto` ONLY if the
   * document still has `title_auto = 1` (never overwrites a user-edited title).
   */
  async applySmartTitleIfAuto(id: string, smartTitle: string): Promise<boolean> {
    const clean = smartTitle.trim();
    if (!clean) return false;
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ title_auto: number }>('SELECT title_auto FROM documents WHERE id = ?', [id]);
    if (!row || !row.title_auto) return false;
    await db.runAsync('UPDATE documents SET title = ?, title_auto = 0, updated_at = ? WHERE id = ? AND title_auto = 1', [
      clean,
      Date.now(),
      id,
    ]);
    return true;
  }

  async toggleFavorite(id: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ is_favorite: number }>('SELECT is_favorite FROM documents WHERE id = ?', [id]);
    const next = row?.is_favorite ? 0 : 1;
    await db.runAsync('UPDATE documents SET is_favorite = ?, updated_at = ? WHERE id = ?', [next, Date.now(), id]);
    return Boolean(next);
  }

  async setFavoriteMany(documentIds: string[], isFavorite: boolean): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    const flag = isFavorite ? 1 : 0;
    for (const id of documentIds) {
      await db.runAsync('UPDATE documents SET is_favorite = ?, updated_at = ? WHERE id = ?', [flag, now, id]);
    }
  }

  async setTags(id: string, tags: string[]): Promise<string[]> {
    const serialized = serializeTags(tags);
    const db = await getDatabase();
    await db.runAsync('UPDATE documents SET tags = ?, updated_at = ? WHERE id = ?', [serialized, Date.now(), id]);
    return parseTags(serialized);
  }

  /** Returns all unique tags across active (non-trashed) documents, sorted alphabetically. */
  async getAllTags(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ tags: string | null }>(
      'SELECT tags FROM documents WHERE deleted_at IS NULL AND tags IS NOT NULL'
    );
    const seen = new Map<string, string>();
    for (const r of rows) {
      for (const tag of parseTags(r.tags)) {
        const key = tag.toLocaleLowerCase('de-DE');
        if (!seen.has(key)) seen.set(key, tag);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'de'));
  }

  async moveToFolder(documentId: string, folderId: string | null): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    await db.runAsync(
      'UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?',
      [folderId, now, documentId]
    );
  }

  async moveManyToFolder(documentIds: string[], folderId: string | null): Promise<void> {
    for (const id of documentIds) {
      await this.moveToFolder(id, folderId);
    }
  }

  /** Soft-deletes a document by moving it to the 30-day Trash ("Zuletzt gelöscht"). */
  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    await db.runAsync('UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  }

  async deleteMany(documentIds: string[]): Promise<void> {
    for (const id of documentIds) {
      await this.delete(id);
    }
  }

  /** Returns all documents currently in Trash, newest deletion first. */
  async getTrashed(): Promise<Document[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
    );
    return rows.map(mapDocument);
  }

  async getTrashCount(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM documents WHERE deleted_at IS NOT NULL'
    );
    return row?.n ?? 0;
  }

  /** Restores a trashed document back to the Library (clears `folder_id` if the folder was deleted). */
  async restoreFromTrash(id: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    const doc = await db.getFirstAsync<{ folder_id: string | null }>(
      'SELECT folder_id FROM documents WHERE id = ?',
      [id]
    );
    let validFolderId: string | null = doc?.folder_id ?? null;
    if (validFolderId) {
      const folderExists = await db.getFirstAsync<{ id: string }>('SELECT id FROM folders WHERE id = ?', [
        validFolderId,
      ]);
      if (!folderExists) validFolderId = null;
    }
    await db.runAsync(
      'UPDATE documents SET deleted_at = NULL, folder_id = ?, updated_at = ? WHERE id = ?',
      [validFolderId, now, id]
    );
  }

  async restoreManyFromTrash(documentIds: string[]): Promise<void> {
    for (const id of documentIds) {
      await this.restoreFromTrash(id);
    }
  }

  /** Permanently deletes a document and all of its page image files from disk. */
  async permanentlyDelete(id: string): Promise<void> {
    const db = await getDatabase();
    const pageRows = await db.getAllAsync<PageRow>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE document_id = ?`, [id]);

    for (const page of pageRows) {
      for (const f of pageFiles(page)) await storageService.deleteFile(f);
    }

    await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  }

  /** Permanently deletes all documents currently in Trash. */
  async emptyTrash(): Promise<number> {
    const trashed = await this.getTrashed();
    for (const doc of trashed) {
      await this.permanentlyDelete(doc.id);
    }
    return trashed.length;
  }

  /** Purges trashed documents older than 30 days (`TRASH_RETENTION_MS`). Called on app launch. */
  async purgeExpiredTrash(nowMs = Date.now()): Promise<number> {
    const db = await getDatabase();
    const cutoff = nowMs - TRASH_RETENTION_MS;
    const expired = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM documents WHERE deleted_at IS NOT NULL AND deleted_at <= ?',
      [cutoff]
    );
    for (const row of expired) {
      await this.permanentlyDelete(row.id);
    }
    return expired.length;
  }

  /** Helper that clones a list of existing DocumentPages (files + state) into NewPageInputs. */
  private async clonePages(pages: DocumentPage[]): Promise<NewPageInput[]> {
    const copied: NewPageInput[] = [];
    for (const p of pages) {
      const originalUri = await storageService.saveImage(p.originalUri, 'orig_copy');
      const proxyUri =
        p.proxyUri && p.proxyUri !== p.originalUri ? await storageService.saveImage(p.proxyUri, 'proxy_copy', 'proxies') : null;
      const previewUri =
        p.previewUri && p.previewUri !== p.originalUri ? await storageService.saveImage(p.previewUri, 'prev_copy', 'renders') : originalUri;
      copied.push({
        originalUri,
        previewUri,
        proxyUri: proxyUri ?? (p.proxyUri ? originalUri : null),
        renderKey: previewUri !== originalUri ? p.renderKey : null,
        filter: p.filter,
        rotation: p.rotation,
        corners: p.corners,
        pageFormat: p.pageFormat,
        adjustments: p.adjustments,
        annotations: p.annotations,
      });
    }
    return copied;
  }

  /** Copies recognized OCR text rows from source pages to newly created target pages. */
  private async copyOcrTextForClonedPages(sourcePages: DocumentPage[], targetDocId: string): Promise<void> {
    try {
      const created = await this.getById(targetDocId);
      if (created) {
        await pageTextRepository.copy(
          sourcePages
            .map((p, i) => ({ p, np: created.pages[i] }))
            .filter(({ np }) => !!np)
            .map(({ p, np }) => ({ from: p.id, fromKey: ocrKey(p), to: np.id, key: ocrKey(np) }))
        );
      }
    } catch (err) {
      console.warn('[DocumentRepository] Recognized text not copied:', err);
    }
  }

  /** Duplicates a document incl. its files (previews are re-rendered on demand). */
  async duplicate(id: string, copySuffix = 'Kopie'): Promise<Document | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const { document, pages } = existing;
    const copied = await this.clonePages(pages);
    const created = await this.create({ title: `${document.title} (${copySuffix})`, folderId: document.folderId, pages: copied });
    await this.copyOcrTextForClonedPages(pages, created.id);
    return created;
  }

  /**
   * Merges 2+ documents (in the order of `documentIds`) into a new combined
   * document, preserving non-destructive page states, rendered previews, and
   * recognized OCR text. The original documents remain untouched unless the
   * caller deletes them.
   */
  async mergeDocuments(
    documentIds: string[],
    newTitle: string,
    folderId?: string | null
  ): Promise<Document | null> {
    const sourcePages: DocumentPage[] = [];
    let resolvedFolderId: string | null | undefined = folderId;
    for (const docId of documentIds) {
      const data = await this.getById(docId);
      if (!data) continue;
      if (resolvedFolderId === undefined) {
        resolvedFolderId = data.document.folderId;
      }
      sourcePages.push(...data.pages);
    }
    if (sourcePages.length === 0) return null;
    const copied = await this.clonePages(sourcePages);
    const created = await this.create({
      title: newTitle,
      folderId: resolvedFolderId ?? null,
      pages: copied,
    });
    await this.copyOcrTextForClonedPages(sourcePages, created.id);
    return created;
  }

  /**
   * Extracts a subset of pages from `sourceDocId` (preserving their document
   * order) into a new document, including their files and recognized OCR text.
   */
  async extractPagesToDocument(
    sourceDocId: string,
    selectedPageIds: Iterable<string>,
    newTitle: string
  ): Promise<Document | null> {
    const existing = await this.getById(sourceDocId);
    if (!existing) return null;
    const orderedIds = planPageExtraction(
      existing.pages.map((p) => p.id),
      selectedPageIds
    );
    if (orderedIds.length === 0) return null;
    const pageById = new Map(existing.pages.map((p) => [p.id, p]));
    const pagesToExtract = orderedIds.map((id) => pageById.get(id)!).filter(Boolean);
    const copied = await this.clonePages(pagesToExtract);
    const created = await this.create({
      title: newTitle,
      folderId: existing.document.folderId,
      pages: copied,
    });
    await this.copyOcrTextForClonedPages(pagesToExtract, created.id);
    return created;
  }

  /**
   * Splits `sourceDocId` at 1-based `splitPageNumber` (>= 2):
   * - Pages 1 .. splitPageNumber - 1 stay in `sourceDocId`
   * - Pages splitPageNumber .. N move into a new document (`newTitle`) in the same folder
   * Since pages are moved in SQLite (`UPDATE pages SET document_id = ?, page_number = ?`),
   * all image files and `page_text` rows stay attached without duplicating storage.
   */
  async splitDocumentAtPage(
    sourceDocId: string,
    splitPageNumber: number,
    newTitle: string
  ): Promise<Document | null> {
    const existing = await this.getById(sourceDocId);
    if (!existing) return null;
    const plan = planPageSplit(
      existing.pages.map((p) => p.id),
      splitPageNumber
    );
    if (!plan) return null;

    const db = await getDatabase();
    const newDocId = newId('doc');
    const now = Date.now();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO documents (id, title, folder_id, page_count, thumbnail_uri, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newDocId, newTitle.trim(), existing.document.folderId, 0, null, now, now]
      );
      for (let i = 0; i < plan.movePageIds.length; i++) {
        await db.runAsync(
          'UPDATE pages SET document_id = ?, page_number = ?, updated_at = ? WHERE id = ?',
          [newDocId, i + 1, now, plan.movePageIds[i]]
        );
      }
      for (let i = 0; i < plan.keepPageIds.length; i++) {
        await db.runAsync(
          'UPDATE pages SET page_number = ?, updated_at = ? WHERE id = ?',
          [i + 1, now, plan.keepPageIds[i]]
        );
      }
    });

    await this.refreshSummary(sourceDocId);
    await this.refreshSummary(newDocId);
    const created = await this.getById(newDocId);
    return created ? created.document : null;
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
    if (updates.annotations !== undefined) {
      setClauses.push('annotations = ?');
      params.push(serializeAnnotations(updates.annotations));
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
