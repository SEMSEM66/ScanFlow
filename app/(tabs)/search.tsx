import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { documentRepository, folderRepository, ocrService, pageTextRepository } from '../../src/services';
import { snippetTerm } from '../../src/db/textSearch';
import type { Snippet } from '../../src/ocr/text';
import type { Document } from '../../src/types';

interface SearchResults {
  documents: Document[];
  /** Text excerpts of the hits in the recognized text, by document id */
  snippets: Map<string, Snippet>;
  /** Folder names, by folder id */
  folderNames: Map<string, string>;
}

/**
 * Search tab: finds documents in all folders by title and – with text
 * recognition – by the recognized text of their pages (same search as the
 * library, see src/db/textSearch.ts).
 */
export default function SearchScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  // Every keystroke starts a search – only the newest one may update the list
  const loadSeq = useRef(0);

  const search = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (trimmed.length === 0) return; // cleared: a running search is dropped
    try {
      const [documents, folders] = await Promise.all([
        documentRepository.getAll({ searchQuery: trimmed, sortBy: 'date_desc' }),
        folderRepository.getAll(),
      ]);
      const term = snippetTerm(trimmed);
      let snippets = new Map<string, Snippet>();
      if (term.length > 0 && documents.length > 0) {
        try {
          snippets = await pageTextRepository.snippets(
            documents.map((d) => d.id),
            term
          );
        } catch (err) {
          console.warn('[SearchScreen] Could not load text excerpts:', err);
        }
      }
      if (seq !== loadSeq.current) return; // a newer search is already running
      setResults({ documents, snippets, folderNames: new Map(folders.map((f) => [f.id, f.name])) });
    } catch (err) {
      console.error('[SearchScreen] Search failed:', err);
      if (seq === loadSeq.current) setResults({ documents: [], snippets: new Map(), folderNames: new Map() });
    }
  }, [trimmed]);

  // Search on every change and when the tab is shown again (documents renamed, moved or deleted meanwhile)
  useFocusEffect(
    useCallback(() => {
      search();
    }, [search])
  );

  // While searching: show hits as soon as the text of a new page is recognized
  useFocusEffect(
    useCallback(() => {
      if (!isSearching) return undefined;
      return ocrService.subscribe((e) => {
        if (e.type === 'page' && e.ok) search();
      });
    }, [isSearching, search])
  );

  const changeQuery = (text: string) => {
    setQuery(text);
    if (text.trim().length === 0) setResults(null);
  };

  const renderItem = ({ item }: { item: Document }) => {
    const snippet = results?.snippets.get(item.id) ?? null;
    const folderName = item.folderId ? results?.folderNames.get(item.folderId) : undefined;
    const date = new Date(item.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const pageText = item.pageCount === 1 ? `1 ${t.common.page}` : `${item.pageCount} ${t.common.pages}`;
    const meta = folderName ? `${date} · ${pageText} · ${folderName}` : `${date} · ${pageText}`;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/document/${item.id}` as never)}
        style={[styles.row, { paddingHorizontal: spacing.base, borderBottomColor: colors.borderLight }]}
      >
        <View
          style={[
            styles.thumb,
            { backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight, borderRadius: borderRadius.xs },
          ]}
        >
          {item.thumbnailUri ? (
            <Image source={{ uri: item.thumbnailUri }} style={styles.thumbImage} resizeMode="cover" />
          ) : (
            <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={[typography.headline, { color: colors.textPrimary }]}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={[typography.footnote, { color: colors.textSecondary, marginTop: 2 }]}>
            {meta}
          </Text>
          {snippet ? (
            <Text numberOfLines={2} style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>
              {snippet.before}
              <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{snippet.match}</Text>
              {snippet.after}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  const message = (icon: keyof typeof Ionicons.glyphMap, title: string, text: string) => (
    <View style={[styles.message, { paddingHorizontal: spacing.xl }]}>
      <View style={[styles.messageIcon, { backgroundColor: colors.surfaceSubdued }]}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={[typography.title3, styles.centered, { color: colors.textPrimary, marginTop: spacing.base }]}>{title}</Text>
      <Text style={[typography.body, styles.centered, { color: colors.textSecondary, marginTop: spacing.xs }]}>{text}</Text>
    </View>
  );

  let content: React.ReactNode;
  if (!isSearching) {
    content = message('search', t.search.hintTitle, ocrService.available ? t.search.hintText : t.search.hintTitlesOnly);
  } else if (results === null) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  } else if (results.documents.length === 0) {
    content = message('document-text-outline', t.common.noItems, t.library.noResultsHint);
  } else {
    content = (
      <FlatList
        data={results.documents}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.hero }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[styles.largeTitle, typography.largeTitle, { color: colors.textPrimary }]}>{t.search.title}</Text>
      </View>

      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.searchBackground,
            borderRadius: borderRadius.md,
            marginHorizontal: spacing.base,
            marginTop: spacing.sm,
          },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          placeholder={ocrService.available ? t.library.searchPlaceholderText : t.library.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={changeQuery}
          style={[styles.searchInput, { color: colors.textPrimary }]}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t.search.title}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => changeQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t.common.reset}
          >
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.content, { marginTop: spacing.sm }]}>{content}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
  },
  largeTitle: {
    letterSpacing: -0.5,
  },
  searchBar: {
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
  content: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 56,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
  },
  chevron: {
    marginLeft: 8,
  },
  loading: {
    paddingTop: 40,
    alignItems: 'center',
  },
  message: {
    paddingTop: 48,
    alignItems: 'center',
  },
  messageIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});