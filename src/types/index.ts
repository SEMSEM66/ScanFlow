import type { Adjustments, FilterType, PageFormat, Quad, Rotation } from '../imaging/types';
import type { AnnotationType, PageAnnotation, SavedSignature, StrokePoint } from '../imaging/annotations';

export type { Adjustments, ExportDpi, FilterType, PageFormat, Point, Quad, Rotation } from '../imaging/types';
export type { AnnotationType, PageAnnotation, SavedSignature, StrokePoint };

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
  /** Epoch ms when moved to Trash (null = active document). */
  deletedAt?: number | null;
  /** True when pinned to the top of the Library. */
  isFavorite?: boolean;
  /** Normalized user tags attached to this document. */
  tags?: string[];
  /** True while the title is still auto-generated and eligible for Smart Naming after first OCR. */
  titleAuto?: boolean;
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
  /** Non-destructive visual annotations (signatures, text, date stamps, pen, highlighter). */
  annotations?: PageAnnotation[];
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
  annotations?: PageAnnotation[];
}

export interface CreateDocumentInput {
  title: string;
  folderId?: string | null;
  isFavorite?: boolean;
  tags?: string[];
  titleAuto?: boolean;
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
  annotations?: PageAnnotation[];
}

export interface UpdateDocumentInput {
  title?: string;
  folderId?: string | null;
  isFavorite?: boolean;
  tags?: string[];
  titleAuto?: boolean;
}

export interface DocumentFilterOptions {
  folderId?: string | null;
  searchQuery?: string;
  tag?: string | null;
  favoritesOnly?: boolean;
  sortBy?: 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc';
}
