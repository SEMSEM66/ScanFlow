import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, capsule } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { useScanner } from '../../src/components/ScannerProvider';

export default function TabLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const scanner = useScanner();

  // Five equal slots with the camera button in the middle: two tabs on each side
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopColor: colors.tabBarBorder,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          borderTopWidth: 1,
          elevation: 0,
        },
        // iOS tab bar size; not scaled with the text size (like iOS) so "Einstellungen" fits in its slot
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.library.title,
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'folder' : 'folder-outline'} size={24} color={focused ? colors.primary : colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t.search.title,
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={23} color={focused ? colors.primary : colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan-tab-placeholder"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.floatingButtonContainer}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => scanner.scan()}
                disabled={scanner.busy}
                accessibilityRole="button"
                accessibilityLabel={t.scan.title}
                style={[
                  styles.floatingButton,
                  {
                    backgroundColor: colors.primary,
                    shadowColor: colors.primary,
                  },
                ]}
              >
                <Ionicons name="camera" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: t.tools.title,
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'construct' : 'construct-outline'} size={23} color={focused ? colors.primary : colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.settings.title,
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={23} color={focused ? colors.primary : colors.textMuted} />
          ),
        }}
      />
    </Tabs>
  );
}

const FAB_SIZE = 60;

const styles = StyleSheet.create({
  floatingButtonContainer: {
    top: -16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    ...capsule(FAB_SIZE),
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
