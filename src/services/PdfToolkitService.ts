import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ScanFlowOcr } from '../../modules/scanflow-ocr';
import { isUnlocked } from '../entitlements';
import { ocrService } from './OcrService';
import { saveScan } from './ScanImportService';
import { storageService } from './StorageService';

export type PdfImportOutcome =
  | { status: 'saved'; documentId: string; created: boolean; pageCount: number }
  | { status: 'unavailable' }
  | { status: 'locked' }
  | { status: 'failed'; message?: string };

export const PDF_IMPORT_DPI = 200;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'bmp', 'tif', 'tiff']);

/** Extracts a human-readable document title from a file URI or filename. */
export function titleFromFileUri(uriOrName: string, fallback = 'Dokument'): string {
  try {
    const rawLast = uriOrName.split('/').pop()?.split('?')[0] ?? uriOrName;
    const decoded = decodeURIComponent(rawLast);
    const withoutExt = decoded.replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim();
    return withoutExt.length > 0 ? withoutExt : fallback;
  } catch {
    return fallback;
  }
}

export function isPdfUri(uri: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase() === 'application/pdf') return true;
  const clean = uri.split('?')[0].toLowerCase();
  return clean.endsWith('.pdf');
}

export function isImageUri(uri: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith('image/')) return true;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export class PdfToolkitService {
  /**
   * True when native PDFKit page rasterization (`renderPdfPageAsync`) is
   * available (installed IPA build, not Expo Go).
   */
  get canImportPdf(): boolean {
    return (
      isUnlocked('pdf_import') &&
      ScanFlowOcr !== null &&
      typeof ScanFlowOcr.renderPdfPageAsync === 'function' &&
      typeof ScanFlowOcr.getPdfInfoAsync === 'function'
    );
  }

  /**
   * Imports a single PDF file into ScanFlow by rasterizing its pages serially
   * at 200 dpi (memory-safe even for 50+ page PDFs) and storing them as a
   * ScanFlow document, then kicking background OCR.
   */
  async importPdfFile(
    sourceUri: string,
    options: {
      title?: string;
      documentId?: string;
      onProgress?: (current: number, total: number) => void;
    } = {}
  ): Promise<PdfImportOutcome> {
    if (!this.canImportPdf) {
      await this.cleanupExternalCopy(sourceUri);
      return { status: 'unavailable' };
    }

    const native = ScanFlowOcr!;
    const resumeOcr = ocrService.hold();
    const renderedUris: string[] = [];
    let workingUri = sourceUri;

    try {
      // Ensure the source file is in a readable sandbox path; if it came from Documents/Inbox, copy to cache
      workingUri = await this.stageIntoCacheIfNeeded(sourceUri, 'pdf');

      const info = await native.getPdfInfoAsync!(workingUri);
      if (info.isLocked) {
        return { status: 'locked' };
      }
      if (!info || info.pageCount <= 0) {
        return { status: 'failed' };
      }

      const tempDir = await storageService.ensureDir(storageService.ocrTempDir);
      const batchId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      for (let i = 0; i < info.pageCount; i++) {
        options.onProgress?.(i + 1, info.pageCount);
        const pageUri = `${tempDir}pdf_import_${batchId}_p${i + 1}.jpg`;
        await native.renderPdfPageAsync!(workingUri, i, PDF_IMPORT_DPI, pageUri);
        renderedUris.push(pageUri);
        await yieldToUi();
      }

      const resolvedTitle =
        options.title?.trim() ||
        info.title?.trim() ||
        titleFromFileUri(sourceUri, 'PDF');

      const saved = await saveScan({
        uris: renderedUris,
        detect: false,
        defaultFilter: 'original',
        title: resolvedTitle,
        documentId: options.documentId,
        onProgress: options.onProgress,
      });

      return {
        status: 'saved',
        documentId: saved.documentId,
        created: saved.created,
        pageCount: saved.pageIds.length,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('password-locked')) {
        return { status: 'locked' };
      }
      console.error('[PdfToolkitService] importPdfFile failed:', err);
      return { status: 'failed', message: msg };
    } finally {
      for (const u of renderedUris) {
        await storageService.deleteTempFile(u);
      }
      await this.cleanupExternalCopy(sourceUri);
      if (workingUri !== sourceUri) {
        await storageService.deleteTempFile(workingUri);
      }
      resumeOcr();
      ocrService.kick(400);
    }
  }

  /**
   * Imports one or more image files (from Files picker or "Open in ScanFlow")
   * with edge detection enabled.
   */
  async importImageFiles(
    sourceUris: string[],
    options: {
      title: string;
      documentId?: string;
      onProgress?: (current: number, total: number) => void;
    }
  ): Promise<PdfImportOutcome> {
    const stagedUris: string[] = [];
    try {
      for (const u of sourceUris) {
        const ext = u.split('?')[0].split('.').pop() || 'jpg';
        stagedUris.push(await this.stageIntoCacheIfNeeded(u, ext));
      }
      const saved = await saveScan({
        uris: stagedUris,
        detect: true,
        title: options.title,
        documentId: options.documentId,
        onProgress: options.onProgress,
      });
      ocrService.kick(400);
      return {
        status: 'saved',
        documentId: saved.documentId,
        created: saved.created,
        pageCount: saved.pageIds.length,
      };
    } catch (err) {
      console.error('[PdfToolkitService] importImageFiles failed:', err);
      return { status: 'failed' };
    } finally {
      for (const u of sourceUris) {
        await this.cleanupExternalCopy(u);
      }
      for (const u of stagedUris) {
        await storageService.deleteTempFile(u);
      }
    }
  }

  /**
   * Opens the iOS Files picker (`expo-document-picker`) for PDFs and images,
   * then imports the chosen file(s) into ScanFlow.
   */
  async pickAndImportFiles(options: {
    defaultTitle: string;
    documentId?: string;
    onProgress?: (current: number, total: number) => void;
  }): Promise<PdfImportOutcome | { status: 'cancelled' }> {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets || picked.assets.length === 0) {
      return { status: 'cancelled' };
    }

    const pdfAssets = picked.assets.filter((a) => isPdfUri(a.name || a.uri, a.mimeType));
    const imageAssets = picked.assets.filter((a) => !isPdfUri(a.name || a.uri, a.mimeType));

    if (pdfAssets.length > 0 && !this.canImportPdf) {
      for (const asset of picked.assets) {
        await storageService.deleteTempFile(asset.uri);
      }
      return { status: 'unavailable' };
    }

    let lastOutcome: PdfImportOutcome | null = null;
    let targetDocId = options.documentId;

    if (imageAssets.length > 0) {
      const firstImageTitle =
        imageAssets.length === 1 && imageAssets[0].name
          ? titleFromFileUri(imageAssets[0].name, options.defaultTitle)
          : options.defaultTitle;
      const imgOutcome = await this.importImageFiles(
        imageAssets.map((a) => a.uri),
        {
          title: firstImageTitle,
          documentId: targetDocId,
          onProgress: options.onProgress,
        }
      );
      if (imgOutcome.status !== 'saved') {
        for (const pdf of pdfAssets) await storageService.deleteTempFile(pdf.uri);
        return imgOutcome;
      }
      lastOutcome = imgOutcome;
      if (options.documentId) {
        targetDocId = imgOutcome.documentId;
      }
    }

    for (const pdf of pdfAssets) {
      const pdfTitle = pdf.name ? titleFromFileUri(pdf.name, options.defaultTitle) : undefined;
      const pdfOutcome = await this.importPdfFile(pdf.uri, {
        title: pdfTitle,
        documentId: targetDocId,
        onProgress: options.onProgress,
      });
      if (pdfOutcome.status !== 'saved') {
        return pdfOutcome;
      }
      lastOutcome = pdfOutcome;
    }

    return lastOutcome ?? { status: 'cancelled' };
  }

  /**
   * Handles an incoming `file://` URL when a user selects "Open in ScanFlow"
   * or shares a PDF/image to ScanFlow from Files, Mail, Safari, etc.
   * Returns `null` if the URL is not a local file URL.
   */
  async handleIncomingUrl(
    url: string,
    options: {
      defaultTitle: string;
      onProgress?: (current: number, total: number) => void;
    }
  ): Promise<PdfImportOutcome | null> {
    if (!url || !url.startsWith('file://')) {
      return null;
    }
    if (isPdfUri(url)) {
      return this.importPdfFile(url, {
        title: titleFromFileUri(url, options.defaultTitle),
        onProgress: options.onProgress,
      });
    }
    if (isImageUri(url)) {
      return this.importImageFiles([url], {
        title: titleFromFileUri(url, options.defaultTitle),
        onProgress: options.onProgress,
      });
    }
    return null;
  }

  private async stageIntoCacheIfNeeded(uri: string, extension: string): Promise<string> {
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir && uri.startsWith(cacheDir)) {
      return uri;
    }
    const dir = await storageService.ensureDir(storageService.ocrTempDir);
    const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, '') || 'tmp';
    const target = `${dir}incoming_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${cleanExt}`;
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
  }

  /**
   * Cleans up temporary files in `cache/` or `Documents/Inbox/` (created by iOS
   * when opening a file from another app with `LSSupportsOpeningDocumentsInPlace = false`).
   */
  private async cleanupExternalCopy(uri: string): Promise<void> {
    if (!uri) return;
    await storageService.deleteTempFile(uri);
    const docDir = FileSystem.documentDirectory;
    if (docDir && uri.startsWith(`${docDir}Inbox/`) && !uri.includes('..')) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // ignore
      }
    }
  }
}

export const pdfToolkitService = new PdfToolkitService();
