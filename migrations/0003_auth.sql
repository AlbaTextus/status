CREATE TABLE auth_flows (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_flows_expiry ON auth_flows (expires_at);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions (expires_at);
