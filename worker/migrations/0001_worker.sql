PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS openai_budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  limit_nano_usd INTEGER NOT NULL CHECK (limit_nano_usd = 1200000000),
  spent_nano_usd INTEGER NOT NULL DEFAULT 0 CHECK (spent_nano_usd >= 0),
  reserved_nano_usd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_nano_usd >= 0),
  updated_at INTEGER NOT NULL,
  CHECK (spent_nano_usd + reserved_nano_usd <= limit_nano_usd)
);
INSERT OR IGNORE INTO openai_budget(id, limit_nano_usd, spent_nano_usd, reserved_nano_usd, updated_at)
VALUES (1, 1200000000, 0, 0, unixepoch());

CREATE TABLE IF NOT EXISTS openai_reservations (
  request_id TEXT PRIMARY KEY,
  reserved_nano_usd INTEGER NOT NULL CHECK (reserved_nano_usd > 0),
  actual_nano_usd INTEGER CHECK (actual_nano_usd >= 0 AND actual_nano_usd <= reserved_nano_usd),
  input_tokens INTEGER CHECK (input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens >= 0),
  error TEXT,
  state TEXT NOT NULL CHECK (state IN ('RESERVED', 'DISPATCHED', 'UNCERTAIN', 'SETTLED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  address TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  PRIMARY KEY(address, nonce)
);
CREATE INDEX IF NOT EXISTS auth_nonces_expiry ON auth_nonces(expires_at);

CREATE TABLE IF NOT EXISTS worker_runs (
  run_id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  terms_hash TEXT NOT NULL CHECK (length(terms_hash) = 64),
  state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'COMPLETE', 'ERROR', 'CANCELLED')),
  stage TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(chain_id, contract, deal_id)
);
CREATE INDEX IF NOT EXISTS worker_runs_active_client ON worker_runs(client, state);
CREATE INDEX IF NOT EXISTS worker_runs_created ON worker_runs(created_at);

CREATE TABLE IF NOT EXISTS tx_journal (
  run_id TEXT NOT NULL REFERENCES worker_runs(run_id),
  action TEXT NOT NULL,
  tx_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('SIGNING', 'UNKNOWN', 'PENDING', 'FINALIZED_SUCCESS')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(run_id, action),
  UNIQUE(tx_hash)
);
