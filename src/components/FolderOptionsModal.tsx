import React from 'react';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import type { Folder } from '../types';
import { useNativeMenu } from './useNativeMenu';
interface FolderOptionsModalProps {
  visible: boolean; folder: Folder | null; onClose: () => void;
  onRename: (folder: Folder) => void; onDelete: (folder: Folder) => void;
}
export const FolderOptionsModal: React.FC<FolderOptionsModalProps> = ({ visible, folder, onClose, onRename, onDelete }) => {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  useNativeMenu(visible, folder ? {
    title: folder.name, cancel: t.common.cancel, isDark, onClose,
    actions: [
      { label: t.common.edit, run: () => onRename(folder) },
      { label: t.library.deleteFolder, run: () => onDelete(folder), destructive: true },
    ],
  } : null);
  return null;
};
