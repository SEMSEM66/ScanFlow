import type { DocumentPage, NewPageInput } from '../types';
import { documentRepository } from './DocumentRepository';
import { imagePipeline } from './ImagePipelineService';
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
 * Imports camera / library images through the pipeline (EXIF bake, proxy,
 * edge detection). Default filter for new scans: Auto.
 */
export async function importPages(
  uris: string[],
  onProgress?: (current: number, total: number) => void
): Promise<NewPageInput[]> {
  const out: NewPageInput[] = [];
  for (let i = 0; i < uris.length; i++) {
    onProgress?.(i + 1, uris.length);
    const img = await imagePipeline.importImage(uris[i]);
    out.push({
      originalUri: img.originalUri,
      proxyUri: img.proxyUri,
      corners: img.detection.detected ? img.detection.corners : null,
      filter: 'auto',
      rotation: 0,
      pageFormat: 'auto',
    });
  }
  return out;
}
