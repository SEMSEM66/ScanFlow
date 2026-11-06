import React, { useEffect, useSyncExternalStore } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AdjustmentsPanel } from '../../src/components/AdjustmentsPanel';
import { adjustSheetSession } from '../../src/components/adjustSheetSession';

export default function AdjustSheet() {
  const router = useRouter();
  const session = useSyncExternalStore(adjustSheetSession.subscribe, adjustSheetSession.get, adjustSheetSession.get);
  useEffect(() => { if (!session) router.back(); }, [session, router]);
  if (!session) return null;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <AdjustmentsPanel value={session.value} onChange={session.onChange} onApplyToAll={session.onApplyToAll} onClose={() => router.back()} />
    </ScrollView>
  );
}
