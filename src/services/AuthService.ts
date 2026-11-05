import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const APP_LOCK_KEY = 'scanflow_app_lock_enabled';
const DEFAULT_QUALITY_KEY = 'scanflow_default_quality';
const DEFAULT_DPI_KEY = 'scanflow_default_dpi';
const PIN_CODE_KEY = 'scanflow_security_pin';
const LOCK_TIMEOUT_KEY = 'scanflow_lock_timeout_sec';
const SCREEN_CAPTURE_KEY = 'scanflow_prevent_screen_capture';
const SCANNER_MODE_KEY = 'scanflow_scanner_mode';

export type LockTimeoutOption = 0 | 60 | 300; // 0 = Immediately, 60 = 1 min, 300 = 5 min

/** 'system' = iOS document scanner (VisionKit), 'camera' = ScanFlow's own camera screen. */
export type ScannerMode = 'system' | 'camera';

class AuthService {
  private failedAttempts: number = 0;
  private lockoutUntil: number = 0;
  private lastBackgroundTimestamp: number = 0;

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
        const auth = await this.authenticate(promptMessage);
        if (!auth) return false;
        await SecureStore.setItemAsync(APP_LOCK_KEY, 'true');
        return true;
      } else {
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
      if (this.isLockedOut()) {
        return false;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        return true; // Fallback to PIN or pass
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: 'Sicherheits-Code verwenden',
        disableDeviceFallback: false,
      });

      if (result.success) {
        this.resetFailedAttempts();
        return true;
      } else {
        this.registerFailedAttempt();
        return false;
      }
    } catch (err) {
      console.error('[AuthService] Authentication error:', err);
      return false;
    }
  }

  // PIN Code Security
  async hasPinCode(): Promise<boolean> {
    try {
      const pin = await SecureStore.getItemAsync(PIN_CODE_KEY);
      return !!pin && pin.length >= 4;
    } catch {
      return false;
    }
  }

  async setPinCode(pin: string): Promise<void> {
    // Simple salted hash
    const salt = 'scanflow_salt_v1_';
    const hash = this.simpleHash(salt + pin);
    await SecureStore.setItemAsync(PIN_CODE_KEY, hash);
  }

  async verifyPinCode(pin: string): Promise<boolean> {
    if (this.isLockedOut()) {
      return false;
    }

    try {
      const storedHash = await SecureStore.getItemAsync(PIN_CODE_KEY);
      if (!storedHash) return false;

      const salt = 'scanflow_salt_v1_';
      const inputHash = this.simpleHash(salt + pin);

      if (inputHash === storedHash) {
        this.resetFailedAttempts();
        return true;
      } else {
        this.registerFailedAttempt();
        return false;
      }
    } catch {
      return false;
    }
  }

  async removePinCode(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(PIN_CODE_KEY);
    } catch (err) {
      console.warn('[AuthService] Error removing PIN:', err);
    }
  }

  // Rate Limiting & Brute Force Lockout
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }

  private registerFailedAttempt(): void {
    this.failedAttempts += 1;
    if (this.failedAttempts >= 5) {
      // 30 seconds penalty
      this.lockoutUntil = Date.now() + 30000;
    }
  }

  private resetFailedAttempts(): void {
    this.failedAttempts = 0;
    this.lockoutUntil = 0;
  }

  isLockedOut(): boolean {
    return Date.now() < this.lockoutUntil;
  }

  getRemainingLockoutSeconds(): number {
    const diff = this.lockoutUntil - Date.now();
    return Math.max(0, Math.ceil(diff / 1000));
  }

  // Lock Timeout Configuration
  async getLockTimeout(): Promise<LockTimeoutOption> {
    try {
      const val = await SecureStore.getItemAsync(LOCK_TIMEOUT_KEY);
      if (val === '60') return 60;
      if (val === '300') return 300;
      return 0;
    } catch {
      return 0;
    }
  }

  async setLockTimeout(timeout: LockTimeoutOption): Promise<void> {
    try {
      await SecureStore.setItemAsync(LOCK_TIMEOUT_KEY, String(timeout));
    } catch (err) {
      console.warn('[AuthService] Error saving lock timeout:', err);
    }
  }

  recordBackgroundTimestamp(): void {
    this.lastBackgroundTimestamp = Date.now();
  }

  async shouldLockOnForeground(): Promise<boolean> {
    const enabled = await this.isAppLockEnabled();
    if (!enabled) return false;

    const timeout = await this.getLockTimeout();
    if (timeout === 0) return true; // Immediately

    const elapsedSeconds = (Date.now() - this.lastBackgroundTimestamp) / 1000;
    return elapsedSeconds >= timeout;
  }

  // Screen Capture & Multitasking Protection
  async isScreenCaptureProtectionEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(SCREEN_CAPTURE_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  async setScreenCaptureProtection(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(SCREEN_CAPTURE_KEY, enabled ? 'true' : 'false');
    } catch (err) {
      console.warn('[AuthService] Error saving screen capture protection:', err);
    }
  }

  // Quality Preference
  async getDefaultQuality(): Promise<'low' | 'medium' | 'high'> {
    try {
      const val = await SecureStore.getItemAsync(DEFAULT_QUALITY_KEY);
      if (val === 'low' || val === 'medium' || val === 'high') {
        return val;
      }
      return 'medium';
    } catch {
      return 'medium';
    }
  }

  // Export resolution preference (150 / 200 / 300 dpi)
  async getDefaultDpi(): Promise<150 | 200 | 300> {
    try {
      const val = Number(await SecureStore.getItemAsync(DEFAULT_DPI_KEY));
      return val === 150 || val === 300 ? val : 200;
    } catch {
      return 200;
    }
  }

  async setDefaultDpi(dpi: 150 | 200 | 300): Promise<void> {
    try {
      await SecureStore.setItemAsync(DEFAULT_DPI_KEY, String(dpi));
    } catch (err) {
      console.warn('[AuthService] Error saving default dpi:', err);
    }
  }

  async setDefaultQuality(quality: 'low' | 'medium' | 'high'): Promise<void> {
    try {
      await SecureStore.setItemAsync(DEFAULT_QUALITY_KEY, quality);
    } catch (err) {
      console.warn('[AuthService] Error saving default quality:', err);
    }
  }

  // Scanner preference (default: iOS document scanner)
  async getScannerMode(): Promise<ScannerMode> {
    try {
      const val = await SecureStore.getItemAsync(SCANNER_MODE_KEY);
      return val === 'camera' ? 'camera' : 'system';
    } catch {
      return 'system';
    }
  }

  async setScannerMode(mode: ScannerMode): Promise<void> {
    try {
      await SecureStore.setItemAsync(SCANNER_MODE_KEY, mode);
    } catch (err) {
      console.warn('[AuthService] Error saving scanner mode:', err);
    }
  }
}

export const authService = new AuthService();
