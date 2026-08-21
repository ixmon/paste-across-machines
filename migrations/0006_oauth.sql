-- Short-lived OAuth authorization codes for Grok MCP PKCE pairing.

CREATE TABLE IF NOT EXISTS paste_oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  label TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT
);

CREATE INDEX IF NOT EXISTS paste_oauth_codes_expires_at_idx ON paste_oauth_codes (expires_at);
