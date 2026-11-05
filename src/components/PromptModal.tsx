import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

interface PromptModalProps {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  visible,
  title,
  initialValue = '',
  placeholder = '',
  confirmText,
  onConfirm,
  onClose,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  // Reset the text whenever the prompt opens / gets a new initial value
  const [synced, setSynced] = useState({ initialValue, visible });
  if (synced.initialValue !== initialValue || synced.visible !== visible) {
    setSynced({ initialValue, visible });
    setValue(initialValue);
  }

  const handleConfirm = () => {
    if (value.trim().length > 0) {
      onConfirm(value.trim());
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoid}
          >
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.lg,
                    shadowColor: colors.shadowColor,
                  },
                ]}
              >
                <Text style={[typography.title3, styles.title, { color: colors.textPrimary }]}>
                  {title}
                </Text>

                <TextInput
                  value={value}
                  onChangeText={setValue}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surfaceSubdued,
                      borderColor: colors.border,
                      borderRadius: borderRadius.md,
                      color: colors.textPrimary,
                    },
                  ]}
                  returnKeyType="done"
                  onSubmitEditing={handleConfirm}
                />

                <View style={[styles.buttonsRow, { marginTop: spacing.md }]}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={onClose}
                    style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
                  >
                    <Text style={[typography.body, { color: colors.textSecondary }]}>
                      {t.common.cancel}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleConfirm}
                    disabled={value.trim().length === 0}
                    style={[
                      styles.button,
                      styles.confirmButton,
                      {
                        backgroundColor:
                          value.trim().length > 0 ? colors.primary : colors.surfaceSubdued,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.bodyBold,
                        {
                          color: value.trim().length > 0 ? '#FFFFFF' : colors.textMuted,
                        },
                      ]}
                    >
                      {confirmText || t.common.save}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  keyboardAvoid: {
    width: '100%',
    maxWidth: 340,
  },
  card: {
    width: '100%',
    padding: 20,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  title: {
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    height: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {},
});
