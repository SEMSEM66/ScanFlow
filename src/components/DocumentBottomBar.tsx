import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from './ui/Icon';
import { capsule, corner, hairline, radius, shadows, useTheme } from '../theme';
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
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderLight,
          ...corner(radius.xl),
          shadowColor: colors.shadowColor,
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
          <Icon name="arrow.clockwise" size={22} color={colors.textPrimary} />
        </View>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[typography.caption2, styles.label, { color: colors.textPrimary }]}>
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
          <Icon name="crop" size={22} color={colors.textPrimary} />
        </View>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[typography.caption2, styles.label, { color: colors.textPrimary }]}>
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
          <Icon name="slider.horizontal.3" size={22} color={colors.textPrimary} />
        </View>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[typography.caption2, styles.label, { color: colors.textPrimary }]}>
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
          <Icon name="trash" size={22} color={colors.danger} />
        </View>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[typography.caption2, styles.label, { color: colors.danger }]}>
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
          <Icon name="doc.badge.plus" size={22} color={colors.primary} />
        </View>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[typography.caption2, styles.label, { color: colors.primary }]}>
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
    borderWidth: hairline,
    ...shadows.card,
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    ...capsule(44),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  label: {
    fontWeight: '500',
    textAlign: 'center',
  },
});
