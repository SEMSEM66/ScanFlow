import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { uuid } from 'expo';
import {
  checkPin,
  createPinRecord,
  isValidPin,
  parsePinRecord,
  PIN_SALT_BYTES,
  type PinLength,
} from '../security/pinHash';
import {
  attemptsBeforeLockout,
  EMPTY_LOCKOUT,
  normalizeLockout,
  parseLockout,
  registerFailure,
  remainingLockoutMs,
  serializeLockout,
  type LockoutState,
} from '../security/lockout';
import type { LockTimeoutSec } from '../security/lockPolicy';
import { fromHex } from '../security/sha256';

const APP_LOCK_KEY = 'scanflow_app_lock_enabled';
const DEFAULT_QUALITY_KEY = 'scanflow_default_quality';
const DEFAULT_DPI_KEY = 'scanflow_default_dpi';
const PIN_CODE_KEY = 'scanflow_security_pin';
const PIN_ATTEMPTS_KEY = 'scanflow_pin_attempts';
const LOCK_TIMEOUT_KEY = 'scanflow_lock_timeout_sec';
const SCREEN_CAPTURE_KEY = 'scanflow_prevent_screen_capture';
const HIDE_PREVIEW_KEY = 'scanflow_hide_app_preview';
const SCANNER_MODE_KEY = 'scanflow_scanner_mode';
const KEYCHAIN_VERSION_KEY = 'scanflow_keychain_version';

/**
 * Security settings: readable once the iPhone was unlocked after a restart
 * (iOS may start the app in the background), never restored to another device.
 */
const CONFIG_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
/** PIN record and attempt counter: only while the iPhone is unlocked, never restored to another device. */
const SECRET_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type LockTimeoutOption = LockTimeoutSec; // 0 = immediately, 60 = 1 min, 300 = 5 min

/** 'system' = iOS document scanner (VisionKit), 'camera' = ScanFlow's own camera screen. */
export type ScannerMode = 'system' | 'camera';

export interface SecurityConfig {
  lockEnabled: boolean;
  lockTimeout: LockTimeoutOption;
  /** Blur the app in the app switcher and behind system prompts (default on). */
  hidePreview: boolean;
  /** Screenshots and screen recordings show no content (default off). */
  screenCaptureProtection: boolean;
}

/** What can unlock the app on this iPhone right now. */
export interface UnlockCapabilities {
  /** Enrolled and usable biometrics (null: none, not enrolled or locked out by iOS). */
  biometry: 'faceId' | 'touchId' | null;
  /** A device passcode is set (iOS can verify it). */
  passcodeSet: boolean;
  /** Digits of the ScanFlow PIN, null = no PIN. */
  pinLength: PinLength | null;
}

/**
 * - success: verified
 * - use-pin: the ScanFlow PIN has to be entered (fallback button, no biometrics, biometric lockout)
 * - cancelled: the user (or iOS) cancelled
 * - unavailable: no unlock method on this device
 */
export type OwnerAuthResult = 'success' | 'use-pin' | 'cancelled' | 'unavailable';

export type PinResult =
  | { status: 'ok' }
  | { status: 'wrong'; attemptsLeft: number; lockedForMs: number }
  | { status: 'locked'; lockedForMs: number }
  | { status: 'no-pin' }
  | { status: 'error' };

export interface AuthLabels {
  /** Reason shown in the Face ID / passcode prompt. */
  prompt: string;
  /** Fallback button in the Face ID prompt when a ScanFlow PIN exists. */
  usePin: string;
  cancel: string;
}

function parseTimeout(val: string | null): LockTimeoutOption {
  if (val === '60') return 60;
  if (val === '300') return 300;
  return 0;
}

/** Random bytes for the PIN salt (uniqueness matters, secrecy does not). */
function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(out);
    return out;
  }
  try {
    // Native UUID v4 (iOS CSPRNG, 122 random bits each) from expo-modules-core.
    let hex = '';
    while (hex.length < n * 2) hex += uuid.v4().replace(/-/g, '');
    const bytes = fromHex(hex.slice(0, n * 2));
    if (bytes) return bytes;
  } catch (err) {
    console.warn('[AuthService] Native UUID unavailable, using Math.random for the PIN salt', err);
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

class AuthService {
  /** Serialises PIN checks so two quick entries cannot lose a failure count. */
  private pinQueue: Promise<unknown> = Promise.resolve();

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.pinQueue.then(task, task);
    this.pinQueue = run.catch(() => undefined);
    return run;
  }

  // ── Security settings ────────────────────────────────────────────────

  /**
   * Reads all security settings. Throws when the Keychain cannot be read
   * (e.g. iPhone not unlocked since restart) – callers must fail closed.
   */
  async getSecurityConfig(): Promise<SecurityConfig> {
    const [lock, timeout, hidePreview, capture] = await Promise.all([
      SecureStore.getItemAsync(APP_LOCK_KEY),
      SecureStore.getItemAsync(LOCK_TIMEOUT_KEY),
      SecureStore.getItemAsync(HIDE_PREVIEW_KEY),
      SecureStore.getItemAsync(SCREEN_CAPTURE_KEY),
    ]);
    return {
      lockEnabled: lock === 'true',
      lockTimeout: parseTimeout(timeout),
      hidePreview: hidePreview !== 'false',
      screenCaptureProtection: capture === 'true',
    };
  }

  /** The caller must have verified the user (see authenticateOwner / verifyPin). */
  async setAppLockEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(APP_LOCK_KEY, enabled ? 'true' : 'false', CONFIG_OPTS);
  }

  async setLockTimeout(timeout: LockTimeoutOption): Promise<void> {
    await SecureStore.setItemAsync(LOCK_TIMEOUT_KEY, String(timeout), CONFIG_OPTS);
  }

  async setHidePreview(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(HIDE_PREVIEW_KEY, enabled ? 'true' : 'false', CONFIG_OPTS);
  }

  async setScreenCaptureProtection(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(SCREEN_CAPTURE_KEY, enabled ? 'true' : 'false', CONFIG_OPTS);
  }

  /**
   * One-time move of the security entries to "this device only" Keychain
   * classes (≤ v1.3.0 used the default class). Best effort.
   */
  async migrateKeychain(): Promise<void> {
    try {
      if ((await SecureStore.getItemAsync(KEYCHAIN_VERSION_KEY)) === '2') return;
      for (const key of [APP_LOCK_KEY, LOCK_TIMEOUT_KEY, SCREEN_CAPTURE_KEY]) {
        const value = await SecureStore.getItemAsync(key);
        if (value !== null) await SecureStore.setItemAsync(key, value, CONFIG_OPTS);
      }
      const pin = await SecureStore.getItemAsync(PIN_CODE_KEY);
      if (pin !== null) await SecureStore.setItemAsync(PIN_CODE_KEY, pin, SECRET_OPTS);
      await SecureStore.setItemAsync(KEYCHAIN_VERSION_KEY, '2', CONFIG_OPTS);
    } catch (err) {
      console.warn('[AuthService] Keychain migration skipped:', err);
    }
  }

  // ── Unlock methods ───────────────────────────────────────────────────

  async getCapabilities(): Promise<UnlockCapabilities> {
    let level: LocalAuthentication.SecurityLevel = LocalAuthentication.SecurityLevel.NONE;
    let types: LocalAuthentication.AuthenticationType[] = [];
    try {
      level = await LocalAuthentication.getEnrolledLevelAsync();
      types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    } catch (err) {
      console.warn('[AuthService] Could not query device authentication:', err);
    }
    const biometricEnrolled = level >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK;
    const biometry = !biometricEnrolled
      ? null
      : types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
        ? 'faceId'
        : 'touchId';
    return {
      biometry,
      passcodeSet: level >= LocalAuthentication.SecurityLevel.SECRET,
      pinLength: await this.getPinLength(),
    };
  }

  /** The app lock can only be used when something can unlock it. */
  canUseAppLock(caps: UnlockCapabilities): boolean {
    return caps.passcodeSet || caps.pinLength !== null;
  }

  /**
   * Face ID / Touch ID / device passcode – never succeeds without a check.
   * With a ScanFlow PIN only biometrics are offered (the PIN replaces the
   * device passcode, so knowing the iPhone code is not enough);
   * without a PIN iOS falls back to the device passcode.
   */
  async authenticateOwner(caps: UnlockCapabilities, labels: AuthLabels): Promise<OwnerAuthResult> {
    const hasPin = caps.pinLength !== null;
    if (hasPin && !caps.biometry) return 'use-pin';
    if (!hasPin && !caps.passcodeSet) return 'unavailable';
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: labels.prompt,
        cancelLabel: labels.cancel,
        disableDeviceFallback: hasPin,
        fallbackLabel: hasPin ? labels.usePin : undefined,
      });
      if (result.success) {
        await this.resetPinAttempts();
        return 'success';
      }
      const error: string = result.error;
      if (error === 'user_cancel' || error === 'system_cancel' || error === 'app_cancel') return 'cancelled';
      if (hasPin) return 'use-pin'; // fallback button, lockout, failed, not enrolled …
      if (error === 'passcode_not_set' || error === 'not_available' || error === 'not_enrolled') return 'unavailable';
      return 'cancelled';
    } catch (err) {
      console.warn('[AuthService] Authentication error:', err);
      return hasPin ? 'use-pin' : 'cancelled';
    }
  }

  /** Face ID / Touch ID only (e.g. "PIN vergessen?"); false without biometrics. */
  async authenticateBiometric(labels: Omit<AuthLabels, 'usePin'>): Promise<boolean> {
    try {
      const caps = await this.getCapabilities();
      if (!caps.biometry) return false;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: labels.prompt,
        cancelLabel: labels.cancel,
        disableDeviceFallback: true,
        fallbackLabel: '',
      });
      if (result.success) await this.resetPinAttempts();
      return result.success;
    } catch (err) {
      console.warn('[AuthService] Biometric authentication error:', err);
      return false;
    }
  }

  // ── ScanFlow PIN ─────────────────────────────────────────────────────

  async hasPinCode(): Promise<boolean> {
    return (await this.getPinLength()) !== null;
  }

  async getPinLength(): Promise<PinLength | null> {
    try {
      return parsePinRecord(await SecureStore.getItemAsync(PIN_CODE_KEY))?.length ?? null;
    } catch (err) {
      console.warn('[AuthService] Could not read the PIN record:', err);
      return null;
    }
  }

  /** Stores a new PIN (4 or 6 digits) as salted PBKDF2 record and resets the attempt counter. */
  async setPinCode(pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new Error('PIN must be 4 or 6 digits');
    const record = createPinRecord(pin, randomBytes(PIN_SALT_BYTES));
    await SecureStore.setItemAsync(PIN_CODE_KEY, record, SECRET_OPTS);
    await this.resetPinAttempts();
  }

  async removePinCode(): Promise<void> {
    await SecureStore.deleteItemAsync(PIN_CODE_KEY);
    await this.resetPinAttempts();
  }

  /** Checks a PIN against the stored record, counting wrong PINs persistently. */
  verifyPinCode(pin: string): Promise<PinResult> {
    return this.serialize(async (): Promise<PinResult> => {
      try {
        const lockout = await this.readLockout();
        const wait = remainingLockoutMs(lockout, Date.now());
        if (wait > 0) return { status: 'locked', lockedForMs: wait };

        const stored = await SecureStore.getItemAsync(PIN_CODE_KEY);
        if (!parsePinRecord(stored)) return { status: 'no-pin' };

        const check = checkPin(pin, stored);
        if (check.ok) {
          await this.writeLockout(EMPTY_LOCKOUT);
          if (check.needsUpgrade) {
            try {
              await SecureStore.setItemAsync(PIN_CODE_KEY, createPinRecord(pin, randomBytes(PIN_SALT_BYTES)), SECRET_OPTS);
            } catch (err) {
              console.warn('[AuthService] PIN upgrade failed (old record kept):', err);
            }
          }
          return { status: 'ok' };
        }

        const now = Date.now();
        const next = registerFailure(lockout, now);
        await this.writeLockout(next);
        return { status: 'wrong', attemptsLeft: attemptsBeforeLockout(next), lockedForMs: remainingLockoutMs(next, now) };
      } catch (err) {
        console.warn('[AuthService] PIN check failed:', err);
        return { status: 'error' };
      }
    });
  }

  /** Remaining waiting time after too many wrong PINs (0 = none). */
  async getPinLockoutMs(): Promise<number> {
    try {
      return remainingLockoutMs(await this.readLockout(), Date.now());
    } catch {
      return 0;
    }
  }

  private async readLockout(): Promise<LockoutState> {
    const raw = await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY);
    const state = parseLockout(raw);
    const normalized = normalizeLockout(state, Date.now());
    if (normalized !== state) await this.writeLockout(normalized);
    return normalized;
  }

  private async writeLockout(state: LockoutState): Promise<void> {
    if (state.failures === 0 && state.lockedUntil === 0) {
      await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
      return;
    }
    await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, serializeLockout(state), SECRET_OPTS);
  }

  private async resetPinAttempts(): Promise<void> {
    try {
      await this.writeLockout(EMPTY_LOCKOUT);
    } catch (err) {
      console.warn('[AuthService] Could not reset the PIN attempts:', err);
    }
  }

  // ── Preferences (not security relevant) ──────────────────────────────

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

  async setDefaultQuality(quality: 'low' | 'medium' | 'high'): Promise<void> {
    try {
      await SecureStore.setItemAsync(DEFAULT_QUALITY_KEY, quality);
    } catch (err) {
      console.warn('[AuthService] Error saving default quality:', err);
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
