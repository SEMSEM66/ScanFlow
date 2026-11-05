/**
 * Hand-off from a closing React Native `<Modal>` to a native presentation
 * (share sheet, photo picker, scanner).
 *
 * iOS shows one presented view controller at a time. A native sheet that is
 * presented while a modal is still animating out is dropped by UIKit, and the
 * promise of the presenting call never settles (e.g. expo-sharing's
 * `shareAsync()` → the export hung on "Seite wird berechnet …" in v1.5.0).
 *
 * `close()` hides the modal and resolves once the modal reports `onDismiss`
 * (React Native sends it after the dismiss animation) – or after a fallback
 * delay if that event never arrives (e.g. the modal was not on screen).
 *
 * Pure TypeScript (no React / Expo imports) → unit-tested in Node.
 */

/** Fallback when `onDismiss` never arrives; above the sheet's 0.28 s glide-out plus BottomSheet's own 1 s fallback. */
export const MODAL_DISMISS_FALLBACK_MS = 1500;

export class ModalHandoff {
  private readonly waiters = new Set<() => void>();

  constructor(private readonly fallbackMs: number = MODAL_DISMISS_FALLBACK_MS) {}

  /** Calls `hide` (e.g. `() => setVisible(false)`) and resolves once the modal is gone. */
  close(hide: () => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, this.fallbackMs);
      this.waiters.add(done);
      hide();
    });
  }

  /** True while a `close()` is waiting for the modal to disappear. */
  get pending(): boolean {
    return this.waiters.size > 0;
  }

  /** Pass to the modal's `onDismiss` prop (stable function). */
  readonly onDismiss = (): void => {
    for (const done of [...this.waiters]) done();
  };
}
