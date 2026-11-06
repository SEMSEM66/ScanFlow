import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FilterType } from '../types';
import { FILTER_ORDER } from '../imaging/filters';
import { corner, radius, shadows, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Thumbnail } from './ui';
import { haptics } from '../utils/haptics';

const THUMB_WIDTH = 62;
const THUMB_HEIGHT = 80;
const THUMB_RADIUS = radius.sm;

interface FilterStripProps {
  activeFilter: FilterType;
  /** Rendered thumbnail per filter (data: URIs); missing entries show a spinner. */
  thumbnails: Partial<Record<FilterType, string>>;
  /** Shown while a filter thumbnail is not rendered yet. */
  fallbackUri?: string;
  onSelectFilter: (filter: FilterType) => void;
  disabled?: boolean;
}

export const FilterStrip: React.FC<FilterStripProps> = ({
  activeFilter,
  thumbnails,
  fallbackUri,
  onSelectFilter,
  disabled = false,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();

  const label = (f: FilterType): string =>
    ({
      original: t.filters.original,
      auto: t.filters.auto,
      magicColor: t.filters.magicColor,
      removeShadows: t.filters.removeShadows,
      lighten: t.filters.lighten,
      grayscale: t.filters.grayscale,
      blackAndWhite: t.filters.blackAndWhite,
    })[f];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}
      >
        {FILTER_ORDER.map((id) => {
          const isSelected = activeFilter === id;
          const uri = thumbnails[id];
          return (
            <TouchableOpacity
              key={id}
              activeOpacity={0.75}
              disabled={disabled}
              onPress={() => {
                void haptics.selection();
                onSelectFilter(id);
              }}
              style={styles.itemWrapper}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={label(id)}
            >
              {/* Shadow on a wrapper: the thumbnail itself clips its image */}
              <View style={[styles.thumbnailShadow, corner(THUMB_RADIUS), { backgroundColor: colors.surfaceSubdued, shadowColor: colors.shadowColor }]}>
                <Thumbnail
                  uri={uri ?? fallbackUri}
                  width={THUMB_WIDTH}
                  height={THUMB_HEIGHT}
                  radius={THUMB_RADIUS}
                  selected={isSelected}
                  imageStyle={{ opacity: uri ? 1 : 0.35 }}
                >
                  {!uri ? <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={colors.primary} /> : null}
                </Thumbnail>
              </View>
              <Text
                numberOfLines={2}
                style={[
                  typography.caption1,
                  styles.label,
                  {
                    color: isSelected ? colors.primary : colors.textPrimary,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {label(id)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemWrapper: {
    alignItems: 'center',
    width: 70,
  },
  thumbnailShadow: {
    ...shadows.low,
  },
  label: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 11,
  },
});
