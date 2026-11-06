/**
 * Versioned manifest format for Full-Library ZIP Backups (`manifest.json`).
 * Pure TypeScript so round-trip serialization and validation can be tested in Node.
 */
import type { Adjustments, FilterType, PageFormat, Quad, Rotation } from '../imaging/types';
import { DEFAULT_ADJUSTMENTS } from '../imaging/types';
import { normalizeAdjustments, normalizeFilter, normalizePageFormat, normalizeRotation, parseCorners } from '../imaging/pageState';
import { normalizeAnnotation, type PageAnnotation, type SavedSignature } from '../imaging/annotations';
import { normalizeTagList } from './organization';

export const BACKUP_MANIFEST_VERSION = 1;
export const BACKUP_WARNING_BYTES = 150 * 1024 * 1024; // 150 MB warning threshold

export interface BackupFolderEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface BackupPageTextEntry {
  ocrKey: string;
  engine: string;
  languages: string;
  text: string;
  linesJson: string;
  createdAt: number;
}

export interface BackupPageEntry {
  id: string;
  pageNumber: number;
  /** Relative path inside the ZIP archive (e.g. "originals/page_1.jpg"). */
  originalPath: string;
  filter: FilterType;
  rotation: Rotation;
  corners: Quad | null;
  pageFormat: PageFormat;
  adjustments: Adjustments;
  annotations: PageAnnotation[];
  ocrText?: BackupPageTextEntry | null;
  createdAt: number;
  updatedAt: number;
}

export interface BackupDocumentEntry {
  id: string;
  title: string;
  folderId: string | null;
  isFavorite: boolean;
  tags: string[];
  titleAuto: boolean;
  /** Optional relative path to rendered PDF inside the ZIP (e.g. "pdfs/Invoice.pdf"). */
  pdfPath?: string;
  createdAt: number;
  updatedAt: number;
  pages: BackupPageEntry[];
}

export interface BackupManifest {
  format: 'scanflow-backup';
  version: number;
  exportedAt: number;
  appVersion: string;
  folders: BackupFolderEntry[];
  documents: BackupDocumentEntry[];
  signatures: SavedSignature[];
}

export function serializeBackupManifest(manifest: BackupManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Validates and normalizes a parsed `manifest.json` from a backup ZIP archive.
 * Throws a descriptive error if the format or version is unsupported.
 */
export function parseBackupManifest(jsonText: string): BackupManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid backup manifest: malformed JSON');
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid backup manifest: root must be an object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== 'scanflow-backup') {
    throw new Error('Invalid backup manifest: unrecognized format identifier');
  }
  if (typeof obj.version !== 'number' || obj.version < 1 || obj.version > BACKUP_MANIFEST_VERSION) {
    throw new Error(`Unsupported backup manifest version: ${String(obj.version)}`);
  }

  const exportedAt = typeof obj.exportedAt === 'number' && Number.isFinite(obj.exportedAt) ? obj.exportedAt : Date.now();
  const appVersion = typeof obj.appVersion === 'string' ? obj.appVersion : 'unknown';

  const folders: BackupFolderEntry[] = [];
  if (Array.isArray(obj.folders)) {
    for (const f of obj.folders) {
      if (!f || typeof f !== 'object') continue;
      const rec = f as Record<string, unknown>;
      const id = typeof rec.id === 'string' ? rec.id.trim() : '';
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!id || !name) continue;
      folders.push({
        id,
        name,
        createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : exportedAt,
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : exportedAt,
      });
    }
  }

  const documents: BackupDocumentEntry[] = [];
  if (Array.isArray(obj.documents)) {
    for (const d of obj.documents) {
      if (!d || typeof d !== 'object') continue;
      const rec = d as Record<string, unknown>;
      const id = typeof rec.id === 'string' ? rec.id.trim() : '';
      const title = typeof rec.title === 'string' ? rec.title.trim() : '';
      if (!id || !title || !Array.isArray(rec.pages)) continue;

      const pages: BackupPageEntry[] = [];
      for (const p of rec.pages) {
        if (!p || typeof p !== 'object') continue;
        const pr = p as Record<string, unknown>;
        const pageId = typeof pr.id === 'string' ? pr.id.trim() : '';
        const originalPath = typeof pr.originalPath === 'string' ? pr.originalPath.trim() : '';
        if (!pageId || !originalPath || originalPath.includes('..') || originalPath.startsWith('/')) {
          continue;
        }
        const corners = pr.corners ? parseCorners(JSON.stringify(pr.corners)) : null;
        const adjustments = pr.adjustments
          ? normalizeAdjustments(pr.adjustments as Partial<Adjustments>)
          : { ...DEFAULT_ADJUSTMENTS };
        const annotations: PageAnnotation[] = Array.isArray(pr.annotations)
          ? pr.annotations
              .map((a) => normalizeAnnotation(a))
              .filter((a): a is PageAnnotation => a !== null)
          : [];

        let ocrText: BackupPageTextEntry | null = null;
        if (pr.ocrText && typeof pr.ocrText === 'object') {
          const ot = pr.ocrText as Record<string, unknown>;
          if (typeof ot.ocrKey === 'string' && typeof ot.text === 'string') {
            ocrText = {
              ocrKey: ot.ocrKey,
              engine: typeof ot.engine === 'string' ? ot.engine : 'apple-vision',
              languages: typeof ot.languages === 'string' ? ot.languages : 'de-DE,en-US',
              text: ot.text,
              linesJson: typeof ot.linesJson === 'string' ? ot.linesJson : '[]',
              createdAt: typeof ot.createdAt === 'number' ? ot.createdAt : exportedAt,
            };
          }
        }

        pages.push({
          id: pageId,
          pageNumber: typeof pr.pageNumber === 'number' ? pr.pageNumber : pages.length + 1,
          originalPath,
          filter: normalizeFilter(pr.filter),
          rotation: normalizeRotation(pr.rotation),
          corners,
          pageFormat: normalizePageFormat(pr.pageFormat),
          adjustments,
          annotations,
          ocrText,
          createdAt: typeof pr.createdAt === 'number' ? pr.createdAt : exportedAt,
          updatedAt: typeof pr.updatedAt === 'number' ? pr.updatedAt : exportedAt,
        });
      }

      if (pages.length === 0) continue;

      documents.push({
        id,
        title,
        folderId: typeof rec.folderId === 'string' ? rec.folderId : null,
        isFavorite: Boolean(rec.isFavorite),
        tags: normalizeTagList(Array.isArray(rec.tags) ? rec.tags : []),
        titleAuto: Boolean(rec.titleAuto),
        pdfPath: typeof rec.pdfPath === 'string' ? rec.pdfPath : undefined,
        createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : exportedAt,
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : exportedAt,
        pages,
      });
    }
  }

  const signatures: SavedSignature[] = [];
  if (Array.isArray(obj.signatures)) {
    for (const s of obj.signatures) {
      if (!s || typeof s !== 'object') continue;
      const sr = s as Record<string, unknown>;
      if (typeof sr.id !== 'string' || typeof sr.name !== 'string') continue;
      signatures.push({
        id: sr.id,
        name: sr.name,
        strokes: Array.isArray(sr.strokes) ? (sr.strokes as SavedSignature['strokes']) : [],
        color: typeof sr.color === 'string' ? sr.color : '#0B2E6B',
        aspectRatio: typeof sr.aspectRatio === 'number' ? sr.aspectRatio : 2.4,
        imagePngBase64: typeof sr.imagePngBase64 === 'string' ? sr.imagePngBase64 : null,
        createdAt: typeof sr.createdAt === 'number' ? sr.createdAt : exportedAt,
      });
    }
  }

  return {
    format: 'scanflow-backup',
    version: obj.version,
    exportedAt,
    appVersion,
    folders,
    documents,
    signatures,
  };
}
