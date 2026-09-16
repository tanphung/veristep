-- Raise the user-approved cap while preserving every existing charge and
-- conservative reservation from the original 0.80 USD ledger.
ALTER TABLE openai_budget RENAME TO openai_budget_080;

CREATE TABLE openai_budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  limit_nano_usd INTEGER NOT NULL CHECK (limit_nano_usd = 1200000000),
  spent_nano_usd INTEGER NOT NULL DEFAULT 0 CHECK (spent_nano_usd >= 0),
  reserved_nano_usd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_nano_usd >= 0),
  updated_at INTEGER NOT NULL,
  CHECK (spent_nano_usd + reserved_nano_usd <= limit_nano_usd)
);

INSERT INTO openai_budget(id, limit_nano_usd, spent_nano_usd, reserved_nano_usd, updated_at)
SELECT id, 1200000000, spent_nano_usd, reserved_nano_usd, unixepoch()
FROM openai_budget_080;

DROP TABLE openai_budget_080;
