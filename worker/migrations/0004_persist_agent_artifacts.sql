CREATE TABLE IF NOT EXISTS agent_artifacts (
  run_id TEXT NOT NULL REFERENCES worker_runs(run_id),
  role TEXT NOT NULL CHECK (role IN ('A', 'B')),
  request_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL CHECK (length(content) > 0),
  cost_nano_usd INTEGER NOT NULL CHECK (cost_nano_usd >= 0),
  state TEXT NOT NULL CHECK (state IN ('GENERATED', 'PUBLISHED')),
  commitment_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(run_id, role)
);
