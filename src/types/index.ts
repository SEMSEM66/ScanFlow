export type FilterType = 'original' | 'auto' | 'blackAndWhite' | 'grayscale' | 'magicColor';

export type ExportQuality = 'low' | 'medium' | 'high';

export type ExportFormat = 'pdf' | 'jpg';

export type ThemeMode = 'system' | 'light' | 'dark';

export type LanguageMode = 'de' | 'en';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  title: string;
  folderId: string | null;
  pageCount: number;
  thumbnailUri: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number;
  originalUri: string;
  previewUri: string;
  filter: FilterType;
  rotation: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDocumentInput {
  title: string;
  folderId?: string | null;
  pages: {
    originalUri: string;
    previewUri?: string;
    filter?: FilterType;
    rotation?: number;
  }[];
}

export interface UpdateDocumentInput {
  title?: string;
  folderId?: string | null;
}

export interface DocumentFilterOptions {
  folderId?: string | null;
  searchQuery?: string;
  sortBy?: 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc';
}
