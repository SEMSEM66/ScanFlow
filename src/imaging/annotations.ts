import type { SkCanvas, Skia } from '@shopify/react-native-skia';
import type { RgbaImage } from './types';

type SkiaApi = typeof Skia;

export type AnnotationType = 'signature' | 'text' | 'date_stamp' | 'pen' | 'highlighter';

export interface StrokePoint {
  /** Normalized x coordinate (0..1) inside the annotation box (or page for freehand). */
  x: number;
  /** Normalized y coordinate (0..1) inside the annotation box (or page for freehand). */
  y: number;
}

export interface PageAnnotation {
  id: string;
  type: AnnotationType;
  /** Normalized top-left x on the rendered page (0..1). */
  x: number;
  /** Normalized top-left y on the rendered page (0..1). */
  y: number;
  /** Normalized width on the rendered page (0.02..1). */
  width: number;
  /** Normalized height on the rendered page (0.02..1). */
  height: number;
  /** Rotation in degrees around the center of the annotation box (-180..180). */
  rotation: number;
  /** Hex color string (e.g. "#0B1F4B", "#111111", "#D91E2A", "#FFDF00"). */
  color: string;
  /** Opacity (0.1..1; highlighters typically use ~0.38). */
  opacity: number;
  /** Vector polylines (normalized 0..1 inside the annotation box) for signature, pen, highlighter. */
  strokes?: StrokePoint[][];
  /** Relative stroke width (fraction of the shorter page side, default 0.004). */
  strokeWidth?: number;
  /** Optional thresholded PNG base64 for photo-derived signatures (P1). */
  imagePngBase64?: string;
  /** Text content for 'text' and 'date_stamp' annotations. */
  text?: string;
}

export interface SavedSignature {
  id: string;
  name: string;
  /** Vector polylines normalized 0..1 within the signature bounding box. */
  strokes: StrokePoint[][];
  /** Default ink color (e.g. "#0B2E6B"). */
  color: string;
  /** Width-to-height aspect ratio of the signature box (default 2.4). */
  aspectRatio: number;
  /** Optional thresholded PNG base64 when created from a photo of a paper signature (P1). */
  imagePngBase64?: string | null;
  createdAt: number;
}

const VALID_TYPES = new Set<AnnotationType>(['signature', 'text', 'date_stamp', 'pen', 'highlighter']);

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const round4 = (v: number): number => Math.round(v * 10000) / 10000;

export function normalizeHexColor(c: unknown, fallback = '#111111'): string {
  if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim())) {
    return c.trim().toUpperCase();
  }
  return fallback;
}

export function normalizeStrokeList(raw: unknown): StrokePoint[][] {
  if (!Array.isArray(raw)) return [];
  const out: StrokePoint[][] = [];
  for (const poly of raw) {
    if (!Array.isArray(poly)) continue;
    const pts: StrokePoint[] = [];
    for (const p of poly) {
      if (p && typeof p === 'object' && typeof (p as StrokePoint).x === 'number' && typeof (p as StrokePoint).y === 'number') {
        pts.push({
          x: round4(clamp((p as StrokePoint).x, 0, 1, 0)),
          y: round4(clamp((p as StrokePoint).y, 0, 1, 0)),
        });
      }
    }
    if (pts.length > 0) out.push(pts);
  }
  return out;
}

/**
 * Smooths a raw finger / Apple Pencil polyline using one Chaikin corner-cutting
 * pass + minimum-distance deduplication so drawn signatures look crisp.
 */
export function smoothStrokePoints(points: readonly StrokePoint[], minDist = 0.004): StrokePoint[] {
  if (points.length <= 2) {
    return points.map((p) => ({ x: round4(clamp(p.x, 0, 1, 0)), y: round4(clamp(p.y, 0, 1, 0)) }));
  }
  const deduped: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1];
    const cur = points[i];
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= minDist || i === points.length - 1) {
      deduped.push(cur);
    }
  }
  if (deduped.length <= 2) {
    return deduped.map((p) => ({ x: round4(clamp(p.x, 0, 1, 0)), y: round4(clamp(p.y, 0, 1, 0)) }));
  }
  const smoothed: StrokePoint[] = [
    { x: round4(clamp(deduped[0].x, 0, 1, 0)), y: round4(clamp(deduped[0].y, 0, 1, 0)) },
  ];
  for (let i = 0; i < deduped.length - 1; i++) {
    const p0 = deduped[i];
    const p1 = deduped[i + 1];
    smoothed.push({
      x: round4(clamp(0.75 * p0.x + 0.25 * p1.x, 0, 1, 0)),
      y: round4(clamp(0.75 * p0.y + 0.25 * p1.y, 0, 1, 0)),
    });
    smoothed.push({
      x: round4(clamp(0.25 * p0.x + 0.75 * p1.x, 0, 1, 0)),
      y: round4(clamp(0.25 * p0.y + 0.75 * p1.y, 0, 1, 0)),
    });
  }
  const last = deduped[deduped.length - 1];
  smoothed.push({ x: round4(clamp(last.x, 0, 1, 0)), y: round4(clamp(last.y, 0, 1, 0)) });
  return smoothed;
}

/**
 * Normalizes a set of signature polylines to tightly fit `[0.06 .. 0.94]` inside
 * the signature box and computes its natural width/height aspect ratio.
 */
export function fitSignatureStrokes(strokes: readonly (readonly StrokePoint[])[]): {
  strokes: StrokePoint[][];
  aspectRatio: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of strokes) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { strokes: [], aspectRatio: 2.4 };
  }
  const spanX = Math.max(0.02, maxX - minX);
  const spanY = Math.max(0.02, maxY - minY);
  const aspectRatio = round4(clamp(spanX / spanY, 0.8, 5.0, 2.4));
  const pad = 0.06;
  const inner = 1 - pad * 2;
  const normalized = strokes.map((poly) =>
    smoothStrokePoints(
      poly.map((p) => ({
        x: pad + ((p.x - minX) / spanX) * inner,
        y: pad + ((p.y - minY) / spanY) * inner,
      }))
    )
  );
  return { strokes: normalized, aspectRatio };
}

/**
 * P1: Converts an RGBA image of a signature on paper into a clean transparent
 * RGBA image (ink pixels in `inkHex` with smooth alpha, paper pixels alpha = 0).
 */
export function thresholdSignatureRgba(src: RgbaImage, inkHex = '#0B2E6B'): RgbaImage {
  const { width, height, data } = src;
  const count = width * height;
  const lum = new Uint8Array(count);
  const hist = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const y = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    lum[i] = y;
    hist[y]++;
  }
  // Estimate paper luminance as 85th percentile so shadows don't count as ink
  let acc = 0;
  let paperY = 220;
  const target = Math.floor(count * 0.85);
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) {
      paperY = Math.max(120, v);
      break;
    }
  }
  const cutoff = Math.round(paperY * 0.76);
  const softSpan = Math.max(12, Math.round(paperY * 0.14));
  const hex = normalizeHexColor(inkHex, '#0B2E6B');
  const rInk = parseInt(hex.slice(1, 3), 16);
  const gInk = parseInt(hex.slice(3, 5), 16);
  const bInk = parseInt(hex.slice(5, 7), 16);

  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const y = lum[i];
    if (y >= cutoff) continue;
    const strength = Math.min(1, (cutoff - y) / softSpan);
    const o = i * 4;
    out[o] = rInk;
    out[o + 1] = gInk;
    out[o + 2] = bInk;
    out[o + 3] = Math.round(strength * 255);
  }
  return { width, height, data: out };
}

export function normalizeAnnotation(raw: unknown): PageAnnotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as AnnotationType;
  if (!VALID_TYPES.has(type)) return null;
  const id = typeof r.id === 'string' && r.id.trim().length > 0 ? r.id.trim() : '';
  if (!id) return null;

  const width = round4(clamp(r.width, 0.02, 1, 0.35));
  const height = round4(clamp(r.height, 0.02, 1, 0.12));
  const x = round4(clamp(r.x, 0, 1 - width, 0.1));
  const y = round4(clamp(r.y, 0, 1 - height, 0.1));
  const rotation = round4(clamp(r.rotation, -180, 180, 0));
  const defaultOpacity = type === 'highlighter' ? 0.38 : 1;
  const opacity = round4(clamp(r.opacity, 0.1, 1, defaultOpacity));
  const defaultColor =
    type === 'highlighter' ? '#FFDF00' : type === 'signature' ? '#0B2E6B' : '#111111';
  const color = normalizeHexColor(r.color, defaultColor);

  const ann: PageAnnotation = {
    id,
    type,
    x,
    y,
    width,
    height,
    rotation,
    color,
    opacity,
  };

  if (type === 'signature' || type === 'pen' || type === 'highlighter') {
    const strokes = normalizeStrokeList(r.strokes);
    if (strokes.length > 0) ann.strokes = strokes;
    if (typeof r.strokeWidth === 'number') {
      ann.strokeWidth = round4(clamp(r.strokeWidth, 0.001, 0.08, type === 'highlighter' ? 0.024 : 0.004));
    }
    if (typeof r.imagePngBase64 === 'string' && r.imagePngBase64.length > 0) {
      ann.imagePngBase64 = r.imagePngBase64;
    }
    if (!ann.strokes && !ann.imagePngBase64) return null;
  } else {
    const text = typeof r.text === 'string' ? r.text.trim().slice(0, 200) : '';
    if (!text) return null;
    ann.text = text;
  }

  return ann;
}

export function parseAnnotations(json: string | null | undefined): PageAnnotation[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const out: PageAnnotation[] = [];
    for (const item of parsed) {
      const n = normalizeAnnotation(item);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeAnnotations(list: readonly PageAnnotation[] | null | undefined): string | null {
  if (!list || list.length === 0) return null;
  const normalized: PageAnnotation[] = [];
  for (const item of list) {
    const n = normalizeAnnotation(item);
    if (n) normalized.push(n);
  }
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function hexToRgbaFloat(hex: string, opacity: number): [number, number, number, number] {
  const clean = normalizeHexColor(hex, '#111111');
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  return [r, g, b, clamp(opacity, 0, 1, 1)];
}

/**
 * Simple built-in 5×7 vector glyph strokes for ASCII/German characters so that
 * text and date-stamp annotations always render cleanly even in headless Skia
 * (where no system font file is bundled). When Skia.Font has a valid typeface
 * on iOS, native text is used first.
 */
const VECTOR_GLYPHS: Record<string, [number, number, number, number][]> = {
  '0': [[0.1, 0.1, 0.9, 0.1], [0.9, 0.1, 0.9, 0.9], [0.9, 0.9, 0.1, 0.9], [0.1, 0.9, 0.1, 0.1]],
  '1': [[0.5, 0.1, 0.5, 0.9], [0.25, 0.25, 0.5, 0.1], [0.2, 0.9, 0.8, 0.9]],
  '2': [[0.1, 0.2, 0.5, 0.1], [0.5, 0.1, 0.9, 0.25], [0.9, 0.25, 0.1, 0.9], [0.1, 0.9, 0.9, 0.9]],
  '3': [[0.1, 0.1, 0.9, 0.1], [0.9, 0.1, 0.9, 0.9], [0.2, 0.5, 0.9, 0.5], [0.1, 0.9, 0.9, 0.9]],
  '4': [[0.1, 0.1, 0.1, 0.55], [0.1, 0.55, 0.9, 0.55], [0.75, 0.1, 0.75, 0.9]],
  '5': [[0.9, 0.1, 0.1, 0.1], [0.1, 0.1, 0.1, 0.5], [0.1, 0.5, 0.9, 0.5], [0.9, 0.5, 0.9, 0.9], [0.9, 0.9, 0.1, 0.9]],
  '6': [[0.9, 0.1, 0.1, 0.1], [0.1, 0.1, 0.1, 0.9], [0.1, 0.9, 0.9, 0.9], [0.9, 0.9, 0.9, 0.5], [0.9, 0.5, 0.1, 0.5]],
  '7': [[0.1, 0.1, 0.9, 0.1], [0.9, 0.1, 0.35, 0.9]],
  '8': [[0.1, 0.1, 0.9, 0.1], [0.9, 0.1, 0.9, 0.9], [0.9, 0.9, 0.1, 0.9], [0.1, 0.9, 0.1, 0.1], [0.1, 0.5, 0.9, 0.5]],
  '9': [[0.9, 0.5, 0.1, 0.5], [0.1, 0.5, 0.1, 0.1], [0.1, 0.1, 0.9, 0.1], [0.9, 0.1, 0.9, 0.9], [0.9, 0.9, 0.1, 0.9]],
  '.': [[0.45, 0.82, 0.55, 0.9]],
  '-': [[0.15, 0.5, 0.85, 0.5]],
  '/': [[0.15, 0.9, 0.85, 0.1]],
  ':': [[0.45, 0.3, 0.55, 0.36], [0.45, 0.75, 0.55, 0.81]],
};

function drawFallbackVectorText(
  Skia: SkiaApi,
  canvas: SkCanvas,
  text: string,
  boxW: number,
  boxH: number,
  rgba: [number, number, number, number]
): void {
  const chars = Array.from(text);
  if (chars.length === 0) return;
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(rgba));
  paint.setAntiAlias(true);
  paint.setStyle(1 as never); // Stroke
  const cellW = Math.min(boxH * 0.62, boxW / Math.max(1, chars.length));
  const cellH = Math.min(boxH * 0.76, cellW * 1.45);
  paint.setStrokeWidth(Math.max(1.5, cellH * 0.11));
  const totalW = cellW * chars.length;
  const startX = Math.max(0, (boxW - totalW) / 2);
  const startY = (boxH - cellH) / 2;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i].toUpperCase();
    if (ch === ' ') continue;
    const ox = startX + i * cellW + cellW * 0.12;
    const cw = cellW * 0.76;
    const segs = VECTOR_GLYPHS[ch] ?? [
      [0.15, 0.15, 0.85, 0.15],
      [0.85, 0.15, 0.85, 0.85],
      [0.85, 0.85, 0.15, 0.85],
      [0.15, 0.85, 0.15, 0.15],
      [0.15, 0.5, 0.75, 0.5],
    ];
    for (const [x1, y1, x2, y2] of segs) {
      canvas.drawLine(
        ox + x1 * cw,
        startY + y1 * cellH,
        ox + x2 * cw,
        startY + y2 * cellH,
        paint
      );
    }
  }
}

/**
 * Draws all non-destructive page annotations onto a rendered page canvas.
 * Called by `PageRenderer.render()` after the enhancement shader pass.
 */
export function drawPageAnnotations(
  Skia: SkiaApi,
  canvas: SkCanvas,
  annotations: readonly PageAnnotation[] | undefined,
  pageW: number,
  pageH: number
): void {
  if (!annotations || annotations.length === 0) return;
  const shortSide = Math.min(pageW, pageH);

  for (const ann of annotations) {
    const boxX = ann.x * pageW;
    const boxY = ann.y * pageH;
    const boxW = ann.width * pageW;
    const boxH = ann.height * pageH;
    const cx = boxX + boxW / 2;
    const cy = boxY + boxH / 2;

    canvas.save();
    if (ann.rotation !== 0) {
      canvas.translate(cx, cy);
      canvas.rotate(ann.rotation, 0, 0);
      canvas.translate(-cx, -cy);
    }
    canvas.translate(boxX, boxY);

    const rgba = hexToRgbaFloat(ann.color, ann.opacity);

    if (ann.imagePngBase64) {
      try {
        const data = Skia.Data.fromBase64(ann.imagePngBase64);
        const img = Skia.Image.MakeImageFromEncoded(data);
        data.dispose?.();
        if (img) {
          const p = Skia.Paint();
          p.setAlphaf(ann.opacity);
          canvas.drawImageRect(
            img,
            Skia.XYWHRect(0, 0, img.width(), img.height()),
            Skia.XYWHRect(0, 0, boxW, boxH),
            p
          );
          img.dispose?.();
        }
      } catch {
        // ignore malformed image base64
      }
    }

    if (ann.strokes && ann.strokes.length > 0) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(rgba));
      paint.setAntiAlias(true);
      paint.setStyle(1 as never); // PaintStyle.Stroke = 1
      paint.setStrokeCap(1 as never); // StrokeCap.Round = 1
      paint.setStrokeJoin(1 as never); // StrokeJoin.Round = 1
      const relW = ann.strokeWidth ?? (ann.type === 'highlighter' ? 0.024 : 0.0045);
      paint.setStrokeWidth(Math.max(1.5, relW * shortSide));

      for (const poly of ann.strokes) {
        if (poly.length === 0) continue;
        if (poly.length === 1) {
          const x = poly[0].x * boxW;
          const y = poly[0].y * boxH;
          canvas.drawLine(x, y, x + 0.5, y + 0.5, paint);
        } else {
          for (let i = 1; i < poly.length; i++) {
            canvas.drawLine(
              poly[i - 1].x * boxW,
              poly[i - 1].y * boxH,
              poly[i].x * boxW,
              poly[i].y * boxH,
              paint
            );
          }
        }
      }
    }

    if ((ann.type === 'text' || ann.type === 'date_stamp') && ann.text) {
      if (ann.type === 'date_stamp') {
        const borderPaint = Skia.Paint();
        borderPaint.setColor(Skia.Color(rgba));
        borderPaint.setAntiAlias(true);
        borderPaint.setStyle(1 as never);
        borderPaint.setStrokeWidth(Math.max(1.5, shortSide * 0.0025));
        canvas.drawRect(Skia.XYWHRect(2, 2, Math.max(4, boxW - 4), Math.max(4, boxH - 4)), borderPaint);
      }
      let drewWithFont = false;
      try {
        const fontSize = Math.max(10, Math.min(boxH * 0.62, (boxW / Math.max(4, ann.text.length)) * 1.65));
        const font = Skia.Font(undefined, fontSize);
        if (font && typeof font.getTypeface === 'function' && font.getTypeface()) {
          const textPaint = Skia.Paint();
          textPaint.setColor(Skia.Color(rgba));
          textPaint.setAntiAlias(true);
          canvas.drawText(ann.text, 6, boxH * 0.72, textPaint, font);
          drewWithFont = true;
        }
      } catch {
        drewWithFont = false;
      }
      if (!drewWithFont) {
        drawFallbackVectorText(Skia, canvas, ann.text, boxW, boxH, rgba);
      }
    }

    canvas.restore();
  }
}
