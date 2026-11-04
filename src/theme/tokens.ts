export const lightColors = {
  background: '#FBF9F5', // warm ivory / off-white matching bearbeiten.png
  surface: '#FFFFFF',
  surfaceSubdued: '#F2EFE9',
  surfaceVariant: '#EFECE6',
  card: '#FFFFFF',
  cardBorder: '#E8E5DF',
  
  textPrimary: '#111111',
  textSecondary: '#6C6C70',
  textMuted: '#8E8E93',
  textInverse: '#FFFFFF',
  
  primary: '#0066FF', // Vibrant iOS Blue from design mocks
  primarySubdued: '#EBF3FF',
  primaryBorder: '#B8D5FF',
  
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  
  border: '#E8E5DF',
  borderLight: '#F3F0EA',
  separator: '#ECE9E3',
  
  searchBackground: '#EAE8E3',
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#E8E5DF',
  
  // Camera specific overlays
  cameraOverlay: 'rgba(0, 0, 0, 0.65)',
  cameraGuides: '#00D2FF', // Cyan glowing corner guides
  cameraButton: 'rgba(255, 255, 255, 0.25)',
  
  // Shadows
  shadowColor: '#000000',
  shadowOpacity: 0.05,
};

export const darkColors: typeof lightColors = {
  background: '#0D0E11',
  surface: '#1A1B20',
  surfaceSubdued: '#25262C',
  surfaceVariant: '#2D2E35',
  card: '#1A1B20',
  cardBorder: '#2B2D35',
  
  textPrimary: '#F6F6F7',
  textSecondary: '#A0A2AA',
  textMuted: '#6C6E79',
  textInverse: '#111111',
  
  primary: '#2B7FFF',
  primarySubdued: '#142747',
  primaryBorder: '#234C8C',
  
  success: '#30D158',
  danger: '#FF453A',
  warning: '#FF9F0A',
  
  border: '#2B2D35',
  borderLight: '#353742',
  separator: '#272932',
  
  searchBackground: '#202229',
  tabBarBackground: '#16171C',
  tabBarBorder: '#2B2D35',
  
  cameraOverlay: 'rgba(0, 0, 0, 0.75)',
  cameraGuides: '#00D2FF',
  cameraButton: 'rgba(255, 255, 255, 0.2)',
  
  shadowColor: '#000000',
  shadowOpacity: 0.2,
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  hero: 40,
} as const;

export const borderRadius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 9999,
} as const;

export const typography = {
  largeTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700' as const,
    letterSpacing: 0.35,
  },
  title1: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  title2: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  title3: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.15,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  bodyBold: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  subhead: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '400' as const,
  },
  caption1: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500' as const,
  },
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '500' as const,
  },
} as const;
