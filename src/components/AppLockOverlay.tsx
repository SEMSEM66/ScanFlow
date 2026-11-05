import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import * as ScreenCapture from 'expo-screen-capture';
import { useTranslation } from '../i18n';
import {
  authService,
  type PinResult,
  type SecurityConfig,
  type UnlockCapabilities,
} from '../services/AuthService';
import { privacyService } from '../services/PrivacyService';
import {
  consumeAutoPrompt,
  initialLockState,
  onAppStateChange,
  onConfigChange,
  onUnlocked,
  type AppStateName,
  type LockConfig,
  type LockState,
} from '../security/lockPolicy';
import { LockScreen } from './LockScreen';

/**
 * App lock + privacy (v1.4.0).
 *
 * - The app content always stays mounted (navigation, open editors and a
 *   running import survive locking). While locked, the lock screen is drawn
 *   in a FullWindowOverlay – a view on the iOS window itself – so it also
 *   covers modal screens (crop, camera), sheets, the share sheet and the
 *   iOS document scanner.
 * - When to lock is decided by the pure state machine in security/lockPolicy
 *   (`inactive` never locks → no Face ID loop).
 * - The app-switcher preview is hidden by the native blur of
 *   expo-screen-capture (PrivacyService), not by a JS veil.
 * - Unknown settings (Keychain not readable yet) count as locked.
 */

interface AppLockContextValue {
  /** null until the settings were read. */
  config: SecurityConfig | null;
  /** Re-read and apply the security settings (call after changing them). */
  reload: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within AppLockOverlay');
  return ctx;
}

const toLockConfig = (c: SecurityConfig): LockConfig => ({ enabled: c.lockEnabled, timeoutSec: c.lockTimeout });

/** Used when the Keychain stays unreadable: lock, hide previews. */
const FAIL_CLOSED: SecurityConfig = { lockEnabled: true, lockTimeout: 0, hidePreview: true, screenCaptureProtection: false };
const CONFIG_RETRIES = 4;
const CONFIG_RETRY_MS = 1500;

const LOCKED_UNTIL_CONFIG: LockState = { locked: true, backgroundAt: null, autoPrompt: false };

/** Above the whole iOS window (also above native modals); plain overlay elsewhere. */
const Cover: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  Platform.OS === 'ios' ? (
    <FullWindowOverlay>{children}</FullWindowOverlay>
  ) : (
    <View style={StyleSheet.absoluteFill}>{children}</View>
  );

export const AppLockOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();

  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const configRef = useRef<SecurityConfig | null>(null);
  const [lock, setLock] = useState<LockState>(LOCKED_UNTIL_CONFIG);
  const lockRef = useRef<LockState>(LOCKED_UNTIL_CONFIG);
  const appStateRef = useRef<AppStateName>((AppState.currentState as AppStateName | null) ?? 'unknown');
  const [caps, setCaps] = useState<UnlockCapabilities | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const authBusyRef = useRef(false);

  const refreshCaps = useCallback(async () => {
    setCaps(await authService.getCapabilities());
  }, []);

  const commit = useCallback(
    (next: LockState) => {
      const prev = lockRef.current;
      if (next === prev) return;
      lockRef.current = next;
      setLock(next);
      if (next.locked && !prev.locked) {
        Keyboard.dismiss();
        refreshCaps(); // unlock methods for the lock screen
      }
    },
    [refreshCaps]
  );

  const applyConfig = useCallback(
    (c: SecurityConfig) => {
      const first = configRef.current === null;
      configRef.current = c;
      setConfig(c);
      commit(first ? initialLockState(toLockConfig(c)) : onConfigChange(lockRef.current, toLockConfig(c)));
      // Best effort and idempotent (PrivacyService remembers what is applied).
      privacyService.setAppSwitcherProtection(c.hidePreview);
      privacyService.setScreenCaptureProtection(c.screenCaptureProtection);
    },
    [commit]
  );

  /** Reads the settings; the first successful read decides the initial lock. */
  const loadConfig = useCallback(async (): Promise<boolean> => {
    try {
      applyConfig(await authService.getSecurityConfig());
      return true;
    } catch (err) {
      console.warn('[AppLock] Security settings not readable:', err);
      return false;
    }
  }, [applyConfig]);

  /** Face ID / Touch ID / passcode (or the PIN pad) – never unlocks without a check. */
  const unlockWithDevice = useCallback(async () => {
    if (authBusyRef.current || !lockRef.current.locked) return;
    authBusyRef.current = true;
    setAuthBusy(true);
    try {
      const c = await authService.getCapabilities();
      setCaps(c);
      const result = await authService.authenticateOwner(c, {
        prompt: t.security.promptUnlock,
        usePin: t.security.usePin,
        cancel: t.common.cancel,
      });
      if (result === 'success') commit(onUnlocked(lockRef.current, appStateRef.current));
      // use-pin: the PIN pad is on screen already; cancelled / unavailable: stay locked
    } finally {
      authBusyRef.current = false;
      setAuthBusy(false);
    }
  }, [commit, t]);

  /** The automatic prompt: once per lock / return, only while the app is in front. */
  const maybeAutoPrompt = useCallback(() => {
    const state = lockRef.current;
    if (!configRef.current || !state.locked || !state.autoPrompt || authBusyRef.current) return;
    const appState = appStateRef.current;
    if (appState !== 'active' && appState !== 'unknown') return;
    commit(consumeAutoPrompt(state));
    unlockWithDevice();
  }, [commit, unlockWithDevice]);

  const submitPin = useCallback(
    async (pin: string): Promise<PinResult> => {
      const result = await authService.verifyPinCode(pin);
      if (result.status === 'ok') commit(onUnlocked(lockRef.current, appStateRef.current));
      if (result.status === 'no-pin') refreshCaps();
      return result;
    },
    [commit, refreshCaps]
  );

  // Start: one-time Keychain migration, then the settings – fail closed if they stay unreadable.
  useEffect(() => {
    let alive = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (!alive || configRef.current) return;
      if (await loadConfig()) return;
      attempts += 1;
      if (attempts >= CONFIG_RETRIES) {
        if (alive && !configRef.current) applyConfig(FAIL_CLOSED);
        return;
      }
      timer = setTimeout(attempt, CONFIG_RETRY_MS);
    };
    authService.migrateKeychain().finally(attempt);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [applyConfig, loadConfig]);

  // Lock decisions on app state changes (see security/lockPolicy).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const state = next as AppStateName;
      appStateRef.current = state;
      const c = configRef.current;
      const assumed = !c || c === FAIL_CLOSED;
      // Settings unknown: read them again now that the app is in front, then decide about the prompt.
      if (state === 'active' && assumed) loadConfig().then(maybeAutoPrompt);
      if (!c) return;
      commit(onAppStateChange(lockRef.current, state, toLockConfig(c), Date.now()));
      if (state === 'active') {
        privacyService.setAppSwitcherProtection(c.hidePreview);
        privacyService.setScreenCaptureProtection(c.screenCaptureProtection);
        if (lockRef.current.locked) refreshCaps();
        if (!assumed) maybeAutoPrompt();
      }
    });
    return () => sub.remove();
  }, [commit, loadConfig, maybeAutoPrompt, refreshCaps]);

  // After the first settings read / a new lock while in front.
  useEffect(() => {
    if (lock.locked && lock.autoPrompt && config) maybeAutoPrompt();
  }, [lock, config, maybeAutoPrompt]);

  // Screenshot notice only while screenshots are blocked (they come out black).
  const captureProtected = config?.screenCaptureProtection === true;
  useEffect(() => {
    if (!captureProtected) return;
    const sub = ScreenCapture.addScreenshotListener(() => {
      Alert.alert(t.security.screenshotTakenTitle, t.security.screenshotTakenMessage);
    });
    return () => sub.remove();
  }, [captureProtected, t]);

  const reload = useCallback(async () => {
    await loadConfig();
  }, [loadConfig]);

  const value = useMemo(() => ({ config, reload }), [config, reload]);
  const showCover = !config || lock.locked;

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {showCover ? (
        <Cover>
          <LockScreen
            checking={!config}
            caps={caps}
            authBusy={authBusy}
            onUnlock={unlockWithDevice}
            onSubmitPin={submitPin}
            onRefresh={refreshCaps}
          />
        </Cover>
      ) : null}
    </AppLockContext.Provider>
  );
};
