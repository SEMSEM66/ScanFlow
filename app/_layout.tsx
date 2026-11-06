import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Stack, ThemeProvider as NavigationThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '../src/theme';
import { I18nProvider, useTranslation } from '../src/i18n';
import { AppLockOverlay } from '../src/components/AppLockOverlay';
import { ScannerProvider } from '../src/components/ScannerProvider';
import { getDatabase } from '../src/db/database';
import { storageService } from '../src/services/StorageService';
import { ocrService } from '../src/services/OcrService';

function RootNavigation() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initApp() {
      try {
        // Initialize SQLite DB & run seed migrations
        await getDatabase();
        // Initialize storage directory
        await storageService.initStorageDirectory();
        // Exported PDFs/JPGs are deleted after sharing; remove leftovers of an interrupted share
        await storageService.clearCaches();
        // Text recognition of new / changed pages in the background (installed app only)
        ocrService.start();
      } catch (err) {
        console.error('[ScanFlow] Initialization error:', err);
      } finally {
        setIsReady(true);
      }
    }
    initApp();
  }, []);

  if (!isReady) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // AppLockOverlay keeps its children mounted and draws the lock screen above
  // the whole window (also above modal screens and the iOS scanner), so
  // navigation and a running scan import survive locking.
  return (
    <ScannerProvider>
      <AppLockOverlay>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <NavigationThemeProvider value={{
          ...(isDark ? DarkTheme : DefaultTheme),
          colors: {
            ...(isDark ? DarkTheme : DefaultTheme).colors,
            background: colors.background, card: colors.surface, text: colors.textPrimary,
            border: colors.border, primary: colors.primary,
          },
        }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t.library.title }} />
          <Stack.Screen name="search" options={{ headerShown: true, title: t.search.title, headerTransparent: false, headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, headerTitleStyle: { color: colors.textPrimary } }} />
          <Stack.Screen
            name="sheets/adjust"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.75, 1],
              sheetGrabberVisible: true,
              sheetExpandsWhenScrolledToEdge: true,
              contentStyle: { backgroundColor: Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? 'transparent' : colors.surface },
            }}
          />
          <Stack.Screen
            name="sheets/export"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.85, 1],
              sheetGrabberVisible: true,
              sheetExpandsWhenScrolledToEdge: true,
              contentStyle: { backgroundColor: Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? 'transparent' : colors.surface },
            }}
          />
          <Stack.Screen
            name="sheets/move"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              sheetExpandsWhenScrolledToEdge: true,
              contentStyle: { backgroundColor: Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? 'transparent' : colors.surface },
            }}
          />
          <Stack.Screen
            name="sheets/text"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              sheetExpandsWhenScrolledToEdge: true,
              contentStyle: { backgroundColor: Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? 'transparent' : colors.surface },
            }}
          />
          <Stack.Screen
            name="scan"
            options={{
              presentation: 'fullScreenModal',
              headerShown: true, title: t.scan.title, headerTransparent: false,
              headerStyle: { backgroundColor: '#000000' }, headerTintColor: '#FFFFFF',
              headerTitleStyle: { color: '#FFFFFF' },
            }}
          />
          <Stack.Screen
            name="crop"
            options={{
              presentation: 'fullScreenModal',
              headerShown: true, title: t.crop.title, headerTransparent: false,
              headerStyle: { backgroundColor: '#101114' }, headerTintColor: '#FFFFFF',
              headerTitleStyle: { color: '#FFFFFF' },
            }}
          />
          <Stack.Screen
            name="document/[id]"
            options={{
              headerShown: true,
              title: t.filters.title,
              headerTransparent: false,
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.background },
              headerTitleStyle: { color: colors.textPrimary },
            }}
          />
        </Stack>
        </NavigationThemeProvider>
      </AppLockOverlay>
    </ScannerProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <RootNavigation />
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
