import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';

let reduceMotion = false;

// Check reduce motion initially and subscribe to updates
if (typeof AccessibilityInfo?.isReduceMotionEnabled === 'function') {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      reduceMotion = enabled;
    })
    .catch(() => {
      reduceMotion = false;
    });

  AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
    reduceMotion = enabled;
  });
}

/**
 * Safe haptic feedback wrapper respecting user accessibility settings (Reduce Motion).
 * All methods catch and swallow any runtime errors to ensure UI actions never fail.
 */
export const haptics = {
  /** Subtle tick for segmented controls, filter pills, selection changes. */
  async selection(): Promise<void> {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Ignored
    }
  },

  /** Light impact for soft interactions (button taps, toggles). */
  async light(): Promise<void> {
    if (reduceMotion) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignored
    }
  },

  /** Medium impact for snapping corners, alignment locks, drag events. */
  async medium(): Promise<void> {
    if (reduceMotion) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Ignored
    }
  },

  /** Heavy impact for destructive action confirmations or major state changes. */
  async heavy(): Promise<void> {
    if (reduceMotion) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Ignored
    }
  },

  /** Notification pattern for successful operations (scan saved, backup completed). */
  async success(): Promise<void> {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Ignored
    }
  },

  /** Notification pattern for warnings or limit reaches (e.g. PIN attempt warning). */
  async warning(): Promise<void> {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Ignored
    }
  },

  /** Notification pattern for errors (e.g. wrong PIN, failed scan, locked document). */
  async error(): Promise<void> {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Ignored
    }
  },
};
