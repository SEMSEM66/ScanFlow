import * as StoreReview from 'expo-store-review';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const KEY_EXPORT_COUNT = 'scanflow_export_count';
const KEY_REVIEW_VERSION = 'scanflow_review_requested_version';

const SECURE_STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export class ReviewService {
  /**
   * Records a successful document export (PDF, Word, or JPG).
   * Automatically requests an App Store review after the 3rd export,
   * rate-limited to once per app version.
   */
  async recordSuccessfulExport(): Promise<void> {
    try {
      const rawCount = await SecureStore.getItemAsync(KEY_EXPORT_COUNT, SECURE_STORE_OPTS);
      const count = (parseInt(rawCount ?? '0', 10) || 0) + 1;
      await SecureStore.setItemAsync(KEY_EXPORT_COUNT, String(count), SECURE_STORE_OPTS);

      if (count === 3) {
        await this.promptIfEligible();
      }
    } catch (err) {
      console.warn('[ReviewService] Could not record export count:', err);
    }
  }

  private async promptIfEligible(): Promise<void> {
    try {
      const currentVersion = Constants.expoConfig?.version ?? '2.0.0';
      const promptedVersion = await SecureStore.getItemAsync(KEY_REVIEW_VERSION, SECURE_STORE_OPTS);

      if (promptedVersion === currentVersion) {
        return; // Already prompted for this version
      }

      const available = await StoreReview.isAvailableAsync();
      const hasAction = await StoreReview.hasAction();
      if (available && hasAction) {
        await StoreReview.requestReview();
        await SecureStore.setItemAsync(KEY_REVIEW_VERSION, currentVersion, SECURE_STORE_OPTS);
      }
    } catch (err) {
      console.warn('[ReviewService] requestReview failed:', err);
    }
  }
}

export const reviewService = new ReviewService();
