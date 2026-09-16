import {verifyMessage, type Hex} from "viem";
import {budgetSnapshot} from "./budget";
import {agentClients, assertHostedWorkers, readFinalDeal} from "./genlayer";
import {checkEvidenceRepositoryAccess} from "./github";
import {canonicalAuthMessage, MAX_ACTIVE_RUNS, MAX_DAILY_RUNS} from "./policy";
import type {Env, RunParams} from "./types";
export {VeriStepWorkflow} from "./workflow";

interface AuthBody {
  address: string;
  nonce: string;
  expiresAt: number;
  signature: string;
  chainId: number;
  contract: string;
  dealId: string;
  termsHash: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DEAL = /^[a-z0-9][a-z0-9-]{0,63}$/;

function headers(env: Env, request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(origin && origin === env.ALLOWED_ORIGIN ? {"access-control-allow-origin": origin, vary: "Origin"} : {}),
  };
}

function json(env: Env, request: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {status, headers: headers(env, request)});
}

async function bodyJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4_096) throw new Error("Request body too large");
  return request.json();
}

function parseAuth(value: unknown): AuthBody {
  const body = value as AuthBody;
  const keys = ["address", "nonce", "expiresAt", "signature", "chainId", "contract", "dealId", "termsHash"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join() !== keys.sort().join()) throw new Error("Invalid authorization schema");
  if (!ADDRESS.test(body.address) || !ADDRESS.test(body.contract) || !/^0x[0-9a-fA-F]{130}$/.test(body.signature) || !/^[0-9a-f]{32}$/.test(body.nonce) || !DEAL.test(body.dealId) || !/^[0-9a-f]{64}$/.test(body.termsHash) || !Number.isSafeInteger(body.chainId) || !Number.isSafeInteger(body.expiresAt)) throw new Error("Invalid authorization values");
  return body;
}

async function consumeAuthorization(env: Env, body: AuthBody): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (body.expiresAt <= now || body.expiresAt > now + 600) throw new Error("Authorization expired or too far in the future");
  const valid = await verifyMessage({address: body.address as `0x${string}`, message: canonicalAuthMessage(body), signature: body.signature as Hex});
  if (!valid) throw new Error("Wallet signature does not match authorization");
  const consumed = await env.DB.prepare("UPDATE auth_nonces SET used_at = unixepoch() WHERE address = ? AND nonce = ? AND expires_at = ? AND used_at IS NULL AND expires_at >= unixepoch()")
    .bind(body.address.toLowerCase(), body.nonce, body.expiresAt).run();
  if (consumed.meta.changes !== 1) throw new Error("Authorization nonce is missing, expired, or already used");
}

async function startRun(env: Env, request: Request): Promise<Response> {
  const body = parseAuth(await bodyJson(request));
  await consumeAuthorization(env, body);
  const params: RunParams = {runId: crypto.randomUUID().replace(/-/g, ""), client: body.address.toLowerCase(), chainId: body.chainId, contract: env.VERISTEP_V2_CONTRACT, dealId: body.dealId};
  const deal = await readFinalDeal(env, params);
  if (deal.terms_hash !== body.termsHash) throw new Error("Authorization terms hash differs from finalized terms");
  assertHostedWorkers(env, deal);
  if (!new Set(["FUNDED", "ACTIVE_A", "ACTIVE_B"]).has(deal.status)) throw new Error(`Deal is not eligible for hosted delivery: ${deal.status}`);
  const existing = await env.DB.prepare("SELECT run_id, state, stage, detail FROM worker_runs WHERE chain_id = ? AND contract = ? AND deal_id = ?")
    .bind(params.chainId, params.contract, params.dealId).first();
  if (existing) return json(env, request, {run: existing, idempotent: true});
  const inserted = await env.DB.prepare(
    "INSERT INTO worker_runs(run_id, client, chain_id, contract, deal_id, terms_hash, state, stage, detail, created_at, updated_at) " +
    "SELECT ?, ?, ?, ?, ?, ?, 'ACTIVE', 'QUEUED', '', unixepoch(), unixepoch() " +
    "WHERE (SELECT count(*) FROM worker_runs WHERE state = 'ACTIVE') < ? " +
    "AND (SELECT count(*) FROM worker_runs WHERE state = 'ACTIVE' AND client = ?) = 0 " +
    "AND (SELECT count(*) FROM worker_runs WHERE created_at >= unixepoch('now','start of day')) < ?",
  ).bind(params.runId, params.client, params.chainId, params.contract, params.dealId, body.termsHash, MAX_ACTIVE_RUNS, params.client, MAX_DAILY_RUNS).run();
  if (inserted.meta.changes !== 1) throw new Error("Hosted worker quota is currently full");
  try {
    await env.VERISTEP_RUNNER.create({id: params.runId, params, retention: {successRetention: "3 days", errorRetention: "3 days"}, locationHint: "apac-se"});
  } catch (error) {
    await env.DB.prepare("UPDATE worker_runs SET state = 'ERROR', detail = ?, updated_at = unixepoch() WHERE run_id = ?")
      .bind(`Workflow dispatch failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown"}`, params.runId).run();
    throw error;
  }
  return json(env, request, {runId: params.runId, state: "ACTIVE", stage: "QUEUED"}, 202);
}

async function manageRun(env: Env, request: Request, runId: string, command: "resume" | "cancel"): Promise<Response> {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(runId)) throw new Error("Invalid run id");
  const body = parseAuth(await bodyJson(request));
  await consumeAuthorization(env, body);
  const run = await env.DB.prepare("SELECT run_id, client, chain_id, contract, deal_id, terms_hash, state FROM worker_runs WHERE run_id = ?").bind(runId).first<{run_id: string; client: string; chain_id: number; contract: string; deal_id: string; terms_hash: string; state: string}>();
  if (!run || run.client !== body.address.toLowerCase() || run.chain_id !== body.chainId || run.contract.toLowerCase() !== body.contract.toLowerCase() || run.deal_id !== body.dealId || run.terms_hash !== body.termsHash) throw new Error("Run authorization domain mismatch");
  const instance = await env.VERISTEP_RUNNER.get(runId);
  if (command === "resume") {
    if (run.state !== "ERROR") throw new Error("Only an errored run can be resumed");
    await instance.restart();
    await env.DB.prepare("UPDATE worker_runs SET state = 'ACTIVE', stage = 'RESUMING', detail = '', updated_at = unixepoch() WHERE run_id = ?").bind(runId).run();
  } else {
    if (run.state !== "ACTIVE" && run.state !== "ERROR") throw new Error("Run is not cancellable");
    await instance.terminate();
    await env.DB.prepare("UPDATE worker_runs SET state = 'CANCELLED', stage = 'CANCELLED', detail = 'Hosted workflow cancelled; finalized chain writes are unchanged.', updated_at = unixepoch() WHERE run_id = ?").bind(runId).run();
  }
  return json(env, request, {runId, command, accepted: true}, 202);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: {...headers(env, request), "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type"}});
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        const workers = agentClients(env);
        const repositoryAccess = env.GITHUB_EVIDENCE_TOKEN ? await checkEvidenceRepositoryAccess(env) : false;
        const publishedEvidence = await env.DB.prepare("SELECT 1 AS proven FROM agent_artifacts WHERE state = 'PUBLISHED' LIMIT 1").first<{proven: number}>();
        const dependencies = {
          openai: Boolean(env.OPENAI_API_KEY),
          workerWallets: Boolean(env.WORKER_A_PRIVATE_KEY && env.WORKER_B_PRIVATE_KEY),
          githubEvidence: Boolean(env.GITHUB_EVIDENCE_TOKEN),
          githubEvidenceAccess: repositoryAccess,
        };
        return json(env, request, {
          ok: true,
          ready: Object.values(dependencies).every(Boolean),
          dependencies,
          evidence: {githubContentsWriteProven: publishedEvidence?.proven === 1},
          network: {
            chainId: Number(env.VERISTEP_CHAIN_ID),
            rpc: env.GENLAYER_RPC_URL,
            contract: env.VERISTEP_V2_CONTRACT,
            workers: {A: workers.A.account.address, B: workers.B.account.address},
          },
          budget: await budgetSnapshot(env.DB),
          model: env.OPENAI_WORKER_MODEL,
        });
      }
      if (request.method === "GET" && url.pathname === "/api/worker-nonce") {
        const address = (url.searchParams.get("address") ?? "").toLowerCase();
        if (!ADDRESS.test(address)) throw new Error("Invalid wallet address");
        const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
        const expiresAt = Math.floor(Date.now() / 1000) + 300;
        await env.DB.prepare("INSERT INTO auth_nonces(address, nonce, expires_at, created_at) VALUES (?, ?, ?, unixepoch())").bind(address, nonce, expiresAt).run();
        return json(env, request, {nonce, expiresAt});
      }
      if (request.method === "POST" && url.pathname === "/api/worker-runs") return await startRun(env, request);
      const match = url.pathname.match(/^\/api\/worker-runs\/([a-zA-Z0-9-]{1,64})(?:\/(resume|cancel))?$/);
      if (match && request.method === "GET" && !match[2]) {
        const run = await env.DB.prepare("SELECT run_id, client, chain_id, contract, deal_id, terms_hash, state, stage, detail, created_at, updated_at FROM worker_runs WHERE run_id = ?").bind(match[1]).first();
        if (!run) return json(env, request, {error: "Run not found"}, 404);
        const workflow = await (await env.VERISTEP_RUNNER.get(match[1])).status();
        return json(env, request, {run, workflow});
      }
      if (match && request.method === "POST" && (match[2] === "resume" || match[2] === "cancel")) return await manageRun(env, request, match[1], match[2]);
      return json(env, request, {error: "Not found"}, 404);
    } catch (error) {
      return json(env, request, {error: error instanceof Error ? error.message : "Request failed"}, 400);
    }
  },
};
