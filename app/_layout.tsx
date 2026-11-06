import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { Stack, ThemeProvider as NavigationThemeProvider, DefaultTheme, DarkTheme, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '../src/theme';
import { I18nProvider, useTranslation } from '../src/i18n';
import { AppLockOverlay } from '../src/components/AppLockOverlay';
import { ScannerProvider } from '../src/components/ScannerProvider';
import { getDatabase } from '../src/db/database';
import { storageService } from '../src/services/StorageService';
import { documentRepository } from '../src/services/DocumentRepository';
import { ocrService } from '../src/services/OcrService';
import { pdfToolkitService } from '../src/services/PdfToolkitService';

function RootNavigation() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const lastHandledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    async function initApp() {
      try {
        // Initialize SQLite DB & run seed migrations
        await getDatabase();
        // Initialize storage directory
        await storageService.initStorageDirectory();
        // Exported PDFs/JPGs are deleted after sharing; remove leftovers of an interrupted share
        await storageService.clearCaches();
        // Purge expired documents from 30-day Trash on launch
        await documentRepository.purgeExpiredTrash();
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

  // Handle "Open in ScanFlow" incoming file:// URLs (PDFs and images from Files / Share Sheet)
  useEffect(() => {
    if (!isReady) return;
    const processIncomingUrl = async (url: string | null) => {
      if (!url || !url.startsWith('file://') || lastHandledUrlRef.current === url) return;
      lastHandledUrlRef.current = url;
      const outcome = await pdfToolkitService.handleIncomingUrl(url, {
        defaultTitle: t.library.title,
      });
      if (!outcome) return;
      if (outcome.status === 'saved') {
        router.push(`/document/${outcome.documentId}` as any);
      } else if (outcome.status === 'unavailable') {
        Alert.alert(t.library.importPdfUnavailableTitle, t.library.importPdfUnavailableMessage);
      } else if (outcome.status === 'locked') {
        Alert.alert(t.library.importPdfLockedTitle, t.library.importPdfLockedMessage);
      } else if (outcome.status === 'failed') {
        Alert.alert(t.common.error, t.library.importPdfFailed);
      }
    };

    void Linking.getInitialURL().then(processIncomingUrl);
    const sub = Linking.addEventListener('url', (event) => {
      void processIncomingUrl(event.url);
    });
    return () => {
      sub.remove();
    };
  }, [isReady, router, t]);

  if (!isReady) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const sheetBackground =
    Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26
      ? 'transparent'
      : colors.surface;
  const sheetOptions = {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: true,
    contentStyle: { backgroundColor: sheetBackground },
  };

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
            options={{ ...sheetOptions, sheetAllowedDetents: [0.75, 1] }}
          />
          <Stack.Screen
            name="sheets/export"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.85, 1] }}
          />
          <Stack.Screen
            name="sheets/move"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.5, 1] }}
          />
          <Stack.Screen
            name="sheets/text"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.5, 1] }}
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
