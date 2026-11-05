import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

interface DocumentBottomBarProps {
  onRotate: () => void;
  onCrop: () => void;
  onAdjust: () => void;
  onDeletePage: () => void;
  onAddPage: () => void;
  disabled?: boolean;
}

export const DocumentBottomBar: React.FC<DocumentBottomBarProps> = ({
  onRotate,
  onCrop,
  onAdjust,
  onDeletePage,
  onAddPage,
  disabled = false,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderLight,
          borderRadius: borderRadius.xxl,
          marginHorizontal: spacing.base,
          marginBottom: spacing.md,
        },
      ]}
    >
      {/* Drehen (Rotate) */}
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onRotate}
        style={styles.actionItem}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
          <Ionicons name="refresh-outline" size={22} color={colors.textPrimary} />
        </View>
        <Text style={[typography.caption2, styles.label, { color: colors.textPrimary }]}>
          {t.filters.rotate}
        </Text>
      </TouchableOpacity>

      {/* Zuschneiden (Crop) */}
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onCrop}
        style={styles.actionItem}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
          <Ionicons name="crop-outline" size={22} color={colors.textPrimary} />
        </View>
        <Text style={[typography.caption2, styles.label, { color: colors.textPrimary }]}>
          {t.filters.crop}
        </Text>
      </TouchableOpacity>

      {/* Anpassen (Adjustments) */}
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onAdjust}
        style={styles.actionItem}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
          <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
        </View>
        <Text style={[typography.caption2, styles.label, { color: colors.textPrimary }]}>
          {t.filters.adjust}
        </Text>
      </TouchableOpacity>

      {/* Löschen (Delete Page) */}
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onDeletePage}
        style={styles.actionItem}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </View>
        <Text style={[typography.caption2, styles.label, { color: colors.danger }]}>
          {t.filters.deletePage}
        </Text>
      </TouchableOpacity>

      {/* Seite hinzufügen (Add Page) */}
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onAddPage}
        style={styles.actionItem}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
          <Ionicons name="document-attach-outline" size={22} color={colors.primary} />
        </View>
        <Text style={[typography.caption2, styles.label, { color: colors.primary }]}>
          {t.filters.addPage}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  label: {
    fontWeight: '500',
    textAlign: 'center',
  },
});
