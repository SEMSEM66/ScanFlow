import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  PanResponder,
  PanResponderInstance,
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../src/components/ui/Icon';
import { SegmentedControl } from '../src/components/ui/NativeSegmentedControl';
import { Canvas, Path, Skia, FillType } from '@shopify/react-native-skia';
import { useTheme, corner, capsule, radius } from '../src/theme';
import { useTranslation } from '../src/i18n';
import { documentRepository, imagePipeline } from '../src/services';
import { FULL_QUAD, isConvexQuad, polygonArea } from '../src/imaging/geometry';
import { haptics } from '../src/utils/haptics';
import type { PageFormat, Point, Quad } from '../src/types';

const HANDLE_SIZE = 44;
const LOUPE_SIZE = 112;
const LOUPE_ZOOM = 2.5;
const HANDLE_RING = 26;
const PILL_HEIGHT = 40;
const ACCENT = '#00D2FF';
const INVALID = '#FF453A';

type Corner = 0 | 1 | 2 | 3;

/**
 * Perspective crop: four freely movable corners on the (proxy of the) original.
 * Saves only normalized corners + page format; the page is re-rendered
 * non-destructively from the original (perspective warp, no bounding box).
 */
export default function CropScreen() {
  const router = useRouter();
  const { pageId } = useLocalSearchParams<{ pageId: string; documentId?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  /** Normalized corners (0…1) TL, TR, BR, BL */
  const [corners, setCorners] = useState<Quad>(FULL_QUAD);
  const [initialCorners, setInitialCorners] = useState<Quad>(FULL_QUAD);
  const [pageFormat, setPageFormat] = useState<PageFormat>('auto');
  const [active, setActive] = useState<Corner | null>(null);

  // Load page, make sure a proxy exists
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!pageId) throw new Error('missing pageId');
        let page = await documentRepository.getPage(pageId);
        if (!page) throw new Error('page not found');
        if (!page.proxyUri) {
          const src = await imagePipeline.ensureProxy(page);
          await documentRepository.replacePageSource(page.id, { originalUri: src.originalUri, proxyUri: src.proxyUri });
          page = (await documentRepository.getPage(pageId))!;
        }
        const uri = page.proxyUri ?? page.originalUri;
        Image.getSize(
          uri,
          (width, height) => {
            if (cancelled) return;
            setImageSize({ width, height });
            setImageUri(uri);
            const c = page!.corners ?? FULL_QUAD;
            setCorners(c);
            setInitialCorners(c);
            setPageFormat(page!.pageFormat);
            setLoading(false);
          },
          (err) => {
            throw err;
          }
        );
      } catch (err) {
        console.error('[CropScreen] load error', err);
        if (!cancelled) {
          Alert.alert(t.common.error, t.filters.renderFailed);
          router.back();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Fitted display rectangle of the image inside the viewport
  const display = useMemo(() => {
    if (!imageSize || !viewport) return null;
    const pad = HANDLE_SIZE / 2 + 4;
    const maxW = viewport.width - pad * 2;
    const maxH = viewport.height - pad * 2;
    const s = Math.min(maxW / imageSize.width, maxH / imageSize.height);
    const width = imageSize.width * s;
    const height = imageSize.height * s;
    return { width, height, left: (viewport.width - width) / 2, top: (viewport.height - height) / 2 };
  }, [imageSize, viewport]);

  // Pan responders work with incremental deltas + functional state updates,
  // so they never read stale corner state (the bug of the old crop screen).
  const responders = useMemo(() => {
    const make = (corner: Corner): PanResponderInstance => {
      let last = { dx: 0, dy: 0 };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          last = { dx: 0, dy: 0 };
          setActive(corner);
          void haptics.light();
        },
        onPanResponderMove: (_, g) => {
          if (!display) return;
          const ddx = (g.dx - last.dx) / display.width;
          const ddy = (g.dy - last.dy) / display.height;
          last = { dx: g.dx, dy: g.dy };
          setCorners((prev) => {
            const next = [...prev] as Quad;
            next[corner] = {
              x: Math.min(1, Math.max(0, prev[corner].x + ddx)),
              y: Math.min(1, Math.max(0, prev[corner].y + ddy)),
            };
            return next;
          });
        },
        onPanResponderRelease: () => {
          setActive(null);
          void haptics.medium();
        },
        onPanResponderTerminate: () => setActive(null),
      });
    };
    return [make(0), make(1), make(2), make(3)];
  }, [display]);

  const toPx = (p: Point) => ({ x: (display?.width ?? 0) * p.x, y: (display?.height ?? 0) * p.y });
  const valid = useMemo(() => {
    if (!imageSize) return false;
    const px = corners.map((p) => ({ x: p.x * imageSize.width, y: p.y * imageSize.height })) as Quad;
    return isConvexQuad(px) && Math.abs(polygonArea(px)) > 0.02 * imageSize.width * imageSize.height;
  }, [corners, imageSize]);

  const overlayPath = useMemo(() => {
    if (!display) return null;
    const q = corners.map((c) => ({ x: c.x * display.width, y: c.y * display.height }));
    return Skia.PathBuilder.Make()
      .addRect(Skia.XYWHRect(0, 0, display.width, display.height))
      .addPoly(q, true)
      .setFillType(FillType.EvenOdd)
      .detach();
  }, [corners, display]);

  const outlinePath = useMemo(() => {
    if (!display) return null;
    const q = corners.map((c) => ({ x: c.x * display.width, y: c.y * display.height }));
    return Skia.PathBuilder.Make().addPoly(q, true).detach();
  }, [corners, display]);

  const handleDetect = async () => {
    if (!imageUri) return;
    try {
      setDetecting(true);
      const res = await imagePipeline.detect(imageUri);
      if (res.detected) {
        void haptics.success();
        setCorners(res.corners);
      } else {
        void haptics.warning();
        Alert.alert(t.crop.title, t.crop.notDetected);
      }
    } catch (err) {
      console.warn('[CropScreen] detect failed', err);
      void haptics.warning();
      Alert.alert(t.crop.title, t.crop.notDetected);
    } finally {
      setDetecting(false);
    }
  };

  const handleApply = async () => {
    if (!pageId || saving) return;
    if (!valid) {
      void haptics.error();
      Alert.alert(t.crop.title, t.crop.invalidQuad);
      return;
    }
    try {
      setSaving(true);
      const isFull = corners.every((c, i) => Math.abs(c.x - FULL_QUAD[i].x) < 1e-3 && Math.abs(c.y - FULL_QUAD[i].y) < 1e-3);
      await documentRepository.updatePage(pageId, { corners: isFull ? null : corners, pageFormat });
      void haptics.success();
      router.back();
    } catch (err) {
      console.error('[CropScreen] save error', err);
      void haptics.error();
      Alert.alert(t.common.error, t.crop.saveFailed);
      setSaving(false);
    }
  };

  const activePoint = active !== null ? toPx(corners[active]) : null;
  const lineColor = valid ? ACCENT : INVALID;
  // Loupe on the side away from the finger
  const loupeLeft = activePoint && display && activePoint.x < display.width / 2;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#101114' }]} edges={['bottom']}>
      <StatusBar style="light" />
      <Stack.Screen options={{ gestureEnabled: !saving }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button disabled={saving} onPress={() => router.back()}>{t.common.cancel}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" disabled={saving || loading} onPress={handleApply}>{t.crop.apply}</Stack.Toolbar.Button>
      </Stack.Toolbar>

      <View style={styles.noticeContainer}>
        <View style={styles.noticePill}>
          <Icon name="crop" size={14} color={ACCENT} style={{ marginRight: 6 }} />
          <Text style={styles.noticeText}>{t.crop.instruction}</Text>
        </View>
      </View>

      <View style={styles.viewport} onLayout={(e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout)}>
        {loading || !display || !imageUri ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <View style={[styles.imageContainer, { left: display.left, top: display.top, width: display.width, height: display.height }]}>
            <Image source={{ uri: imageUri }} style={{ width: display.width, height: display.height }} resizeMode="stretch" />
            {overlayPath && outlinePath ? (
              <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                <Path path={overlayPath} color="rgba(0,0,0,0.55)" />
                <Path path={outlinePath} color={lineColor} style="stroke" strokeWidth={2} />
              </Canvas>
            ) : null}
            {corners.map((c, i) => {
              const p = toPx(c);
              return (
                <View
                  key={i}
                  {...responders[i].panHandlers}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={[styles.handle, { transform: [{ translateX: p.x - HANDLE_SIZE / 2 }, { translateY: p.y - HANDLE_SIZE / 2 }] }]}
                  accessibilityLabel={`corner-${i}`}
                >
                  <View style={[styles.handleRing, { borderColor: lineColor, backgroundColor: active === i ? 'rgba(0,210,255,0.25)' : 'transparent' }]} />
                </View>
              );
            })}
          </View>
        )}

        {/* Magnifying loupe while dragging */}
        {activePoint && display && imageUri ? (
          <View pointerEvents="none" style={[styles.loupe, loupeLeft ? { right: 16 } : { left: 16 }]}>
            <Image
              source={{ uri: imageUri }}
              resizeMode="stretch"
              style={{
                position: 'absolute',
                width: display.width * LOUPE_ZOOM,
                height: display.height * LOUPE_ZOOM,
                left: LOUPE_SIZE / 2 - activePoint.x * LOUPE_ZOOM,
                top: LOUPE_SIZE / 2 - activePoint.y * LOUPE_ZOOM,
              }}
            />
            <View style={[styles.crossH, { backgroundColor: lineColor }]} />
            <View style={[styles.crossV, { backgroundColor: lineColor }]} />
          </View>
        ) : null}
      </View>

      {/* Page format */}
      <View style={styles.formatRow}>
        <Text style={styles.formatLabel}>{t.crop.pageFormat}</Text>
        <SegmentedControl
          values={[t.crop.formatAuto, t.crop.formatA4, t.crop.formatLetter]}
          selectedIndex={(['auto', 'a4', 'letter'] as PageFormat[]).indexOf(pageFormat)}
          appearance="dark"
          style={styles.nativeSegment}
          onChange={(event) => {
            const value = (['auto', 'a4', 'letter'] as PageFormat[])[event.nativeEvent.selectedSegmentIndex];
            if (value) {
              void haptics.selection();
              setPageFormat(value);
            }
          }}
        />
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.pillButton} onPress={handleDetect} disabled={detecting || loading}>
          {detecting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name="viewfinder" size={16} color="#FFFFFF" />
          )}
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.pillText}>{t.crop.autoDetect}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={() => {
            void haptics.selection();
            setCorners(FULL_QUAD);
          }}
          disabled={loading}
        >
          <Icon name="arrow.up.left.and.arrow.down.right" size={16} color="#FFFFFF" />
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.pillText}>{t.crop.fullImage}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={() => {
            void haptics.selection();
            setCorners(initialCorners);
          }}
          disabled={loading}
        >
          <Icon name="arrow.clockwise" size={16} color="#FFFFFF" />
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.pillText}>{t.crop.reset}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  noticeContainer: { alignItems: 'center', paddingVertical: 6 },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    // ≈ half a one-line pill (capsule); if the hint wraps it stays a smooth rounded rect
    ...corner(radius.md),
  },
  noticeText: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, fontWeight: '500' },
  viewport: { flex: 1, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  imageContainer: { position: 'absolute', overflow: 'visible' },
  handle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleRing: { width: HANDLE_RING, height: HANDLE_RING, ...capsule(HANDLE_RING), borderWidth: 3 },
  loupe: {
    position: 'absolute',
    top: 8,
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    ...capsule(LOUPE_SIZE),
    borderWidth: 3,
    borderColor: ACCENT,
    overflow: 'hidden',
    backgroundColor: '#000',
    zIndex: 99,
  },
  crossH: { position: 'absolute', top: LOUPE_SIZE / 2 - 1, left: LOUPE_SIZE / 2 - 14, width: 28, height: 2 },
  crossV: { position: 'absolute', left: LOUPE_SIZE / 2 - 1, top: LOUPE_SIZE / 2 - 14, width: 2, height: 28 },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  formatLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  nativeSegment: { flex: 1, maxWidth: 210, marginLeft: 8, minHeight: 44 },
  bottomBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 14 },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    height: PILL_HEIGHT,
    ...capsule(PILL_HEIGHT),
  },
  pillText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
