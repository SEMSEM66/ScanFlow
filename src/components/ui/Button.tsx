import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { capsule, corner, radius, useTheme } from '../../theme';
import { Icon } from './Icon';

export type ButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain';
export type ButtonSize = 'large' | 'medium' | 'small';

/** Real control heights (pt); the touch target is never below 44 pt. */
export const BUTTON_HEIGHT: Record<ButtonSize, number> = { large: 50, medium: 44, small: 34 };

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title?: string;
  /** SF Symbol before the title. */
  icon?: SFSymbol;
  variant?: ButtonVariant;
  size?: ButtonSize;
  destructive?: boolean;
  /** Spinner instead of the label; the button is disabled meanwhile. */
  loading?: boolean;
  /** Capsule (default, radius = height / 2) or rounded rectangle. */
  shape?: 'capsule' | 'rounded';
  /** Custom label (e.g. a progress row) – replaces icon and title. */
  children?: React.ReactNode;
  /** Label colour override (e.g. on the dark camera UI). */
  tint?: string;
  /** Fill colour override for 'filled' / 'tinted' / 'gray'. */
  fill?: string;
  style?: StyleProp<ViewStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  icon,
  variant = 'filled',
  size = 'large',
  destructive = false,
  loading = false,
  shape = 'capsule',
  children,
  tint,
  fill,
  style,
  disabled,
  hitSlop,
  ...rest
}) => {
  const { colors, typography } = useTheme();
  const height = BUTTON_HEIGHT[size];
  const accent = destructive ? colors.danger : colors.primary;
  const background =
    fill ??
    (variant === 'filled'
      ? accent
      : variant === 'tinted'
        ? destructive
          ? colors.dangerSubdued
          : colors.primarySubdued
        : variant === 'gray'
          ? colors.surfaceSubdued
          : 'transparent');
  const foreground = tint ?? (variant === 'filled' ? '#FFFFFF' : variant === 'gray' && !destructive ? colors.textPrimary : accent);
  const label = size === 'small' ? [typography.footnote, styles.semibold] : typography.headline;
  const inactive = !!disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={hitSlop ?? (height < 44 ? (44 - height) / 2 : undefined)}
      style={({ pressed }) => [
        styles.base,
        { height, paddingHorizontal: size === 'small' ? 14 : 20, backgroundColor: background },
        shape === 'capsule' ? capsule(height) : corner(radius.md),
        pressed && styles.pressed,
        disabled && !loading && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {children ??
        (loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={size === 'small' ? 15 : 19} color={foreground} weight="semibold" /> : null}
            {title ? (
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[label, { color: foreground }]}>
                {title}
              </Text>
            ) : null}
          </>
        ))}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  semibold: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});