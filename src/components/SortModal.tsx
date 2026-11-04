import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

export type SortOption = 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc';

interface SortModalProps {
  visible: boolean;
  currentSort: SortOption;
  onClose: () => void;
  onSelectSort: (sort: SortOption) => void;
}

export const SortModal: React.FC<SortModalProps> = ({
  visible,
  currentSort,
  onClose,
  onSelectSort,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  const options: { id: SortOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'date_desc', label: t.library.sortDateDesc, icon: 'time-outline' },
    { id: 'date_asc', label: t.library.sortDateAsc, icon: 'timer-outline' },
    { id: 'title_asc', label: t.library.sortTitleAsc, icon: 'text-outline' },
    { id: 'title_desc', label: t.library.sortTitleDesc, icon: 'text-outline' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: borderRadius.xl,
                  borderTopRightRadius: borderRadius.xl,
                },
              ]}
            >
              <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </View>

              <Text style={[typography.title3, styles.title, { color: colors.textPrimary }]}>
                {t.library.sort}
              </Text>

              <View style={[styles.list, { marginHorizontal: spacing.base }]}>
                {options.map((opt) => {
                  const isSelected = currentSort === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      activeOpacity={0.7}
                      onPress={() => {
                        onSelectSort(opt.id);
                        onClose();
                      }}
                      style={[
                        styles.row,
                        { borderBottomColor: colors.borderLight },
                        isSelected && { backgroundColor: colors.surfaceSubdued },
                      ]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={20}
                        color={isSelected ? colors.primary : colors.textSecondary}
                        style={styles.icon}
                      />
                      <Text
                        style={[
                          typography.body,
                          {
                            color: isSelected ? colors.primary : colors.textPrimary,
                            fontWeight: isSelected ? '600' : '400',
                            flex: 1,
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onClose}
                style={[
                  styles.cancelButton,
                  {
                    backgroundColor: colors.surfaceSubdued,
                    borderRadius: borderRadius.md,
                    marginHorizontal: spacing.base,
                    marginTop: spacing.md,
                    marginBottom: spacing.xl,
                  },
                ]}
              >
                <Text style={[typography.bodyBold, { color: colors.textPrimary, textAlign: 'center' }]}>
                  {t.common.cancel}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingTop: 12,
  },
  handleContainer: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 16,
  },
  list: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  icon: {
    marginRight: 14,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
