import {actualCostNanoUsd, BUILD_BUDGET_NANO_USD} from "./policy";
import type {BudgetReservation} from "./types";

export async function reserveBudget(db: D1Database, requestId: string, reserveNanoUsd: number): Promise<BudgetReservation> {
  if (!requestId || !Number.isSafeInteger(reserveNanoUsd) || reserveNanoUsd <= 0) throw new Error("Invalid budget reservation");
  const existing = await db.prepare("SELECT reserved_nano_usd, state FROM openai_reservations WHERE request_id = ?").bind(requestId).first<{reserved_nano_usd: number; state: string}>();
  if (existing) {
    if (existing.state !== "RESERVED") throw new Error("OpenAI request id was already settled");
    return {requestId, reservedNanoUsd: existing.reserved_nano_usd};
  }
  try {
    const results = await db.batch([
      db.prepare("INSERT INTO openai_reservations(request_id, reserved_nano_usd, state, created_at, updated_at) VALUES (?, ?, 'RESERVED', unixepoch(), unixepoch())").bind(requestId, reserveNanoUsd),
      db.prepare("UPDATE openai_budget SET reserved_nano_usd = reserved_nano_usd + ?, updated_at = unixepoch() WHERE id = 1").bind(reserveNanoUsd),
    ]);
    if (results.some(result => !result.success) || results[0].meta.changes !== 1 || results[1].meta.changes !== 1) throw new Error("OPENAI_BUILD_BUDGET_EXHAUSTED");
  } catch (error) {
    throw new Error(`OPENAI_BUILD_BUDGET_EXHAUSTED: ${error instanceof Error ? error.message : "reservation failed"}`);
  }
  return {requestId, reservedNanoUsd: reserveNanoUsd};
}

export async function markBudgetDispatched(db: D1Database, reservation: BudgetReservation): Promise<void> {
  const result = await db.prepare("UPDATE openai_reservations SET state = 'DISPATCHED', updated_at = unixepoch() WHERE request_id = ? AND state = 'RESERVED'").bind(reservation.requestId).run();
  if (result.meta.changes !== 1) throw new Error("OPENAI_REQUEST_ALREADY_DISPATCHED");
}

export async function markBudgetUncertain(db: D1Database, reservation: BudgetReservation, reason: string): Promise<void> {
  await db.prepare("UPDATE openai_reservations SET state = 'UNCERTAIN', error = ?, updated_at = unixepoch() WHERE request_id = ? AND state = 'DISPATCHED'").bind(reason.slice(0, 500), reservation.requestId).run();
}

export async function settleBudget(db: D1Database, reservation: BudgetReservation, inputTokens: number, outputTokens: number): Promise<number> {
  const actual = actualCostNanoUsd(inputTokens, outputTokens);
  if (actual > reservation.reservedNanoUsd) {
    // Preserve the full reserve on an anomalous usage response. Never overspend silently.
    throw new Error("OPENAI_USAGE_EXCEEDED_RESERVATION");
  }
  const results = await db.batch([
    db.prepare("UPDATE openai_reservations SET state = 'SETTLED', actual_nano_usd = ?, input_tokens = ?, output_tokens = ?, updated_at = unixepoch() WHERE request_id = ? AND state = 'DISPATCHED'").bind(actual, inputTokens, outputTokens, reservation.requestId),
    // changes() is from the preceding statement in this atomic D1 batch. A replay
    // therefore cannot debit the shared ledger a second time.
    db.prepare("UPDATE openai_budget SET reserved_nano_usd = reserved_nano_usd - ?, spent_nano_usd = spent_nano_usd + ?, updated_at = unixepoch() WHERE id = 1 AND changes() = 1").bind(reservation.reservedNanoUsd, actual),
  ]);
  if (results.some(result => !result.success) || results[0].meta.changes !== 1 || results[1].meta.changes !== 1) throw new Error("OpenAI reservation cannot be settled twice");
  return actual;
}

export async function budgetSnapshot(db: D1Database): Promise<{limitNanoUsd: number; spentNanoUsd: number; reservedNanoUsd: number; remainingNanoUsd: number}> {
  const row = await db.prepare("SELECT limit_nano_usd, spent_nano_usd, reserved_nano_usd FROM openai_budget WHERE id = 1").first<{limit_nano_usd: number; spent_nano_usd: number; reserved_nano_usd: number}>();
  if (!row || row.limit_nano_usd !== BUILD_BUDGET_NANO_USD) throw new Error("OpenAI budget ledger is not initialized to the approved limit");
  return {
    limitNanoUsd: row.limit_nano_usd,
    spentNanoUsd: row.spent_nano_usd,
    reservedNanoUsd: row.reserved_nano_usd,
    remainingNanoUsd: row.limit_nano_usd - row.spent_nano_usd - row.reserved_nano_usd,
  };
}
