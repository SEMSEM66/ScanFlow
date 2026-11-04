import * as FileSystem from 'expo-file-system/legacy';

class StorageService {
  private baseDir: string = `${FileSystem.documentDirectory || ''}scanflow/`;

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
    const targetFilename = `${prefix}_${timestamp}_${random}.${extension}`;
    const targetUri = `${this.baseDir}${targetFilename}`;

    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });

    return targetUri;
  }

  async deleteFile(fileUri: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    } catch (err) {
      console.warn(`[StorageService] Failed to delete file: ${fileUri}`, err);
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
        await FileSystem.deleteAsync(this.baseDir, { idempotent: true });
        await this.initStorageDirectory();
      }
    } catch (err) {
      console.warn('[StorageService] Failed to clear storage', err);
    }
  }
}

export const storageService = new StorageService();
