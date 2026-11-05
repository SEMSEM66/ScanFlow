import * as ScreenCapture from 'expo-screen-capture';

/** Tag for preventScreenCaptureAsync – other code may hold its own tags. */
const CAPTURE_TAG = 'scanflow-settings';

/**
 * Native privacy switches of expo-screen-capture (work in Expo Go):
 *  - app-switcher protection: iOS blurs the whole window – including open
 *    sheets, the document scanner and the share sheet – whenever the app
 *    resigns active (app switcher, Control Center, Face ID prompt). The blur
 *    is native, so it is in place before iOS takes the app-switcher snapshot.
 *  - screen-capture protection: screenshots and recordings of the app window
 *    come out black.
 * All calls are best effort – the app must keep working if one fails.
 */
class PrivacyService {
  private appSwitcherApplied: boolean | null = null;
  private captureApplied: boolean | null = null;

  async setAppSwitcherProtection(enabled: boolean): Promise<boolean> {
    if (this.appSwitcherApplied === enabled) return true;
    try {
      if (enabled) await ScreenCapture.enableAppSwitcherProtectionAsync(1);
      else await ScreenCapture.disableAppSwitcherProtectionAsync();
      this.appSwitcherApplied = enabled;
      return true;
    } catch (err) {
      console.warn('[PrivacyService] App switcher protection could not be changed:', err);
      return false;
    }
  }

  /** false when iOS refused (e.g. no key window yet) – call again later. */
  async setScreenCaptureProtection(enabled: boolean): Promise<boolean> {
    if (this.captureApplied === enabled) return true;
    try {
      if (enabled) await ScreenCapture.preventScreenCaptureAsync(CAPTURE_TAG);
      else await ScreenCapture.allowScreenCaptureAsync(CAPTURE_TAG);
      this.captureApplied = enabled;
      return true;
    } catch (err) {
      console.warn('[PrivacyService] Screen capture protection could not be changed:', err);
      return false;
    }
  }

  isScreenCaptureProtected(): boolean {
    return this.captureApplied === true;
  }
}

export const privacyService = new PrivacyService();
