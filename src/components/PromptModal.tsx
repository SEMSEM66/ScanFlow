import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

interface PromptModalProps {
  visible: boolean; title: string; initialValue?: string; placeholder?: string; confirmText?: string;
  onConfirm: (value: string) => void; onClose: () => void;
}
export const PromptModal: React.FC<PromptModalProps> = (props) => {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const latest = useRef({ props, isDark, t });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { latest.current = { props, isDark, t }; });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!props.visible) return;
    const { props: options, isDark: dark, t: translations } = latest.current;
    const show = (initial: string) => Alert.prompt(options.title, options.placeholder || undefined, [
      { text: translations.common.cancel, style: 'cancel', onPress: options.onClose },
      { text: options.confirmText || translations.common.save, onPress: (input?: string) => {
        const value = (input ?? '').trim();
        if (!value) {
          // Native prompts dismiss on every button; reopen for an empty name, as the old disabled Save did.
          timer.current = setTimeout(() => { timer.current = null; show(input ?? ''); }, 500);
          return;
        }
        options.onClose();
        options.onConfirm(value);
      } },
    ], 'plain-text', initial, 'default', { userInterfaceStyle: dark ? 'dark' : 'light' });
    show(options.initialValue ?? '');
  }, [props.visible]);
  return null;
};
