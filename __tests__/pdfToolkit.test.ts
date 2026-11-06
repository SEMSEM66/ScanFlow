import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { isImageUri, isPdfUri, titleFromFileUri } from '../src/services/PdfToolkitService';

describe('PdfToolkitService pure URI & filename helpers (M1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts decoded human-readable titles from file URIs', () => {
    expect(titleFromFileUri('file:///var/mobile/Containers/Data/Application/Inbox/Steuerbescheid%202025.pdf')).toBe(
      'Steuerbescheid 2025'
    );
    expect(titleFromFileUri('Rechnung_Telekom.PDF')).toBe('Rechnung_Telekom');
    expect(titleFromFileUri('file:///tmp/.pdf', 'Scan')).toBe('.pdf');
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
});
