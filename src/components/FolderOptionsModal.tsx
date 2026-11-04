import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Folder } from '../types';

interface FolderOptionsModalProps {
  visible: boolean;
  folder: Folder | null;
  onClose: () => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}

export const FolderOptionsModal: React.FC<FolderOptionsModalProps> = ({
  visible,
  folder,
  onClose,
  onRename,
  onDelete,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  if (!folder) return null;

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
                {folder.name}
              </Text>

              <View style={[styles.list, { marginHorizontal: spacing.base }]}>
                {/* Rename Folder */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    onClose();
                    onRename(folder);
                  }}
                  style={[styles.row, { borderBottomColor: colors.borderLight }]}
                >
                  <Ionicons name="pencil-outline" size={20} color={colors.primary} style={styles.icon} />
                  <Text style={[typography.body, { color: colors.textPrimary }]}>
                    {t.common.edit}
                  </Text>
                </TouchableOpacity>

                {/* Delete Folder */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    onClose();
                    onDelete(folder);
                  }}
                  style={styles.row}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} style={styles.icon} />
                  <Text style={[typography.body, { color: colors.danger, fontWeight: '500' }]}>
                    {t.library.deleteFolder}
                  </Text>
                </TouchableOpacity>
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
