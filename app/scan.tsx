import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Alert,
  Linking,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme';
import { useTranslation } from '../src/i18n';
import { saveScan } from '../src/services';
import { scanDocumentTitle } from '../src/components/ScannerProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type FlashMode = 'off' | 'on' | 'auto';

/**
 * ScanFlow's own camera (setting "ScanFlow-Kamera", or fallback when the iOS
 * document scanner is unavailable): manual capture, multi-page batch and
 * photo import. Document edges are detected after capture (pipeline) and can
 * be corrected in the crop screen.
 */

export default function ScanScreen() {
  const router = useRouter();
  // documentId: append pages to an existing document; replacePageId: retake one page
  const { documentId, replacePageId } = useLocalSearchParams<{ documentId?: string; replacePageId?: string }>();
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t, formatString, language } = useTranslation();
  const [progressText, setProgressText] = useState<string | null>(null);

  // Camera & Media Library Permissions
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();

  const cameraRef = useRef<CameraView | null>(null);

  // Scan state
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPages, setCapturedPages] = useState<string[]>([]);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Shutter flash effect
  const [isFlashing, setIsFlashing] = useState(false);

  /**
   * Runs every captured image through the pipeline (EXIF bake, proxy, edge
   * detection, default filter "Auto") and stores the pages.
   */
  const finishWith = async (uris: string[]) => {
    if (uris.length === 0 || isSaving) return;
    try {
      setIsSaving(true);
      setProgressText(formatString(t.scan.processing, { current: 1, total: uris.length }));
      const saved = await saveScan({
        uris,
        detect: true,
        documentId,
        replacePageId,
        title: scanDocumentTitle(t.scan.documentTitle, language, formatString),
        onProgress: (current, total) => setProgressText(formatString(t.scan.processing, { current, total })),
      });
      if (saved.created) {
        router.replace({ pathname: '/document/[id]', params: { id: saved.documentId } });
      } else {
        router.back();
      }
    } catch (err) {
      console.error('[ScanScreen] Error saving scanned document:', err);
      Alert.alert(t.common.error, t.scan.saveFailed);
      setIsSaving(false);
    } finally {
      setProgressText(null);
    }
  };

  const handleFinishScan = () => finishWith(capturedPages);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 120);

      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        exif: false,
      });

      if (picture && picture.uri) {
        if (replacePageId) {
          // Retake: one photo replaces the page right away
          await finishWith([picture.uri]);
          return;
        }
        setCapturedPages((prev) => [...prev, picture.uri]);
      }
    } catch (err) {
      console.error('[ScanScreen] Error taking photo:', err);
      Alert.alert(t.common.error, t.scan.captureFailed);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleGalleryImport = async () => {
    try {
      if (!mediaPermission?.granted) {
        const result = await requestMediaPermission();
        if (!result.granted) {
          Alert.alert(
            t.scan.photoPermissionTitle,
            t.scan.photoPermissionMessage,
            [
              { text: t.common.cancel, style: 'cancel' },
              { text: t.scan.openSettings, onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: !replacePageId,
        quality: 1,
        exif: false,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const uris = pickerResult.assets.map((asset) => asset.uri);
        if (replacePageId) {
          await finishWith(uris.slice(0, 1));
          return;
        }
        setCapturedPages((prev) => [...prev, ...uris]);
      }
    } catch (err) {
      console.error('[ScanScreen] Gallery import error:', err);
      Alert.alert(t.common.error, t.scan.importFailed);
    }
  };

  const toggleFlash = () => {
    if (flash === 'off') setFlash('on');
    else if (flash === 'on') setFlash('auto');
    else setFlash('off');
  };

  const removePageFromReview = (indexToRemove: number) => {
    setCapturedPages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    if (capturedPages.length <= 1) {
      setIsReviewOpen(false);
    }
  };

  // Permission UI: undetermined or not granted
  if (!cameraPermission) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Denied UI
  if (!cameraPermission.granted) {
    return (
      <SafeAreaView style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <View style={styles.permissionCard}>
          <View style={[styles.permissionIconCircle, { backgroundColor: colors.surfaceSubdued }]}>
            <Ionicons name="camera-outline" size={54} color={colors.primary} />
          </View>
          <Text style={[typography.title2, styles.permissionTitle, { color: colors.textPrimary }]}>
            {t.scan.cameraPermissionTitle}
          </Text>
          <Text style={[typography.body, styles.permissionMessage, { color: colors.textSecondary }]}>
            {t.scan.cameraPermissionMessage}
          </Text>

          {cameraPermission.canAskAgain ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={requestCameraPermission}
              style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: borderRadius.round }]}
            >
              <Text style={[typography.bodyBold, { color: '#FFFFFF' }]}>
                {t.scan.grantPermission}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Linking.openSettings()}
              style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: borderRadius.round }]}
            >
              <Text style={[typography.bodyBold, { color: '#FFFFFF' }]}>
                {t.scan.openSettings}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.secondaryButton, { marginTop: spacing.md }]}
          >
            <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
              {t.common.cancel}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Fullscreen Camera View */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
      />

      {/* Screen Shutter Flash Animation */}
      {isFlashing && <View style={styles.shutterFlash} />}

      {/* Top Floating Controls */}
      <SafeAreaView edges={['top']} style={styles.topControls}>
        <View style={styles.topBarRow}>
          {/* Close button */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.back()}
            style={styles.iconCircleButton}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Flash & More buttons */}
          <View style={styles.topRightActions}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={toggleFlash}
              style={[styles.iconCircleButton, flash !== 'off' && styles.iconCircleButtonActive]}
            >
              <Ionicons
                name={
                  flash === 'on'
                    ? 'flash'
                    : flash === 'auto'
                    ? 'flash-outline'
                    : 'flash-off-outline'
                }
                size={22}
                color={flash !== 'off' ? '#FFD60A' : '#FFFFFF'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleGalleryImport}
              style={[styles.iconCircleButton, { marginLeft: 10 }]}
            >
              <Ionicons name="images-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Alignment Hint Pill matching Scannen.png */}
        <View style={styles.hintContainer}>
          <View style={styles.hintPill}>
            <Text style={styles.hintText}>{t.scan.alignDocument}</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Cyan Framing Corner Guides matching Scannen.png */}
      <View style={styles.frameContainer} pointerEvents="none">
        <View style={styles.frameBox}>
          {/* Top-Left Corner */}
          <View style={[styles.cornerGuide, styles.cornerTL]} />
          {/* Top-Right Corner */}
          <View style={[styles.cornerGuide, styles.cornerTR]} />
          {/* Bottom-Left Corner */}
          <View style={[styles.cornerGuide, styles.cornerBL]} />
          {/* Bottom-Right Corner */}
          <View style={[styles.cornerGuide, styles.cornerBR]} />
        </View>
      </View>

      {/* Bottom Controls Sheet matching Scannen.png */}
      <View style={styles.bottomSheet}>
        {/* Bottom Actions Row: Thumbnail stack / Shutter / Fertig button */}
        <SafeAreaView edges={['bottom']} style={styles.shutterRow}>
          {/* Left: Thumbnail preview stack with page count badge */}
          <View style={styles.sideControlSlot}>
            {capturedPages.length > 0 ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsReviewOpen(true)}
                style={styles.thumbnailStackContainer}
              >
                <View style={styles.stackedCardBack} />
                <View style={styles.stackedCardMiddle} />
                <Image
                  source={{ uri: capturedPages[capturedPages.length - 1] }}
                  style={styles.stackedThumbnail}
                />
                <View style={[styles.pageBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.pageBadgeText}>{capturedPages.length}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleGalleryImport}
                style={styles.galleryButton}
              >
                <Ionicons name="images" size={26} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Center: Large Shutter Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleCapture}
            disabled={isCapturing}
            style={styles.shutterOuterRing}
          >
            <View style={styles.shutterInnerCircle} />
          </TouchableOpacity>

          {/* Right: "Fertig" (Done) button */}
          <View style={styles.sideControlSlot}>
            {capturedPages.length > 0 ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleFinishScan}
                disabled={isSaving}
                style={[styles.doneButton, { backgroundColor: colors.primary }]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.doneButtonText}>{t.common.done}</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80 }} />
            )}
          </View>
        </SafeAreaView>
      </View>

      {/* Processing overlay (pipeline import) */}
      {isSaving ? (
        <View style={styles.processingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#FFFFFF" />
          {progressText ? <Text style={styles.processingText}>{progressText}</Text> : null}
        </View>
      ) : null}

      {/* Captured Pages Review Modal */}
      <Modal
        visible={isReviewOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsReviewOpen(false)}
      >
        <SafeAreaView style={styles.reviewModalContainer}>
          <View style={styles.reviewHeader}>
            <Text style={[typography.headline, { color: '#FFFFFF' }]}>
              {capturedPages.length} {t.common.pages}
            </Text>
            <TouchableOpacity
              onPress={() => setIsReviewOpen(false)}
              style={styles.reviewCloseButton}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.reviewScroll}
          >
            {capturedPages.map((uri, idx) => (
              <View key={uri + idx} style={styles.reviewPageWrapper}>
                <Image source={{ uri }} style={styles.reviewImage} resizeMode="contain" />
                <TouchableOpacity
                  onPress={() => removePageFromReview(idx)}
                  style={styles.deletePageButton}
                >
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.deletePageText}>{t.common.delete}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.reviewBottomActions}>
            <TouchableOpacity
              onPress={() => setIsReviewOpen(false)}
              style={[styles.continueScanButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t.scan.continueScanning}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setIsReviewOpen(false);
                handleFinishScan();
              }}
              style={[styles.continueScanButton, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t.common.done}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  shutterFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 99,
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  iconCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hintContainer: {
    alignItems: 'center',
    marginTop: 18,
  },
  hintPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  frameContainer: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.16,
    left: 28,
    right: 28,
    bottom: SCREEN_HEIGHT * 0.26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameBox: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cornerGuide: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderColor: '#00D2FF', // Cyan guide matching Scannen.png
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingBottom: 8,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingBottom: 16,
  },
  sideControlSlot: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailStackContainer: {
    width: 52,
    height: 66,
    position: 'relative',
  },
  stackedCardBack: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 48,
    height: 62,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  stackedCardMiddle: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 50,
    height: 64,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  stackedThumbnail: {
    width: 52,
    height: 66,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  pageBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  pageBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#26262A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInnerCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  doneButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionCard: {
    alignItems: 'center',
    maxWidth: 320,
  },
  permissionIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionMessage: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  reviewCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewScroll: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  reviewPageWrapper: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewImage: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_HEIGHT * 0.65,
    borderRadius: 12,
  },
  deletePageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    gap: 6,
  },
  deletePageText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  reviewBottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  continueScanButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
