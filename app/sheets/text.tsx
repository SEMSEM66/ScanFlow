import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DocumentTextModal } from '../../src/components/DocumentTextModal';

/** Native form sheet for a document's recognized text. */
export default function TextSheet() {
  const router = useRouter();
  const { documentId, title } = useLocalSearchParams<{ documentId: string; title: string }>();
  return <DocumentTextModal document={documentId ? { id: documentId, title: title ?? '' } : null} onClose={() => router.back()} />;
}
