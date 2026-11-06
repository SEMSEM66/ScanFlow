import { describe, expect, it } from '@jest/globals';
import {
  parseBackupManifest,
  serializeBackupManifest,
  type BackupManifest,
} from '../src/utils/backupManifest';
import { buildZip, readZip, utf8Encode, utf8Decode } from '../src/docx/zip';

describe('M3 Backup: manifest serialization & parsing', () => {
  const sampleManifest: BackupManifest = {
    format: 'scanflow-backup',
    version: 1,
    exportedAt: 1770000000000,
    appVersion: '1.11.0',
    folders: [
      { id: 'f1', name: 'Finanzen', createdAt: 1770000000000, updatedAt: 1770000000000 },
    ],
    documents: [
      {
        id: 'doc1',
        title: 'Gehaltsabrechnung',
        folderId: 'f1',
        isFavorite: true,
        tags: ['Gehalt', '2026'],
        titleAuto: false,
        createdAt: 1770000000000,
        updatedAt: 1770000000000,
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            originalPath: 'originals/doc1_p1.jpg',
            filter: 'magicColor',
            rotation: 0,
            corners: [
              { x: 0.05, y: 0.05 },
              { x: 0.95, y: 0.05 },
              { x: 0.95, y: 0.95 },
              { x: 0.05, y: 0.95 },
            ],
            pageFormat: 'a4',
            adjustments: { brightness: 0, contrast: 0, sharpness: 0, denoise: false },
            annotations: [
              {
                id: 'ann1',
                type: 'signature',
                x: 0.4,
                y: 0.7,
                width: 0.3,
                height: 0.1,
                rotation: 0,
                color: '#0B2E6B',
                opacity: 1,
                strokes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
              },
            ],
            ocrText: {
              ocrKey: 'ocr_sample_key',
              engine: 'apple-vision',
              languages: 'de-DE',
              text: 'Bruttoentgelt 4500,00 EUR',
              linesJson: '[]',
              createdAt: 1770000000000,
            },
            createdAt: 1770000000000,
            updatedAt: 1770000000000,
          },
        ],
      },
    ],
    signatures: [
      {
        id: 'sig1',
        name: 'Meine Unterschrift',
        strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
        color: '#0B2E6B',
        aspectRatio: 2.5,
        imagePngBase64: null,
        createdAt: 1770000000000,
      },
    ],
  };

  it('serializes and parses round-trip faithfully', () => {
    const json = serializeBackupManifest(sampleManifest);
    const parsed = parseBackupManifest(json);
    expect(parsed.format).toBe('scanflow-backup');
    expect(parsed.version).toBe(1);
    expect(parsed.folders.length).toBe(1);
    expect(parsed.documents.length).toBe(1);
    expect(parsed.documents[0].isFavorite).toBe(true);
    expect(parsed.documents[0].tags).toEqual(['Gehalt', '2026']);
    expect(parsed.documents[0].pages[0].filter).toBe('magicColor');
    expect(parsed.documents[0].pages[0].ocrText?.text).toBe('Bruttoentgelt 4500,00 EUR');
    expect(parsed.signatures.length).toBe(1);
  });

  it('rejects unsupported versions or corrupted format', () => {
    expect(() => parseBackupManifest('{}')).toThrow('unrecognized format');
    expect(() =>
      parseBackupManifest(JSON.stringify({ format: 'scanflow-backup', version: 99 }))
    ).toThrow('Unsupported backup manifest version');
    expect(() => parseBackupManifest('not json')).toThrow('malformed JSON');
  });

  it('packs and unpacks ZIP archive containing manifest and files', () => {
    const manifestJson = serializeBackupManifest(sampleManifest);
    const fakeImageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

    const zipBytes = buildZip([
      { name: 'manifest.json', data: manifestJson },
      { name: 'originals/doc1_p1.jpg', data: fakeImageBytes },
    ]);

    expect(zipBytes.length).toBeGreaterThan(50);

    const unpacked = readZip(zipBytes);
    expect(unpacked.has('manifest.json')).toBe(true);
    expect(unpacked.has('originals/doc1_p1.jpg')).toBe(true);

    const readManifestText = utf8Decode(unpacked.get('manifest.json')!);
    const parsed = parseBackupManifest(readManifestText);
    expect(parsed.documents[0].title).toBe('Gehaltsabrechnung');

    const readImgBytes = unpacked.get('originals/doc1_p1.jpg')!;
    expect(readImgBytes).toEqual(fakeImageBytes);
  });

  it('rejects path traversal attempts in ZIP entries', () => {
    const malformedZip = buildZip([
      { name: '../etc/passwd', data: 'root:x:0:0:' },
    ]);
    expect(() => readZip(malformedZip)).toThrow('Unsafe ZIP entry path');
  });
});
