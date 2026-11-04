import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, typography, spacing } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
          <Text style={[typography.bodyMedium, { color: colors.primary }]}>Dokumente</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.center}>
        <Ionicons name="document-text-outline" size={64} color={colors.primary} />
        <Text style={[typography.title3, { color: colors.textPrimary, marginTop: spacing.base }]}>
          Dokumenten-Vorschau
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          ID: {id}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
