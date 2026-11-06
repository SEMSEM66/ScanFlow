import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { corner, hairline, radius, useTheme } from '../theme';
import { Button, Card, Chip } from './ui';
import { useTranslation } from '../i18n';
import { documentRepository } from '../services/DocumentRepository';
import { ocrService } from '../services/OcrService';
import { documentText } from '../ocr/text';
import type { PageTextRecord } from '../ocr/types';
import type { Document, DocumentPage } from '../types';

interface DocumentTextModalProps {
  visible: boolean;
  document: Pick<Document, 'id' | 'title'> | null;
  onClose: () => void;
}

/** Recognized text of a document, page by page – selectable, copy per page or all, share. */
export const DocumentTextModal: React.FC<DocumentTextModalProps> = ({ visible, document, onClose }) => {
  const { colors, typography } = useTheme();
  const { t, formatString } = useTranslation();
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [texts, setTexts] = useState<Map<string, PageTextRecord>>(new Map());
  const [enabled, setEnabled] = useState(true);
  // id of the document whose data is shown (spinner until the first load of a document)
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const available = ocrService.available;
  const docId = document?.id ?? null;
  const loaded = docId !== null && loadedFor === docId;

  // Load while visible; reload whenever a page of this document was recognized
  useEffect(() => {
    if (!visible || !docId) return;
    let active = true;
    const load = async () => {
      try {
        const data = await documentRepository.getById(docId);
        const list = data?.pages ?? [];
        const [map, on] = await Promise.all([ocrService.textForDocument(docId, list), ocrService.isEnabled()]);
        if (!active) return;
        setPages(list);
        setTexts(map);
        setEnabled(on);
      } catch (err) {
        console.warn('[DocumentTextModal] load failed', err);
      } finally {
        if (active) setLoadedFor(docId);
      }
    };
    void load();
    ocrService.prioritize(docId);
    ocrService.kick(200);
    const unsubscribe = ocrService.subscribe((e) => {
      if (e.type === 'state' || e.documentId === docId) void load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [visible, docId]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  const pageLabel = (index: number) => formatString(t.ocr.pageLabel, { page: index + 1 });
  const allText = documentText(pages.map((p, i) => ({ label: pageLabel(i), text: texts.get(p.id)?.text })));

  const copy = async (id: string, text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1600);
    } catch (err) {
      console.warn('[DocumentTextModal] copy failed', err);
    }
  };

  const share = async () => {
    if (!allText) return;
    try {
      await Share.share({ message: allText, title: document?.title });
    } catch (err) {
      console.warn('[DocumentTextModal] share failed', err);
    }
  };

  const notice = !available ? t.ocr.unavailable : !enabled ? t.ocr.disabledHint : null;

  const renderPage = ({ item, index }: { item: DocumentPage; index: number }) => {
    const record = texts.get(item.id);
    const text = record?.text.trim() ?? '';
    const failed = !record && ocrService.hasFailed(item);
    let status: React.ReactNode = null;
    if (record && !text) status = <Text style={[typography.footnote, { color: colors.textMuted }]}>{t.ocr.noText}</Text>;
    else if (!record && available && enabled && failed) {
      status = (
        <View style={styles.statusRow}>
          <Text style={[typography.footnote, { color: colors.textMuted, flex: 1 }]}>{t.ocr.failed}</Text>
          <TouchableOpacity onPress={() => ocrService.retryFailed()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[typography.footnote, { color: colors.primary, fontWeight: '700' }]}>{t.ocr.retry}</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (!record && available && enabled) {
      status = (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[typography.footnote, { color: colors.textSecondary, marginLeft: 8 }]}>{t.ocr.recognizing}</Text>
        </View>
      );
    } else if (!record) {
      status = <Text style={[typography.footnote, { color: colors.textMuted }]}>{t.ocr.notRecognized}</Text>;
    }
    return (
      <Card contentStyle={styles.pageCard}>
        <View style={styles.pageHeader}>
          <Text style={[typography.headline, { color: colors.textPrimary }]}>{pageLabel(index)}</Text>
          {text ? (
            <Chip
              onPress={() => copy(item.id, text)}
              icon={copied === item.id ? 'checkmark' : 'doc.on.doc'}
              label={copied === item.id ? t.ocr.copied : t.ocr.copyPage}
              tint={colors.primary}
            />
          ) : null}
        </View>
        {text ? (
          <Text selectable style={[typography.body, styles.pageText, { color: colors.textPrimary }]}>
            {text}
          </Text>
        ) : (
          <View style={styles.pageText}>{status}</View>
        )}
      </Card>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={[typography.bodyBold, { color: colors.primary }]}>{t.common.done}</Text>
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text style={[typography.headline, { color: colors.textPrimary }]}>{t.ocr.textTitle}</Text>
            {document ? (
              <Text numberOfLines={1} style={[typography.caption1, { color: colors.textSecondary }]}>
                {document.title}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={share}
            disabled={!allText}
            style={[styles.headerButton, { opacity: allText ? 1 : 0.3 }]}
            accessibilityLabel={t.ocr.shareText}
          >
            <Ionicons name="share-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {notice ? (
          <View style={[styles.notice, corner(radius.md), { backgroundColor: colors.primarySubdued, borderColor: colors.primaryBorder }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[typography.footnote, { color: colors.textPrimary, flex: 1, marginLeft: 8 }]}>{notice}</Text>
            {available && !enabled ? (
              <TouchableOpacity
                onPress={async () => {
                  await ocrService.setEnabled(true);
                  setEnabled(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[typography.footnote, { color: colors.primary, fontWeight: '700' }]}>{t.ocr.enableNow}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {!loaded ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={pages}
            keyExtractor={(p) => p.id}
            renderItem={renderPage}
            contentContainerStyle={styles.list}
            extraData={[texts, copied, enabled]}
          />
        )}

        <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
          <Button
            onPress={() => copy('all', allText)}
            disabled={!allText}
            icon={copied === 'all' ? 'checkmark' : 'doc.on.doc'}
            title={copied === 'all' ? t.ocr.copied : t.ocr.copyAll}
          />
        </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: hairline,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerButton: {
    padding: 6,
    minWidth: 44,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: hairline,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  pageCard: {
    padding: 14,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageText: {
    marginTop: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    borderTopWidth: hairline,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
});
