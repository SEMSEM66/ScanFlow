import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  PanResponder,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme } from '../src/theme';
import { useTranslation } from '../src/i18n';
import { documentRepository, storageService } from '../src/services';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HANDLE_SIZE = 34;

interface Point {
  x: number;
  y: number;
}

export default function CropScreen() {
  const router = useRouter();
  const { pageId, imageUri, documentId } = useLocalSearchParams<{
    pageId: string;
    imageUri: string;
    documentId: string;
  }>();

  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Original image dimensions
  const [originalDimensions, setOriginalDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Display dimensions of the image on screen
  const [displayLayout, setDisplayLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // 4 Corner Handles relative to displayLayout (TL, TR, BR, BL)
  const [tl, setTl] = useState<Point>({ x: 0, y: 0 });
  const [tr, setTr] = useState<Point>({ x: 0, y: 0 });
  const [br, setBr] = useState<Point>({ x: 0, y: 0 });
  const [bl, setBl] = useState<Point>({ x: 0, y: 0 });

  // Currently dragged corner for magnifying loupe
  const [activeCorner, setActiveCorner] = useState<'TL' | 'TR' | 'BR' | 'BL' | null>(null);

  // Load image dimensions
  useEffect(() => {
    if (!imageUri) return;

    Image.getSize(
      imageUri,
      (width, height) => {
        setOriginalDimensions({ width, height });

        // Calculate fitted display size (A4-friendly container)
        const containerWidth = SCREEN_WIDTH - 40;
        const containerHeight = SCREEN_HEIGHT * 0.65;

        const imgAspect = width / height;
        const containerAspect = containerWidth / containerHeight;

        let dispW: number;
        let dispH: number;

        if (imgAspect > containerAspect) {
          dispW = containerWidth;
          dispH = containerWidth / imgAspect;
        } else {
          dispH = containerHeight;
          dispW = containerHeight * imgAspect;
        }

        const dispX = (SCREEN_WIDTH - dispW) / 2;
        const dispY = (containerHeight - dispH) / 2 + 10;

        setDisplayLayout({ x: dispX, y: dispY, width: dispW, height: dispH });

        // Initialize 4 corners with slight 6% inset margin
        const insetX = dispW * 0.06;
        const insetY = dispH * 0.06;

        setTl({ x: insetX, y: insetY });
        setTr({ x: dispW - insetX, y: insetY });
        setBr({ x: dispW - insetX, y: dispH - insetY });
        setBl({ x: insetX, y: dispH - insetY });

        setLoading(false);
      },
      (err) => {
        console.error('[CropScreen] Error getting image size:', err);
        Alert.alert(t.common.error, 'Bild konnte nicht geladen werden.');
        setLoading(false);
      }
    );
  }, [imageUri]);

  // PanResponder generators for each handle
  const createPanResponder = (corner: 'TL' | 'TR' | 'BR' | 'BL') => {
    let startPoint: Point = { x: 0, y: 0 };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setActiveCorner(corner);
        if (corner === 'TL') startPoint = { ...tl };
        else if (corner === 'TR') startPoint = { ...tr };
        else if (corner === 'BR') startPoint = { ...br };
        else if (corner === 'BL') startPoint = { ...bl };
      },
      onPanResponderMove: (_, gestureState) => {
        const { dx, dy } = gestureState;
        const newX = Math.max(0, Math.min(displayLayout.width, startPoint.x + dx));
        const newY = Math.max(0, Math.min(displayLayout.height, startPoint.y + dy));

        if (corner === 'TL') {
          setTl({ x: Math.min(newX, tr.x - 30), y: Math.min(newY, bl.y - 30) });
        } else if (corner === 'TR') {
          setTr({ x: Math.max(newX, tl.x + 30), y: Math.min(newY, br.y - 30) });
        } else if (corner === 'BR') {
          setBr({ x: Math.max(newX, bl.x + 30), y: Math.max(newY, tr.y + 30) });
        } else if (corner === 'BL') {
          setBl({ x: Math.min(newX, br.x - 30), y: Math.max(newY, tl.y + 30) });
        }
      },
      onPanResponderRelease: () => {
        setActiveCorner(null);
      },
      onPanResponderTerminate: () => {
        setActiveCorner(null);
      },
    });
  };

  const panTL = useRef(createPanResponder('TL')).current;
  const panTR = useRef(createPanResponder('TR')).current;
  const panBR = useRef(createPanResponder('BR')).current;
  const panBL = useRef(createPanResponder('BL')).current;

  // Reset corners to default margin
  const handleReset = () => {
    if (displayLayout.width === 0) return;
    const insetX = displayLayout.width * 0.05;
    const insetY = displayLayout.height * 0.05;
    setTl({ x: insetX, y: insetY });
    setTr({ x: displayLayout.width - insetX, y: insetY });
    setBr({ x: displayLayout.width - insetX, y: displayLayout.height - insetY });
    setBl({ x: insetX, y: displayLayout.height - insetY });
  };

  // Apply crop using expo-image-manipulator
  const handleApplyCrop = async () => {
    if (!imageUri || processing || displayLayout.width === 0) return;

    try {
      setProcessing(true);

      // Compute bounding box from corner handles
      const minX = Math.min(tl.x, bl.x);
      const maxX = Math.max(tr.x, br.x);
      const minY = Math.min(tl.y, tr.y);
      const maxY = Math.max(bl.y, br.y);

      // Scale factors from screen display coordinates to actual image pixel coordinates
      const scaleX = originalDimensions.width / displayLayout.width;
      const scaleY = originalDimensions.height / displayLayout.height;

      const originX = Math.max(0, Math.floor(minX * scaleX));
      const originY = Math.max(0, Math.floor(minY * scaleY));
      const width = Math.min(originalDimensions.width - originX, Math.floor((maxX - minX) * scaleX));
      const height = Math.min(originalDimensions.height - originY, Math.floor((maxY - minY) * scaleY));

      if (width <= 10 || height <= 10) {
        Alert.alert(t.common.error, 'Der ausgewählte Bereich ist zu klein.');
        setProcessing(false);
        return;
      }

      // Execute bounding box crop via Expo Go verified ImageManipulator
      const cropResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX, originY, width, height } }],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Save new cropped asset locally
      const savedCroppedUri = await storageService.saveImage(cropResult.uri, 'cropped');

      // Update database page record if pageId was provided
      if (pageId) {
        await documentRepository.updatePage(pageId, {
          previewUri: savedCroppedUri,
        });
      }

      router.back();
    } catch (err) {
      console.error('[CropScreen] Error executing crop:', err);
      Alert.alert(t.common.error, 'Zuschneiden fehlgeschlagen.');
    } finally {
      setProcessing(false);
    }
  };

  // Active point for the magnifying loupe
  const getActivePoint = (): Point | null => {
    if (activeCorner === 'TL') return tl;
    if (activeCorner === 'TR') return tr;
    if (activeCorner === 'BR') return br;
    if (activeCorner === 'BL') return bl;
    return null;
  };

  const activePoint = getActivePoint();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#101114' }]} edges={['top', 'bottom']}>
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.barButton}>
          <Text style={[typography.body, { color: '#FFFFFF' }]}>{t.common.cancel}</Text>
        </TouchableOpacity>

        <Text style={[typography.headline, { color: '#FFFFFF' }]}>{t.crop.title}</Text>

        <TouchableOpacity onPress={handleApplyCrop} disabled={processing} style={styles.barButton}>
          {processing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[typography.bodyBold, { color: colors.primary }]}>{t.crop.apply}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Verified Expo Go Notice & Instruction */}
      <View style={styles.noticeContainer}>
        <View style={styles.noticePill}>
          <Ionicons name="crop" size={14} color="#00D2FF" style={{ marginRight: 6 }} />
          <Text style={styles.noticeText}>{t.crop.instruction}</Text>
        </View>
      </View>

      {/* Main Viewport */}
      <View style={styles.viewport}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <View
            style={[
              styles.imageContainer,
              {
                width: displayLayout.width,
                height: displayLayout.height,
              },
            ]}
          >
            {/* Base Image */}
            <Image
              source={{ uri: imageUri }}
              style={{
                width: displayLayout.width,
                height: displayLayout.height,
                borderRadius: 4,
              }}
              resizeMode="cover"
            />

            {/* Bounding Box Border Frame */}
            <View
              pointerEvents="none"
              style={[
                styles.cropBoundingBox,
                {
                  left: Math.min(tl.x, bl.x),
                  top: Math.min(tl.y, tr.y),
                  width: Math.max(tr.x, br.x) - Math.min(tl.x, bl.x),
                  height: Math.max(bl.y, br.y) - Math.min(tl.y, tr.y),
                },
              ]}
            />

            {/* 4 Draggable Corner Handles */}
            {/* Top-Left */}
            <View
              {...panTL.panHandlers}
              style={[
                styles.handle,
                {
                  transform: [
                    { translateX: tl.x - HANDLE_SIZE / 2 },
                    { translateY: tl.y - HANDLE_SIZE / 2 },
                  ],
                },
              ]}
            >
              <View style={styles.handleInner} />
            </View>

            {/* Top-Right */}
            <View
              {...panTR.panHandlers}
              style={[
                styles.handle,
                {
                  transform: [
                    { translateX: tr.x - HANDLE_SIZE / 2 },
                    { translateY: tr.y - HANDLE_SIZE / 2 },
                  ],
                },
              ]}
            >
              <View style={styles.handleInner} />
            </View>

            {/* Bottom-Right */}
            <View
              {...panBR.panHandlers}
              style={[
                styles.handle,
                {
                  transform: [
                    { translateX: br.x - HANDLE_SIZE / 2 },
                    { translateY: br.y - HANDLE_SIZE / 2 },
                  ],
                },
              ]}
            >
              <View style={styles.handleInner} />
            </View>

            {/* Bottom-Left */}
            <View
              {...panBL.panHandlers}
              style={[
                styles.handle,
                {
                  transform: [
                    { translateX: bl.x - HANDLE_SIZE / 2 },
                    { translateY: bl.y - HANDLE_SIZE / 2 },
                  ],
                },
              ]}
            >
              <View style={styles.handleInner} />
            </View>
          </View>
        )}

        {/* Magnifying Loupe during handle drag */}
        {activePoint && !loading && (
          <View style={styles.loupeBubble}>
            <Image
              source={{ uri: imageUri }}
              style={{
                width: displayLayout.width * 2.2,
                height: displayLayout.height * 2.2,
                transform: [
                  { translateX: -(activePoint.x * 2.2 - 45) },
                  { translateY: -(activePoint.y * 2.2 - 45) },
                ],
              }}
              resizeMode="cover"
            />
            {/* Crosshair in Loupe */}
            <View style={styles.loupeCrosshairH} />
            <View style={styles.loupeCrosshairV} />
          </View>
        )}
      </View>

      {/* Bottom Toolbar: Reset Corners Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity activeOpacity={0.8} onPress={handleReset} style={styles.resetButton}>
          <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={[typography.bodyMedium, { color: '#FFFFFF' }]}>{t.crop.reset}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  barButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  noticeContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  noticeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  viewport: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imageContainer: {
    position: 'relative',
    overflow: 'visible',
  },
  cropBoundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00D2FF',
    backgroundColor: 'rgba(0, 210, 255, 0.08)',
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  handle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: '#00D2FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8,
  },
  handleInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  loupeBubble: {
    position: 'absolute',
    top: 20,
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#00D2FF',
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    zIndex: 99,
  },
  loupeCrosshairH: {
    position: 'absolute',
    top: 44,
    left: 30,
    right: 30,
    height: 2,
    backgroundColor: '#00D2FF',
  },
  loupeCrosshairV: {
    position: 'absolute',
    left: 44,
    top: 30,
    bottom: 30,
    width: 2,
    backgroundColor: '#00D2FF',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
});
