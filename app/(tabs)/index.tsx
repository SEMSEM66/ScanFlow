import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { folderRepository, documentRepository } from '../../src/services';
import { Folder, Document } from '../../src/types';

export default function LibraryScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fetchedFolders, fetchedDocs] = await Promise.all([
        folderRepository.getAll(),
        documentRepository.getAll({
          folderId: selectedFolderId,
          searchQuery: searchQuery.length > 0 ? searchQuery : undefined,
        }),
      ]);
      setFolders(fetchedFolders);
      setDocuments(fetchedDocs);
    } catch (err) {
      console.error('[LibraryScreen] Error loading data from SQLite:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
        </View>
      </View>

      {/* Folder Categories Pill Bar */}
      <View style={{ marginTop: spacing.md }}>
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
        </ScrollView>
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : documents.length === 0 ? (
          /* Empty State */
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSubdued }]}>
              <Ionicons name="document-text-outline" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, typography.title2, { color: colors.textPrimary, marginTop: spacing.base }]}>
              {t.library.emptyTitle}
            </Text>
            <Text
              style={[
                styles.emptySubtitle,
                typography.body,
                { color: colors.textSecondary, marginTop: spacing.xs, marginHorizontal: spacing.xl },
              ]}
            >
              {t.library.emptySubtitle}
            </Text>

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

            {/* SQLite Storage Verification Badge */}
            <View style={[styles.storageBadge, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <Ionicons name="server-outline" size={14} color={colors.success} style={{ marginRight: 6 }} />
              <Text style={[styles.storageBadgeText, { color: colors.textSecondary }]}>
                SQLite aktiv · {folders.length} Ordner bereit
              </Text>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.base }}>
            {/* Grid will be fully populated in Step 1 */}
          </ScrollView>
        )}
      </View>
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
    fontSize: 16,
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
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
  emptyContainer: {
    flex: 1,
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
  storageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  storageBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
