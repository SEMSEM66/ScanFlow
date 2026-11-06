import type { Adjustments, FilterType, PageFormat, Quad, Rotation } from './types';
import { DEFAULT_ADJUSTMENTS } from './types';
import { clampQuad, isQuadLike } from './geometry';
import { isFilterType } from './filters';
import { serializeAnnotations, type PageAnnotation } from './annotations';

/**
 * (De)serialization of the per-page edit state stored in SQLite plus the
 * render cache key. Pure functions, unit-tested.
 */

/** Bump when the rendering maths change so cached previews are re-rendered. */
export const RENDER_VERSION = 2;

export function parseCorners(json: string | null | undefined): Quad | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return isQuadLike(v) ? clampQuad(v) : null;
  } catch {
    return null;
  }
}

export function serializeCorners(q: Quad | null | undefined): string | null {
  if (!q) return null;
  return JSON.stringify(clampQuad(q).map((p) => ({ x: round4(p.x), y: round4(p.y) })));
}

const clamp = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

export function normalizeAdjustments(v: Partial<Adjustments> | null | undefined): Adjustments {
  return {
    brightness: clamp(v?.brightness, -1, 1, DEFAULT_ADJUSTMENTS.brightness),
    contrast: clamp(v?.contrast, -1, 1, DEFAULT_ADJUSTMENTS.contrast),
    sharpness: clamp(v?.sharpness, 0, 1, DEFAULT_ADJUSTMENTS.sharpness),
    denoise: typeof v?.denoise === 'boolean' ? v.denoise : DEFAULT_ADJUSTMENTS.denoise,
  };
}

export function parseAdjustments(json: string | null | undefined): Adjustments {
  if (!json) return { ...DEFAULT_ADJUSTMENTS };
  try {
    return normalizeAdjustments(JSON.parse(json));
  } catch {
    return { ...DEFAULT_ADJUSTMENTS };
  }
}

export function isDefaultAdjustments(a: Adjustments): boolean {
  return (
    a.brightness === DEFAULT_ADJUSTMENTS.brightness &&
    a.contrast === DEFAULT_ADJUSTMENTS.contrast &&
    a.sharpness === DEFAULT_ADJUSTMENTS.sharpness &&
    a.denoise === DEFAULT_ADJUSTMENTS.denoise
  );
}

export function serializeAdjustments(a: Adjustments | null | undefined): string | null {
  if (!a) return null;
  const n = normalizeAdjustments(a);
  return isDefaultAdjustments(n) ? null : JSON.stringify(n);
}

export function normalizeRotation(v: unknown): Rotation {
  const n = typeof v === 'number' && Number.isFinite(v) ? ((Math.round(v / 90) * 90) % 360 + 360) % 360 : 0;
  return n as Rotation;
}

export function nextRotation(r: Rotation): Rotation {
  return normalizeRotation(r + 90);
}

export function normalizeFilter(v: unknown): FilterType {
  return isFilterType(v) ? v : 'original';
}

export function normalizePageFormat(v: unknown): PageFormat {
  return v === 'a4' || v === 'letter' ? v : 'auto';
}

export interface RenderState {
  originalUri: string;
  corners: Quad | null;
  rotation: Rotation;
  filter: FilterType;
  pageFormat: PageFormat;
  adjustments: Adjustments;
  annotations?: PageAnnotation[];
}

/** Deterministic cache key of a render (state + purpose, e.g. "preview"). */
export function renderKey(state: RenderState, purpose: string): string {
  const s = JSON.stringify([
    RENDER_VERSION,
    purpose,
    state.originalUri,
    serializeCorners(state.corners),
    state.rotation,
    state.filter,
    state.pageFormat,
    serializeAdjustments(state.adjustments),
    serializeAnnotations(state.annotations),
  ]);
  return fnv1a(s);
}

/** 32-bit FNV-1a as 8 hex chars. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
