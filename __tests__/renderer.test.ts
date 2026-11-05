import { beforeAll, describe, expect, it } from '@jest/globals';
import { loadHeadlessSkia } from './helpers/skia';
import { makeFlatPage, pageMetrics, photograph, PhotoOptions } from './helpers/synthetic';
import { ENHANCE_SKSL, WARP_SKSL } from '../src/imaging/shaders';
import { ENHANCE_UNIFORMS, PageRenderer, SK, SkiaApi, computePageGeometry } from '../src/imaging/renderer';
import { enhancePixelReference, shaderParams } from '../src/imaging/filters';
import { A4_PT } from '../src/imaging/pageFormat';
import type { FilterType, Quad, RgbaImage } from '../src/imaging/types';
import { DEFAULT_ADJUSTMENTS } from '../src/imaging/types';

let Skia: SkiaApi;
let enums: Record<string, Record<string, number>>;
let renderer: PageRenderer;

const FW = 800;
const FH = 1066;
const page = makeFlatPage(1240, 1754, 11); // A4 @150 dpi
const q = (pts: number[][]): Quad => pts.map(([x, y]) => ({ x, y })) as Quad;
const normQ = (c: Quad): Quad => c.map((p) => ({ x: p.x / FW, y: p.y / FH })) as Quad;
const CORNERS = q([[120, 88], [680, 112], [712, 984], [88, 960]]);

/** Moves every corner away from the centroid by `f` of the frame size (too-large crop). */
function grow(c: Quad, f: number): Quad {
  const cx = c.reduce((s, p) => s + p.x, 0) / 4;
  const cy = c.reduce((s, p) => s + p.y, 0) / 4;
  return c.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const l = Math.hypot(dx, dy);
    return { x: p.x + (dx / l) * f * FW, y: p.y + (dy / l) * f * FH };
  }) as Quad;
}

const scenes: Record<string, Omit<PhotoOptions, 'frameWidth' | 'frameHeight' | 'corners'>> = {
  shadow: { background: 'wood', gradient: 0.35, shadow: 0.5, noise: 0.02, seed: 3 },
  strong: { background: 'dark', gradient: 0.6, shadow: 0.35, noise: 0.03, seed: 4 },
  flat: { background: 'light', gradient: 0.1, noise: 0.015, seed: 5 },
};
const photos: Record<string, RgbaImage> = {};

function renderToRgba(photo: RgbaImage, filter: FilterType, corners: Quad, extra: Partial<Parameters<PageRenderer['render']>[1]> = {}) {
  const src = renderer.imageFromRgba(photo.data, photo.width, photo.height);
  const res = renderer.render(src, {
    corners,
    rotation: 0,
    filter,
    pageFormat: 'a4',
    dpi: 150,
    maxLongSide: 800,
    ...extra,
  });
  const rgba = renderer.readRgba(res.image);
  res.image.dispose?.();
  src.dispose?.();
  return { rgba, res };
}

beforeAll(async () => {
  const h = await loadHeadlessSkia();
  Skia = h.Skia;
  enums = h.enums;
  renderer = new PageRenderer(Skia);
  for (const [k, o] of Object.entries(scenes)) photos[k] = photograph(page, { frameWidth: FW, frameHeight: FH, corners: CORNERS, ...o });
});

describe('Skia bindings', () => {
  it('enum constants match @shopify/react-native-skia', () => {
    expect(enums.TileMode.Clamp).toBe(SK.TileMode.Clamp);
    expect(enums.TileMode.Decal).toBe(SK.TileMode.Decal);
    expect(enums.FilterMode.Linear).toBe(SK.FilterMode.Linear);
    expect(enums.MipmapMode.None).toBe(SK.MipmapMode.None);
    expect(enums.ImageFormat.JPEG).toBe(SK.ImageFormat.JPEG);
    expect(enums.ImageFormat.PNG).toBe(SK.ImageFormat.PNG);
    expect(enums.ColorType.RGBA_8888).toBe(SK.ColorType.RGBA_8888);
    expect(enums.AlphaType.Unpremul).toBe(SK.AlphaType.Unpremul);
    expect(enums.AlphaType.Premul).toBe(SK.AlphaType.Premul);
  });

  it('compiles both SkSL shaders with the expected uniform layout', () => {
    const warp = Skia.RuntimeEffect.Make(WARP_SKSL);
    const enhance = Skia.RuntimeEffect.Make(ENHANCE_SKSL);
    expect(warp).not.toBeNull();
    expect(enhance).not.toBeNull();
    const names = Array.from({ length: enhance!.getUniformCount() }, (_, i) => enhance!.getUniformName(i));
    expect(names).toEqual(ENHANCE_UNIFORMS);
    expect(enhance!.getUniformFloatCount()).toBe(30);
    expect(warp!.getUniformFloatCount()).toBe(11);
  });
});

describe('page geometry', () => {
  it('A4 output has the exact A4 aspect and requested DPI', () => {
    const g = computePageGeometry(FW, FH, { corners: normQ(CORNERS), rotation: 0, filter: 'auto', pageFormat: 'a4', dpi: 200 });
    expect(g.page.widthPt).toBeCloseTo(A4_PT.width, 2);
    expect(g.page.heightPt).toBeCloseTo(A4_PT.height, 2);
    expect(g.widthPx).toBe(Math.round((A4_PT.width / 72) * 200));
    expect(g.heightPx).toBe(Math.round((A4_PT.height / 72) * 200));
  });

  it('auto format snaps a near-A4 quad to A4 and rotation swaps the orientation', () => {
    const g0 = computePageGeometry(FW, FH, { corners: normQ(CORNERS), rotation: 0, filter: 'auto', pageFormat: 'auto', dpi: 150 });
    expect(g0.page.widthPt).toBeCloseTo(A4_PT.width, 2);
    const g90 = computePageGeometry(FW, FH, { corners: normQ(CORNERS), rotation: 90, filter: 'auto', pageFormat: 'auto', dpi: 150 });
    expect(g90.page.widthPt).toBeCloseTo(A4_PT.height, 2);
    expect(g90.widthPx).toBe(g0.heightPx);
    expect(g90.heightPx).toBe(g0.widthPx);
  });
});

describe('scan look (headless Skia, same SkSL as the app)', () => {
  const cleanFilters: FilterType[] = ['auto', 'magicColor', 'grayscale', 'blackAndWhite', 'removeShadows'];

  it.each(Object.keys(scenes))('%s scene: white even paper, dark text, no border', (scene) => {
    for (const f of cleanFilters) {
      const { rgba } = renderToRgba(photos[scene], f, normQ(CORNERS));
      const m = pageMetrics(rgba, page);
      const ctx = `${scene}/${f}: ${JSON.stringify(m)}`;
      expect([ctx, m.paperMean >= 245]).toEqual([ctx, true]);
      expect([ctx, m.paperGradient <= 8]).toEqual([ctx, true]);
      expect([ctx, m.borderP1 >= 235]).toEqual([ctx, true]);
      const maxText = f === 'removeShadows' ? 110 : 70;
      expect([ctx, m.textMean <= maxText]).toEqual([ctx, true]);
    }
  });

  it('tolerates a crop that is 1.5 % too large (no dark table border)', () => {
    for (const f of ['auto', 'blackAndWhite'] as FilterType[]) {
      const { rgba } = renderToRgba(photos.shadow, f, normQ(grow(CORNERS, 0.015)));
      const m = pageMetrics(rgba, page);
      const ctx = `${f}: ${JSON.stringify(m)}`;
      expect([ctx, m.borderP1 >= 235]).toEqual([ctx, true]);
      expect([ctx, m.paperMean >= 245]).toEqual([ctx, true]);
    }
  });

  it('Magic Color keeps stamp red and logo blue', () => {
    const { rgba } = renderToRgba(photos.shadow, 'magicColor', normQ(CORNERS));
    const m = pageMetrics(rgba, page);
    expect(m.stampRedFraction).toBeGreaterThan(0.9);
    expect(m.stampSat).toBeGreaterThan(0.4);
    expect(m.logoSat).toBeGreaterThan(0.5);
  });

  it('Original keeps the photo look (no normalization)', () => {
    const { rgba } = renderToRgba(photos.shadow, 'original', normQ(CORNERS));
    const m = pageMetrics(rgba, page);
    expect(m.paperGradient).toBeGreaterThan(20);
  });

  it('matches the CPU reference on a uniform image (original + adjustments)', () => {
    const n = 64;
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) data.set([150, 120, 90, 255], i * 4);
    const adj = { ...DEFAULT_ADJUSTMENTS, brightness: 0.2, contrast: 0.3 };
    const { rgba } = renderToRgba({ width: n, height: n, data }, 'original', null as unknown as Quad, {
      adjustments: adj,
      pageFormat: 'auto',
      maxLongSide: 64,
    });
    const ref = enhancePixelReference([150 / 255, 120 / 255, 90 / 255], [1, 1, 1], shaderParams('original', adj));
    const c = (rgba.height >> 1) * rgba.width + (rgba.width >> 1);
    for (let k = 0; k < 3; k++) expect(Math.abs(rgba.data[c * 4 + k] - ref[k] * 255)).toBeLessThanOrEqual(2);
  });

  it('uniform grey paper becomes white under Auto', () => {
    const n = 200;
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) data.set([170, 165, 150, 255], i * 4);
    const { rgba } = renderToRgba({ width: n, height: n, data }, 'auto', null as unknown as Quad, { pageFormat: 'auto', maxLongSide: 200 });
    let min = 255;
    for (let i = 0; i < rgba.width * rgba.height; i++) min = Math.min(min, rgba.data[i * 4], rgba.data[i * 4 + 1], rgba.data[i * 4 + 2]);
    expect(min).toBeGreaterThanOrEqual(250);
  });

  it('rotation by 90° moves content clockwise', () => {
    // dark marker in the top-left of an otherwise white portrait image
    const w = 120;
    const h = 160;
    const data = new Uint8Array(w * h * 4).fill(255);
    for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) data.set([0, 0, 0, 255], (y * w + x) * 4);
    const { rgba } = renderToRgba({ width: w, height: h, data }, 'original', null as unknown as Quad, { rotation: 90, pageFormat: 'auto', maxLongSide: 160 });
    expect(rgba.width).toBeGreaterThan(rgba.height);
    const at = (x: number, y: number) => rgba.data[(Math.round(y * rgba.height) * rgba.width + Math.round(x * rgba.width)) * 4];
    expect(at(0.85, 0.15)).toBeLessThan(60); // top-right after clockwise rotation
    expect(at(0.15, 0.15)).toBeGreaterThan(200);
  });

  it('preview and export render the same look', () => {
    const prev = renderToRgba(photos.shadow, 'auto', normQ(CORNERS), { maxLongSide: 600 }).rgba;
    const exp = renderToRgba(photos.shadow, 'auto', normQ(CORNERS), { maxLongSide: undefined, dpi: 100 }).rgba;
    const ri = renderer.imageFromRgba(exp.data, exp.width, exp.height);
    const small = renderer.readRgba(renderer.downscale(ri, Math.max(prev.width, prev.height)));
    expect(Math.abs(small.width - prev.width)).toBeLessThanOrEqual(1);
    let diff = 0;
    let cnt = 0;
    const w = Math.min(small.width, prev.width);
    const h = Math.min(small.height, prev.height);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        diff += Math.abs(small.data[(y * small.width + x) * 4] - prev.data[(y * prev.width + x) * 4]);
        cnt++;
      }
    expect(diff / cnt).toBeLessThan(6);
  });

  it('JPEG size depends on quality (records size per page)', () => {
    const src = renderer.imageFromRgba(photos.shadow.data, FW, FH);
    const sizes: Record<string, number> = {};
    for (const dpi of [100, 150]) {
      const res = renderer.render(src, { corners: normQ(CORNERS), rotation: 0, filter: 'auto', pageFormat: 'a4', dpi });
      for (const [k, qv] of Object.entries({ low: 55, medium: 75, high: 90 })) {
        sizes[`${dpi}/${k}`] = Math.round((renderer.encodeJpeg(res.image, qv).length * 0.75) / 1024);
      }
      res.image.dispose?.();
    }
    console.log('JPEG KB per A4 page (Auto, synthetic invoice):', JSON.stringify(sizes));
    expect(sizes['150/low']).toBeLessThan(sizes['150/medium']);
    expect(sizes['150/medium']).toBeLessThan(sizes['150/high']);
    expect(sizes['100/high']).toBeLessThan(sizes['150/high']);
  });
});
