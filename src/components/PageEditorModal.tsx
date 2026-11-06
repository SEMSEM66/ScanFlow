import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { capsule, concentric, hairline, radius, useTheme } from '../theme';
import { Card, Thumbnail } from './ui';
import { useTranslation } from '../i18n';
import { DocumentPage } from '../types';

const CARD_RADIUS = radius.lg;
/** Card padding = thumbnail inset → the thumbnail corner is concentric with the card corner. */
const CARD_PADDING = 12;

interface PageEditorModalProps {
  visible: boolean;
  pages: DocumentPage[];
  onClose: () => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  onDeletePage: (pageIndex: number) => void;
  onRetakePage: (pageIndex: number) => void;
  onAddPage: () => void;
  /** iOS: called once the modal is fully dismissed. */
  onDismiss?: () => void;
}

export const PageEditorModal: React.FC<PageEditorModalProps> = ({
  visible,
  pages,
  onClose,
  onMovePage,
  onDeletePage,
  onRetakePage,
  onAddPage,
  onDismiss,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t, formatString } = useTranslation();
  const filterLabel = (f: DocumentPage['filter']) =>
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={[typography.bodyBold, { color: colors.primary }]}>{t.common.done}</Text>
          </TouchableOpacity>
          <Text style={[typography.headline, { color: colors.textPrimary }]}>
            {formatString(t.filters.managePages, { count: pages.length })}
          </Text>
          <TouchableOpacity onPress={onAddPage} style={styles.headerButton}>
            <Ionicons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {pages.map((page, index) => (
            <Card key={page.id} radius={CARD_RADIUS} contentStyle={styles.pageCard}>
              <Thumbnail
                uri={page.previewUri}
                width={65}
                height={85}
                radius={concentric(CARD_RADIUS, CARD_PADDING)}
                style={styles.pageThumb}
              />

              <View style={styles.pageInfo}>
                <Text style={[typography.headline, { color: colors.textPrimary }]}>
                  {t.common.page} {index + 1}
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  {formatString(t.filters.pageInfo, { filter: filterLabel(page.filter), rotation: page.rotation })}
                </Text>

                {/* Move Controls */}
                <View style={styles.controlsRow}>
                  {/* Move Up/Left */}
                  <TouchableOpacity
                    disabled={index === 0}
                    onPress={() => onMovePage(index, index - 1)}
                    style={[
                      styles.iconBtn,
                      { backgroundColor: colors.surfaceSubdued, opacity: index === 0 ? 0.3 : 1 },
                    ]}
                  >
                    <Ionicons name="arrow-up" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>

                  {/* Move Down/Right */}
                  <TouchableOpacity
                    disabled={index === pages.length - 1}
                    onPress={() => onMovePage(index, index + 1)}
                    style={[
                      styles.iconBtn,
                      {
                        backgroundColor: colors.surfaceSubdued,
                        opacity: index === pages.length - 1 ? 0.3 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="arrow-down" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>

                  {/* Retake */}
                  <TouchableOpacity
                    onPress={() => onRetakePage(index)}
                    style={[styles.iconBtn, { backgroundColor: colors.surfaceSubdued }]}
                  >
                    <Ionicons name="camera-reverse-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>

                  {/* Delete */}
                  <TouchableOpacity
                    onPress={() => {
                      if (pages.length <= 1) {
                        Alert.alert(t.common.hint, t.filters.minOnePage);
                        return;
                      }
                      onDeletePage(index);
                    }}
                    style={[styles.iconBtn, { backgroundColor: colors.surfaceSubdued }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: hairline,
  },
  headerButton: {
    padding: 6,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  pageCard: {
    flexDirection: 'row',
    padding: CARD_PADDING,
    alignItems: 'center',
  },
  pageThumb: {
    marginRight: 16,
  },
  pageInfo: {
    flex: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    ...capsule(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
