import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n';

export default function Layout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return <Stack screenOptions={{ headerLargeTitleEnabled: true, headerTransparent: false, headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, headerTitleStyle: { color: colors.textPrimary }, contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="index" options={{ title: t.tools.title }} />
  </Stack>;
}
