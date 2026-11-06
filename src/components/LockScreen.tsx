import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { capsule, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { authService, type PinResult, type UnlockCapabilities } from '../services/AuthService';
import { formatWait } from '../security/lockout';
import { PinPad, useCountdown } from './PinPad';

interface LockScreenProps {
  /** Security settings not read yet – neutral cover without controls. */
  checking: boolean;
  /** Unlock methods (null while loading). */
  caps: UnlockCapabilities | null;
  /** A Face ID / passcode prompt is running. */
  authBusy: boolean;
  /** Face ID / Touch ID / device passcode. */
  onUnlock: () => void;
  onSubmitPin: (pin: string) => Promise<PinResult>;
  /** Re-read the unlock methods (after "no method"). */
  onRefresh: () => void;
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 32));

/** Full-screen lock UI; rendered above every screen and sheet (see AppLockOverlay). */
export const LockScreen: React.FC<LockScreenProps> = ({ checking, caps, authBusy, onUnlock, onSubmitPin, onRefresh }) => {
  const { colors, typography, spacing } = useTheme();
  const { t, formatString } = useTranslation();
  const insets = useSafeAreaInsets();

  const pinLength = caps?.pinLength ?? null;
  const [entered, setEntered] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const waitMs = useCountdown(lockedUntil);

  // A waiting period from an earlier session (the counter survives restarts).
  useEffect(() => {
    if (pinLength === null) return;
    let alive = true;
    authService.getPinLockoutMs().then((ms) => {
      if (alive && ms > 0) setLockedUntil(Date.now() + ms);
    });
    return () => {
      alive = false;
    };
  }, [pinLength]);

  const submit = async (pin: string) => {
    setVerifying(true);
    await nextFrame(); // show the last dot before the ~0.2 s hash
    const result = await onSubmitPin(pin);
    setVerifying(false);
    setEntered('');
    switch (result.status) {
      case 'ok':
        setError(null);
        break;
      case 'wrong': {
        setShakeKey((k) => k + 1);
        if (result.lockedForMs > 0) setLockedUntil(Date.now() + result.lockedForMs);
        const left =
          result.attemptsLeft === 1
            ? t.security.attemptsLeftOne
            : result.attemptsLeft > 1
              ? formatString(t.security.attemptsLeftMany, { count: result.attemptsLeft })
              : '';
        setError(`${t.security.wrongPin} ${left}`.trim());
        break;
      }
      case 'locked':
        setLockedUntil(Date.now() + result.lockedForMs);
        setError(null);
        break;
      case 'no-pin':
        setError(null);
        onRefresh();
        break;
      default:
        setError(t.security.pinCheckFailed);
    }
  };

  const handleDigit = (digit: string) => {
    if (pinLength === null || verifying || waitMs > 0 || entered.length >= pinLength) return;
    const next = entered + digit;
    setEntered(next);
    if (next.length === pinLength) submit(next);
  };

  const biometryLabel =
    caps?.biometry === 'faceId' ? t.security.unlockFaceId : caps?.biometry === 'touchId' ? t.security.unlockTouchId : t.security.unlockPasscode;
  const biometryIcon = caps?.biometry === 'touchId' ? 'finger-print' : caps?.biometry === 'faceId' ? 'scan-outline' : 'keypad-outline';
  const noMethod = !!caps && !caps.passcodeSet && caps.pinLength === null;

  const message =
    waitMs > 0 ? formatString(t.security.lockedOut, { time: formatWait(waitMs) }) : error;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 20 },
      ]}
      accessibilityViewIsModal
    >
      {checking ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
              <Ionicons name="lock-closed" size={36} color={colors.primary} />
            </View>
            <Text style={[typography.title2, styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
              {t.security.lockedTitle}
            </Text>
            <Text
              style={[typography.body, styles.subtitle, { color: message ? colors.danger : colors.textSecondary }]}
              accessibilityLiveRegion="polite"
            >
              {message ?? (pinLength !== null ? t.security.enterPin : t.security.lockedSubtitle)}
            </Text>
          </View>

          {!caps ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : pinLength !== null ? (
            <View style={styles.pinArea}>
              <PinPad
                length={pinLength}
                value={entered}
                onDigit={handleDigit}
                onDelete={() => setEntered((p) => p.slice(0, -1))}
                disabled={verifying || waitMs > 0}
                shakeKey={shakeKey}
                leftAction={
                  caps.biometry
                    ? { icon: biometryIcon, accessibilityLabel: biometryLabel, onPress: () => !authBusy && onUnlock() }
                    : null
                }
              />
            </View>
          ) : noMethod ? (
            <View style={styles.center}>
              <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}>{t.security.noMethodLock}</Text>
              <TouchableOpacity onPress={onRefresh} style={[styles.secondaryButton, { marginTop: spacing.md }]} accessibilityRole="button">
                <Text style={[typography.bodyMedium, { color: colors.primary }]}>{t.security.retry}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.center}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={authBusy}
                onPress={onUnlock}
                accessibilityRole="button"
                style={[
                  styles.unlockButton,
                  { backgroundColor: colors.primary, opacity: authBusy ? 0.6 : 1 },
                ]}
              >
                <Ionicons name={biometryIcon} size={22} color="#FFFFFF" style={styles.unlockIcon} />
                <Text style={[typography.bodyBold, { color: '#FFFFFF' }]}>{biometryLabel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const UNLOCK_HEIGHT = 50;

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    ...capsule(80),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
    minHeight: 44,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  pinArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: UNLOCK_HEIGHT,
    ...capsule(UNLOCK_HEIGHT),
    paddingHorizontal: 28,
  },
  unlockIcon: {
    marginRight: 8,
  },
  secondaryButton: {
    padding: 8,
  },
});
