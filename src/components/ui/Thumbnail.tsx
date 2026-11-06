import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageProps,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { concentric, corner, hairline, radius as radii, useTheme } from '../../theme';

/** Width of the selection ring and the gap between ring and image (pt). */
const RING = 2.5;
const GAP = 2;

export interface ThumbnailProps {
  uri?: string | null;
  width: number | `${number}%`;
  height?: number | `${number}%`;
  /** Width / height when only the width is known. */
  aspectRatio?: number;
  /** Outer corner radius (default radius.sm); the image inside follows concentrically. */
  radius?: number;
  /** Selection ring in the accent colour. */
  selected?: boolean;
  /** Hairline outline when not selected (default true). */
  bordered?: boolean;
  resizeMode?: ImageProps['resizeMode'];
  onLoad?: ImageProps['onLoad'];
  imageStyle?: StyleProp<ImageStyle>;
  style?: StyleProp<ViewStyle>;
  /** Shown instead of the image while there is no uri, or on top of it (badges). */
  children?: React.ReactNode;
}

/** Rounded image tile with continuous corners and an optional selection ring. */
export const Thumbnail: React.FC<ThumbnailProps> = ({
  uri,
  width,
  height,
  aspectRatio,
  radius = radii.sm,
  selected = false,
  bordered = true,
  resizeMode = 'cover',
  onLoad,
  imageStyle,
  style,
  children,
}) => {
  const { colors } = useTheme();
  const ring = selected ? RING : bordered ? hairline : 0;
  const inset = selected ? RING + GAP : ring;
  return (
    <View
      style={[
        styles.frame,
        corner(radius),
        { width, height, aspectRatio, padding: inset - ring, borderWidth: ring },
        { borderColor: selected ? colors.primary : colors.cardBorder, backgroundColor: colors.surfaceSubdued },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode={resizeMode}
          onLoad={onLoad}
          style={[styles.image, corner(concentric(radius, inset)), imageStyle]}
        />
      ) : null}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  image: {
    flex: 1,
    width: '100%',
  },
});