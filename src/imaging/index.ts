export * from './types';
export * from './geometry';
export * from './pageFormat';
export * from './edgeDetection';
export * from './background';
export * from './filters';
export * from './renderer';
export * from './pdf';
export * from './pageState';
export {
  type AnnotationType,
  type StrokePoint,
  type PageAnnotation,
  type SavedSignature,
  normalizeAnnotation,
  parseAnnotations,
  serializeAnnotations,
  smoothStrokePoints,
  fitSignatureStrokes,
  thresholdSignatureRgba,
  drawPageAnnotations,
} from './annotations';
export {
  ID1_WIDTH_MM,
  ID1_HEIGHT_MM,
  ID1_ASPECT,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  ID_CARD_GAP_MM,
  type IdCardA4Placement,
  type IdCardSideInput,
  computeIdCardA4Placement,
  formatIdCardWatermark,
  composeIdCardA4,
} from './idCard';
