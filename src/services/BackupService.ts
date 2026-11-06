import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  BACKUP_MANIFEST_VERSION,
  BACKUP_WARNING_BYTES,
  parseBackupManifest,
  serializeBackupManifest,
  type BackupDocumentEntry,
  type BackupFolderEntry,
  type BackupManifest,
  type BackupPageEntry,
} from '../utils/backupManifest';
import { base64ToUint8, buildZip, readZip, uint8ToBase64, utf8Decode } from '../docx/zip';
import { documentRepository } from './DocumentRepository';
import { folderRepository } from './FolderRepository';
import { signatureRepository } from './SignatureRepository';
import { pageTextRepository } from './PageTextRepository';
import { storageService } from './StorageService';

export interface BackupEstimate {
  documentCount: number;
  pageCount: number;
  totalBytes: number;
  exceedsWarning: boolean;
}

export interface BackupResult {
  zipUri: string;
  sizeBytes: number;
  manifest: BackupManifest;
}

export interface RestoreSummary {
  foldersRestored: number;
  documentsRestored: number;
  pagesRestored: number;
  signaturesRestored: number;
}

export class BackupService {
  async estimateBackup(): Promise<BackupEstimate> {
    const docs = await documentRepository.getAll();
    let totalBytes = 0;
    let pageCount = 0;

    for (const doc of docs) {
      const data = await documentRepository.getById(doc.id);
      if (!data) continue;
      pageCount += data.pages.length;
      for (const p of data.pages) {
        totalBytes += await storageService.fileSize(p.originalUri);
      }
    }

    return {
      documentCount: docs.length,
      pageCount,
      totalBytes,
      exceedsWarning: totalBytes >= BACKUP_WARNING_BYTES,
    };
  }

  async createBackupZip(
    onProgress?: (current: number, total: number) => void
  ): Promise<BackupResult> {
    const [folders, docs, signatures] = await Promise.all([
      folderRepository.getAll(),
      documentRepository.getAll(),
      signatureRepository.getAll(),
    ]);

    const folderEntries: BackupFolderEntry[] = folders.map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));

    const documentEntries: BackupDocumentEntry[] = [];
    const zipEntries: { name: string; data: Uint8Array | string }[] = [];

    // Calculate total pages for progress
    const docDataList: { doc: typeof docs[0]; pages: NonNullable<Awaited<ReturnType<typeof documentRepository.getById>>>['pages'] }[] = [];
    let totalPages = 0;
    for (const doc of docs) {
      const data = await documentRepository.getById(doc.id);
      if (data) {
        docDataList.push({ doc, pages: data.pages });
        totalPages += data.pages.length;
      }
    }

    let processedPages = 0;

    for (const item of docDataList) {
      const pageEntries: BackupPageEntry[] = [];

      for (const p of item.pages) {
        const originalPath = `originals/doc_${item.doc.id}_p${p.pageNumber}.jpg`;
        const b64 = await storageService.readBase64(p.originalUri);
        const bytes = base64ToUint8(b64);
        zipEntries.push({ name: originalPath, data: bytes });

        const ocrRec = await pageTextRepository.get(p.id);
        const ocrText = ocrRec
          ? {
              ocrKey: ocrRec.key,
              engine: ocrRec.engine,
              languages: Array.isArray(ocrRec.languages)
                ? ocrRec.languages.join(',')
                : String(ocrRec.languages ?? ''),
              text: ocrRec.text,
              linesJson: JSON.stringify(ocrRec.lines),
              createdAt: ocrRec.createdAt,
            }
          : null;

        pageEntries.push({
          id: p.id,
          pageNumber: p.pageNumber,
          originalPath,
          filter: p.filter,
          rotation: p.rotation,
          corners: p.corners,
          pageFormat: p.pageFormat,
          adjustments: p.adjustments,
          annotations: p.annotations ?? [],
          ocrText,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        });

        processedPages += 1;
        onProgress?.(processedPages, Math.max(1, totalPages));
      }

      documentEntries.push({
        id: item.doc.id,
        title: item.doc.title,
        folderId: item.doc.folderId,
        isFavorite: Boolean(item.doc.isFavorite),
        tags: item.doc.tags ?? [],
        titleAuto: Boolean(item.doc.titleAuto),
        createdAt: item.doc.createdAt,
        updatedAt: item.doc.updatedAt,
        pages: pageEntries,
      });
    }

    const manifest: BackupManifest = {
      format: 'scanflow-backup',
      version: BACKUP_MANIFEST_VERSION,
      exportedAt: Date.now(),
      appVersion: '1.11.0',
      folders: folderEntries,
      documents: documentEntries,
      signatures,
    };

    const manifestJson = serializeBackupManifest(manifest);
    zipEntries.unshift({ name: 'manifest.json', data: manifestJson });

    const archiveBytes = buildZip(zipEntries);
    const exportDir = await storageService.ensureDir(storageService.exportDir);
    const zipPath = `${exportDir}ScanFlow_Backup_${Date.now()}.zip`;
    await FileSystem.writeAsStringAsync(zipPath, uint8ToBase64(archiveBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });

    return {
      zipUri: zipPath,
      sizeBytes: archiveBytes.length,
      manifest,
    };
  }

  async shareBackup(zipUri: string): Promise<void> {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device');
    }
    await Sharing.shareAsync(zipUri, {
      mimeType: 'application/zip',
      dialogTitle: 'ScanFlow Backup',
      UTI: 'public.zip-archive',
    });
    // Temporary file cleanup after share sheet closes
    await storageService.deleteTempFile(zipUri);
  }

  async inspectBackupZip(zipUri: string): Promise<BackupManifest> {
    const b64 = await FileSystem.readAsStringAsync(zipUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToUint8(b64);
    const entries = readZip(bytes);
    const manifestBytes = entries.get('manifest.json');
    if (!manifestBytes) {
      throw new Error('Invalid backup archive: missing manifest.json');
    }
    const manifestJson = utf8Decode(manifestBytes);
    return parseBackupManifest(manifestJson);
  }

  async restoreBackupZip(
    zipUri: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<RestoreSummary> {
    const b64 = await FileSystem.readAsStringAsync(zipUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const archiveBytes = base64ToUint8(b64);
    const entries = readZip(archiveBytes);

    const manifestBytes = entries.get('manifest.json');
    if (!manifestBytes) {
      throw new Error('Invalid backup archive: missing manifest.json');
    }
    const manifest = parseBackupManifest(utf8Decode(manifestBytes));

    // 1. Restore Folders (map old folder id -> new/existing folder id)
    const folderIdMap = new Map<string, string>();
    const existingFolders = await folderRepository.getAll();
    const existingFolderByName = new Map(existingFolders.map((f) => [f.name.toLowerCase(), f.id]));

    let foldersRestored = 0;
    for (const f of manifest.folders) {
      const match = existingFolderByName.get(f.name.toLowerCase());
      if (match) {
        folderIdMap.set(f.id, match);
      } else {
        const created = await folderRepository.create(f.name);
        folderIdMap.set(f.id, created.id);
        existingFolderByName.set(f.name.toLowerCase(), created.id);
        foldersRestored += 1;
      }
    }

    // 2. Restore Signatures
    let signaturesRestored = 0;
    const existingSignatures = await signatureRepository.getAll();
    const existingSigNames = new Set(existingSignatures.map((s) => s.name.toLowerCase()));
    for (const sig of manifest.signatures) {
      if (!existingSigNames.has(sig.name.toLowerCase())) {
        if (sig.imagePngBase64) {
          await signatureRepository.createFromPhoto({
            name: sig.name,
            imagePngBase64: sig.imagePngBase64,
            aspectRatio: sig.aspectRatio,
            color: sig.color,
          });
        } else {
          await signatureRepository.createFromStrokes({
            name: sig.name,
            strokes: sig.strokes,
            color: sig.color,
          });
        }
        signaturesRestored += 1;
      }
    }

    // 3. Restore Documents & Pages
    let documentsRestored = 0;
    let pagesRestored = 0;
    const totalPages = manifest.documents.reduce((acc, d) => acc + d.pages.length, 0);

    for (const docEntry of manifest.documents) {
      const targetFolderId = docEntry.folderId ? folderIdMap.get(docEntry.folderId) ?? null : null;

      const newPages = [];
      const ocrToRestore: { pageIndex: number; text: NonNullable<BackupPageEntry['ocrText']> }[] = [];

      for (let i = 0; i < docEntry.pages.length; i++) {
        const p = docEntry.pages[i];
        const imgBytes = entries.get(p.originalPath);
        if (!imgBytes) {
          throw new Error(`Missing page image in backup: ${p.originalPath}`);
        }

        const savedUri = await storageService.writeBase64(
          uint8ToBase64(imgBytes),
          `doc_restore_p${p.pageNumber}`,
          'jpg'
        );

        newPages.push({
          originalUri: savedUri,
          filter: p.filter,
          rotation: p.rotation,
          corners: p.corners,
          pageFormat: p.pageFormat,
          adjustments: p.adjustments,
          annotations: p.annotations,
        });

        if (p.ocrText) {
          ocrToRestore.push({ pageIndex: i, text: p.ocrText });
        }

        pagesRestored += 1;
        onProgress?.(pagesRestored, Math.max(1, totalPages));
      }

      const created = await documentRepository.create({
        title: docEntry.title,
        folderId: targetFolderId,
        isFavorite: docEntry.isFavorite,
        tags: docEntry.tags,
        titleAuto: docEntry.titleAuto,
        pages: newPages,
      });

      // Restore OCR text records if available
      if (ocrToRestore.length > 0) {
        const fullDoc = await documentRepository.getById(created.id);
        if (fullDoc) {
          for (const item of ocrToRestore) {
            const page = fullDoc.pages[item.pageIndex];
            if (page) {
              let lines = [];
              try {
                lines = JSON.parse(item.text.linesJson);
              } catch {
                lines = [];
              }
              await pageTextRepository.save(page.id, {
                key: item.text.ocrKey,
                engine: item.text.engine,
                languages: item.text.languages.split(','),
                lines,
              });
            }
          }
        }
      }

      documentsRestored += 1;
    }

    return {
      foldersRestored,
      documentsRestored,
      pagesRestored,
      signaturesRestored,
    };
  }

  async pickAndRestoreBackup(
    onProgress?: (current: number, total: number) => void
  ): Promise<{ manifest: BackupManifest; summary: RestoreSummary }> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'public.zip-archive'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      throw new Error('cancelled');
    }

    const fileUri = result.assets[0].uri;
    try {
      const manifest = await this.inspectBackupZip(fileUri);
      const summary = await this.restoreBackupZip(fileUri, onProgress);
      return { manifest, summary };
    } finally {
      await storageService.deleteTempFile(fileUri);
    }
  }
}

export const backupService = new BackupService();
