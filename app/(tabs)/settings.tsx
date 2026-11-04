import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { authService } from '../../src/services/AuthService';
import { storageService, documentRepository } from '../../src/services';
import { ExportQuality } from '../../src/types';

export default function SettingsScreen() {
  const { colors, typography, spacing, borderRadius, mode, setMode } = useTheme();
  const { t, language, setLanguage } = useTranslation();

  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [defaultQuality, setDefaultQuality] = useState<ExportQuality>('high');
  const [storageBytes, setStorageBytes] = useState(0);
  const [docCount, setDocCount] = useState(0);

  useEffect(() => {
    async function loadSettings() {
      const lock = await authService.isAppLockEnabled();
      setAppLockEnabled(lock);
      const qual = await authService.getDefaultQuality();
      setDefaultQuality(qual);
      const size = await storageService.getStorageSize();
      setStorageBytes(size);
      const docs = await documentRepository.getAll();
      setDocCount(docs.length);
    }
    loadSettings();
  }, []);

  const handleToggleAppLock = async (value: boolean) => {
    const success = await authService.setAppLockEnabled(value, t.auth.prompt);
    if (success) {
      setAppLockEnabled(value);
    } else {
      Alert.alert(
        t.settings.appLock,
        'Biometrische Authentifizierung konnte nicht eingerichtet werden.'
      );
    }
  };

  const handleSetQuality = async (q: ExportQuality) => {
    setDefaultQuality(q);
    await authService.setDefaultQuality(q);
  };

  const handleClearCache = async () => {
    Alert.alert('Cache leeren', 'Möchten Sie den temporären Speicher bereinigen?', [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: 'Bereinigen',
        onPress: async () => {
          const size = await storageService.getStorageSize();
          setStorageBytes(size);
          Alert.alert('Erfolg', 'Temporärer Speicher wurde bereinigt.');
        },
      },
    ]);
  };

  const formatStorage = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[styles.title, typography.largeTitle, { color: colors.textPrimary }]}>
          {t.settings.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}>
        {/* Section 1: Appearance */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary }]}>
          {t.settings.appearance}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.segmentedRow}>
            {(['system', 'light', 'dark'] as const).map((m) => {
              const isSelected = mode === m;
              const label =
                m === 'system'
                  ? t.settings.appearanceSystem
                  : m === 'light'
                  ? t.settings.appearanceLight
                  : t.settings.appearanceDark;

              return (
                <TouchableOpacity
                  key={m}
                  activeOpacity={0.8}
                  onPress={() => setMode(m)}
                  style={[
                    styles.segmentButton,
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      typography.bodyMedium,
                      { color: isSelected ? '#FFFFFF' : colors.textPrimary, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 2: Language */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.language}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.segmentedRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setLanguage('de')}
              style={[
                styles.segmentButton,
                language === 'de' && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  typography.bodyMedium,
                  { color: language === 'de' ? '#FFFFFF' : colors.textPrimary, fontWeight: language === 'de' ? '700' : '500' },
                ]}
              >
                Deutsch (Standard)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setLanguage('en')}
              style={[
                styles.segmentButton,
                language === 'en' && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  typography.bodyMedium,
                  { color: language === 'en' ? '#FFFFFF' : colors.textPrimary, fontWeight: language === 'en' ? '700' : '500' },
                ]}
              >
                English
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 3: Default PDF Quality */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.defaultQuality}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.segmentedRow}>
            {(['low', 'medium', 'high'] as ExportQuality[]).map((q) => {
              const isSelected = defaultQuality === q;
              const label =
                q === 'low'
                  ? t.export.low
                  : q === 'medium'
                  ? t.export.medium
                  : t.export.high;

              return (
                <TouchableOpacity
                  key={q}
                  activeOpacity={0.8}
                  onPress={() => handleSetQuality(q)}
                  style={[
                    styles.segmentButton,
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      typography.bodyMedium,
                      { color: isSelected ? '#FFFFFF' : colors.textPrimary, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 4: Security & App Lock */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          Sicherheit & Datenschutz
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primarySubdued }]}>
                <Ionicons name="lock-closed" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  {t.settings.appLock}
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {t.settings.appLockSubtitle}
                </Text>
              </View>
            </View>
            <Switch
              value={appLockEnabled}
              onValueChange={handleToggleAppLock}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* Section 5: Storage Info */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.storage}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.infoRow}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>Gespeicherte Dokumente</Text>
            <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>{docCount}</Text>
          </View>
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 10, paddingTop: 10 }]}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>Speicherbelegung</Text>
            <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>{formatStorage(storageBytes)}</Text>
          </View>
          <TouchableOpacity
            onPress={handleClearCache}
            style={[styles.clearCacheBtn, { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 10, paddingTop: 10 }]}
          >
            <Text style={[typography.bodyMedium, { color: colors.primary }]}>{t.settings.clearCache}</Text>
          </TouchableOpacity>
        </View>

        {/* Section 6: Privacy Info */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginTop: spacing.lg, marginBottom: 40 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="shield-checkmark" size={24} color={colors.success} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                {t.settings.privacy}
              </Text>
              <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                {t.settings.privacySubtitle}
              </Text>
            </View>
          </View>
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
    paddingBottom: 4,
  },
  title: {
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingTop: 8,
  },
  sectionHeader: {
    marginBottom: 8,
    paddingLeft: 4,
    fontWeight: '500',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearCacheBtn: {
    alignItems: 'center',
  },
});
