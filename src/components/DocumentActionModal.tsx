import React from 'react';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import type { Document } from '../types';
import { useNativeMenu } from './useNativeMenu';

interface DocumentActionModalProps {
  visible: boolean;
  document: Document | null;
  onClose: () => void;
  onRename: (document: Document) => void;
  onMove: (document: Document) => void;
  onDuplicate: (document: Document) => void;
  onDelete: (document: Document) => void;
  onShowText?: (document: Document) => void;
}
export const DocumentActionModal: React.FC<DocumentActionModalProps> = ({ visible, document, onClose, onRename, onMove, onDuplicate, onDelete, onShowText }) => {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  useNativeMenu(visible, document ? {
    title: document.title, cancel: t.common.cancel, isDark, onClose,
    actions: [
      { label: t.library.renameDocument, run: () => onRename(document) },
      { label: t.library.moveToFolder, run: () => onMove(document) },
      { label: t.library.duplicateDocument, run: () => onDuplicate(document) },
      ...(onShowText ? [{ label: t.ocr.menuAction, run: () => onShowText(document) }] : []),
      { label: t.library.deleteDocument, run: () => onDelete(document), destructive: true },
    ],
  } : null);
  return null;
};
