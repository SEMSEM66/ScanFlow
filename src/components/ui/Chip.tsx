import React from 'react';
import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { capsule, useTheme } from '../../theme';
import { Icon } from './Icon';

/** Real chip height (pt); hitSlop extends the touch target to 44 pt. */
export const CHIP_HEIGHT = 32;

export interface ChipProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  selected?: boolean;
  /** SF Symbol before the label. */
  icon?: SFSymbol;
  /** Colour overrides (e.g. chips on the dark camera / crop UI). */
  fill?: string;
  selectedFill?: string;
  tint?: string;
  selectedTint?: string;
  style?: StyleProp<ViewStyle>;
}

/** Capsule pill: folder filters, page formats, small actions. */
export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  icon,
  fill,
  selectedFill,
  tint,
  selectedTint,
  style,
  disabled,
  ...rest
}) => {
  const { colors, typography } = useTheme();
  const background = selected ? (selectedFill ?? colors.primary) : (fill ?? colors.surfaceSubdued);
  const foreground = selected ? (selectedTint ?? '#FFFFFF') : (tint ?? colors.textPrimary);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={(44 - CHIP_HEIGHT) / 2}
      style={({ pressed }) => [
        styles.chip,
        capsule(CHIP_HEIGHT),
        { backgroundColor: background },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {icon ? <Icon name={icon} size={14} color={foreground} weight="semibold" /> : null}
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[typography.subhead, styles.label, { color: foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  label: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});