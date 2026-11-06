import { describe, expect, it } from '@jest/globals';
import { darkColors, lightColors } from '../src/theme/tokens';

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB hex color (#RRGGBB).
 */
export function getRelativeLuminance(hex: string): number {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  const r8 = (num >> 16) & 255;
  const g8 = (num >> 8) & 255;
  const b8 = num & 255;

  const toLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const rLin = toLinear(r8);
  const gLin = toLinear(g8);
  const bLin = toLinear(b8);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two colors (range 1.0 to 21.0).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme Contrast & WCAG AA Compliance', () => {
  describe('Light Mode', () => {
    it('textPrimary meets WCAG AA (≥ 4.5:1) on background and surfaces', () => {
      const onBg = getContrastRatio(lightColors.textPrimary, lightColors.background);
      const onSurface = getContrastRatio(lightColors.textPrimary, lightColors.surface);
      const onCard = getContrastRatio(lightColors.textPrimary, lightColors.card);
      const onSubdued = getContrastRatio(lightColors.textPrimary, lightColors.surfaceSubdued);

      expect(onBg).toBeGreaterThanOrEqual(4.5);
      expect(onSurface).toBeGreaterThanOrEqual(4.5);
      expect(onCard).toBeGreaterThanOrEqual(4.5);
      expect(onSubdued).toBeGreaterThanOrEqual(4.5);
    });

    it('textSecondary meets WCAG AA (≥ 4.5:1) on background and surface', () => {
      const onBg = getContrastRatio(lightColors.textSecondary, lightColors.background);
      const onSurface = getContrastRatio(lightColors.textSecondary, lightColors.surface);

      expect(onBg).toBeGreaterThanOrEqual(4.5);
      expect(onSurface).toBeGreaterThanOrEqual(4.5);
    });

    it('primary accent button meets UI component contrast (≥ 3.0:1) on background', () => {
      const ratio = getContrastRatio(lightColors.primary, lightColors.background);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it('white text on primary button meets WCAG AA text contrast (≥ 4.5:1)', () => {
      const ratio = getContrastRatio(lightColors.textInverse, lightColors.primary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('destructive/danger actions meet UI contrast (≥ 3.0:1) on background', () => {
      const ratio = getContrastRatio(lightColors.danger, lightColors.background);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe('Dark Mode', () => {
    it('textPrimary meets WCAG AA (≥ 4.5:1) on background and surfaces', () => {
      const onBg = getContrastRatio(darkColors.textPrimary, darkColors.background);
      const onSurface = getContrastRatio(darkColors.textPrimary, darkColors.surface);
      const onCard = getContrastRatio(darkColors.textPrimary, darkColors.card);
      const onSubdued = getContrastRatio(darkColors.textPrimary, darkColors.surfaceSubdued);

      expect(onBg).toBeGreaterThanOrEqual(4.5);
      expect(onSurface).toBeGreaterThanOrEqual(4.5);
      expect(onCard).toBeGreaterThanOrEqual(4.5);
      expect(onSubdued).toBeGreaterThanOrEqual(4.5);
    });

    it('textSecondary meets WCAG AA (≥ 4.5:1) on background and surface', () => {
      const onBg = getContrastRatio(darkColors.textSecondary, darkColors.background);
      const onSurface = getContrastRatio(darkColors.textSecondary, darkColors.surface);

      expect(onBg).toBeGreaterThanOrEqual(4.5);
      expect(onSurface).toBeGreaterThanOrEqual(4.5);
    });

    it('primary accent button meets UI component contrast (≥ 3.0:1) on background', () => {
      const ratio = getContrastRatio(darkColors.primary, darkColors.background);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it('destructive/danger actions meet UI contrast (≥ 3.0:1) on background', () => {
      const ratio = getContrastRatio(darkColors.danger, darkColors.background);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  });
});
