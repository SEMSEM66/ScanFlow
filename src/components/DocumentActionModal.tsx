import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Document } from '../types';

interface DocumentActionModalProps {
  visible: boolean;
  document: Document | null;
  onClose: () => void;
  onRename: (document: Document) => void;
  onMove: (document: Document) => void;
  onDuplicate: (document: Document) => void;
  onDelete: (document: Document) => void;
  /** Recognized text (copy / share); row hidden when not provided. */
  onShowText?: (document: Document) => void;
}

export const DocumentActionModal: React.FC<DocumentActionModalProps> = ({
  visible,
  document,
  onClose,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
  onShowText,
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
              {/* Handle Bar */}
              <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </View>

              {/* Title */}
              <View style={[styles.header, { paddingHorizontal: spacing.base, paddingBottom: spacing.sm }]}>
                <Text
                  numberOfLines={1}
                  style={[typography.title3, { color: colors.textPrimary, textAlign: 'center' }]}
                >
                  {document.title}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={[styles.actionsList, { marginHorizontal: spacing.base }]}>
                {/* Rename */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    onClose();
                    onRename(document);
                  }}
                  style={[styles.actionRow, { borderBottomColor: colors.borderLight }]}
                >
                  <Ionicons name="pencil-outline" size={20} color={colors.primary} style={styles.actionIcon} />
                  <Text style={[typography.body, { color: colors.textPrimary }]}>
                    {t.library.renameDocument}
                  </Text>
                </TouchableOpacity>

                {/* Move to folder */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    onClose();
                    onMove(document);
                  }}
                  style={[styles.actionRow, { borderBottomColor: colors.borderLight }]}
                >
                  <Ionicons name="folder-outline" size={20} color={colors.primary} style={styles.actionIcon} />
                  <Text style={[typography.body, { color: colors.textPrimary }]}>
                    {t.library.moveToFolder}
                  </Text>
                </TouchableOpacity>

                {/* Duplicate */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    onClose();
                    onDuplicate(document);
                  }}
                  style={[styles.actionRow, { borderBottomColor: colors.borderLight }]}
                >
                  <Ionicons name="copy-outline" size={20} color={colors.primary} style={styles.actionIcon} />
                  <Text style={[typography.body, { color: colors.textPrimary }]}>
                    {t.library.duplicateDocument}
                  </Text>
                </TouchableOpacity>

                {/* Recognized text */}
                {onShowText ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      onShowText(document);
                    }}
                    style={[styles.actionRow, { borderBottomColor: colors.borderLight }]}
                  >
                    <Ionicons name="document-text-outline" size={20} color={colors.primary} style={styles.actionIcon} />
                    <Text style={[typography.body, { color: colors.textPrimary }]}>{t.ocr.menuAction}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Delete */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    onClose();
                    onDelete(document);
                  }}
                  style={styles.actionRow}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} style={styles.actionIcon} />
                  <Text style={[typography.body, { color: colors.danger, fontWeight: '500' }]}>
                    {t.library.deleteDocument}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Cancel Button */}
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
  header: {
    marginBottom: 8,
  },
  actionsList: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  actionIcon: {
    marginRight: 14,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
