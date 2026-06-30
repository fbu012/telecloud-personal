CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

ALTER TABLE files ADD COLUMN preview_telegram_chat_id TEXT;
ALTER TABLE files ADD COLUMN preview_telegram_message_id INTEGER;
ALTER TABLE files ADD COLUMN preview_telegram_file_id TEXT;
ALTER TABLE files ADD COLUMN preview_telegram_file_unique_id TEXT;
ALTER TABLE files ADD COLUMN preview_mime_type TEXT;
ALTER TABLE files ADD COLUMN preview_size_bytes INTEGER;

ALTER TABLE files ADD COLUMN thumbnail_telegram_chat_id TEXT;
ALTER TABLE files ADD COLUMN thumbnail_telegram_message_id INTEGER;
ALTER TABLE files ADD COLUMN thumbnail_telegram_file_id TEXT;
ALTER TABLE files ADD COLUMN thumbnail_telegram_file_unique_id TEXT;
ALTER TABLE files ADD COLUMN thumbnail_mime_type TEXT;
ALTER TABLE files ADD COLUMN thumbnail_size_bytes INTEGER;

CREATE INDEX IF NOT EXISTS idx_files_preview_file_id ON files(preview_telegram_file_id);
CREATE INDEX IF NOT EXISTS idx_files_thumbnail_file_id ON files(thumbnail_telegram_file_id);
