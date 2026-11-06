import React from 'react';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { useNativeMenu } from './useNativeMenu';
export type SortOption = 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc';
interface SortModalProps { visible: boolean; currentSort: SortOption; onClose: () => void; onSelectSort: (sort: SortOption) => void }
export const SortModal: React.FC<SortModalProps> = ({ visible, currentSort, onClose, onSelectSort }) => {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const choices: { id: SortOption; label: string }[] = [
    { id: 'date_desc', label: t.library.sortDateDesc }, { id: 'date_asc', label: t.library.sortDateAsc },
    { id: 'title_asc', label: t.library.sortTitleAsc }, { id: 'title_desc', label: t.library.sortTitleDesc },
  ];
  useNativeMenu(visible, {
    title: t.library.sort, cancel: t.common.cancel, isDark, onClose,
    actions: choices.map(({ id, label }) => ({ label: currentSort === id ? `✓ ${label}` : label, run: () => onSelectSort(id) })),
  });
  return null;
};
