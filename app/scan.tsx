import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme';
import { useTranslation } from '../src/i18n';

export default function ScanModalScreen() {
  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#000000' }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.circleButton}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[typography.headline, { color: '#FFFFFF' }]}>
          {t.scan.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.center}>
        <Ionicons name="camera-outline" size={64} color="#FFFFFF" />
        <Text style={[typography.title3, { color: '#FFFFFF', marginTop: spacing.base }]}>
          Kamera-Scanner bereit
        </Text>
        <Text style={[typography.body, { color: 'rgba(255,255,255,0.7)', marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: 32 }]}>
          Wird in Step 2 vollständig mit Live-View, Cyan-Führungslinien und Mehrseiten-Erfassung implementiert.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
