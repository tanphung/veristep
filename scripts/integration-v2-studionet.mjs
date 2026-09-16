import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient, deriveInternalMessageCallKey, encodeInternalMessageFeeParams } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { assertExecution, executionName, statusName } from "./receipts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportName = process.env.VERISTEP_STUDIO_NEXT_REPORT ?? "studio-next-live";
assert.match(reportName, /^studio-next-[a-z0-9-]{1,48}$/, "Unsafe Studio Next report directory name");
const reportDir = resolve(root, "reports", reportName);
const manifestPath = resolve(reportDir, "manifest.json");
const secretsPath = resolve(root, ".secrets", "studio-next-wallets.json");
const evidenceCommit = "358323c1c33d667e0599f330554fb5f5fad6406d";
assert.match(evidenceCommit, /^[0-9a-f]{40}$/, "Immutable evidence commit unavailable");
const owner = "tanphung";
const repository = "veristep-evidence";
const rpc = "https://studio-next.genlayer.com/api";
const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [rpc] } } };
const origin = {
  provider: "github",
  hostname: "api.github.com",
  owner,
  owner_id: 162718327,
  repository,
  repository_id: 1368396966,
};
const INTERNAL_TRANSFER_BUDGET = 120000000000010352n;
const internalTransferAllocation = (recipient) => ({
  messageType: 1,
  onAcceptance: false,
  recipient,
  callKey: deriveInternalMessageCallKey(),
  budget: INTERNAL_TRANSFER_BUDGET,
  feeParams: encodeInternalMessageFeeParams({
    leaderTimeunitsAllocation: 100n,
    validatorTimeunitsAllocation: 200n,
    appealRounds: 0n,
    executionBudgetPerRound: 25000000000000000n,
    rotations: [3n],
    maxPriceGenPerTimeUnit: 2n,
    storageFeeMaxGasPrice: 300000000n,
    receiptFeeMaxGasPrice: 300000000n,
  }),
});
const fixtures = [
  {
    id: "no-fault",
    paths: {
      SOURCE: "fixtures/no-fault/source.txt",
      A: "fixtures/no-fault/agent-a.txt",
      B: "fixtures/no-fault/agent-b.txt",
    },
    expected: { A: "SATISFIED", B: "SATISFIED" },
  },
  {
    id: "a-fault",
    paths: {
      SOURCE: "fixtures/a-fault/source.txt",
      A: "fixtures/a-fault/agent-a.txt",
      B: "fixtures/a-fault/agent-b.txt",
    },
    expected: { A: "VIOLATED", B: "SATISFIED" },
  },
  {
    id: "b-fault",
    paths: {
      SOURCE: "fixtures/b-fault/source.txt",
      A: "fixtures/b-fault/agent-a.txt",
      B: "fixtures/b-fault/agent-b.txt",
    },
    expected: { A: "SATISFIED", B: "VIOLATED" },
  },
];
const requestedCaseIds = (process.env.VERISTEP_STUDIO_NEXT_CASES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const activeFixtures = requestedCaseIds.length === 0
  ? fixtures
  : fixtures.filter((fixture) => requestedCaseIds.includes(fixture.id));
assert.equal(activeFixtures.length, requestedCaseIds.length || fixtures.length, "Unknown Studio Next case selector");
const exists = (path) => access(path).then(() => true, () => false);
const stringify = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const safeErrorMessage = (error) => {
  const candidate = [error?.details, error?.shortMessage, error?.message, error?.cause?.message]
    .find((value) => typeof value === "string") ?? "";
  const codes = candidate.match(/\b[A-Z][A-Z0-9_]{2,}\b/g);
  return codes?.at(-1) ?? "RPC_SUBMISSION_REJECTED";
};
const decodeResult = (value) => {
  if (typeof value !== "string") return null;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    return /^[\x20-\x7E]+$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
};
const publicError = (error) => {
  const receipt = error?.cause?.data?.receipt;
  return {
    name: error?.name ?? "Error",
    message: safeErrorMessage(error),
    code: error?.code ?? error?.cause?.code ?? null,
    executionResult: receipt?.execution_result ?? null,
    contractResult: decodeResult(receipt?.result),
  };
};
process.on("uncaughtException", (error) => {
  console.error(JSON.stringify({ fatal: publicError(error) }));
  process.exitCode = 1;
});
function isTransientNetworkError(error) {
  const message = [error?.details, error?.shortMessage, error?.message, error?.cause?.message]
    .filter(Boolean)
    .join(" ");
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(message);
}

async function rpcReadWithRetry(label, action, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts) throw error;
      console.warn(JSON.stringify({ retry: label, attempt, reason: safeErrorMessage(error) }));
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function submitWithNonceGuard(name, client, submit) {
  const address = client.account?.address;
  assert.match(address ?? "", /^0x[0-9a-fA-F]{40}$/, `${name} signer unavailable`);
  const nonceBefore = await rpcReadWithRetry(`${name}:nonce-before`, () => client.getTransactionCount({
    address,
    blockTag: "pending",
  }));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await submit();
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
      await sleep(1500 * attempt);
      const nonceAfter = await rpcReadWithRetry(`${name}:nonce-after`, () => client.getTransactionCount({
        address,
        blockTag: "pending",
      }));
      if (nonceAfter !== nonceBefore) {
        throw new Error(
          `${name} submission is uncertain: signer nonce advanced from ${nonceBefore} to ${nonceAfter}; refusing to resend without a transaction hash`,
          { cause: error },
        );
      }
      if (attempt === 3) throw error;
      console.warn(JSON.stringify({ retry: `${name}:submit`, attempt, nonce: nonceBefore.toString() }));
    }
  }
  throw new Error(`${name} submission retry exhausted`);
}

await mkdir(reportDir, { recursive: true });
assert.equal(await exists(secretsPath), true, "Hosted worker keys are missing; run prepare-worker-secrets first");
const workerKeys = JSON.parse(await readFile(secretsPath, "utf8"));
const keys = { client: workerKeys.CLIENT_PRIVATE_KEY, A: workerKeys.WORKER_A_PRIVATE_KEY, B: workerKeys.WORKER_B_PRIVATE_KEY };
for (const [role, key] of Object.entries(keys)) assert.match(key ?? "", /^0x[0-9a-fA-F]{64}$/, `${role} private key is invalid`);
const accounts = Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, createAccount(key)]));
assert.notEqual(accounts.A.address.toLowerCase(), accounts.B.address.toLowerCase(), "Worker wallets must be distinct");
const clients = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, createClient({ chain, endpoint: rpc, account })]));
const chainId = await clients.client.getChainId();
assert.equal(chainId, 61997, "Studio Next chain guard failed");
const balances = {};
for (const role of ["client", "A", "B"]) {
  let balance = await clients[role].getBalance({ address: accounts[role].address });
  if (balance < 5n * 10n ** 18n) {
    await clients.client.request({ method: "sim_fundAccount", params: [accounts[role].address, 1e20] });
    balance = await clients[role].getBalance({ address: accounts[role].address });
  }
  assert.ok(balance >= 5n * 10n ** 18n, `${role} Studio Next balance is insufficient`);
  balances[role] = String(balance);
}
const contractSource = "veristep_release.py";
const code = await readFile(resolve(root, "contracts", contractSource), "utf8");
const sourceHash = createHash("sha256").update(code).digest("hex");
let manifest = await exists(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : {
      version: "veristep-studio-next-live-1",
      network: "studio-next",
      chainId,
      sourceHash,
      evidenceCommit,
      wallets: Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, account.address])),
      preflightBalances: balances,
      steps: {},
      cases: {},
      startedAt: new Date().toISOString(),
      limitations: ["Studio Next native transfer receipts are observed off-chain; contract-side receipt confirmation remains fail-closed."],
    };
assert.equal(manifest.network, "studio-next");
assert.equal(manifest.chainId, chainId);
assert.equal(manifest.sourceHash, sourceHash, "Contract changed; archive the saved StudioNet run before retrying");
assert.equal(manifest.evidenceCommit, evidenceCommit, "Evidence commit changed during a saved run");
for (const role of ["client", "A", "B"]) {
  assert.equal(manifest.wallets[role].toLowerCase(), accounts[role].address.toLowerCase(), `Saved ${role} wallet changed`);
}
const save = () => writeFile(manifestPath, stringify(manifest));
await save();

// Preserve the first wrong-owner probe as harness-failure evidence. The preceding
// hostname mutator shared the origin object in that process, so this transaction
// correctly rejected ORIGIN_HOST but did not exercise the intended owner check.
const sharedOriginProbe = manifest.steps["reject-wrong-owner"];
if (sharedOriginProbe?.hash && !sharedOriginProbe.finalized) {
  Object.assign(sharedOriginProbe, {
    finalized: true,
    phase: "FINALIZED_HARNESS_REJECTION",
    execution: "FINISHED_WITH_ERROR",
    observedError: "ORIGIN_HOST",
    passed: false,
    note: "Archived harness isolation failure; replaced by reject-wrong-owner-isolated.",
    finishedAt: new Date().toISOString(),
  });
  await save();
}

function receiptHasError(value, expectedError) {
  if (Array.isArray(value)) return value.some((item) => receiptHasError(item, expectedError));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => receiptHasError(item, expectedError));
  }
  if (typeof value !== "string") return false;
  if (value.includes(expectedError)) return true;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  try {
    return Buffer.from(value, "base64").toString("utf8").includes(expectedError);
  } catch {
    return false;
  }
}

async function transaction(name, client, submit) {
  let step = manifest.steps[name];
  if (!step || step.phase === "REJECTED_BEFORE_HASH") {
    step = manifest.steps[name] = { phase: "SIGNING", startedAt: new Date().toISOString() };
    await save();
    let hash;
    try {
      hash = await submitWithNonceGuard(name, client, submit);
    } catch (error) {
      Object.assign(step, {
        phase: "REJECTED_BEFORE_HASH",
        error: safeErrorMessage(error),
        finishedAt: new Date().toISOString(),
      });
      await save();
      throw error;
    }
    Object.assign(step, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
    await save();
    console.log(JSON.stringify({ step: name, submitted: hash }));
  }
  assert.ok(step.hash, `Uncertain ${name} submission has no saved hash; do not resend`);
  if (step.finalized) return step;
  let receipt;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await sleep(5000);
    receipt = await rpcReadWithRetry(`${name}:receipt`, () => client.getTransaction({ hash: step.hash }));
    await writeFile(resolve(reportDir, `${name}.receipt.json`), stringify(receipt));
    const lifecycle = statusName(receipt);
    if (attempt % 6 === 0 || ["FINALIZED", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(lifecycle)) {
      console.log(JSON.stringify({ step: name, status: lifecycle, execution: executionName(receipt) }));
    }
    if (["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(lifecycle)) {
      Object.assign(step, {
        finalized: true,
        phase: lifecycle,
        execution: executionName(receipt),
        finishedAt: new Date().toISOString(),
      });
      await save();
      throw new Error(`${name} reached terminal ${lifecycle}`);
    }
    if (lifecycle === "FINALIZED") break;
  }
  const execution = executionName(receipt ?? {});
  Object.assign(step, {
    finalized: true,
    phase: execution === "FINISHED_WITH_RETURN" ? "FINALIZED_SUCCESS" : "FINALIZED_ERROR",
    execution,
    to: receipt.to_address ?? receipt.recipient ?? receipt.data?.contract_address,
    finishedAt: new Date().toISOString(),
  });
  await save();
  assertExecution(receipt ?? {}, true);
  return step;
}

async function expectedRejection(name, client, expectedError, submit) {
  let step = manifest.steps[name];
  if (!step || step.phase === "REJECTED_BEFORE_HASH") {
    step = manifest.steps[name] = {
      phase: "SIGNING_EXPECTED_REJECTION",
      expectedError,
      startedAt: new Date().toISOString(),
    };
    await save();
    const hash = await submitWithNonceGuard(name, client, submit);
    Object.assign(step, { hash, phase: "PENDING_EXPECTED_REJECTION", submittedAt: new Date().toISOString() });
    await save();
    console.log(JSON.stringify({ step: name, submitted: hash, expectedError }));
  }
  assert.equal(step.expectedError, expectedError, `${name} expected error changed during a saved run`);
  assert.ok(step.hash, `${name} was rejected before receiving a transaction hash`);
  if (step.finalized) {
    assert.equal(step.execution, "FINISHED_WITH_ERROR", `${name} was not an execution rejection`);
    return step;
  }
  let receipt;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await sleep(5000);
    receipt = await rpcReadWithRetry(`${name}:receipt`, () => client.getTransaction({ hash: step.hash }));
    await writeFile(resolve(reportDir, `${name}.receipt.json`), stringify(receipt));
    const lifecycle = statusName(receipt);
    if (attempt % 6 === 0 || ["FINALIZED", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(lifecycle)) {
      console.log(JSON.stringify({ step: name, status: lifecycle, execution: executionName(receipt) }));
    }
    if (["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(lifecycle)) {
      throw new Error(`${name} reached terminal ${lifecycle}`);
    }
    if (lifecycle === "FINALIZED") break;
  }
  assert.equal(statusName(receipt ?? {}), "FINALIZED", `${name} did not finalize`);
  assert.equal(executionName(receipt ?? {}), "FINISHED_WITH_ERROR", `${name} unexpectedly executed successfully`);
  assert.ok(receiptHasError(receipt, expectedError), `${name} did not fail with ${expectedError}`);
  Object.assign(step, {
    finalized: true,
    phase: "FINALIZED_EXPECTED_REJECTION",
    execution: executionName(receipt),
    finishedAt: new Date().toISOString(),
  });
  await save();
  return step;
}

const githubHeaders = {
  accept: "application/vnd.github+json",
  "user-agent": "VeriStep-v2-studionet",
  ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
};
const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repository}`, { headers: githubHeaders });
assert.equal(repoResponse.status, 200, "GitHub repository metadata unavailable during preflight");
const repo = await repoResponse.json();
assert.deepEqual(
  { id: repo.id, owner_id: repo.owner?.id, full_name: repo.full_name },
  { id: origin.repository_id, owner_id: origin.owner_id, full_name: `${owner}/${repository}` },
);
const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repository}/git/trees/${evidenceCommit}?recursive=1`, { headers: githubHeaders });
assert.equal(treeResponse.status, 200, "GitHub immutable tree unavailable during preflight");
const tree = await treeResponse.json();
assert.equal(tree.truncated, false, "GitHub evidence tree is truncated");

function obligations() {
  return [
    {
      id: "SEM_A_POLICY_ACCURACY",
      stage: "A",
      statement: "Stage A must preserve every export-policy rule in SOURCE: trial accounts cannot export; paid accounts require administrator approval for every export; there is no automatic-export exception. A later sentence that overrides these rules is a violation.",
      evidence_ids: ["SOURCE", "A"],
    },
    {
      id: "SEM_B_FAITHFUL_HANDOFF",
      stage: "B",
      statement: "Stage B must faithfully preserve Stage A's complete delivered policy, including a final override, without independently weakening, contradicting, or inventing a different export rule. Stage B is not required to repair Stage A against SOURCE.",
      evidence_ids: ["A", "B"],
    },
  ];
}

function makeTerms(commitments) {
  return {
    workers: { A: accounts.A.address, B: accounts.B.address },
    origins: { SOURCE: structuredClone(origin), A: structuredClone(origin), B: structuredClone(origin) },
    source: commitments.SOURCE,
    money: {
      A: { fee: "1000", bond: "500", penalty: "300" },
      B: { fee: "1000", bond: "500", penalty: "300" },
    },
    windows: { accept: 1800, step: 1800, review: 1800, adjudication: 3600 },
    max_revisions: 0,
    semantic_obligations: obligations(),
  };
}

const deployment = JSON.parse(await readFile(resolve(root, "frontend", "src", "deployment.json"), "utf8"));
assert.equal(deployment.network, "studio-next");
assert.equal(deployment.chainId, 61997);
assert.equal(deployment.sourceHash, sourceHash, "Frontend deployment source hash is stale");
assert.ok(["LIVE_GATES_PENDING","READY"].includes(deployment.releaseStatus), "Frontend deployment status is invalid");
manifest.contract ??= deployment.contract;
assert.match(manifest.contract ?? "", /^0x[0-9a-fA-F]{40}$/, "Studio Next deployment address missing");
await save();
const address = manifest.contract;
const deployedCode = await clients.client.getContractCode(address);
assert.equal(createHash("sha256").update(deployedCode).digest("hex"), sourceHash, "Deployed source hash mismatch");
const schema = await clients.client.getContractSchema(address);
await writeFile(resolve(reportDir, "schema.json"), stringify(schema));
const config = JSON.parse(await clients.client.readContract({ address, functionName: "get_capabilities", args: [] }));
assert.equal(config.version, "veristep-2.0-rc");
assert.equal(config.router.toLowerCase(), accounts.client.address.toLowerCase());
manifest.schemaVerified = true;
manifest.configVerified = true;
manifest.deployedSourceVerified = true;
await save();
const readDeal = async (dealId) => JSON.parse(await clients.client.readContract({ address, functionName: "get_terms", args: [dealId] }));
const reviveNumericStrings = (value) => {
  if (Array.isArray(value)) return value.map(reviveNumericStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveNumericStrings(item)]));
  }
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : value;
};
const write = (name, role, functionName, args, value = 0n, feeOptions = {}, fallbackFeeProfileName) => transaction(name, clients[role], async () => {
  const call = { address, functionName, args, value };
  let estimate;
  try {
    estimate = await clients[role].estimateTransactionFeesForWrite({ ...call, ...feeOptions });
  } catch (error) {
    const fallback = fallbackFeeProfileName ? manifest.feeProfiles?.[fallbackFeeProfileName] : null;
    if (!fallback) throw error;
    estimate = {
      feeValue: BigInt(fallback.feeValue),
      distribution: reviveNumericStrings(fallback.distribution),
      ...(fallback.messageAllocations ? { messageAllocations: reviveNumericStrings(fallback.messageAllocations) } : {}),
    };
    console.warn(JSON.stringify({
      step: name,
      feeProfileFallback: fallbackFeeProfileName,
      reason: publicError(error),
    }));
  }
  manifest.feeProfiles ??= {};
  manifest.feeProfiles[name] = {
    feeValue: String(estimate.feeValue),
    distribution: JSON.parse(stringify(estimate.distribution)),
    ...(estimate.messageAllocations ? { messageAllocations: JSON.parse(stringify(estimate.messageAllocations)) } : {}),
    ...(fallbackFeeProfileName ? { fallbackCandidate: fallbackFeeProfileName } : {}),
  };
  await save();
  return clients[role].writeContract({
    ...call,
    fees: {
      distribution: estimate.distribution,
      ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}),
      feeValue: estimate.feeValue,
    },
  });
});

async function loadCommitments(paths) {
  const commitments = {};
  for (const [role, path] of Object.entries(paths)) {
    const entry = tree.tree.find((item) => item.path === path);
    assert.equal(entry?.type,"blob",`${role} tree entry missing`);
    assert.equal(entry?.mode,"100644",`${role} tree mode mismatch`);
    const blobResponse=await fetch(`https://api.github.com/repos/${owner}/${repository}/git/blobs/${entry.sha}`,{headers:githubHeaders});
    assert.equal(blobResponse.status,200,`${role} blob unavailable`);
    const blob=await blobResponse.json();
    assert.equal(blob.encoding,"base64",`${role} blob encoding mismatch`);
    const bytes=Buffer.from(blob.content.replace(/\s/g,""),"base64");
    assert.equal(entry.size,bytes.length,`${role} blob size mismatch`);
    commitments[role] = {
      origin,
      commit: evidenceCommit,
      path,
      blob: entry.sha,
      content_type: "text/plain",
      encoding: "utf-8",
      byte_length: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  return commitments;
}

for (const fixture of activeFixtures) {
  const commitments = await loadCommitments(fixture.paths);
  let recovery = 0;
  const terminalResolveFailures = new Set([
    "FINALIZED_ERROR",
    "UNDETERMINED",
    "CANCELED",
    "LEADER_TIMEOUT",
    "VALIDATORS_TIMEOUT",
  ]);
  while (true) {
    const candidate = recovery === 0 ? fixture.id : `${fixture.id}-recovery-${recovery}`;
    const nextCandidate = `${fixture.id}-recovery-${recovery + 1}`;
    const failedResolve = manifest.steps[`${candidate}-resolve-review`];
    const retryResolve = manifest.steps[`${candidate}-resolve-review-retry-1`];
    if (manifest.steps[`${nextCandidate}-create`]) {
      recovery += 1;
      continue;
    }
    if (terminalResolveFailures.has(failedResolve?.phase) && terminalResolveFailures.has(retryResolve?.phase)) {
      recovery += 1;
      continue;
    }
    break;
  }
  const prefix = recovery === 0 ? fixture.id : `${fixture.id}-recovery-${recovery}`;
  const dealId = recovery === 0
    ? `v2-studio-${fixture.id}-${evidenceCommit.slice(0, 7)}`
    : `v2-studio-${fixture.id}-r${recovery}-${evidenceCommit.slice(0, 7)}`;
  await write(`${prefix}-create`, "client", "create_terms", [dealId, JSON.stringify(makeTerms(commitments))]);
  let deal = await readDeal(dealId);
  assert.equal(deal.deal_id, dealId);
  await write(`${prefix}-fund`, "client", "fund_terms", [dealId, deal.terms_hash], 2000n);
  await write(`${prefix}-accept-a`, "A", "accept_work", [dealId, deal.terms_hash], 500n);
  await write(`${prefix}-accept-b`, "B", "accept_work", [dealId, deal.terms_hash], 500n);
  deal = await readDeal(dealId);
  await write(`${prefix}-submit-a`, "A", "submit_artifact", [dealId, JSON.stringify(commitments.A), deal.artifacts.SOURCE.submission_id]);
  deal = await readDeal(dealId);
  await write(`${prefix}-submit-b`, "B", "submit_artifact", [dealId, JSON.stringify(commitments.B), deal.artifacts.A.submission_id]);
  await write(`${prefix}-request-review`, "client", "request_review", [dealId]);
  const resolveBase = `${prefix}-resolve-review`;
  const priorResolve = manifest.steps[resolveBase];
  const resolveName = priorResolve?.finalized && ["UNDETERMINED","FINALIZED_ERROR"].includes(priorResolve.phase) ? `${resolveBase}-retry-1` : resolveBase;
  const previousPrefix = recovery === 0
    ? undefined
    : recovery === 1
      ? fixture.id
      : `${fixture.id}-recovery-${recovery - 1}`;
  const resolveFeeFallback = resolveName === resolveBase
    ? previousPrefix ? `${previousPrefix}-resolve-review` : undefined
    : resolveBase;
  await write(resolveName, "client", "resolve_review", [dealId], 0n, {}, resolveFeeFallback);
  deal = await readDeal(dealId);
  assert.equal(deal.status, "SETTLEMENT_PENDING", `${fixture.id} did not reach a deterministic settlement decision`);
  const semantic = Object.fromEntries(
    deal.report.obligation_assessments
      .filter((item) => item.kind === "SEMANTIC")
      .map((item) => [item.stage, item.status]),
  );
  assert.deepEqual(semantic, fixture.expected, `${fixture.id} semantic outcome mismatch`);
  const expectedIds = deal.manifest.obligations.map((item) => item.id).sort();
  assert.deepEqual(deal.report.obligation_assessments.map((item) => item.obligation_id).sort(), expectedIds, `${fixture.id} report obligation set mismatch`);
  assert.equal(deal.report.source_assessments.length, 3);
  assert.ok(deal.report.evidence_citations.length >= 4, `${fixture.id} report citations missing`);
  const settlementDispatch = [];
  for (const leg of deal.settlement_legs) {
    const routeBase = `${prefix}-route-${leg.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const prior = manifest.steps[routeBase];
    const routeName = prior?.finalized && prior.execution === "FINISHED_WITH_ERROR" ? `${routeBase}-allocated` : routeBase;
    await write(routeName, "client", "route_settlement", [dealId, leg.id], 0n, {
      messageAllocations: [internalTransferAllocation(leg.recipient)],
    });
    deal = await readDeal(dealId);
    const routedLeg = deal.settlement_legs.find((item) => item.id === leg.id);
    assert.equal(routedLeg?.state, "DISPATCHED_UNVERIFIED", `${fixture.id}/${leg.id} was not dispatched`);
    settlementDispatch.push({ id: leg.id, kind: leg.kind, recipient: leg.recipient, amount: leg.amount, state: routedLeg.state, transaction: manifest.steps[routeName].hash });
  }
  await writeFile(resolve(reportDir, `${fixture.id}.deal.json`), stringify(deal));
  manifest.cases[fixture.id] = { dealId, expected: fixture.expected, actual: semantic, status: deal.status, settlementDispatch, passed: true };
  await save();
  console.log(JSON.stringify({ case: fixture.id, passed: true, semantic, status: deal.status }));
}

const validCommitments = await loadCommitments(fixtures[0].paths);
const negativeCases = process.env.VERISTEP_LIVE_NEGATIVE === "1" ? [
  {
    id: "bad-hostname",
    expectedError: "ORIGIN_HOST",
    mutate(value) {
      value.origins.SOURCE.hostname = "api.github.com.evil.test";
      value.source.origin.hostname = "api.github.com.evil.test";
    },
  },
  {
    id: "wrong-owner-isolated",
    expectedError: "ORIGIN_MISMATCH",
    mutate(value) {
      value.source.origin.owner = "attacker";
    },
  },
  {
    id: "mutable-version",
    expectedError: "IMMUTABLE_COMMIT",
    mutate(value) {
      value.source.commit = "main";
    },
  },
  {
    id: "malformed-sha256",
    expectedError: "ARTIFACT_HASH",
    mutate(value) {
      value.source.sha256 = "0".repeat(63);
    },
  },
  {
    id: "missing-stage-obligation",
    expectedError: "SEMANTIC_COUNT",
    mutate(value) {
      value.semantic_obligations = value.semantic_obligations.slice(0, 1);
    },
  },
] : [];

for (const testCase of negativeCases) {
  const dealId = `v2-studio-reject-${testCase.id}-${evidenceCommit.slice(0, 7)}`;
  const terms = makeTerms(structuredClone(validCommitments));
  testCase.mutate(terms);
  await expectedRejection(
    `reject-${testCase.id}`,
    clients.client,
    testCase.expectedError,
    () => clients.client.writeContract({
      address,
      functionName: "create_terms",
      args: [dealId, JSON.stringify(terms)],
      leaderOnly: false,
      consensusMaxRotations: 3,
    }),
  );
  await assert.rejects(readDeal(dealId), `${testCase.id} unexpectedly persisted a deal`);
  manifest.cases[`reject-${testCase.id}`] = {
    dealId,
    expectedError: testCase.expectedError,
    execution: "FINISHED_WITH_ERROR",
    statePersisted: false,
    passed: true,
  };
  await save();
}

const semanticCases = fixtures.filter((fixture) => manifest.cases[fixture.id]?.passed).length;
const allSemanticCasesPassed = semanticCases === fixtures.length;
if (allSemanticCasesPassed) manifest.completedAt = new Date().toISOString();
else delete manifest.completedAt;
manifest.result = {
  passed: allSemanticCasesPassed,
  partial: !allSemanticCasesPassed,
  semanticCases,
  expectedSemanticCases: fixtures.length,
  rejectionCases: negativeCases.length,
  cases: Object.keys(manifest.cases).length,
  contract: address,
};
await save();
console.log(JSON.stringify(manifest.result));
