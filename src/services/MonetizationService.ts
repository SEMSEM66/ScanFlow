import * as SecureStore from 'expo-secure-store';
import { ScanFlowOcr, type NativeStoreProduct } from '../../modules/scanflow-ocr';
import { PRO_PRODUCT_IDS, type ProProductId } from '../entitlements';

export { PRO_PRODUCT_IDS, type ProProductId };

export interface StoreProduct {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  period?: string;
  badge?: string;
}

const SECURE_STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const KEY_CACHED_PRO = 'scanflow_pro_entitlement';
const KEY_DEV_MOCK = 'scanflow_dev_pro_mock';

export class MonetizationService {
  private isPro = false;
  private initialized = false;
  private listeners: Set<(isPro: boolean) => void> = new Set();

  /** True if native StoreKit 2 functions are linked in the binary (IPA build). */
  get isStoreKitAvailable(): boolean {
    return (
      Boolean(ScanFlowOcr) &&
      typeof ScanFlowOcr?.purchaseProductAsync === 'function' &&
      typeof ScanFlowOcr?.checkEntitlementsAsync === 'function'
    );
  }

  /**
   * Initializes monetization by loading cached entitlement from Keychain and
   * syncing with StoreKit 2 in the background.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      // 1. Read offline cached entitlement
      const cached = await SecureStore.getItemAsync(KEY_CACHED_PRO, SECURE_STORE_OPTS);
      const devMock = await SecureStore.getItemAsync(KEY_DEV_MOCK, SECURE_STORE_OPTS);
      if (devMock === 'true') {
        this.isPro = true;
      } else if (cached === 'true') {
        this.isPro = true;
      }

      // 2. Query StoreKit 2 if available
      if (this.isStoreKitAvailable && ScanFlowOcr?.checkEntitlementsAsync) {
        const result = await ScanFlowOcr.checkEntitlementsAsync();
        this.setProState(result.isPro);
      }
    } catch (err) {
      console.warn('[MonetizationService] init failed:', err);
    } finally {
      this.initialized = true;
    }
  }

  /** Synchronous check whether ScanFlow Pro features are currently unlocked. */
  isProUnlocked(): boolean {
    return this.isPro;
  }

  /** Subscribes to entitlement changes. */
  subscribe(listener: (isPro: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setProState(val: boolean): void {
    this.isPro = val;
    void SecureStore.setItemAsync(KEY_CACHED_PRO, val ? 'true' : 'false', SECURE_STORE_OPTS);
    for (const listener of this.listeners) {
      try {
        listener(val);
      } catch (err) {
        console.error('[MonetizationService] Listener error:', err);
      }
    }
  }

  /** Fetches localized products from Apple StoreKit 2 or returns default pricing. */
  async fetchProducts(): Promise<StoreProduct[]> {
    const defaultProducts: StoreProduct[] = [
      {
        id: PRO_PRODUCT_IDS.yearly,
        displayName: 'ScanFlow Pro (Jährlich)',
        description: '7 Tage kostenlos, danach 19,99 € / Jahr',
        displayPrice: '19,99 €',
        price: 19.99,
        period: '1 Jahr',
        badge: '7 Tage gratis',
      },
      {
        id: PRO_PRODUCT_IDS.monthly,
        displayName: 'ScanFlow Pro (Monatlich)',
        description: '2,99 € / Monat, jederzeit kündbar',
        displayPrice: '2,99 €',
        price: 2.99,
        period: '1 Monat',
      },
      {
        id: PRO_PRODUCT_IDS.lifetime,
        displayName: 'ScanFlow Pro Lifetime',
        description: 'Einmalig 49,99 € für immer',
        displayPrice: '49,99 €',
        price: 49.99,
        badge: 'Einmalzahlung',
      },
    ];

    if (!this.isStoreKitAvailable || !ScanFlowOcr?.fetchProductsAsync) {
      return defaultProducts;
    }

    try {
      const nativeList: NativeStoreProduct[] = await ScanFlowOcr.fetchProductsAsync(
        Object.values(PRO_PRODUCT_IDS)
      );
      if (!nativeList || nativeList.length === 0) return defaultProducts;

      return nativeList.map((p) => {
        const isYearly = p.id === PRO_PRODUCT_IDS.yearly;
        const isLifetime = p.id === PRO_PRODUCT_IDS.lifetime;
        return {
          id: p.id,
          displayName: p.displayName,
          description: p.description,
          displayPrice: p.displayPrice,
          price: p.price,
          period: p.period,
          badge: isYearly ? '7 Tage gratis' : isLifetime ? 'Einmalzahlung' : undefined,
        };
      });
    } catch (err) {
      console.warn('[MonetizationService] fetchProducts error:', err);
      return defaultProducts;
    }
  }

  /** Triggers StoreKit 2 native purchase sheet. */
  async purchase(productId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isStoreKitAvailable || !ScanFlowOcr?.purchaseProductAsync) {
      // In Expo Go or mock environment: simulate unlock for testing
      this.setProState(true);
      return { success: true };
    }

    try {
      const result = await ScanFlowOcr.purchaseProductAsync(productId);
      if (result.status === 'success') {
        this.setProState(true);
        return { success: true };
      }
      if (result.status === 'cancelled') {
        return { success: false, error: 'cancelled' };
      }
      return { success: false, error: result.error ?? result.status };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /** Restores existing purchases via AppStore.sync() */
  async restorePurchases(): Promise<{ success: boolean; unlocked: boolean }> {
    if (!this.isStoreKitAvailable || !ScanFlowOcr?.restorePurchasesAsync) {
      return { success: true, unlocked: this.isPro };
    }

    try {
      const result = await ScanFlowOcr.restorePurchasesAsync();
      this.setProState(result.isPro);
      return { success: true, unlocked: result.isPro };
    } catch (err) {
      console.warn('[MonetizationService] restorePurchases failed:', err);
      return { success: false, unlocked: this.isPro };
    }
  }

  /** Developer toggle to test Pro unlock in Expo Go without Apple Pay. */
  async setDevMockPro(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(KEY_DEV_MOCK, enabled ? 'true' : 'false', SECURE_STORE_OPTS);
    this.setProState(enabled);
  }
}

export const monetizationService = new MonetizationService();
