import type { FilterType, NewPageInput } from '../types';
import { documentRepository } from './DocumentRepository';
import { importPages } from './PageRenderService';
import { storageService } from './StorageService';

/**
 * Stores scanned / imported images as pages – shared by the system document
 * scanner flow, the in-app camera and the photo-library import.
 */

export interface ScanTarget {
  /** Append the pages to this document (otherwise a new document is created). */
  documentId?: string;
  /** Retake: the first image replaces this page, further images are inserted right after it. */
  replacePageId?: string;
}

export interface SaveScanOptions extends ScanTarget {
  /** Source images (temporary files, removed after a successful import). */
  uris: string[];
  /**
   * Run edge detection on each image (camera photos, library images). Off for
   * pages from the system document scanner, which are already cropped and
   * perspective-corrected.
   */
  detect: boolean;
  /** Title of a new document. */
  title: string;
  /** Initial filter for newly imported pages (defaults to 'auto'; 'original' for imported PDFs). */
  defaultFilter?: FilterType;
  onProgress?: (current: number, total: number) => void;
}

export interface SavedScan {
  documentId: string;
  /** True if a new document was created. */
  created: boolean;
  /** New or replaced pages in document order. */
  pageIds: string[];
  /** Pages where no document edge was found (full image kept) – worth a look in the crop screen. */
  undetectedPageIds: string[];
}

/** What the document screen should show after a scan: jump to the new pages, review undetected ones. */
export interface ScanNotice {
  pageIds: string[];
  undetectedPageIds: string[];
}

const notices = new Map<string, ScanNotice>();

/**
 * Hand-over from the scan flows to the document screen (which may only get
 * focus later, e.g. after the camera screen closes).
 */
export const scanNotices = {
  push(documentId: string, notice: ScanNotice): void {
    const prev = notices.get(documentId);
    notices.set(
      documentId,
      prev
        ? {
            pageIds: [...prev.pageIds, ...notice.pageIds],
            undetectedPageIds: [...prev.undetectedPageIds, ...notice.undetectedPageIds],
          }
        : notice
    );
  },
  take(documentId: string): ScanNotice | null {
    const notice = notices.get(documentId) ?? null;
    notices.delete(documentId);
    return notice;
  },
};

/** Pages without detected corners – only meaningful when detection ran. */
function undetectedIds(ids: string[], pages: NewPageInput[], detect: boolean): string[] {
  if (!detect) return [];
  return ids.filter((_, i) => !pages[i]?.corners);
}

/**
 * Imports the images through the pipeline and stores them: as a new document,
 * appended to `documentId`, or as a retake of `replacePageId`.
 */
export async function saveScan(options: SaveScanOptions): Promise<SavedScan> {
  const { uris, detect, title, onProgress, replacePageId } = options;
  if (uris.length === 0) throw new Error('saveScan: no images');

  const replaced = replacePageId ? await documentRepository.getPage(replacePageId) : null;
  if (replacePageId && !replaced) throw new Error(`saveScan: page ${replacePageId} not found`);

  // importPages removes its files again if one image fails
  const pages = await importPages(uris, onProgress, { detect, defaultFilter: options.defaultFilter });
  let result: SavedScan;
  if (replaced) {
    const [first, ...rest] = pages;
    await documentRepository.replacePageSource(
      replaced.id,
      { originalUri: first.originalUri, proxyUri: first.proxyUri ?? null },
      { corners: first.corners ?? null, rotation: 0, filter: replaced.filter }
    );
    let extraIds: string[] = [];
    if (rest.length > 0) {
      extraIds = await documentRepository.addPages(replaced.documentId, rest);
      // keep the extra pages next to the retaken one
      const data = await documentRepository.getById(replaced.documentId);
      if (data) {
        const order = data.pages.map((p) => p.id).filter((id) => !extraIds.includes(id));
        order.splice(order.indexOf(replaced.id) + 1, 0, ...extraIds);
        await documentRepository.reorderPages(replaced.documentId, order);
      }
    }
    const pageIds = [replaced.id, ...extraIds];
    result = { documentId: replaced.documentId, created: false, pageIds, undetectedPageIds: undetectedIds(pageIds, pages, detect) };
  } else if (options.documentId) {
    const pageIds = await documentRepository.addPages(options.documentId, pages);
    result = { documentId: options.documentId, created: false, pageIds, undetectedPageIds: undetectedIds(pageIds, pages, detect) };
  } else {
    const doc = await documentRepository.create({ title, pages });
    const data = await documentRepository.getById(doc.id);
    const pageIds = data ? data.pages.map((p) => p.id) : [];
    result = { documentId: doc.id, created: true, pageIds, undetectedPageIds: undetectedIds(pageIds, pages, detect) };
  }

  for (const uri of uris) await storageService.deleteTempFile(uri);
  scanNotices.push(result.documentId, { pageIds: result.pageIds, undetectedPageIds: result.undetectedPageIds });
  return result;
}
