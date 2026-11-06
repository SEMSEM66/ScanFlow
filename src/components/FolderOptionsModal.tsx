import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { capsule, corner, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Folder } from '../types';
import { BottomSheet } from './BottomSheet';

interface FolderOptionsModalProps {
  visible: boolean;
  folder: Folder | null;
  onClose: () => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}

/**
 * Folder menu (bottom sheet). The chosen action runs once the menu is
 * completely gone, so the prompt or alert can be presented.
 */
export const FolderOptionsModal: React.FC<FolderOptionsModalProps> = ({
  visible,
  folder,
  onClose,
  onRename,
  onDelete,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();
  // Keep the last folder on screen while the sheet glides out (the screen clears it on close)
  const [shown, setShown] = useState(folder);
  if (folder && folder !== shown) setShown(folder);
  // Action chosen in the menu; runs in onDismiss
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (visible) pending.current = null; // reopened: an earlier choice no longer applies
  }, [visible]);

  if (!shown) return null;

  const choose = (action: (folder: Folder) => void) => {
    const target = shown;
    pending.current = () => action(target);
    onClose();
  };

  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismiss={runPending} style={styles.sheet}>
      <View style={styles.handleContainer}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      <Text style={[typography.title3, styles.title, { color: colors.textPrimary }]}>
        {shown.name}
      </Text>

      <View style={[styles.list, { marginHorizontal: spacing.base }]}>
        {/* Rename Folder */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => choose(onRename)}
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
          onPress={() => choose(onDelete)}
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
  title: {
    textAlign: 'center',
    marginBottom: 16,
  },
  list: {
    ...corner(radius.md),
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
