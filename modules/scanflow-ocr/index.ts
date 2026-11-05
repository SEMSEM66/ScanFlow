import { requireOptionalNativeModule } from 'expo';

/**
 * JS binding of the local native module ScanFlowOcr (Apple Vision, iOS only).
 * null in Expo Go and on other platforms – the app must work without it.
 */

/** [x, y, width, height], normalized, origin bottom-left (Vision). */
export type NativeOcrRect = [number, number, number, number];

export interface NativeOcrWord {
  text: string;
  box?: NativeOcrRect;
}

export interface NativeOcrLine {
  text: string;
  confidence: number;
  box: NativeOcrRect;
  words: NativeOcrWord[];
}

export interface NativeOcrResult {
  width: number;
  height: number;
  /** Languages actually used (supported subset of the requested ones). */
  languages: string[];
  lines: NativeOcrLine[];
}

export interface NativeOcrOptions {
  languages?: string[];
  level?: 'accurate' | 'fast';
  usesLanguageCorrection?: boolean;
  /** Relative to the image height; 0 = Vision default (1/32). */
  minimumTextHeight?: number;
}

export interface ScanFlowOcrNativeModule {
  supportedLanguagesAsync(): Promise<string[]>;
  /** `uri`: file:// URL of a JPEG / PNG. */
  recognizeAsync(uri: string, options: NativeOcrOptions): Promise<NativeOcrResult>;
}

export const ScanFlowOcr = requireOptionalNativeModule<ScanFlowOcrNativeModule>('ScanFlowOcr');
