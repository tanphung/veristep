import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifacts, solidity } from "hardhat";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { localnet } from "genlayer-js/chains";
import { assertExecution } from "./receipts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = resolve(root, "reports", "v2-local");
const manifestPath = resolve(reportDir, "manifest.json");
const secretsPath = resolve(root, ".secrets", "v2-local.json");
const genEndpoint = process.env.VERISTEP_GEN_RPC ?? "http://127.0.0.1:4000/api";
const evmEndpoint = process.env.VERISTEP_EVM_RPC ?? "http://127.0.0.1:8545";
const commitSha = "926821c5c48c6c91fc7f11d3c5d654f1180f3e87";
const owner = "tanphung";
const repository = "veristep";
const origin = {
  provider: "github",
  hostname: "api.github.com",
  owner,
  owner_id: 162718327,
  repository,
  repository_id: 1358380732,
};
const evidencePaths = {
  SOURCE: "evidence/v2-smoke/source.txt",
  A: "evidence/v2-smoke/worker-a.txt",
  B: "evidence/v2-smoke/worker-b.txt",
};
const exists = (path) => access(path).then(() => true, () => false);
const stringify = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const save = () => writeFile(manifestPath, stringify(manifest));
const githubHeaders = {
  accept: "application/vnd.github+json",
  "user-agent": "VeriStep-v2-integration",
  ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
};

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  assert.equal(response.status, 200, `${method} HTTP ${response.status}`);
  const envelope = await response.json();
  assert.ok(!envelope.error, `${method}: ${stringify(envelope.error)}`);
  return envelope.result;
}

await mkdir(reportDir, { recursive: true });
await mkdir(dirname(secretsPath), { recursive: true });
if (!await exists(secretsPath)) {
  await writeFile(secretsPath, stringify({
    client: generatePrivateKey(),
    A: generatePrivateKey(),
    B: generatePrivateKey(),
  }), { mode: 0o600, flag: "wx" });
}
const keys = JSON.parse(await readFile(secretsPath, "utf8"));
const accounts = Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, createAccount(key)]));
const chainId = Number.parseInt(await rpc(genEndpoint, "eth_chainId"), 16);
assert.equal(Number.parseInt(await rpc(evmEndpoint, "eth_chainId"), 16), chainId, "GenLayer and EVM chain domains differ");
const genChain = { ...localnet, id: chainId, rpcUrls: { default: { http: [genEndpoint] } } };
const clients = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, createClient({ chain: genChain, endpoint: genEndpoint, account })]));
const code = await readFile(resolve(root, "contracts", "veristep.py"), "utf8");
const sourceHash = createHash("sha256").update(code).digest("hex");
let manifest = await exists(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : {
      version: "veristep-v2-local-1",
      chainId,
      sourceHash,
      commitSha,
      wallets: Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, account.address])),
      steps: {},
      startedAt: new Date().toISOString(),
    };
assert.equal(manifest.chainId, chainId, "Saved run belongs to another chain");
assert.equal(manifest.sourceHash, sourceHash, "Contract changed; archive reports/v2-local before a new run");
assert.equal(manifest.commitSha, commitSha, "Evidence commit changed during a saved run");
for (const role of ["client", "A", "B"]) {
  assert.equal(manifest.wallets[role].toLowerCase(), accounts[role].address.toLowerCase(), `Saved ${role} wallet changed`);
}
await save();

async function waitGen(hash, requireContractExecution = true) {
  const receipt = await clients.client.waitForTransactionReceipt({ hash, status: "FINALIZED", interval: 1500, retries: 400 });
  if (requireContractExecution) assertExecution(receipt, true);
  return receipt;
}

async function genStep(name, actor, submit, requireContractExecution = true) {
  let item = manifest.steps[name];
  if (!item || item.phase === "REJECTED_BEFORE_HASH") {
    item = manifest.steps[name] = { phase: "SIGNING", startedAt: new Date().toISOString() };
    await save();
    let hash;
    try {
      hash = await submit();
    } catch (error) {
      Object.assign(item, {
        phase: "REJECTED_BEFORE_HASH",
        error: error?.details ?? error?.shortMessage ?? error?.message ?? "submission rejected",
        finishedAt: new Date().toISOString(),
      });
      await save();
      throw error;
    }
    Object.assign(item, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
    await save();
  }
  assert.ok(item.hash, `Uncertain ${name} submission has no saved hash; do not resend`);
  if (!item.finalized) {
    const receipt = await waitGen(item.hash, requireContractExecution);
    await writeFile(resolve(reportDir, `${name}.receipt.json`), stringify(receipt));
    Object.assign(item, {
      finalized: true,
      phase: "FINALIZED_SUCCESS",
      to: receipt.to_address ?? receipt.recipient ?? receipt.data?.contract_address,
      finishedAt: new Date().toISOString(),
    });
    await save();
  }
  return item;
}

for (const role of ["client", "A", "B"]) {
  const balance = await clients[role].getBalance({ address: accounts[role].address });
  if (balance < 100_000n) {
    const step = `fund-${role}`;
    await genStep(step, "client", () => clients.client.request({
      method: "sim_fundAccount",
      params: [accounts[role].address, 1_000_000],
    }), false);
  }
  assert.ok(await clients[role].getBalance({ address: accounts[role].address }) >= 100_000n, `${role} local balance not funded`);
}

const evmChain = defineChain({
  id: chainId,
  name: "VeriStep isolated local EVM",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [evmEndpoint] } },
});
const evmPublic = createPublicClient({ chain: evmChain, transport: http(evmEndpoint) });
const [deployer] = await rpc(evmEndpoint, "eth_accounts");
assert.ok(deployer, "Local EVM exposes no unlocked deployment account");
const evmDeployer = createWalletClient({ account: deployer, chain: evmChain, transport: http(evmEndpoint) });

for (const role of ["client", "A", "B"]) {
  if (await evmPublic.getBalance({ address: accounts[role].address }) >= 10n ** 15n) continue;
  const name = `evm-fund-${role}`;
  let item = manifest.steps[name];
  if (!item) {
    item = manifest.steps[name] = { phase: "SIGNING", startedAt: new Date().toISOString() };
    await save();
    const hash = await evmDeployer.sendTransaction({ to: accounts[role].address, value: 10n ** 17n });
    Object.assign(item, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
    await save();
  }
  assert.ok(item.hash, `Uncertain ${name} has no saved hash; do not resend`);
  const receipt = await evmPublic.waitForTransactionReceipt({ hash: item.hash });
  assert.equal(receipt.status, "success", `${name} reverted`);
  Object.assign(item, { finalized: true, phase: "FINALIZED_SUCCESS", finishedAt: new Date().toISOString() });
  await save();
}

const buildResult = await solidity.build([
  fileURLToPath(new URL("../contracts/VeriStepReceiptRouter.sol", import.meta.url)),
], { force: true, quiet: true, cleanupArtifacts: true });
assert.ok(solidity.isSuccessfulBuildResult(buildResult), "Receipt router compile failed");
const routerArtifact = await artifacts.readArtifact("VeriStepReceiptRouter");
if (!manifest.router) {
  let step = manifest.steps["deploy-router"];
  if (!step) {
    step = manifest.steps["deploy-router"] = { phase: "SIGNING", startedAt: new Date().toISOString() };
    await save();
    const hash = await evmDeployer.deployContract({ abi: routerArtifact.abi, bytecode: routerArtifact.bytecode });
    Object.assign(step, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
    await save();
  }
  const receipt = await evmPublic.waitForTransactionReceipt({ hash: step.hash });
  assert.equal(receipt.status, "success", "Router deployment reverted");
  assert.ok(receipt.contractAddress, "Router deployment address missing");
  Object.assign(step, { phase: "FINALIZED_SUCCESS", finalized: true, to: receipt.contractAddress });
  manifest.router = receipt.contractAddress;
  await save();
}

const deployment = await genStep("deploy-contract", "client", () => clients.client.deployContract({
  code,
  args: [manifest.router],
  leaderOnly: false,
  consensusMaxRotations: 3,
}));
manifest.contract ??= deployment.to;
assert.match(manifest.contract ?? "", /^0x[0-9a-fA-F]{40}$/, "Contract deployment address missing");
await save();
const address = manifest.contract;
const readDeal = async () => JSON.parse(await clients.client.readContract({ address, functionName: "get_terms", args: [manifest.dealId] }));
const write = (name, role, functionName, args, value = 0n) => genStep(name, role, () => clients[role].writeContract({
  address,
  functionName,
  args,
  value,
  leaderOnly: false,
  consensusMaxRotations: 3,
}));

const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repository}`, { headers: githubHeaders });
assert.equal(repoResponse.status, 200, "GitHub repository metadata unavailable");
const repo = await repoResponse.json();
assert.deepEqual({ id: repo.id, owner_id: repo.owner?.id, full_name: repo.full_name }, { id: origin.repository_id, owner_id: origin.owner_id, full_name: `${owner}/${repository}` });
const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repository}/git/trees/${commitSha}?recursive=1`, { headers: githubHeaders });
assert.equal(treeResponse.status, 200, "GitHub immutable tree unavailable");
const tree = await treeResponse.json();
assert.equal(tree.truncated, false, "GitHub evidence tree truncated");
const commitments = {};
for (const [role, path] of Object.entries(evidencePaths)) {
  const bytes = await readFile(resolve(root, path));
  const entry = tree.tree.find((item) => item.path === path);
  assert.deepEqual({ type: entry?.type, mode: entry?.mode, size: entry?.size }, { type: "blob", mode: "100644", size: bytes.length }, `${role} tree entry mismatch`);
  commitments[role] = {
    origin,
    commit: commitSha,
    path,
    blob: entry.sha,
    content_type: "text/plain",
    encoding: "utf-8",
    byte_length: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

manifest.dealId ??= `v2-local-${commitSha.slice(0, 8)}`;
await save();
const terms = {
  workers: { A: accounts.A.address, B: accounts.B.address },
  origins: { SOURCE: origin, A: origin, B: origin },
  source: commitments.SOURCE,
  money: {
    A: { fee: "1000", bond: "500", penalty: "300" },
    B: { fee: "1000", bond: "500", penalty: "300" },
  },
  windows: { accept: 600, step: 600, review: 600, adjudication: 900 },
  max_revisions: 0,
  semantic_obligations: [
    {
      id: "SEM_A_POLICY_ACCURACY",
      stage: "A",
      statement: "Stage A must preserve every export-policy rule in SOURCE: trial accounts cannot export; paid accounts require administrator approval for every export; there is no automatic-export exception.",
      evidence_ids: ["SOURCE", "A"],
    },
    {
      id: "SEM_B_FAITHFUL_HANDOFF",
      stage: "B",
      statement: "Stage B must faithfully preserve Stage A's complete policy without weakening, contradicting, or inventing an export exception.",
      evidence_ids: ["A", "B"],
    },
  ],
};

await write("create-terms", "client", "create_terms", [manifest.dealId, JSON.stringify(terms)]);
let deal = await readDeal();
assert.equal(deal.deal_id, manifest.dealId, "Loaded deal does not match the saved run");
assert.match(deal.terms_hash, /^[0-9a-f]{64}$/, "Frozen terms hash is missing or malformed");
await write("fund-terms", "client", "fund_terms", [manifest.dealId, deal.terms_hash], 2000n);
await write("accept-a", "A", "accept_work", [manifest.dealId, deal.terms_hash], 500n);
await write("accept-b", "B", "accept_work", [manifest.dealId, deal.terms_hash], 500n);
deal = await readDeal();
await write("submit-a", "A", "submit_artifact", [manifest.dealId, JSON.stringify(commitments.A), deal.artifacts.SOURCE.submission_id]);
deal = await readDeal();
await write("submit-b", "B", "submit_artifact", [manifest.dealId, JSON.stringify(commitments.B), deal.artifacts.A.submission_id]);
await write("request-review", "client", "request_review", [manifest.dealId]);
await write("resolve-review", "client", "resolve_review", [manifest.dealId]);
deal = await readDeal();
assert.equal(deal.status, "SETTLEMENT_PENDING", `Review did not reach settlement: ${deal.status}`);
assert.deepEqual(deal.report.score, { A: 10000, B: 10000 }, "Independent semantic review did not fully satisfy the smoke obligations");
const expectedIds = deal.manifest.obligations.map((item) => item.id).sort();
assert.deepEqual(deal.report.obligation_assessments.map((item) => item.obligation_id).sort(), expectedIds, "Report obligation set differs from frozen terms");
assert.equal(deal.report.source_assessments.length, 3);
assert.ok(deal.report.evidence_citations.length >= 4, "Structured report is missing citations");

const routerFor = (role) => getContract({
  address: manifest.router,
  abi: routerArtifact.abi,
  client: {
    public: evmPublic,
    wallet: createWalletClient({ account: privateKeyToAccount(keys[role]), chain: evmChain, transport: http(evmEndpoint) }),
  },
});
const addressToRole = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [account.address.toLowerCase(), role]));
for (const leg of deal.settlement_legs) {
  await write(`route-${leg.sequence}`, "client", "route_settlement", [manifest.dealId, leg.id]);
  deal = await readDeal();
  const routed = deal.settlement_legs.find((item) => item.id === leg.id);
  assert.equal(routed.state, "ROUTED");
  assert.equal(await getContract({ address: manifest.router, abi: routerArtifact.abi, client: evmPublic }).read.receiptState([manifest.contract, `0x${routed.receipt_id}`]), 1);
  const role = addressToRole[routed.recipient.toLowerCase()];
  assert.ok(role, `No local signer for receipt recipient ${routed.recipient}`);
  const releaseStep = `release-${routed.sequence}`;
  if (!manifest.steps[releaseStep]?.finalized) {
    const router = routerFor(role);
    let item = manifest.steps[releaseStep];
    if (!item) {
      item = manifest.steps[releaseStep] = { phase: "SIGNING", startedAt: new Date().toISOString() };
      await save();
      const hash = await router.write.release([manifest.contract, `0x${routed.receipt_id}`]);
      Object.assign(item, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
      await save();
    }
    const receipt = await evmPublic.waitForTransactionReceipt({ hash: item.hash });
    assert.equal(receipt.status, "success", `${releaseStep} reverted`);
    Object.assign(item, { finalized: true, phase: "FINALIZED_SUCCESS", finishedAt: new Date().toISOString() });
    await save();
  }
  await write(`confirm-${leg.sequence}`, "client", "confirm_settlement", [manifest.dealId, leg.id]);
}
deal = await readDeal();
assert.equal(deal.status, "COMPLETED");
assert.equal(deal.ledger.received, deal.ledger.routed);
assert.equal(deal.ledger.received, deal.ledger.confirmed);
await writeFile(resolve(reportDir, "final-deal.json"), stringify(deal));
manifest.completedAt = new Date().toISOString();
manifest.result = { status: deal.status, score: deal.report.score, legs: deal.settlement_legs.length };
await save();
console.log(JSON.stringify({ passed: true, contract: address, router: manifest.router, deal: manifest.dealId, result: manifest.result }));
