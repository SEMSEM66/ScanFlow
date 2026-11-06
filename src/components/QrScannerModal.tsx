import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { capsule, corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { toScannedCode, urlHasUserInfo, type ScannedCode } from '../tools/barcode';
import { formatEuroCents, formatIban } from '../tools/epc';
import { qrScannerService, type QrHistoryEntry } from '../services/QrScannerService';

interface QrScannerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ visible, onClose }) => {
  const { colors, typography, spacing } = useTheme();
  const { t, language, formatString } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanned, setScanned] = useState<ScannedCode | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [history, setHistory] = useState<QrHistoryEntry[]>([]);
  const scanLockRef = useRef(false);

  const loadHistoryState = useCallback(async () => {
    const enabled = await qrScannerService.isHistoryEnabled();
    setHistoryEnabled(enabled);
    if (enabled) {
      setHistory(await qrScannerService.getHistory());
    } else {
      setHistory([]);
    }
  }, []);

  const handleModalShow = useCallback(() => {
    scanLockRef.current = false;
    setScanned(null);
    setCopiedNotice(null);
    void loadHistoryState();
  }, [loadHistoryState]);

  const handleCopy = async (value: string, label?: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedNotice(label ? `${label} – ${t.qr.copied}` : t.qr.copied);
    setTimeout(() => {
      setCopiedNotice(null);
    }, 2200);
  };

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (scanLockRef.current || !result.data) return;
    scanLockRef.current = true;
    const code = toScannedCode(result.data, result.type);
    setScanned(code);
    if (historyEnabled) {
      await qrScannerService.recordScan(code.raw, code.type);
      setHistory(await qrScannerService.getHistory());
    }
  };

  const handleScanAgain = () => {
    setScanned(null);
    setCopiedNotice(null);
    setTimeout(() => {
      scanLockRef.current = false;
    }, 250);
  };

  const handleOpenUrlSafely = (url: string) => {
    Alert.alert(
      t.qr.openUrlConfirmTitle,
      formatString(t.qr.openUrlConfirmMessage, { url }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.qr.openUrlButton,
          onPress: () => {
            void Linking.openURL(url).catch(() => {
              Alert.alert(t.common.error, url);
            });
          },
        },
      ]
    );
  };

  const handleToggleHistory = async (next: boolean) => {
    setHistoryEnabled(next);
    await qrScannerService.setHistoryEnabled(next);
    setHistory(next ? await qrScannerService.getHistory() : []);
  };

  const handleClearHistory = async () => {
    await qrScannerService.clearHistory();
    setHistory([]);
  };

  const renderCopyField = (label: string, value: string | null | undefined, mono = false) => {
    if (!value) return null;
    return (
      <View style={[styles.fieldRow, { borderTopColor: colors.borderLight }]}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={[typography.caption1, { color: colors.textSecondary }]}>{label}</Text>
          <Text
            selectable
            style={[
              typography.bodyBold,
              { color: colors.textPrimary, marginTop: 2 },
              mono && styles.monoText,
            ]}
          >
            {value}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => void handleCopy(value, label)}
          style={[styles.copyChip, { backgroundColor: colors.primarySubdued }]}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${t.qr.copyValue}`}
        >
          <Icon name="doc.on.doc" size={14} color={colors.primary} />
          <Text style={[typography.caption1, { color: colors.primary, fontWeight: '600', marginLeft: 5 }]}>
            {t.qr.copyValue}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={handleModalShow}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={[typography.body, { color: colors.primary }]}>{t.common.close}</Text>
          </TouchableOpacity>
          <Text style={[typography.headline, styles.headerTitle, { color: colors.textPrimary }]}>
            {t.qr.title}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 48 }}>
          {/* Camera Area or Permission State */}
          {!permission?.granted ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[typography.headline, { color: colors.textPrimary }]}>
                {t.scan.cameraPermissionTitle}
              </Text>
              <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 6 }]}>
                {t.scan.cameraPermissionMessage}
              </Text>
              <Button
                title={permission?.canAskAgain === false ? t.scan.openSettings : t.scan.grantPermission}
                onPress={() => {
                  if (permission?.canAskAgain === false) {
                    void Linking.openSettings();
                  } else {
                    void requestPermission();
                  }
                }}
                style={{ marginTop: 14 }}
              />
            </View>
          ) : !scanned ? (
            <View style={[styles.cameraWrap, { borderColor: colors.cardBorder }]}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: [
                    'qr',
                    'ean13',
                    'ean8',
                    'code128',
                    'code39',
                    'code93',
                    'datamatrix',
                    'pdf417',
                    'aztec',
                    'itf14',
                    'codabar',
                    'upc_a',
                    'upc_e',
                  ],
                }}
                onBarcodeScanned={handleBarcodeScanned}
              />
              <View style={styles.cameraOverlay} pointerEvents="none">
                <View style={styles.reticle} />
                <View style={styles.hintPill}>
                  <Text style={[typography.caption1, { color: '#FFFFFF', fontWeight: '600' }]}>
                    {t.qr.instruction}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {copiedNotice ? (
            <View style={[styles.copiedBanner, { backgroundColor: colors.primarySubdued }]}>
              <Icon name="checkmark.circle.fill" size={16} color={colors.primary} />
              <Text style={[typography.caption1, { color: colors.primary, fontWeight: '600', marginLeft: 8 }]}>
                {copiedNotice}
              </Text>
            </View>
          ) : null}

          {/* Scanned Code Result Sheet */}
          {scanned ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.resultHeader}>
                <Text style={[typography.title3, { color: colors.textPrimary, flex: 1 }]}>
                  {t.qr.resultTitle}
                </Text>
                <View style={[styles.typeBadge, { backgroundColor: colors.surfaceSubdued }]}>
                  <Text style={[typography.caption2, { color: colors.textSecondary, fontWeight: '700' }]}>
                    {scanned.type.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* EPC / GiroCode Structured Card */}
              {scanned.content.kind === 'epc' ? (
                <View
                  style={[
                    styles.structuredBox,
                    { backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight },
                  ]}
                >
                  <View style={styles.structuredHeader}>
                    <Icon name="qrcode" size={18} color={colors.primary} />
                    <Text style={[typography.subhead, { color: colors.primary, fontWeight: '700', marginLeft: 8 }]}>
                      {t.qr.epcTitle}
                    </Text>
                  </View>
                  {renderCopyField(t.qr.epcRecipient, scanned.content.payment.name)}
                  {renderCopyField(t.qr.epcIban, formatIban(scanned.content.payment.iban), true)}
                  {renderCopyField(t.qr.epcBic, scanned.content.payment.bic, true)}
                  {renderCopyField(
                    t.qr.epcAmount,
                    scanned.content.payment.amountCents !== null
                      ? formatEuroCents(scanned.content.payment.amountCents, language)
                      : t.qr.epcAmountOpen
                  )}
                  {renderCopyField(t.qr.epcReference, scanned.content.payment.reference, true)}
                  {renderCopyField(t.qr.epcText, scanned.content.payment.text)}
                  {renderCopyField(t.qr.epcInfo, scanned.content.payment.information)}
                </View>
              ) : null}

              {scanned.content.kind === 'epc_invalid' ? (
                <View style={[styles.warningBox, { backgroundColor: colors.surfaceSubdued, borderColor: colors.danger }]}>
                  <Text style={[typography.footnote, { color: colors.danger, fontWeight: '600' }]}>
                    {t.qr.epcInvalid} ({scanned.content.error})
                  </Text>
                </View>
              ) : null}

              {/* Wi-Fi Card */}
              {scanned.content.kind === 'wifi' ? (
                <View
                  style={[
                    styles.structuredBox,
                    { backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight },
                  ]}
                >
                  <Text style={[typography.subhead, { color: colors.primary, fontWeight: '700', marginBottom: 6 }]}>
                    {t.qr.wifiTitle}
                  </Text>
                  {renderCopyField(t.qr.wifiSsid, scanned.content.wifi.ssid)}
                  {renderCopyField(t.qr.wifiPassword, scanned.content.wifi.password, true)}
                  {renderCopyField(t.qr.wifiSecurity, scanned.content.wifi.security)}
                </View>
              ) : null}

              {/* URL Warning & Safe Open Button */}
              {scanned.content.kind === 'url' && urlHasUserInfo(scanned.content.url) ? (
                <View style={[styles.warningBox, { backgroundColor: colors.surfaceSubdued, borderColor: colors.danger }]}>
                  <Text style={[typography.caption1, { color: colors.danger }]}>
                    {t.qr.urlWarningUserInfo}
                  </Text>
                </View>
              ) : null}

              {/* Raw Value */}
              {renderCopyField(t.qr.rawValue, scanned.raw, true)}

              {scanned.content.kind === 'url' ? (
                <Button
                  variant="tinted"
                  icon="safari"
                  title={t.qr.openUrlButton}
                  onPress={() =>
                    scanned.content.kind === 'url' && handleOpenUrlSafely(scanned.content.url)
                  }
                  style={{ marginTop: 14 }}
                />
              ) : null}

              <Button
                icon="qrcode.viewfinder"
                title={t.qr.scanAgain}
                onPress={handleScanAgain}
                style={{ marginTop: 10 }}
              />
            </View>
          ) : null}

          {/* Optional Local History (OFF by default) */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.cardBorder,
                marginTop: spacing.base,
              },
            ]}
          >
            <View style={styles.historyToggleRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  {t.qr.historyToggle}
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {t.qr.historySubtitle}
                </Text>
              </View>
              <Switch
                value={historyEnabled}
                onValueChange={(v) => void handleToggleHistory(v)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            {historyEnabled ? (
              <View style={{ marginTop: 12 }}>
                <View style={styles.historyHeader}>
                  <Text style={[typography.caption1, { color: colors.textSecondary, fontWeight: '600' }]}>
                    {t.qr.historyTitle}
                  </Text>
                  {history.length > 0 ? (
                    <TouchableOpacity onPress={() => void handleClearHistory()}>
                      <Text style={[typography.caption1, { color: colors.danger, fontWeight: '600' }]}>
                        {t.qr.clearHistory}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {history.length === 0 ? (
                  <Text style={[typography.caption1, { color: colors.textMuted, marginTop: 6 }]}>
                    {t.qr.historyEmpty}
                  </Text>
                ) : (
                  history.map((entry) => (
                    <TouchableOpacity
                      key={entry.id}
                      activeOpacity={0.75}
                      onPress={() => {
                        scanLockRef.current = true;
                        setScanned(entry.code);
                      }}
                      style={[styles.historyItem, { borderTopColor: colors.borderLight }]}
                    >
                      <Text numberOfLines={1} style={[typography.footnote, { color: colors.textPrimary, flex: 1 }]}>
                        {entry.raw}
                      </Text>
                      <Text style={[typography.caption2, { color: colors.textMuted, marginLeft: 8 }]}>
                        {entry.type.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: hairline,
  },
  headerBtn: {
    width: 84,
    minHeight: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  card: {
    ...corner(radius.lg),
    borderWidth: hairline,
    padding: 14,
  },
  cameraWrap: {
    height: 300,
    ...corner(radius.lg),
    overflow: 'hidden',
    borderWidth: hairline,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 22,
  },
  reticle: {
    width: 190,
    height: 190,
    borderWidth: 2,
    borderColor: '#00D2FF',
    ...corner(radius.md),
    marginTop: 12,
  },
  hintPill: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...capsule(32),
  },
  copiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    ...corner(radius.sm),
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    ...corner(radius.xs),
  },
  structuredBox: {
    padding: 12,
    marginVertical: 8,
    borderWidth: hairline,
    ...corner(radius.md),
  },
  structuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  warningBox: {
    padding: 10,
    marginVertical: 8,
    borderWidth: 1,
    ...corner(radius.sm),
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: hairline,
  },
  monoText: {
    fontVariant: ['tabular-nums'],
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...capsule(28),
  },
  historyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderTopWidth: hairline,
  },
});
