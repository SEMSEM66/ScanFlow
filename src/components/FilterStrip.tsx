import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { FilterType } from '../types';
import { FILTER_ORDER } from '../imaging/filters';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

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
  const { colors, typography, spacing, borderRadius } = useTheme();
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
              onPress={() => onSelectFilter(id)}
              style={styles.itemWrapper}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={label(id)}
            >
              <View
                style={[
                  styles.thumbnailBox,
                  {
                    backgroundColor: colors.surfaceSubdued,
                    borderColor: isSelected ? colors.primary : colors.cardBorder,
                    borderWidth: isSelected ? 2.5 : 1,
                    borderRadius: borderRadius.md,
                  },
                ]}
              >
                {uri || fallbackUri ? (
                  <Image
                    source={{ uri: uri ?? fallbackUri }}
                    style={[styles.thumbnailImage, { borderRadius: borderRadius.md - 2, opacity: uri ? 1 : 0.35 }]}
                    resizeMode="cover"
                  />
                ) : null}
                {!uri ? <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={colors.primary} /> : null}
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
  thumbnailBox: {
    width: 62,
    height: 80,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  label: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 11,
  },
});
