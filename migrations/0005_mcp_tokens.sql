-- Opt-in MCP access tokens, scoped to a room. Hash only; plaintext shown once.

CREATE TABLE IF NOT EXISTS paste_mcp_tokens (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL REFERENCES paste_sessions (public_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'Grok',
  created_at BIGINT NOT NULL,
  last_used_at BIGINT,
  revoked_at BIGINT
);

CREATE INDEX IF NOT EXISTS paste_mcp_tokens_public_id_idx ON paste_mcp_tokens (public_id);
CREATE INDEX IF NOT EXISTS paste_mcp_tokens_hash_idx ON paste_mcp_tokens (token_hash);
