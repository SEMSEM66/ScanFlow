import type { Adjustments, FilterType, PageFormat, Quad, Rotation } from '../imaging/types';

export type { Adjustments, ExportDpi, FilterType, PageFormat, Point, Quad, Rotation } from '../imaging/types';

export type ExportQuality = 'low' | 'medium' | 'high';

export type ExportFormat = 'pdf' | 'jpg' | 'docx';

export type SortOption = 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc';

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
  /** Cached render (crop + filter + rotation + adjustments); equals originalUri before the first render. */
  previewUri: string;
  filter: FilterType;
  rotation: Rotation;
  /** Normalized corners on the original (TL, TR, BR, BL); null = full image. */
  corners: Quad | null;
  pageFormat: PageFormat;
  adjustments: Adjustments;
  /** ≤ 2000 px proxy of the original used for crop UI and previews. */
  proxyUri: string | null;
  /** Render cache key of previewUri (null = preview not rendered yet). */
  renderKey: string | null;
  /** Untouched photo of pages migrated from schema v1. */
  legacyOriginalUri: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Edit state stored per page (all fields optional on update). */
export interface PageEditState {
  filter?: FilterType;
  rotation?: Rotation;
  corners?: Quad | null;
  pageFormat?: PageFormat;
  adjustments?: Adjustments;
}

export interface CreateDocumentInput {
  title: string;
  folderId?: string | null;
  pages: NewPageInput[];
}

export interface NewPageInput {
  originalUri: string;
  proxyUri?: string | null;
  previewUri?: string;
  renderKey?: string | null;
  filter?: FilterType;
  rotation?: Rotation;
  corners?: Quad | null;
  pageFormat?: PageFormat;
  adjustments?: Adjustments;
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
