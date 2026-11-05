import * as FileSystem from 'expo-file-system/legacy';

/** Sub-directories below scanflow/ (originals stay in the root for v1 compatibility). */
export type StorageArea = 'proxies' | 'renders';

class StorageService {
  private baseDir: string = `${FileSystem.documentDirectory || ''}scanflow/`;

  /** Temporary export files (PDF/JPG) – cleared by iOS when space is needed. */
  get exportDir(): string {
    return `${FileSystem.cacheDirectory || ''}scanflow-export/`;
  }

  async ensureDir(dir: string): Promise<string> {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    return dir;
  }

  areaDir(area: StorageArea): string {
    return `${this.baseDir}${area}/`;
  }

  /** New unique file path in the storage root or an area. */
  async newFilePath(prefix: string, extension: string, area?: StorageArea): Promise<string> {
    const dir = area ? await this.ensureDir(this.areaDir(area)) : await this.initStorageDirectory();
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
    const random = Math.random().toString(36).substring(2, 8);
    return `${dir}${cleanPrefix}_${Date.now()}_${random}.${extension}`;
  }

  /** Moves a (temporary) file into app storage. */
  async moveInto(sourceUri: string, prefix: string, area?: StorageArea): Promise<string> {
    const ext = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
    const target = await this.newFilePath(prefix, ext, area);
    await FileSystem.moveAsync({ from: sourceUri, to: target });
    return target;
  }

  async writeBase64(base64: string, prefix: string, extension: string, area?: StorageArea): Promise<string> {
    const target = await this.newFilePath(prefix, extension, area);
    await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
    return target;
  }

  async readBase64(uri: string): Promise<string> {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }

  async exists(uri: string | null | undefined): Promise<boolean> {
    if (!uri) return false;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists;
    } catch {
      return false;
    }
  }

  async fileSize(uri: string): Promise<number> {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory ? info.size ?? 0 : 0;
  }

  private isPathSafe(path: string): boolean {
    // Prevent directory traversal attacks
    if (path.includes('..') || path.includes('/../') || path.includes('\\..\\')) {
      return false;
    }
    return path.startsWith(this.baseDir) || path.startsWith(FileSystem.documentDirectory || '');
  }

  async initStorageDirectory(): Promise<string> {
    const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
    }
    return this.baseDir;
  }

  /** True if the file lives inside app storage (scanflow/). */
  isStored(uri: string): boolean {
    return uri.startsWith(this.baseDir) && !uri.includes('..');
  }

  /** Copies a file into app storage. */
  async saveImage(sourceUri: string, prefix: string = 'page', area?: StorageArea): Promise<string> {
    const extension = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
    const targetUri = await this.newFilePath(prefix, extension, area);

    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });

    return targetUri;
  }

  /**
   * Deletes a file inside app storage. Best effort: the content is overwritten
   * before unlinking, but on APFS/flash storage (copy-on-write, wear levelling)
   * this is NOT a guaranteed secure erase. iOS Data Protection encrypts the
   * files at rest; deleted blocks are unreadable without the file key.
   */
  async deleteFile(fileUri: string): Promise<void> {
    try {
      if (!this.isPathSafe(fileUri)) {
        console.warn(`[StorageService] Blocked unauthorized path deletion: ${fileUri}`);
        return;
      }

      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists && !info.isDirectory) {
        // Zero-trace shredding: overwrite file bytes with zeros
        try {
          const fileSize = info.size || 2048;
          const shredChunk = '0'.repeat(Math.min(fileSize, 8192));
          await FileSystem.writeAsStringAsync(fileUri, shredChunk, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } catch {
          // Continue to deletion if shredding fails
        }

        // Unlink file from storage
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    } catch (err) {
      console.warn(`[StorageService] Failed to securely delete file: ${fileUri}`, err);
    }
  }

  /** Total size of app storage in bytes (recursive: originals, proxies, renders). */
  async getStorageSize(): Promise<number> {
    try {
      await this.initStorageDirectory();
      return await this.dirSize(this.baseDir);
    } catch {
      return 0;
    }
  }

  private async dirSize(dir: string): Promise<number> {
    const entries = await FileSystem.readDirectoryAsync(dir);
    let total = 0;
    for (const name of entries) {
      const info = await FileSystem.getInfoAsync(`${dir}${name}`);
      if (!info.exists) continue;
      if (info.isDirectory) total += await this.dirSize(`${dir}${name}/`);
      else total += info.size ?? 0;
    }
    return total;
  }

  /** Removes temporary export files (PDF/JPG). */
  async clearCaches(): Promise<void> {
    try {
      await FileSystem.deleteAsync(this.exportDir, { idempotent: true });
    } catch {
      // ignore
    }
  }

  private async deleteTree(dir: string): Promise<void> {
    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const name of entries) {
      const info = await FileSystem.getInfoAsync(`${dir}${name}`);
      if (info.isDirectory) await this.deleteTree(`${dir}${name}/`);
      else await this.deleteFile(`${dir}${name}`);
    }
  }

  async clearAllStorage(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (dirInfo.exists) {
        // Overwrite + delete all individual files first (incl. sub-directories)
        await this.deleteTree(this.baseDir);
        await FileSystem.deleteAsync(this.baseDir, { idempotent: true });
        await this.initStorageDirectory();
      }
    } catch (err) {
      console.warn('[StorageService] Failed to clear storage', err);
    }
  }
}

export const storageService = new StorageService();
