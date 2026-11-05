/**
 * Exported PDFs / JPGs must not stay readable in the app cache: the share
 * sheet's file is deleted as soon as the sheet closes (also on errors), and
 * only files inside the export directory are ever deleted.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { exportFolderOf, exportService } from '../src/services/ExportService';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
const mockIsAvailable = jest.fn<AsyncFn>();
const mockShare = jest.fn<AsyncFn>();
const mockDelete = jest.fn<AsyncFn>();
const EXPORT_DIR = 'file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/scanflow-export/';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailable(...args),
  shareAsync: (...args: unknown[]) => mockShare(...args),
}));
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (...args: unknown[]) => mockDelete(...args),
  EncodingType: { Base64: 'base64' },
}));
jest.mock('../src/services/ImagePipelineService', () => ({ imagePipeline: {} }));
jest.mock('../src/services/StorageService', () => ({
  storageService: { exportDir: 'file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/scanflow-export/' },
}));

beforeEach(() => {
  mockIsAvailable.mockReset().mockResolvedValue(true);
  mockShare.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('exportFolderOf', () => {
  it('returns the per-export folder or a file directly in the export directory', () => {
    expect(exportFolderOf(`${EXPORT_DIR}1712000000000/Rechnung März.pdf`, EXPORT_DIR)).toBe(`${EXPORT_DIR}1712000000000/`);
    expect(exportFolderOf(`${EXPORT_DIR}1712000000000/a/b.jpg`, EXPORT_DIR)).toBe(`${EXPORT_DIR}1712000000000/`);
    expect(exportFolderOf(`${EXPORT_DIR}Scan.pdf`, EXPORT_DIR)).toBe(`${EXPORT_DIR}Scan.pdf`);
  });

  it('never points outside the export directory', () => {
    for (const uri of [
      EXPORT_DIR,
      'file:///var/mobile/Containers/Data/Application/ABC/Documents/scanflow/doc-1/page-1.jpg',
      'file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/scanflow-export-old/x.pdf',
      `${EXPORT_DIR}../../Documents/scanflow/db.sqlite`,
      `${EXPORT_DIR}1712/../../x.pdf`,
      '',
    ]) {
      expect(exportFolderOf(uri, EXPORT_DIR)).toBeNull();
    }
    expect(exportFolderOf(`${EXPORT_DIR}1712/Scan.pdf`, '')).toBeNull();
  });
});

describe('shareDocument', () => {
  const uri = `${EXPORT_DIR}1712000000000/Scan.pdf`;

  it('deletes the export folder once the share sheet is closed', async () => {
    await exportService.shareDocument(uri, 'pdf', 'Teilen');
    expect(mockShare).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }));
    expect(mockDelete).toHaveBeenCalledWith(`${EXPORT_DIR}1712000000000/`, { idempotent: true });
    expect(mockDelete.mock.invocationCallOrder[0]).toBeGreaterThan(mockShare.mock.invocationCallOrder[0]);
  });

  it('shares JPGs without a declared type (no extra ".jpeg" copy in expo-sharing\'s cache)', async () => {
    const jpg = `${EXPORT_DIR}1712000000000/Scan-2.jpg`;
    await exportService.shareDocument(jpg, 'jpg', 'Teilen');
    expect(mockShare).toHaveBeenCalledWith(jpg, { dialogTitle: 'Teilen' });
    expect(mockDelete).toHaveBeenCalledWith(`${EXPORT_DIR}1712000000000/`, { idempotent: true });
  });

  it('also deletes it when sharing fails or is not available', async () => {
    mockShare.mockRejectedValueOnce(new Error('share failed'));
    await expect(exportService.shareDocument(uri, 'pdf')).rejects.toThrow('share failed');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    mockIsAvailable.mockResolvedValueOnce(false);
    await expect(exportService.shareDocument(uri, 'jpg')).rejects.toThrow();
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it('a failed deletion does not break sharing; foreign files are never deleted', async () => {
    mockDelete.mockRejectedValueOnce(new Error('busy'));
    await expect(exportService.shareDocument(uri, 'pdf')).resolves.toBeUndefined();
    mockDelete.mockClear();
    await exportService.discardExport('file:///var/mobile/Containers/Data/Application/ABC/Documents/scanflow/doc-1/page-1.jpg');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
