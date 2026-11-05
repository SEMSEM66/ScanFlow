import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OcrScheduler, type OcrCandidate, type OcrEvent, type OcrLimits } from '../src/ocr/scheduler';

const LIMITS: OcrLimits = { attemptsPerPage: 2, maxConsecutiveFailures: 3, pauseMs: 0, debounceMs: 100 };

const cand = (pageId: string, documentId: string, pageNumber: number, documentCreatedAt: number, key = 'k1'): OcrCandidate => ({
  pageId,
  documentId,
  key,
  pageNumber,
  documentCreatedAt,
});

/** In-memory queue: processed pages leave the pending list (like a saved text). */
function setup(initial: OcrCandidate[], opts: { fail?: (c: OcrCandidate) => boolean; limits?: OcrLimits } = {}) {
  const pending = new Map(initial.map((c) => [c.pageId, c]));
  const processed: string[] = [];
  const events: OcrEvent[] = [];
  const errors: string[] = [];
  const state = { canRun: true, keepPending: false };
  let onProcess: ((c: OcrCandidate) => void) | null = null;
  const scheduler = new OcrScheduler(
    {
      listPending: async () => [...pending.values()],
      process: async (c) => {
        processed.push(c.pageId);
        onProcess?.(c);
        if (opts.fail?.(c)) throw new Error(`fail ${c.pageId}`);
        if (!state.keepPending) pending.delete(c.pageId);
      },
      canRun: () => state.canRun,
      sleep: async () => undefined,
      onEvent: (e) => void events.push(e),
      onError: (c) => void errors.push(c.pageId),
    },
    opts.limits ?? LIMITS
  );
  return {
    scheduler,
    pending,
    processed,
    events,
    errors,
    state,
    onProcess: (fn: (c: OcrCandidate) => void) => {
      onProcess = fn;
    },
  };
}

describe('OcrScheduler', () => {
  it('orders the prioritized document first, then newest documents, pages in order', () => {
    const { scheduler } = setup([]);
    const list = [
      cand('old-2', 'old', 2, 100),
      cand('new-1', 'new', 1, 300),
      cand('old-1', 'old', 1, 100),
      cand('mid-1', 'mid', 1, 200),
      cand('new-2', 'new', 2, 300),
    ];
    expect(scheduler.order(list).map((c) => c.pageId)).toEqual(['new-1', 'new-2', 'mid-1', 'old-1', 'old-2']);
    scheduler.prioritize('old');
    expect(scheduler.order(list).map((c) => c.pageId)).toEqual(['old-1', 'old-2', 'new-1', 'new-2', 'mid-1']);
  });

  it('processes the queue one page at a time and reports progress', async () => {
    const t = setup([cand('a1', 'a', 1, 1), cand('a2', 'a', 2, 1), cand('b1', 'b', 1, 2)]);
    await t.scheduler.run();
    expect(t.processed).toEqual(['b1', 'a1', 'a2']);
    expect(t.pending.size).toBe(0);
    expect(t.events[0]).toEqual({ type: 'state', running: true });
    expect(t.events.filter((e) => e.type === 'page')).toHaveLength(3);
    expect(t.events[t.events.length - 1]).toEqual({ type: 'state', running: false });
    expect(t.scheduler.isRunning).toBe(false);
  });

  it('does nothing while it may not run and stops when that changes', async () => {
    const t = setup([cand('a1', 'a', 1, 1), cand('a2', 'a', 2, 1)]);
    t.state.canRun = false;
    await t.scheduler.run();
    expect(t.processed).toEqual([]);
    t.state.canRun = true;
    t.onProcess(() => {
      t.state.canRun = false; // e.g. app went to the background
    });
    await t.scheduler.run();
    expect(t.processed).toEqual(['a1']);
  });

  it('a failing page is tried once more in a later run, then reported as failed', async () => {
    const t = setup([cand('bad', 'a', 1, 1), cand('ok', 'a', 2, 1)], { fail: (c) => c.pageId === 'bad' });
    await t.scheduler.run();
    expect(t.processed).toEqual(['bad', 'ok']); // not retried within the run
    expect(t.errors).toEqual(['bad']);
    expect(t.scheduler.hasFailed('bad', 'k1')).toBe(false);
    await t.scheduler.run();
    expect(t.processed).toEqual(['bad', 'ok', 'bad']);
    expect(t.scheduler.hasFailed('bad', 'k1')).toBe(true);
    await t.scheduler.run();
    expect(t.processed).toHaveLength(3); // given up
    // an edited page (new key) is a new attempt; resetFailures allows a retry
    expect(t.scheduler.hasFailed('bad', 'k2')).toBe(false);
    t.scheduler.resetFailures();
    await t.scheduler.run();
    expect(t.processed).toEqual(['bad', 'ok', 'bad', 'bad']);
    expect(t.events.some((e) => e.type === 'page' && !e.ok)).toBe(true);
  });

  it('stops after several failures in a row', async () => {
    const pages = [1, 2, 3, 4, 5].map((n) => cand(`p${n}`, 'a', n, 1));
    const t = setup(pages, { fail: () => true });
    await t.scheduler.run();
    expect(t.processed).toEqual(['p1', 'p2', 'p3']);
  });

  it('handles each page state only once per run (no endless loop)', async () => {
    const t = setup([cand('a1', 'a', 1, 1)]);
    t.state.keepPending = true; // e.g. the save was skipped because the page changed
    await t.scheduler.run();
    expect(t.processed).toEqual(['a1']);
  });

  it('picks up pages added and priorities changed while running', async () => {
    const t = setup([cand('a1', 'a', 1, 1), cand('b1', 'b', 1, 2), cand('b2', 'b', 2, 2)]);
    t.onProcess((c) => {
      if (c.pageId === 'b1') {
        t.pending.set('c1', cand('c1', 'c', 1, 3)); // new scan → newest document first
        t.scheduler.kick();
      }
      if (c.pageId === 'c1') t.scheduler.prioritize('a'); // document "a" opened
    });
    await t.scheduler.run();
    expect(t.processed).toEqual(['b1', 'c1', 'a1', 'b2']);
    expect(t.events.filter((e) => e.type === 'state')).toHaveLength(2); // one run
  });

  describe('timers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('debounces kicks into one run', async () => {
      const t = setup([cand('a1', 'a', 1, 1)]);
      t.scheduler.kick();
      t.scheduler.kick();
      await jest.advanceTimersByTimeAsync(50);
      t.scheduler.kick();
      await jest.advanceTimersByTimeAsync(99);
      expect(t.processed).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);
      expect(t.processed).toEqual(['a1']);
      expect(t.events.filter((e) => e.type === 'state' && e.running)).toHaveLength(1);
    });

    it('pauses while held (export) and resumes after the last release', async () => {
      const t = setup([cand('a1', 'a', 1, 1)]);
      const release1 = t.scheduler.hold();
      const release2 = t.scheduler.hold();
      t.scheduler.kick(0);
      await jest.advanceTimersByTimeAsync(10);
      expect(t.processed).toEqual([]);
      release1();
      release1(); // releasing twice is harmless
      await jest.advanceTimersByTimeAsync(500);
      expect(t.processed).toEqual([]);
      release2();
      await jest.advanceTimersByTimeAsync(100);
      expect(t.processed).toEqual(['a1']);
    });

    it('cancel() drops a pending start', async () => {
      const t = setup([cand('a1', 'a', 1, 1)]);
      t.scheduler.kick();
      t.scheduler.cancel();
      await jest.advanceTimersByTimeAsync(1000);
      expect(t.processed).toEqual([]);
    });
  });
});
