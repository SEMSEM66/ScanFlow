import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';

export default function SettingsScreen() {
  const { colors, typography, spacing, isDark, mode, setMode } = useTheme();
  const { t, language, setLanguage } = useTranslation();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[styles.title, typography.largeTitle, { color: colors.textPrimary }]}>
          {t.settings.title}
        </Text>
      </View>

      <View style={[styles.section, { paddingHorizontal: spacing.base, marginTop: spacing.lg }]}>
        {/* Appearance Row */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="moon-outline" size={22} color={colors.primary} style={styles.rowIcon} />
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                {t.settings.appearance}
              </Text>
            </View>
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                onPress={() => setMode('light')}
                style={[
                  styles.optionPill,
                  mode === 'light' && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={{ color: mode === 'light' ? '#FFFFFF' : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  {t.settings.appearanceLight}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode('dark')}
                style={[
                  styles.optionPill,
                  mode === 'dark' && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={{ color: mode === 'dark' ? '#FFFFFF' : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  {t.settings.appearanceDark}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Language Row */}
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 12, paddingTop: 12 }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="globe-outline" size={22} color={colors.primary} style={styles.rowIcon} />
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                {t.settings.language}
              </Text>
            </View>
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                onPress={() => setLanguage('de')}
                style={[
                  styles.optionPill,
                  language === 'de' && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={{ color: language === 'de' ? '#FFFFFF' : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  DE
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setLanguage('en')}
                style={[
                  styles.optionPill,
                  language === 'en' && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={{ color: language === 'en' ? '#FFFFFF' : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  EN
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Privacy Note Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginTop: spacing.md }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} style={styles.rowIcon} />
              <View>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  {t.settings.privacy}
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {t.settings.privacySubtitle}
                </Text>
              </View>
            </View>
          </View>
        </View>
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
  section: {},
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    marginRight: 12,
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 2,
    gap: 4,
  },
  optionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
});
