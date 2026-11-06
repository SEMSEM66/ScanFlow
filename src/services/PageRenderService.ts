import type { DocumentPage, FilterType, NewPageInput } from '../types';
import { documentRepository } from './DocumentRepository';
import { imagePipeline, type ImportOptions } from './ImagePipelineService';
import { storageService } from './StorageService';

/**
 * Makes sure a page has an up-to-date rendered preview (and a proxy).
 * Safe against concurrent edits: a render is only stored if the page state
 * still matches when it finishes.
 */
export async function ensurePagePreview(pageId: string): Promise<DocumentPage | null> {
  let page = await documentRepository.getPage(pageId);
  if (!page) return null;
  if (!page.proxyUri || !(await storageService.exists(page.proxyUri))) {
    const src = await imagePipeline.ensureProxy(page);
    if (src.changed || src.proxyUri !== page.proxyUri) {
      await documentRepository.replacePageSource(page.id, { originalUri: src.originalUri, proxyUri: src.proxyUri });
    }
    page = await documentRepository.getPage(pageId);
    if (!page) return null;
  }
  const key = imagePipeline.previewKey(page);
  if (page.renderKey === key && (await storageService.exists(page.previewUri))) return page;
  const r = await imagePipeline.renderPreview(page);
  const latest = await documentRepository.getPage(pageId);
  if (!latest || imagePipeline.previewKey(latest) !== r.key) {
    await storageService.deleteFile(r.uri);
    return latest;
  }
  await documentRepository.setPreview(pageId, r.uri, r.key);
  return { ...latest, previewUri: r.uri, renderKey: r.key };
}

/**
 * Imports camera / library / scanner images through the pipeline (EXIF bake,
 * proxy, optional edge detection). Default filter for new scans: Auto.
 * Pages without a detected document keep the full image (corners = null).
 * If one image fails, the files of the pages imported so far are removed.
 */
export async function importPages(
  uris: string[],
  onProgress?: (current: number, total: number) => void,
  options: ImportOptions & { defaultFilter?: FilterType } = {}
): Promise<NewPageInput[]> {
  const out: NewPageInput[] = [];
  const filter: FilterType = options.defaultFilter ?? 'auto';
  try {
    for (let i = 0; i < uris.length; i++) {
      onProgress?.(i + 1, uris.length);
      const img = await imagePipeline.importImage(uris[i], options);
      out.push({
        originalUri: img.originalUri,
        proxyUri: img.proxyUri,
        corners: img.detection?.detected ? img.detection.corners : null,
        filter,
        rotation: 0,
        pageFormat: 'auto',
      });
    }
  } catch (err) {
    await discardImportedPages(out);
    throw err;
  }
  return out;
}

/** Deletes the stored files of imported pages that never made it into the database. */
export async function discardImportedPages(pages: NewPageInput[]): Promise<void> {
  for (const p of pages) {
    await storageService.deleteFile(p.originalUri);
    if (p.proxyUri && p.proxyUri !== p.originalUri) await storageService.deleteFile(p.proxyUri);
  }
}
