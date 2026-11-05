import type { Adjustments, FilterType } from './types';

/**
 * Filter presets of the enhancement shader. Tuned with
 * tools/prototype/enhance_prototype.py (FILTERS) – keep both in sync.
 */
export interface FilterPreset {
  /** 0 = keep photo colours, 1 = divide by the paper background estimate. */
  normalize: number;
  black: number;
  white: number;
  gamma: number;
  saturation: number;
  sharpen: number;
  /** 0 colour, 1 grayscale, 2 black & white */
  mode: 0 | 1 | 2;
  /** paint the border mask / edge band white */
  clean: boolean;
  bwThreshold: number;
  bwSoftness: number;
}

const base: FilterPreset = {
  normalize: 1,
  black: 0,
  white: 1,
  gamma: 1,
  saturation: 1,
  sharpen: 0,
  mode: 0,
  clean: true,
  bwThreshold: 0.72,
  bwSoftness: 0.1,
};

export const FILTER_PRESETS: Record<FilterType, FilterPreset> = {
  original: { ...base, normalize: 0, clean: false },
  auto: { ...base, black: 0.2, white: 0.9, gamma: 1.15, saturation: 1.1, sharpen: 0.6 },
  magicColor: { ...base, black: 0.24, white: 0.88, gamma: 1.05, saturation: 1.55, sharpen: 0.7 },
  removeShadows: { ...base, black: 0.05, white: 0.93, sharpen: 0.3 },
  lighten: { ...base, white: 0.95, gamma: 0.7, sharpen: 0.2 },
  grayscale: { ...base, black: 0.22, white: 0.88, gamma: 1.25, saturation: 0, sharpen: 0.7, mode: 1 },
  blackAndWhite: { ...base, saturation: 0, sharpen: 1.0, mode: 2, bwThreshold: 0.72, bwSoftness: 0.1 },
};

export const FILTER_ORDER: FilterType[] = [
  'original',
  'auto',
  'magicColor',
  'removeShadows',
  'lighten',
  'grayscale',
  'blackAndWhite',
];

export function isFilterType(v: unknown): v is FilterType {
  return typeof v === 'string' && (FILTER_ORDER as string[]).includes(v);
}

/** Does this filter need the background-estimation pass? */
export function needsBackground(filter: FilterType): boolean {
  const p = FILTER_PRESETS[filter];
  return p.normalize > 0 || p.clean;
}

/** Sharpness slider 0…1 (0.5 = preset) → unsharp amount. */
export function sharpenAmount(preset: number, slider: number): number {
  const s = Math.min(1, Math.max(0, slider));
  return s <= 0.5 ? preset * (s / 0.5) : preset + ((s - 0.5) / 0.5) * (1.5 - preset);
}

export interface ShaderParams {
  normalize: number;
  black: number;
  white: number;
  gamma: number;
  saturation: number;
  sharpen: number;
  mode: number;
  bwThreshold: number;
  bwSoftness: number;
  brightness: number;
  contrast: number;
  denoise: number;
  clean: number;
}

export function shaderParams(filter: FilterType, adj: Adjustments): ShaderParams {
  const p = FILTER_PRESETS[filter] ?? FILTER_PRESETS.auto;
  return {
    normalize: p.normalize,
    black: p.black,
    white: p.white,
    gamma: p.gamma,
    saturation: p.saturation,
    sharpen: sharpenAmount(p.sharpen, adj.sharpness),
    mode: p.mode,
    bwThreshold: p.bwThreshold,
    bwSoftness: p.bwSoftness,
    brightness: clamp(adj.brightness, -1, 1) * 0.25,
    contrast: 1 + clamp(adj.contrast, -1, 1) * 0.6,
    denoise: adj.denoise ? 1 : 0,
    clean: p.clean ? 1 : 0,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));

/**
 * CPU reference of the per-pixel shader math (no neighbourhood: sharpen and
 * denoise are skipped). Used by tests to check the SkSL port.
 */
export function enhancePixelReference(
  rgb: [number, number, number],
  bg: [number, number, number],
  sp: ShaderParams
): [number, number, number] {
  const L = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  let n = rgb.map((c, i) => c * (1 - sp.normalize) + (c / Math.max(bg[i], 0.04)) * sp.normalize);
  if (sp.mode > 0.5) {
    const l = L(n);
    n = [l, l, l];
  }
  n = n.map((c) => Math.pow(Math.min(1, Math.max(0, (c - sp.black) / (sp.white - sp.black))), sp.gamma));
  if (sp.mode < 0.5) {
    const l = L(n);
    n = n.map((c) => l + (c - l) * sp.saturation);
  }
  if (sp.mode > 1.5) {
    const e0 = sp.bwThreshold - sp.bwSoftness;
    const e1 = sp.bwThreshold + sp.bwSoftness;
    const t = Math.min(1, Math.max(0, (n[0] - e0) / (e1 - e0)));
    const v = t * t * (3 - 2 * t);
    n = [v, v, v];
  }
  n = n.map((c) => (c - 0.5) * sp.contrast + 0.5 + sp.brightness);
  return n.map((c) => Math.min(1, Math.max(0, c))) as [number, number, number];
}
