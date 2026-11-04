import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { authService } from '../services/AuthService';

interface PinSetupModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PinSetupModal: React.FC<PinSetupModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  const [step, setStep] = useState<1 | 2>(1);
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const currentPin = step === 1 ? firstPin : confirmPin;

  const handleKeyPress = (num: string) => {
    if (currentPin.length >= 4) return;
    const nextPin = currentPin + num;

    if (step === 1) {
      setFirstPin(nextPin);
      if (nextPin.length === 4) {
        setTimeout(() => setStep(2), 200);
      }
    } else {
      setConfirmPin(nextPin);
      if (nextPin.length === 4) {
        if (nextPin === firstPin) {
          setTimeout(async () => {
            await authService.setPinCode(nextPin);
            Alert.alert('Erfolg', 'Sicherheits-PIN wurde erfolgreich eingerichtet.');
            resetModal();
            onSuccess();
          }, 200);
        } else {
          setTimeout(() => {
            Alert.alert('Fehler', 'Die Codes stimmen nicht überein. Bitte erneut versuchen.');
            resetModal();
          }, 200);
        }
      }
    }
  };

  const handleDelete = () => {
    if (step === 1) {
      setFirstPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const resetModal = () => {
    setStep(1);
    setFirstPin('');
    setConfirmPin('');
  };

  const handleCancel = () => {
    resetModal();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={[typography.body, { color: colors.primary }]}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.centerSection}>
          <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
            <Ionicons name="keypad-outline" size={42} color={colors.primary} />
          </View>

          <Text style={[typography.title2, styles.title, { color: colors.textPrimary }]}>
            {step === 1 ? 'Neuen PIN-Code festlegen' : 'PIN-Code bestätigen'}
          </Text>

          <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}>
            {step === 1
              ? 'Wählen Sie einen 4-stelligen Sicherheits-Code.'
              : 'Geben Sie den 4-stelligen Code erneut ein.'}
          </Text>

          {/* 4 Pin Dot Indicators */}
          <View style={styles.dotsRow}>
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = idx < currentPin.length;
              return (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: isFilled ? colors.primary : colors.surfaceSubdued,
                      borderColor: isFilled ? colors.primary : colors.border,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>

        {/* Numeric Keypad */}
        <View style={styles.keypadContainer}>
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
            ['', '0', 'del'],
          ].map((row, rIdx) => (
            <View key={rIdx} style={styles.keypadRow}>
              {row.map((item, cIdx) => {
                if (item === '') {
                  return <View key={cIdx} style={styles.keypadSlot} />;
                }
                if (item === 'del') {
                  return (
                    <TouchableOpacity
                      key={cIdx}
                      activeOpacity={0.7}
                      onPress={handleDelete}
                      style={[styles.keypadSlot, styles.keypadButton]}
                    >
                      <Ionicons name="backspace-outline" size={26} color={colors.textPrimary} />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={cIdx}
                    activeOpacity={0.7}
                    onPress={() => handleKeyPress(item)}
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
  },
  centerSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
    marginBottom: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 8,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  keypadContainer: {
    paddingHorizontal: 36,
    paddingBottom: 40,
    gap: 16,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  keypadSlot: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButton: {
    borderRadius: 36,
  },
});
