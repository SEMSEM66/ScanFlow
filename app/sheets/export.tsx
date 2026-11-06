import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ExportModal } from '../../src/components/ExportModal';
import { useTranslation } from '../../src/i18n';
import { documentRepository, exportService, ocrService } from '../../src/services';
import { useTheme } from '../../src/theme';
import type { Document, DocumentPage, ExportDpi, ExportFormat, ExportQuality } from '../../src/types';

/** Generates a file while the native sheet remains visible, then presents iOS sharing above it. */
export default function ExportSheet() {
  const { documentId, pageIndex } = useLocalSearchParams<{ documentId: string; pageIndex: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const [data, setData] = useState<{ document: Document; pages: DocumentPage[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  useLayoutEffect(() => { navigation.setOptions({ gestureEnabled: !busy }); }, [busy, navigation]);
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const result = await documentRepository.getById(documentId);
        if (!mounted.current) return;
        if (!result || result.pages.length === 0) { Alert.alert(t.common.error, t.common.notFound); router.back(); return; }
        setData(result);
      } catch (error) {
        console.error('[ExportSheet] load failed:', error);
        if (mounted.current) { Alert.alert(t.common.error, t.export.failed); router.back(); }
      }
    })();
    return () => { mounted.current = false; };
  }, [documentId, router, t]);
  const share = async (format: ExportFormat, quality: ExportQuality, dpi: ExportDpi, watermark?: string) => {
    if (!data || running.current) return;
    running.current = true;
    setBusy(true);
    setProgress({ current: 0, total: format === 'pdf' ? data.pages.length : 1 });
    const onProgress = (current: number, total: number) => { if (mounted.current) setProgress({ current, total }); };
    let uri: string;
    const resumeOcr = ocrService.hold();
    try {
      const index = Math.max(0, Math.min(data.pages.length - 1, Number(pageIndex) || 0));
      uri = format === 'pdf'
        ? await exportService.generatePdf(data.document.title, data.pages, { dpi, quality, watermark, onProgress, textForPage: (page) => ocrService.linesForExport(page) })
        : await exportService.generateJpg(data.document.title, data.pages[index], index, { dpi, quality, onProgress });
    } catch (error) {
      console.error('[ExportSheet] export failed:', error);
      running.current = false;
      if (mounted.current) { setBusy(false); setProgress(null); Alert.alert(t.common.error, t.export.failed); }
      return;
    } finally { resumeOcr(); }
    try {
      if (!mounted.current) { await exportService.discardExport(uri); return; }
      await exportService.shareDocument(uri, format, t.export.shareTitle);
      if (mounted.current) router.back();
    } catch (error) {
      console.error('[ExportSheet] sharing failed:', error);
      if (mounted.current) Alert.alert(t.common.error, t.export.failed);
    } finally {
      running.current = false;
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  };
  if (!data) return <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={busy} style={styles.headerButton}>
          <Text maxFontSizeMultiplier={1.3} style={[typography.body, { color: colors.primary, opacity: busy ? 0.4 : 1 }]}>{t.common.cancel}</Text>
        </TouchableOpacity>
        <Text style={[typography.headline, styles.headerTitle, { color: colors.textPrimary }]}>{t.export.title}</Text>
        <View style={styles.headerButton} />
      </View>
      <ExportModal documentTitle={data.document.title} pageCount={data.pages.length} onShare={share} isGenerating={busy} progress={progress} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20 },
  headerButton: { width: 80, minHeight: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
});
