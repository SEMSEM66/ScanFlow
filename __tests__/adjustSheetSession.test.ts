import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { adjustSheetSession } from '../src/components/adjustSheetSession';
import type { Adjustments } from '../src/types';

const owner = Symbol('owner');
const value: Adjustments = { brightness: 0, contrast: 0, sharpness: 0, denoise: false };
afterEach(() => adjustSheetSession.clear(owner));

describe('adjustment sheet session', () => {
  it('publishes updates and only the owner may clear them', () => {
    const listener = jest.fn();
    const unsubscribe = adjustSheetSession.subscribe(listener);
    const session = { owner, value, onChange: jest.fn(), onApplyToAll: jest.fn() };
    adjustSheetSession.publish(session);
    expect(adjustSheetSession.get()).toBe(session);
    adjustSheetSession.clear(Symbol('other'));
    expect(adjustSheetSession.get()).toBe(session);
    adjustSheetSession.clear(owner);
    expect(adjustSheetSession.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
