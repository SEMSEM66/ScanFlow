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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../../src/components/ui/Icon';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { capsule, useTheme } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n';
import { folderRepository, documentRepository, ocrService, pageTextRepository } from '../../../src/services';
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
  const { t } = useTranslation();
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
        } catch (err) {
          Alert.alert(t.common.error, 'Ordner konnte nicht erstellt werden.');
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
        } catch (err) {
          Alert.alert(t.common.error, 'Ordner konnte nicht umbenannt werden.');
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
            } catch (err) {
              Alert.alert(t.common.error, 'Ordner konnte nicht gelöscht werden.');
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
        } catch (err) {
          Alert.alert(t.common.error, 'Dokument konnte nicht umbenannt werden.');
        }
      },
    });
  };

  const handleDuplicateDocument = async (doc: Document) => {
    try {
      await documentRepository.duplicate(doc.id, t.common.copySuffix);
      loadData();
    } catch (err) {
      Alert.alert(t.common.error, 'Dokument konnte nicht dupliziert werden.');
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
            } catch (err) {
              Alert.alert(t.common.error, 'Dokument konnte nicht gelöscht werden.');
            }
          },
        },
      ]
    );
  };

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
        <Stack.Toolbar.Button icon="photo.on.rectangle" accessibilityLabel={t.scan.importPhotos} disabled={scanner.busy} onPress={() => void scanner.importFromLibrary()} />
        <Stack.Toolbar.Menu icon="ellipsis.circle" accessibilityLabel={t.library.options}>
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
      <FlatList
        data={loading && !refreshing ? [] : documents}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.listContainer, { paddingHorizontal: spacing.base, paddingBottom: spacing.hero, flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
            <Chip label={t.common.all} selected={selectedFolderId === null} onPress={() => setSelectedFolderId(null)} />
            {folders.map((folder) => (
              <Chip key={folder.id} label={folder.name} selected={selectedFolderId === folder.id}
                onPress={() => setSelectedFolderId(folder.id)} onLongPress={() => setActiveFolderForOptions(folder)} />
            ))}
            <Chip icon="plus" label={t.library.newFolder} tint={colors.primary} onPress={handleOpenCreateFolder} />
          </ScrollView>
        }
        ListEmptyComponent={loading && !refreshing ? (
          <View style={styles.centerContainer}><ActivityIndicator size="small" color={colors.primary} /></View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSubdued }]}>
              <Icon name="doc.text" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, typography.title2, { color: colors.textPrimary, marginTop: spacing.base }]}>{isSearching ? t.common.noItems : t.library.emptyTitle}</Text>
            <Text style={[styles.emptySubtitle, typography.body, { color: colors.textSecondary, marginTop: spacing.xs, marginHorizontal: spacing.xl }]}>{isSearching ? t.library.noResultsHint : t.library.emptySubtitle}</Text>
            {!isSearching && <Button icon="camera" title={t.library.startScan} onPress={() => scanner.scan()} disabled={scanner.busy} style={{ marginTop: spacing.xl }} />}
            {!isSearching && <Button variant="plain" size="medium" icon="photo.on.rectangle" title={t.scan.importPhotos} onPress={() => scanner.importFromLibrary()} disabled={scanner.busy} style={{ marginTop: spacing.md }} />}
          </View>
        )}
        renderItem={({ item }) => (
          <DocumentCard document={item} snippet={isSearching ? snippets.get(item.id) ?? null : null}
            onPress={() => router.push(`/document/${item.id}` as any)} onMenuPress={() => setActiveDocForAction(item)} />
        )}
      />

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  largeTitle: {
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    ...capsule(36),
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    ...capsule(40),
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },



  content: {
    flex: 1,
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
  emptyScroll: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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


});
