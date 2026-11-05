import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import {
  authService,
  type LockTimeoutOption,
  type ScannerMode,
  type UnlockCapabilities,
} from '../../src/services/AuthService';
import { privacyService } from '../../src/services/PrivacyService';
import { storageService, documentRepository, documentScanner, ocrService, type OcrStats } from '../../src/services';
import { ExportDpi, ExportQuality } from '../../src/types';
import { EXPORT_DPI_PRESETS } from '../../src/imaging/pageFormat';
import { PinSetupModal, type PinFlow } from '../../src/components/PinSetupModal';
import { useAppLock } from '../../src/components/AppLockOverlay';

export default function SettingsScreen() {
  const { colors, typography, spacing, mode, setMode } = useTheme();
  const { t, language, setLanguage, formatString } = useTranslation();
  const { reload: reloadSecurity } = useAppLock();

  // Security state
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [lockTimeout, setLockTimeout] = useState<LockTimeoutOption>(0);
  const [hidePreview, setHidePreview] = useState(true);
  const [screenCaptureProtection, setScreenCaptureProtection] = useState(false);
  const [caps, setCaps] = useState<UnlockCapabilities | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [pinModal, setPinModal] = useState<{ visible: boolean; flow: PinFlow }>({ visible: false, flow: 'create' });
  const pinFlowDone = useRef<((ok: boolean) => void) | null>(null);

  // Scanner preference
  const [systemScannerAvailable] = useState(() => documentScanner.isSystemScannerAvailable());
  const [scannerMode, setScannerModeState] = useState<ScannerMode>('system');
  const effectiveScannerMode: ScannerMode = systemScannerAvailable ? scannerMode : 'camera';

  // App & Storage state
  const [defaultQuality, setDefaultQuality] = useState<ExportQuality>('medium');
  const [defaultDpi, setDefaultDpiState] = useState<ExportDpi>(200);
  const [storageBytes, setStorageBytes] = useState(0);
  const [docCount, setDocCount] = useState(0);

  // Text recognition (Apple Vision, installed app only)
  const ocrAvailable = ocrService.available;
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [ocrStats, setOcrStats] = useState<OcrStats | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const ocrRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOcr = useCallback(async () => {
    try {
      const [on, stats] = await Promise.all([ocrService.isEnabled(), ocrService.stats()]);
      setOcrEnabled(on);
      setOcrStats(stats);
      setOcrRunning(ocrService.isRunning);
    } catch (err) {
      console.warn('[Settings] OCR status not readable:', err);
    }
  }, []);

  // Live progress while the settings are open (at most one refresh per 0.8 s)
  useFocusEffect(
    useCallback(() => {
      loadOcr();
      if (!ocrAvailable) return undefined;
      const unsubscribe = ocrService.subscribe((e) => {
        if (e.type === 'state') setOcrRunning(e.running);
        if (ocrRefreshTimer.current) return;
        ocrRefreshTimer.current = setTimeout(() => {
          ocrRefreshTimer.current = null;
          loadOcr();
        }, 800);
      });
      return () => {
        unsubscribe();
        if (ocrRefreshTimer.current) clearTimeout(ocrRefreshTimer.current);
        ocrRefreshTimer.current = null;
      };
    }, [loadOcr, ocrAvailable])
  );

  const refreshCaps = useCallback(async () => {
    setCaps(await authService.getCapabilities());
  }, []);

  const loadSecurity = useCallback(async () => {
    try {
      const cfg = await authService.getSecurityConfig();
      setAppLockEnabled(cfg.lockEnabled);
      setLockTimeout(cfg.lockTimeout);
      setHidePreview(cfg.hidePreview);
      setScreenCaptureProtection(cfg.screenCaptureProtection);
    } catch (err) {
      console.warn('[Settings] Security settings not readable:', err);
    }
    await refreshCaps();
  }, [refreshCaps]);

  useEffect(() => {
    async function loadSettings() {
      const qual = await authService.getDefaultQuality();
      setDefaultQuality(qual);
      setDefaultDpiState(await authService.getDefaultDpi());
      setScannerModeState(await authService.getScannerMode());
      const size = await storageService.getStorageSize();
      setStorageBytes(size);
      const docs = await documentRepository.getAll();
      setDocCount(docs.length);
    }
    loadSettings();
  }, []);

  // Face ID / passcode may have changed in iOS Settings meanwhile.
  useFocusEffect(
    useCallback(() => {
      loadSecurity();
    }, [loadSecurity])
  );

  /** Opens the PIN dialog; resolves true when the flow completed. */
  const runPinFlow = (flow: PinFlow) =>
    new Promise<boolean>((resolve) => {
      pinFlowDone.current = resolve;
      setPinModal({ visible: true, flow });
    });

  const endPinFlow = (ok: boolean) => {
    setPinModal((m) => ({ ...m, visible: false }));
    const done = pinFlowDone.current;
    pinFlowDone.current = null;
    done?.(ok);
  };

  /** Face ID / Touch ID, device passcode or ScanFlow PIN – same rules as the lock screen. */
  const verifyOwner = async (prompt: string, c: UnlockCapabilities): Promise<boolean> => {
    const result = await authService.authenticateOwner(c, {
      prompt,
      usePin: t.security.usePin,
      cancel: t.common.cancel,
    });
    if (result === 'success') return true;
    if (result === 'use-pin') return runPinFlow('verify');
    if (result === 'unavailable') Alert.alert(t.security.noMethodTitle, t.security.noMethodMessage);
    return false;
  };

  const enableLockWithNewPin = async () => {
    const created = await runPinFlow('create');
    if (!created) return;
    try {
      await authService.setAppLockEnabled(true);
      setAppLockEnabled(true);
      await reloadSecurity();
    } catch (err) {
      console.error('[Settings] Enabling the app lock failed:', err);
      Alert.alert(t.common.error, t.security.saveFailed);
    }
    await refreshCaps();
  };

  const handleToggleAppLock = async (value: boolean) => {
    if (securityBusy) return;
    setSecurityBusy(true);
    try {
      const c = await authService.getCapabilities();
      setCaps(c);
      if (value && !authService.canUseAppLock(c)) {
        Alert.alert(t.security.noMethodTitle, t.security.noMethodMessage, [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.security.setPinAction, onPress: () => enableLockWithNewPin() },
        ]);
        return;
      }
      // Turning the lock on proves the unlock method works; turning it off needs the owner.
      const ok = await verifyOwner(value ? t.security.promptEnable : t.security.promptDisable, c);
      if (!ok) return;
      await authService.setAppLockEnabled(value);
      setAppLockEnabled(value);
      await reloadSecurity();
    } catch (err) {
      console.error('[Settings] Changing the app lock failed:', err);
      Alert.alert(t.common.error, t.security.saveFailed);
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleSetupPin = async () => {
    if (await runPinFlow('create')) await refreshCaps();
  };

  const handleChangePin = async () => {
    if (await runPinFlow('change')) await refreshCaps();
  };

  const handleRemovePin = async () => {
    const c = await authService.getCapabilities();
    setCaps(c);
    if (appLockEnabled && !c.passcodeSet) {
      Alert.alert(t.security.pinTitle, t.security.pinRemoveBlocked);
      return;
    }
    Alert.alert(t.security.pinRemoveTitle, t.security.pinRemoveMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.security.pinRemove,
        style: 'destructive',
        onPress: async () => {
          if (!(await runPinFlow('verify'))) return;
          try {
            await authService.removePinCode();
          } catch (err) {
            console.error('[Settings] Removing the PIN failed:', err);
            Alert.alert(t.common.error, t.security.saveFailed);
          }
          await refreshCaps();
        },
      },
    ]);
  };

  const handleSetTimeout = async (timeout: LockTimeoutOption) => {
    try {
      await authService.setLockTimeout(timeout);
      setLockTimeout(timeout);
      await reloadSecurity();
    } catch (err) {
      console.error('[Settings] Saving the lock timeout failed:', err);
      Alert.alert(t.common.error, t.security.saveFailed);
    }
  };

  const handleToggleHidePreview = async (value: boolean) => {
    try {
      await authService.setHidePreview(value);
      setHidePreview(value);
      await reloadSecurity();
    } catch (err) {
      console.error('[Settings] Saving the app preview setting failed:', err);
      Alert.alert(t.common.error, t.security.saveFailed);
    }
  };

  const handleToggleScreenCapture = async (value: boolean) => {
    if (!(await privacyService.setScreenCaptureProtection(value))) {
      Alert.alert(t.common.error, t.security.screenCaptureFailed);
      return;
    }
    try {
      await authService.setScreenCaptureProtection(value);
    } catch (err) {
      console.error('[Settings] Saving the screenshot setting failed:', err);
      await privacyService.setScreenCaptureProtection(!value);
      Alert.alert(t.common.error, t.security.saveFailed);
      return;
    }
    setScreenCaptureProtection(value);
    await reloadSecurity();
    if (value) Alert.alert(t.security.screenCaptureOnTitle, t.security.screenCaptureOnMessage);
  };

  const lockSubtitle = (() => {
    if (!caps) return t.settings.appLockSubtitle;
    const methods: string[] = [];
    if (caps.biometry === 'faceId') methods.push('Face ID');
    else if (caps.biometry === 'touchId') methods.push('Touch ID');
    if (caps.pinLength !== null) methods.push(t.security.methodPin);
    else if (caps.passcodeSet) methods.push(t.security.methodPasscode);
    return methods.length > 0
      ? formatString(t.security.lockMethods, { methods: methods.join(t.security.or) })
      : t.security.lockUnavailable;
  })();
  const pinLength = caps?.pinLength ?? null;

  const handleSetQuality = async (q: ExportQuality) => {
    setDefaultQuality(q);
    await authService.setDefaultQuality(q);
  };

  const handleSetDpi = async (d: ExportDpi) => {
    setDefaultDpiState(d);
    await authService.setDefaultDpi(d);
  };

  const handleSetScannerMode = async (m: ScannerMode) => {
    setScannerModeState(m);
    await authService.setScannerMode(m);
  };

  const handleToggleOcr = (value: boolean) => {
    const turnOff = async (deleteText: boolean) => {
      setOcrEnabled(false);
      await ocrService.setEnabled(false);
      if (deleteText) await ocrService.clearAll();
      await loadOcr();
    };
    if (value) {
      setOcrEnabled(true);
      ocrService.setEnabled(true).then(loadOcr);
      return;
    }
    Alert.alert(t.ocr.disableTitle, t.ocr.disableMessage, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.ocr.keepText, onPress: () => turnOff(false) },
      { text: t.ocr.deleteText, style: 'destructive', onPress: () => turnOff(true) },
    ]);
  };

  const ocrStatus = (() => {
    if (!ocrAvailable) return t.ocr.unavailable;
    if (!ocrStats) return ' ';
    if (ocrStats.total === 0) return t.ocr.statusEmpty;
    const counts = { done: ocrStats.recognized, total: ocrStats.total };
    if (!ocrEnabled) return formatString(t.ocr.statusOff, counts);
    return formatString(ocrRunning ? t.ocr.statusRunning : t.ocr.statusDone, counts);
  })();

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
        {/* Section 0: Scanner (iOS document scanner or ScanFlow camera) */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary }]}>
          {t.settings.scanner}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.segmentedRow}>
            {(['system', 'camera'] as ScannerMode[]).map((m) => {
              const isSelected = effectiveScannerMode === m;
              const isDisabled = m === 'system' && !systemScannerAvailable;
              return (
                <TouchableOpacity
                  key={m}
                  activeOpacity={0.8}
                  disabled={isDisabled}
                  onPress={() => handleSetScannerMode(m)}
                  style={[
                    styles.segmentButton,
                    isSelected && { backgroundColor: colors.primary },
                    isDisabled && { opacity: 0.4 },
                  ]}
                >
                  <Text
                    style={[
                      typography.bodyMedium,
                      { color: isSelected ? '#FFFFFF' : colors.textPrimary, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {m === 'system' ? t.settings.scannerSystem : t.settings.scannerCamera}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[typography.footnote, styles.scannerHint, { color: colors.textSecondary }]}>
            {!systemScannerAvailable
              ? t.settings.scannerUnavailable
              : effectiveScannerMode === 'system'
              ? t.settings.scannerSystemHint
              : t.settings.scannerCameraHint}
          </Text>
        </View>

        {/* Section 0b: Text recognition (search, copy text, searchable PDF) */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.ocr.section}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primarySubdued }]}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{t.ocr.enable}</Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {t.ocr.enableSubtitle}
                </Text>
              </View>
            </View>
            <Switch
              value={ocrAvailable && ocrEnabled}
              onValueChange={handleToggleOcr}
              disabled={!ocrAvailable}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
          <View style={[styles.ocrStatusRow, styles.divided, { borderTopColor: colors.borderLight }]}>
            {ocrAvailable && ocrEnabled && ocrRunning ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
            ) : null}
            <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]}>{ocrStatus}</Text>
          </View>
          <View style={[styles.securityFeatureBadge, { backgroundColor: colors.surfaceSubdued, marginTop: 12 }]}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={[typography.caption2, { color: colors.textSecondary, flex: 1 }]}>{t.ocr.privacyNote}</Text>
          </View>
        </View>

        {/* Section 1: Security & Privacy */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.security.section}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* App lock */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primarySubdued }]}>
                <Ionicons name="lock-closed" size={20} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{t.settings.appLock}</Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>{lockSubtitle}</Text>
              </View>
            </View>
            <Switch
              value={appLockEnabled}
              disabled={securityBusy}
              onValueChange={handleToggleAppLock}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* Lock after … */}
          {appLockEnabled && (
            <View style={[styles.divided, { borderTopColor: colors.borderLight }]}>
              <Text style={[typography.footnote, { color: colors.textSecondary, marginBottom: 8 }]}>
                {t.security.lockTimeout}
              </Text>
              <View style={styles.segmentedRow}>
                {[
                  { id: 0 as LockTimeoutOption, label: t.security.timeoutImmediately },
                  { id: 60 as LockTimeoutOption, label: t.security.timeoutOneMinute },
                  { id: 300 as LockTimeoutOption, label: t.security.timeoutFiveMinutes },
                ].map((item) => {
                  const isSelected = lockTimeout === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      onPress={() => handleSetTimeout(item.id)}
                      style={[styles.segmentButton, isSelected && { backgroundColor: colors.primary }]}
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
              <Text style={[typography.caption2, styles.hint, { color: colors.textSecondary }]}>{t.security.timeoutHint}</Text>
            </View>
          )}

          {/* ScanFlow PIN */}
          <View style={[styles.divided, { borderTopColor: colors.borderLight }]}>
            <View style={styles.actionRow}>
              <View style={styles.toggleRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: colors.surfaceSubdued }]}>
                  <Ionicons name="keypad-outline" size={20} color={colors.textPrimary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{t.security.pinTitle}</Text>
                  <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                    {pinLength !== null ? formatString(t.security.pinIsSet, { digits: pinLength }) : t.security.pinNotSet}
                  </Text>
                </View>
              </View>
              {pinLength !== null ? (
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleChangePin}
                    style={[styles.smallPillBtn, { backgroundColor: colors.surfaceSubdued }]}
                  >
                    <Text style={[typography.caption1, { color: colors.primary, fontWeight: '700' }]}>{t.security.pinChange}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleRemovePin}
                    style={[styles.smallPillBtn, { backgroundColor: colors.surfaceSubdued }]}
                  >
                    <Text style={[typography.caption1, { color: colors.danger, fontWeight: '700' }]}>{t.security.pinRemove}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleSetupPin}
                  style={[styles.smallPillBtn, { backgroundColor: colors.surfaceSubdued }]}
                >
                  <Text style={[typography.caption1, { color: colors.primary, fontWeight: '700' }]}>{t.security.pinSetup}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[typography.caption2, styles.hint, { color: colors.textSecondary }]}>{t.security.pinHint}</Text>
          </View>

          {/* Hide the app preview (app switcher) */}
          <View style={[styles.toggleRow, styles.divided, { borderTopColor: colors.borderLight }]}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.surfaceSubdued }]}>
                <Ionicons name="albums-outline" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.rowText}>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{t.security.hidePreview}</Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {t.security.hidePreviewSubtitle}
                </Text>
              </View>
            </View>
            <Switch
              value={hidePreview}
              onValueChange={handleToggleHidePreview}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* Screenshot & recording protection */}
          <View style={[styles.toggleRow, styles.divided, { borderTopColor: colors.borderLight }]}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.surfaceSubdued }]}>
                <Ionicons name="eye-off-outline" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.rowText}>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{t.security.screenCapture}</Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {t.security.screenCaptureSubtitle}
                </Text>
              </View>
            </View>
            <Switch
              value={screenCaptureProtection}
              onValueChange={handleToggleScreenCapture}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* What deleting and local storage really mean */}
          <View style={[styles.securityFeatureBadge, { backgroundColor: colors.surfaceSubdued, marginTop: 14 }]}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={[typography.caption2, { color: colors.textSecondary, flex: 1 }]}>{t.security.storageNote}</Text>
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
            <Text style={[typography.body, { color: colors.textPrimary }]}>{t.settings.storedDocuments}</Text>
            <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>{docCount}</Text>
          </View>
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 10, paddingTop: 10 }]}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>{t.settings.storageUsed}</Text>
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

      {/* ScanFlow PIN: set up / change / confirm */}
      <PinSetupModal
        visible={pinModal.visible}
        flow={pinModal.flow}
        onClose={() => endPinFlow(false)}
        onSuccess={() => endPinFlow(true)}
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
  scannerHint: {
    marginTop: 10,
    paddingHorizontal: 2,
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
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 8,
  },
  rowText: {
    flex: 1,
    paddingRight: 8,
  },
  divided: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  hint: {
    marginTop: 8,
    paddingHorizontal: 2,
  },
  securityFeatureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  ocrStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
