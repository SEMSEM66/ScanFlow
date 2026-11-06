import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { isImageUri, isPdfUri, pdfToolkitService, titleFromFileUri } from '../src/services/PdfToolkitService';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));
jest.mock('../modules/scanflow-ocr', () => ({ ScanFlowOcr: null }));
jest.mock('../src/services/OcrService', () => ({
  ocrService: {
    hold: () => () => undefined,
    kick: jest.fn(),
  },
}));
jest.mock('../src/services/ScanImportService', () => ({
  saveScan: jest.fn(),
}));
jest.mock('../src/services/StorageService', () => ({
  storageService: {
    ocrTempDir: 'file:///cache/ocr/',
    ensureDir: jest.fn(async (d: string) => d),
    deleteTempFile: jest.fn(async () => undefined),
  },
}));

describe('PdfToolkitService pure URI & filename helpers (M1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts decoded human-readable titles from file URIs', () => {
    expect(titleFromFileUri('file:///var/mobile/Containers/Data/Application/Inbox/Steuerbescheid%202025.pdf')).toBe(
      'Steuerbescheid 2025'
    );
    expect(titleFromFileUri('Rechnung_Telekom.PDF')).toBe('Rechnung_Telekom');
    expect(titleFromFileUri('file:///tmp/.pdf', 'Scan')).toBe('Scan');
    expect(titleFromFileUri('', 'Fallback')).toBe('Fallback');
  });

  it('identifies PDF URIs and MIME types accurately', () => {
    expect(isPdfUri('file:///tmp/test.pdf')).toBe(true);
    expect(isPdfUri('file:///tmp/TEST.PDF?foo=1')).toBe(true);
    expect(isPdfUri('file:///tmp/blob', 'application/pdf')).toBe(true);
    expect(isPdfUri('file:///tmp/photo.jpg')).toBe(false);
  });

  it('identifies image URIs and MIME types accurately', () => {
    expect(isImageUri('file:///tmp/scan.jpg')).toBe(true);
    expect(isImageUri('file:///tmp/scan.HEIC')).toBe(true);
    expect(isImageUri('file:///tmp/scan.png')).toBe(true);
    expect(isImageUri('file:///tmp/file', 'image/jpeg')).toBe(true);
    expect(isImageUri('file:///tmp/doc.pdf')).toBe(false);
  });

  it('gracefully reports unavailable when importing a PDF in Expo Go (ScanFlowOcr === null)', async () => {
    expect(pdfToolkitService.canImportPdf).toBe(false);
    const res = await pdfToolkitService.importPdfFile('file:///cache/test.pdf');
    expect(res).toEqual({ status: 'unavailable' });
  });
});
