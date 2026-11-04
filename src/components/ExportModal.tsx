import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { ExportFormat, ExportQuality } from '../types';
import { exportService } from '../services/ExportService';

interface ExportModalProps {
  visible: boolean;
  documentTitle: string;
  pageCount: number;
  onClose: () => void;
  onShare: (format: ExportFormat, quality: ExportQuality) => Promise<void>;
  isGenerating?: boolean;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  visible,
  documentTitle,
  pageCount,
  onClose,
  onShare,
  isGenerating = false,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t, formatString } = useTranslation();

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [quality, setQuality] = useState<ExportQuality>('high');

  const estimatedSize = exportService.estimateSize(pageCount, format, quality);

  const handleSharePress = async () => {
    await onShare(format, quality);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: borderRadius.xxl,
                  borderTopRightRadius: borderRadius.xxl,
                },
              ]}
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

                {/* Section: Qualität */}
                <Text
                  style={[
                    typography.subhead,
                    styles.sectionHeader,
                    { color: colors.textSecondary, marginTop: spacing.lg },
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

                {/* File size info row */}
                <View style={styles.sizeInfoRow}>
                  <Ionicons name="document-outline" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={[typography.body, { color: colors.textSecondary }]}>
                    {formatString(t.export.estimatedSize, { size: estimatedSize })}
                  </Text>
                </View>

                {/* Primary CTA: "Teilen" Button matching Exportieren.png */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isGenerating}
                  onPress={handleSharePress}
                  style={[
                    styles.shareButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: borderRadius.lg,
                      marginTop: spacing.xl,
                      marginBottom: spacing.xxl,
                    },
                  ]}
                >
                  {isGenerating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={[typography.headline, { color: '#FFFFFF', fontWeight: '700' }]}>
                        {t.export.share}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
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
    borderRadius: 2.5,
  },
  content: {},
  title: {
    marginBottom: 18,
    letterSpacing: -0.3,
  },
  sectionHeader: {
    marginBottom: 8,
    fontWeight: '500',
  },
  formatContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  formatOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  formatOptionSelected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  qualityContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  qualityOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  qualityOptionSelected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sizeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 4,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
  },
});
