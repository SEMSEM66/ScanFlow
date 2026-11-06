import * as SecureStore from 'expo-secure-store';
import { documentRepository } from './DocumentRepository';
import { folderRepository } from './FolderRepository';
import {
  DEFAULT_SMART_NAMING_TEMPLATE,
  formatSmartDocumentTitle,
} from '../utils/organization';

const TEMPLATE_KEY = 'scanflow_smart_naming_template';
const ENABLED_KEY = 'scanflow_smart_naming_enabled';

const CONFIG_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export class SmartNamingService {
  private templateCache: string | null = null;
  private enabledCache: boolean | null = null;

  async isEnabled(): Promise<boolean> {
    if (this.enabledCache !== null) return this.enabledCache;
    try {
      const val = await SecureStore.getItemAsync(ENABLED_KEY);
      this.enabledCache = val !== 'false';
    } catch {
      this.enabledCache = true;
    }
    return this.enabledCache;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabledCache = enabled;
    try {
      await SecureStore.setItemAsync(ENABLED_KEY, enabled ? 'true' : 'false', CONFIG_OPTS);
    } catch (err) {
      console.warn('[SmartNamingService] Could not save enabled state:', err);
    }
  }

  async getTemplate(): Promise<string> {
    if (this.templateCache !== null) return this.templateCache;
    try {
      const val = await SecureStore.getItemAsync(TEMPLATE_KEY);
      this.templateCache = val?.trim() || DEFAULT_SMART_NAMING_TEMPLATE;
    } catch {
      this.templateCache = DEFAULT_SMART_NAMING_TEMPLATE;
    }
    return this.templateCache;
  }

  async setTemplate(template: string): Promise<void> {
    const clean = template.trim() || DEFAULT_SMART_NAMING_TEMPLATE;
    this.templateCache = clean;
    try {
      await SecureStore.setItemAsync(TEMPLATE_KEY, clean, CONFIG_OPTS);
    } catch (err) {
      console.warn('[SmartNamingService] Could not save template:', err);
    }
  }

  /**
   * Called when OCR finishes recognizing page 1 of a document.
   * If auto-naming is enabled and the document still has `title_auto = 1`,
   * generates a smart title and updates the document without overwriting any user edit.
   */
  async onPageOcrCompleted(
    documentId: string,
    pageNumber: number,
    ocrText: string
  ): Promise<boolean> {
    if (pageNumber !== 1) return false;
    const enabled = await this.isEnabled();
    if (!enabled) return false;

    const existing = await documentRepository.getById(documentId);
    if (!existing || !existing.document.titleAuto) {
      return false; // Not found or title was already customized by the user
    }

    let folderName: string | null = null;
    if (existing.document.folderId) {
      const folder = await folderRepository.getById(existing.document.folderId);
      folderName = folder?.name ?? null;
    }

    const template = await this.getTemplate();
    const smartTitle = formatSmartDocumentTitle(template, {
      timestampMs: existing.document.createdAt,
      folderName,
      ocrText,
      counter: existing.pages.length,
    });

    return documentRepository.applySmartTitleIfAuto(documentId, smartTitle);
  }
}

export const smartNamingService = new SmartNamingService();
