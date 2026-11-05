import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { buildPdf, estimatePdfKb, ESTIMATED_PAGE_KB } from '../imaging/pdf';
import type { DocumentPage, ExportDpi, ExportFormat, ExportQuality } from '../types';
import { imagePipeline } from './ImagePipelineService';
import { storageService } from './StorageService';

export interface ExportOptions {
  dpi: ExportDpi;
  quality: ExportQuality;
  /** Diagonal watermark text, already localized (e.g. "VERTRAULICH"). */
  watermark?: string;
  onProgress?: (done: number, total: number) => void;
}

/** File name without characters that iOS / receiving apps dislike. */
export function sanitizeFileName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean.length > 0 ? clean : 'Scan';
}

/**
 * The per-export folder (`<exportDir><timestamp>/`) containing `uri`, or the
 * file itself when it lies directly in the export directory; null for
 * anything outside it (never delete foreign files).
 */
export function exportFolderOf(uri: string, exportDir: string): string | null {
  if (!exportDir || !uri.startsWith(exportDir) || uri.includes('..')) return null;
  const rest = uri.slice(exportDir.length);
  if (rest.length === 0) return null;
  const slash = rest.indexOf('/');
  return slash > 0 ? `${exportDir}${rest.slice(0, slash + 1)}` : uri;
}

/** pdf-lib's standard fonts are WinAnsi only → drop other characters. */
function winAnsi(text: string): string {
  return text.replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '');
}

export class ExportService {
  private async freshExportDir(): Promise<string> {
    // Old export files are no longer needed once a new export starts.
    await FileSystem.deleteAsync(storageService.exportDir, { idempotent: true });
    const dir = `${storageService.exportDir}${Date.now()}/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    return dir;
  }

  /**
   * Renders every page from its original (crop, perspective, filter, rotation,
   * adjustments) at the chosen DPI and writes a PDF with exactly one
   * full-bleed image per page at the exact page size (A4 / Letter / custom).
   */
  async generatePdf(title: string, pages: DocumentPage[], opts: ExportOptions): Promise<string> {
    const dir = await this.freshExportDir();
    const target = `${dir}${sanitizeFileName(title)}.pdf`;
    try {
      const doc = await buildPdf(
        pages.length,
        async (i) => {
          const r = await imagePipeline.renderForExport(pages[i], opts.dpi, opts.quality);
          return { jpeg: r.base64, widthPt: r.widthPt, heightPt: r.heightPt };
        },
        {
          title,
          watermark: opts.watermark ? winAnsi(opts.watermark) || undefined : undefined,
          onProgress: opts.onProgress,
        }
      );
      const b64 = await doc.saveAsBase64();
      await FileSystem.writeAsStringAsync(target, b64, { encoding: FileSystem.EncodingType.Base64 });
      return target;
    } catch (err) {
      console.warn('[ExportService] pdf-lib export failed, falling back to expo-print', err);
      return this.generatePdfWithPrint(title, pages, opts, dir);
    }
  }

  /**
   * Fallback: expo-print. One page size for the whole document (the size of
   * the first page); the rendered images still fill each page edge to edge.
   */
  private async generatePdfWithPrint(title: string, pages: DocumentPage[], opts: ExportOptions, dir: string): Promise<string> {
    const parts: string[] = [];
    let size = { widthPt: 595.28, heightPt: 841.89 };
    for (let i = 0; i < pages.length; i++) {
      const r = await imagePipeline.renderForExport(pages[i], opts.dpi, opts.quality);
      if (i === 0) size = { widthPt: r.widthPt, heightPt: r.heightPt };
      const wm = opts.watermark ? `<div class="wm">${escapeHtml(opts.watermark)}</div>` : '';
      parts.push(`<div class="page"><img src="data:image/jpeg;base64,${r.base64}" />${wm}</div>`);
      opts.onProgress?.(i + 1, pages.length);
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
@page { size: ${size.widthPt}pt ${size.heightPt}pt; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
.page { width: ${size.widthPt}pt; height: ${size.heightPt}pt; position: relative; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: avoid; }
img { width: 100%; height: 100%; object-fit: fill; display: block; }
.wm { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font: 800 48px -apple-system, sans-serif; color: rgba(220,20,60,0.2); white-space: nowrap; }
</style></head><body>${parts.join('')}</body></html>`;
    const { uri } = await Print.printToFileAsync({ html, width: size.widthPt, height: size.heightPt });
    const target = `${dir}${sanitizeFileName(title)}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: target });
    return target;
  }

  /** Renders one page as JPG at the chosen DPI / quality. */
  async generateJpg(title: string, page: DocumentPage, pageIndex: number, opts: ExportOptions): Promise<string> {
    const dir = await this.freshExportDir();
    const r = await imagePipeline.renderForExport(page, opts.dpi, opts.quality);
    const target = `${dir}${sanitizeFileName(title)}${pageIndex > 0 ? `-${pageIndex + 1}` : ''}.jpg`;
    await FileSystem.writeAsStringAsync(target, r.base64, { encoding: FileSystem.EncodingType.Base64 });
    opts.onProgress?.(1, 1);
    return target;
  }

  /**
   * Native iOS share sheet. The exported file is deleted as soon as the sheet
   * is closed (expo-sharing resolves on dismissal, after the target app or
   * "Save to Files" has taken its copy) – no readable PDF/JPG copy stays in
   * the app cache.
   *
   * JPGs are shared without a declared type: expo-sharing re-stages a file
   * whose extension differs from the type's preferred one ("public.jpeg" →
   * .jpeg) as a hard link "Scan.jpg.jpeg" in its own cache, which would
   * survive the deletion below until the next share. iOS derives the type
   * from the .jpg extension.
   */
  async shareDocument(uri: string, format: ExportFormat, dialogTitle?: string): Promise<void> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(
        uri,
        format === 'pdf' ? { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle } : { dialogTitle }
      );
    } finally {
      await this.discardExport(uri);
    }
  }

  /** Deletes an export (its whole per-export folder below the export directory). */
  async discardExport(uri: string): Promise<void> {
    const target = exportFolderOf(uri, storageService.exportDir);
    if (!target) return;
    try {
      await FileSystem.deleteAsync(target, { idempotent: true });
    } catch (err) {
      console.warn('[ExportService] Could not delete the exported file:', err);
    }
  }

  /** Estimated size (rough, from measured JPEG sizes per page). */
  estimateBytes(pageCount: number, format: ExportFormat, dpi: ExportDpi, quality: ExportQuality): number {
    const kb = format === 'pdf' ? estimatePdfKb(pageCount, dpi, quality) : (ESTIMATED_PAGE_KB[dpi] ?? ESTIMATED_PAGE_KB[200])[quality];
    return kb * 1024;
  }

  formatBytes(bytes: number, locale: 'de' | 'en'): string {
    const sep = (s: string) => (locale === 'de' ? s.replace('.', ',') : s);
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${sep((bytes / (1024 * 1024)).toFixed(1))} MB`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export const exportService = new ExportService();
