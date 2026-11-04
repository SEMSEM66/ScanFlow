import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { documentRepository, folderRepository, storageService } from '../../src/services';
import { filterService } from '../../src/services/FilterService';
import { exportService } from '../../src/services/ExportService';
import { Document, DocumentPage, FilterType, Folder, ExportFormat, ExportQuality } from '../../src/types';
import {
  FilterStrip,
  DocumentBottomBar,
  ExportModal,
  PageEditorModal,
  DocumentActionModal,
  MoveFolderModal,
  PromptModal,
  HeadlessFilterProcessor,
  FilterProcessorHandle,
} from '../../src/components';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function DocumentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t, formatString } = useTranslation();

  const processorRef = useRef<FilterProcessorHandle | null>(null);

  // Document & Pages state
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<Document | null>(null);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isProcessingFilter, setIsProcessingFilter] = useState(false);

  // Modals
  const [isExportVisible, setIsExportVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPageEditorVisible, setIsPageEditorVisible] = useState(false);
  const [isActionModalVisible, setIsActionModalVisible] = useState(false);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [promptState, setPromptState] = useState<{
    visible: boolean;
    title: string;
    initialValue: string;
    onConfirm: (val: string) => void;
  }>({
    visible: false,
    title: '',
    initialValue: '',
    onConfirm: () => {},
  });

  const loadDocumentData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await documentRepository.getById(id);
      if (!data) {
        Alert.alert(t.common.error, 'Dokument wurde nicht gefunden.');
        router.back();
        return;
      }
      setDocument(data.document);
      setPages(data.pages);
      if (currentPageIndex >= data.pages.length) {
        setCurrentPageIndex(Math.max(0, data.pages.length - 1));
      }
    } catch (err) {
      console.error('[DocumentDetailScreen] Error loading document:', err);
    } finally {
      setLoading(false);
    }
  }, [id, currentPageIndex]);

  useEffect(() => {
    loadDocumentData();
    folderRepository.getAll().then(setFolders);
  }, [loadDocumentData]);

  const currentPage = pages[currentPageIndex] || null;

  // Filter application handler
  const handleSelectFilter = async (newFilter: FilterType) => {
    if (!currentPage || isProcessingFilter || currentPage.filter === newFilter) return;

    try {
      setIsProcessingFilter(true);

      let updatedPreviewUri: string;
      if (newFilter === 'original') {
        updatedPreviewUri = currentPage.originalUri;
      } else {
        // Process image via headless canvas
        updatedPreviewUri = await processorRef.current?.applyFilter(currentPage.originalUri, newFilter) || currentPage.originalUri;
      }

      await documentRepository.updatePage(currentPage.id, {
        filter: newFilter,
        previewUri: updatedPreviewUri,
      });

      // Update local state
      setPages((prev) =>
        prev.map((p, idx) =>
          idx === currentPageIndex ? { ...p, filter: newFilter, previewUri: updatedPreviewUri } : p
        )
      );
    } catch (err) {
      console.error('[DocumentDetailScreen] Error applying filter:', err);
      Alert.alert(t.common.error, 'Filter konnte nicht angewendet werden.');
    } finally {
      setIsProcessingFilter(false);
    }
  };

  // Rotation handler
  const handleRotate = async () => {
    if (!currentPage || isProcessingFilter) return;

    try {
      setIsProcessingFilter(true);
      const newUri = await filterService.rotateImage(currentPage.previewUri);
      const newOrigUri = await filterService.rotateImage(currentPage.originalUri);
      const newRotation = (currentPage.rotation + 90) % 360;

      await documentRepository.updatePage(currentPage.id, {
        previewUri: newUri,
        rotation: newRotation,
      });

      setPages((prev) =>
        prev.map((p, idx) =>
          idx === currentPageIndex
            ? { ...p, previewUri: newUri, originalUri: newOrigUri, rotation: newRotation }
            : p
        )
      );
    } catch (err) {
      console.error('[DocumentDetailScreen] Rotation error:', err);
      Alert.alert(t.common.error, 'Drehen fehlgeschlagen.');
    } finally {
      setIsProcessingFilter(false);
    }
  };

  // Crop navigation
  const handleCrop = () => {
    if (!currentPage) return;
    router.push({
      pathname: '/crop',
      params: {
        pageId: currentPage.id,
        imageUri: currentPage.previewUri,
        documentId: id,
      },
    });
  };

  // Delete current page
  const handleDeleteCurrentPage = () => {
    if (pages.length <= 1) {
      Alert.alert(
        t.library.deleteDocument,
        'Dieses Dokument enthält nur eine Seite. Wenn Sie diese Seite löschen, wird das gesamte Dokument gelöscht.',
        [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.common.delete,
            style: 'destructive',
            onPress: async () => {
              if (document) {
                await documentRepository.delete(document.id);
                router.replace('/(tabs)');
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert(t.filters.deletePage, t.filters.deletePageConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          if (!currentPage || !document) return;
          await storageService.deleteFile(currentPage.originalUri);
          if (currentPage.previewUri !== currentPage.originalUri) {
            await storageService.deleteFile(currentPage.previewUri);
          }
          await loadDocumentData();
        },
      },
    ]);
  };

  // Add Page handler
  const handleAddPage = () => {
    Alert.alert('Seite hinzufügen', 'Wählen Sie die Quelle für die neue Seite:', [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: 'Aus Fotomediathek',
        onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.9,
          });
          if (!res.canceled && res.assets && res.assets.length > 0) {
            for (const asset of res.assets) {
              const savedUri = await storageService.saveImage(asset.uri, 'page_added');
              // Append to pages
              await documentRepository.create({
                title: document?.title || 'Scan',
                pages: [{ originalUri: savedUri }],
              });
            }
            loadDocumentData();
          }
        },
      },
      {
        text: 'Mit Kamera aufnehmen',
        onPress: () => {
          router.push('/scan');
        },
      },
    ]);
  };

  // Export & Share handler
  const handleShare = async (format: ExportFormat, quality: ExportQuality, watermark?: string) => {
    if (!document || pages.length === 0) return;

    try {
      setIsExporting(true);
      if (format === 'pdf') {
        const pageUris = pages.map((p) => p.previewUri);
        const pdfUri = await exportService.generatePdf(document.title, pageUris, quality, watermark);
        setIsExportVisible(false);
        await exportService.shareDocument(pdfUri, 'pdf');
      } else {
        // Share current page JPG
        setIsExportVisible(false);
        await exportService.shareDocument(currentPage?.previewUri || pages[0].previewUri, 'jpg');
      }
    } catch (err) {
      console.error('[DocumentDetailScreen] Share error:', err);
      Alert.alert(t.common.error, 'Exportieren fehlgeschlagen.');
    } finally {
      setIsExporting(false);
    }
  };

  if (loading || !document || !currentPage) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Headless Image Processor */}
      <HeadlessFilterProcessor ref={processorRef} />

      {/* Top Header matching Dokumente.png & Exportieren.png */}
      <View style={styles.topBar}>
        {/* Left: < Dokumente */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
          <Text style={[typography.headline, { color: colors.primary, marginLeft: -4 }]}>
            {t.library.title}
          </Text>
        </TouchableOpacity>

        {/* Center: Title */}
        <Text
          numberOfLines={1}
          style={[typography.headline, styles.navTitle, { color: colors.textPrimary }]}
        >
          {document.title}
        </Text>

        {/* Right Action Icons: Share & ... */}
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsExportVisible(true)}
            style={styles.headerCircleBtn}
          >
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsActionModalVisible(true)}
            style={styles.headerCircleBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Document Page Viewer matching Dokumente.png */}
      <View style={styles.pageViewerContainer}>
        {/* Centered Document Card */}
        <View
          style={[
            styles.documentCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
              borderRadius: borderRadius.lg,
              shadowColor: colors.shadowColor,
            },
          ]}
        >
          {isProcessingFilter ? (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 8 }]}>
                Filter wird angewendet...
              </Text>
            </View>
          ) : null}

          <Image
            source={{ uri: currentPage.previewUri }}
            style={styles.documentImage}
            resizeMode="contain"
          />
        </View>

        {/* Multi-Page Navigation Indicator (if pages > 1) */}
        {pages.length > 1 && (
          <View style={styles.paginationRow}>
            <TouchableOpacity
              disabled={currentPageIndex === 0}
              onPress={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
              style={[styles.arrowButton, { opacity: currentPageIndex === 0 ? 0.3 : 1 }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsPageEditorVisible(true)}>
              <Text style={[typography.footnote, { color: colors.textSecondary, fontWeight: '600' }]}>
                {currentPageIndex + 1} / {pages.length}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={currentPageIndex === pages.length - 1}
              onPress={() => setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
              style={[styles.arrowButton, { opacity: currentPageIndex === pages.length - 1 ? 0.3 : 1 }]}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Filter Selector Strip matching Dokumente.png */}
      <FilterStrip
        activeFilter={currentPage.filter}
        thumbnailUri={currentPage.originalUri}
        onSelectFilter={handleSelectFilter}
        disabled={isProcessingFilter}
      />

      {/* Bottom Action Bar matching Dokumente.png */}
      <DocumentBottomBar
        onRotate={handleRotate}
        onCrop={handleCrop}
        onDeletePage={handleDeleteCurrentPage}
        onAddPage={handleAddPage}
        disabled={isProcessingFilter}
      />

      {/* Export Modal matching Exportieren.png */}
      <ExportModal
        visible={isExportVisible}
        documentTitle={document.title}
        pageCount={pages.length}
        onClose={() => setIsExportVisible(false)}
        onShare={handleShare}
        isGenerating={isExporting}
      />

      {/* Page Editor & Reorder Modal (Step 5) */}
      <PageEditorModal
        visible={isPageEditorVisible}
        pages={pages}
        onClose={() => setIsPageEditorVisible(false)}
        onMovePage={(from, to) => {
          const newPages = [...pages];
          const [moved] = newPages.splice(from, 1);
          newPages.splice(to, 0, moved);
          setPages(newPages);
        }}
        onDeletePage={handleDeleteCurrentPage}
        onRetakePage={(idx) => {
          setIsPageEditorVisible(false);
          router.push('/scan');
        }}
        onAddPage={handleAddPage}
      />

      {/* Document Action Modal */}
      <DocumentActionModal
        visible={isActionModalVisible}
        document={document}
        onClose={() => setIsActionModalVisible(false)}
        onRename={() => {
          setPromptState({
            visible: true,
            title: t.library.renameDocument,
            initialValue: document.title,
            onConfirm: async (newTitle) => {
              await documentRepository.update(document.id, { title: newTitle });
              loadDocumentData();
            },
          });
        }}
        onMove={() => setIsMoveModalVisible(true)}
        onDuplicate={async () => {
          const dup = await documentRepository.duplicate(document.id);
          if (dup) {
            router.replace(`/document/${dup.id}` as any);
          }
        }}
        onDelete={async () => {
          await documentRepository.delete(document.id);
          router.replace('/(tabs)');
        }}
      />

      {/* Move Folder Modal */}
      <MoveFolderModal
        visible={isMoveModalVisible}
        document={document}
        folders={folders}
        onClose={() => setIsMoveModalVisible(false)}
        onSelectFolder={async (fId) => {
          await documentRepository.moveToFolder(document.id, fId);
          loadDocumentData();
        }}
      />

      {/* Prompt Modal for Renaming */}
      <PromptModal
        visible={promptState.visible}
        title={promptState.title}
        initialValue={promptState.initialValue}
        placeholder={t.library.documentNamePlaceholder}
        onClose={() => setPromptState((prev) => ({ ...prev, visible: false }))}
        onConfirm={promptState.onConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navTitle: {
    maxWidth: SCREEN_WIDTH * 0.45,
    textAlign: 'center',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageViewerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  documentCard: {
    width: SCREEN_WIDTH * 0.86,
    height: SCREEN_HEIGHT * 0.52,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentImage: {
    width: '100%',
    height: '100%',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
  },
  arrowButton: {
    padding: 6,
  },
});
