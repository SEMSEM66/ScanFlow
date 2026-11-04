import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { DocumentPage } from '../types';

interface PageEditorModalProps {
  visible: boolean;
  pages: DocumentPage[];
  onClose: () => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  onDeletePage: (pageIndex: number) => void;
  onRetakePage: (pageIndex: number) => void;
  onAddPage: () => void;
}

export const PageEditorModal: React.FC<PageEditorModalProps> = ({
  visible,
  pages,
  onClose,
  onMovePage,
  onDeletePage,
  onRetakePage,
  onAddPage,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={[typography.bodyBold, { color: colors.primary }]}>{t.common.done}</Text>
          </TouchableOpacity>
          <Text style={[typography.headline, { color: colors.textPrimary }]}>
            {pages.length} {t.common.pages} verwalten
          </Text>
          <TouchableOpacity onPress={onAddPage} style={styles.headerButton}>
            <Ionicons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {pages.map((page, index) => (
            <View
              key={page.id}
              style={[
                styles.pageCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  borderRadius: borderRadius.lg,
                },
              ]}
            >
              <Image source={{ uri: page.previewUri }} style={styles.pageThumb} resizeMode="cover" />

              <View style={styles.pageInfo}>
                <Text style={[typography.headline, { color: colors.textPrimary }]}>
                  {t.common.page} {index + 1}
                </Text>
                <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                  Filter: {page.filter} · {page.rotation}°
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
                        Alert.alert('Hinweis', 'Ein Dokument muss mindestens eine Seite enthalten.');
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
            </View>
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
    borderBottomWidth: 1,
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
    padding: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  pageThumb: {
    width: 65,
    height: 85,
    borderRadius: 8,
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
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
