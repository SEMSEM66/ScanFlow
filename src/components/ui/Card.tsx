import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { corner, hairline, radius as radii, shadows, useTheme, type ShadowLevel } from '../../theme';

export interface CardProps extends ViewProps {
  /** Corner radius (default radius.lg). Nested shapes use concentric(radius, inset). */
  radius?: number;
  /** Soft shadow. It is drawn by an outer wrapper so the inner view can still clip. */
  elevated?: ShadowLevel;
  /** Hairline outline (default true). */
  bordered?: boolean;
  /** Clip the content (e.g. an edge-to-edge image) to the rounded shape. */
  clip?: boolean;
  /** Fill colour (default colors.card). */
  color?: string;
  /** Outline colour (default colors.cardBorder). */
  borderColor?: string;
  /** Layout of the children (padding, direction …); `style` is the outer box (size, margins). */
  contentStyle?: StyleProp<ViewStyle>;
}

/** Rounded surface with continuous corners – cards, grouped sections, banners. */
export const Card: React.FC<CardProps> = ({
  radius = radii.lg,
  elevated,
  bordered = true,
  clip = false,
  color,
  borderColor,
  style,
  contentStyle,
  children,
  ...rest
}) => {
  const { colors } = useTheme();
  const shape = corner(radius);
  const fill = { backgroundColor: color ?? colors.card };
  const outline = bordered ? { borderWidth: hairline, borderColor: borderColor ?? colors.cardBorder } : null;

  if (!elevated) {
    return (
      <View {...rest} style={[shape, fill, outline, clip && styles.clip, style, contentStyle]}>
        {children}
      </View>
    );
  }
  // Shadow on the wrapper (with a fill, so iOS draws it from the rounded shape), clipping inside
  return (
    <View {...rest} style={[shape, fill, shadows[elevated], { shadowColor: colors.shadowColor }, style]}>
      <View style={[shape, styles.inner, outline, clip && styles.clip, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  inner: {
    flexGrow: 1,
  },
  clip: {
    overflow: 'hidden',
  },
});