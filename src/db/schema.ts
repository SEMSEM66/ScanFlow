export const CREATE_FOLDERS_TABLE = `
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const CREATE_DOCUMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  folder_id TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  thumbnail_uri TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);
`;

/**
 * pages (schema v2, see migrations.ts):
 * - original_uri: untouched source photo (EXIF orientation baked, metadata stripped)
 * - preview_uri: cached render (crop + filter + rotation) for the current render_key,
 *   equals original_uri until the first render
 * - corners / page_format / filter / rotation / adjustments: non-destructive edit state
 */
export const CREATE_PAGES_TABLE = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  original_uri TEXT NOT NULL,
  preview_uri TEXT NOT NULL,
  filter TEXT NOT NULL DEFAULT 'original',
  rotation INTEGER NOT NULL DEFAULT 0,
  corners TEXT,
  page_format TEXT NOT NULL DEFAULT 'auto',
  adjustments TEXT,
  proxy_uri TEXT,
  render_key TEXT,
  legacy_original_uri TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
`;

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pages_document_id ON pages(document_id);
CREATE INDEX IF NOT EXISTS idx_pages_page_number ON pages(document_id, page_number ASC);
`;

/**
 * page_text (schema v3): recognized text per page (Phase C, Apple Vision).
 * - ocr_key: ocrKey() of the page state the text belongs to (stale when it differs)
 * - text: plain text as printed; search_text: normalized for LIKE search
 * - lines: compact JSON with line / word boxes (searchable PDF layer)
 * Rows disappear with their page (ON DELETE CASCADE).
 */
export const CREATE_PAGE_TEXT_TABLE = `
CREATE TABLE IF NOT EXISTS page_text (
  page_id TEXT PRIMARY KEY NOT NULL,
  ocr_key TEXT NOT NULL,
  engine TEXT NOT NULL,
  languages TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  lines TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);
`;
