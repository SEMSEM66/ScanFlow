import { useEffect, useRef } from 'react';
import { ActionSheetIOS } from 'react-native';
import { ocrService } from '../services/OcrService';

interface MenuAction { label: string; run: () => void; destructive?: boolean }
interface MenuConfig { title: string; cancel: string; isDark: boolean; actions: MenuAction[]; onClose: () => void }

/** UIAlertAction's handler fires during dismissal, so defer follow-up presentations. */
export function useNativeMenu(visible: boolean, config: MenuConfig | null) {
  const latest = useRef(config);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  useEffect(() => { latest.current = config; });
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);
  const menuKey = visible && config ? config.title : null;
  useEffect(() => {
    if (!visible || !latest.current) return;
    const menu = latest.current;
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    releaseRef.current?.();
    const releaseOcr = ocrService.hold();
    releaseRef.current = releaseOcr;
    const cancelIndex = menu.actions.length;
    ActionSheetIOS.showActionSheetWithOptions({
      title: menu.title,
      options: [...menu.actions.map((action) => action.label), menu.cancel],
      cancelButtonIndex: cancelIndex,
      destructiveButtonIndex: menu.actions.flatMap((action, index) => action.destructive ? [index] : []),
      userInterfaceStyle: menu.isDark ? 'dark' : 'light',
    }, (index) => {
      menu.onClose();
      const action = menu.actions[index];
      if (action) {
        pending.current = setTimeout(() => {
          pending.current = null;
          releaseRef.current?.();
          releaseRef.current = null;
          action.run();
        }, 350);
      } else {
        releaseRef.current?.();
        releaseRef.current = null;
      }
    });
  }, [visible, menuKey]);
}
