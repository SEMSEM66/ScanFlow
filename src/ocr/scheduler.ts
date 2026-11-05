/**
 * Background OCR queue (pure logic, dependencies injected – unit-tested in
 * __tests__/ocrScheduler.test.ts). One page at a time with a short pause in
 * between, only while `canRun()` (app in the foreground, OCR switched on).
 *
 * Order: the prioritized document first, then the newest documents; pages in
 * page order. A page whose recognition fails is retried once per state; after
 * several failures in a row the run stops until the next kick().
 */

export interface OcrCandidate {
  pageId: string;
  documentId: string;
  /** ocrKey() of the page's current state. */
  key: string;
  pageNumber: number;
  /** Creation time of the document (newer documents first). */
  documentCreatedAt: number;
}

export type OcrEvent =
  | { type: 'page'; pageId: string; documentId: string; ok: boolean }
  | { type: 'state'; running: boolean };

export interface OcrSchedulerDeps {
  /** Pages whose stored text is missing or outdated. */
  listPending(): Promise<OcrCandidate[]>;
  /** Recognizes one page and stores the text (skips the save if the page changed meanwhile). */
  process(candidate: OcrCandidate): Promise<void>;
  canRun(): boolean | Promise<boolean>;
  sleep(ms: number): Promise<void>;
  onEvent?(event: OcrEvent): void;
  onError?(candidate: OcrCandidate, error: unknown): void;
}

export interface OcrLimits {
  /** Attempts per page state. */
  attemptsPerPage: number;
  /** Failures in a row that stop the current run. */
  maxConsecutiveFailures: number;
  /** Pause between two pages (keeps the UI responsive). */
  pauseMs: number;
  /** Delay of kick() (several triggers in a row → one run). */
  debounceMs: number;
}

export const DEFAULT_OCR_LIMITS: OcrLimits = {
  attemptsPerPage: 2,
  maxConsecutiveFailures: 5,
  pauseMs: 350,
  debounceMs: 1200,
};

const keyOf = (c: Pick<OcrCandidate, 'pageId' | 'key'>) => `${c.pageId}|${c.key}`;

export class OcrScheduler {
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private priority: string | null = null;
  private priorityChanged = false;
  private holds = 0;
  private failures = new Map<string, number>();
  private current: OcrCandidate | null = null;

  constructor(
    private readonly deps: OcrSchedulerDeps,
    private readonly limits: OcrLimits = DEFAULT_OCR_LIMITS
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Page being recognized right now. */
  get currentPageId(): string | null {
    return this.current?.pageId ?? null;
  }

  /** Starts a run after the debounce delay (or re-lists the queue of a running one). */
  kick(delayMs: number = this.limits.debounceMs): void {
    if (this.running) {
      this.again = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
  }

  /** Recognize the pages of this document first (null = no preference). */
  prioritize(documentId: string | null): void {
    if (this.priority === documentId) return;
    this.priority = documentId;
    this.priorityChanged = true;
  }

  /** Pauses background work (e.g. during an export); call the returned function to resume. */
  hold(): () => void {
    this.holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
      if (this.holds === 0) this.kick();
    };
  }

  /** True when this page state failed too often (shown as "not recognized"). */
  hasFailed(pageId: string, key: string): boolean {
    return (this.failures.get(keyOf({ pageId, key })) ?? 0) >= this.limits.attemptsPerPage;
  }

  /** Allows failed pages to be tried again. */
  resetFailures(): void {
    this.failures.clear();
  }

  /** Stops a pending debounced start (running work finishes its page). */
  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  order(list: OcrCandidate[]): OcrCandidate[] {
    const p = this.priority;
    return [...list].sort((a, b) => {
      const pa = a.documentId === p ? 0 : 1;
      const pb = b.documentId === p ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (a.documentId !== b.documentId) {
        return b.documentCreatedAt - a.documentCreatedAt || (a.documentId < b.documentId ? -1 : 1);
      }
      return a.pageNumber - b.pageNumber;
    });
  }

  private async allowed(): Promise<boolean> {
    if (this.holds > 0) return false;
    try {
      return await this.deps.canRun();
    } catch {
      return false;
    }
  }

  /** Processes the queue until it is empty, paused or failing. */
  async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.cancel();
    this.running = true;
    this.deps.onEvent?.({ type: 'state', running: true });
    // page states handled in this run – guards against a page that never leaves the queue
    const handled = new Set<string>();
    let consecutive = 0;
    try {
      outer: while (true) {
        this.again = false;
        this.priorityChanged = false;
        if (!(await this.allowed())) break;
        const todo = this.order(
          (await this.deps.listPending()).filter((c) => !handled.has(keyOf(c)) && !this.hasFailed(c.pageId, c.key))
        );
        if (todo.length === 0) break;
        for (const c of todo) {
          if (!(await this.allowed())) break outer;
          handled.add(keyOf(c));
          this.current = c;
          let ok = true;
          try {
            await this.deps.process(c);
            consecutive = 0;
          } catch (err) {
            ok = false;
            consecutive++;
            this.failures.set(keyOf(c), (this.failures.get(keyOf(c)) ?? 0) + 1);
            this.deps.onError?.(c, err);
          } finally {
            this.current = null;
          }
          this.deps.onEvent?.({ type: 'page', pageId: c.pageId, documentId: c.documentId, ok });
          if (consecutive >= this.limits.maxConsecutiveFailures) break outer;
          await this.deps.sleep(this.limits.pauseMs);
          // new pages / another document opened → list again
          if (this.again || this.priorityChanged) continue outer;
        }
      }
    } finally {
      this.running = false;
      this.current = null;
      this.deps.onEvent?.({ type: 'state', running: false });
      // kicked while the queue was being listed → run again
      if (this.again) {
        this.again = false;
        this.kick();
      }
    }
  }
}
