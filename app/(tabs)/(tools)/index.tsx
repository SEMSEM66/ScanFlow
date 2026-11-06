import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../../src/components/ui/Icon';
import { useTheme } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n';

export default function ToolsScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.center}>
      <View style={styles.center}>
        <Icon name="wrench.and.screwdriver" size={48} color={colors.textMuted} />
        <Text style={[typography.title3, { color: colors.textPrimary, marginTop: spacing.md }]}>
          {t.tools.comingTitle}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: 32 }]}>
          {t.tools.comingText}
        </Text>
      </View>
      </ScrollView>
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
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
