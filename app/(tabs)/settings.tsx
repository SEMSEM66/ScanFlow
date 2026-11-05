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
import * as ScreenCapture from 'expo-screen-capture';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { authService, LockTimeoutOption } from '../../src/services/AuthService';
import { storageService, documentRepository } from '../../src/services';
import { ExportDpi, ExportQuality } from '../../src/types';
import { EXPORT_DPI_PRESETS } from '../../src/imaging/pageFormat';
import { PinSetupModal } from '../../src/components/PinSetupModal';

export default function SettingsScreen() {
  const { colors, typography, spacing, borderRadius, mode, setMode } = useTheme();
  const { t, language, setLanguage, formatString } = useTranslation();

  // Security state
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [lockTimeout, setLockTimeout] = useState<LockTimeoutOption>(0);
  const [screenCaptureProtection, setScreenCaptureProtection] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);

  // App & Storage state
  const [defaultQuality, setDefaultQuality] = useState<ExportQuality>('medium');
  const [defaultDpi, setDefaultDpiState] = useState<ExportDpi>(200);
  const [storageBytes, setStorageBytes] = useState(0);
  const [docCount, setDocCount] = useState(0);

  useEffect(() => {
    async function loadSettings() {
      const lock = await authService.isAppLockEnabled();
      setAppLockEnabled(lock);
      const pinConfigured = await authService.hasPinCode();
      setHasPin(pinConfigured);
      const timeout = await authService.getLockTimeout();
      setLockTimeout(timeout);
      const screenCap = await authService.isScreenCaptureProtectionEnabled();
      setScreenCaptureProtection(screenCap);
      const qual = await authService.getDefaultQuality();
      setDefaultQuality(qual);
      setDefaultDpiState(await authService.getDefaultDpi());
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

  const handleToggleScreenCapture = async (value: boolean) => {
    setScreenCaptureProtection(value);
    await authService.setScreenCaptureProtection(value);
    if (value) {
      await ScreenCapture.preventScreenCaptureAsync();
      Alert.alert(
        'Screenshot-Schutz aktiv',
        'Bildschirmaufnahmen und Screenshots sind nun gesperrt, um Ihre Dokumente zu schützen.'
      );
    } else {
      await ScreenCapture.allowScreenCaptureAsync();
    }
  };

  const handleSetTimeout = async (timeout: LockTimeoutOption) => {
    setLockTimeout(timeout);
    await authService.setLockTimeout(timeout);
  };

  const handleSetQuality = async (q: ExportQuality) => {
    setDefaultQuality(q);
    await authService.setDefaultQuality(q);
  };

  const handleSetDpi = async (d: ExportDpi) => {
    setDefaultDpiState(d);
    await authService.setDefaultDpi(d);
  };

  const handleClearCache = async () => {
    Alert.alert(t.settings.clearCacheTitle, t.settings.clearCacheMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.settings.clearCacheConfirm,
        onPress: async () => {
          // Temporary export files only – scans and previews are kept
          await storageService.clearCaches();
          const size = await storageService.getStorageSize();
          setStorageBytes(size);
          Alert.alert(t.settings.success, t.settings.clearCacheDone);
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
        {/* Section 1: Security & Privacy (Prominent & Bank-Grade) */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary }]}>
          Sicherheit & Datenschutz
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Biometric App Lock Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primarySubdued }]}>
                <Ionicons name="scan" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  {t.settings.appLock}
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  Face ID / Touch ID Schutz
                </Text>
              </View>
            </View>
            <Switch
              value={appLockEnabled}
              onValueChange={handleToggleAppLock}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* Backup PIN Setup */}
          <View style={[styles.actionRow, { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 12, paddingTop: 12 }]}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.surfaceSubdued }]}>
                <Ionicons name="keypad-outline" size={20} color={colors.textPrimary} />
              </View>
              <View>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  Sicherheits-PIN
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {hasPin ? 'PIN-Code eingerichtet' : 'Backup-PIN festlegen'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsPinModalVisible(true)}
              style={[styles.smallPillBtn, { backgroundColor: colors.surfaceSubdued }]}
            >
              <Text style={[typography.caption1, { color: colors.primary, fontWeight: '700' }]}>
                {hasPin ? 'Ändern' : 'Einrichten'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Auto-Lock Timeout */}
          {appLockEnabled && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 12, paddingTop: 12 }}>
              <Text style={[typography.footnote, { color: colors.textSecondary, marginBottom: 8 }]}>
                Sperr-Verzögerung
              </Text>
              <View style={styles.segmentedRow}>
                {[
                  { id: 0 as LockTimeoutOption, label: 'Sofort' },
                  { id: 60 as LockTimeoutOption, label: '1 Min.' },
                  { id: 300 as LockTimeoutOption, label: '5 Min.' },
                ].map((item) => {
                  const isSelected = lockTimeout === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      onPress={() => handleSetTimeout(item.id)}
                      style={[
                        styles.segmentButton,
                        isSelected && { backgroundColor: colors.primary },
                      ]}
                    >
                      <Text
                        style={[
                          typography.caption1,
                          { color: isSelected ? '#FFFFFF' : colors.textPrimary, fontWeight: isSelected ? '700' : '500' },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Screen Capture & Recording Protection */}
          <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 12, paddingTop: 12 }]}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.surfaceSubdued }]}>
                <Ionicons name="eye-off-outline" size={20} color={colors.textPrimary} />
              </View>
              <View>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  Screenshot-Schutz
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  Verhindert Bildschirmaufnahmen & Fotos
                </Text>
              </View>
            </View>
            <Switch
              value={screenCaptureProtection}
              onValueChange={handleToggleScreenCapture}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* Zero-Trace Shredding Badge */}
          <View style={[styles.securityFeatureBadge, { backgroundColor: colors.surfaceSubdued, marginTop: 14 }]}>
            <Ionicons name="shield-checkmark" size={16} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={[typography.caption2, { color: colors.textSecondary, flex: 1 }]}>
              Zero-Trace Löschen: Gelöschte Seiten werden physikalisch mit Nullen überschrieben.
            </Text>
          </View>
        </View>

        {/* Section 2: Appearance */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
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

        {/* Section 3: Language */}
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

        {/* Section 4: Default PDF Quality */}
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

        {/* Section 4b: Default export resolution */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.defaultResolution}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.segmentedRow}>
            {EXPORT_DPI_PRESETS.map((d) => {
              const isSelected = defaultDpi === d;
              return (
                <TouchableOpacity
                  key={d}
                  activeOpacity={0.8}
                  onPress={() => handleSetDpi(d)}
                  style={[styles.segmentButton, isSelected && { backgroundColor: colors.primary }]}
                >
                  <Text
                    style={[
                      typography.bodyMedium,
                      { color: isSelected ? '#FFFFFF' : colors.textPrimary, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {formatString(t.export.dpi, { dpi: d })}
                  </Text>
                </TouchableOpacity>
              );
            })}
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

        {/* Section 6: Privacy Guarantee */}
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

      {/* PIN Setup Modal */}
      <PinSetupModal
        visible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        onSuccess={() => {
          setIsPinModalVisible(false);
          setHasPin(true);
        }}
      />
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
  actionRow: {
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
  smallPillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  securityFeatureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
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
