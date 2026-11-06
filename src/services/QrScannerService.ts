import * as SecureStore from 'expo-secure-store';
import { toScannedCode, type ScannedCode } from '../tools/barcode';

const CONFIG_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const QR_HISTORY_ENABLED_KEY = 'scanflow_qr_history_enabled';
const QR_HISTORY_ITEMS_KEY = 'scanflow_qr_history_items';
const MAX_HISTORY_ITEMS = 25;

export interface QrHistoryEntry {
  id: string;
  raw: string;
  type: string;
  scannedAt: number;
  code: ScannedCode;
}

interface StoredQrItem {
  id: string;
  raw: string;
  type: string;
  scannedAt: number;
}

/**
 * Manages the optional local QR/barcode scan history.
 * Privacy rule: OFF by default; turning it off or tapping "Clear" deletes all
 * stored entries immediately.
 */
class QrScannerService {
  async isHistoryEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(QR_HISTORY_ENABLED_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  async setHistoryEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(QR_HISTORY_ENABLED_KEY, enabled ? 'true' : 'false', CONFIG_OPTS);
    if (!enabled) {
      await this.clearHistory();
    }
  }

  async getHistory(): Promise<QrHistoryEntry[]> {
    try {
      const enabled = await this.isHistoryEnabled();
      if (!enabled) return [];
      const json = await SecureStore.getItemAsync(QR_HISTORY_ITEMS_KEY);
      if (!json) return [];
      const parsed = JSON.parse(json) as StoredQrItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => ({
        id: item.id,
        raw: item.raw,
        type: item.type,
        scannedAt: item.scannedAt,
        code: toScannedCode(item.raw, item.type),
      }));
    } catch {
      return [];
    }
  }

  async recordScan(raw: string, type: string): Promise<void> {
    try {
      const enabled = await this.isHistoryEnabled();
      if (!enabled) return;
      const existing = await this.getHistory();
      const filtered = existing.filter((e) => e.raw !== raw);
      const next: StoredQrItem[] = [
        {
          id: `qr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          raw: raw.slice(0, 1024),
          type,
          scannedAt: Date.now(),
        },
        ...filtered.map((e) => ({
          id: e.id,
          raw: e.raw,
          type: e.type,
          scannedAt: e.scannedAt,
        })),
      ].slice(0, MAX_HISTORY_ITEMS);
      await SecureStore.setItemAsync(QR_HISTORY_ITEMS_KEY, JSON.stringify(next), CONFIG_OPTS);
    } catch {
      // ignore storage errors
    }
  }

  async clearHistory(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(QR_HISTORY_ITEMS_KEY, CONFIG_OPTS);
    } catch {
      // ignore
    }
  }
}

export const qrScannerService = new QrScannerService();
