import { describe, expect, it } from '@jest/globals';
import {
  FREE_FEATURES,
  PRO_FEATURES,
  PRO_PRODUCT_IDS,
  isFreeFeature,
  isProFeature,
  isUnlocked,
  setEntitlementMode,
  getEntitlementMode,
  subscribeEntitlements,
  type FeatureKey,
} from '../src/entitlements';

describe('Monetization & Entitlements (M5)', () => {
  it('correctly partitions Free and Pro feature keys', () => {
    for (const freeKey of FREE_FEATURES) {
      expect(isFreeFeature(freeKey as FeatureKey)).toBe(true);
      expect(isProFeature(freeKey as FeatureKey)).toBe(false);
    }

    for (const proKey of PRO_FEATURES) {
      expect(isProFeature(proKey as FeatureKey)).toBe(true);
      expect(isFreeFeature(proKey as FeatureKey)).toBe(false);
    }
  });

  it('guarantees all Free features are NEVER locked in any entitlement mode', () => {
    const modes = ['free', 'pro', 'all_unlocked'] as const;

    for (const mode of modes) {
      setEntitlementMode(mode);
      expect(getEntitlementMode()).toBe(mode);

      for (const freeFeature of FREE_FEATURES) {
        expect(isUnlocked(freeFeature as FeatureKey)).toBe(true);
      }
    }
  });

  it('gates Pro features in free mode and unlocks them in pro mode', () => {
    // In free mode: Pro features MUST be locked
    setEntitlementMode('free');
    for (const proFeature of PRO_FEATURES) {
      expect(isUnlocked(proFeature as FeatureKey)).toBe(false);
    }

    // In pro mode: Pro features MUST be unlocked
    setEntitlementMode('pro');
    for (const proFeature of PRO_FEATURES) {
      expect(isUnlocked(proFeature as FeatureKey)).toBe(true);
    }

    // In all_unlocked mode (pre-M5 / development): Pro features are unlocked
    setEntitlementMode('all_unlocked');
    for (const proFeature of PRO_FEATURES) {
      expect(isUnlocked(proFeature as FeatureKey)).toBe(true);
    }
  });

  it('notifies subscribers upon entitlement changes', () => {
    let callCount = 0;
    const unsub = subscribeEntitlements(() => {
      callCount += 1;
    });

    setEntitlementMode('free');
    expect(callCount).toBe(1);

    setEntitlementMode('pro');
    expect(callCount).toBe(2);

    // No-op if mode is unchanged
    setEntitlementMode('pro');
    expect(callCount).toBe(2);

    unsub();
    setEntitlementMode('free');
    expect(callCount).toBe(2);
  });

  it('defines valid StoreKit 2 product identifiers for yearly, monthly, and lifetime', () => {
    expect(PRO_PRODUCT_IDS.yearly).toBe('com.scanflow.app.pro.yearly');
    expect(PRO_PRODUCT_IDS.monthly).toBe('com.scanflow.app.pro.monthly');
    expect(PRO_PRODUCT_IDS.lifetime).toBe('com.scanflow.app.pro.lifetime');
  });
});
