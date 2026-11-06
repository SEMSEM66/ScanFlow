import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { capsule, concentric, corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import type { DocumentPage, PageAnnotation, SavedSignature, StrokePoint } from '../types';
import { imagePipeline, signatureRepository } from '../services';

const INK_COLORS = ['#0B2E6B', '#111111', '#D91E2A', '#0D7A3E'];

let nextAnnotationSeq = 1;
function createAnnotationId(): string {
  nextAnnotationSeq += 1;
  return `ann_${nextAnnotationSeq}`;
}

interface SignatureAnnotationModalProps {
  visible: boolean;
  /** When provided, opens the full Page Annotation & Signature editor for this page. */
  page?: DocumentPage | null;
  onClose: () => void;
  onSaveAnnotations?: (annotations: PageAnnotation[]) => Promise<void> | void;
}

/** Renders vector polylines inside a box using positioned segment views (works in both Expo Go & IPA). */
const PolylinePreview: React.FC<{
  strokes: StrokePoint[][];
  color: string;
  width: number;
  height: number;
  strokeWidth?: number;
}> = ({ strokes, color, width, height, strokeWidth = 2.4 }) => {
  return (
    <View style={{ width, height, position: 'relative' }} pointerEvents="none">
      {strokes.map((poly, pIdx) =>
        poly.map((pt, i) => {
          if (i === 0) return null;
          const prev = poly[i - 1];
          const x1 = prev.x * width;
          const y1 = prev.y * height;
          const x2 = pt.x * width;
          const y2 = pt.y * height;
          const len = Math.max(2, Math.hypot(x2 - x1, y2 - y1));
          const angleDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          return (
            <View
              key={`${pIdx}_${i}`}
              style={{
                position: 'absolute',
                left: cx - len / 2,
                top: cy - strokeWidth / 2,
                width: len,
                height: strokeWidth,
                backgroundColor: color,
                ...capsule(strokeWidth),
                transform: [{ rotate: `${angleDeg}deg` }],
              }}
            />
          );
        })
      )}
    </View>
  );
};

export const SignatureAnnotationModal: React.FC<SignatureAnnotationModalProps> = ({
  visible,
  page,
  onClose,
  onSaveAnnotations,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t, language } = useTranslation();

  const [signatures, setSignatures] = useState<SavedSignature[]>([]);
  const [annotations, setAnnotations] = useState<PageAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawingPadOpen, setDrawingPadOpen] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [saving, setSaving] = useState(false);

  // Signature drawing pad state
  const [sigName, setSigName] = useState('');
  const [sigColor, setSigColor] = useState<string>(INK_COLORS[0]);
  const [padStrokes, setPadStrokes] = useState<StrokePoint[][]>([]);
  const activeStrokeRef = useRef<StrokePoint[]>([]);
  const [padSize, setPadSize] = useState({ width: 300, height: 150 });
  const [, setStrokeTick] = useState(0);

  // Page preview drag state
  const [previewLayout, setPreviewLayout] = useState({ width: 260, height: 368 });
  const dragOriginRef = useRef<{ id: string; startPageX: number; startPageY: number; origX: number; origY: number } | null>(null);

  const loadSignatures = useCallback(async () => {
    try {
      const list = await signatureRepository.getAll();
      setSignatures(list);
    } catch (err) {
      console.warn('[SignatureAnnotationModal] Could not load signatures:', err);
    }
  }, []);

  const handleModalShow = useCallback(() => {
    void loadSignatures();
    const initial = page?.annotations ? [...page.annotations] : [];
    setAnnotations(initial);
    setSelectedId(initial[initial.length - 1]?.id ?? null);
    setDrawingPadOpen(!page);
  }, [page, loadSignatures]);

  const selectedAnn = annotations.find((a) => a.id === selectedId) ?? null;

  const handlePadTouchStart = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const pt = {
      x: Math.max(0, Math.min(1, locationX / Math.max(1, padSize.width))),
      y: Math.max(0, Math.min(1, locationY / Math.max(1, padSize.height))),
    };
    activeStrokeRef.current = [pt];
    setPadStrokes((prev) => [...prev, activeStrokeRef.current]);
  };

  const handlePadTouchMove = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const pt = {
      x: Math.max(0, Math.min(1, locationX / Math.max(1, padSize.width))),
      y: Math.max(0, Math.min(1, locationY / Math.max(1, padSize.height))),
    };
    activeStrokeRef.current.push(pt);
    setStrokeTick((n) => n + 1);
  };

  const handlePadTouchEnd = () => {
    setStrokeTick((n) => n + 1);
  };

  const handleAnnotationTouchStart = (ann: PageAnnotation, evt: GestureResponderEvent) => {
    setSelectedId(ann.id);
    dragOriginRef.current = {
      id: ann.id,
      startPageX: evt.nativeEvent.pageX,
      startPageY: evt.nativeEvent.pageY,
      origX: ann.x,
      origY: ann.y,
    };
  };

  const handleAnnotationTouchMove = (evt: GestureResponderEvent) => {
    const drag = dragOriginRef.current;
    if (!drag) return;
    const dxNorm = (evt.nativeEvent.pageX - drag.startPageX) / Math.max(1, previewLayout.width);
    const dyNorm = (evt.nativeEvent.pageY - drag.startPageY) / Math.max(1, previewLayout.height);
    setAnnotations((curr) =>
      curr.map((a) => {
        if (a.id !== drag.id) return a;
        return {
          ...a,
          x: Math.max(0, Math.min(1 - a.width, drag.origX + dxNorm)),
          y: Math.max(0, Math.min(1 - a.height, drag.origY + dyNorm)),
        };
      })
    );
  };

  const handleAnnotationTouchEnd = () => {
    dragOriginRef.current = null;
  };

  const insertSignatureAnnotation = (sig: SavedSignature) => {
    if (!page) return;
    const width = 0.38;
    const height = Math.max(0.06, Math.min(0.28, width / Math.max(1, sig.aspectRatio)));
    const newAnn: PageAnnotation = {
      id: createAnnotationId(),
      type: 'signature',
      x: 0.52,
      y: 0.78,
      width,
      height,
      rotation: 0,
      color: sig.color,
      opacity: 1,
      strokes: sig.strokes.length > 0 ? sig.strokes : undefined,
      imagePngBase64: sig.imagePngBase64 ?? undefined,
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setSelectedId(newAnn.id);
    setDrawingPadOpen(false);
  };

  const handleSaveDrawnSignature = async () => {
    if (padStrokes.length === 0) return;
    setSaving(true);
    try {
      const created = await signatureRepository.createFromStrokes({
        name: sigName.trim() || t.annotations.defaultSignatureName,
        strokes: padStrokes,
        color: sigColor,
      });
      await loadSignatures();
      setPadStrokes([]);
      setSigName('');
      if (page) {
        insertSignatureAnnotation(created);
      } else {
        setDrawingPadOpen(false);
      }
    } catch (err) {
      console.error('[SignatureAnnotationModal] Save signature failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCapturePhotoSignature = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t.scan.photoPermissionTitle, t.scan.photoPermissionMessage);
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const extracted = await imagePipeline.extractSignatureFromPhoto(picked.assets[0].uri, sigColor);
      const created = await signatureRepository.createFromPhoto({
        name: sigName.trim() || t.annotations.defaultSignatureName,
        imagePngBase64: extracted.imagePngBase64,
        aspectRatio: extracted.aspectRatio,
        color: sigColor,
      });
      await loadSignatures();
      if (page) {
        insertSignatureAnnotation(created);
      }
    } catch (err) {
      console.error('[SignatureAnnotationModal] Photo signature extraction failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSavedSignature = async (id: string) => {
    await signatureRepository.delete(id);
    await loadSignatures();
  };

  const handleAddDateStamp = () => {
    const dateStr = new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const newAnn: PageAnnotation = {
      id: createAnnotationId(),
      type: 'date_stamp',
      x: 0.62,
      y: 0.1,
      width: 0.28,
      height: 0.055,
      rotation: 0,
      color: '#D91E2A',
      opacity: 0.92,
      text: dateStr,
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setSelectedId(newAnn.id);
  };

  const handleAddCustomText = () => {
    const clean = customText.trim();
    if (!clean) return;
    const newAnn: PageAnnotation = {
      id: createAnnotationId(),
      type: 'text',
      x: 0.2,
      y: 0.45,
      width: 0.48,
      height: 0.06,
      rotation: 0,
      color: sigColor,
      opacity: 1,
      text: clean,
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setSelectedId(newAnn.id);
    setCustomText('');
    setTextModalOpen(false);
  };

  const handleAddHighlighter = () => {
    const newAnn: PageAnnotation = {
      id: createAnnotationId(),
      type: 'highlighter',
      x: 0.15,
      y: 0.35,
      width: 0.5,
      height: 0.045,
      rotation: 0,
      color: '#FFDF00',
      opacity: 0.38,
      strokeWidth: 0.028,
      strokes: [[{ x: 0.02, y: 0.5 }, { x: 0.98, y: 0.5 }]],
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setSelectedId(newAnn.id);
  };

  const updateSelected = (updater: (a: PageAnnotation) => PageAnnotation) => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.map((a) => (a.id === selectedId ? updater(a) : a)));
  };

  const handleFinishPageAnnotations = async () => {
    if (!onSaveAnnotations || saving) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSaveAnnotations(annotations);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={handleModalShow}
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity disabled={saving} onPress={onClose} style={styles.headerBtn}>
            <Text style={[typography.body, { color: colors.primary }]}>{t.common.cancel}</Text>
          </TouchableOpacity>
          <Text style={[typography.headline, styles.headerTitle, { color: colors.textPrimary }]}>
            {page ? t.annotations.title : t.annotations.manageSignatures}
          </Text>
          <View style={[styles.headerBtn, { alignItems: 'flex-end' }]}>
            {page ? (
              <TouchableOpacity disabled={saving} onPress={() => void handleFinishPageAnnotations()}>
                <Text style={[typography.bodyBold, { color: colors.primary }]}>{t.common.save}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 48 }}>
          {/* Visual Signature Disclaimer */}
          <View style={[styles.disclaimerBanner, { backgroundColor: colors.surfaceSubdued }]}>
            <Icon name="info.circle" size={16} color={colors.textSecondary} />
            <Text style={[typography.caption2, { color: colors.textSecondary, marginLeft: 8, flex: 1 }]}>
              {t.annotations.visualDisclaimer}
            </Text>
          </View>

          {/* Interactive Page Preview when editing a page */}
          {page ? (
            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <View
                style={[styles.pagePreviewBox, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  if (width > 0 && height > 0) {
                    setPreviewLayout({ width, height });
                  }
                }}
              >
                <Image
                  source={{ uri: page.previewUri || page.proxyUri || page.originalUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="stretch"
                />
                {annotations.map((ann) => {
                  const isSel = ann.id === selectedId;
                  const pw = previewLayout.width;
                  const ph = previewLayout.height;
                  const boxW = ann.width * pw;
                  const boxH = ann.height * ph;
                  return (
                    <View
                      key={ann.id}
                      onTouchStart={(e) => handleAnnotationTouchStart(ann, e)}
                      onTouchMove={handleAnnotationTouchMove}
                      onTouchEnd={handleAnnotationTouchEnd}
                      style={[
                        styles.annotationOverlayBox,
                        {
                          left: `${ann.x * 100}%`,
                          top: `${ann.y * 100}%`,
                          width: `${ann.width * 100}%`,
                          height: `${ann.height * 100}%`,
                          borderColor: isSel ? colors.primary : 'transparent',
                          backgroundColor:
                            ann.type === 'highlighter' ? 'rgba(255, 223, 0, 0.36)' : 'transparent',
                          transform: [{ rotate: `${ann.rotation}deg` }],
                        },
                      ]}
                    >
                      {ann.imagePngBase64 ? (
                        <Image
                          source={{ uri: `data:image/png;base64,${ann.imagePngBase64}` }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="contain"
                        />
                      ) : ann.strokes && ann.type !== 'highlighter' ? (
                        <PolylinePreview
                          strokes={ann.strokes}
                          color={ann.color}
                          width={boxW}
                          height={boxH}
                        />
                      ) : ann.text ? (
                        <View
                          style={[
                            styles.textStampPreview,
                            ann.type === 'date_stamp' && { borderWidth: 1.5, borderColor: ann.color },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={{ color: ann.color, fontWeight: '700', fontSize: 13 }}
                          >
                            {ann.text}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {/* Quick Tool Strip */}
              <View style={styles.toolStrip}>
                <TouchableOpacity
                  onPress={() => setDrawingPadOpen(true)}
                  style={[styles.toolChip, { backgroundColor: colors.primarySubdued }]}
                >
                  <Icon name="signature" size={16} color={colors.primary} />
                  <Text style={[typography.caption1, { color: colors.primary, fontWeight: '600', marginLeft: 5 }]}>
                    {t.annotations.insertSignature}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddDateStamp}
                  style={[styles.toolChip, { backgroundColor: colors.surfaceSubdued }]}
                >
                  <Icon name="calendar" size={15} color={colors.textPrimary} />
                  <Text style={[typography.caption1, { color: colors.textPrimary, marginLeft: 5 }]}>
                    {t.annotations.addDateStamp}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTextModalOpen(true)}
                  style={[styles.toolChip, { backgroundColor: colors.surfaceSubdued }]}
                >
                  <Icon name="textformat" size={15} color={colors.textPrimary} />
                  <Text style={[typography.caption1, { color: colors.textPrimary, marginLeft: 5 }]}>
                    {t.annotations.addText}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddHighlighter}
                  style={[styles.toolChip, { backgroundColor: colors.surfaceSubdued }]}
                >
                  <Icon name="highlighter" size={15} color={colors.textPrimary} />
                  <Text style={[typography.caption1, { color: colors.textPrimary, marginLeft: 5 }]}>
                    {t.annotations.addHighlighter}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Selected Annotation Transform Controls */}
              {selectedAnn ? (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, width: '100%', marginTop: 10 }]}>
                  <View style={styles.transformRow}>
                    <TouchableOpacity
                      onPress={() =>
                        updateSelected((a) => ({
                          ...a,
                          width: Math.max(0.08, a.width * 0.88),
                          height: Math.max(0.03, a.height * 0.88),
                        }))
                      }
                      style={[styles.iconPill, { backgroundColor: colors.surfaceSubdued }]}
                    >
                      <Icon name="minus.magnifyingglass" size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        updateSelected((a) => ({
                          ...a,
                          width: Math.min(0.92, a.width * 1.12),
                          height: Math.min(0.5, a.height * 1.12),
                        }))
                      }
                      style={[styles.iconPill, { backgroundColor: colors.surfaceSubdued }]}
                    >
                      <Icon name="plus.magnifyingglass" size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateSelected((a) => ({ ...a, rotation: Math.max(-180, a.rotation - 15) }))}
                      style={[styles.iconPill, { backgroundColor: colors.surfaceSubdued }]}
                    >
                      <Icon name="rotate.left" size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateSelected((a) => ({ ...a, rotation: Math.min(180, a.rotation + 15) }))}
                      style={[styles.iconPill, { backgroundColor: colors.surfaceSubdued }]}
                    >
                      <Icon name="rotate.right" size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAnnotations((prev) => prev.filter((a) => a.id !== selectedAnn.id));
                        setSelectedId(null);
                      }}
                      style={[styles.iconPill, { backgroundColor: colors.surfaceSubdued }]}
                    >
                      <Icon name="trash" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Custom Text Input Box */}
          {textModalOpen ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginBottom: 12 }]}>
              <Text style={[typography.subhead, { color: colors.textPrimary, fontWeight: '600', marginBottom: 8 }]}>
                {t.annotations.textPromptTitle}
              </Text>
              <TextInput
                value={customText}
                onChangeText={setCustomText}
                placeholder={t.annotations.textPromptPlaceholder}
                placeholderTextColor={colors.textMuted}
                style={[
                  typography.body,
                  styles.input,
                  { color: colors.textPrimary, backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight },
                ]}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Button
                  variant="gray"
                  size="medium"
                  title={t.common.cancel}
                  onPress={() => setTextModalOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  size="medium"
                  title={t.common.confirm}
                  onPress={handleAddCustomText}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}

          {/* Saved Signatures List */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.sectionRow}>
              <Text style={[typography.headline, { color: colors.textPrimary, flex: 1 }]}>
                {t.annotations.manageSignatures}
              </Text>
              <TouchableOpacity onPress={() => setDrawingPadOpen((v) => !v)}>
                <Text style={[typography.subhead, { color: colors.primary, fontWeight: '600' }]}>
                  + {t.annotations.newSignature}
                </Text>
              </TouchableOpacity>
            </View>

            {signatures.length === 0 ? (
              <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 8 }]}>
                {t.annotations.noSignaturesYet}
              </Text>
            ) : (
              signatures.map((sig) => (
                <View key={sig.id} style={[styles.sigRow, { borderTopColor: colors.borderLight }]}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    disabled={!page}
                    onPress={() => insertSignatureAnnotation(sig)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                  >
                    <View style={[styles.sigThumb, { backgroundColor: colors.surfaceSubdued }]}>
                      {sig.imagePngBase64 ? (
                        <Image
                          source={{ uri: `data:image/png;base64,${sig.imagePngBase64}` }}
                          style={{ width: 96, height: 40 }}
                          resizeMode="contain"
                        />
                      ) : (
                        <PolylinePreview strokes={sig.strokes} color={sig.color} width={96} height={40} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{sig.name}</Text>
                      {page ? (
                        <Text style={[typography.caption2, { color: colors.primary, marginTop: 2 }]}>
                          {t.annotations.insertSignature}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleDeleteSavedSignature(sig.id)}
                    style={{ padding: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t.annotations.deleteSignature}
                  >
                    <Icon name="trash" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {/* Signature Drawing Pad + Photo Signature Capture (P1) */}
          {drawingPadOpen ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder, marginTop: spacing.base },
              ]}
            >
              <Text style={[typography.subhead, { color: colors.textPrimary, fontWeight: '600', marginBottom: 8 }]}>
                {t.annotations.drawInstruction}
              </Text>

              {/* Color Dots */}
              <View style={styles.colorRow}>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginRight: 8 }]}>
                  {t.annotations.colorLabel}:
                </Text>
                {INK_COLORS.map((hex) => (
                  <TouchableOpacity
                    key={hex}
                    onPress={() => setSigColor(hex)}
                    style={[
                      styles.colorDot,
                      {
                        backgroundColor: hex,
                        borderColor: sigColor === hex ? colors.primary : 'transparent',
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Drawing Canvas */}
              <View
                onTouchStart={handlePadTouchStart}
                onTouchMove={handlePadTouchMove}
                onTouchEnd={handlePadTouchEnd}
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  if (width > 0 && height > 0) {
                    setPadSize({ width, height });
                  }
                }}
                style={[styles.padBox, { backgroundColor: '#FFFFFF', borderColor: colors.borderLight }]}
              >
                <PolylinePreview
                  strokes={padStrokes}
                  color={sigColor}
                  width={padSize.width}
                  height={padSize.height}
                  strokeWidth={3}
                />
                <View style={styles.baseline} pointerEvents="none" />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => setPadStrokes((prev) => prev.slice(0, -1))}
                  disabled={padStrokes.length === 0}
                  style={[styles.smallBtn, { backgroundColor: colors.surfaceSubdued }]}
                >
                  <Text style={[typography.caption1, { color: colors.textPrimary }]}>
                    {t.annotations.undoStroke}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPadStrokes([])}
                  disabled={padStrokes.length === 0}
                  style={[styles.smallBtn, { backgroundColor: colors.surfaceSubdued }]}
                >
                  <Text style={[typography.caption1, { color: colors.textPrimary }]}>
                    {t.annotations.clearCanvas}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={sigName}
                onChangeText={setSigName}
                placeholder={t.annotations.signatureNamePlaceholder}
                placeholderTextColor={colors.textMuted}
                style={[
                  typography.body,
                  styles.input,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceSubdued,
                    borderColor: colors.borderLight,
                    marginTop: 10,
                  },
                ]}
              />

              <Button
                icon="checkmark"
                title={t.annotations.saveSignature}
                disabled={padStrokes.length === 0 || saving}
                onPress={() => void handleSaveDrawnSignature()}
                style={{ marginTop: 10 }}
              />

              <Button
                variant="tinted"
                size="medium"
                icon="camera.viewfinder"
                title={t.annotations.fromPhoto}
                disabled={saving}
                onPress={() => void handleCapturePhotoSignature()}
                style={{ marginTop: 8 }}
              />

              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
              ) : null}
            </View>
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
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    ...corner(radius.sm),
  },
  pagePreviewBox: {
    width: 260,
    height: 368,
    borderWidth: hairline,
    ...corner(radius.sm),
    overflow: 'hidden',
    position: 'relative',
  },
  annotationOverlayBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textStampPreview: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    ...capsule(32),
  },
  transformRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  iconPill: {
    width: 40,
    height: 40,
    ...capsule(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    ...corner(CARD_RADIUS),
    borderWidth: hairline,
    padding: CARD_PADDING,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 8,
    borderTopWidth: hairline,
  },
  sigThumb: {
    width: 104,
    height: 46,
    ...corner(radius.xs),
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  colorDot: {
    width: 26,
    height: 26,
    ...capsule(26),
    borderWidth: 2,
    marginRight: 10,
  },
  padBox: {
    width: '100%',
    height: 150,
    borderWidth: hairline,
    ...corner(INNER_RADIUS),
    overflow: 'hidden',
    position: 'relative',
  },
  baseline: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 34,
    height: 1,
    backgroundColor: '#D5D5DC',
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...corner(radius.xs),
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: hairline,
    ...corner(radius.sm),
  },
});
