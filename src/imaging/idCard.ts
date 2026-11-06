import type { SkImage, Skia } from '@shopify/react-native-skia';
import { FULL_QUAD, outputToSourceHomography, scaleQuad } from './geometry';
import { WARP_SKSL } from './shaders';
import type { Quad, Rotation } from './types';

type SkiaApi = typeof Skia;

/** ISO/IEC 7810 ID-1 card size (credit card, German Personalausweis, driver's license). */
export const ID1_WIDTH_MM = 85.6;
export const ID1_HEIGHT_MM = 54.0;
export const ID1_ASPECT = ID1_WIDTH_MM / ID1_HEIGHT_MM; // ≈ 1.585185

/** ISO 216 A4 portrait sheet size in mm. */
export const A4_WIDTH_MM = 210.0;
export const A4_HEIGHT_MM = 297.0;

/** Vertical gap in mm between front and back ID card on the A4 sheet. */
export const ID_CARD_GAP_MM = 20.0;

export interface IdCardA4Placement {
  /** Output A4 canvas width in pixels at `dpi`. */
  a4WidthPx: number;
  /** Output A4 canvas height in pixels at `dpi`. */
  a4HeightPx: number;
  /** Single ID-1 card width in pixels at `dpi` (true 1:1 scale). */
  cardWidthPx: number;
  /** Single ID-1 card height in pixels at `dpi` (true 1:1 scale). */
  cardHeightPx: number;
  /** Top-left position of the front side on the A4 canvas. */
  frontRect: { x: number; y: number; width: number; height: number };
  /** Top-left position of the back side on the A4 canvas. */
  backRect: { x: number; y: number; width: number; height: number };
}

/**
 * Computes the exact 1:1 true-scale pixel coordinates of an ID-1 card's front
 * and back centered on a portrait A4 page at the given `dpi`.
 */
export function computeIdCardA4Placement(dpi = 300): IdCardA4Placement {
  const mmToPx = (mm: number) => Math.max(1, Math.round((mm / 25.4) * dpi));
  const a4WidthPx = mmToPx(A4_WIDTH_MM);
  const a4HeightPx = mmToPx(A4_HEIGHT_MM);
  const cardWidthPx = mmToPx(ID1_WIDTH_MM);
  const cardHeightPx = mmToPx(ID1_HEIGHT_MM);
  const gapPx = mmToPx(ID_CARD_GAP_MM);

  const x = Math.round((a4WidthPx - cardWidthPx) / 2);
  const totalPairHeight = cardHeightPx * 2 + gapPx;
  const frontY = Math.round((a4HeightPx - totalPairHeight) / 2);
  const backY = frontY + cardHeightPx + gapPx;

  return {
    a4WidthPx,
    a4HeightPx,
    cardWidthPx,
    cardHeightPx,
    frontRect: { x, y: frontY, width: cardWidthPx, height: cardHeightPx },
    backRect: { x, y: backY, width: cardWidthPx, height: cardHeightPx },
  };
}

/**
 * Formats the optional diagonal purpose watermark for ID card copies
 * (e.g. "Kopie – nur für Mobilfunkvertrag, 06.11.2026").
 * Sanitizes characters outside WinAnsi so pdf-lib's Helvetica watermark works cleanly.
 */
export function formatIdCardWatermark(
  purpose: string,
  dateStr: string,
  locale: 'de' | 'en'
): string {
  const cleanPurpose = purpose
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 48);
  const cleanDate = dateStr.trim().slice(0, 20);
  if (!cleanPurpose) {
    return locale === 'de' ? `KOPIE - ${cleanDate}` : `COPY - ${cleanDate}`;
  }
  return locale === 'de'
    ? `Kopie - nur fuer ${cleanPurpose}, ${cleanDate}`
    : `Copy - only for ${cleanPurpose}, ${cleanDate}`;
}

export interface IdCardSideInput {
  image: SkImage;
  corners: Quad | null;
  rotation?: Rotation;
}

/**
 * De-warps the front and back of an ID-1 card to true ID-1 aspect ratio
 * (`85.6 × 54 mm`) and composes both centered on a single white A4 sheet at `dpi`.
 * Caller owns the returned `SkImage` and must dispose it after encoding.
 */
export function composeIdCardA4(
  Skia: SkiaApi,
  _renderer: unknown,
  front: IdCardSideInput,
  back: IdCardSideInput,
  dpi = 300
): { image: SkImage; placement: IdCardA4Placement } {
  const placement = computeIdCardA4Placement(dpi);
  const { a4WidthPx, a4HeightPx, cardWidthPx, cardHeightPx, frontRect, backRect } = placement;

  const warpEffect = Skia.RuntimeEffect.Make(WARP_SKSL);
  if (!warpEffect) {
    throw new Error('WARP_SKSL compilation failed');
  }

  const surface = Skia.Surface.MakeOffscreen(a4WidthPx, a4HeightPx);
  if (!surface) {
    throw new Error(`Could not create A4 offscreen surface ${a4WidthPx}x${a4HeightPx}`);
  }

  const canvas = surface.getCanvas();
  // Pure white A4 background
  const bgPaint = Skia.Paint();
  bgPaint.setColor(Skia.Color([1, 1, 1, 1]));
  canvas.drawRect(Skia.XYWHRect(0, 0, a4WidthPx, a4HeightPx), bgPaint);

  const drawSide = (side: IdCardSideInput, rect: { x: number; y: number; width: number; height: number }) => {
    const srcW = side.image.width();
    const srcH = side.image.height();
    const quadPx = scaleQuad(side.corners ?? FULL_QUAD, srcW, srcH);
    const H = outputToSourceHomography(quadPx, cardWidthPx, cardHeightPx, side.rotation ?? 0);
    if (!H) {
      throw new Error('Invalid ID card corners: singular homography');
    }

    const sideSurface = Skia.Surface.MakeOffscreen(cardWidthPx, cardHeightPx);
    if (!sideSurface) {
      throw new Error('Could not create ID card side surface');
    }
    const imgShader = side.image.makeShaderOptions(0 as never, 0 as never, 1 as never, 0 as never);
    const warpShader = warpEffect.makeShaderWithChildren(
      [H[0], H[1], H[2], H[3], H[4], H[5], H[6], H[7], H[8], srcW, srcH],
      [imgShader]
    );
    const warpPaint = Skia.Paint();
    warpPaint.setShader(warpShader);
    sideSurface.getCanvas().drawRect(Skia.XYWHRect(0, 0, cardWidthPx, cardHeightPx), warpPaint);
    sideSurface.flush();
    const warpedCard = sideSurface.makeImageSnapshot();
    sideSurface.dispose?.();

    canvas.drawImageRect(
      warpedCard,
      Skia.XYWHRect(0, 0, cardWidthPx, cardHeightPx),
      Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height),
      Skia.Paint()
    );
    warpedCard.dispose?.();

    // Subtle hairline border around the card edge so white cards stand out on A4 paper
    const borderPaint = Skia.Paint();
    borderPaint.setColor(Skia.Color([0.82, 0.82, 0.84, 1]));
    borderPaint.setStyle(1 as never);
    borderPaint.setStrokeWidth(Math.max(1, Math.round(dpi / 150)));
    canvas.drawRect(Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height), borderPaint);
  };

  drawSide(front, frontRect);
  drawSide(back, backRect);

  surface.flush();
  const out = surface.makeImageSnapshot();
  surface.dispose?.();
  return { image: out, placement };
}
