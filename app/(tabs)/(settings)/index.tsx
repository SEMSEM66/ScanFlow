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
import Constants from 'expo-constants';
import { Icon } from '../../../src/components/ui/Icon';
import { Button } from '../../../src/components/ui/Button';
import { SegmentedControl } from '../../../src/components/ui/NativeSegmentedControl';
import { useFocusEffect } from 'expo-router';
import { capsule, concentric, corner, hairline, radius, useTheme } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n';
import {
  authService,
  type LockTimeoutOption,
  type ScannerMode,
  type UnlockCapabilities,
} from '../../../src/services/AuthService';
import { privacyService } from '../../../src/services/PrivacyService';
import {
  storageService,
  documentRepository,
  documentScanner,
  ocrService,
  smartNamingService,
  backupService,
  type OcrStats,
} from '../../../src/services';
import { ExportDpi, ExportQuality } from '../../../src/types';
import { EXPORT_DPI_PRESETS } from '../../../src/imaging/pageFormat';
import { PinSetupModal, type PinFlow } from '../../../src/components/PinSetupModal';
import { useAppLock } from '../../../src/components/AppLockOverlay';
import { SMART_NAMING_PRESETS, formatSmartDocumentTitle } from '../../../src/utils/organization';

export default function SettingsScreen() {
  const { colors, typography, spacing, mode, setMode, isDark } = useTheme();
  const { t, language, setLanguage, formatString } = useTranslation();
  const { reload: reloadSecurity } = useAppLock();

  // Security state
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [lockTimeout, setLockTimeout] = useState<LockTimeoutOption>(0);
  const [hidePreview, setHidePreview] = useState(true);
  const [screenCaptureProtection, setScreenCaptureProtection] = useState(false);
  const [caps, setCaps] = useState<UnlockCapabilities | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [pinModal, setPinModal] = useState<{ visible: boolean; flow: PinFlow; key: number }>({ visible: false, flow: 'create', key: 0 });
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

  // Smart Naming state
  const [smartNamingEnabled, setSmartNamingEnabled] = useState(true);
  const [smartNamingTemplate, setSmartNamingTemplate] = useState('Scan {date} {time}');

  // Full Backup & Restore state
  const [backupBusy, setBackupBusy] = useState<string | null>(null);

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

  const loadStorage = useCallback(async () => {
    try {
      const [size, docs] = await Promise.all([
        storageService.getStorageSize(),
        documentRepository.getAll(),
      ]);
      setStorageBytes(size);
      setDocCount(docs.length);
    } catch (err) {
      console.warn('[Settings] Storage info not readable:', err);
    }
  }, []);

  useEffect(() => {
    async function loadSettings() {
      const qual = await authService.getDefaultQuality();
      setDefaultQuality(qual);
      setDefaultDpiState(await authService.getDefaultDpi());
      setScannerModeState(await authService.getScannerMode());
      const [snEnabled, snTemplate] = await Promise.all([
        smartNamingService.isEnabled(),
        smartNamingService.getTemplate(),
      ]);
      setSmartNamingEnabled(snEnabled);
      setSmartNamingTemplate(snTemplate);
    }
    loadSettings();
  }, []);

  // Face ID / passcode / storage may have changed meanwhile.
  useFocusEffect(
    useCallback(() => {
      loadSecurity();
      loadStorage();
    }, [loadSecurity, loadStorage])
  );

  /** Opens the PIN dialog; resolves true when the flow completed. */
  const runPinFlow = (flow: PinFlow, delayMs = 0) =>
    new Promise<boolean>((resolve) => {
      pinFlowDone.current = resolve;
      const open = () => setPinModal((m) => ({ visible: true, flow, key: m.key + 1 }));
      if (delayMs > 0) setTimeout(open, delayMs);
      else open();
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
    if (result === 'use-pin') return runPinFlow('verify', 250);
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
      if (value && c.pinLength === null) {
        await enableLockWithNewPin();
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
    Alert.alert(t.security.pinRemoveTitle, t.security.pinRemoveMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.security.pinRemove,
        style: 'destructive',
        onPress: async () => {
          // Wait briefly for the native alert to finish dismissing before presenting the PIN sheet
          if (!(await runPinFlow('verify', 300))) return;
          try {
            if (appLockEnabled) {
              await authService.setAppLockEnabled(false);
              setAppLockEnabled(false);
            }
            await authService.removePinCode();
            await reloadSecurity();
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
    methods.push(t.security.methodPin);
    return formatString(t.security.lockMethods, { methods: methods.join(t.security.or) });
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

  const handleToggleSmartNaming = async (val: boolean) => {
    setSmartNamingEnabled(val);
    await smartNamingService.setEnabled(val);
  };

  const handleSelectTemplate = async (tmpl: string) => {
    setSmartNamingTemplate(tmpl);
    await smartNamingService.setTemplate(tmpl);
  };

  const handleCreateBackup = async () => {
    if (backupBusy) return;
    try {
      const estimate = await backupService.estimateBackup();
      if (estimate.documentCount === 0) {
        Alert.alert(t.backup.title, t.common.noItems);
        return;
      }
      if (estimate.exceedsWarning) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            t.backup.sizeWarningTitle,
            formatString(t.backup.sizeWarningMessage, { size: formatStorage(estimate.totalBytes) }),
            [
              { text: t.common.cancel, style: 'cancel', onPress: () => resolve(false) },
              { text: t.common.confirm, onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) return;
      }

      setBackupBusy(t.common.loading);
      const result = await backupService.createBackupZip((current, total) => {
        setBackupBusy(formatString(t.backup.creatingBackup, { current, total }));
      });
      setBackupBusy(null);
      await backupService.shareBackup(result.zipUri);
    } catch (err) {
      console.error('[Settings] Backup creation failed:', err);
      Alert.alert(t.common.error, t.common.error);
    } finally {
      setBackupBusy(null);
    }
  };

  const handleRestoreBackup = async () => {
    if (backupBusy) return;
    try {
      setBackupBusy(t.common.loading);
      const { manifest } = await backupService.pickAndRestoreBackup((current, total) => {
        setBackupBusy(formatString(t.backup.restoringBackup, { current, total }));
      });
      setBackupBusy(null);
      await loadStorage();
      Alert.alert(
        t.backup.restoreSuccessTitle,
        formatString(t.backup.restoreSuccessMessage, {
          docs: manifest.documents.length,
          pages: manifest.documents.reduce((acc, d) => acc + d.pages.length, 0),
        })
      );
    } catch (err: any) {
      setBackupBusy(null);
      if (err?.message !== 'cancelled') {
        console.error('[Settings] Backup restore failed:', err);
        Alert.alert(t.common.error, t.backup.restoreFailed);
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}>
        {/* Section 0: Scanner (iOS document scanner or ScanFlow camera) */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary }]}>
          {t.settings.scanner}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SegmentedControl
            values={[t.settings.scannerSystem, t.settings.scannerCamera]}
            selectedIndex={effectiveScannerMode === 'system' ? 0 : 1}
            enabled={systemScannerAvailable}
            appearance={isDark ? 'dark' : 'light'}
            style={styles.nativeSegment}
            onChange={(event) => {
              const nextMode: ScannerMode = event.nativeEvent.selectedSegmentIndex === 0 ? 'system' : 'camera';
              void handleSetScannerMode(nextMode);
            }}
          />
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
                <Icon name="doc.text" size={20} color={colors.primary} />
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
            <Icon name="iphone" size={16} color={colors.success} style={{ marginRight: 8 }} />
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
                <Icon name="lock.fill" size={20} color={colors.primary} />
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
              <SegmentedControl
                values={[
                  t.security.timeoutImmediately,
                  t.security.timeoutOneMinute,
                  t.security.timeoutFiveMinutes,
                ]}
                selectedIndex={([0, 60, 300] as LockTimeoutOption[]).indexOf(lockTimeout)}
                appearance={isDark ? 'dark' : 'light'}
                style={styles.nativeSegment}
                onChange={(event) => {
                  const value = ([0, 60, 300] as LockTimeoutOption[])[event.nativeEvent.selectedSegmentIndex];
                  if (value !== undefined) void handleSetTimeout(value);
                }}
              />
              <Text style={[typography.caption2, styles.hint, { color: colors.textSecondary }]}>{t.security.timeoutHint}</Text>
            </View>
          )}

          {/* ScanFlow PIN */}
          <View style={[styles.divided, { borderTopColor: colors.borderLight }]}>
            <View style={styles.actionRow}>
              <View style={styles.toggleRowLeft}>
                <View style={[styles.iconBox, { backgroundColor: colors.surfaceSubdued }]}>
                  <Icon name="keyboard" size={20} color={colors.textPrimary} />
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
                <Icon name="square.stack" size={20} color={colors.textPrimary} />
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
                <Icon name="eye.slash" size={20} color={colors.textPrimary} />
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
            <Icon name="iphone" size={16} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={[typography.caption2, { color: colors.textSecondary, flex: 1 }]}>{t.security.storageNote}</Text>
          </View>
        </View>

        {/* Section 2: Appearance */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.appearance}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SegmentedControl values={[t.settings.appearanceSystem, t.settings.appearanceLight, t.settings.appearanceDark]}
            selectedIndex={(['system', 'light', 'dark'] as const).indexOf(mode)} appearance={isDark ? 'dark' : 'light'} style={styles.nativeSegment}
            onChange={(event) => { const value = (['system', 'light', 'dark'] as const)[event.nativeEvent.selectedSegmentIndex]; if (value) setMode(value); }} />
        </View>

        {/* Section 3: Language */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.language}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SegmentedControl values={['Deutsch (Standard)', 'English']} selectedIndex={language === 'de' ? 0 : 1}
            appearance={isDark ? 'dark' : 'light'} style={styles.nativeSegment}
            onChange={(event) => setLanguage(event.nativeEvent.selectedSegmentIndex === 0 ? 'de' : 'en')} />
        </View>

        {/* Section 4: Default PDF Quality */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.defaultQuality}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SegmentedControl values={[t.export.low, t.export.medium, t.export.high]}
            selectedIndex={(['low', 'medium', 'high'] as ExportQuality[]).indexOf(defaultQuality)} appearance={isDark ? 'dark' : 'light'} style={styles.nativeSegment}
            onChange={(event) => { const value = (['low', 'medium', 'high'] as ExportQuality[])[event.nativeEvent.selectedSegmentIndex]; if (value) void handleSetQuality(value); }} />
        </View>

        {/* Section 4b: Default export resolution */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.defaultResolution}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SegmentedControl values={EXPORT_DPI_PRESETS.map((d) => formatString(t.export.dpi, { dpi: d }))}
            selectedIndex={EXPORT_DPI_PRESETS.indexOf(defaultDpi)} appearance={isDark ? 'dark' : 'light'} style={styles.nativeSegment}
            onChange={(event) => { const value = EXPORT_DPI_PRESETS[event.nativeEvent.selectedSegmentIndex]; if (value) void handleSetDpi(value); }} />
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
          <View style={[styles.infoRow, { borderTopWidth: hairline, borderTopColor: colors.borderLight, marginTop: 10, paddingTop: 10 }]}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>{t.settings.storageUsed}</Text>
            <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>{formatStorage(storageBytes)}</Text>
          </View>
          <TouchableOpacity
            onPress={handleClearCache}
            style={[styles.clearCacheBtn, { borderTopWidth: hairline, borderTopColor: colors.borderLight, marginTop: 10, paddingTop: 10 }]}
          >
            <Text style={[typography.bodyMedium, { color: colors.primary }]}>{t.settings.clearCache}</Text>
          </TouchableOpacity>
        </View>

        {/* Section 5b: Smart Naming */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.smartNaming.title}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primarySubdued }]}>
                <Icon name="pencil.and.ellipsis.rectangle" size={20} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  {t.smartNaming.autoNamingToggle}
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {t.smartNaming.autoNamingDescription}
                </Text>
              </View>
            </View>
            <Switch
              value={smartNamingEnabled}
              onValueChange={(val) => void handleToggleSmartNaming(val)}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {smartNamingEnabled ? (
            <View style={styles.divided}>
              <Text style={[typography.subhead, { color: colors.textPrimary, fontWeight: '600', marginBottom: 8 }]}>
                {t.smartNaming.templateLabel}
              </Text>
              {SMART_NAMING_PRESETS.map((preset) => {
                const isSelected = smartNamingTemplate === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => void handleSelectTemplate(preset)}
                    style={[
                      styles.templateRow,
                      {
                        backgroundColor: isSelected ? colors.primarySubdued : colors.surfaceSubdued,
                        borderColor: isSelected ? colors.primary : colors.borderLight,
                      },
                    ]}
                  >
                    <Icon
                      name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                      size={18}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={[
                        typography.body,
                        {
                          color: isSelected ? colors.primary : colors.textPrimary,
                          fontWeight: isSelected ? '600' : '400',
                          marginLeft: 10,
                          flex: 1,
                        },
                      ]}
                    >
                      {preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <View style={[styles.previewBox, { backgroundColor: colors.surfaceSubdued, marginTop: 10 }]}>
                <Text style={[typography.caption2, { color: colors.textSecondary }]}>
                  {t.smartNaming.preview}:
                </Text>
                <Text style={[typography.footnote, { color: colors.textPrimary, fontWeight: '600', marginTop: 2 }]}>
                  {formatSmartDocumentTitle(smartNamingTemplate, {
                    folderName: 'Rechnungen',
                    ocrText: 'Deutsche Telekom GmbH\nRechnung 14.03.2026',
                    counter: 1,
                  })}
                </Text>
              </View>

              <Text style={[typography.caption2, { color: colors.textMuted, marginTop: 8 }]}>
                {t.smartNaming.tokensHint}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Section 5c: Backup & Transfer */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.backup.title}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.iconBox, { backgroundColor: colors.primarySubdued }]}>
              <Icon name="archivebox" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                {t.backup.sectionHeader}
              </Text>
              <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                {t.backup.description}
              </Text>
            </View>
          </View>

          {backupBusy ? (
            <View style={[styles.busyBox, { backgroundColor: colors.primarySubdued, marginTop: 14 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[typography.footnote, { color: colors.primary, fontWeight: '600', marginLeft: 8 }]}>
                {backupBusy}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Button
                title={t.backup.createBackup}
                size="medium"
                onPress={() => void handleCreateBackup()}
                style={{ flex: 1 }}
              />
              <Button
                variant="tinted"
                title={t.backup.restoreBackup}
                size="medium"
                onPress={() => void handleRestoreBackup()}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>

        {/* Section 6: Privacy Guarantee */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginTop: spacing.lg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="checkmark.shield" size={24} color={colors.success} style={{ marginRight: 12 }} />
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

        {/* Section 7: About ("Über") */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          {t.settings.about}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginBottom: 40 }]}>
          <View style={styles.infoRow}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>{t.settings.version}</Text>
            <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>
              {Constants.expoConfig?.version ?? '1.8.0'}
            </Text>
          </View>
          <View style={[styles.infoRow, { borderTopWidth: hairline, borderTopColor: colors.borderLight, marginTop: 10, paddingTop: 10 }]}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>{t.settings.developer}</Text>
            <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>
              {t.settings.developerName}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ScanFlow PIN: set up / change / confirm */}
      <PinSetupModal
        visible={pinModal.visible}
        modalKey={pinModal.key}
        flow={pinModal.flow}
        onClose={() => endPinFlow(false)}
        onSuccess={() => endPinFlow(true)}
      />
    </SafeAreaView>
  );
}

const CARD_RADIUS = radius.lg;
const CARD_PADDING = 14;
/** Shapes nested in a card at its padding: concentric with the card corner. */
const NESTED_RADIUS = concentric(CARD_RADIUS, CARD_PADDING);
const PILL_HEIGHT = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    ...corner(CARD_RADIUS),
    borderWidth: hairline,
    padding: CARD_PADDING,
  },
  nativeSegment: { minHeight: 44 },
  scannerHint: {
    marginTop: 10,
    paddingHorizontal: 2,
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
    ...corner(NESTED_RADIUS),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  smallPillBtn: {
    height: PILL_HEIGHT,
    ...capsule(PILL_HEIGHT),
    paddingHorizontal: 14,
    justifyContent: 'center',
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
    borderTopWidth: hairline,
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
    ...corner(radius.sm),
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
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: hairline,
    ...corner(radius.sm),
    marginTop: 6,
  },
  previewBox: {
    padding: 10,
    ...corner(radius.sm),
  },
  busyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    ...corner(radius.sm),
  },
});
