import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Icon } from './ui/Icon';
import { SegmentedControl } from './ui/NativeSegmentedControl';
import { hairline, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { ExportDpi, ExportFormat, ExportQuality } from '../types';
import { exportService } from '../services/ExportService';
import { authService } from '../services/AuthService';
import { ocrService } from '../services/OcrService';
import { EXPORT_DPI_PRESETS } from '../imaging/pageFormat';
import { Button } from './ui';

const FORMAT_OPTIONS: ExportFormat[] = ['pdf', 'docx', 'jpg'];

interface ExportModalProps {
  documentTitle: string;
  pageCount: number;
  onShare: (format: ExportFormat, quality: ExportQuality, dpi: ExportDpi, watermark?: string) => Promise<void>;
  /** True while the file is created and handed to the share sheet – the sheet cannot be closed then. */
  isGenerating?: boolean;
  /** Export progress (pages rendered). */
  progress?: { current: number; total: number } | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  documentTitle,
  pageCount,
  onShare,
  isGenerating = false,
  progress = null,
}) => {
  const { colors, typography, spacing, isDark } = useTheme();
  const { t, formatString, language } = useTranslation();

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [quality, setQuality] = useState<ExportQuality>('medium');
  const [dpi, setDpi] = useState<ExportDpi>(200);
  const [includeWatermark, setIncludeWatermark] = useState(false);

  // Defaults from settings when the sheet opens.
  useEffect(() => {
    authService.getDefaultQuality().then(setQuality);
    authService.getDefaultDpi().then(setDpi);
  }, []);

  const estimatedSize = exportService.formatBytes(
    exportService.estimateBytes(format === 'jpg' ? 1 : pageCount, format, dpi, quality),
    language
  );

  const handleSharePress = async () => {
    const watermarkText = format === 'pdf' && includeWatermark ? t.export.watermarkText : undefined;
    await onShare(format, quality, dpi, watermarkText);
  };

  return (
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

        <SegmentedControl
          values={[t.export.pdf, t.export.docx, t.export.jpg]}
          selectedIndex={FORMAT_OPTIONS.indexOf(format)}
          appearance={isDark ? 'dark' : 'light'}
          enabled={!isGenerating}
          style={styles.segment}
          onChange={(event) => {
            const next = FORMAT_OPTIONS[event.nativeEvent.selectedSegmentIndex];
            if (next) setFormat(next);
          }}
        />

        {format === 'jpg' && (
          <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 6 }]}>
            {t.export.jpgCurrentPage}
          </Text>
        )}

        {format === 'docx' && (
          <View style={{ marginTop: 8 }}>
            <Text style={[typography.footnote, { color: colors.textSecondary }]}>
              {t.export.docxHint}
            </Text>
            {!ocrService.available && (
              <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>
                {t.export.docxExpoGoHint}
              </Text>
            )}
          </View>
        )}

        {format !== 'docx' && (
          <>
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
            <SegmentedControl values={EXPORT_DPI_PRESETS.map((d) => formatString(t.export.dpi, { dpi: d }))}
              selectedIndex={EXPORT_DPI_PRESETS.indexOf(dpi)} appearance={isDark ? 'dark' : 'light'} enabled={!isGenerating} style={styles.segment}
              onChange={(event) => { const value = EXPORT_DPI_PRESETS[event.nativeEvent.selectedSegmentIndex]; if (value) setDpi(value); }} />

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

            <SegmentedControl values={[t.export.low, t.export.medium, t.export.high]}
              selectedIndex={(['low', 'medium', 'high'] as ExportQuality[]).indexOf(quality)} appearance={isDark ? 'dark' : 'light'} enabled={!isGenerating} style={styles.segment}
              onChange={(event) => { const value = (['low', 'medium', 'high'] as ExportQuality[])[event.nativeEvent.selectedSegmentIndex]; if (value) setQuality(value); }} />
          </>
        )}

        {/* Security Feature: Watermark Toggle (PDF only) */}
        {format === 'pdf' && (
          <View style={[styles.watermarkRow, { borderColor: colors.borderLight }]}>
            <View style={styles.watermarkTextWrap}>
              <Icon name="shield" size={18} color={colors.primary} style={{ marginRight: 8 }} />
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
          <Icon name="doc" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
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
  );
};

const styles = StyleSheet.create({
  content: { paddingTop: 24 },
  title: {
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  sectionHeader: {
    marginBottom: 8,
    fontWeight: '500',
  },
  segment: { minHeight: 44 },
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
