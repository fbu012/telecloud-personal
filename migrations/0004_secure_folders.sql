ALTER TABLE folders ADD COLUMN is_secure INTEGER NOT NULL DEFAULT 0;
ALTER TABLE folders ADD COLUMN password_hash TEXT;
ALTER TABLE folders ADD COLUMN password_salt TEXT;
ALTER TABLE folders ADD COLUMN password_updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_folders_is_secure ON folders(is_secure);
