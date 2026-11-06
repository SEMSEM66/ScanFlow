import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Switch,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Icon } from './ui/Icon';
import { SegmentedControl } from './ui/NativeSegmentedControl';
import { corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { ExportDpi, ExportFormat, ExportQuality } from '../types';
import { validatePdfPassword } from '../db/documentOperations';
import { isUnlocked } from '../entitlements';
import { exportService } from '../services/ExportService';
import { authService } from '../services/AuthService';
import { ocrService } from '../services/OcrService';
import { EXPORT_DPI_PRESETS } from '../imaging/pageFormat';
import { Button } from './ui';

const FORMAT_OPTIONS: ExportFormat[] = ['pdf', 'docx', 'jpg'];

interface ExportModalProps {
  documentTitle: string;
  pageCount: number;
  onShare: (
    format: ExportFormat,
    quality: ExportQuality,
    dpi: ExportDpi,
    watermark?: string,
    password?: string
  ) => Promise<void>;
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
  const [includePassword, setIncludePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const canEncryptPdf = exportService.canEncryptPdf;
  const availableFormats: ExportFormat[] = isUnlocked('word_export') ? FORMAT_OPTIONS : ['pdf', 'jpg'];

  // Defaults from settings when the sheet opens.
  useEffect(() => {
    authService.getDefaultQuality().then(setQuality);
    authService.getDefaultDpi().then(setDpi);
  }, []);

  const estimatedSize = exportService.formatBytes(
    exportService.estimateBytes(format === 'jpg' ? 1 : pageCount, format, dpi, quality),
    language
  );

  const passwordValidation = validatePdfPassword(password, confirmPassword);
  const passwordActive = format === 'pdf' && includePassword && canEncryptPdf;
  const passwordInvalid = passwordActive && !passwordValidation.valid;

  const handleSharePress = async () => {
    if (passwordInvalid) return;
    const watermarkText = format === 'pdf' && includeWatermark ? t.export.watermarkText : undefined;
    const pdfPassword = passwordActive ? password : undefined;
    await onShare(format, quality, dpi, watermarkText, pdfPassword);
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
          values={availableFormats.map((f) => (f === 'pdf' ? t.export.pdf : f === 'docx' ? t.export.docx : t.export.jpg))}
          selectedIndex={Math.max(0, availableFormats.indexOf(format))}
          appearance={isDark ? 'dark' : 'light'}
          enabled={!isGenerating}
          style={styles.segment}
          onChange={(event) => {
            const next = availableFormats[event.nativeEvent.selectedSegmentIndex];
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
              disabled={isGenerating}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        )}

        {/* Security Feature: Password-Protected PDF Toggle (PDF only) */}
        {format === 'pdf' && isUnlocked('pdf_password') && (
          <View style={[styles.passwordSection, { borderColor: colors.borderLight }]}>
            <View style={styles.passwordToggleRow}>
              <View style={styles.watermarkTextWrap}>
                <Icon name="lock.fill" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[typography.body, { color: colors.textPrimary }]}>
                  {t.export.passwordProtection}
                </Text>
              </View>
              <Switch
                value={canEncryptPdf && includePassword}
                onValueChange={setIncludePassword}
                disabled={!canEncryptPdf || isGenerating}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            {!canEncryptPdf && (
              <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 4 }]}>
                {t.export.passwordExpoGoHint}
              </Text>
            )}

            {canEncryptPdf && includePassword && (
              <View style={styles.passwordFields}>
                <View style={[styles.passwordInputRow, { backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight }]}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t.export.passwordPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isGenerating}
                    style={[typography.body, styles.passwordInput, { color: colors.textPrimary }]}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? t.export.passwordHide : t.export.passwordShow}
                  >
                    <Icon name={showPassword ? 'eye.slash' : 'eye'} size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.passwordInputRow, { backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight }]}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder={t.export.passwordConfirmPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isGenerating}
                    style={[typography.body, styles.passwordInput, { color: colors.textPrimary }]}
                  />
                </View>

                {!passwordValidation.valid && (password.length > 0 || confirmPassword.length > 0) && (
                  <Text style={[typography.caption1, { color: colors.danger }]}>
                    {passwordValidation.reason === 'too_short'
                      ? t.export.passwordTooShort
                      : t.export.passwordMismatch}
                  </Text>
                )}

                <View style={[styles.passwordWarningBox, { backgroundColor: colors.surfaceSubdued }]}>
                  <Icon name="exclamationmark.triangle" size={16} color={colors.warning} style={{ marginRight: 8 }} />
                  <Text style={[typography.caption2, { color: colors.textSecondary, flex: 1 }]}>
                    {t.export.passwordWarning}
                  </Text>
                </View>
              </View>
            )}
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
          disabled={passwordInvalid}
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
  passwordSection: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: hairline,
  },
  passwordToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordFields: {
    marginTop: 10,
    gap: 8,
  },
  passwordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderWidth: hairline,
    ...corner(radius.sm),
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingRight: 8,
  },
  passwordWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...corner(radius.xs),
  },
  sizeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 4,
  },
});
