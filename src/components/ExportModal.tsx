import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { capsule, concentric, corner, hairline, radius, shadows, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { ExportDpi, ExportFormat, ExportQuality } from '../types';
import { exportService } from '../services/ExportService';
import { authService } from '../services/AuthService';
import { EXPORT_DPI_PRESETS } from '../imaging/pageFormat';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';

interface ExportModalProps {
  visible: boolean;
  documentTitle: string;
  pageCount: number;
  onClose: () => void;
  onShare: (format: ExportFormat, quality: ExportQuality, dpi: ExportDpi, watermark?: string) => Promise<void>;
  /** True while the file is created and handed to the share sheet – the sheet cannot be closed then. */
  isGenerating?: boolean;
  /** Export progress (pages rendered). */
  progress?: { current: number; total: number } | null;
  /** Called once the sheet has fully disappeared (after it glided out and its modal is gone). */
  onDismiss?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  visible,
  documentTitle,
  pageCount,
  onClose,
  onShare,
  isGenerating = false,
  progress = null,
  onDismiss,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t, formatString, language } = useTranslation();

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [quality, setQuality] = useState<ExportQuality>('medium');
  const [dpi, setDpi] = useState<ExportDpi>(200);
  const [includeWatermark, setIncludeWatermark] = useState(false);

  // Defaults from the settings each time the sheet opens
  useEffect(() => {
    if (!visible) return;
    authService.getDefaultQuality().then(setQuality);
    authService.getDefaultDpi().then(setDpi);
  }, [visible]);

  const estimatedSize = exportService.formatBytes(
    exportService.estimateBytes(format === 'pdf' ? pageCount : 1, format, dpi, quality),
    language
  );

  const handleSharePress = async () => {
    const watermarkText = includeWatermark ? t.export.watermarkText : undefined;
    await onShare(format, quality, dpi, watermarkText);
  };

  // While the file is created the sheet stays open (progress); it closes itself before the share sheet opens
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      dismissible={!isGenerating}
      radius={radius.xl}
      style={styles.sheet}
    >
      {/* Drag Handle Bar matching Exportieren.png */}
      <View style={styles.handleContainer}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      <View style={[styles.content, { paddingHorizontal: spacing.base }]}>
        {/* Title */}
        <Text
          numberOfLines={1}
          style={[typography.title1, styles.title, { color: colors.textPrimary }]}
        >
          {documentTitle}
        </Text>

        {/* Section: Format */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary }]}>
          {t.export.format}
        </Text>

        <View style={[styles.formatContainer, { backgroundColor: colors.surfaceSubdued }]}>
          {/* PDF option */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setFormat('pdf')}
            style={[
              styles.formatOption,
              format === 'pdf' && [styles.formatOptionSelected, { backgroundColor: colors.surface }],
            ]}
          >
            <Ionicons
              name="document-text"
              size={20}
              color={format === 'pdf' ? colors.primary : colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[
                typography.bodyBold,
                { color: format === 'pdf' ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {t.export.pdf}
            </Text>
          </TouchableOpacity>

          {/* JPG option */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setFormat('jpg')}
            style={[
              styles.formatOption,
              format === 'jpg' && [styles.formatOptionSelected, { backgroundColor: colors.surface }],
            ]}
          >
            <Ionicons
              name="image"
              size={20}
              color={format === 'jpg' ? colors.primary : colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[
                typography.bodyBold,
                { color: format === 'jpg' ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {t.export.jpg}
            </Text>
          </TouchableOpacity>
        </View>

        {format === 'jpg' && (
          <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 6 }]}>
            {t.export.jpgCurrentPage}
          </Text>
        )}

        {/* Section: Auflösung */}
        <Text
          style={[
            typography.subhead,
            styles.sectionHeader,
            { color: colors.textSecondary, marginTop: spacing.md },
          ]}
        >
          {t.export.resolution}
        </Text>
        <View style={[styles.qualityContainer, { backgroundColor: colors.surfaceSubdued }]}>
          {EXPORT_DPI_PRESETS.map((d) => {
            const isSelected = dpi === d;
            return (
              <TouchableOpacity
                key={d}
                activeOpacity={0.8}
                onPress={() => setDpi(d)}
                style={[
                  styles.qualityOption,
                  isSelected && [styles.qualityOptionSelected, { backgroundColor: colors.surface }],
                ]}
              >
                <Text
                  style={[
                    typography.bodyMedium,
                    {
                      color: isSelected ? colors.primary : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {formatString(t.export.dpi, { dpi: d })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section: Qualität */}
        <Text
          style={[
            typography.subhead,
            styles.sectionHeader,
            { color: colors.textSecondary, marginTop: spacing.md },
          ]}
        >
          {t.export.quality}
        </Text>

        <View style={[styles.qualityContainer, { backgroundColor: colors.surfaceSubdued }]}>
          {(['low', 'medium', 'high'] as ExportQuality[]).map((q) => {
            const isSelected = quality === q;
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
                onPress={() => setQuality(q)}
                style={[
                  styles.qualityOption,
                  isSelected && [styles.qualityOptionSelected, { backgroundColor: colors.surface }],
                ]}
              >
                <Text
                  style={[
                    typography.bodyMedium,
                    {
                      color: isSelected ? colors.primary : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Security Feature: Watermark Toggle (PDF only) */}
        {format === 'pdf' && (
          <View style={[styles.watermarkRow, { borderColor: colors.borderLight }]}>
            <View style={styles.watermarkTextWrap}>
              <Ionicons name="shield-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[typography.body, { color: colors.textPrimary }]}>
                {t.export.watermark} {language === 'de' ? `„${t.export.watermarkText}“` : `“${t.export.watermarkText}”`}
              </Text>
            </View>
            <Switch
              value={includeWatermark}
              onValueChange={setIncludeWatermark}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        )}

        {/* File size info row */}
        <View style={styles.sizeInfoRow}>
          <Ionicons name="document-outline" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            {formatString(t.export.estimatedSize, { size: estimatedSize })}
          </Text>
        </View>

        {/* Primary CTA: "Teilen" */}
        <Button
          onPress={handleSharePress}
          loading={isGenerating}
          title={t.export.share}
          icon="square.and.arrow.up"
          style={{ marginTop: spacing.lg, marginBottom: spacing.xxl }}
        >
          {isGenerating ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              {progress ? (
                <Text style={[typography.bodyMedium, { color: '#FFFFFF', marginLeft: 10 }]}>
                  {formatString(t.export.progress, { current: progress.current, total: progress.total })}
                </Text>
              ) : null}
            </View>
          ) : undefined}
        </Button>
      </View>
    </BottomSheet>
  );
};

/** Segmented controls: track radius and the inset of the selected segment (concentric). */
const SEGMENT_RADIUS = radius.md;
const SEGMENT_INSET = 3;

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 12,
  },
  handleContainer: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  handle: {
    width: 44,
    height: 5,
    ...capsule(5),
  },
  content: {},
  title: {
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  sectionHeader: {
    marginBottom: 8,
    fontWeight: '500',
  },
  formatContainer: {
    flexDirection: 'row',
    ...corner(SEGMENT_RADIUS),
    padding: SEGMENT_INSET,
  },
  formatOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    ...corner(concentric(SEGMENT_RADIUS, SEGMENT_INSET)),
  },
  formatOptionSelected: {
    shadowColor: '#000',
    ...shadows.low,
  },
  qualityContainer: {
    flexDirection: 'row',
    ...corner(SEGMENT_RADIUS),
    padding: SEGMENT_INSET,
  },
  qualityOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    ...corner(concentric(SEGMENT_RADIUS, SEGMENT_INSET)),
  },
  qualityOptionSelected: {
    shadowColor: '#000',
    ...shadows.low,
  },
  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 8,
    borderTopWidth: hairline,
  },
  watermarkTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sizeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 4,
  },
});
