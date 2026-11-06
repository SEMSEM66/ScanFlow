import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  ALL_FEATURES,
  FREE_FEATURES,
  PRO_FEATURES,
  getEntitlementMode,
  isFreeFeature,
  isProFeature,
  isUnlocked,
  setEntitlementMode,
  subscribeEntitlements,
  type FeatureKey,
} from '../src/entitlements';

describe('entitlements (M0 foundation)', () => {
  beforeEach(() => {
    setEntitlementMode('all_unlocked');
  });

  it('keeps FREE_FEATURES and PRO_FEATURES disjoint and exhaustive', () => {
    const freeSet = new Set<string>(FREE_FEATURES);
    const proSet = new Set<string>(PRO_FEATURES);
    for (const f of FREE_FEATURES) {
      expect(proSet.has(f)).toBe(false);
      expect(isFreeFeature(f)).toBe(true);
      expect(isProFeature(f)).toBe(false);
    }
    for (const p of PRO_FEATURES) {
      expect(freeSet.has(p)).toBe(false);
      expect(isProFeature(p)).toBe(true);
      expect(isFreeFeature(p)).toBe(false);
    }
    expect(ALL_FEATURES.length).toBe(FREE_FEATURES.length + PRO_FEATURES.length);
  });

  it('unlocks every feature by default in all_unlocked mode', () => {
    expect(getEntitlementMode()).toBe('all_unlocked');
    for (const feature of ALL_FEATURES) {
      expect(isUnlocked(feature)).toBe(true);
    }
  });

  it('never locks free features (scan, filters, folders, pdf_jpg_export, title_search, app_lock) in free mode', () => {
    setEntitlementMode('free');
    for (const freeFeature of FREE_FEATURES) {
      expect(isUnlocked(freeFeature)).toBe(true);
    }
    for (const proFeature of PRO_FEATURES) {
      expect(isUnlocked(proFeature)).toBe(false);
    }
  });

  it('unlocks all Pro features in pro mode', () => {
    setEntitlementMode('pro');
    for (const feature of ALL_FEATURES) {
      expect(isUnlocked(feature)).toBe(true);
    }
  });

  it('fails closed on an unknown feature key', () => {
    expect(isUnlocked('unknown_feature' as FeatureKey)).toBe(false);
  });

  it('notifies subscribers only when the mode changes', () => {
    let calls = 0;
    const unsubscribe = subscribeEntitlements(() => {
      calls += 1;
    });
    setEntitlementMode('all_unlocked'); // no change
    expect(calls).toBe(0);
    setEntitlementMode('free');
    expect(calls).toBe(1);
    setEntitlementMode('pro');
    expect(calls).toBe(2);
    unsubscribe();
    setEntitlementMode('free');
    expect(calls).toBe(2);
  });
});
