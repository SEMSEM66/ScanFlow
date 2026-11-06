import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Button, Icon } from '../../src/components/ui';
import { useTranslation } from '../../src/i18n';
import { documentRepository, folderRepository } from '../../src/services';
import { hairline, useTheme } from '../../src/theme';
import type { Document, Folder } from '../../src/types';

/** Choose a destination using the system sheet; return to the source screen after the move. */
export default function MoveSheet() {
  const { documentId } = useLocalSearchParams<{ documentId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const [document, setDocument] = useState<Document | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const moving = useRef(false);

  useLayoutEffect(() => { navigation.setOptions({ gestureEnabled: !busy }); }, [busy, navigation]);
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const [data, list] = await Promise.all([
          documentRepository.getById(documentId), folderRepository.getAll(),
        ]);
        if (!mounted.current) return;
        if (!data) { Alert.alert(t.common.error, t.common.notFound); router.back(); return; }
        setDocument(data.document);
        setFolders(list);
      } catch (error) {
        console.error('[MoveSheet] load failed:', error);
        if (mounted.current) { Alert.alert(t.common.error, t.library.moveFailed); router.back(); }
      } finally { if (mounted.current) setLoading(false); }
    })();
    return () => { mounted.current = false; };
  }, [documentId, router, t]);

  const move = async (folderId: string | null) => {
    if (!document || moving.current) return;
    moving.current = true;
    setBusy(true);
    try {
      await documentRepository.moveToFolder(document.id, folderId);
      if (mounted.current) router.back();
    } catch (error) {
      console.error('[MoveSheet] move failed:', error);
      if (mounted.current) Alert.alert(t.common.error, t.library.moveFailed);
    } finally {
      moving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const row = (id: string | null, label: string) => {
    const selected = document?.folderId === id;
    return (
      <TouchableOpacity key={id ?? 'none'} onPress={() => void move(id)} disabled={busy} accessibilityRole="button"
        style={[styles.row, { borderBottomColor: colors.borderLight }, selected && { backgroundColor: colors.surfaceSubdued }]}>
        <Icon name="folder" size={22} color={selected ? colors.primary : colors.textSecondary} />
        <Text style={[typography.bodyMedium, styles.label, { color: colors.textPrimary }]}>{label}</Text>
        {selected ? <Icon name="checkmark" size={20} color={colors.primary} /> : null}
      </TouchableOpacity>
    );
  };
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Text style={[typography.headline, styles.title, { color: colors.textPrimary }]}>{t.library.moveToFolder}</Text>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : (
        <ScrollView contentInsetAdjustmentBehavior="automatic">
          {row(null, t.library.removeFromFolder)}
          {folders.map((folder) => row(folder.id, folder.name))}
        </ScrollView>
      )}
      <View style={styles.footer}><Button variant="gray" title={t.common.cancel} disabled={busy} onPress={() => router.back()} /></View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { textAlign: 'center', paddingTop: 24, paddingBottom: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 20, borderBottomWidth: hairline },
  label: { flex: 1, marginLeft: 14 },
  footer: { paddingHorizontal: 16, paddingVertical: 8 },
});
