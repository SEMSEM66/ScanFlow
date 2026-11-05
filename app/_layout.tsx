import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '../src/theme';
import { I18nProvider } from '../src/i18n';
import { AppLockOverlay } from '../src/components/AppLockOverlay';
import { ScannerProvider } from '../src/components/ScannerProvider';
import { getDatabase } from '../src/db/database';
import { storageService } from '../src/services/StorageService';

function RootNavigation() {
  const { colors, isDark } = useTheme();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initApp() {
      try {
        // Initialize SQLite DB & run seed migrations
        await getDatabase();
        // Initialize storage directory
        await storageService.initStorageDirectory();
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

  // ScannerProvider sits outside the lock overlay so a running scan import
  // survives the privacy veil (it replaces its children while inactive).
  return (
    <ScannerProvider>
      <AppLockOverlay>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="scan"
            options={{
              presentation: 'fullScreenModal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="crop"
            options={{
              presentation: 'fullScreenModal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="document/[id]"
            options={{
              headerShown: false,
            }}
          />
        </Stack>
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
