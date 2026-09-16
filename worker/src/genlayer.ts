import {createAccount, createClient} from "genlayer-js";
import {TransactionHashVariant, type Address, type TransactionHash} from "genlayer-js/types";
import type {AgentRole, Commitment, Env, RunParams, WorkerDeal} from "./types";
import {STUDIO_NEXT_CHAIN_ID,studioNext} from "./network";
import feeProfile from "../../fee-profile.json";

type Client = ReturnType<typeof createClient>;

function assertMeasuredProfile(action: "accept_work" | "submit_artifact", contract: string): void {
  if (feeProfile.network !== "studio-next" || feeProfile.chainId !== STUDIO_NEXT_CHAIN_ID || feeProfile.provenance.contract.toLowerCase() !== contract.toLowerCase()) throw new Error("Measured Studio Next fee profile does not match hosted worker deployment");
  if (!Object.hasOwn(feeProfile.methods, action)) throw new Error("Hosted worker action has no shared fee profile");
}

function estimateFromProfile(client: Client, action: "accept_work" | "submit_artifact") {
  const profile = feeProfile.methods[action];
  return client.estimateTransactionFees({
    leaderTimeunitsAllocation: BigInt(profile.leaderTimeunitsAllocation),
    validatorTimeunitsAllocation: BigInt(profile.validatorTimeunitsAllocation),
    executionBudgetPerRound: BigInt(profile.executionBudgetPerRound),
    totalMessageFees: BigInt(profile.totalMessageFees),
    appealRounds: 0n,
    rotations: [BigInt(profile.rotationsPerRound)],
  });
}

function asAddress(value: string, label: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid ${label} address`);
  return value as Address;
}

function statusName(receipt: unknown): string {
  const value = receipt as {statusName?: string; status_name?: string; status?: unknown};
  return value.statusName ?? value.status_name ?? (typeof value.status === "string" ? value.status : "UNKNOWN");
}

function executionName(receipt: unknown): string {
  const value = receipt as {txExecutionResultName?: string; tx_execution_result_name?: string; consensus_data?: {leader_receipt?: unknown}};
  const explicit = value.txExecutionResultName ?? value.tx_execution_result_name;
  if (explicit) return explicit;
  const raw = value.consensus_data?.leader_receipt;
  const entries = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<{mode?: string; execution_result?: string}>;
  const leaders = entries.filter(item => item.mode === "leader");
  if (leaders.length !== 1) return "UNKNOWN";
  return ["SUCCESS", "FINISHED_WITH_RETURN"].includes(leaders[0].execution_result ?? "") ? "FINISHED_WITH_RETURN"
    : ["ERROR", "FINISHED_WITH_ERROR"].includes(leaders[0].execution_result ?? "") ? "FINISHED_WITH_ERROR" : "UNKNOWN";
}

export function agentClients(env: Env): Record<AgentRole, {account: ReturnType<typeof createAccount>; client: Client}> {
  const A = createAccount(env.WORKER_A_PRIVATE_KEY), B = createAccount(env.WORKER_B_PRIVATE_KEY);
  if (A.address.toLowerCase() === B.address.toLowerCase()) throw new Error("Worker A and B must use distinct keys");
  const chain=studioNext(env.GENLAYER_RPC_URL);
  return {
    A: {account: A, client: createClient({chain, endpoint: env.GENLAYER_RPC_URL, account: A})},
    B: {account: B, client: createClient({chain, endpoint: env.GENLAYER_RPC_URL, account: B})},
  };
}

function validateDeal(value: unknown, params: RunParams): WorkerDeal {
  const deal = value as WorkerDeal;
  if (!deal || deal.deal_id !== params.dealId || deal.chain_id !== params.chainId || deal.contract.toLowerCase() !== params.contract.toLowerCase()) throw new Error("Finalized deal domain mismatch");
  if (deal.manifest.client.toLowerCase() !== params.client.toLowerCase() || !deal.manifest.terms?.workers || !deal.manifest.terms?.origins || !deal.manifest.terms.semantic_obligations?.length) throw new Error("Frozen deal manifest is incomplete");
  const ids = deal.manifest.terms.semantic_obligations.map(item => item.id);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error("Frozen semantic obligation IDs are invalid");
  if (!deal.artifacts.SOURCE?.submission_id || !deal.artifacts.SOURCE.commitment) throw new Error("Frozen SOURCE commitment is unavailable");
  return deal;
}

export async function readFinalDeal(env: Env, params: RunParams): Promise<WorkerDeal> {
  if (Number(env.VERISTEP_CHAIN_ID) !== params.chainId || env.VERISTEP_V2_CONTRACT.toLowerCase() !== params.contract.toLowerCase() || params.chainId !== STUDIO_NEXT_CHAIN_ID) throw new Error("Hosted deployment guard mismatch");
  const client = createClient({chain:studioNext(env.GENLAYER_RPC_URL), endpoint: env.GENLAYER_RPC_URL});
  const raw = await client.readContract({address: asAddress(params.contract, "contract"), functionName: "get_terms", args: [params.dealId], transactionHashVariant: TransactionHashVariant.LATEST_FINAL});
  if (typeof raw !== "string") throw new Error("Unexpected finalized contract response");
  return validateDeal(JSON.parse(raw), params);
}

export async function writeAgentAction(env: Env, params: RunParams, role: AgentRole, action: "accept_work" | "submit_artifact", args: unknown[], value: bigint): Promise<string> {
  assertMeasuredProfile(action, params.contract);
  const clients = agentClients(env);
  return journaledTransaction(env.DB, params.runId, `${role}:${action}`, async () => {
    const write={address:asAddress(params.contract,"contract"),functionName:action,args:args as never[],value};
    const estimate=await estimateFromProfile(clients[role].client, action);
    return clients[role].client.writeContract({
      ...write,
      fees:{distribution:estimate.distribution,...(estimate.messageAllocations?{messageAllocations:estimate.messageAllocations}:{}),feeValue:estimate.feeValue},
    }) as Promise<string>;
  });
}

export async function journaledTransaction(db: D1Database, runId: string, action: string, submit: () => Promise<string>): Promise<string> {
  const previous = await db.prepare("SELECT tx_hash, state FROM tx_journal WHERE run_id = ? AND action = ?").bind(runId, action).first<{tx_hash: string | null; state: string}>();
  if (previous?.tx_hash) return previous.tx_hash;
  if (previous) throw new Error("GENLAYER_SUBMISSION_UNCERTAIN: journal exists without a transaction hash; do not resend");
  const claimed = await db.prepare("INSERT INTO tx_journal(run_id, action, tx_hash, state, created_at, updated_at) VALUES (?, ?, NULL, 'SIGNING', unixepoch(), unixepoch()) ON CONFLICT(run_id, action) DO NOTHING").bind(runId, action).run();
  if (claimed.meta.changes !== 1) throw new Error("GENLAYER_ACTION_ALREADY_CLAIMED");
  let hash: string;
  try { hash = await submit(); }
  catch (error) {
    await db.prepare("UPDATE tx_journal SET state = 'UNKNOWN', updated_at = unixepoch() WHERE run_id = ? AND action = ? AND state = 'SIGNING'").bind(runId, action).run();
    throw error;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    await db.prepare("UPDATE tx_journal SET state = 'UNKNOWN', updated_at = unixepoch() WHERE run_id = ? AND action = ? AND state = 'SIGNING'").bind(runId, action).run();
    throw new Error("GenLayer submission returned no transaction hash");
  }
  const saved = await db.prepare("UPDATE tx_journal SET tx_hash = ?, state = 'PENDING', updated_at = unixepoch() WHERE run_id = ? AND action = ? AND state = 'SIGNING'").bind(hash, runId, action).run();
  if (saved.meta.changes !== 1) throw new Error("GENLAYER_HASH_JOURNAL_FAILED");
  return hash;
}

export async function inspectTransaction(env: Env, role: AgentRole, hash: string): Promise<"PENDING" | "SUCCESS"> {
  const receipt = await agentClients(env)[role].client.getTransaction({hash: hash as TransactionHash});
  const status = statusName(receipt);
  if (["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(status)) throw new Error(`GenLayer transaction terminal state: ${status}`);
  if (status !== "FINALIZED") return "PENDING";
  if (executionName(receipt) !== "FINISHED_WITH_RETURN") throw new Error(`GenLayer execution failed: ${executionName(receipt)}`);
  return "SUCCESS";
}

export async function markTransactionFinal(env: Env, params: RunParams, role: AgentRole, action: string): Promise<void> {
  await env.DB.prepare("UPDATE tx_journal SET state = 'FINALIZED_SUCCESS', updated_at = unixepoch() WHERE run_id = ? AND action = ?")
    .bind(params.runId, `${role}:${action}`).run();
}

export function submissionArgs(deal: WorkerDeal, role: AgentRole, commitment: Commitment): [string, string, string] {
  const upstream = role === "A" ? deal.artifacts.SOURCE : deal.artifacts.A;
  if (!upstream?.submission_id) throw new Error(`Finalized ${role === "A" ? "SOURCE" : "A"} handoff is unavailable`);
  return [deal.deal_id, JSON.stringify(commitment), upstream.submission_id];
}

export function assertHostedWorkers(env: Env, deal: WorkerDeal): void {
  const clients = agentClients(env);
  for (const role of ["A", "B"] as const) if (clients[role].account.address.toLowerCase() !== deal.manifest.terms.workers[role].toLowerCase()) throw new Error(`Hosted ${role} key does not match frozen terms`);
}
