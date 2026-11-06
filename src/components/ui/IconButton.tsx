import React from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol, SymbolWeight } from 'expo-symbols';
import { capsule, useTheme } from '../../theme';
import { Icon } from './Icon';

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: SFSymbol;
  /** Required: icon-only buttons need a spoken name. */
  accessibilityLabel: string;
  color?: string;
  /** Symbol size (default 20). */
  size?: number;
  weight?: SymbolWeight;
  /** Visible circle behind the symbol (fill colour); none by default. */
  background?: string;
  /** Diameter of the visible circle (default 36). The touch target is always 44 × 44. */
  diameter?: number;
  style?: StyleProp<ViewStyle>;
}

/** Icon-only button with a 44 × 44 pt touch target. */
export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  color,
  size = 20,
  weight = 'medium',
  background,
  diameter = 36,
  style,
  disabled,
  ...rest
}) => {
  const { colors } = useTheme();
  const target = Math.max(44, diameter);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.target,
        { width: target, height: target },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <View
        style={[
          styles.center,
          { width: diameter, height: diameter },
          capsule(diameter),
          background ? { backgroundColor: background } : null,
        ]}
      >
        <Icon name={icon} size={size} color={color ?? colors.primary} weight={weight} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  target: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.3,
  },
});