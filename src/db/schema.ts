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

export const CREATE_PAGES_TABLE = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  original_uri TEXT NOT NULL,
  preview_uri TEXT NOT NULL,
  filter TEXT NOT NULL DEFAULT 'original',
  rotation INTEGER NOT NULL DEFAULT 0,
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
