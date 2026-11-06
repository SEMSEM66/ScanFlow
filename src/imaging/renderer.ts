import type { SkImage, SkRuntimeEffect, SkShader, SkSurface, Skia } from '@shopify/react-native-skia';
import type { Adjustments, FilterType, Mat3, PageFormat, PageSize, Quad, RgbaImage, Rotation } from './types';
import { DEFAULT_ADJUSTMENTS } from './types';
import { FULL_QUAD, estimateAspectRatio, outputToSourceHomography, scaleQuad } from './geometry';
import { dpiForMaxLongSide, pagePixelSize, resolvePageSize, rotatedAspect } from './pageFormat';
import { BG_LONG_SIDE, backgroundSize, estimateBackground } from './background';
import { needsBackground, shaderParams } from './filters';
import { ENHANCE_SKSL, WARP_SKSL } from './shaders';
import { drawPageAnnotations, type PageAnnotation } from './annotations';

export type SkiaApi = typeof Skia;

/**
 * GPU page renderer (Skia). All Skia access goes through the injected API so
 * the same code runs in the app (@shopify/react-native-skia) and in Node
 * tests (headless CanvasKit build of the same package).
 *
 * Memory: only the source image, at most one intermediate (downscaled source)
 * and the output surface are alive at the same time; small surfaces for the
 * background pass are released immediately.
 */

/** Numeric values of Skia enums (checked against the real enums in tests). */
export const SK = {
  TileMode: { Clamp: 0, Decal: 3 },
  FilterMode: { Nearest: 0, Linear: 1 },
  MipmapMode: { None: 0, Nearest: 1, Linear: 2 },
  ImageFormat: { PNG: 4, JPEG: 3 },
  ColorType: { RGBA_8888: 4 },
  AlphaType: { Opaque: 1, Premul: 2, Unpremul: 3 },
} as const;

export interface RenderOptions {
  /** Normalized corners on the source, null = full image. */
  corners: Quad | null;
  rotation: Rotation;
  filter: FilterType;
  adjustments?: Adjustments;
  pageFormat: PageFormat;
  /** Optional non-destructive visual annotations drawn after the filter pass (excluded from OCR). */
  annotations?: PageAnnotation[];
  /** Output resolution. */
  dpi: number;
  /** Optional clamp of the output long side in px (previews / thumbnails). */
  maxLongSide?: number;
}

export interface PageGeometry {
  page: PageSize;
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Homography output px → source px */
  H: Mat3;
}

export interface RenderResult extends PageGeometry {
  image: SkImage;
}

/** Page size / pixel size / homography for a source of srcW×srcH. Pure. */
export function computePageGeometry(srcW: number, srcH: number, opts: RenderOptions): PageGeometry {
  const quadPx = scaleQuad(opts.corners ?? FULL_QUAD, srcW, srcH);
  const aspect = rotatedAspect(estimateAspectRatio(quadPx, srcW, srcH), opts.rotation);
  const page = resolvePageSize(opts.pageFormat, aspect);
  const dpi = opts.maxLongSide ? dpiForMaxLongSide(page, opts.maxLongSide, opts.dpi) : opts.dpi;
  const { width, height } = pagePixelSize(page, dpi);
  const H = outputToSourceHomography(quadPx, width, height, opts.rotation);
  if (!H) throw new Error('Invalid corners: homography is singular');
  return { page, widthPx: width, heightPx: height, dpi, H };
}

export class PageRenderer {
  private warpEffect: SkRuntimeEffect | null = null;
  private enhanceEffect: SkRuntimeEffect | null = null;

  constructor(private readonly Skia: SkiaApi) {}

  private effects(): { warp: SkRuntimeEffect; enhance: SkRuntimeEffect } {
    if (!this.warpEffect) this.warpEffect = this.Skia.RuntimeEffect.Make(WARP_SKSL);
    if (!this.enhanceEffect) this.enhanceEffect = this.Skia.RuntimeEffect.Make(ENHANCE_SKSL);
    if (!this.warpEffect || !this.enhanceEffect) throw new Error('SkSL compilation failed');
    return { warp: this.warpEffect, enhance: this.enhanceEffect };
  }

  decode(base64: string): SkImage {
    const data = this.Skia.Data.fromBase64(base64);
    const img = this.Skia.Image.MakeImageFromEncoded(data);
    data.dispose?.();
    if (!img) throw new Error('Image could not be decoded');
    return img;
  }

  imageFromRgba(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): SkImage {
    const bytes = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    const data = this.Skia.Data.fromBytes(bytes);
    const img = this.Skia.Image.MakeImage(
      { width, height, colorType: SK.ColorType.RGBA_8888, alphaType: SK.AlphaType.Unpremul },
      data,
      width * 4
    );
    if (!img) throw new Error('MakeImage failed');
    return img;
  }

  private surface(w: number, h: number): SkSurface {
    const s = this.Skia.Surface.MakeOffscreen(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    if (!s) throw new Error(`Offscreen surface ${w}×${h} could not be created`);
    return s;
  }

  /** Draws `img` scaled to w×h (single linear step). */
  private drawScaled(img: SkImage, w: number, h: number): SkImage {
    const s = this.surface(w, h);
    const canvas = s.getCanvas();
    canvas.drawImageRectOptions(
      img,
      this.Skia.XYWHRect(0, 0, img.width(), img.height()),
      this.Skia.XYWHRect(0, 0, w, h),
      SK.FilterMode.Linear as never,
      SK.MipmapMode.None as never
    );
    s.flush();
    const out = s.makeImageSnapshot();
    s.dispose?.();
    return out;
  }

  /** Box-quality downscale by repeated halving, then one final linear step. */
  downscale(img: SkImage, maxLongSide: number): SkImage {
    let cur = img;
    const target = Math.max(1, maxLongSide);
    while (Math.max(cur.width(), cur.height()) > target * 2) {
      const next = this.drawScaled(cur, Math.max(1, Math.round(cur.width() / 2)), Math.max(1, Math.round(cur.height() / 2)));
      if (cur !== img) cur.dispose?.();
      cur = next;
    }
    const long = Math.max(cur.width(), cur.height());
    if (long > target) {
      const s = target / long;
      const next = this.drawScaled(cur, Math.round(cur.width() * s), Math.round(cur.height() * s));
      if (cur !== img) cur.dispose?.();
      cur = next;
    }
    return cur;
  }

  /** RGBA pixels of a (small) image. */
  readRgba(img: SkImage): RgbaImage {
    const w = img.width();
    const h = img.height();
    const px = img.readPixels(0, 0, { width: w, height: h, colorType: SK.ColorType.RGBA_8888 as never, alphaType: SK.AlphaType.Unpremul as never });
    if (!px || !(px instanceof Uint8Array)) throw new Error('readPixels failed');
    return { width: w, height: h, data: px };
  }

  private imageShader(img: SkImage): SkShader {
    return img.makeShaderOptions(SK.TileMode.Clamp as never, SK.TileMode.Clamp as never, SK.FilterMode.Linear as never, SK.MipmapMode.None as never);
  }

  private static rows(H: Mat3): number[] {
    return [H[0], H[1], H[2], H[3], H[4], H[5], H[6], H[7], H[8]];
  }

  /** Renders a page from a decoded source image. Caller owns result.image. */
  render(source: SkImage, opts: RenderOptions): RenderResult {
    const { warp, enhance } = this.effects();
    const srcW = source.width();
    const srcH = source.height();
    const geo = computePageGeometry(srcW, srcH, opts);
    const { widthPx: W, heightPx: H, page, dpi } = geo;
    const adj = opts.adjustments ?? DEFAULT_ADJUSTMENTS;
    const sp = shaderParams(opts.filter, adj);

    // Pre-downscale huge sources (e.g. 12 MP photo → small preview) so bilinear sampling does not alias.
    const quadPx = scaleQuad(opts.corners ?? FULL_QUAD, srcW, srcH);
    const sides = quadPx.map((p, i) => Math.hypot(p.x - quadPx[(i + 1) % 4].x, p.y - quadPx[(i + 1) % 4].y));
    const density = Math.max(...sides) / Math.max(W, H);
    let work = source;
    if (density > 2) {
      work = this.downscale(source, Math.max(srcW, srcH) * (1.5 / density));
    }
    const sx = work.width() / srcW;
    const sy = work.height() / srcH;
    const Hw = outputToSourceHomography(scaleQuad(quadPx, sx, sy), W, H, opts.rotation);
    if (!Hw) throw new Error('Invalid corners: homography is singular');

    // ---- background pass (small) ----
    let bgImg: SkImage;
    let maskImg: SkImage;
    const bgDims = backgroundSize(W, H, BG_LONG_SIDE);
    if (needsBackground(opts.filter)) {
      const srcSmall = this.downscale(work, 640);
      const ssx = srcSmall.width() / work.width();
      const ssy = srcSmall.height() / work.height();
      const midScale = Math.min(1, (BG_LONG_SIDE * 4) / Math.max(W, H));
      const mw = Math.max(4, Math.round(W * midScale));
      const mh = Math.max(4, Math.round(H * midScale));
      const Hm = outputToSourceHomography(scaleQuad(quadPx, sx * ssx, sy * ssy), mw, mh, opts.rotation);
      if (!Hm) throw new Error('Invalid corners');
      const warpShader = warp.makeShaderWithChildren(
        [...PageRenderer.rows(Hm), srcSmall.width(), srcSmall.height()],
        [this.imageShader(srcSmall)]
      );
      const ms = this.surface(mw, mh);
      const paint = this.Skia.Paint();
      paint.setShader(warpShader);
      ms.getCanvas().drawRect(this.Skia.XYWHRect(0, 0, mw, mh), paint);
      ms.flush();
      const mid = ms.makeImageSnapshot();
      ms.dispose?.();
      if (srcSmall !== work) srcSmall.dispose?.();
      const small = this.downscale(mid, BG_LONG_SIDE);
      const rgba = this.readRgba(small);
      if (small !== mid) small.dispose?.();
      mid.dispose?.();
      const est = estimateBackground(rgba);
      bgImg = this.imageFromRgba(est.background, est.width, est.height);
      maskImg = this.imageFromRgba(est.borderMask, est.width, est.height);
      bgDims.width = est.width;
      bgDims.height = est.height;
    } else {
      bgImg = this.imageFromRgba(new Uint8Array([255, 255, 255, 255]), 1, 1);
      maskImg = this.imageFromRgba(new Uint8Array([0, 0, 0, 255]), 1, 1);
      bgDims.width = 1;
      bgDims.height = 1;
    }

    // ---- final pass ----
    const tap = Math.max(0.75, dpi / 300);
    const edgeBand = 0.01 * Math.max(W, H);
    const uniforms = [
      ...PageRenderer.rows(Hw),
      work.width(), work.height(),
      W, H,
      bgDims.width, bgDims.height,
      tap,
      sp.normalize, sp.black, sp.white, sp.gamma, sp.saturation, sp.sharpen, sp.mode,
      sp.bwThreshold, sp.bwSoftness, sp.brightness, sp.contrast, sp.denoise, sp.clean,
      edgeBand,
    ];
    const shader = enhance.makeShaderWithChildren(uniforms, [
      this.imageShader(work),
      this.imageShader(bgImg),
      this.imageShader(maskImg),
    ]);
    const out = this.surface(W, H);
    const paint = this.Skia.Paint();
    paint.setShader(shader);
    const outCanvas = out.getCanvas();
    outCanvas.drawRect(this.Skia.XYWHRect(0, 0, W, H), paint);
    drawPageAnnotations(this.Skia, outCanvas, opts.annotations, W, H);
    out.flush();
    const image = out.makeImageSnapshot();
    out.dispose?.();
    bgImg.dispose?.();
    maskImg.dispose?.();
    if (work !== source) work.dispose?.();
    return { image, page, widthPx: W, heightPx: H, dpi, H: geo.H };
  }

  encodeJpeg(image: SkImage, quality: number): string {
    return image.encodeToBase64(SK.ImageFormat.JPEG as never, Math.round(quality));
  }
}

/** Uniform layout of ENHANCE_SKSL (order matters) – exported for tests. */
export const ENHANCE_UNIFORMS = [
  'h0', 'h1', 'h2', 'srcSize', 'outSize', 'bgSize', 'tap', 'normalizeAmt', 'blackPt', 'whitePt', 'gammaV',
  'saturation', 'sharpenAmt', 'mode', 'bwThreshold', 'bwSoftness', 'brightness', 'contrast', 'denoise', 'clean', 'edgeBand',
];
