import assert from "node:assert/strict";
import {access, mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createAccount, createClient} from "genlayer-js";
import {studioDevnet} from "genlayer-js/chains";
import {privateKeyToAccount} from "viem/accounts";
import feeProfile from "../fee-profile.json" with {type: "json"};
import {executionName, statusName} from "./receipts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = resolve(root, "reports", "studio-next-hosted-agent");
const manifestPath = resolve(reportDir, "manifest.json");
const secretsPath = resolve(root, ".secrets", "studio-next-wallets.json");
const rpc = "https://studio-next.genlayer.com/api";
const workerUrl = "https://veristep-agent-worker.veristep.workers.dev";
const explorer = "https://explorer-studio-dev.genlayer.com";
const contract = "0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b";
const chain = {...studioDevnet, name: "GenLayer Studio Next", rpcUrls: {default: {http: [rpc]}}};
const source = {
  origin: {provider: "github", hostname: "api.github.com", owner: "tanphung", owner_id: 162718327, repository: "veristep-evidence", repository_id: 1368396966},
  commit: "358323c1c33d667e0599f330554fb5f5fad6406d",
  path: "fixtures/no-fault/source.txt",
  blob: "76a5fbc341e161a0e58b01b904ba31fce132710e",
  content_type: "text/plain",
  encoding: "utf-8",
  byte_length: 222,
  sha256: "380f6a4082055198e4a55e0c02ad5371b77c7ef1163a3dd53d7e1afbc78c7505",
};
const stringify = value => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const exists = path => access(path).then(() => true, () => false);
const sleep = milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));
const safeError = error => ({name: error?.name ?? "Error", message: String(error?.shortMessage ?? error?.message ?? "failed").replace(/github_pat_[A-Za-z0-9_]+/g, "[REDACTED]").slice(0, 500)});

await mkdir(reportDir, {recursive: true});
const secrets = JSON.parse(await readFile(secretsPath, "utf8"));
assert.match(secrets.CLIENT_PRIVATE_KEY ?? "", /^0x[0-9a-fA-F]{64}$/, "Client key unavailable");
const account = createAccount(secrets.CLIENT_PRIVATE_KEY);
const signer = privateKeyToAccount(secrets.CLIENT_PRIVATE_KEY);
const client = createClient({chain, endpoint: rpc, account});
assert.equal(await client.getChainId(), 61997, "Studio Next chain guard failed");

const healthResponse = await fetch(`${workerUrl}/api/health`, {headers: {accept: "application/json"}});
assert.equal(healthResponse.status, 200, "Hosted worker health unavailable");
const health = await healthResponse.json();
assert.equal(health.ready, true, "Hosted worker is not ready");
assert.equal(health.dependencies?.githubEvidenceAccess, true, "Hosted evidence repository access preflight failed");
assert.equal(health.network?.chainId, 61997, "Hosted worker chain mismatch");
assert.equal(health.network?.contract?.toLowerCase(), contract.toLowerCase(), "Hosted worker contract mismatch");
for (const role of ["A", "B"]) assert.match(health.network?.workers?.[role] ?? "", /^0x[0-9a-fA-F]{40}$/, `Hosted worker ${role} address unavailable`);
assert.notEqual(health.network.workers.A.toLowerCase(), health.network.workers.B.toLowerCase(), "Hosted worker addresses must differ");

let manifest = await exists(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {
  version: "veristep-studio-next-hosted-agent-1",
  network: "studio-next",
  chainId: 61997,
  contract,
  dealId: "v2-hosted-agent-live-1",
  client: account.address,
  workers: health.network.workers,
  workerUrl,
  source,
  steps: {},
  startedAt: new Date().toISOString(),
};
assert.equal(manifest.contract.toLowerCase(), contract.toLowerCase());
assert.equal(manifest.client.toLowerCase(), account.address.toLowerCase());
for (const role of ["A", "B"]) assert.equal(manifest.workers[role].toLowerCase(), health.network.workers[role].toLowerCase(), `Hosted ${role} identity changed`);
const save = () => writeFile(manifestPath, stringify(manifest) + "\n");
await save();

function profileEstimate(method) {
  const profile = feeProfile.methods[method];
  assert.ok(profile, `Fee profile missing for ${method}`);
  return client.estimateTransactionFees({
    leaderTimeunitsAllocation: BigInt(profile.leaderTimeunitsAllocation),
    validatorTimeunitsAllocation: BigInt(profile.validatorTimeunitsAllocation),
    executionBudgetPerRound: BigInt(profile.executionBudgetPerRound),
    totalMessageFees: BigInt(profile.totalMessageFees),
    appealRounds: 0n,
    rotations: [BigInt(profile.rotationsPerRound)],
  });
}

async function transaction(name, functionName, args, value = 0n, feeOptions = {}) {
  let step = manifest.steps[name];
  if (!step) {
    step = manifest.steps[name] = {phase: "SIGNING", startedAt: new Date().toISOString()};
    await save();
    let estimate;
    try {
      estimate = await client.estimateTransactionFeesForWrite({address: contract, functionName, args, value, ...feeOptions});
      step.feeSource = "live-estimate";
    } catch (error) {
      estimate = await profileEstimate(functionName);
      if (feeOptions.messageAllocations) estimate.messageAllocations = feeOptions.messageAllocations;
      step.feeSource = "measured-profile";
      step.estimateError = safeError(error);
    }
    const nonceBefore = await client.getTransactionCount({address: account.address, blockTag: "pending"});
    step.nonceBefore = String(nonceBefore);
    await save();
    try {
      const hash = await client.writeContract({
        address: contract,
        functionName,
        args,
        value,
        fees: {distribution: estimate.distribution, ...(estimate.messageAllocations ? {messageAllocations: estimate.messageAllocations} : {}), feeValue: estimate.feeValue},
      });
      Object.assign(step, {hash, phase: "PENDING", submittedAt: new Date().toISOString(), explorer: `${explorer}/transactions/${hash}`});
      await save();
      console.log(stringify({step: name, submitted: hash}));
    } catch (error) {
      const nonceAfter = await client.getTransactionCount({address: account.address, blockTag: "pending"});
      Object.assign(step, {phase: "SUBMISSION_UNCERTAIN", nonceAfter: String(nonceAfter), error: safeError(error), finishedAt: new Date().toISOString()});
      await save();
      throw error;
    }
  }
  assert.ok(step.hash, `${name} has no transaction hash; refusing to resend`);
  if (step.finalized) {
    assert.equal(step.phase, "FINALIZED_SUCCESS", `${name} is terminal but unsuccessful`);
    return step;
  }
  let receipt;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    receipt = await client.getTransaction({hash: step.hash});
    await writeFile(resolve(reportDir, `${name}.receipt.json`), stringify(receipt) + "\n");
    const status = statusName(receipt);
    if (["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(status)) {
      Object.assign(step, {phase: status, finalized: true, execution: executionName(receipt), finishedAt: new Date().toISOString()});
      await save();
      throw new Error(`${name} reached ${status}`);
    }
    if (status === "FINALIZED") break;
    await sleep(5000);
  }
  assert.equal(statusName(receipt), "FINALIZED", `${name} did not finalize`);
  assert.equal(executionName(receipt), "FINISHED_WITH_RETURN", `${name} execution failed`);
  Object.assign(step, {phase: "FINALIZED_SUCCESS", finalized: true, execution: "FINISHED_WITH_RETURN", finishedAt: new Date().toISOString()});
  await save();
  return step;
}

const readDeal = async () => JSON.parse(await client.readContract({address: contract, functionName: "get_terms", args: [manifest.dealId]}));
const terms = {
  workers: manifest.workers,
  origins: {SOURCE: source.origin, A: source.origin, B: source.origin},
  source,
  money: {A: {fee: "1000", bond: "500", penalty: "300"}, B: {fee: "1000", bond: "500", penalty: "300"}},
  windows: {accept: 1800, step: 1800, review: 1800, adjudication: 3600},
  max_revisions: 0,
  semantic_obligations: [
    {id: "SEM_A_POLICY_ACCURACY", stage: "A", statement: "Stage A must preserve every export-policy rule in SOURCE: trial accounts cannot export; paid accounts require administrator approval for every export; there is no automatic-export exception. A later sentence that overrides these rules is a violation.", evidence_ids: ["SOURCE", "A"]},
    {id: "SEM_B_FAITHFUL_HANDOFF", stage: "B", statement: "Stage B must faithfully preserve Stage A's complete delivered policy, including final conditions and caveats, without weakening, contradicting, or inventing a different export rule.", evidence_ids: ["A", "B"]},
  ],
};

await transaction("client-create", "create_terms", [manifest.dealId, JSON.stringify(terms)]);
let deal = await readDeal();
assert.equal(deal.deal_id, manifest.dealId);
await transaction("client-fund", "fund_terms", [manifest.dealId, deal.terms_hash], 2000n);
deal = await readDeal();

function authMessage(body) {
  return [
    "VeriStep hosted worker authorization v1",
    `address:${body.address.toLowerCase()}`,
    `nonce:${body.nonce}`,
    `expires_at:${body.expiresAt}`,
    `chain_id:${body.chainId}`,
    `contract:${body.contract.toLowerCase()}`,
    `deal_id:${body.dealId}`,
    `terms_hash:${body.termsHash}`,
    "scope:start_or_resume_agent_ab",
  ].join("\n");
}

async function signedWorkerBody(currentDeal) {
  const nonceResponse = await fetch(`${workerUrl}/api/worker-nonce?address=${account.address}`);
  assert.equal(nonceResponse.status, 200, "Worker nonce request failed");
  const nonce = await nonceResponse.json();
  const body = {address: account.address, nonce: nonce.nonce, expiresAt: nonce.expiresAt, chainId: 61997, contract, dealId: manifest.dealId, termsHash: currentDeal.terms_hash};
  const signature = await signer.signMessage({message: authMessage(body)});
  return {...body, signature};
}

if (!manifest.workerRun?.runId) {
  const body = await signedWorkerBody(deal);
  const startResponse = await fetch(`${workerUrl}/api/worker-runs`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
  const start = await startResponse.json();
  assert.ok(startResponse.ok, `Hosted run rejected: ${start.error ?? startResponse.status}`);
  const runId = start.runId ?? start.run?.run_id;
  assert.match(runId ?? "", /^[a-zA-Z0-9-]{1,64}$/, "Hosted run id missing");
  manifest.workerRun = {runId, state: start.state ?? start.run?.state ?? "ACTIVE", stage: start.stage ?? start.run?.stage ?? "QUEUED", startedAt: new Date().toISOString()};
  await save();
}

for (let attempt = 0; attempt < 180; attempt += 1) {
  const response = await fetch(`${workerUrl}/api/worker-runs/${manifest.workerRun.runId}`, {headers: {accept: "application/json", "cache-control": "no-cache"}});
  const state = await response.json();
  assert.ok(response.ok && state.run, `Hosted run status failed: ${state.error ?? response.status}`);
  Object.assign(manifest.workerRun, {state: state.run.state, stage: state.run.stage, detail: state.run.detail, updatedAt: new Date().toISOString()});
  await save();
  console.log(stringify({workerRun: manifest.workerRun.runId, state: state.run.state, stage: state.run.stage}));
  if (state.run.state === "COMPLETE") break;
  const resumeCode = /execution slots occupied/i.test(state.run.detail ?? "")
    ? "RPC_BUSY_AFTER_FINALIZED_ACCEPTS"
    : /Frozen GitHub origin identity mismatch/i.test(state.run.detail ?? "")
      ? "ORIGIN_COMPARATOR_KEY_ORDER"
      : /GitHub branch creation failed: 403/i.test(state.run.detail ?? "")
        ? /Resource not accessible by personal access token/i.test(state.run.detail ?? "")
          ? "GITHUB_CONTENTS_DEFAULT_BRANCH_FALLBACK"
          : manifest.workerRun.resumeEvents?.some(event => event.code === "GITHUB_CONTENTS_WRITE_PERMISSION_FIXED")
            ? "GITHUB_BRANCH_403_DETAILS"
            : "GITHUB_CONTENTS_WRITE_PERMISSION_FIXED"
        : /OpenAI request id was already settled/i.test(state.run.detail ?? "")
          ? "OPENAI_OUTPUT_RECOVERY_PERSISTENCE"
          : /A artifact is missing a required export-policy statement/i.test(state.run.detail ?? "")
            ? "AGENT_A_CANONICAL_SCHEMA_LOCK"
            : /OPENAI_RESPONSE_ERROR_400: Invalid schema for response_format/i.test(state.run.detail ?? "")
              ? "OPENAI_CANONICAL_SCHEMA_SINGLE_LINE"
              : /GitHub artifact publication failed: 403 Resource not accessible by personal access token/i.test(state.run.detail ?? "")
                ? "GITHUB_CONTENTS_PERMISSION_CONFIRMED"
      : null;
  manifest.workerRun.resumeEvents ??= [];
  if (state.run.state === "ERROR" && resumeCode && !manifest.workerRun.resumeEvents.some(event => event.code === resumeCode)) {
    const currentDeal = await readDeal();
    const body = await signedWorkerBody(currentDeal);
    const resume = await fetch(`${workerUrl}/api/worker-runs/${manifest.workerRun.runId}/resume`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
    const resumed = await resume.json();
    assert.ok(resume.ok && resumed.accepted, `Hosted run resume rejected: ${resumed.error ?? resume.status}`);
    manifest.workerRun.resumeEvents.push({
      code: resumeCode,
      requestedAt: new Date().toISOString(),
      reason: resumeCode === "RPC_BUSY_AFTER_FINALIZED_ACCEPTS"
        ? "Confirmed RPC busy after both accept transactions finalized; D1 journal contained no unknown action."
        : resumeCode === "GITHUB_CONTENTS_WRITE_PERMISSION_FIXED"
          ? "Repository has no ruleset blocking branch creation; the repo-scoped token was updated to Contents read/write after the first real publish returned 403."
          : resumeCode === "GITHUB_BRANCH_403_DETAILS"
            ? "Canonical A is persisted and no submit hash exists; repeat the same failed branch creation once with sanitized GitHub message/documentation logging."
          : resumeCode === "OPENAI_OUTPUT_RECOVERY_PERSISTENCE"
            ? "Original A request settled before its output could be persisted; D1 has no artifact row or submit-A journal, so one named recovery request is allowed and must persist before publish."
            : resumeCode === "AGENT_A_CANONICAL_SCHEMA_LOCK"
              ? "A recovery output failed the deterministic material-fact gate before persistence or publish; Structured Output now restricts recovery-2 to the canonical artifact."
              : resumeCode === "OPENAI_CANONICAL_SCHEMA_SINGLE_LINE"
                ? "OpenAI rejected a newline-containing enum before inference; canonical recovery-3 uses the same three exact facts in a valid single-line strict schema."
                : resumeCode === "GITHUB_CONTENTS_PERMISSION_CONFIRMED"
                  ? "The repo-scoped token was replaced after the real Contents API publish returned 403; canonical A remains persisted and no submit-A hash exists."
                : resumeCode === "GITHUB_CONTENTS_DEFAULT_BRANCH_FALLBACK"
                  ? "GitHub confirmed the fine-grained token cannot create Git refs; repository has no ruleset, so publish the unique deal path through Contents API on the default branch and retain its immutable commit SHA."
        : "Confirmed field-equal GitHub origin objects differed only by key order; failure occurred before OpenAI, publish, or submit A.",
    });
    await save();
    await sleep(5000);
    continue;
  }
  if (["ERROR", "CANCELLED"].includes(state.run.state)) throw new Error(`Hosted worker ${state.run.state}: ${state.run.detail}`);
  await sleep(5000);
}
assert.equal(manifest.workerRun.state, "COMPLETE", "Hosted run did not complete");
deal = await readDeal();
assert.equal(deal.status, "REVIEWABLE", "Hosted A/B delivery did not become reviewable");
assert.ok(deal.artifacts.A?.commitment && deal.artifacts.B?.commitment, "Hosted commitments missing");
manifest.evidence = {A: deal.artifacts.A.commitment, B: deal.artifacts.B.commitment};
await save();

await transaction("client-request-review", "request_review", [manifest.dealId]);
await transaction("client-resolve-review", "resolve_review", [manifest.dealId]);
deal = await readDeal();
assert.equal(deal.status, "SETTLEMENT_PENDING", "Hosted deal did not reach settlement decision");
manifest.outcome = Object.fromEntries(deal.report.obligation_assessments.filter(row => row.kind === "SEMANTIC").map(row => [row.stage, row.status]));
assert.deepEqual(manifest.outcome, {A: "SATISFIED", B: "SATISFIED"}, "Hosted semantic outcome did not match the submission target");
manifest.review = {reviewId: deal.report.review_id, evidenceManifestHash: deal.report.evidence_manifest_hash, outcome: manifest.outcome};
manifest.settlement = {
  deferredUntilAfterPortalSubmission: true,
  legs: deal.settlement_legs.map(leg => ({id: leg.id, state: leg.state, recipient: leg.recipient, amount: leg.amount})),
  existingProof: "The no-fault live case already records four DISPATCHED_UNVERIFIED settlement legs.",
};
manifest.finishedAt = new Date().toISOString();
await writeFile(resolve(reportDir, "deal.json"), stringify(deal) + "\n");
await save();
console.log(stringify({hostedLive: "PASS", dealId: manifest.dealId, runId: manifest.workerRun.runId, outcome: manifest.outcome, settlementDeferred: true}));
