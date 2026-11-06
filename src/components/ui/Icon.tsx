import React from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';

export type IconName = SFSymbol;

export interface IconProps {
  /** SF Symbol name (checked by TypeScript). */
  name: SFSymbol;
  /** Point size of the symbol box (default 20). */
  size?: number;
  color?: ColorValue;
  /** Match the weight of the text next to the symbol (default regular). */
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}

/** SF Symbol (expo-symbols, native UIImage) – the only icon set used in ScanFlow's UI. */
export const Icon: React.FC<IconProps> = ({ name, size = 20, color, weight = 'regular', style }) => (
  <SymbolView
    name={name}
    size={size}
    tintColor={color}
    weight={weight}
    resizeMode="scaleAspectFit"
    style={style}
    accessible={false}
    importantForAccessibility="no"
  />
);