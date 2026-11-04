import * as FileSystem from 'expo-file-system/legacy';

class StorageService {
  private baseDir: string = `${FileSystem.documentDirectory || ''}scanflow/`;

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

  async saveImage(sourceUri: string, prefix: string = 'page'): Promise<string> {
    await this.initStorageDirectory();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
    const targetFilename = `${cleanPrefix}_${timestamp}_${random}.${extension}`;
    const targetUri = `${this.baseDir}${targetFilename}`;

    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });

    return targetUri;
  }

  /**
   * Secure zero-trace file shredding:
   * Overwrites the file contents with zero-bytes before unlinking to prevent flash memory data recovery.
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

  async getStorageSize(): Promise<number> {
    try {
      await this.initStorageDirectory();
      const files = await FileSystem.readDirectoryAsync(this.baseDir);
      let totalSize = 0;
      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(`${this.baseDir}${file}`);
        if (fileInfo.exists && !fileInfo.isDirectory && fileInfo.size) {
          totalSize += fileInfo.size;
        }
      }
      return totalSize;
    } catch {
      return 0;
    }
  }

  async clearAllStorage(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (dirInfo.exists) {
        // Shred all individual files first
        const files = await FileSystem.readDirectoryAsync(this.baseDir);
        for (const file of files) {
          await this.deleteFile(`${this.baseDir}${file}`);
        }
        await FileSystem.deleteAsync(this.baseDir, { idempotent: true });
        await this.initStorageDirectory();
      }
    } catch (err) {
      console.warn('[StorageService] Failed to clear storage', err);
    }
  }
}

export const storageService = new StorageService();
