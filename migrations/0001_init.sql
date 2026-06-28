CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  telegram_chat_id TEXT NOT NULL,
  telegram_message_id INTEGER NOT NULL,
  telegram_file_id TEXT,
  telegram_file_unique_id TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'telegram_bot_api',
  upload_mode TEXT NOT NULL DEFAULT 'document',
  status TEXT NOT NULL DEFAULT 'uploaded',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_mime_type ON files(mime_type);
CREATE INDEX IF NOT EXISTS idx_files_favorite ON files(is_favorite);
CREATE INDEX IF NOT EXISTS idx_files_checksum ON files(checksum_sha256);

CREATE TABLE IF NOT EXISTS app_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON app_events(created_at DESC);
