/**
 * saveScan(): new document / add pages / retake, temp-file cleanup and the
 * notice hand-over to the document screen. Repository, pipeline and storage
 * are mocked (no SQLite / Skia / file system in Node).
 */

import { beforeEach, expect, jest, test } from '@jest/globals';
import { saveScan, scanNotices } from '../src/services/ScanImportService';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

const mockRepo = {
  getPage: jest.fn<AsyncFn>(),
  replacePageSource: jest.fn<AsyncFn>(),
  addPages: jest.fn<AsyncFn>(),
  getById: jest.fn<AsyncFn>(),
  reorderPages: jest.fn<AsyncFn>(),
  create: jest.fn<AsyncFn>(),
};
const mockImportPages = jest.fn<AsyncFn>();
const mockDeleteTempFile = jest.fn<AsyncFn>();

// jest.mock is hoisted above the imports: the factories run before the mock
// objects above are initialised, so they only reference them lazily (getters / closures)
jest.mock('../src/services/DocumentRepository', () => ({
  get documentRepository() {
    return mockRepo;
  },
}));
jest.mock('../src/services/PageRenderService', () => ({ importPages: (...args: unknown[]) => mockImportPages(...args) }));
jest.mock('../src/services/StorageService', () => ({ storageService: { deleteTempFile: (uri: string) => mockDeleteTempFile(uri) } }));

const QUAD = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

function imported(n: number, detected: boolean[] = []) {
  return Array.from({ length: n }, (_, i) => ({
    originalUri: `file:///doc/scanflow/orig_${i}.jpg`,
    proxyUri: `file:///doc/scanflow/proxies/proxy_${i}.jpg`,
    corners: detected[i] ? QUAD : null,
    filter: 'auto',
    rotation: 0,
    pageFormat: 'auto',
  }));
}

const page = (id: string, documentId = 'doc_1') => ({ id, documentId, filter: 'magicColor' });

beforeEach(() => {
  jest.clearAllMocks();
  // drain notices left by earlier tests
  ['doc_1', 'doc_new'].forEach((d) => scanNotices.take(d));
});

test('creates a new document from scanner pages without detection', async () => {
  mockImportPages.mockResolvedValue(imported(2));
  mockRepo.create.mockResolvedValue({ id: 'doc_new' });
  mockRepo.getById.mockResolvedValue({ document: { id: 'doc_new' }, pages: [page('p1', 'doc_new'), page('p2', 'doc_new')] });

  const uris = ['file:///cache/DocumentScanner/a.jpg', 'file:///cache/DocumentScanner/b.jpg'];
  const res = await saveScan({ uris, detect: false, title: 'Scan 05.11.2026 10:00' });

  expect(mockImportPages).toHaveBeenCalledWith(uris, undefined, { detect: false });
  expect(mockRepo.create).toHaveBeenCalledWith({ title: 'Scan 05.11.2026 10:00', pages: imported(2) });
  expect(res).toEqual({ documentId: 'doc_new', created: true, pageIds: ['p1', 'p2'], undetectedPageIds: [] });
  expect(mockDeleteTempFile.mock.calls.map((c) => c[0])).toEqual(uris);
  expect(scanNotices.take('doc_new')).toEqual({ pageIds: ['p1', 'p2'], undetectedPageIds: [] });
  expect(scanNotices.take('doc_new')).toBeNull();
});

test('reports pages without a detected edge when detection ran', async () => {
  mockImportPages.mockResolvedValue(imported(3, [true, false, true]));
  mockRepo.addPages.mockResolvedValue(['n1', 'n2', 'n3']);

  const res = await saveScan({ uris: ['a', 'b', 'c'], detect: true, title: 'x', documentId: 'doc_1' });

  expect(mockRepo.addPages).toHaveBeenCalledWith('doc_1', imported(3, [true, false, true]));
  expect(mockRepo.create).not.toHaveBeenCalled();
  expect(res).toEqual({ documentId: 'doc_1', created: false, pageIds: ['n1', 'n2', 'n3'], undetectedPageIds: ['n2'] });
  expect(scanNotices.take('doc_1')).toEqual({ pageIds: ['n1', 'n2', 'n3'], undetectedPageIds: ['n2'] });
});

test('retake replaces the page and keeps further scanned pages right after it', async () => {
  mockRepo.getPage.mockResolvedValue(page('p2'));
  mockImportPages.mockResolvedValue(imported(3));
  mockRepo.addPages.mockResolvedValue(['x1', 'x2']);
  mockRepo.getById.mockResolvedValue({
    document: { id: 'doc_1' },
    pages: [page('p1'), page('p2'), page('p3'), page('x1'), page('x2')],
  });

  const res = await saveScan({ uris: ['a', 'b', 'c'], detect: false, title: 'x', documentId: 'doc_1', replacePageId: 'p2' });

  const first = imported(3)[0];
  expect(mockRepo.replacePageSource).toHaveBeenCalledWith(
    'p2',
    { originalUri: first.originalUri, proxyUri: first.proxyUri },
    { corners: null, rotation: 0, filter: 'magicColor' }
  );
  expect(mockRepo.addPages).toHaveBeenCalledWith('doc_1', imported(3).slice(1));
  expect(mockRepo.reorderPages).toHaveBeenCalledWith('doc_1', ['p1', 'p2', 'x1', 'x2', 'p3']);
  expect(res).toEqual({ documentId: 'doc_1', created: false, pageIds: ['p2', 'x1', 'x2'], undetectedPageIds: [] });
});

test('single-page retake does not add or reorder pages', async () => {
  mockRepo.getPage.mockResolvedValue(page('p1'));
  mockImportPages.mockResolvedValue(imported(1, [true]));

  const res = await saveScan({ uris: ['a'], detect: true, title: 'x', replacePageId: 'p1' });

  expect(mockRepo.replacePageSource).toHaveBeenCalledWith(
    'p1',
    expect.anything(),
    { corners: QUAD, rotation: 0, filter: 'magicColor' }
  );
  expect(mockRepo.addPages).not.toHaveBeenCalled();
  expect(mockRepo.reorderPages).not.toHaveBeenCalled();
  expect(res.pageIds).toEqual(['p1']);
  expect(res.undetectedPageIds).toEqual([]);
});

test('keeps the source images when the import fails (retry possible)', async () => {
  mockImportPages.mockRejectedValue(new Error('decode failed'));
  await expect(saveScan({ uris: ['a', 'b'], detect: true, title: 'x' })).rejects.toThrow('decode failed');
  expect(mockDeleteTempFile).not.toHaveBeenCalled();
  expect(mockRepo.create).not.toHaveBeenCalled();
  expect(scanNotices.take('doc_new')).toBeNull();
});

test('rejects a retake of a missing page before importing anything', async () => {
  mockRepo.getPage.mockResolvedValue(null);
  await expect(saveScan({ uris: ['a'], detect: true, title: 'x', replacePageId: 'gone' })).rejects.toThrow('not found');
  expect(mockImportPages).not.toHaveBeenCalled();
});

test('notices for the same document are merged until taken', () => {
  scanNotices.push('doc_1', { pageIds: ['a'], undetectedPageIds: [] });
  scanNotices.push('doc_1', { pageIds: ['b'], undetectedPageIds: ['b'] });
  expect(scanNotices.take('doc_1')).toEqual({ pageIds: ['a', 'b'], undetectedPageIds: ['b'] });
  expect(scanNotices.take('doc_1')).toBeNull();
});
