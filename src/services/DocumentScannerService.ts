import { Platform } from 'react-native';
import { Camera, CameraView } from 'expo-camera';

/**
 * iOS system document scanner (VisionKit `VNDocumentCameraViewController`,
 * via expo-camera `CameraView.scanDocumentAsync`): live edge detection with
 * overlay, automatic capture, multi-page batches, corner adjustment and
 * perspective correction – the same scanner as in Notes / Files.
 *
 * The scanner is presented natively on the top-most view controller. Only
 * start it from a settled screen (no navigation / modal transition running),
 * otherwise UIKit refuses the presentation and the promise never settles.
 */

export type CameraAccess = 'granted' | 'denied' | 'blocked';

/** JPEG quality of the scanner pages (the import pipeline re-encodes them once). */
const SCANNER_JPEG_QUALITY = 0.95;

class DocumentScannerService {
  private active = false;
  private startedAt = 0;

  /** True on iPhones/iPads with VisionKit document camera support (not in the simulator). */
  isSystemScannerAvailable(): boolean {
    try {
      return (
        Platform.OS === 'ios' &&
        CameraView.isDocumentScannerAvailable === true &&
        typeof CameraView.scanDocumentAsync === 'function'
      );
    } catch {
      return false;
    }
  }

  /** A scan was started and has not settled yet. */
  get isScanning(): boolean {
    return this.active;
  }

  /**
   * Milliseconds since the running scan was started (0 if none). The scanner
   * covers the whole screen, so if the app UI is usable while this is large,
   * the presentation failed and the scan will never settle.
   */
  get runningForMs(): number {
    return this.active ? Date.now() - this.startedAt : 0;
  }

  /** Checks / requests camera access. 'blocked' = denied and iOS will not ask again. */
  async ensureCameraAccess(): Promise<CameraAccess> {
    let res = await Camera.getCameraPermissionsAsync();
    if (res.granted) return 'granted';
    if (res.canAskAgain) {
      res = await Camera.requestCameraPermissionsAsync();
      if (res.granted) return 'granted';
    }
    return res.canAskAgain ? 'denied' : 'blocked';
  }

  /**
   * Presents the scanner. Resolves with the page images (file URIs in the
   * cache directory, already cropped and perspective-corrected) or null if
   * the user cancelled. Throws if the scanner could not be presented.
   */
  async scan(): Promise<string[] | null> {
    if (this.active) throw new Error('A document scan is already in progress');
    this.active = true;
    this.startedAt = Date.now();
    try {
      const result = await CameraView.scanDocumentAsync({ quality: SCANNER_JPEG_QUALITY });
      const pages = (result?.pages ?? []).filter((uri) => typeof uri === 'string' && uri.length > 0);
      return pages.length > 0 ? pages : null;
    } finally {
      this.active = false;
    }
  }
}

export const documentScanner = new DocumentScannerService();
