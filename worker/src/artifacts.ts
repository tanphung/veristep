import {generateArtifact} from "./openai";
import {requiredAgentArtifact, validateAgentArtifact} from "./policy";
import type {AgentRole, Env, PublishedArtifact, WorkerDeal} from "./types";

interface ArtifactRow {
  request_id: string;
  content: string;
  cost_nano_usd: number;
  state: "GENERATED" | "PUBLISHED";
  commitment_json: string | null;
}

export function recoveryRequestId(base: string, states: Array<{state: string; error?: string | null} | null>): string {
  const [initial, recoveryOne, recoveryTwo] = states;
  if (initial === null) return base;
  if (initial.state !== "SETTLED") throw new Error(`OpenAI request ${base} is ${initial.state}; automatic regeneration is unsafe`);
  if (recoveryOne === null) return `${base}:recovery-1`;
  if (recoveryOne.state !== "SETTLED") throw new Error(`OpenAI request ${base}:recovery-1 is ${recoveryOne.state}; automatic regeneration is unsafe`);
  if (recoveryTwo === null) return `${base}:recovery-2`;
  if (recoveryTwo.state === "UNCERTAIN" && /HTTP 400: Invalid schema for response_format/.test(recoveryTwo.error ?? "")) return `${base}:recovery-3`;
  throw new Error(`OpenAI request ${base}:recovery-2 is ${recoveryTwo.state}; automatic regeneration is unsafe`);
}

export async function generatePersistedArtifact(env: Env, runId: string, deal: WorkerDeal, role: AgentRole, prompt: string): Promise<string> {
  const existing = await env.DB.prepare("SELECT request_id, content, cost_nano_usd, state, commitment_json FROM agent_artifacts WHERE run_id = ? AND role = ?")
    .bind(runId, role).first<ArtifactRow>();
  if (existing) return validateAgentArtifact(deal, role, existing.content);

  const base = `${runId}:${role}`;
  const reservation = await env.DB.prepare("SELECT state, error FROM openai_reservations WHERE request_id = ?")
    .bind(base).first<{state: string; error: string | null}>();
  const recoveryOne = await env.DB.prepare("SELECT state, error FROM openai_reservations WHERE request_id = ?")
    .bind(`${base}:recovery-1`).first<{state: string; error: string | null}>();
  const recoveryTwo = await env.DB.prepare("SELECT state, error FROM openai_reservations WHERE request_id = ?")
    .bind(`${base}:recovery-2`).first<{state: string; error: string | null}>();
  const requestId = recoveryRequestId(base, [reservation ?? null, recoveryOne ?? null, recoveryTwo ?? null]);
  const generated = await generateArtifact(env, requestId, prompt, requiredAgentArtifact(deal, role));
  const artifact = validateAgentArtifact(deal, role, generated.artifact);
  const inserted = await env.DB.prepare(
    "INSERT INTO agent_artifacts(run_id, role, request_id, content, cost_nano_usd, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'GENERATED', unixepoch(), unixepoch()) ON CONFLICT(run_id, role) DO NOTHING",
  ).bind(runId, role, requestId, artifact, generated.costNanoUsd).run();
  if (inserted.meta.changes !== 1) {
    const raced = await env.DB.prepare("SELECT content FROM agent_artifacts WHERE run_id = ? AND role = ?").bind(runId, role).first<{content: string}>();
    if (!raced) throw new Error(`${role} artifact persistence failed`);
    return validateAgentArtifact(deal, role, raced.content);
  }
  return artifact;
}

export async function markArtifactPublished(env: Env, runId: string, role: AgentRole, published: PublishedArtifact): Promise<void> {
  const result = await env.DB.prepare("UPDATE agent_artifacts SET state = 'PUBLISHED', commitment_json = ?, updated_at = unixepoch() WHERE run_id = ? AND role = ? AND content = ?")
    .bind(JSON.stringify(published.commitment), runId, role, published.content).run();
  if (result.meta.changes !== 1) throw new Error(`${role} published artifact checkpoint failed`);
}
