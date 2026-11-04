import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenCapture from 'expo-screen-capture';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { authService } from '../services/AuthService';

export const AppLockOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isBackgrounded, setIsBackgrounded] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  // PIN fallback keypad state
  const [showPinKeypad, setShowPinKeypad] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [hasPinConfigured, setHasPinConfigured] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial check & screen capture listener
  useEffect(() => {
    async function initSecurity() {
      const enabled = await authService.isAppLockEnabled();
      setIsLockEnabled(enabled);
      const hasPin = await authService.hasPinCode();
      setHasPinConfigured(hasPin);

      // Check screen capture protection
      const screenCapProtected = await authService.isScreenCaptureProtectionEnabled();
      if (screenCapProtected) {
        await ScreenCapture.preventScreenCaptureAsync();
      }

      if (enabled) {
        setIsLocked(true);
        triggerBiometricAuth();
      }
    }
    initSecurity();

    // Screenshot listener
    const screenshotSub = ScreenCapture.addScreenshotListener(() => {
      Alert.alert(
        'Sicherheitshinweis',
        'Ein Screenshot wurde erstellt. Bitte stellen Sie sicher, dass vertrauliche Dokumente geschützt bleiben.'
      );
    });

    return () => {
      screenshotSub.remove();
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, []);

  // AppState transitions: Privacy Veil & Auto-Lock Timeout
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const enabled = await authService.isAppLockEnabled();
      setIsLockEnabled(enabled);

      if (nextState === 'inactive' || nextState === 'background') {
        // App Switcher Privacy Veil: immediately obscure UI
        setIsBackgrounded(true);
        authService.recordBackgroundTimestamp();
      } else if (nextState === 'active') {
        setIsBackgrounded(false);
        const shouldLock = await authService.shouldLockOnForeground();
        if (shouldLock) {
          setIsLocked(true);
          setShowPinKeypad(false);
          setEnteredPin('');
          triggerBiometricAuth();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const triggerBiometricAuth = async () => {
    if (authService.isLockedOut()) {
      startLockoutCountdown();
      setShowPinKeypad(true);
      return;
    }

    setAuthFailed(false);
    const success = await authService.authenticate(t.auth.prompt);
    if (success) {
      setIsLocked(false);
      setAuthFailed(false);
      setShowPinKeypad(false);
      setEnteredPin('');
    } else {
      setAuthFailed(true);
      const hasPin = await authService.hasPinCode();
      if (hasPin) {
        setShowPinKeypad(true);
      }
    }
  };

  const startLockoutCountdown = () => {
    const remaining = authService.getRemainingLockoutSeconds();
    setLockoutSeconds(remaining);

    if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);

    lockoutTimerRef.current = setInterval(() => {
      const rem = authService.getRemainingLockoutSeconds();
      setLockoutSeconds(rem);
      if (rem <= 0) {
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
      }
    }, 1000);
  };

  const handlePinKey = async (num: string) => {
    if (lockoutSeconds > 0 || enteredPin.length >= 4) return;
    const nextPin = enteredPin + num;
    setEnteredPin(nextPin);

    if (nextPin.length === 4) {
      const valid = await authService.verifyPinCode(nextPin);
      if (valid) {
        setIsLocked(false);
        setShowPinKeypad(false);
        setEnteredPin('');
        setAuthFailed(false);
      } else {
        if (authService.isLockedOut()) {
          startLockoutCountdown();
        } else {
          Alert.alert('Falscher Code', 'Der eingegebene Code ist nicht korrekt.');
        }
        setEnteredPin('');
      }
    }
  };

  const handlePinDelete = () => {
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  // 1. App Switcher Privacy Veil (Multitasking snapshot protection)
  if (isBackgrounded && isLockEnabled) {
    return (
      <View style={[styles.privacyVeil, { backgroundColor: colors.background }]}>
        <View style={[styles.veilIconCircle, { backgroundColor: colors.surfaceSubdued }]}>
          <Ionicons name="shield-checkmark" size={54} color={colors.primary} />
        </View>
        <Text style={[typography.title2, { color: colors.textPrimary, marginTop: 12 }]}>
          ScanFlow Geschützt
        </Text>
      </View>
    );
  }

  // 2. Locked Screen with Face ID & PIN Fallback Keypad
  if (isLockEnabled && isLocked) {
    return (
      <View style={[styles.lockContainer, { backgroundColor: colors.background }]}>
        {showPinKeypad && hasPinConfigured ? (
          // In-App PIN Keypad Screen
          <View style={styles.pinWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
              <Ionicons name="lock-closed" size={44} color={colors.primary} />
            </View>

            <Text style={[typography.title2, styles.title, { color: colors.textPrimary }]}>
              Code eingeben
            </Text>

            {lockoutSeconds > 0 ? (
              <Text style={[typography.body, { color: colors.danger, textAlign: 'center', marginTop: 8 }]}>
                Zu viele Fehlversuche. Bitte warten Sie {lockoutSeconds} Sekunden.
              </Text>
            ) : (
              <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}>
                Geben Sie Ihren 4-stelligen Sicherheits-Code ein.
              </Text>
            )}

            {/* 4 Pin Dots */}
            <View style={styles.dotsRow}>
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < enteredPin.length;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: filled ? colors.primary : colors.surfaceSubdued,
                        borderColor: filled ? colors.primary : colors.border,
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Keypad */}
            <View style={styles.keypadContainer}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['faceid', '0', 'del'],
              ].map((row, rIdx) => (
                <View key={rIdx} style={styles.keypadRow}>
                  {row.map((item, cIdx) => {
                    if (item === 'faceid') {
                      return (
                        <TouchableOpacity
                          key={cIdx}
                          activeOpacity={0.7}
                          onPress={triggerBiometricAuth}
                          style={[styles.keypadSlot, styles.keypadButton]}
                        >
                          <Ionicons name="scan-outline" size={26} color={colors.primary} />
                        </TouchableOpacity>
                      );
                    }
                    if (item === 'del') {
                      return (
                        <TouchableOpacity
                          key={cIdx}
                          activeOpacity={0.7}
                          onPress={handlePinDelete}
                          style={[styles.keypadSlot, styles.keypadButton]}
                        >
                          <Ionicons name="backspace-outline" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={cIdx}
                        activeOpacity={0.7}
                        disabled={lockoutSeconds > 0}
                        onPress={() => handlePinKey(item)}
                        style={[
                          styles.keypadSlot,
                          styles.keypadButton,
                          { backgroundColor: colors.surfaceSubdued },
                        ]}
                      >
                        <Text style={[typography.title1, { color: colors.textPrimary }]}>{item}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        ) : (
          // Default Face ID Prompt Screen
          <View style={styles.centerSection}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
              <Ionicons name="lock-closed" size={56} color={colors.primary} />
            </View>

            <Text style={[typography.title1, styles.title, { color: colors.textPrimary }]}>
              ScanFlow
            </Text>

            <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}>
              {authFailed ? t.auth.failed : t.auth.prompt}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={triggerBiometricAuth}
              style={[
                styles.unlockButton,
                {
                  backgroundColor: colors.primary,
                  borderRadius: borderRadius.round,
                  marginTop: spacing.xl,
                },
              ]}
            >
              <Ionicons name="scan-outline" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={[typography.bodyBold, { color: '#FFFFFF' }]}>
                Mit Face ID entsperren
              </Text>
            </TouchableOpacity>

            {hasPinConfigured && (
              <TouchableOpacity
                onPress={() => setShowPinKeypad(true)}
                style={[styles.secondaryButton, { marginTop: spacing.md }]}
              >
                <Text style={[typography.bodyMedium, { color: colors.primary }]}>
                  Sicherheits-Code verwenden
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  privacyVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  veilIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerSection: {
    alignItems: 'center',
  },
  pinWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
    marginBottom: 30,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  keypadContainer: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 14,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  keypadSlot: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButton: {
    borderRadius: 34,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  secondaryButton: {
    padding: 8,
  },
});
