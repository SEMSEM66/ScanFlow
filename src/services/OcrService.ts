import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { ScanFlowOcr } from '../../modules/scanflow-ocr';
import { base64ToUint8, extractPdfTextFromBytes, type DocxPageInput } from '../docx';
import { OcrScheduler, type OcrCandidate, type OcrEvent } from '../ocr/scheduler';
import { ocrKey, pageText } from '../ocr/text';
import type { OcrLine, PageTextRecord } from '../ocr/types';
import { linesFromVision } from '../ocr/vision';
import type { DocumentPage } from '../types';
import { documentRepository } from './DocumentRepository';
import { imagePipeline } from './ImagePipelineService';
import { pageTextRepository, type OcrStats } from './PageTextRepository';
import { smartNamingService } from './SmartNamingService';
import { storageService } from './StorageService';

/**
 * Text recognition (Phase C): Apple Vision through the local native module
 * modules/scanflow-ocr – fully on the device, no network. Not available in
 * Expo Go (the native module is missing there); everything else keeps working.
 *
 * New and changed pages are recognized in the background while the app is in
 * the foreground (one page at a time). The text feeds the library search, the
 * "copy text" screen and the invisible text layer of exported PDFs.
 */

const ENABLED_KEY = 'scanflow_ocr_enabled';
export const OCR_ENGINE = 'apple-vision';
/** Recognition languages in priority order. */
export const OCR_LANGUAGES = ['de-DE', 'en-US'];
/** Smallest text height relative to the page height (Vision default 1/32 would skip small print). */
export const OCR_MIN_TEXT_HEIGHT = 0.008;

type Listener = (event: OcrEvent) => void;

type PageState = Pick<DocumentPage, 'id' | 'originalUri' | 'proxyUri' | 'corners' | 'rotation' | 'filter' | 'pageFormat' | 'adjustments'>;

export const ocrKeyOf = (p: Pick<DocumentPage, 'originalUri' | 'corners' | 'rotation'>) =>
  ocrKey({ originalUri: p.originalUri, corners: p.corners, rotation: p.rotation });

export class OcrService {
  private enabled: boolean | null = null;
  private listeners = new Set<Listener>();
  private started = false;
  private readonly scheduler = new OcrScheduler({
    listPending: () => pageTextRepository.pending(),
    process: (c) => this.processCandidate(c),
    canRun: async () => this.available && AppState.currentState === 'active' && (await this.isEnabled()),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onEvent: (e) => this.emit(e),
    onError: (c, err) => console.warn(`[OcrService] Page ${c.pageId} not recognized:`, err),
  });

  /** The native module is present (installed app, not Expo Go). */
  get available(): boolean {
    return ScanFlowOcr !== null;
  }

  get isRunning(): boolean {
    return this.scheduler.isRunning;
  }

  get currentPageId(): string | null {
    return this.scheduler.currentPageId;
  }

  async isEnabled(): Promise<boolean> {
    if (this.enabled === null) {
      try {
        this.enabled = (await SecureStore.getItemAsync(ENABLED_KEY)) !== 'false';
      } catch {
        this.enabled = true;
      }
    }
    return this.enabled;
  }

  async setEnabled(value: boolean): Promise<void> {
    this.enabled = value;
    try {
      await SecureStore.setItemAsync(ENABLED_KEY, value ? 'true' : 'false');
    } catch (err) {
      console.warn('[OcrService] Could not save the OCR setting:', err);
    }
    if (value) {
      this.scheduler.resetFailures();
      this.kick(300);
    } else {
      this.scheduler.cancel();
    }
    this.emit({ type: 'state', running: this.scheduler.isRunning });
  }

  /** Starts background recognition (app start); resumes whenever the app returns to the foreground. */
  start(): void {
    if (this.started || !this.available) return;
    this.started = true;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') this.kick();
    });
    this.kick(2500);
  }

  /** Something changed (new scan, edit, screen focus): process pending pages soon. */
  kick(delayMs?: number): void {
    if (!this.available) return;
    this.scheduler.kick(delayMs);
  }

  /** Recognize this document's pages first (e.g. while it is open). */
  prioritize(documentId: string | null): void {
    this.scheduler.prioritize(documentId);
  }

  /** Pauses background recognition (export runs); call the result to resume. */
  hold(): () => void {
    return this.scheduler.hold();
  }

  /** Lets pages that failed before be tried again. */
  retryFailed(): void {
    this.scheduler.resetFailures();
    this.kick(300);
  }

  hasFailed(page: Pick<DocumentPage, 'id' | 'originalUri' | 'corners' | 'rotation'>): boolean {
    return this.scheduler.hasFailed(page.id, ocrKeyOf(page));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: OcrEvent): void {
    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        console.warn('[OcrService] listener failed', err);
      }
    });
  }

  stats(): Promise<OcrStats> {
    return pageTextRepository.stats();
  }

  /** Up-to-date stored text of the given pages of a document (by page id). */
  async textForDocument(
    documentId: string,
    pages: Pick<DocumentPage, 'id' | 'originalUri' | 'corners' | 'rotation'>[]
  ): Promise<Map<string, PageTextRecord>> {
    const stored = await pageTextRepository.getForDocument(documentId);
    const fresh = new Map<string, PageTextRecord>();
    for (const p of pages) {
      const r = stored.get(p.id);
      if (r && r.key === ocrKeyOf(p)) fresh.set(p.id, r);
    }
    return fresh;
  }

  /**
   * Text layer of a page for the PDF export: the stored text if it is up to
   * date, otherwise recognized now (when OCR is on and available). null = no
   * text layer for this page.
   */
  async linesForExport(page: PageState): Promise<OcrLine[] | null> {
    const key = ocrKeyOf(page);
    const stored = await pageTextRepository.get(page.id);
    if (stored && stored.key === key) return stored.lines;
    if (!this.available || !(await this.isEnabled())) return null;
    const lines = await this.recognize(page);
    await this.saveIfCurrent(page.id, key, lines);
    return lines;
  }

  /**
   * Text lines of a page for explicit Word (.docx) conversion: uses stored text
   * if current, otherwise runs on-device OCR when available.
   */
  async linesForWordExport(page: PageState): Promise<OcrLine[] | null> {
    const key = ocrKeyOf(page);
    const stored = await pageTextRepository.get(page.id);
    if (stored && stored.key === key) return stored.lines;
    if (!this.available) return null;
    const lines = await this.recognize(page);
    await this.saveIfCurrent(page.id, key, lines);
    return lines;
  }

  /**
   * Extracts text and layout lines from an external PDF file (file:// URI).
   * Uses native PDFKit + Apple Vision in the installed IPA (supporting both
   * digital and scanned image-only PDFs), and falls back to the pure-TS PDF
   * stream extractor in Expo Go.
   */
  async recognizePdfFile(pdfUri: string): Promise<DocxPageInput[]> {
    const native = ScanFlowOcr;
    if (native && typeof native.recognizePdfAsync === 'function') {
      const result = await native.recognizePdfAsync(pdfUri, {
        languages: OCR_LANGUAGES,
        level: 'accurate',
        usesLanguageCorrection: true,
        minimumTextHeight: OCR_MIN_TEXT_HEIGHT,
      });
      const pages: DocxPageInput[] = result.pages.map((p, idx) => {
        const lines = linesFromVision({
          width: p.width,
          height: p.height,
          languages: p.languages,
          lines: p.lines,
        });
        const text = lines.length > 0 ? pageText(lines) : (p.embeddedText ?? '').trim();
        return {
          pageNumber: idx + 1,
          lines,
          text,
        };
      });

      // If any page still has no text, check pure-TS PDF stream extraction as fallback
      if (pages.some((p) => (!p.lines || p.lines.length === 0) && !p.text)) {
        try {
          const b64 = await FileSystem.readAsStringAsync(pdfUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const fallbackPages = await extractPdfTextFromBytes(base64ToUint8(b64));
          for (let i = 0; i < pages.length && i < fallbackPages.length; i++) {
            const cur = pages[i];
            const fb = fallbackPages[i];
            if ((!cur.lines || cur.lines.length === 0) && !cur.text && (fb.lines.length > 0 || fb.text)) {
              pages[i] = {
                pageNumber: i + 1,
                lines: fb.lines,
                text: fb.text,
              };
            }
          }
        } catch {
          // ignore fallback parse error
        }
      }
      return pages;
    }

    // Expo Go fallback: pure-TS PDF text stream extraction
    const b64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const extracted = await extractPdfTextFromBytes(base64ToUint8(b64));
    return extracted.map((p) => ({
      pageNumber: p.pageNumber,
      lines: p.lines,
      text: p.text,
    }));
  }

  /** Deletes all recognized text (settings). */
  async clearAll(): Promise<void> {
    await pageTextRepository.deleteAll();
    this.emit({ type: 'state', running: this.scheduler.isRunning });
  }

  private async processCandidate(c: OcrCandidate): Promise<void> {
    const page = await documentRepository.getPage(c.pageId);
    if (!page) return; // deleted meanwhile
    const key = ocrKeyOf(page);
    const lines = await this.recognize(page);
    await this.saveIfCurrent(page.id, key, lines);
  }

  /** Saves unless the page was deleted or edited (crop, rotation, retake) during recognition. */
  private async saveIfCurrent(pageId: string, key: string, lines: OcrLine[]): Promise<void> {
    if (!(await this.isEnabled())) return; // switched off meanwhile
    const now = await documentRepository.getPage(pageId);
    if (!now || ocrKeyOf(now) !== key) return;
    await pageTextRepository.save(pageId, { key, engine: OCR_ENGINE, languages: OCR_LANGUAGES, lines });
    if (now.pageNumber === 1 && lines.length > 0) {
      void smartNamingService.onPageOcrCompleted(now.documentId, 1, pageText(lines));
    }
  }

  private async recognize(page: PageState): Promise<OcrLine[]> {
    const native = ScanFlowOcr;
    if (!native) throw new Error('Text recognition is not available in this build');
    const image = await imagePipeline.renderForOcr(page);
    try {
      const result = await native.recognizeAsync(image.uri, {
        languages: OCR_LANGUAGES,
        level: 'accurate',
        usesLanguageCorrection: true,
        minimumTextHeight: OCR_MIN_TEXT_HEIGHT,
      });
      return linesFromVision(result);
    } finally {
      await storageService.deleteTempFile(image.uri);
    }
  }
}

export const ocrService = new OcrService();
