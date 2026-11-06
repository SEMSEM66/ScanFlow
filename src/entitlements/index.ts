/**
 * Central feature-gating and entitlement layer (M0 / M5).
 *
 * Pure TypeScript (no React or Expo imports) so it can be unit-tested in Node
 * and imported by both services and UI components.
 *
 * Until Milestone M5 (StoreKit 2 monetization) is activated, the default mode
 * is `'all_unlocked'`, so `isUnlocked(feature)` returns `true` for every
 * feature while keeping a single source of truth across the codebase.
 *
 * Core guarantee (Definition of Done #3 & M5):
 * Scanning, filters, folders, basic PDF/JPG export of any existing document,
 * basic title search, and app lock are in `FREE_FEATURES` and are NEVER gated.
 */

export const FREE_FEATURES = [
  'scan',
  'filters',
  'folders',
  'pdf_jpg_export',
  'title_search',
  'app_lock',
  'qr_scanner',
  'trash',
  'favorites_tags',
] as const;

export const PRO_FEATURES = [
  'ocr_search',
  'word_export',
  'pdf_import',
  'pdf_merge_split',
  'pdf_password',
  'batch_export',
  'id_card_mode',
  'signatures_annotations',
  'smart_naming',
  'backup_restore',
] as const;

export type FreeFeatureKey = (typeof FREE_FEATURES)[number];
export type ProFeatureKey = (typeof PRO_FEATURES)[number];
export type FeatureKey = FreeFeatureKey | ProFeatureKey;

export const ALL_FEATURES: readonly FeatureKey[] = [...FREE_FEATURES, ...PRO_FEATURES];

export const PRO_PRODUCT_IDS = {
  yearly: 'com.scanflow.app.pro.yearly',
  monthly: 'com.scanflow.app.pro.monthly',
  lifetime: 'com.scanflow.app.pro.lifetime',
} as const;

export type ProProductId = (typeof PRO_PRODUCT_IDS)[keyof typeof PRO_PRODUCT_IDS];

const PRO_SET: ReadonlySet<string> = new Set<string>(PRO_FEATURES);
const FREE_SET: ReadonlySet<string> = new Set<string>(FREE_FEATURES);

/**
 * `'all_unlocked'` – pre-M5 default (everything unlocked).
 * `'pro'`          – active ScanFlow Pro entitlement (everything unlocked).
 * `'free'`         – free tier (only `FREE_FEATURES` unlocked).
 */
export type EntitlementMode = 'all_unlocked' | 'pro' | 'free';

let currentMode: EntitlementMode = 'all_unlocked';
const listeners = new Set<() => void>();

export function isProFeature(feature: FeatureKey): feature is ProFeatureKey {
  return PRO_SET.has(feature);
}

export function isFreeFeature(feature: FeatureKey): feature is FreeFeatureKey {
  return FREE_SET.has(feature);
}

export function getEntitlementMode(): EntitlementMode {
  return currentMode;
}

export function setEntitlementMode(mode: EntitlementMode): void {
  if (currentMode === mode) return;
  currentMode = mode;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeEntitlements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Checks whether `feature` is currently unlocked.
 * Free features always return `true` regardless of `currentMode`.
 */
export function isUnlocked(feature: FeatureKey): boolean {
  if (FREE_SET.has(feature)) {
    return true;
  }
  if (!PRO_SET.has(feature)) {
    return false;
  }
  return currentMode === 'all_unlocked' || currentMode === 'pro';
}
