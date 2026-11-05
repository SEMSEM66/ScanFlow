/**
 * When does the app lock? (pure state machine, unit-tested)
 *
 * iOS reports `inactive` for Face ID / passcode prompts, Control Center,
 * Notification Center, system alerts and the app switcher – the app is still
 * on screen. Only `background` means the user really left the app. v1.3.0
 * locked on `inactive` too, so every Face ID prompt (which makes the app
 * inactive) relocked the app right after unlocking it → endless Face ID loop.
 *
 * Rules:
 *  - lock at launch when the app lock is on,
 *  - `background`: remember the time; timeout "immediately" locks right away
 *    (the app-switcher snapshot and the return then show the lock screen),
 *  - `active` after a `background`: lock when the time away ≥ timeout
 *    (or the clock went backwards); ask for Face ID once per return,
 *  - `inactive` never changes anything,
 *  - an unlock that completes while the app is in the background is ignored.
 */

export type LockTimeoutSec = 0 | 60 | 300;
export type AppStateName = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export interface LockConfig {
  enabled: boolean;
  timeoutSec: LockTimeoutSec;
}

export interface LockState {
  locked: boolean;
  /** Epoch ms when the app went to the background (null while in the foreground). */
  backgroundAt: number | null;
  /** Show the Face ID / passcode prompt automatically (once per lock / return). */
  autoPrompt: boolean;
}

export const UNLOCKED: LockState = { locked: false, backgroundAt: null, autoPrompt: false };

export function initialLockState(config: LockConfig): LockState {
  return config.enabled ? { locked: true, backgroundAt: null, autoPrompt: true } : UNLOCKED;
}

export function onAppStateChange(state: LockState, next: AppStateName, config: LockConfig, now: number): LockState {
  if (!config.enabled) return UNLOCKED;

  if (next === 'background') {
    const backgroundAt = state.backgroundAt ?? now;
    if (config.timeoutSec === 0) return { locked: true, backgroundAt, autoPrompt: true };
    return { ...state, backgroundAt };
  }

  if (next === 'active') {
    if (state.backgroundAt === null) return state; // back from Face ID / Control Center / alert
    const away = now - state.backgroundAt;
    const expired = away < 0 || away >= config.timeoutSec * 1000;
    const locked = state.locked || expired;
    return { locked, backgroundAt: null, autoPrompt: locked };
  }

  return state; // inactive / unknown / extension
}

/** Successful Face ID / passcode / PIN. */
export function onUnlocked(state: LockState, currentAppState: AppStateName): LockState {
  // The user left again before the result arrived – keep the lock for the return.
  if (currentAppState === 'background') return state;
  return UNLOCKED;
}

/** The automatic prompt was shown (or is not wanted any more). */
export function consumeAutoPrompt(state: LockState): LockState {
  return state.autoPrompt ? { ...state, autoPrompt: false } : state;
}

/** Settings changed while the app is open (the user is already authenticated). */
export function onConfigChange(state: LockState, config: LockConfig): LockState {
  return config.enabled ? state : UNLOCKED;
}
