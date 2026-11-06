import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from './ui/Icon';
import { capsule, corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import type { Document } from '../types';
import { documentRepository } from '../services';
import { daysRemainingInTrash } from '../utils/organization';

interface TrashModalProps {
  visible: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ visible, onClose, onRestored }) => {
  const { colors, typography, spacing } = useTheme();
  const { t, formatString } = useTranslation();

  const [trashedDocs, setTrashedDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await documentRepository.getTrashed();
      setTrashedDocs(list);
    } catch (err) {
      console.warn('[TrashModal] Could not load trashed documents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    documentRepository.getTrashed().then((list) => {
      if (!cancelled) {
        setTrashedDocs(list);
      }
    }).catch((err) => {
      console.warn('[TrashModal] Could not load trashed documents:', err);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleRestore = async (id: string) => {
    setActionId(id);
    try {
      await documentRepository.restoreFromTrash(id);
      await reload();
      onRestored?.();
    } catch (err) {
      console.error('[TrashModal] Restore failed:', err);
      Alert.alert(t.common.error, t.common.notFound);
    } finally {
      setActionId(null);
    }
  };

  const handlePermanentlyDelete = (doc: Document) => {
    Alert.alert(
      t.trash.deletePermanently,
      t.trash.deletePermanentlyConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            setActionId(doc.id);
            try {
              await documentRepository.permanentlyDelete(doc.id);
              await reload();
            } catch (err) {
              console.error('[TrashModal] Delete failed:', err);
            } finally {
              setActionId(null);
            }
          },
        },
      ]
    );
  };

  const handleEmptyTrash = () => {
    if (trashedDocs.length === 0) return;
    Alert.alert(
      t.trash.emptyTrash,
      formatString(t.trash.emptyTrashConfirm, { count: trashedDocs.length }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.trash.emptyTrash,
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await documentRepository.emptyTrash();
              await reload();
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={[typography.body, { color: colors.primary }]}>{t.common.close}</Text>
          </TouchableOpacity>
          <Text style={[typography.headline, styles.headerTitle, { color: colors.textPrimary }]}>
            {t.trash.title}
          </Text>
          <View style={[styles.headerBtn, { alignItems: 'flex-end' }]}>
            {trashedDocs.length > 0 ? (
              <TouchableOpacity onPress={handleEmptyTrash}>
                <Text style={[typography.body, { color: colors.danger }]}>{t.trash.emptyTrash}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {loading && trashedDocs.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : trashedDocs.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSubdued }]}>
              <Icon name="trash" size={36} color={colors.textSecondary} />
            </View>
            <Text style={[typography.title3, { color: colors.textPrimary, marginTop: 16 }]}>
              {t.trash.emptyTitle}
            </Text>
            <Text
              style={[
                typography.subhead,
                { color: colors.textSecondary, textAlign: 'center', marginTop: 8, maxWidth: 300 },
              ]}
            >
              {t.trash.emptySubtitle}
            </Text>
          </View>
        ) : (
          <FlatList
            data={trashedDocs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.base, paddingBottom: 48 }}
            renderItem={({ item }) => {
              const days = item.deletedAt ? daysRemainingInTrash(item.deletedAt) : 0;
              const daysNotice = formatString(days === 1 ? t.trash.daysLeftOne : t.trash.daysLeft, {
                count: days,
              });
              const isBusy = actionId === item.id;

              return (
                <View
                  style={[
                    styles.rowCard,
                    { backgroundColor: colors.card, borderColor: colors.cardBorder },
                  ]}
                >
                  <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceSubdued }]}>
                    {item.thumbnailUri ? (
                      <Image source={{ uri: item.thumbnailUri }} style={StyleSheet.absoluteFill} />
                    ) : (
                      <Icon name="doc.text" size={24} color={colors.textSecondary} />
                    )}
                  </View>

                  <View style={styles.infoCol}>
                    <Text numberOfLines={1} style={[typography.bodyBold, { color: colors.textPrimary }]}>
                      {item.title}
                    </Text>
                    <View style={styles.subRow}>
                      <Text style={[typography.caption2, { color: colors.textSecondary }]}>
                        {formatString(t.scan.pagesCount, { count: item.pageCount })}
                      </Text>
                      <View style={[styles.pillBadge, { backgroundColor: colors.surfaceSubdued }]}>
                        <Text style={[typography.caption2, { color: colors.danger, fontWeight: '600' }]}>
                          {daysNotice}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      disabled={isBusy}
                      onPress={() => void handleRestore(item.id)}
                      style={[styles.actionBtn, { backgroundColor: colors.primarySubdued }]}
                      accessibilityRole="button"
                      accessibilityLabel={t.trash.restore}
                    >
                      <Icon name="arrow.uturn.backward" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={isBusy}
                      onPress={() => handlePermanentlyDelete(item)}
                      style={[styles.actionBtn, { backgroundColor: colors.surfaceSubdued }]}
                      accessibilityRole="button"
                      accessibilityLabel={t.trash.deletePermanently}
                    >
                      <Icon name="trash" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: hairline,
  },
  headerBtn: {
    minWidth: 70,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    ...capsule(72),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    ...corner(radius.md),
    borderWidth: hairline,
    padding: 12,
    marginBottom: 10,
  },
  thumbWrap: {
    width: 48,
    height: 64,
    ...corner(radius.sm),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    marginLeft: 12,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    ...capsule(18),
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    ...capsule(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
