-- Carry the already-observed build/test usage into the hosted ledger so the
-- approved 0.80 USD cap is global, not reset when the Worker is deployed.
INSERT OR IGNORE INTO openai_reservations(
  request_id, reserved_nano_usd, actual_nano_usd, input_tokens, output_tokens,
  error, state, created_at, updated_at
) VALUES
  ('build-smoke-a-v1', 1374200, NULL, NULL, NULL, 'HTTP_401 retained conservatively', 'UNCERTAIN', unixepoch(), unixepoch()),
  ('build-smoke-a-v2', 1374200, 86400, 132, 50, NULL, 'SETTLED', unixepoch(), unixepoch()),
  ('build-smoke-b-v2', 1369000, 85800, 129, 50, NULL, 'SETTLED', unixepoch(), unixepoch());

UPDATE openai_budget
SET spent_nano_usd = 172200,
    reserved_nano_usd = 1374200,
    updated_at = unixepoch()
WHERE id = 1 AND spent_nano_usd = 0 AND reserved_nano_usd = 0;
