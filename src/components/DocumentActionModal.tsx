import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { capsule, corner, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Document } from '../types';
import { BottomSheet } from './BottomSheet';

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

/**
 * Document menu (bottom sheet). The chosen action runs once the menu is
 * completely gone, so the next sheet, prompt or alert can be presented
 * (iOS shows one modal at a time).
 */
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
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();
  // Keep the last document on screen while the sheet glides out (the screen clears it on close)
  const [shown, setShown] = useState(document);
  if (document && document !== shown) setShown(document);
  // Action chosen in the menu; runs in onDismiss
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (visible) pending.current = null; // reopened: an earlier choice no longer applies
  }, [visible]);

  if (!shown) return null;

  const choose = (action: (document: Document) => void) => {
    const doc = shown;
    pending.current = () => action(doc);
    onClose();
  };

  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismiss={runPending} style={styles.sheet}>
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
          {shown.title}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={[styles.actionsList, { marginHorizontal: spacing.base }]}>
        {/* Rename */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => choose(onRename)}
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
          onPress={() => choose(onMove)}
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
          onPress={() => choose(onDuplicate)}
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
            onPress={() => choose(onShowText)}
            style={[styles.actionRow, { borderBottomColor: colors.borderLight }]}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.primary} style={styles.actionIcon} />
            <Text style={[typography.body, { color: colors.textPrimary }]}>{t.ocr.menuAction}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Delete */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => choose(onDelete)}
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
            ...corner(radius.md),
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
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
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
    ...capsule(4),
  },
  header: {
    marginBottom: 8,
  },
  actionsList: {
    ...corner(radius.md),
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
