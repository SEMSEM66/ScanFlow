import React, { forwardRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { capsule, corner, hairline, radius, useTheme } from '../../theme';
import { Icon } from './Icon';

export const INPUT_HEIGHT = { regular: 44, search: 36 } as const;

export interface InputProps extends TextInputProps {
  /** regular: rounded text field (radius md) · search: capsule search field. */
  variant?: keyof typeof INPUT_HEIGHT;
  /** SF Symbol at the start (search fields default to the magnifying glass). */
  icon?: SFSymbol;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Single-line text field with continuous corners and a capped Dynamic Type size. */
export const Input = forwardRef<TextInputInstance, InputProps>(function Input(
  { variant = 'regular', icon, containerStyle, style, ...rest },
  ref
) {
  const { colors, typography } = useTheme();
  const height = INPUT_HEIGHT[variant];
  const symbol = icon ?? (variant === 'search' ? 'magnifyingglass' : undefined);
  return (
    <View
      style={[
        styles.container,
        { height, backgroundColor: colors.searchBackground },
        variant === 'search' ? capsule(height) : [corner(radius.md), { borderWidth: hairline, borderColor: colors.border }],
        containerStyle,
      ]}
    >
      {symbol ? <Icon name={symbol} size={16} color={colors.textMuted} /> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        maxFontSizeMultiplier={1.3}
        clearButtonMode="while-editing"
        style={[typography.body, styles.input, { color: colors.textPrimary }, style]}
        {...rest}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
  },
});