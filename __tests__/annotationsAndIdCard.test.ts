import { describe, expect, it } from '@jest/globals';
import {
  fitSignatureStrokes,
  parseAnnotations,
  serializeAnnotations,
  smoothStrokePoints,
  thresholdSignatureRgba,
  type PageAnnotation,
} from '../src/imaging/annotations';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  ID1_ASPECT,
  ID1_HEIGHT_MM,
  ID1_WIDTH_MM,
  computeIdCardA4Placement,
  formatIdCardWatermark,
} from '../src/imaging/idCard';
import { RENDER_VERSION } from '../src/imaging/pageState';

describe('M2 annotations & signatures (pure logic)', () => {
  it('bumps RENDER_VERSION to 2 for schema v4 annotation support', () => {
    expect(RENDER_VERSION).toBe(2);
  });

  it('round-trips valid annotations and drops invalid ones', () => {
    const items: PageAnnotation[] = [
      {
        id: 'sig1',
        type: 'signature',
        x: 0.2,
        y: 0.7,
        width: 0.35,
        height: 0.12,
        rotation: 0,
        color: '#0B2E6B',
        opacity: 1,
        strokes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
      },
      {
        id: 'stamp1',
        type: 'date_stamp',
        x: 0.6,
        y: 0.85,
        width: 0.25,
        height: 0.06,
        rotation: 0,
        color: '#D91E2A',
        opacity: 0.9,
        text: '06.11.2026',
      },
    ];
    const json = serializeAnnotations(items);
    expect(json).not.toBeNull();
    expect(parseAnnotations(json)).toEqual(items);
    expect(serializeAnnotations([])).toBeNull();
    expect(parseAnnotations(null)).toEqual([]);
    expect(parseAnnotations('[{"id":"x","type":"unknown"}]')).toEqual([]);
  });

  it('smooths raw stroke points and fits signature strokes to bounding box', () => {
    const raw = [
      { x: 0.2, y: 0.3 },
      { x: 0.5, y: 0.4 },
      { x: 0.8, y: 0.3 },
    ];
    const smoothed = smoothStrokePoints(raw);
    expect(smoothed.length).toBeGreaterThan(raw.length);
    const fitted = fitSignatureStrokes([raw]);
    expect(fitted.strokes.length).toBe(1);
    expect(fitted.aspectRatio).toBeGreaterThan(1.5);
  });

  it('thresholds a paper signature RGBA image to transparent background and colored ink (P1)', () => {
    // 4x2 image: first pixel dark ink (20,20,20), rest bright paper (240,240,240)
    const data = new Uint8Array(8 * 4);
    for (let i = 0; i < 8; i++) {
      const v = i === 0 ? 20 : 240;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const out = thresholdSignatureRgba({ width: 4, height: 2, data }, '#0B2E6B');
    // First pixel has non-zero alpha and ink blue channel
    expect(out.data[3]).toBeGreaterThan(200);
    expect(out.data[2]).toBe(0x6b);
    // Paper pixel has alpha = 0
    expect(out.data[4 + 3]).toBe(0);
  });
});

describe('M2 ID-card mode true-scale A4 geometry', () => {
  it('places two ID-1 cards (85.6 × 54 mm) centered at true 1:1 scale on A4 (210 × 297 mm)', () => {
    const p = computeIdCardA4Placement(300);
    // 210 mm at 300 dpi = 2480 px; 297 mm at 300 dpi = 3508 px
    expect(p.a4WidthPx).toBe(2480);
    expect(p.a4HeightPx).toBe(3508);
    // 85.6 mm at 300 dpi = 1011 px; 54 mm at 300 dpi = 638 px
    expect(p.cardWidthPx).toBe(1011);
    expect(p.cardHeightPx).toBe(638);
    expect(p.cardWidthPx / p.cardHeightPx).toBeCloseTo(ID1_ASPECT, 2);
    expect(p.cardWidthPx / p.a4WidthPx).toBeCloseTo(ID1_WIDTH_MM / A4_WIDTH_MM, 2);
    expect(p.cardHeightPx / p.a4HeightPx).toBeCloseTo(ID1_HEIGHT_MM / A4_HEIGHT_MM, 2);
    // Centered horizontally
    expect(p.frontRect.x).toBe(p.backRect.x);
    expect(Math.abs(p.frontRect.x - (p.a4WidthPx - p.cardWidthPx - p.frontRect.x))).toBeLessThanOrEqual(1);
    // Back card sits below front card without overlap
    expect(p.backRect.y).toBeGreaterThan(p.frontRect.y + p.frontRect.height);
  });

  it('formats purpose watermarks in DE and EN', () => {
    expect(formatIdCardWatermark('Mietvertrag', '06.11.2026', 'de')).toBe(
      'Kopie - nur fuer Mietvertrag, 06.11.2026'
    );
    expect(formatIdCardWatermark('Rental Agreement', '11/06/2026', 'en')).toBe(
      'Copy - only for Rental Agreement, 11/06/2026'
    );
    expect(formatIdCardWatermark('', '06.11.2026', 'de')).toBe('KOPIE - 06.11.2026');
  });
});
