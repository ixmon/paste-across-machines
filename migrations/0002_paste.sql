-- Ephemeral paste rooms (notes + files). App enforces 24h TTL in code.

CREATE TABLE IF NOT EXISTS paste_sessions (
  public_id TEXT PRIMARY KEY,
  word1 TEXT NOT NULL,
  word2 TEXT NOT NULL,
  word3 TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  last_accessed_at BIGINT NOT NULL,
  note_content TEXT NOT NULL DEFAULT '',
  note_bytes INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS paste_sessions_expires_at_idx ON paste_sessions (expires_at);
CREATE INDEX IF NOT EXISTS paste_sessions_last_accessed_at_idx ON paste_sessions (last_accessed_at);

CREATE TABLE IF NOT EXISTS paste_files (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL REFERENCES paste_sessions (public_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INT NOT NULL,
  uploaded_at BIGINT NOT NULL,
  data BYTEA NOT NULL
);

CREATE INDEX IF NOT EXISTS paste_files_public_id_idx ON paste_files (public_id);
