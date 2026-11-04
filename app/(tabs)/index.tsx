import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { folderRepository, documentRepository } from '../../src/services';
import { Folder, Document } from '../../src/types';
import {
  DocumentCard,
  DocumentActionModal,
  MoveFolderModal,
  PromptModal,
  SortModal,
  SortOption,
  FolderOptionsModal,
} from '../../src/components';

export default function LibraryScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  // Data State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  // Modals State
  const [activeDocForAction, setActiveDocForAction] = useState<Document | null>(null);
  const [activeFolderForOptions, setActiveFolderForOptions] = useState<Folder | null>(null);
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
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

  const loadData = useCallback(async () => {
    try {
      const [fetchedFolders, fetchedDocs] = await Promise.all([
        folderRepository.getAll(),
        documentRepository.getAll({
          folderId: selectedFolderId,
          searchQuery: searchQuery.length > 0 ? searchQuery : undefined,
          sortBy,
        }),
      ]);
      setFolders(fetchedFolders);
      setDocuments(fetchedDocs);
    } catch (err) {
      console.error('[LibraryScreen] Error loading data from SQLite:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedFolderId, searchQuery, sortBy]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      await documentRepository.duplicate(doc.id);
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

  const handleMoveFolder = async (folderId: string | null) => {
    if (!activeDocForAction) return;
    try {
      await documentRepository.moveToFolder(activeDocForAction.id, folderId);
      loadData();
    } catch (err) {
      Alert.alert(t.common.error, 'Dokument konnte nicht verschoben werden.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[styles.largeTitle, typography.largeTitle, { color: colors.textPrimary }]}>
          {t.library.title}
        </Text>
        <TouchableOpacity
          style={[styles.headerIconButton, { backgroundColor: colors.surfaceSubdued }]}
          activeOpacity={0.7}
          onPress={() => setIsSortModalVisible(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { marginHorizontal: spacing.base, marginTop: spacing.sm }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.searchBackground, borderRadius: borderRadius.md }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            placeholder={t.library.searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Folder Categories Pill Bar */}
      <View style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.pillsContainer, { paddingHorizontal: spacing.base }]}
        >
          {/* "Alle" Pill */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedFolderId(null)}
            style={[
              styles.pill,
              {
                backgroundColor: selectedFolderId === null ? colors.primary : colors.surface,
                borderColor: selectedFolderId === null ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: selectedFolderId === null ? '#FFFFFF' : colors.textPrimary },
              ]}
            >
              {t.common.all}
            </Text>
          </TouchableOpacity>

          {/* SQLite Persisted Folders */}
          {folders.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            return (
              <TouchableOpacity
                key={folder.id}
                activeOpacity={0.8}
                onPress={() => setSelectedFolderId(folder.id)}
                onLongPress={() => setActiveFolderForOptions(folder)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: isSelected ? '#FFFFFF' : colors.textPrimary },
                  ]}
                >
                  {folder.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Add Folder Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenCreateFolder}
            style={[
              styles.pill,
              styles.addFolderPill,
              {
                backgroundColor: colors.surfaceSubdued,
                borderColor: colors.borderLight,
              },
            ]}
          >
            <Ionicons name="add" size={16} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={[styles.pillText, { color: colors.primary }]}>
              {t.library.newFolder}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Content: 2-Column Grid or Empty State */}
      <View style={styles.content}>
        {loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : documents.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyScroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSubdued }]}>
                <Ionicons name="document-text-outline" size={48} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, typography.title2, { color: colors.textPrimary, marginTop: spacing.base }]}>
                {searchQuery.length > 0 ? t.common.noItems : t.library.emptyTitle}
              </Text>
              <Text
                style={[
                  styles.emptySubtitle,
                  typography.body,
                  { color: colors.textSecondary, marginTop: spacing.xs, marginHorizontal: spacing.xl },
                ]}
              >
                {searchQuery.length > 0
                  ? 'Versuchen Sie einen anderen Suchbegriff.'
                  : t.library.emptySubtitle}
              </Text>

              {searchQuery.length === 0 && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/scan')}
                  style={[
                    styles.scanButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: borderRadius.round,
                      marginTop: spacing.xl,
                      paddingHorizontal: spacing.xl,
                      paddingVertical: spacing.md,
                    },
                  ]}
                >
                  <Ionicons name="camera" size={20} color="#FFFFFF" style={{ marginRight: spacing.xs }} />
                  <Text style={[styles.scanButtonText, { color: '#FFFFFF' }]}>
                    {t.library.startScan}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={documents}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={[styles.listContainer, { paddingHorizontal: spacing.base, paddingBottom: 100 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            renderItem={({ item }) => (
              <DocumentCard
                document={item}
                onPress={() => router.push(`/document/${item.id}` as any)}
                onMenuPress={() => setActiveDocForAction(item)}
              />
            )}
          />
        )}
      </View>

      {/* Document Action Modal */}
      <DocumentActionModal
        visible={activeDocForAction !== null}
        document={activeDocForAction}
        onClose={() => setActiveDocForAction(null)}
        onRename={(doc) => handleRenameDocument(doc)}
        onMove={() => setIsMoveModalVisible(true)}
        onDuplicate={(doc) => handleDuplicateDocument(doc)}
        onDelete={(doc) => handleDeleteDocument(doc)}
      />

      {/* Move Folder Modal */}
      <MoveFolderModal
        visible={isMoveModalVisible}
        document={activeDocForAction}
        folders={folders}
        onClose={() => setIsMoveModalVisible(false)}
        onSelectFolder={handleMoveFolder}
      />

      {/* Folder Options Modal (Rename/Delete folder) */}
      <FolderOptionsModal
        visible={activeFolderForOptions !== null}
        folder={activeFolderForOptions}
        onClose={() => setActiveFolderForOptions(null)}
        onRename={handleRenameFolder}
        onDelete={handleDeleteFolder}
      />

      {/* Sort Options Modal */}
      <SortModal
        visible={isSortModalVisible}
        currentSort={sortBy}
        onClose={() => setIsSortModalVisible(false)}
        onSelectSort={(newSort) => setSortBy(newSort)}
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
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  addFolderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
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
    borderRadius: 44,
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
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
