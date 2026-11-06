import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../../src/components/ui/Icon';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { capsule, corner, hairline, radius, useTheme } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n';
import {
  folderRepository,
  documentRepository,
  ocrService,
  pageTextRepository,
  pdfToolkitService,
  exportService,
} from '../../../src/services';
import { snippetTerm } from '../../../src/db/textSearch';
import type { Snippet } from '../../../src/ocr/text';
import { Folder, Document, SortOption } from '../../../src/types';
import {
  DocumentCard,
  DocumentActionModal,
  PromptModal,
  FolderOptionsModal,
  useScanner,
  Button,
  Chip,
} from '../../../src/components';

export default function LibraryScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t, formatString } = useTranslation();
  const router = useRouter();
  const scanner = useScanner();

  // Data State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  // Text excerpts of the search hits (recognized text), by document id
  const [snippets, setSnippets] = useState<Map<string, Snippet>>(new Map());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const isSearching = searchQuery.trim().length > 0;

  // Modals State
  const [activeDocForAction, setActiveDocForAction] = useState<Document | null>(null);
  const [activeFolderForOptions, setActiveFolderForOptions] = useState<Folder | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toolkitBusyText, setToolkitBusyText] = useState<string | null>(null);
  const [promptState, setPromptState] = useState<{
    visible: boolean;
    title: string;
    initialValue: string;
    placeholder: string;
    onConfirm: (val: string) => void;
  }>({
    visible: false,
    title: '',
    initialValue: '',
    placeholder: '',
    onConfirm: () => {},
  });

  // Every keystroke starts a load – only the newest one may update the list
  const loadSeq = useRef(0);

  const loadData = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const query = searchQuery.trim();
      const [fetchedFolders, fetchedDocs] = await Promise.all([
        folderRepository.getAll(),
        documentRepository.getAll({
          folderId: selectedFolderId,
          searchQuery: query.length > 0 ? query : undefined,
          sortBy,
        }),
      ]);
      const term = snippetTerm(query);
      let found = new Map<string, Snippet>();
      if (term.length > 0 && fetchedDocs.length > 0) {
        try {
          found = await pageTextRepository.snippets(
            fetchedDocs.map((d) => d.id),
            term
          );
        } catch (err) {
          console.warn('[LibraryScreen] Could not load text excerpts:', err);
        }
      }
      if (seq !== loadSeq.current) return; // a newer search is already running
      setFolders(fetchedFolders);
      setDocuments(fetchedDocs);
      setSnippets(found);
    } catch (err) {
      console.error('[LibraryScreen] Error loading data from SQLite:', err);
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedFolderId, searchQuery, sortBy]);

  // Reload on focus: new scans, renamed documents and re-rendered thumbnails;
  // pages without text are recognized in the background
  useFocusEffect(
    useCallback(() => {
      loadData();
      ocrService.kick();
    }, [loadData])
  );

  // While searching: show hits as soon as the text of a new page is recognized
  useFocusEffect(
    useCallback(() => {
      if (!isSearching) return undefined;
      return ocrService.subscribe((e) => {
        if (e.type === 'page' && e.ok) loadData();
      });
    }, [isSearching, loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Folder Management Handlers
  const handleOpenCreateFolder = () => {
    setPromptState({
      visible: true,
      title: t.library.newFolder,
      initialValue: '',
      placeholder: t.library.folderNamePlaceholder,
      onConfirm: async (name: string) => {
        try {
          const newFolder = await folderRepository.create(name);
          await loadData();
          setSelectedFolderId(newFolder.id);
        } catch {
          Alert.alert(t.common.error, t.library.createFolderFailed);
        }
      },
    });
  };

  const handleRenameFolder = (folder: Folder) => {
    setPromptState({
      visible: true,
      title: t.common.edit,
      initialValue: folder.name,
      placeholder: t.library.folderNamePlaceholder,
      onConfirm: async (newName: string) => {
        try {
          await folderRepository.rename(folder.id, newName);
          loadData();
        } catch {
          Alert.alert(t.common.error, t.library.renameFolderFailed);
        }
      },
    });
  };

  const handleDeleteFolder = (folder: Folder) => {
    Alert.alert(
      t.library.deleteFolder,
      t.library.deleteFolderConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await folderRepository.delete(folder.id);
              if (selectedFolderId === folder.id) {
                setSelectedFolderId(null);
              }
              loadData();
            } catch {
              Alert.alert(t.common.error, t.library.deleteFolderFailed);
            }
          },
        },
      ]
    );
  };

  // Document Management Handlers
  const handleRenameDocument = (doc: Document) => {
    setPromptState({
      visible: true,
      title: t.library.renameDocument,
      initialValue: doc.title,
      placeholder: t.library.documentNamePlaceholder,
      onConfirm: async (newTitle: string) => {
        try {
          await documentRepository.update(doc.id, { title: newTitle });
          loadData();
        } catch {
          Alert.alert(t.common.error, t.library.renameDocumentFailed);
        }
      },
    });
  };

  const handleDuplicateDocument = async (doc: Document) => {
    try {
      await documentRepository.duplicate(doc.id, t.common.copySuffix);
      loadData();
    } catch {
      Alert.alert(t.common.error, t.library.duplicateDocumentFailed);
    }
  };

  const handleDeleteDocument = (doc: Document) => {
    Alert.alert(
      t.library.deleteDocument,
      t.library.deleteConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await documentRepository.delete(doc.id);
              loadData();
            } catch {
              Alert.alert(t.common.error, t.library.deleteDocumentFailed);
            }
          },
        },
      ]
    );
  };

  // Multi-select & PDF/Files Import Handlers
  const toggleSelectDocument = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const handleImportFiles = async () => {
    if (toolkitBusyText !== null || scanner.busy) return;
    const now = new Date();
    const defaultTitle = formatString(t.scan.documentTitle, {
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    const outcome = await pdfToolkitService.pickAndImportFiles({
      defaultTitle,
      onProgress: (current: number, total: number) => {
        setToolkitBusyText(formatString(t.scan.processing, { current, total }));
      },
    });
    setToolkitBusyText(null);
    if (outcome.status === 'saved') {
      if (selectedFolderId !== null) {
        await documentRepository.moveToFolder(outcome.documentId, selectedFolderId);
      }
      await loadData();
      router.push(`/document/${outcome.documentId}` as any);
    } else if (outcome.status === 'unavailable') {
      Alert.alert(t.library.importPdfUnavailableTitle, t.library.importPdfUnavailableMessage);
    } else if (outcome.status === 'locked') {
      Alert.alert(t.library.importPdfLockedTitle, t.library.importPdfLockedMessage);
    } else if (outcome.status === 'failed') {
      Alert.alert(t.common.error, t.library.importPdfFailed);
    }
  };

  const orderedSelectedIds = documents.filter((d) => selectedIds.has(d.id)).map((d) => d.id);

  const handleBatchMove = () => {
    if (orderedSelectedIds.length === 0) return;
    const idsParam = orderedSelectedIds.join(',');
    exitSelectMode();
    router.push({ pathname: '/sheets/move', params: { documentIds: idsParam } });
  };

  const handleBatchMerge = () => {
    if (orderedSelectedIds.length < 2) {
      Alert.alert(t.library.mergeConfirmTitle, t.library.mergeNeedTwo);
      return;
    }
    Alert.alert(
      t.library.mergeConfirmTitle,
      formatString(t.library.mergeConfirmMessage, { count: orderedSelectedIds.length }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.library.mergeSelected,
          onPress: async () => {
            try {
              const ids = [...orderedSelectedIds];
              const mergedTitle = formatString(t.library.mergeDefaultTitle, {
                date: new Date().toLocaleDateString(),
              });
              exitSelectMode();
              await documentRepository.mergeDocuments(ids, mergedTitle, selectedFolderId);
              await loadData();
            } catch {
              Alert.alert(t.common.error, t.library.mergeFailed);
            }
          },
        },
      ]
    );
  };

  const handleBatchExport = async () => {
    if (orderedSelectedIds.length === 0 || toolkitBusyText !== null) return;
    if (orderedSelectedIds.length === 1) {
      const singleId = orderedSelectedIds[0];
      exitSelectMode();
      router.push({ pathname: '/sheets/export', params: { documentId: singleId } });
      return;
    }
    const ids = [...orderedSelectedIds];
    setToolkitBusyText(formatString(t.library.batchExporting, { current: 1, total: ids.length }));
    const resumeOcr = ocrService.hold();
    try {
      const loadedItems: { title: string; pages: import('../../../src/types').DocumentPage[] }[] = [];
      for (const id of ids) {
        const docWithPages = await documentRepository.getById(id);
        if (docWithPages && docWithPages.pages.length > 0) {
          loadedItems.push({ title: docWithPages.document.title, pages: docWithPages.pages });
        }
      }
      if (loadedItems.length === 0) {
        Alert.alert(t.common.error, t.library.batchExportFailed);
        return;
      }
      const zipUri = await exportService.generateBatchZip(loadedItems, {
        dpi: 200,
        quality: 'medium',
        textForPage: ocrService.available ? (p) => ocrService.linesForExport(p) : undefined,
        onProgress: (current: number, total: number) => {
          setToolkitBusyText(formatString(t.library.batchExporting, { current, total }));
        },
      });
      await exportService.shareDocument(zipUri, 'zip', t.export.shareTitle);
      exitSelectMode();
    } catch {
      Alert.alert(t.common.error, t.library.batchExportFailed);
    } finally {
      resumeOcr();
      setToolkitBusyText(null);
    }
  };

  const handleBatchDelete = () => {
    if (orderedSelectedIds.length === 0) return;
    Alert.alert(
      formatString(t.library.batchDeleteTitle, { count: orderedSelectedIds.length }),
      formatString(t.library.batchDeleteConfirm, { count: orderedSelectedIds.length }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              const ids = [...orderedSelectedIds];
              exitSelectMode();
              await documentRepository.deleteMany(ids);
              await loadData();
            } catch {
              Alert.alert(t.common.error, t.library.deleteDocumentFailed);
            }
          },
        },
      ]
    );
  };

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <Stack.Screen options={{
        headerSearchBarOptions: {
          placeholder: ocrService.available ? t.library.searchPlaceholderText : t.library.searchPlaceholder,
          onChangeText: (event) => setSearchQuery(event.nativeEvent.text),
          onCancelButtonPress: () => setSearchQuery(''),
          hideWhenScrolling: false,
          autoCapitalize: 'none',
        },
      }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="photo.on.rectangle" accessibilityLabel={t.scan.importPhotos} disabled={scanner.busy || toolkitBusyText !== null} onPress={() => void scanner.importFromLibrary()} />
        <Stack.Toolbar.Menu icon="ellipsis.circle" accessibilityLabel={t.library.options}>
          <Stack.Toolbar.MenuAction icon="doc.badge.plus" onPress={() => void handleImportFiles()}>{t.library.importFiles}</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="checkmark.circle" onPress={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}>
            {selectMode ? t.common.done : t.library.select}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="magnifyingglass" onPress={() => router.push('/search')}>{t.search.title}</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.Menu title={t.library.sort} icon="arrow.up.arrow.down">
            {([
              ['date_desc', t.library.sortDateDesc], ['date_asc', t.library.sortDateAsc],
              ['title_asc', t.library.sortTitleAsc], ['title_desc', t.library.sortTitleDesc],
            ] as [SortOption, string][]).map(([id, label]) => (
              <Stack.Toolbar.MenuAction key={id} isOn={sortBy === id} onPress={() => setSortBy(id)}>{label}</Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      {toolkitBusyText ? (
        <View style={[styles.busyBanner, { backgroundColor: colors.primarySubdued, borderBottomColor: colors.borderLight }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[typography.footnote, { color: colors.textPrimary, fontWeight: '600', marginLeft: 10 }]}>
            {toolkitBusyText}
          </Text>
        </View>
      ) : null}
      <FlatList
        data={loading && !refreshing ? [] : documents}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.listContainer,
          { paddingHorizontal: spacing.base, paddingBottom: selectMode ? 140 : spacing.hero, flexGrow: 1 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            {selectMode ? (
              <View style={[styles.selectionHeader, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Text style={[typography.subhead, { color: colors.textPrimary, fontWeight: '600', flex: 1 }]}>
                  {formatString(t.library.selectedCount, { count: selectedIds.size })}
                </Text>
                {documents.length > 0 ? (
                  <TouchableOpacity onPress={handleToggleSelectAll} style={styles.selectionHeaderBtn}>
                    <Text style={[typography.subhead, { color: colors.primary }]}>
                      {selectedIds.size === documents.length ? t.library.deselectAll : t.library.selectAll}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={exitSelectMode} style={[styles.selectionHeaderBtn, { marginLeft: 12 }]}>
                  <Text style={[typography.subhead, { color: colors.primary, fontWeight: '600' }]}>
                    {t.common.done}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
              <Chip label={t.common.all} selected={selectedFolderId === null} onPress={() => setSelectedFolderId(null)} />
              {folders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                return (
                  <Chip
                    key={folder.id}
                    label={folder.name}
                    selected={isSelected}
                    onPress={() => {
                      if (isSelected) {
                        setActiveFolderForOptions(folder);
                      } else {
                        setSelectedFolderId(folder.id);
                      }
                    }}
                    onLongPress={() => setActiveFolderForOptions(folder)}
                  />
                );
              })}
              <Chip icon="plus" label={t.library.newFolder} tint={colors.primary} onPress={handleOpenCreateFolder} />
            </ScrollView>
          </View>
        }
        ListEmptyComponent={loading && !refreshing ? (
          <View style={styles.centerContainer}><ActivityIndicator size="small" color={colors.primary} /></View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSubdued }]}>
              <Icon name={selectedFolder && !isSearching ? 'folder' : 'doc.text'} size={48} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, typography.title2, { color: colors.textPrimary, marginTop: spacing.base }]}>
              {isSearching
                ? t.common.noItems
                : selectedFolder
                  ? formatString(t.library.emptyFolderTitle, { folder: selectedFolder.name })
                  : t.library.emptyTitle}
            </Text>
            <Text style={[styles.emptySubtitle, typography.body, { color: colors.textSecondary, marginTop: spacing.xs, marginHorizontal: spacing.xl }]}>
              {isSearching ? t.library.noResultsHint : t.library.emptySubtitle}
            </Text>
            {!isSearching && <Button icon="camera" title={t.library.startScan} onPress={() => scanner.scan()} disabled={scanner.busy} style={{ marginTop: spacing.xl }} />}
            {!isSearching && <Button variant="plain" size="medium" icon="photo.on.rectangle" title={t.scan.importPhotos} onPress={() => scanner.importFromLibrary()} disabled={scanner.busy} style={{ marginTop: spacing.md }} />}
            {!isSearching && <Button variant="plain" size="medium" icon="doc.badge.plus" title={t.library.importFiles} onPress={() => void handleImportFiles()} disabled={scanner.busy || toolkitBusyText !== null} style={{ marginTop: spacing.xs }} />}
            {!isSearching && selectedFolder ? (
              <View style={styles.emptyFolderActions}>
                <Button
                  variant="tinted"
                  size="medium"
                  icon="ellipsis.circle"
                  title={t.library.manageFolder}
                  onPress={() => setActiveFolderForOptions(selectedFolder)}
                />
                <Button
                  variant="plain"
                  size="medium"
                  title={t.library.showAllDocuments}
                  onPress={() => setSelectedFolderId(null)}
                />
              </View>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <DocumentCard
            document={item}
            snippet={isSearching ? snippets.get(item.id) ?? null : null}
            selectMode={selectMode}
            selected={selectedIds.has(item.id)}
            onPress={() => {
              if (selectMode) {
                toggleSelectDocument(item.id);
              } else {
                router.push(`/document/${item.id}` as any);
              }
            }}
            onMenuPress={() => {
              if (selectMode) {
                toggleSelectDocument(item.id);
              } else {
                setActiveDocForAction(item);
              }
            }}
          />
        )}
      />

      {/* Multi-select bottom action bar */}
      {selectMode && selectedIds.size > 0 ? (
        <View style={[styles.batchBar, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBatchMove}
            style={styles.batchActionBtn}
            accessibilityRole="button"
          >
            <Icon name="folder" size={20} color={colors.primary} />
            <Text numberOfLines={1} style={[typography.caption2, { color: colors.textPrimary, marginTop: 4 }]}>
              {t.library.moveToFolder}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBatchMerge}
            disabled={selectedIds.size < 2}
            style={[styles.batchActionBtn, selectedIds.size < 2 && { opacity: 0.4 }]}
            accessibilityRole="button"
          >
            <Icon name="doc.on.doc" size={20} color={colors.primary} />
            <Text numberOfLines={1} style={[typography.caption2, { color: colors.textPrimary, marginTop: 4 }]}>
              {t.library.mergeSelected}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => void handleBatchExport()}
            disabled={toolkitBusyText !== null}
            style={styles.batchActionBtn}
            accessibilityRole="button"
          >
            <Icon name="square.and.arrow.up" size={20} color={colors.primary} />
            <Text numberOfLines={1} style={[typography.caption2, { color: colors.textPrimary, marginTop: 4 }]}>
              {t.common.share}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBatchDelete}
            style={styles.batchActionBtn}
            accessibilityRole="button"
          >
            <Icon name="trash" size={20} color={colors.danger} />
            <Text numberOfLines={1} style={[typography.caption2, { color: colors.danger, marginTop: 4 }]}>
              {t.common.delete}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Document Action Modal – runs the chosen action once the menu is gone */}
      <DocumentActionModal
        visible={activeDocForAction !== null}
        document={activeDocForAction}
        onClose={() => setActiveDocForAction(null)}
        onRename={(doc) => handleRenameDocument(doc)}
        onMove={(doc) => router.push({ pathname: '/sheets/move', params: { documentId: doc.id } })}
        onDuplicate={(doc) => handleDuplicateDocument(doc)}
        onDelete={(doc) => handleDeleteDocument(doc)}
        onShowText={ocrService.available ? (doc) => router.push({ pathname: '/sheets/text', params: { documentId: doc.id, title: doc.title } }) : undefined}
      />

      {/* Folder Options Modal (Rename/Delete folder) */}
      <FolderOptionsModal
        visible={activeFolderForOptions !== null}
        folder={activeFolderForOptions}
        onClose={() => setActiveFolderForOptions(null)}
        onRename={handleRenameFolder}
        onDelete={handleDeleteFolder}
      />

      {/* Generic Prompt Modal for Name input */}
      <PromptModal
        visible={promptState.visible}
        title={promptState.title}
        initialValue={promptState.initialValue}
        placeholder={promptState.placeholder}
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
  pillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnWrapper: {
    gap: 12,
  },
  listContainer: {
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    ...capsule(88),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyFolderActions: {
    marginTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  busyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: hairline,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: hairline,
    ...corner(radius.md),
  },
  selectionHeaderBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  batchBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: hairline,
    ...corner(radius.lg),
  },
  batchActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
});
