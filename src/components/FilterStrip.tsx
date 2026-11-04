import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { FilterType } from '../types';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

interface FilterStripProps {
  activeFilter: FilterType;
  thumbnailUri: string;
  onSelectFilter: (filter: FilterType) => void;
  disabled?: boolean;
}

export const FilterStrip: React.FC<FilterStripProps> = ({
  activeFilter,
  thumbnailUri,
  onSelectFilter,
  disabled = false,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  const filterOptions: { id: FilterType; label: string }[] = [
    { id: 'original', label: t.filters.original },
    { id: 'auto', label: t.filters.auto },
    { id: 'blackAndWhite', label: t.filters.blackAndWhite },
    { id: 'grayscale', label: t.filters.grayscale },
    { id: 'magicColor', label: t.filters.magicColor },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}
      >
        {filterOptions.map((opt) => {
          const isSelected = activeFilter === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.75}
              disabled={disabled}
              onPress={() => onSelectFilter(opt.id)}
              style={styles.itemWrapper}
            >
              {/* Thumbnail Container matching Dokumente.png */}
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
                {thumbnailUri ? (
                  <Image
                    source={{ uri: thumbnailUri }}
                    style={[styles.thumbnailImage, { borderRadius: borderRadius.md - 2 }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.placeholder} />
                )}
              </View>

              {/* Filter Label */}
              <Text
                style={[
                  typography.caption1,
                  styles.label,
                  {
                    color: isSelected ? colors.primary : colors.textPrimary,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {opt.label}
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
    alignItems: 'center',
    gap: 12,
  },
  itemWrapper: {
    alignItems: 'center',
    width: 66,
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
  placeholder: {
    flex: 1,
  },
  label: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 11,
  },
});
