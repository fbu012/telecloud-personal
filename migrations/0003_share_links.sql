CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL CHECK (target_type IN ('file', 'folder')),
  target_id TEXT NOT NULL,
  allow_download INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_target ON share_links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_share_links_revoked_at ON share_links(revoked_at);
