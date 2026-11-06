/**
 * Corner radius scale (pt). Never use these as a raw `borderRadius` in a screen:
 * shapes come from the shared UI primitives (src/components/ui) or from
 * `corner()` / `capsule()` / `corners()` below, which always add iOS continuous
 * corners (`borderCurve: 'continuous'`). `npm run check:corners` enforces this.
 *
 * - xs  6  tiny badges, check boxes, guide corners
 * - sm 10  thumbnails, small tiles
 * - md 14  rows, inputs, segmented controls, banners
 * - lg 20  cards and grouped sections
 * - xl 28  large containers (dialogs, floating panels)
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
} as const;

export type RadiusToken = keyof typeof radius;

export interface ContinuousCorner {
  borderRadius: number;
  borderCurve: 'continuous';
}

export interface ContinuousCorners {
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomLeftRadius?: number;
  borderBottomRightRadius?: number;
  borderCurve: 'continuous';
}

const safe = (r: number) => (Number.isFinite(r) ? Math.max(0, r) : 0);

/** Rounded rectangle with continuous ("squircle") corners, like UIKit. */
export function corner(r: number): ContinuousCorner {
  return { borderRadius: safe(r), borderCurve: 'continuous' };
}

/**
 * Radius of a shape nested `inset` pt inside a shape with radius `outer`,
 * so both curves stay concentric (outer − inset, never negative).
 */
export function concentric(outer: number, inset: number): number {
  return safe(outer - inset);
}

/** Capsule (or circle) for a control of the given real height: radius = height / 2. */
export function capsule(height: number): ContinuousCorner {
  return corner(height / 2);
}

/** Only some corners rounded (e.g. the top of a card's image area). */
export function corners(c: { topLeft?: number; topRight?: number; bottomLeft?: number; bottomRight?: number }): ContinuousCorners {
  const style: ContinuousCorners = { borderCurve: 'continuous' };
  if (c.topLeft !== undefined) style.borderTopLeftRadius = safe(c.topLeft);
  if (c.topRight !== undefined) style.borderTopRightRadius = safe(c.topRight);
  if (c.bottomLeft !== undefined) style.borderBottomLeftRadius = safe(c.bottomLeft);
  if (c.bottomRight !== undefined) style.borderBottomRightRadius = safe(c.bottomRight);
  return style;
}
