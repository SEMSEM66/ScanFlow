import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const APP_LOCK_KEY = 'scanflow_app_lock_enabled';
const DEFAULT_QUALITY_KEY = 'scanflow_default_quality';

export class AuthService {
  async isAppLockEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(APP_LOCK_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  async setAppLockEnabled(enabled: boolean, promptMessage: string = 'ScanFlow entsperren'): Promise<boolean> {
    try {
      if (enabled) {
        // Authenticate first before enabling
        const auth = await this.authenticate(promptMessage);
        if (!auth) return false;
        await SecureStore.setItemAsync(APP_LOCK_KEY, 'true');
        return true;
      } else {
        // Authenticate before disabling
        const auth = await this.authenticate(promptMessage);
        if (!auth) return false;
        await SecureStore.deleteItemAsync(APP_LOCK_KEY);
        return true;
      }
    } catch (err) {
      console.error('[AuthService] Error toggling app lock:', err);
      return false;
    }
  }

  async authenticate(promptMessage: string = 'ScanFlow entsperren'): Promise<boolean> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        return true; // Graceful fallback if device has no biometrics set up
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: 'Geräte-Code verwenden',
        disableDeviceFallback: false,
      });

      return result.success;
    } catch (err) {
      console.error('[AuthService] Authentication error:', err);
      return false;
    }
  }

  async checkHardwareSupport(): Promise<{ hasHardware: boolean; isEnrolled: boolean }> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      return { hasHardware, isEnrolled };
    } catch {
      return { hasHardware: false, isEnrolled: false };
    }
  }

  async getDefaultQuality(): Promise<'low' | 'medium' | 'high'> {
    try {
      const val = await SecureStore.getItemAsync(DEFAULT_QUALITY_KEY);
      if (val === 'low' || val === 'medium' || val === 'high') {
        return val;
      }
      return 'high';
    } catch {
      return 'high';
    }
  }

  async setDefaultQuality(quality: 'low' | 'medium' | 'high'): Promise<void> {
    try {
      await SecureStore.setItemAsync(DEFAULT_QUALITY_KEY, quality);
    } catch (err) {
      console.warn('[AuthService] Error saving default quality:', err);
    }
  }
}

export const authService = new AuthService();
