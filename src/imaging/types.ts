/**
 * Shared types of the ScanFlow image pipeline.
 * Everything in src/imaging is pure TypeScript (no React Native imports) so it
 * can be unit-tested in Node and run in Expo Go.
 */

export interface Point {
  x: number;
  y: number;
}

/** Four corners in the order top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export type PageFormat = 'auto' | 'a4' | 'letter';

export type Rotation = 0 | 90 | 180 | 270;

export type ExportDpi = 150 | 200 | 300;

/** Filters of the enhancement pipeline (stored per page). */
export type FilterType =
  | 'original'
  | 'auto'
  | 'magicColor'
  | 'removeShadows'
  | 'lighten'
  | 'grayscale'
  | 'blackAndWhite';

/** User adjustments on top of a filter preset. 0 / 0 / 0.5 / false = neutral. */
export interface Adjustments {
  /** -1 … 1 */
  brightness: number;
  /** -1 … 1 */
  contrast: number;
  /** 0 … 1, 0.5 = preset default */
  sharpness: number;
  denoise: boolean;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  sharpness: 0.5,
  denoise: false,
};

/** Plain RGBA8 pixel buffer (unpremultiplied). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface PageSize {
  widthPt: number;
  heightPt: number;
  /** Which standard size was used, or null for a custom (detected) aspect ratio. */
  standard: 'a4' | 'letter' | null;
}
