import { Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  PageRenderer,
  detectDocument,
  renderKey,
  JPEG_QUALITY,
  type DetectionResult,
  type ExportDpi,
  type FilterType,
  type RenderOptions,
  type RenderState,
} from '../imaging';
import type { DocumentPage, ExportQuality } from '../types';
import { storageService } from './StorageService';

/**
 * Bridge between the pure imaging pipeline (src/imaging) and the app:
 * file IO, Skia (GPU) rendering, render cache and a serial job queue so that
 * only one large image is decoded at a time (memory).
 */

/** Long side of the stored proxy (crop UI, previews, thumbnails). */
export const PROXY_LONG_SIDE = 2000;
/** Long side of the detection input. */
export const DETECT_LONG_SIDE = 300;
/** Long side of rendered previews (document screen). */
export const PREVIEW_LONG_SIDE = 1600;
export const PREVIEW_JPEG_QUALITY = 85;
/** Long side of filter thumbnails. */
export const THUMB_LONG_SIDE = 160;
/** Max. long side of stored originals (12 MP camera photos stay untouched). */
export const ORIGINAL_MAX_LONG_SIDE = 4096;

export interface ImportedImage {
  originalUri: string;
  proxyUri: string;
  width: number;
  height: number;
  detection: DetectionResult;
}

export interface RenderedPage {
  base64: string;
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

type PageLike = Pick<DocumentPage, 'originalUri' | 'proxyUri' | 'corners' | 'rotation' | 'filter' | 'pageFormat' | 'adjustments'>;

export function renderStateOf(p: PageLike): RenderState {
  return {
    originalUri: p.originalUri,
    corners: p.corners,
    rotation: p.rotation,
    filter: p.filter,
    pageFormat: p.pageFormat,
    adjustments: p.adjustments,
  };
}

class ImagePipelineService {
  private renderer: PageRenderer | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Small LRU of decoded proxies (key = uri). */
  private decoded = new Map<string, SkImage>();
  private thumbCache = new Map<string, string>();

  private get r(): PageRenderer {
    if (!this.renderer) this.renderer = new PageRenderer(Skia);
    return this.renderer;
  }

  /** Runs jobs strictly one after another. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async decodeFile(uri: string, cache: boolean): Promise<SkImage> {
    const hit = this.decoded.get(uri);
    if (hit) {
      this.decoded.delete(uri);
      this.decoded.set(uri, hit);
      return hit;
    }
    const img = this.r.decode(await storageService.readBase64(uri));
    if (cache) {
      this.decoded.set(uri, img);
      while (this.decoded.size > 2) {
        const [k, v] = this.decoded.entries().next().value as [string, SkImage];
        this.decoded.delete(k);
        v.dispose?.();
      }
    }
    return img;
  }

  /** Frees decoded images (e.g. when leaving the editor). */
  releaseMemory(): void {
    this.decoded.forEach((img) => img.dispose?.());
    this.decoded.clear();
  }

  /**
   * Imports a camera / library image: bakes EXIF orientation into the pixels and
   * re-encodes without metadata (GPS etc.), stores original + proxy and runs
   * edge detection on a small copy.
   */
  importImage(sourceUri: string): Promise<ImportedImage> {
    return this.enqueue(async () => {
      const ctx = ImageManipulator.manipulate(sourceUri, {
        maxWidth: ORIGINAL_MAX_LONG_SIDE,
        maxHeight: ORIGINAL_MAX_LONG_SIDE,
      });
      const ref = await ctx.renderAsync();
      const baked = await ref.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
      ref.release?.();
      ctx.release?.();
      const originalUri = await storageService.moveInto(baked.uri, 'orig');
      const proxyUri = await this.makeProxy(originalUri, baked.width, baked.height);
      const detection = await this.detectOn(proxyUri);
      return { originalUri, proxyUri, width: baked.width, height: baked.height, detection };
    });
  }

  private async makeProxy(originalUri: string, width: number, height: number): Promise<string> {
    if (Math.max(width, height) <= PROXY_LONG_SIDE) return originalUri;
    const ctx = ImageManipulator.manipulate(originalUri, { maxWidth: PROXY_LONG_SIDE, maxHeight: PROXY_LONG_SIDE });
    const ref = await ctx.renderAsync();
    const res = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    ref.release?.();
    ctx.release?.();
    return storageService.moveInto(res.uri, 'proxy', 'proxies');
  }

  /**
   * Pages from schema v1 have no proxy and may still carry EXIF orientation:
   * re-encode them once (upright, no metadata) and create the proxy.
   */
  ensureProxy(page: Pick<DocumentPage, 'originalUri' | 'proxyUri'>): Promise<{ originalUri: string; proxyUri: string; changed: boolean }> {
    return this.enqueue(async () => {
      if (page.proxyUri && (await storageService.exists(page.proxyUri))) {
        return { originalUri: page.originalUri, proxyUri: page.proxyUri, changed: false };
      }
      const ctx = ImageManipulator.manipulate(page.originalUri, {
        maxWidth: ORIGINAL_MAX_LONG_SIDE,
        maxHeight: ORIGINAL_MAX_LONG_SIDE,
      });
      const ref = await ctx.renderAsync();
      const baked = await ref.saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
      ref.release?.();
      ctx.release?.();
      const originalUri = await storageService.moveInto(baked.uri, 'orig');
      const proxyUri = await this.makeProxy(originalUri, baked.width, baked.height);
      return { originalUri, proxyUri, changed: true };
    });
  }

  /** Edge detection on an image file (uses a ≤ 300 px copy). */
  detect(uri: string): Promise<DetectionResult> {
    return this.enqueue(() => this.detectOn(uri));
  }

  private async detectOn(uri: string): Promise<DetectionResult> {
    const img = await this.decodeFile(uri, true);
    const small = this.r.downscale(img, DETECT_LONG_SIDE);
    const rgba = this.r.readRgba(small);
    if (small !== img) small.dispose?.();
    return detectDocument(rgba);
  }

  /** Size of an image file in px (decoded via the proxy cache). */
  imageSize(uri: string): Promise<{ width: number; height: number }> {
    return this.enqueue(async () => {
      const img = await this.decodeFile(uri, true);
      return { width: img.width(), height: img.height() };
    });
  }

  /** Cache key of the preview render of a page. */
  previewKey(page: PageLike): string {
    return renderKey(renderStateOf(page), `preview${PREVIEW_LONG_SIDE}`);
  }

  /**
   * Renders the preview of a page (crop + filter + rotation + adjustments)
   * from its proxy and stores it in scanflow/renders/. Returns the new file.
   */
  renderPreview(page: PageLike): Promise<{ uri: string; key: string; widthPt: number; heightPt: number }> {
    return this.enqueue(async () => {
      const key = this.previewKey(page);
      const src = await this.decodeFile(page.proxyUri ?? page.originalUri, true);
      const res = this.r.render(src, this.options(page, 150, PREVIEW_LONG_SIDE));
      const b64 = this.r.encodeJpeg(res.image, PREVIEW_JPEG_QUALITY);
      res.image.dispose?.();
      const uri = await storageService.writeBase64(b64, `prev_${key}`, 'jpg', 'renders');
      return { uri, key, widthPt: res.page.widthPt, heightPt: res.page.heightPt };
    });
  }

  /** Small thumbnails of a page for the filter strip (data: URIs, memory-cached). */
  renderThumbnails(page: PageLike, filters: FilterType[]): Promise<Record<string, string>> {
    return this.enqueue(async () => {
      const out: Record<string, string> = {};
      const todo: FilterType[] = [];
      for (const f of filters) {
        const k = renderKey(renderStateOf({ ...page, filter: f }), 'thumb');
        const hit = this.thumbCache.get(k);
        if (hit) out[f] = hit;
        else todo.push(f);
      }
      if (todo.length === 0) return out;
      const full = await this.decodeFile(page.proxyUri ?? page.originalUri, true);
      // thumbnails only need a small source
      const small = this.r.downscale(full, 600);
      try {
        for (const f of todo) {
          const res = this.r.render(small, this.options({ ...page, filter: f }, 72, THUMB_LONG_SIDE));
          const uri = `data:image/jpeg;base64,${this.r.encodeJpeg(res.image, 70)}`;
          res.image.dispose?.();
          const k = renderKey(renderStateOf({ ...page, filter: f }), 'thumb');
          this.thumbCache.set(k, uri);
          out[f] = uri;
        }
      } finally {
        if (small !== full) small.dispose?.();
      }
      while (this.thumbCache.size > 60) this.thumbCache.delete(this.thumbCache.keys().next().value as string);
      return out;
    });
  }

  /** Full-resolution render from the original for export (not cached). */
  renderForExport(page: PageLike, dpi: ExportDpi, quality: ExportQuality): Promise<RenderedPage> {
    return this.enqueue(async () => {
      const src = await this.decodeFile(page.originalUri, false);
      try {
        const res = this.r.render(src, this.options(page, dpi));
        const base64 = this.r.encodeJpeg(res.image, JPEG_QUALITY[quality]);
        res.image.dispose?.();
        return {
          base64,
          widthPt: res.page.widthPt,
          heightPt: res.page.heightPt,
          widthPx: res.widthPx,
          heightPx: res.heightPx,
          dpi: res.dpi,
        };
      } finally {
        if (!this.decoded.has(page.originalUri)) src.dispose?.();
      }
    });
  }

  private options(page: PageLike, dpi: number, maxLongSide?: number): RenderOptions {
    return {
      corners: page.corners,
      rotation: page.rotation,
      filter: page.filter,
      adjustments: page.adjustments,
      pageFormat: page.pageFormat,
      dpi,
      maxLongSide,
    };
  }
}

export const imagePipeline = new ImagePipelineService();
