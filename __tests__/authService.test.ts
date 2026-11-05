/**
 * AuthService against an in-memory Keychain and scripted Face ID results:
 * nothing unlocks without a check, the ScanFlow PIN replaces the device
 * passcode, the attempt limit is persisted, PINs of ≤ 1.3.0 keep working
 * and are upgraded, security entries use this-device-only Keychain classes.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authService, type AuthLabels, type UnlockCapabilities } from '../src/services/AuthService';
import { checkPin, createPinRecord, legacyPinHash } from '../src/security/pinHash';
import { parseLockout } from '../src/security/lockout';

type KeychainEntry = { value: string; options?: { keychainAccessible?: string } };
type AuthResult = { success: boolean; error?: string };

const mockKeychain = new Map<string, KeychainEntry>();
const mockKeychainState = { failReads: false, writes: 0 };
const mockDevice = {
  level: 3, // SecurityLevel.BIOMETRIC_STRONG
  types: [2] as number[], // FACIAL_RECOGNITION
  fail: false,
  authenticate: jest.fn<(options: Record<string, unknown>) => Promise<AuthResult>>(),
};
const mockUuid = { n: 0 };

// jest.mock is hoisted above the imports – the factories only use the
// mock objects lazily (inside functions).
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: async (key: string) => {
    if (mockKeychainState.failReads) throw new Error('Keychain not available');
    return mockKeychain.get(key)?.value ?? null;
  },
  setItemAsync: async (key: string, value: string, options?: KeychainEntry['options']) => {
    mockKeychainState.writes++;
    mockKeychain.set(key, { value, options });
  },
  deleteItemAsync: async (key: string) => {
    mockKeychain.delete(key);
  },
}));
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  getEnrolledLevelAsync: async () => {
    if (mockDevice.fail) throw new Error('LAContext failed');
    return mockDevice.level;
  },
  supportedAuthenticationTypesAsync: async () => mockDevice.types,
  authenticateAsync: (options: Record<string, unknown>) => mockDevice.authenticate(options),
}));
jest.mock('expo', () => ({
  uuid: { v4: () => `${(++mockUuid.n).toString(16).padStart(8, '0')}-d9cb-469f-a165-70867728950e` },
}));

const PIN_KEY = 'scanflow_security_pin';
const ATTEMPTS_KEY = 'scanflow_pin_attempts';
const T = 1_700_000_000_000;
const labels: AuthLabels = { prompt: 'ScanFlow entsperren', usePin: 'ScanFlow-PIN eingeben', cancel: 'Abbrechen' };
const caps = (c: Partial<UnlockCapabilities>): UnlockCapabilities => ({ biometry: null, passcodeSet: false, pinLength: null, ...c });
const stored = (key: string) => mockKeychain.get(key);
const failures = () => parseLockout(stored(ATTEMPTS_KEY)?.value).failures;
let clock: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  mockKeychain.clear();
  mockKeychainState.failReads = false;
  mockKeychainState.writes = 0;
  mockDevice.level = 3;
  mockDevice.types = [2];
  mockDevice.fail = false;
  mockDevice.authenticate.mockReset();
  clock = jest.spyOn(Date, 'now').mockReturnValue(T);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('security settings', () => {
  it('defaults: lock off, "immediately", app preview hidden, screenshots allowed', async () => {
    await expect(authService.getSecurityConfig()).resolves.toEqual({
      lockEnabled: false,
      lockTimeout: 0,
      hidePreview: true,
      screenCaptureProtection: false,
    });
  });

  it('reads the stored values; unknown timeouts fall back to "immediately"', async () => {
    await authService.setAppLockEnabled(true);
    await authService.setLockTimeout(300);
    await authService.setHidePreview(false);
    await authService.setScreenCaptureProtection(true);
    await expect(authService.getSecurityConfig()).resolves.toEqual({
      lockEnabled: true,
      lockTimeout: 300,
      hidePreview: false,
      screenCaptureProtection: true,
    });
    mockKeychain.set('scanflow_lock_timeout_sec', { value: '999' });
    expect((await authService.getSecurityConfig()).lockTimeout).toBe(0);
  });

  it('throws when the Keychain cannot be read – the lock screen fails closed', async () => {
    mockKeychainState.failReads = true;
    await expect(authService.getSecurityConfig()).rejects.toThrow();
  });

  it('stores security entries in this-device-only Keychain classes', async () => {
    await authService.setAppLockEnabled(true);
    await authService.setLockTimeout(60);
    await authService.setHidePreview(true);
    await authService.setScreenCaptureProtection(false);
    for (const key of ['scanflow_app_lock_enabled', 'scanflow_lock_timeout_sec', 'scanflow_hide_app_preview', 'scanflow_prevent_screen_capture']) {
      expect(stored(key)?.options?.keychainAccessible).toBe('afterFirstUnlockThisDeviceOnly');
    }
    await authService.setPinCode('258014');
    expect(stored(PIN_KEY)?.options?.keychainAccessible).toBe('whenUnlockedThisDeviceOnly');
  });

  it('moves the entries of ≤ 1.3.0 to the new Keychain classes once', async () => {
    const oldPin = legacyPinHash('2580');
    mockKeychain.set('scanflow_app_lock_enabled', { value: 'true' });
    mockKeychain.set('scanflow_lock_timeout_sec', { value: '60' });
    mockKeychain.set('scanflow_prevent_screen_capture', { value: 'true' });
    mockKeychain.set(PIN_KEY, { value: oldPin });
    await authService.migrateKeychain();
    expect(stored('scanflow_app_lock_enabled')).toEqual({ value: 'true', options: { keychainAccessible: 'afterFirstUnlockThisDeviceOnly' } });
    expect(stored('scanflow_lock_timeout_sec')).toEqual({ value: '60', options: { keychainAccessible: 'afterFirstUnlockThisDeviceOnly' } });
    expect(stored('scanflow_prevent_screen_capture')?.options?.keychainAccessible).toBe('afterFirstUnlockThisDeviceOnly');
    expect(stored(PIN_KEY)).toEqual({ value: oldPin, options: { keychainAccessible: 'whenUnlockedThisDeviceOnly' } });
    expect(stored('scanflow_keychain_version')?.value).toBe('2');
    const writes = mockKeychainState.writes;
    await authService.migrateKeychain();
    expect(mockKeychainState.writes).toBe(writes);
  });
});

describe('unlocking', () => {
  it('without PIN and without device passcode nothing can unlock (no prompt, no success)', async () => {
    await expect(authService.authenticateOwner(caps({}), labels)).resolves.toBe('unavailable');
    expect(mockDevice.authenticate).not.toHaveBeenCalled();
    expect(authService.canUseAppLock(caps({}))).toBe(false);
    expect(authService.canUseAppLock(caps({ passcodeSet: true }))).toBe(true);
    expect(authService.canUseAppLock(caps({ pinLength: 6 }))).toBe(true);
  });

  it('with a ScanFlow PIN but no Face ID the PIN is required – the device passcode is not offered', async () => {
    await expect(authService.authenticateOwner(caps({ passcodeSet: true, pinLength: 6 }), labels)).resolves.toBe('use-pin');
    expect(mockDevice.authenticate).not.toHaveBeenCalled();
  });

  it('with a ScanFlow PIN, Face ID runs without passcode fallback; every failure leads to the PIN', async () => {
    const withPin = caps({ biometry: 'faceId', passcodeSet: true, pinLength: 6 });
    const cases: [AuthResult, string][] = [
      [{ success: true }, 'success'],
      [{ success: false, error: 'user_fallback' }, 'use-pin'],
      [{ success: false, error: 'lockout' }, 'use-pin'],
      [{ success: false, error: 'authentication_failed' }, 'use-pin'],
      [{ success: false, error: 'not_enrolled' }, 'use-pin'],
      [{ success: false, error: 'user_cancel' }, 'cancelled'],
      [{ success: false, error: 'system_cancel' }, 'cancelled'],
      [{ success: false, error: 'app_cancel' }, 'cancelled'],
    ];
    for (const [result, expected] of cases) {
      mockDevice.authenticate.mockResolvedValueOnce(result);
      await expect(authService.authenticateOwner(withPin, labels)).resolves.toBe(expected);
    }
    mockDevice.authenticate.mockRejectedValueOnce(new Error('LAContext crashed'));
    await expect(authService.authenticateOwner(withPin, labels)).resolves.toBe('use-pin');
    for (const [options] of mockDevice.authenticate.mock.calls) {
      expect(options).toMatchObject({ disableDeviceFallback: true, fallbackLabel: 'ScanFlow-PIN eingeben', promptMessage: 'ScanFlow entsperren' });
    }
  });

  it('without a ScanFlow PIN, iOS may fall back to the device passcode; errors never unlock', async () => {
    const noPin = caps({ biometry: 'faceId', passcodeSet: true });
    const cases: [AuthResult, string][] = [
      [{ success: true }, 'success'],
      [{ success: false, error: 'user_cancel' }, 'cancelled'],
      [{ success: false, error: 'authentication_failed' }, 'cancelled'],
      [{ success: false, error: 'lockout' }, 'cancelled'],
      [{ success: false, error: 'passcode_not_set' }, 'unavailable'],
      [{ success: false, error: 'not_available' }, 'unavailable'],
    ];
    for (const [result, expected] of cases) {
      mockDevice.authenticate.mockResolvedValueOnce(result);
      await expect(authService.authenticateOwner(noPin, labels)).resolves.toBe(expected);
    }
    mockDevice.authenticate.mockRejectedValueOnce(new Error('LAContext crashed'));
    await expect(authService.authenticateOwner(noPin, labels)).resolves.toBe('cancelled');
    for (const [options] of mockDevice.authenticate.mock.calls) {
      expect(options).toMatchObject({ disableDeviceFallback: false });
    }
  });

  it('a successful Face ID resets the wrong-PIN counter', async () => {
    await authService.setPinCode('258014');
    await authService.verifyPinCode('111111');
    await authService.verifyPinCode('111112');
    expect(failures()).toBe(2);
    mockDevice.authenticate.mockResolvedValueOnce({ success: true });
    await authService.authenticateOwner(caps({ biometry: 'faceId', passcodeSet: true, pinLength: 6 }), labels);
    expect(stored(ATTEMPTS_KEY)).toBeUndefined();
  });

  it('"PIN vergessen?" uses Face ID / Touch ID only', async () => {
    mockDevice.level = 1; // passcode, no biometrics
    await expect(authService.authenticateBiometric(labels)).resolves.toBe(false);
    expect(mockDevice.authenticate).not.toHaveBeenCalled();
    mockDevice.level = 3;
    mockDevice.authenticate.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await expect(authService.authenticateBiometric(labels)).resolves.toBe(false);
    mockDevice.authenticate.mockResolvedValueOnce({ success: true });
    await expect(authService.authenticateBiometric(labels)).resolves.toBe(true);
    expect(mockDevice.authenticate.mock.calls[0][0]).toMatchObject({ disableDeviceFallback: true, fallbackLabel: '' });
  });

  it('reports the unlock methods of the device', async () => {
    await expect(authService.getCapabilities()).resolves.toEqual({ biometry: 'faceId', passcodeSet: true, pinLength: null });
    mockDevice.types = [1];
    expect((await authService.getCapabilities()).biometry).toBe('touchId');
    mockDevice.level = 1; // biometrics not enrolled or locked out by iOS
    await expect(authService.getCapabilities()).resolves.toEqual({ biometry: null, passcodeSet: true, pinLength: null });
    mockDevice.level = 0;
    await expect(authService.getCapabilities()).resolves.toEqual({ biometry: null, passcodeSet: false, pinLength: null });
    mockDevice.fail = true;
    await expect(authService.getCapabilities()).resolves.toEqual({ biometry: null, passcodeSet: false, pinLength: null });
    mockKeychain.set(PIN_KEY, { value: legacyPinHash('2580') });
    expect((await authService.getCapabilities()).pinLength).toBe(4);
    await authService.setPinCode('258014');
    expect((await authService.getCapabilities()).pinLength).toBe(6);
    mockKeychain.set(PIN_KEY, { value: 'v2$damaged' });
    expect((await authService.getCapabilities()).pinLength).toBeNull();
  });
});

describe('ScanFlow PIN', () => {
  it('5 wrong PINs start a 30 s wait; no PIN is checked meanwhile; the wait survives a restart', async () => {
    await authService.setPinCode('258014');
    for (let i = 1; i <= 4; i++) {
      await expect(authService.verifyPinCode('111111')).resolves.toEqual({ status: 'wrong', attemptsLeft: 5 - i, lockedForMs: 0 });
    }
    await expect(authService.verifyPinCode('111111')).resolves.toEqual({ status: 'wrong', attemptsLeft: 0, lockedForMs: 30_000 });
    await expect(authService.verifyPinCode('258014')).resolves.toEqual({ status: 'locked', lockedForMs: 30_000 });

    clock.mockReturnValue(T + 10_000);
    let restarted: typeof authService | undefined;
    jest.isolateModules(() => {
      // a fresh AuthService instance only knows what is in the Keychain
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      restarted = (require('../src/services/AuthService') as typeof import('../src/services/AuthService')).authService;
    });
    expect(restarted).toBeDefined();
    expect(restarted).not.toBe(authService);
    await expect(restarted!.getPinLockoutMs()).resolves.toBe(20_000);
    await expect(restarted!.verifyPinCode('258014')).resolves.toEqual({ status: 'locked', lockedForMs: 20_000 });

    clock.mockReturnValue(T + 30_000);
    await expect(restarted!.verifyPinCode('258014')).resolves.toEqual({ status: 'ok' });
    expect(stored(ATTEMPTS_KEY)).toBeUndefined();
    await expect(restarted!.verifyPinCode('000001')).resolves.toEqual({ status: 'wrong', attemptsLeft: 4, lockedForMs: 0 });
  });

  it('every further wrong PIN waits longer: 1 min, 5 min, 15 min', async () => {
    await authService.setPinCode('2580');
    for (let i = 0; i < 5; i++) await authService.verifyPinCode('1111');
    let now = T + 30_000;
    const waits: number[] = [];
    for (let i = 0; i < 4; i++) {
      clock.mockReturnValue(now);
      const r = await authService.verifyPinCode('1111');
      if (r.status !== 'wrong') throw new Error(`unexpected ${r.status}`);
      waits.push(r.lockedForMs);
      now += r.lockedForMs;
    }
    expect(waits).toEqual([60_000, 300_000, 900_000, 900_000]);
  });

  it('setting the clock back during a wait restarts the full wait', async () => {
    await authService.setPinCode('258014');
    for (let i = 0; i < 5; i++) await authService.verifyPinCode('111111');
    clock.mockReturnValue(T - 3_600_000);
    await expect(authService.getPinLockoutMs()).resolves.toBe(30_000);
    await expect(authService.verifyPinCode('258014')).resolves.toEqual({ status: 'locked', lockedForMs: 30_000 });
  });

  it('two quick entries are both counted', async () => {
    await authService.setPinCode('258014');
    const results = await Promise.all([authService.verifyPinCode('000001'), authService.verifyPinCode('000002')]);
    expect(results).toEqual([
      { status: 'wrong', attemptsLeft: 4, lockedForMs: 0 },
      { status: 'wrong', attemptsLeft: 3, lockedForMs: 0 },
    ]);
    expect(failures()).toBe(2);
  });

  it('the 4-digit PIN of ScanFlow ≤ 1.3.0 keeps working and is upgraded to the new format', async () => {
    mockKeychain.set(PIN_KEY, { value: legacyPinHash('2580') });
    await expect(authService.getPinLength()).resolves.toBe(4);
    await expect(authService.verifyPinCode('2581')).resolves.toMatchObject({ status: 'wrong' });
    await expect(authService.verifyPinCode('2580')).resolves.toEqual({ status: 'ok' });
    const upgraded = stored(PIN_KEY);
    expect(upgraded?.value).toMatch(/^v2\$4\$5000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(upgraded?.options?.keychainAccessible).toBe('whenUnlockedThisDeviceOnly');
    expect(checkPin('2580', upgraded?.value).ok).toBe(true);
    await expect(authService.verifyPinCode('2580')).resolves.toEqual({ status: 'ok' });
    await expect(authService.getPinLength()).resolves.toBe(4);
  });

  it('records with fewer iterations are rewritten after the next correct entry', async () => {
    const old = createPinRecord('258014', new Uint8Array(16).fill(7), 1000);
    mockKeychain.set(PIN_KEY, { value: old });
    await expect(authService.verifyPinCode('258014')).resolves.toEqual({ status: 'ok' });
    expect(stored(PIN_KEY)?.value).toMatch(/^v2\$6\$5000\$/);
  });

  it('uses a fresh random salt for every PIN', async () => {
    await authService.setPinCode('258014');
    const first = stored(PIN_KEY)?.value;
    await authService.setPinCode('258014');
    const second = stored(PIN_KEY)?.value;
    expect(first).not.toBe(second);
    expect(first?.split('$')[3]).not.toBe(second?.split('$')[3]);
  });

  it('never accepts anything without a valid PIN record or when the Keychain fails', async () => {
    await expect(authService.verifyPinCode('258014')).resolves.toEqual({ status: 'no-pin' });
    mockKeychain.set(PIN_KEY, { value: 'v2$damaged' });
    await expect(authService.verifyPinCode('258014')).resolves.toEqual({ status: 'no-pin' });
    await authService.setPinCode('258014');
    mockKeychainState.failReads = true;
    await expect(authService.verifyPinCode('258014')).resolves.toEqual({ status: 'error' });
    await expect(authService.getPinLength()).resolves.toBeNull();
  });

  it('refuses invalid PINs', async () => {
    await expect(authService.setPinCode('12345')).rejects.toThrow();
    await expect(authService.setPinCode('12a4')).rejects.toThrow();
    expect(stored(PIN_KEY)).toBeUndefined();
  });

  it('a new or removed PIN resets the counter', async () => {
    await authService.setPinCode('258014');
    for (let i = 0; i < 3; i++) await authService.verifyPinCode('111111');
    expect(failures()).toBe(3);
    await authService.setPinCode('135790');
    expect(stored(ATTEMPTS_KEY)).toBeUndefined();
    await expect(authService.verifyPinCode('258014')).resolves.toMatchObject({ status: 'wrong', attemptsLeft: 4 });
    await expect(authService.verifyPinCode('135790')).resolves.toEqual({ status: 'ok' });
    await authService.verifyPinCode('111111');
    await authService.removePinCode();
    expect(stored(PIN_KEY)).toBeUndefined();
    expect(stored(ATTEMPTS_KEY)).toBeUndefined();
    await expect(authService.hasPinCode()).resolves.toBe(false);
  });
});
