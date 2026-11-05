import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MODAL_DISMISS_FALLBACK_MS, ModalHandoff } from '../src/components/modalHandoff';

/** Tracks whether a promise has settled (after flushing pending microtasks). */
function track(p: Promise<void>) {
  const state = { settled: false };
  p.then(() => {
    state.settled = true;
  });
  return state;
}

describe('ModalHandoff (export sheet → share sheet)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('hides the modal right away and waits for onDismiss', async () => {
    const handoff = new ModalHandoff();
    const hide = jest.fn();
    const closed = track(handoff.close(hide));

    expect(hide).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(500); // slide-out animation still running
    expect(closed.settled).toBe(false);
    expect(handoff.pending).toBe(true);

    handoff.onDismiss();
    await jest.advanceTimersByTimeAsync(0);
    expect(closed.settled).toBe(true);
    expect(handoff.pending).toBe(false);
    expect(jest.getTimerCount()).toBe(0); // fallback timer cleared
  });

  it('resolves after the fallback delay when onDismiss never arrives', async () => {
    const handoff = new ModalHandoff();
    const closed = track(handoff.close(() => {}));

    await jest.advanceTimersByTimeAsync(MODAL_DISMISS_FALLBACK_MS - 1);
    expect(closed.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(closed.settled).toBe(true);
    expect(handoff.pending).toBe(false);

    handoff.onDismiss(); // late event: no effect, no error
    expect(handoff.pending).toBe(false);
  });

  it('ignores an onDismiss from an earlier close (user closed the sheet before)', async () => {
    const handoff = new ModalHandoff(1000);
    handoff.onDismiss(); // nobody waiting
    const closed = track(handoff.close(() => {}));
    await jest.advanceTimersByTimeAsync(0);
    expect(closed.settled).toBe(false);

    handoff.onDismiss();
    await jest.advanceTimersByTimeAsync(0);
    expect(closed.settled).toBe(true);
  });

  it('settles every waiting close on one onDismiss', async () => {
    const handoff = new ModalHandoff(1000);
    const a = track(handoff.close(() => {}));
    const b = track(handoff.close(() => {}));

    handoff.onDismiss();
    await jest.advanceTimersByTimeAsync(0);
    expect(a.settled).toBe(true);
    expect(b.settled).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('can be reused for the next export', async () => {
    const handoff = new ModalHandoff(1000);
    const first = track(handoff.close(() => {}));
    handoff.onDismiss();
    await jest.advanceTimersByTimeAsync(0);
    expect(first.settled).toBe(true);

    const second = track(handoff.close(() => {}));
    await jest.advanceTimersByTimeAsync(999);
    expect(second.settled).toBe(false);
    handoff.onDismiss();
    await jest.advanceTimersByTimeAsync(0);
    expect(second.settled).toBe(true);
  });

  it('keeps the default fallback well above the iOS sheet animation', () => {
    expect(MODAL_DISMISS_FALLBACK_MS).toBeGreaterThanOrEqual(1000);
  });
});
