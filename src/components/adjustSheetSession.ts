import type { Adjustments } from '../types';

/** In-memory bridge to the still-mounted editor; no adjustment data is serialized in a route. */
export interface AdjustSheetSession {
  owner: symbol;
  value: Adjustments;
  onChange: (value: Adjustments) => void;
  onApplyToAll: () => void;
}
let current: AdjustSheetSession | null = null;
const listeners = new Set<() => void>();
export const adjustSheetSession = {
  get: () => current,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  publish: (next: AdjustSheetSession) => { current = next; listeners.forEach((listener) => listener()); },
  clear: (owner: symbol) => {
    if (current?.owner !== owner) return;
    current = null;
    listeners.forEach((listener) => listener());
  },
};
