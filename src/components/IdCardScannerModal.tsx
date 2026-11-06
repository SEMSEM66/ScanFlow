import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { capsule, concentric, corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { formatIdCardWatermark, ID1_ASPECT } from '../imaging/idCard';
import type { PageAnnotation, Quad } from '../types';
import {
  documentRepository,
  documentScanner,
  imagePipeline,
  ocrService,
  saveScan,
  storageService,
} from '../services';

interface CapturedSide {
  originalUri: string;
  proxyUri: string;
  corners: Quad | null;
}

interface IdCardScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (documentId: string) => void;
}

export const IdCardScannerModal: React.FC<IdCardScannerModalProps> = ({
  visible,
  onClose,
  onCreated,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t, language, formatString } = useTranslation();

  const [front, setFront] = useState<CapturedSide | null>(null);
  const [back, setBack] = useState<CapturedSide | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);

  const dateStr = new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const watermarkText = formatIdCardWatermark(purpose, dateStr, language);

  const importSideUri = async (uri: string, detect: boolean): Promise<CapturedSide> => {
    const imported = await imagePipeline.importImage(uri, { detect });
    return {
      originalUri: imported.originalUri,
      proxyUri: imported.proxyUri,
      corners: imported.detection?.corners ?? null,
    };
  };

  const handleCaptureCamera = async (targetSide: 'front' | 'back') => {
    if (busy) return;
    setBusy(true);
    try {
      const access = await documentScanner.ensureCameraAccess();
      if (access !== 'granted') {
        Alert.alert(
          t.scan.cameraPermissionTitle,
          t.scan.cameraPermissionMessage,
          access === 'blocked'
            ? [
                { text: t.common.cancel, style: 'cancel' },
                { text: t.scan.openSettings, onPress: () => void Linking.openSettings() },
              ]
            : [{ text: t.common.ok }]
        );
        return;
      }

      if (documentScanner.isSystemScannerAvailable()) {
        const scannedPages = await documentScanner.scan();
        if (!scannedPages || scannedPages.length === 0) return;
        const firstSide = await importSideUri(scannedPages[0], false);
        await storageService.deleteTempFile(scannedPages[0]);
        if (targetSide === 'front') {
          setFront(firstSide);
          if (scannedPages.length >= 2 && !back) {
            const secondSide = await importSideUri(scannedPages[1], false);
            await storageService.deleteTempFile(scannedPages[1]);
            setBack(secondSide);
          }
        } else {
          setBack(firstSide);
        }
        return;
      }

      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.95,
      });
      if (shot.canceled || !shot.assets?.[0]?.uri) return;
      const side = await importSideUri(shot.assets[0].uri, true);
      if (targetSide === 'front') setFront(side);
      else setBack(side);
    } catch (err) {
      console.error('[IdCardScannerModal] capture failed:', err);
      Alert.alert(t.common.error, t.scan.captureFailed);
    } finally {
      setBusy(false);
    }
  };

  const handlePickPhoto = async (targetSide: 'front' | 'back') => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t.scan.photoPermissionTitle, t.scan.photoPermissionMessage);
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.95,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const side = await importSideUri(picked.assets[0].uri, true);
      if (targetSide === 'front') setFront(side);
      else setBack(side);
    } catch (err) {
      console.error('[IdCardScannerModal] photo pick failed:', err);
      Alert.alert(t.common.error, t.scan.importFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateIdCardDocument = async () => {
    if (!front || !back || busy) {
      Alert.alert(t.idCard.title, t.idCard.needBothSides);
      return;
    }
    setBusy(true);
    let composedTempUri: string | null = null;
    try {
      composedTempUri = await imagePipeline.composeIdCardSheet(
        front.originalUri,
        front.corners,
        back.originalUri,
        back.corners,
        300
      );

      const docTitle = formatString(t.idCard.defaultDocTitle, { date: dateStr });
      const saved = await saveScan({
        uris: [composedTempUri],
        detect: false,
        defaultFilter: 'original',
        title: docTitle,
      });

      if (saved.pageIds.length > 0) {
        const pageId = saved.pageIds[0];
        const annotations: PageAnnotation[] = watermarkEnabled
          ? [
              {
                id: 'wm_idcard',
                type: 'text',
                x: 0.14,
                y: 0.46,
                width: 0.72,
                height: 0.08,
                rotation: -28,
                color: '#C81E2B',
                opacity: 0.32,
                text: watermarkText,
              },
            ]
          : [];
        await documentRepository.updatePage(pageId, {
          pageFormat: 'a4',
          annotations,
        });
      }

      ocrService.kick(400);
      setFront(null);
      setBack(null);
      setPurpose('');
      onCreated(saved.documentId);
    } catch (err) {
      console.error('[IdCardScannerModal] create failed:', err);
      Alert.alert(t.common.error, t.scan.saveFailed);
    } finally {
      if (composedTempUri) {
        await storageService.deleteTempFile(composedTempUri);
      }
      setBusy(false);
    }
  };

  const renderSideCard = (label: string, side: CapturedSide | null, target: 'front' | 'back') => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: side ? colors.primary : colors.cardBorder,
          marginBottom: spacing.base,
        },
      ]}
    >
      <View style={styles.sideHeader}>
        <Text style={[typography.headline, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: side ? colors.primarySubdued : colors.surfaceSubdued },
          ]}
        >
          <Icon
            name={side ? 'checkmark.circle.fill' : 'creditcard'}
            size={13}
            color={side ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              typography.caption2,
              {
                color: side ? colors.primary : colors.textMuted,
                fontWeight: '600',
                marginLeft: 5,
              },
            ]}
          >
            {side ? t.idCard.readyBadge : t.idCard.missingBadge}
          </Text>
        </View>
      </View>

      {side ? (
        <View style={[styles.previewWrap, { borderColor: colors.borderLight }]}>
          <Image source={{ uri: side.proxyUri }} style={styles.previewImage} resizeMode="cover" />
        </View>
      ) : null}

      <View style={styles.sideActions}>
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={busy}
          onPress={() => void handleCaptureCamera(target)}
          style={[styles.sideBtn, { backgroundColor: colors.primary }]}
        >
          <Icon name="camera" size={16} color="#FFFFFF" />
          <Text style={[typography.footnote, { color: '#FFFFFF', fontWeight: '600', marginLeft: 6 }]}>
            {side ? t.idCard.replaceSide : t.idCard.captureCamera}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={busy}
          onPress={() => void handlePickPhoto(target)}
          style={[
            styles.sideBtn,
            { backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight, borderWidth: hairline },
          ]}
        >
          <Icon name="photo.on.rectangle" size={16} color={colors.textPrimary} />
          <Text style={[typography.footnote, { color: colors.textPrimary, fontWeight: '600', marginLeft: 6 }]}>
            {t.idCard.pickPhoto}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity disabled={busy} onPress={onClose} style={styles.headerBtn}>
            <Text style={[typography.body, { color: colors.primary }]}>{t.common.cancel}</Text>
          </TouchableOpacity>
          <Text style={[typography.headline, styles.headerTitle, { color: colors.textPrimary }]}>
            {t.idCard.title}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 48 }}>
          <Text style={[typography.footnote, { color: colors.textSecondary, marginBottom: spacing.base }]}>
            {t.idCard.subtitle}
          </Text>

          {renderSideCard(t.idCard.frontSide, front, 'front')}
          {renderSideCard(t.idCard.backSide, back, 'back')}

          {/* Optional Purpose Watermark */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.watermarkRow}>
              <Text style={[typography.bodyBold, { color: colors.textPrimary, flex: 1 }]}>
                {t.idCard.watermarkToggle}
              </Text>
              <Switch
                value={watermarkEnabled}
                onValueChange={setWatermarkEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            {watermarkEnabled ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginBottom: 6 }]}>
                  {t.idCard.watermarkPurposeLabel}
                </Text>
                <TextInput
                  value={purpose}
                  onChangeText={setPurpose}
                  placeholder={t.idCard.watermarkPurposePlaceholder}
                  placeholderTextColor={colors.textMuted}
                  style={[
                    typography.body,
                    styles.input,
                    {
                      color: colors.textPrimary,
                      backgroundColor: colors.surfaceSubdued,
                      borderColor: colors.borderLight,
                    },
                  ]}
                />
                <Text style={[typography.caption2, { color: colors.textSecondary, marginTop: 8 }]}>
                  {formatString(t.idCard.watermarkPreview, { text: watermarkText })}
                </Text>
              </View>
            ) : null}
          </View>

          <Button
            icon="doc.badge.plus"
            title={busy ? t.idCard.creating : t.idCard.createDocumentButton}
            disabled={!front || !back || busy}
            onPress={() => void handleCreateIdCardDocument()}
            style={{ marginTop: spacing.lg }}
          />
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

const CARD_RADIUS = radius.lg;
const CARD_PADDING = 14;
const INNER_RADIUS = concentric(CARD_RADIUS, CARD_PADDING);

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
    ...corner(CARD_RADIUS),
    borderWidth: hairline,
    padding: CARD_PADDING,
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    ...capsule(24),
  },
  previewWrap: {
    width: '100%',
    aspectRatio: ID1_ASPECT,
    ...corner(INNER_RADIUS),
    overflow: 'hidden',
    borderWidth: hairline,
    marginBottom: 10,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  sideActions: {
    flexDirection: 'row',
    gap: 10,
  },
  sideBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    ...corner(INNER_RADIUS),
  },
  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: hairline,
    ...corner(radius.sm),
  },
});
