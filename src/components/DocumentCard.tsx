import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { Document } from '../types';
import type { Snippet } from '../ocr/text';
import { capsule, concentric, corner, radius, shadows, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Card, Icon } from './ui';

interface DocumentCardProps {
  document: Document;
  onPress: () => void;
  onMenuPress: () => void;
  /** Search hit in the recognized text (match highlighted). */
  snippet?: Snippet | null;
  /** Whether multi-select mode is active in the library. */
  selectMode?: boolean;
  /** Whether this card is selected in multi-select mode. */
  selected?: boolean;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onPress,
  onMenuPress,
  snippet,
  selectMode = false,
  selected = false,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t, language } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const cardMaxWidth = Math.max(120, (windowWidth - spacing.base * 2 - 12) / 2);

  const formattedDate = new Date(document.createdAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
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
      style={[styles.cell, { maxWidth: cardMaxWidth }]}
    >
      <Card
        elevated="card"
        clip
        radius={CARD_RADIUS}
        borderColor={selectMode && selected ? colors.primary : undefined}
        contentStyle={selectMode && selected ? { borderWidth: 2, borderColor: colors.primary } : undefined}
      >
        {/* Thumbnail area, edge to edge (clipped by the card) */}
        <View style={[styles.thumbnailContainer, { backgroundColor: colors.surfaceSubdued }]}>
          {document.thumbnailUri ? (
            <Image
              source={{ uri: document.thumbnailUri }}
              style={styles.thumbnailImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderContainer}>
              <View style={[styles.placeholderDoc, { backgroundColor: colors.surface, shadowColor: colors.shadowColor }]}>
                <View style={[styles.placeholderLine, { backgroundColor: colors.border, width: '40%' }]} />
                <View style={[styles.placeholderLine, { backgroundColor: colors.borderLight, width: '80%' }]} />
                <View style={[styles.placeholderLine, { backgroundColor: colors.borderLight, width: '70%' }]} />
                <View style={[styles.placeholderLine, { backgroundColor: colors.borderLight, width: '60%' }]} />
              </View>
            </View>
          )}

          {/* Selection badge or Menu button in the corner: a circle concentric with the card corner */}
          {selectMode ? (
            <View
              style={[
                styles.menuButton,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  shadowColor: colors.shadowColor,
                },
              ]}
            >
              <Icon
                name={selected ? 'checkmark' : 'circle'}
                size={14}
                color={selected ? '#FFFFFF' : colors.textMuted}
                weight="bold"
              />
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={(e) => {
                e.stopPropagation();
                onMenuPress();
              }}
              style={[styles.menuButton, { backgroundColor: colors.surface, shadowColor: colors.shadowColor }]}
              hitSlop={(44 - MENU_SIZE) / 2}
              accessibilityRole="button"
              accessibilityLabel={t.library.options}
            >
              <Icon name="ellipsis" size={14} color={colors.textPrimary} weight="semibold" />
            </TouchableOpacity>
          )}
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
      </Card>
    </TouchableOpacity>
  );
};

const CARD_RADIUS = radius.lg;
/** Inset of the menu button from the card edges. */
const MENU_INSET = 8;
/** Diameter = 2 × concentric radius, so the button's curve runs parallel to the card corner. */
const MENU_SIZE = 2 * concentric(CARD_RADIUS, MENU_INSET);

const styles = StyleSheet.create({
  cell: {
    flex: 1,
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
    ...corner(radius.xs),
    padding: 10,
    ...shadows.low,
    justifyContent: 'center',
    gap: 8,
  },
  placeholderLine: {
    height: 4,
    ...capsule(4),
  },
  menuButton: {
    position: 'absolute',
    top: MENU_INSET,
    right: MENU_INSET,
    width: MENU_SIZE,
    height: MENU_SIZE,
    ...capsule(MENU_SIZE),
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
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
