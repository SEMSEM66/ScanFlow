import { describe, expect, it } from '@jest/globals';
import {
  nextRotation,
  normalizeRotation,
  parseAdjustments,
  parseCorners,
  renderKey,
  serializeAdjustments,
  serializeCorners,
} from '../src/imaging/pageState';
import { DEFAULT_ADJUSTMENTS, Quad } from '../src/imaging/types';

const quad: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.92, y: 0.9 }, { x: 0.08, y: 0.88 }];
const state = { originalUri: 'a.jpg', corners: quad, rotation: 0 as const, filter: 'auto' as const, pageFormat: 'auto' as const, adjustments: DEFAULT_ADJUSTMENTS };

describe('page state', () => {
  it('round-trips corners and rejects garbage', () => {
    expect(parseCorners(serializeCorners(quad))).toEqual(quad);
    expect(parseCorners('{"x":1}')).toBeNull();
    expect(parseCorners('nope')).toBeNull();
    expect(parseCorners(null)).toBeNull();
    expect(parseCorners(JSON.stringify([{ x: -1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]))?.[0].x).toBe(0);
  });

  it('stores default adjustments as NULL and clamps values', () => {
    expect(serializeAdjustments(DEFAULT_ADJUSTMENTS)).toBeNull();
    expect(parseAdjustments(null)).toEqual(DEFAULT_ADJUSTMENTS);
    expect(parseAdjustments('{"brightness":5,"contrast":-0.5,"denoise":true}')).toEqual({
      brightness: 1,
      contrast: -0.5,
      sharpness: 0.5,
      denoise: true,
    });
  });

  it('normalizes rotation', () => {
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation('x')).toBe(0);
    expect(nextRotation(270)).toBe(0);
  });

  it('render key changes with every visible parameter', () => {
    const k = renderKey(state, 'preview');
    expect(renderKey({ ...state }, 'preview')).toBe(k);
    expect(renderKey({ ...state, filter: 'magicColor' }, 'preview')).not.toBe(k);
    expect(renderKey({ ...state, rotation: 90 }, 'preview')).not.toBe(k);
    expect(renderKey({ ...state, corners: null }, 'preview')).not.toBe(k);
    expect(renderKey({ ...state, pageFormat: 'a4' }, 'preview')).not.toBe(k);
    expect(renderKey({ ...state, adjustments: { ...DEFAULT_ADJUSTMENTS, contrast: 0.2 } }, 'preview')).not.toBe(k);
    expect(renderKey(state, 'thumb')).not.toBe(k);
    expect(k).toMatch(/^[0-9a-f]{8}$/);
  });
});
