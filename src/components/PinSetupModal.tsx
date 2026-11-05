import React, { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { authService } from '../services/AuthService';
import { DEFAULT_PIN_LENGTH, isWeakPin, type PinLength } from '../security/pinHash';
import { formatWait } from '../security/lockout';
import { PinPad, useCountdown } from './PinPad';

/**
 * - create: new PIN + confirmation
 * - change: current PIN (or Face ID / Touch ID) → new PIN + confirmation
 * - verify: current PIN (or Face ID / Touch ID) only – e.g. before removing it
 */
export type PinFlow = 'create' | 'change' | 'verify';

interface PinSetupModalProps {
  visible: boolean;
  flow: PinFlow;
  /** Cancelled by the user. */
  onClose: () => void;
  /** create / change: PIN saved; verify: identity confirmed. */
  onSuccess: () => void;
}

type Step = 'current' | 'new' | 'confirm';

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 32));

export const PinSetupModal: React.FC<PinSetupModalProps> = ({ visible, flow, onClose, onSuccess }) => {
  const { colors, typography } = useTheme();
  const { t, formatString } = useTranslation();

  // null = first step of the flow; everything is reset when the dialog closes.
  const [step, setStep] = useState<Step | null>(null);
  const [entered, setEntered] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [newLength, setNewLength] = useState<PinLength>(DEFAULT_PIN_LENGTH);
  const [currentLength, setCurrentLength] = useState<PinLength>(4);
  const [biometry, setBiometry] = useState<'faceId' | 'touchId' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const waitMs = useCountdown(lockedUntil);

  const activeStep: Step = step ?? (flow === 'create' ? 'new' : 'current');
  const length = activeStep === 'current' ? currentLength : newLength;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    authService.getCapabilities().then((caps) => {
      if (!alive) return;
      setCurrentLength(caps.pinLength ?? 4);
      setBiometry(caps.biometry);
    });
    authService.getPinLockoutMs().then((ms) => {
      if (alive && ms > 0) setLockedUntil(Date.now() + ms);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const reset = () => {
    setStep(null);
    setEntered('');
    setFirstPin('');
    setNewLength(DEFAULT_PIN_LENGTH);
    setMessage(null);
    setBusy(false);
  };

  const finish = () => {
    reset();
    onSuccess();
  };

  const cancel = () => {
    reset();
    onClose();
  };

  const fail = (text: string) => {
    setMessage(text);
    setShakeKey((k) => k + 1);
    setEntered('');
  };

  const verified = () => {
    if (flow === 'verify') {
      finish();
      return;
    }
    setMessage(null);
    setEntered('');
    setStep('new');
  };

  const checkCurrent = async (pin: string) => {
    setBusy(true);
    await nextFrame();
    const result = await authService.verifyPinCode(pin);
    setBusy(false);
    switch (result.status) {
      case 'ok':
        verified();
        break;
      case 'wrong': {
        if (result.lockedForMs > 0) setLockedUntil(Date.now() + result.lockedForMs);
        const left =
          result.attemptsLeft === 1
            ? t.security.attemptsLeftOne
            : result.attemptsLeft > 1
              ? formatString(t.security.attemptsLeftMany, { count: result.attemptsLeft })
              : '';
        fail(`${t.security.wrongPin} ${left}`.trim());
        break;
      }
      case 'locked':
        setLockedUntil(Date.now() + result.lockedForMs);
        setEntered('');
        setMessage(null);
        break;
      case 'no-pin':
        // Nothing to verify against (removed meanwhile): treat as a new PIN for "change", fail "verify".
        if (flow === 'change') verified();
        else fail(t.security.pinCheckFailed);
        break;
      default:
        fail(t.security.pinCheckFailed);
    }
  };

  const saveNew = async (pin: string) => {
    setBusy(true);
    try {
      await nextFrame();
      await authService.setPinCode(pin);
      finish();
    } catch (err) {
      console.error('[PinSetupModal] Saving the PIN failed:', err);
      setBusy(false);
      Alert.alert(t.common.error, t.security.pinSaveFailed);
      setStep('new');
      setFirstPin('');
      setEntered('');
    }
  };

  const handleDigit = (digit: string) => {
    if (busy || (activeStep === 'current' && waitMs > 0) || entered.length >= length) return;
    const next = entered + digit;
    setEntered(next);
    if (next.length < length) return;

    if (activeStep === 'current') {
      checkCurrent(next);
    } else if (activeStep === 'new') {
      if (isWeakPin(next)) {
        fail(t.security.pinWeak);
        return;
      }
      setFirstPin(next);
      setMessage(null);
      setTimeout(() => {
        setEntered('');
        setStep('confirm');
      }, 150);
    } else if (next !== firstPin) {
      setFirstPin('');
      setStep('new');
      fail(t.security.pinMismatch);
    } else {
      saveNew(next);
    }
  };

  const confirmWithBiometry = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await authService.authenticateBiometric({ prompt: t.security.promptConfirm, cancel: t.common.cancel });
    setBusy(false);
    if (ok) {
      setLockedUntil(0);
      verified();
    }
  };

  const toggleLength = () => {
    setNewLength((l) => (l === 6 ? 4 : 6));
    setEntered('');
    setMessage(null);
  };

  const title =
    activeStep === 'current' ? t.security.pinCurrentTitle : activeStep === 'new' ? t.security.pinNewTitle : t.security.pinConfirmTitle;
  const subtitle =
    activeStep === 'current'
      ? t.security.pinCurrentSubtitle
      : activeStep === 'new'
        ? formatString(t.security.pinNewSubtitle, { digits: newLength })
        : t.security.pinConfirmSubtitle;
  const lockoutText =
    activeStep === 'current' && waitMs > 0 ? formatString(t.security.lockedOut, { time: formatWait(waitMs) }) : null;
  const shownMessage = lockoutText ?? message;
  const biometryName = biometry === 'touchId' ? 'Touch ID' : 'Face ID';

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={cancel}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={cancel} style={styles.cancelBtn} accessibilityRole="button">
            <Text style={[typography.body, { color: colors.primary }]}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.centerSection}>
          <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
            <Ionicons name="keypad-outline" size={38} color={colors.primary} />
          </View>
          <Text style={[typography.title2, styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          <Text
            style={[typography.body, styles.subtitle, { color: shownMessage ? colors.danger : colors.textSecondary }]}
            accessibilityLiveRegion="polite"
          >
            {shownMessage ?? subtitle}
          </Text>

          {activeStep === 'new' ? (
            <TouchableOpacity onPress={toggleLength} style={styles.linkBtn} accessibilityRole="button">
              <Text style={[typography.subhead, { color: colors.primary }]}>
                {newLength === 6 ? t.security.useFourDigits : t.security.useSixDigits}
              </Text>
            </TouchableOpacity>
          ) : activeStep === 'current' && biometry ? (
            <TouchableOpacity onPress={confirmWithBiometry} style={styles.linkBtn} accessibilityRole="button">
              <Text style={[typography.subhead, { color: colors.primary }]}>
                {formatString(t.security.forgotPin, { biometry: biometryName })}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.linkBtn} />
          )}
        </View>

        <View style={styles.padArea}>
          <PinPad
            length={length}
            value={entered}
            onDigit={handleDigit}
            onDelete={() => setEntered((p) => p.slice(0, -1))}
            disabled={busy || (activeStep === 'current' && waitMs > 0)}
            shakeKey={shakeKey}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topHeader: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  cancelBtn: {
    padding: 6,
    alignSelf: 'flex-start',
  },
  centerSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    maxWidth: 320,
    minHeight: 44,
  },
  linkBtn: {
    marginTop: 8,
    minHeight: 32,
    padding: 6,
  },
  padArea: {
    paddingBottom: 32,
  },
});
