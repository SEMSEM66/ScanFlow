import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';

export default function ToolsScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[styles.title, typography.largeTitle, { color: colors.textPrimary }]}>
          {t.tools.title}
        </Text>
      </View>

      <View style={styles.center}>
        <Ionicons name="construct-outline" size={48} color={colors.textMuted} />
        <Text style={[typography.title3, { color: colors.textPrimary, marginTop: spacing.md }]}>
          {t.tools.comingTitle}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: 32 }]}>
          {t.tools.comingText}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
  },
  title: {
    letterSpacing: -0.5,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
