import * as QuickActions from 'expo-quick-actions';

export type QuickActionItem = QuickActions.Action;

export class QuickActionService {
  /** Check if the current device/runtime supports Home Screen Quick Actions. */
  async isSupported(): Promise<boolean> {
    try {
      return await QuickActions.isSupported();
    } catch {
      return false;
    }
  }

  /**
   * Registers dynamic Quick Actions on iOS.
   * Safe to call in Expo Go (resolves silently without error).
   */
  async setActions(actions: QuickActionItem[]): Promise<void> {
    try {
      await QuickActions.setItems(actions);
    } catch (err) {
      console.warn('[QuickActionService] Could not set quick actions:', err);
    }
  }

  /** Returns the initial action that launched the app, if any. */
  getInitial(): QuickActionItem | null {
    return (QuickActions.initial as QuickActionItem | undefined) ?? null;
  }

  /** Subscribes to runtime Quick Action events while the app is active. */
  addListener(listener: (action: QuickActionItem) => void): { remove: () => void } {
    try {
      return QuickActions.addListener(listener);
    } catch {
      return { remove: () => {} };
    }
  }
}

export const quickActionService = new QuickActionService();
