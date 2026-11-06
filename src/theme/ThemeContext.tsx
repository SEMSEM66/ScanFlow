import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors, spacing, typography } from './tokens';
import { radius } from './shape';
import { ThemeMode } from '../types';

type ColorTheme = typeof lightColors;

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ColorTheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('light'); // default to warm light theme matching designs

  const isDark = useMemo(() => {
    if (mode === 'system') {
      return systemScheme === 'dark';
    }
    return mode === 'dark';
  }, [mode, systemScheme]);

  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const value = useMemo(
    () => ({
      mode,
      isDark,
      colors,
      spacing,
      radius,
      typography,
      setMode,
    }),
    [mode, isDark, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
