/**
 * Persisted attempt limit for the ScanFlow PIN (pure, unit-tested).
 *
 * The 5th wrong PIN in a row starts a waiting period of 30 s; every further
 * wrong PIN starts a longer one: 1 min → 5 min → 15 min (stays at 15 min).
 * No PIN is checked (or counted) while a waiting period runs.
 * A correct PIN or a successful Face ID / Touch ID resets the counter.
 * The state lives in the Keychain, so restarting the app does not reset it.
 */

export interface LockoutState {
  /** Wrong PINs since the last successful unlock. */
  failures: number;
  /** Epoch ms until which no PIN is accepted (0 = none). */
  lockedUntil: number;
  /** Epoch ms of the last wrong PIN (detects a clock set backwards). */
  lastFailureAt: number;
}

export const FREE_ATTEMPTS = 5;
export const LOCKOUT_STEPS_MS: readonly number[] = [30_000, 60_000, 5 * 60_000, 15 * 60_000];
export const EMPTY_LOCKOUT: LockoutState = { failures: 0, lockedUntil: 0, lastFailureAt: 0 };

/** Waiting period after the n-th wrong PIN (0 while attempts are left). */
export function lockoutDurationMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return LOCKOUT_STEPS_MS[Math.min(failures - FREE_ATTEMPTS, LOCKOUT_STEPS_MS.length - 1)];
}

export function registerFailure(state: LockoutState, now: number): LockoutState {
  const failures = state.failures + 1;
  const wait = lockoutDurationMs(failures);
  return { failures, lockedUntil: wait > 0 ? now + wait : 0, lastFailureAt: now };
}

/** Wrong PINs left before the next waiting period starts. */
export function attemptsBeforeLockout(state: LockoutState): number {
  return Math.max(0, FREE_ATTEMPTS - state.failures);
}

/**
 * If the device clock was set back behind the last failure, the remaining
 * wait would be stretched or skipped arbitrarily – restart the full wait
 * from `now` instead.
 */
export function normalizeLockout(state: LockoutState, now: number): LockoutState {
  if (now >= state.lastFailureAt) return state;
  const wait = state.lockedUntil > 0 ? Math.max(0, state.lockedUntil - state.lastFailureAt) : 0;
  return { failures: state.failures, lockedUntil: wait > 0 ? now + wait : 0, lastFailureAt: now };
}

export function remainingLockoutMs(state: LockoutState, now: number): number {
  const s = normalizeLockout(state, now);
  return s.lockedUntil > now ? s.lockedUntil - now : 0;
}

export function serializeLockout(state: LockoutState): string {
  return JSON.stringify(state);
}

/** Missing or unreadable state counts as "no failures". */
export function parseLockout(raw: string | null | undefined): LockoutState {
  if (!raw) return EMPTY_LOCKOUT;
  try {
    const v = JSON.parse(raw) as Partial<LockoutState>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
    return { failures: Math.floor(num(v.failures)), lockedUntil: num(v.lockedUntil), lastFailureAt: num(v.lastFailureAt) };
  } catch {
    return EMPTY_LOCKOUT;
  }
}

/** "0:25", "4:59", "15:00" */
export function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
