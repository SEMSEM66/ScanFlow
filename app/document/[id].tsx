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
  LayoutChangeEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import {
  documentRepository,
  folderRepository,
  exportService,
  imagePipeline,
  ensurePagePreview,
  importPages,
} from '../../src/services';
import {
  Adjustments,
  Document,
  DocumentPage,
  ExportDpi,
  FilterType,
  Folder,
  ExportFormat,
  ExportQuality,
} from '../../src/types';
import { FILTER_ORDER } from '../../src/imaging/filters';
import { nextRotation } from '../../src/imaging/pageState';
import {
  FilterStrip,
  DocumentBottomBar,
  ExportModal,
  PageEditorModal,
  DocumentActionModal,
  MoveFolderModal,
  PromptModal,
  AdjustmentsPanel,
} from '../../src/components';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const thumbKeyOf = (p: DocumentPage) =>
  `${p.id}|${p.originalUri}|${JSON.stringify(p.corners)}|${p.rotation}|${p.pageFormat}|${JSON.stringify(p.adjustments)}`;

export default function DocumentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { colors, typography, borderRadius } = useTheme();
  const { t, formatString } = useTranslation();

  // Document & Pages state
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<Document | null>(null);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [thumbState, setThumbState] = useState<{ key: string; map: Partial<Record<FilterType, string>> }>({ key: '', map: {} });
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [aspect, setAspect] = useState(1 / Math.SQRT2);

  // Modals
  const [isExportVisible, setIsExportVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isPageEditorVisible, setIsPageEditorVisible] = useState(false);
  const [isActionModalVisible, setIsActionModalVisible] = useState(false);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [isAdjustVisible, setIsAdjustVisible] = useState(false);
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

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      imagePipeline.releaseMemory();
    };
  }, []);

  const replacePage = useCallback((page: DocumentPage) => {
    if (!mounted.current) return;
    setPages((prev) => prev.map((p) => (p.id === page.id ? page : p)));
  }, []);

  const loadDocumentData = useCallback(async () => {
    if (!id) return;
    try {
      const data = await documentRepository.getById(id);
      if (!data) {
        Alert.alert(t.common.error, t.common.notFound);
        router.back();
        return;
      }
      if (!mounted.current) return;
      setDocument(data.document);
      setPages(data.pages);
      setCurrentPageIndex((idx) => Math.min(idx, Math.max(0, data.pages.length - 1)));
    } catch (err) {
      console.error('[DocumentDetailScreen] Error loading document:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id, router, t]);

  // Reload whenever the screen gets focus (e.g. back from crop / scan)
  useFocusEffect(
    useCallback(() => {
      loadDocumentData();
      folderRepository.getAll().then(setFolders);
    }, [loadDocumentData])
  );

  const currentPage = pages[currentPageIndex] || null;
  const previewKey = currentPage ? imagePipeline.previewKey(currentPage) : null;
  const isPreviewCurrent = !!currentPage && currentPage.renderKey === previewKey && currentPage.previewUri !== currentPage.originalUri;

  // Render the current page preview + filter thumbnails, then the other pages in the background.
  useEffect(() => {
    if (!currentPage) return;
    let cancelled = false;
    (async () => {
      try {
        if (!isPreviewCurrent) {
          setIsRendering(true);
          const updated = await ensurePagePreview(currentPage.id);
          if (!cancelled && updated) replacePage(updated);
        }
      } catch (err) {
        console.error('[DocumentDetailScreen] render error', err);
        if (!cancelled) Alert.alert(t.common.error, t.filters.renderFailed);
      } finally {
        if (!cancelled && mounted.current) setIsRendering(false);
      }
      try {
        const page = (await documentRepository.getPage(currentPage.id)) ?? currentPage;
        const th = await imagePipeline.renderThumbnails(page, FILTER_ORDER);
        if (!cancelled && mounted.current) setThumbState({ key: thumbKeyOf(page), map: th });
      } catch (err) {
        console.warn('[DocumentDetailScreen] thumbnails failed', err);
      }
      // background: keep the other previews (page list, library thumbnail) up to date
      for (const p of pages) {
        if (cancelled) break;
        if (p.id === currentPage.id || p.renderKey === imagePipeline.previewKey(p)) continue;
        try {
          const updated = await ensurePagePreview(p.id);
          if (!cancelled && updated) replacePage(updated);
        } catch {
          // shown again when the page is opened
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage?.id, previewKey, pages.length]);

  // Thumbnails belong to one page geometry / adjustment state
  const thumbKey = currentPage ? thumbKeyOf(currentPage) : '';
  const thumbnails = thumbState.key === thumbKey ? thumbState.map : {};

  const updateCurrent = async (patch: Partial<Pick<DocumentPage, 'filter' | 'rotation' | 'adjustments'>>) => {
    if (!currentPage) return;
    const next = { ...currentPage, ...patch };
    replacePage(next);
    await documentRepository.updatePage(currentPage.id, patch);
  };

  const handleSelectFilter = async (newFilter: FilterType) => {
    if (!currentPage || currentPage.filter === newFilter) return;
    try {
      await updateCurrent({ filter: newFilter });
    } catch (err) {
      console.error('[DocumentDetailScreen] Error applying filter:', err);
      Alert.alert(t.common.error, t.filters.filterFailed);
    }
  };

  // Non-destructive rotation (stored, applied at render time)
  const handleRotate = async () => {
    if (!currentPage) return;
    try {
      await updateCurrent({ rotation: nextRotation(currentPage.rotation) });
    } catch (err) {
      console.error('[DocumentDetailScreen] Rotation error:', err);
      Alert.alert(t.common.error, t.filters.rotateFailed);
    }
  };

  const handleAdjust = async (adj: Adjustments) => {
    try {
      await updateCurrent({ adjustments: adj });
    } catch (err) {
      console.error('[DocumentDetailScreen] Adjust error:', err);
      Alert.alert(t.common.error, t.filters.filterFailed);
    }
  };

  const handleApplyToAll = async () => {
    if (!currentPage || !document) return;
    await documentRepository.updateAllPages(document.id, {
      filter: currentPage.filter,
      adjustments: currentPage.adjustments,
    });
    await loadDocumentData();
    Alert.alert(t.filters.applyToAll, t.filters.appliedToAll);
  };

  const handleCrop = () => {
    if (!currentPage) return;
    router.push({ pathname: '/crop', params: { pageId: currentPage.id, documentId: id } });
  };

  const deletePageAt = (index: number) => {
    const page = pages[index];
    if (!page || !document) return;
    if (pages.length <= 1) {
      Alert.alert(t.library.deleteDocument, t.filters.deleteLastPage, [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            await documentRepository.delete(document.id);
            router.replace('/(tabs)');
          },
        },
      ]);
      return;
    }
    Alert.alert(t.filters.deletePage, t.filters.deletePageConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          await documentRepository.deletePage(page.id);
          // keep showing the same page if a page before it was deleted (index is clamped on reload)
          setCurrentPageIndex((i) => (index < i ? i - 1 : i));
          await loadDocumentData();
        },
      },
    ]);
  };

  const handleAddPage = () => {
    Alert.alert(t.filters.addPage, t.filters.addPageSource, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.filters.fromLibrary,
        onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 1,
            exif: false,
          });
          if (res.canceled || !res.assets?.length || !document) return;
          try {
            setIsBusy(true);
            const newPages = await importPages(
              res.assets.map((a) => a.uri),
              (current, total) => setBusyText(formatString(t.scan.processing, { current, total }))
            );
            await documentRepository.addPages(document.id, newPages);
            await loadDocumentData();
            setCurrentPageIndex(pages.length);
          } catch (err) {
            console.error('[DocumentDetailScreen] add page error', err);
            Alert.alert(t.common.error, t.scan.importFailed);
          } finally {
            setIsBusy(false);
            setBusyText(null);
          }
        },
      },
      {
        text: t.filters.fromCamera,
        onPress: () => router.push({ pathname: '/scan', params: { documentId: id } }),
      },
    ]);
  };

  const handleMovePage = async (from: number, to: number) => {
    if (!document || to < 0 || to >= pages.length) return;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPages(next.map((p, i) => ({ ...p, pageNumber: i + 1 })));
    if (currentPage) setCurrentPageIndex(next.findIndex((p) => p.id === currentPage.id));
    await documentRepository.reorderPages(document.id, next.map((p) => p.id));
  };

  const handleShare = async (format: ExportFormat, quality: ExportQuality, dpi: ExportDpi, watermark?: string) => {
    if (!document || pages.length === 0) return;
    try {
      setIsExporting(true);
      setExportProgress({ current: 0, total: format === 'pdf' ? pages.length : 1 });
      const onProgress = (current: number, total: number) => setExportProgress({ current, total });
      const uri =
        format === 'pdf'
          ? await exportService.generatePdf(document.title, pages, { dpi, quality, watermark, onProgress })
          : await exportService.generateJpg(document.title, currentPage ?? pages[0], currentPageIndex, { dpi, quality, onProgress });
      setIsExportVisible(false);
      await exportService.shareDocument(uri, format, t.export.shareTitle);
    } catch (err) {
      console.error('[DocumentDetailScreen] Share error:', err);
      Alert.alert(t.common.error, t.export.failed);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const onAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ w: width, h: height });
  };

  if (loading || !document || !currentPage) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Page card with the exact page aspect ratio (same as in the exported PDF)
  const cardSize = area
    ? (() => {
        const w = Math.min(area.w, area.h * aspect);
        return { width: w, height: w / aspect };
      })()
    : { width: SCREEN_WIDTH * 0.8, height: (SCREEN_WIDTH * 0.8) / aspect };
  const showUri = isPreviewCurrent || currentPage.previewUri !== currentPage.originalUri ? currentPage.previewUri : null;
  const busy = isBusy || isExporting;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Top Header matching Dokumente.png & Exportieren.png */}
      <View style={styles.topBar}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
          <Text style={[typography.headline, { color: colors.primary, marginLeft: -4 }]}>{t.library.title}</Text>
        </TouchableOpacity>

        <Text numberOfLines={1} style={[typography.headline, styles.navTitle, { color: colors.textPrimary }]}>
          {document.title}
        </Text>

        <View style={styles.headerRightActions}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setIsExportVisible(true)} style={styles.headerCircleBtn}>
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setIsActionModalVisible(true)} style={styles.headerCircleBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Page viewer */}
      <View style={styles.pageViewerContainer}>
        <View style={styles.pageArea} onLayout={onAreaLayout}>
          <View
            style={[
              styles.documentCard,
              cardSize,
              {
                backgroundColor: '#FFFFFF',
                borderColor: colors.cardBorder,
                borderRadius: borderRadius.sm,
                shadowColor: colors.shadowColor,
              },
            ]}
          >
            {showUri ? (
              <Image
                key={showUri}
                source={{ uri: showUri }}
                style={styles.documentImage}
                resizeMode="stretch"
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source;
                  if (width > 0 && height > 0) setAspect(width / height);
                }}
              />
            ) : null}
            {isRendering || busy || !showUri ? (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 8 }]}>
                  {busyText ?? t.filters.rendering}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

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

      {/* Filter strip with rendered thumbnails */}
      <FilterStrip
        activeFilter={currentPage.filter}
        thumbnails={thumbnails}
        fallbackUri={currentPage.proxyUri ?? currentPage.originalUri}
        onSelectFilter={handleSelectFilter}
        disabled={busy}
      />

      <DocumentBottomBar
        onRotate={handleRotate}
        onCrop={handleCrop}
        onAdjust={() => setIsAdjustVisible(true)}
        onDeletePage={() => deletePageAt(currentPageIndex)}
        onAddPage={handleAddPage}
        disabled={busy}
      />

      <AdjustmentsPanel
        visible={isAdjustVisible}
        value={currentPage.adjustments}
        onChange={handleAdjust}
        onApplyToAll={handleApplyToAll}
        onClose={() => setIsAdjustVisible(false)}
        busy={busy}
      />

      <ExportModal
        visible={isExportVisible}
        documentTitle={document.title}
        pageCount={pages.length}
        onClose={() => setIsExportVisible(false)}
        onShare={handleShare}
        isGenerating={isExporting}
        progress={exportProgress}
      />

      <PageEditorModal
        visible={isPageEditorVisible}
        pages={pages}
        onClose={() => setIsPageEditorVisible(false)}
        onMovePage={handleMovePage}
        onDeletePage={deletePageAt}
        onRetakePage={(idx) => {
          setIsPageEditorVisible(false);
          const page = pages[idx];
          if (page) router.push({ pathname: '/scan', params: { documentId: id, replacePageId: page.id } });
        }}
        onAddPage={handleAddPage}
      />

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
          const dup = await documentRepository.duplicate(document.id, t.common.copySuffix);
          if (dup) router.replace(`/document/${dup.id}` as never);
        }}
        onDelete={async () => {
          await documentRepository.delete(document.id);
          router.replace('/(tabs)');
        }}
      />

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
  pageArea: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentCard: {
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
