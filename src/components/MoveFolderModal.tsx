import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Folder, Document } from '../types';

interface MoveFolderModalProps {
  visible: boolean;
  document: Document | null;
  folders: Folder[];
  onClose: () => void;
  onSelectFolder: (folderId: string | null) => void;
}

export const MoveFolderModal: React.FC<MoveFolderModalProps> = ({
  visible,
  document,
  folders,
  onClose,
  onSelectFolder,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  if (!document) return null;

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
                {t.library.moveToFolder}
              </Text>

              <ScrollView style={{ maxHeight: 320 }}>
                {/* Option: No folder */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelectFolder(null);
                    onClose();
                  }}
                  style={[
                    styles.folderRow,
                    { borderBottomColor: colors.borderLight },
                    document.folderId === null && { backgroundColor: colors.surfaceSubdued },
                  ]}
                >
                  <Ionicons name="folder-outline" size={22} color={colors.textSecondary} style={styles.icon} />
                  <Text style={[typography.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
                    {t.library.removeFromFolder}
                  </Text>
                  {document.folderId === null && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>

                {/* Available folders */}
                {folders.map((folder) => {
                  const isCurrent = document.folderId === folder.id;
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      activeOpacity={0.7}
                      onPress={() => {
                        onSelectFolder(folder.id);
                        onClose();
                      }}
                      style={[
                        styles.folderRow,
                        { borderBottomColor: colors.borderLight },
                        isCurrent && { backgroundColor: colors.surfaceSubdued },
                      ]}
                    >
                      <Ionicons
                        name="folder"
                        size={22}
                        color={isCurrent ? colors.primary : colors.textSecondary}
                        style={styles.icon}
                      />
                      <Text style={[typography.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
                        {folder.name}
                      </Text>
                      {isCurrent && (
                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

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
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
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
