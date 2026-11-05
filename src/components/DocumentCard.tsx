import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Document } from '../types';
import type { Snippet } from '../ocr/text';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

interface DocumentCardProps {
  document: Document;
  onPress: () => void;
  onMenuPress: () => void;
  /** Search hit in the recognized text (match highlighted). */
  snippet?: Snippet | null;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onPress,
  onMenuPress,
  snippet,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t, formatString } = useTranslation();

  const formattedDate = new Date(document.createdAt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const pageText =
    document.pageCount === 1
      ? `1 ${t.common.page}`
      : `${document.pageCount} ${t.common.pages}`;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onLongPress={onMenuPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          borderRadius: borderRadius.lg,
          shadowColor: colors.shadowColor,
        },
      ]}
    >
      {/* Thumbnail Area */}
      <View
        style={[
          styles.thumbnailContainer,
          {
            backgroundColor: colors.surfaceSubdued,
            borderTopLeftRadius: borderRadius.lg - 1,
            borderTopRightRadius: borderRadius.lg - 1,
          },
        ]}
      >
        {document.thumbnailUri ? (
          <Image
            source={{ uri: document.thumbnailUri }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderContainer}>
            <View style={[styles.placeholderDoc, { backgroundColor: colors.surface }]}>
              <View style={[styles.placeholderLine, { backgroundColor: colors.border, width: '40%' }]} />
              <View style={[styles.placeholderLine, { backgroundColor: colors.borderLight, width: '80%' }]} />
              <View style={[styles.placeholderLine, { backgroundColor: colors.borderLight, width: '70%' }]} />
              <View style={[styles.placeholderLine, { backgroundColor: colors.borderLight, width: '60%' }]} />
            </View>
          </View>
        )}

        {/* Floating Menu Button on Thumbnail */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={(e) => {
            e.stopPropagation();
            onMenuPress();
          }}
          style={[styles.menuButton, { backgroundColor: colors.surface }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Info Area */}
      <View style={[styles.infoContainer, { padding: spacing.md }]}>
        <Text
          numberOfLines={1}
          style={[typography.headline, styles.title, { color: colors.textPrimary }]}
        >
          {document.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[typography.footnote, styles.subtitle, { color: colors.textSecondary, marginTop: 4 }]}
        >
          {formattedDate} · {pageText}
        </Text>
        {snippet ? (
          <Text numberOfLines={3} style={[typography.caption1, styles.snippet, { color: colors.textSecondary }]}>
            {snippet.before}
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{snippet.match}</Text>
            {snippet.after}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 16,
  },
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 1.15,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  placeholderContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  placeholderDoc: {
    width: '75%',
    height: '85%',
    borderRadius: 8,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
    justifyContent: 'center',
    gap: 8,
  },
  placeholderLine: {
    height: 4,
    borderRadius: 2,
  },
  menuButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  infoContainer: {
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
  },
  snippet: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
  },
});
