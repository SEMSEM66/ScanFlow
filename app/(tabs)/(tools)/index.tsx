import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { Icon } from '../../../src/components/ui/Icon';
import { concentric, corner, hairline, radius, useTheme } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n';
import {
  documentRepository,
  exportService,
  ocrService,
  storageService,
} from '../../../src/services';
import type { Document } from '../../../src/types';

function stripPdfExtension(name: string): string {
  const trimmed = name.trim();
  return trimmed.replace(/\.pdf$/i, '').trim() || 'Document';
}

export default function ToolsScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t, formatString } = useTranslation();

  const [busyMode, setBusyMode] = useState<'pdf' | 'scan' | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const pendingDocRef = useRef<Document | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await documentRepository.getAll();
      setDocuments(docs);
    } catch (err) {
      console.warn('[ToolsScreen] Could not load documents:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments])
  );

  const handleConvertPdfFile = async () => {
    if (busyMode !== null) return;
    let pickedUri: string | null = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const asset = result.assets[0];
      pickedUri = asset.uri;
      const docTitle = stripPdfExtension(asset.name || 'Document');

      setBusyMode('pdf');
      setProgressText(t.tools.convertingPdf);

      const resumeOcr = ocrService.hold();
      let pages;
      try {
        pages = await ocrService.recognizePdfFile(asset.uri);
      } finally {
        resumeOcr();
      }

      const hasAnyText = pages.some(
        (p) => (p.lines && p.lines.length > 0) || (p.text && p.text.trim().length > 0)
      );

      if (!hasAnyText) {
        Alert.alert(
          t.tools.noTextTitle,
          ocrService.available ? t.tools.noTextIpaMessage : t.tools.noTextExpoGoMessage
        );
        return;
      }

      const docxUri = await exportService.generateDocxFromPages(
        docTitle,
        pages,
        t.export.docxEmptyPageNote
      );
      await exportService.shareDocument(docxUri, 'docx', t.export.shareTitle);
    } catch (err) {
      console.error('[ToolsScreen] PDF to Word conversion failed:', err);
      Alert.alert(t.common.error, t.tools.conversionFailed);
    } finally {
      if (pickedUri) {
        await storageService.deleteTempFile(pickedUri);
      }
      setBusyMode(null);
      setProgressText(null);
    }
  };

  const handleOpenScanPicker = async () => {
    if (busyMode !== null) return;
    await loadDocuments();
    if (documents.length === 0) {
      const fresh = await documentRepository.getAll();
      setDocuments(fresh);
      if (fresh.length === 0) {
        Alert.alert(t.tools.convertToWordTitle, t.tools.noDocumentsYet);
        return;
      }
    }
    setPickerVisible(true);
  };

  const handleSelectScanDocument = (doc: Document) => {
    pendingDocRef.current = doc;
    setPickerVisible(false);
  };

  const handleConvertScanDocument = async (doc: Document) => {
    if (busyMode !== null) return;
    setBusyMode('scan');
    setProgressText(t.tools.convertingScan);

    const resumeOcr = ocrService.hold();
    try {
      const full = await documentRepository.getById(doc.id);
      if (!full || full.pages.length === 0) {
        Alert.alert(t.common.error, t.common.notFound);
        return;
      }

      let recognizedPages = 0;
      const docxUri = await exportService.generateDocx(
        full.document.title,
        full.pages,
        {
          dpi: 200,
          quality: 'medium',
          onProgress: (current, total) => {
            setProgressText(formatString(t.export.progress, { current, total }));
          },
          textForPage: async (page) => {
            const lines = await ocrService.linesForWordExport(page);
            if (lines && lines.length > 0) recognizedPages++;
            return lines;
          },
        },
        t.export.docxEmptyPageNote
      );

      if (recognizedPages === 0 && !ocrService.available) {
        await exportService.discardExport(docxUri);
        Alert.alert(t.tools.noTextTitle, t.tools.noTextScanExpoGoMessage);
        return;
      }

      await exportService.shareDocument(docxUri, 'docx', t.export.shareTitle);
    } catch (err) {
      console.error('[ToolsScreen] Scan to Word conversion failed:', err);
      Alert.alert(t.common.error, t.tools.conversionFailed);
    } finally {
      resumeOcr();
      setBusyMode(null);
      setProgressText(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}
      >
        {/* Section: Convert to Word */}
        <Text style={[typography.subhead, styles.sectionHeader, { color: colors.textSecondary }]}>
          {t.tools.convertToWordSection}
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Feature Header */}
          <View style={styles.featureHeader}>
            <View style={[styles.featureIconBox, { backgroundColor: colors.primarySubdued }]}>
              <Icon name="doc.richtext" size={24} color={colors.primary} />
            </View>
            <View style={styles.featureHeaderText}>
              <Text style={[typography.title3, { color: colors.textPrimary }]}>
                {t.tools.convertToWordTitle}
              </Text>
              <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                {t.tools.convertToWordSubtitle}
              </Text>
            </View>
          </View>

          <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 12 }]}>
            {t.tools.convertToWordDescription}
          </Text>

          {/* Action 1: Pick external PDF */}
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={busyMode !== null}
            onPress={handleConvertPdfFile}
            style={[
              styles.actionButton,
              {
                backgroundColor: colors.primary,
                marginTop: 16,
                opacity: busyMode !== null && busyMode !== 'pdf' ? 0.5 : 1,
              },
            ]}
          >
            {busyMode === 'pdf' ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={[typography.bodyBold, { color: '#FFFFFF', marginLeft: 10 }]}>
                  {progressText ?? t.tools.convertingPdf}
                </Text>
              </View>
            ) : (
              <View style={styles.actionInner}>
                <View style={styles.actionLeft}>
                  <Icon name="folder" size={20} color="#FFFFFF" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodyBold, { color: '#FFFFFF' }]}>
                      {t.tools.pickPdfButton}
                    </Text>
                    <Text style={[typography.caption2, { color: 'rgba(255,255,255,0.82)', marginTop: 2 }]}>
                      {t.tools.pickPdfSubtitle}
                    </Text>
                  </View>
                </View>
                <Icon name="chevron.right" size={16} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          {/* Action 2: Pick existing ScanFlow document */}
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={busyMode !== null}
            onPress={handleOpenScanPicker}
            style={[
              styles.actionButton,
              {
                backgroundColor: colors.surfaceSubdued,
                borderColor: colors.borderLight,
                borderWidth: hairline,
                marginTop: 10,
                opacity: busyMode !== null && busyMode !== 'scan' ? 0.5 : 1,
              },
            ]}
          >
            {busyMode === 'scan' ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[typography.bodyBold, { color: colors.textPrimary, marginLeft: 10 }]}>
                  {progressText ?? t.tools.convertingScan}
                </Text>
              </View>
            ) : (
              <View style={styles.actionInner}>
                <View style={styles.actionLeft}>
                  <Icon name="doc.text" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                      {t.tools.pickScanButton}
                    </Text>
                    <Text style={[typography.caption2, { color: colors.textSecondary, marginTop: 2 }]}>
                      {t.tools.pickScanSubtitle}
                    </Text>
                  </View>
                </View>
                <Icon name="chevron.right" size={16} color={colors.textMuted} />
              </View>
            )}
          </TouchableOpacity>

          {/* Offline privacy badge */}
          <View style={[styles.privacyBadge, { backgroundColor: colors.surfaceSubdued, marginTop: 14 }]}>
            <Icon name="iphone" size={16} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={[typography.caption2, { color: colors.textSecondary, flex: 1 }]}>
              {t.tools.offlineNote}
            </Text>
          </View>
        </View>

        {/* Future tools info card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
              marginTop: spacing.lg,
              marginBottom: 40,
            },
          ]}
        >
          <View style={styles.featureHeader}>
            <View style={[styles.featureIconBox, { backgroundColor: colors.surfaceSubdued }]}>
              <Icon name="wrench.and.screwdriver" size={20} color={colors.textMuted} />
            </View>
            <View style={styles.featureHeaderText}>
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                {t.tools.comingTitle}
              </Text>
              <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                {t.tools.comingText}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Document Picker Modal for converting an existing ScanFlow document */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          pendingDocRef.current = null;
          setPickerVisible(false);
        }}
        onDismiss={() => {
          const selected = pendingDocRef.current;
          pendingDocRef.current = null;
          if (selected) {
            void handleConvertScanDocument(selected);
          }
        }}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
            <TouchableOpacity
              onPress={() => {
                pendingDocRef.current = null;
                setPickerVisible(false);
              }}
              style={styles.modalHeaderBtn}
            >
              <Text style={[typography.body, { color: colors.primary }]}>{t.common.cancel}</Text>
            </TouchableOpacity>
            <Text style={[typography.headline, styles.modalHeaderTitle, { color: colors.textPrimary }]}>
              {t.tools.selectDocumentTitle}
            </Text>
            <View style={styles.modalHeaderBtn} />
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.base }}>
            {documents.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                activeOpacity={0.75}
                onPress={() => handleSelectScanDocument(doc)}
                style={[
                  styles.docRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View style={[styles.docIconWrap, { backgroundColor: colors.primarySubdued }]}>
                  <Icon name="doc.text" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text
                    numberOfLines={1}
                    style={[typography.bodyBold, { color: colors.textPrimary }]}
                  >
                    {doc.title}
                  </Text>
                  <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                    {doc.pageCount} {doc.pageCount === 1 ? t.common.page : t.common.pages}
                  </Text>
                </View>
                <Icon name="square.and.arrow.up" size={18} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const CARD_RADIUS = radius.lg;
const CARD_PADDING = 14;
const NESTED_RADIUS = concentric(CARD_RADIUS, CARD_PADDING);
const DOC_ROW_RADIUS = radius.md;
const DOC_ROW_PADDING = 14;
const DOC_ICON_RADIUS = concentric(DOC_ROW_RADIUS, DOC_ROW_PADDING);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  sectionHeader: {
    marginBottom: 8,
    paddingLeft: 4,
    fontWeight: '500',
  },
  card: {
    ...corner(CARD_RADIUS),
    borderWidth: hairline,
    padding: CARD_PADDING,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIconBox: {
    width: 44,
    height: 44,
    ...corner(NESTED_RADIUS),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureHeaderText: {
    flex: 1,
  },
  actionButton: {
    ...corner(NESTED_RADIUS),
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...corner(radius.sm),
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: hairline,
  },
  modalHeaderBtn: {
    width: 80,
    minHeight: 36,
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    flex: 1,
    textAlign: 'center',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: DOC_ROW_PADDING,
    marginBottom: 10,
    borderWidth: hairline,
    ...corner(DOC_ROW_RADIUS),
  },
  docIconWrap: {
    width: 38,
    height: 38,
    ...corner(DOC_ICON_RADIUS),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
});
