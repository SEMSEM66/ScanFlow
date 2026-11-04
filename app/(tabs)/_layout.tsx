import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
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
        name="scan-tab-placeholder"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.floatingButtonContainer}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/scan')}
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
          title: 'Werkzeuge',
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

const styles = StyleSheet.create({
  floatingButtonContainer: {
    top: -16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
