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
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, corner, capsule, corners, radius } from '../src/theme';
import { useTranslation } from '../src/i18n';
import { saveScan, ocrService } from '../src/services';
import { scanDocumentTitle } from '../src/components/ScannerProvider';
import { Button } from '../src/components/ui';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type FlashMode = 'off' | 'on' | 'auto';

// Control sizes (pt) – round shapes are capsules of their real height
const HINT_HEIGHT = 34;
const SIDE_SLOT = 88;
const BADGE = 22;
const GALLERY_BUTTON = 50;
const SHUTTER_RING = 78;
const SHUTTER_CORE = 64;
const DONE_HEIGHT = 44;
const PERMISSION_ICON = 100;
const REVIEW_CLOSE = 36;
const DELETE_HEIGHT = 34;

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
  const { colors, typography, spacing } = useTheme();
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
      ocrService.kick(); // recognize the text of the new pages in the background
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

  const navigationControls = (
    <>
      <StatusBar style="light" />
      <Stack.Screen options={{ gestureEnabled: !isSaving && !isCapturing }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button disabled={isSaving || isCapturing} onPress={() => router.back()}>{t.common.cancel}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      {cameraPermission?.granted && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={flash === 'off' ? 'bolt.slash' : 'bolt'} accessibilityLabel={flash === 'off' ? t.scan.flashOff : flash === 'on' ? t.scan.flashOn : t.scan.flashAuto} disabled={isSaving || isCapturing} onPress={toggleFlash} />
          <Stack.Toolbar.Button icon="photo.on.rectangle" accessibilityLabel={t.scan.importFromGallery} disabled={isSaving || isCapturing} onPress={handleGalleryImport} />
        </Stack.Toolbar>
      )}
    </>
  );

  // Permission UI: undetermined or not granted
  if (!cameraPermission) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        {navigationControls}
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Denied UI
  if (!cameraPermission.granted) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        {navigationControls}
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
            <Button title={t.scan.grantPermission} onPress={requestCameraPermission} style={styles.primaryButton} />
          ) : (
            <Button title={t.scan.openSettings} onPress={() => Linking.openSettings()} style={styles.primaryButton} />
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
      {navigationControls}
      {/* Fullscreen Camera View */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
      />

      {/* Screen Shutter Flash Animation */}
      {isFlashing && <View style={styles.shutterFlash} />}

      <View style={styles.topControls}>
        <View style={styles.hintContainer}>
          <View style={styles.hintPill}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.hintText}>
              {t.scan.alignDocument}
            </Text>
          </View>
        </View>
      </View>

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
                  <Text maxFontSizeMultiplier={1} style={styles.pageBadgeText}>
                    {capturedPages.length}
                  </Text>
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
                  <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.doneButtonText}>
                    {t.common.done}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ width: SIDE_SLOT }} />
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
        presentationStyle="pageSheet"
        allowSwipeDismissal
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
                  <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.deletePageText}>
                    {t.common.delete}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.reviewBottomActions}>
            <Button
              variant="gray"
              fill="rgba(255,255,255,0.2)"
              tint="#FFFFFF"
              title={t.scan.continueScanning}
              onPress={() => setIsReviewOpen(false)}
              style={styles.reviewAction}
            />
            <Button
              title={t.common.done}
              onPress={() => {
                setIsReviewOpen(false);
                handleFinishScan();
              }}
              style={styles.reviewAction}
            />
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
  hintContainer: {
    alignItems: 'center',
    marginTop: 18,
  },
  hintPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 16,
    height: HINT_HEIGHT,
    justifyContent: 'center',
    ...capsule(HINT_HEIGHT),
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  frameContainer: {
    position: 'absolute',
    top: '16%',
    left: 28,
    right: 28,
    bottom: '26%',
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
    ...corners({ topLeft: radius.sm }),
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    ...corners({ topRight: radius.sm }),
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    ...corners({ bottomLeft: radius.sm }),
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    ...corners({ bottomRight: radius.sm }),
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    ...corners({ topLeft: radius.xl, topRight: radius.xl }),
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
    width: SIDE_SLOT,
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
    ...corner(radius.xs),
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  stackedCardMiddle: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 50,
    height: 64,
    ...corner(radius.xs),
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  stackedThumbnail: {
    width: 52,
    height: 66,
    ...corner(radius.xs),
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  pageBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: BADGE,
    height: BADGE,
    ...capsule(BADGE),
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
    width: GALLERY_BUTTON,
    height: GALLERY_BUTTON,
    ...capsule(GALLERY_BUTTON),
    backgroundColor: '#26262A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterRing: {
    width: SHUTTER_RING,
    height: SHUTTER_RING,
    ...capsule(SHUTTER_RING),
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInnerCircle: {
    width: SHUTTER_CORE,
    height: SHUTTER_CORE,
    ...capsule(SHUTTER_CORE),
    backgroundColor: '#FFFFFF',
  },
  doneButton: {
    paddingHorizontal: 18,
    height: DONE_HEIGHT,
    ...capsule(DONE_HEIGHT),
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
    width: PERMISSION_ICON,
    height: PERMISSION_ICON,
    ...capsule(PERMISSION_ICON),
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
    alignSelf: 'stretch',
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  reviewCloseButton: {
    width: REVIEW_CLOSE,
    height: REVIEW_CLOSE,
    ...capsule(REVIEW_CLOSE),
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
    ...corner(radius.md),
  },
  deletePageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    paddingHorizontal: 16,
    height: DELETE_HEIGHT,
    ...capsule(DELETE_HEIGHT),
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
  reviewAction: {
    flex: 1,
  },
});
