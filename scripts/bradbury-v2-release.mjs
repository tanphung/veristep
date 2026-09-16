import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifacts, solidity } from "hardhat";
import { abi as genlayerAbi, createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  getContract,
  http,
  parseEventLogs,
  parseEther,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertExecution, executionName, statusName } from "./receipts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = resolve(root, "reports", "veristep-bradbury-release-final");
const manifestPath = resolve(reportDir, "manifest.json");
const walletSecretsPath = resolve(root, ".secrets", "hosted-worker-wallets.json");
const evidenceCommit = "f4b48b235d15c0be61cbd75bf491dde1b98ad058";
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
const stringify = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const exists = (path) => access(path).then(() => true, () => false);
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return [];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

function isTransientNetworkError(error) {
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(
    [error?.details, error?.shortMessage, error?.message, error?.cause?.message].filter(Boolean).join(" "),
  );
}

async function retryRead(label, action, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts) throw error;
      console.warn(JSON.stringify({ retry: label, attempt, reason: error?.details ?? error?.message }));
      await sleep(attempt * 1500);
    }
  }
  throw lastError;
}

const env = parseEnv(await readFile(resolve(root, ".env"), "utf8"));
const clientKey = env.PRIVATE_KEY?.startsWith("0x") ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY ?? ""}`;
assert.match(clientKey, /^0x[0-9a-fA-F]{64}$/, "PRIVATE_KEY format invalid");
const workerKeys = JSON.parse(await readFile(walletSecretsPath, "utf8"));
const keys = { client: clientKey, A: workerKeys.WORKER_A_PRIVATE_KEY, B: workerKeys.WORKER_B_PRIVATE_KEY };
for (const [role, key] of Object.entries(keys)) assert.match(key ?? "", /^0x[0-9a-fA-F]{64}$/, `${role} private key invalid`);
const accounts = Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, createAccount(key)]));
assert.equal(accounts.client.address.toLowerCase(), env.ADDRESS?.toLowerCase(), "ADDRESS does not match PRIVATE_KEY");
assert.equal(new Set(Object.values(accounts).map((account) => account.address.toLowerCase())).size, 3, "Client and worker wallets must be distinct");

const code = await readFile(resolve(root, "contracts", "veristep_release.py"), "utf8");
const sourceHash = createHash("sha256").update(code).digest("hex");
const confirmation = `deploy-and-smoke-v2-${sourceHash.slice(0, 12)}`;
assert.equal(process.env.VERISTEP_BRADBURY_V2_CONFIRM, confirmation, `Explicit release confirmation required: ${confirmation}`);

const clients = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, createClient({ chain: testnetBradbury, account })]));
const publicClient = createPublicClient({ chain: testnetBradbury, transport: http() });
const evmWallets = Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, createWalletClient({
  chain: testnetBradbury,
  account: privateKeyToAccount(key),
  transport: http(),
})]));
assert.equal(await retryRead("chain-id", () => clients.client.getChainId()), 4221, "Bradbury chain guard failed");

await mkdir(reportDir, { recursive: true });
let manifest = await exists(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : {
      version: "veristep-v2-bradbury-release-1",
      network: "testnet-bradbury",
      chainId: 4221,
      sourceHash,
      evidenceCommit,
      wallets: Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, account.address])),
      steps: {},
      startedAt: new Date().toISOString(),
      limitations: ["Public testnet GEN only; this release run is evidence of execution, not hackathon acceptance."],
    };
assert.equal(manifest.chainId, 4221);
assert.equal(manifest.sourceHash, sourceHash, "Saved release belongs to another contract source");
assert.equal(manifest.evidenceCommit, evidenceCommit, "Saved release evidence commit changed");
for (const role of ["client", "A", "B"]) assert.equal(manifest.wallets[role].toLowerCase(), accounts[role].address.toLowerCase(), `Saved ${role} wallet changed`);
const save = () => writeFile(manifestPath, stringify(manifest));
await save();

async function submitWithNonceGuard(name, account, readNonce, submit) {
  const before = await retryRead(`${name}:nonce-before`, () => readNonce(account.address));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await submit();
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
      await sleep(attempt * 2000);
      const after = await retryRead(`${name}:nonce-after`, () => readNonce(account.address));
      if (after !== before) throw new Error(`${name} submission uncertain: nonce advanced from ${before} to ${after}; refusing to resend`, { cause: error });
      if (attempt === 3) throw error;
      console.warn(JSON.stringify({ retry: `${name}:submit`, attempt, nonce: before.toString() }));
    }
  }
  throw new Error(`${name} submission retry exhausted`);
}

async function waitGenFinal(name, client, item) {
  for (let attempt = 0; attempt < 480; attempt += 1) {
    const receipt = await retryRead(`${name}:receipt`, () => client.getTransaction({ hash: item.hash }));
    await writeFile(resolve(reportDir, `${name}.receipt.json`), stringify(receipt));
    const status = statusName(receipt);
    if (attempt % 6 === 0 || ["FINALIZED", "READY_TO_FINALIZE", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(status)) {
      console.log(JSON.stringify({ step: name, status, execution: executionName(receipt) }));
    }
    if (["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(status)) throw new Error(`${name} reached terminal ${status}`);
    if (status === "FINALIZED") {
      assertExecution(receipt, true);
      return receipt;
    }
    if (status === "READY_TO_FINALIZE" && !item.finalization?.hash) {
      item.finalization = { phase: "SIGNING", startedAt: new Date().toISOString() };
      await save();
      const hash = await submitWithNonceGuard(
        `${name}:finalize`,
        accounts.client,
        (address) => publicClient.getTransactionCount({ address, blockTag: "pending" }),
        () => clients.client.finalizeTransaction({ txId: item.hash }),
      );
      Object.assign(item.finalization, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
      await save();
    }
    if (item.finalization?.hash && item.finalization.phase !== "CONFIRMED") {
      try {
        const finalizationReceipt = await publicClient.getTransactionReceipt({ hash: item.finalization.hash });
        assert.equal(finalizationReceipt.status, "success", `${name} finalization reverted`);
        Object.assign(item.finalization, { phase: "CONFIRMED", confirmedAt: new Date().toISOString(), blockHash: finalizationReceipt.blockHash });
        await save();
      } catch (error) {
        if (!/not found|could not be found/i.test(String(error?.shortMessage ?? error?.message))) throw error;
      }
    }
    await sleep(10_000);
  }
  throw new Error(`${name} did not finalize in the bounded window`);
}

async function genStep(name, role, submit) {
  let item = manifest.steps[name];
  if (!item?.hash) {
    item ??= manifest.steps[name] = { kind: "GENLAYER", phase: "SIGNING", startedAt: new Date().toISOString() };
    const currentNonce = await retryRead(`${name}:checkpoint-nonce`, () => clients[role].getTransactionCount({
      address: accounts[role].address,
      blockTag: "pending",
    }));
    if (item.nonceBefore === undefined) {
      item.nonceBefore = name === "deploy-contract"
        ? (await retryRead(`${name}:initial-latest-nonce`, () => clients[role].getTransactionCount({
            address: accounts[role].address,
            blockTag: "latest",
          }))).toString()
        : currentNonce.toString();
      item.nonceCheckpointedAt = new Date().toISOString();
      await save();
    }
    if (name === "deploy-contract") {
      const latestNonce = await retryRead(`${name}:latest-nonce`, () => clients[role].getTransactionCount({
        address: accounts[role].address,
        blockTag: "latest",
      }));
      const checkpoint = BigInt(item.nonceBefore);
      const latest = BigInt(latestNonce);
      const pending = BigInt(currentNonce);
      assert.equal(latest, checkpoint, `${name} confirmed nonce advanced while hash was unavailable; refusing automatic recovery`);
      assert.ok(
        pending === checkpoint || pending === checkpoint + 1n,
        `${name} pending nonce moved beyond the single known deploy attempt; refusing automatic recovery`,
      );
      item.recovery = pending === checkpoint + 1n
        ? "Replacing the single hashless deploy attempt at its exact nonce with a 2x gas price."
        : "No pending deploy remained; reusing the unchanged confirmed nonce.";
      await save();
    } else {
      assert.equal(currentNonce.toString(), item.nonceBefore, `${name} signer nonce advanced while hash was unavailable; manual recovery required`);
    }
    await save();
    const hash = await submitWithNonceGuard(
      name,
      accounts[role],
      (address) => clients[role].getTransactionCount({ address, blockTag: "pending" }),
      submit,
    );
    Object.assign(item, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
    await save();
    console.log(JSON.stringify({ step: name, submitted: hash }));
  }
  assert.ok(item.hash, `Uncertain ${name} submission has no saved hash`);
  if (!item.finalized) {
    const receipt = await waitGenFinal(name, clients[role], item);
    Object.assign(item, {
      finalized: true,
      phase: "FINALIZED_SUCCESS",
      execution: executionName(receipt),
      to: receipt.to_address ?? receipt.recipient ?? receipt.data?.contract_address,
      finishedAt: new Date().toISOString(),
    });
    await save();
  }
  return item;
}

async function evmStep(name, role, submit) {
  let item = manifest.steps[name];
  if (!item?.hash) {
    item ??= manifest.steps[name] = { kind: "EVM", phase: "SIGNING", startedAt: new Date().toISOString() };
    const currentNonce = await retryRead(`${name}:checkpoint-nonce`, () => publicClient.getTransactionCount({
      address: accounts[role].address,
      blockTag: "pending",
    }));
    if (item.nonceBefore === undefined) {
      item.nonceBefore = currentNonce.toString();
      item.nonceCheckpointedAt = new Date().toISOString();
      await save();
    }
    assert.equal(currentNonce.toString(), item.nonceBefore, `${name} signer nonce advanced while hash was unavailable; manual recovery required`);
    await save();
    const hash = await submitWithNonceGuard(
      name,
      accounts[role],
      (address) => publicClient.getTransactionCount({ address, blockTag: "pending" }),
      submit,
    );
    Object.assign(item, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
    await save();
    console.log(JSON.stringify({ step: name, submitted: hash }));
  }
  assert.ok(item.hash, `Uncertain ${name} EVM submission has no saved hash`);
  if (!item.finalized) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: item.hash, confirmations: 1, timeout: 300_000 });
    assert.equal(receipt.status, "success", `${name} reverted`);
    await writeFile(resolve(reportDir, `${name}.receipt.json`), stringify(receipt));
    Object.assign(item, { finalized: true, phase: "FINALIZED_SUCCESS", to: receipt.contractAddress, blockHash: receipt.blockHash, finishedAt: new Date().toISOString() });
    await save();
  }
  return item;
}

const clientBalance = await retryRead("client-balance", () => publicClient.getBalance({ address: accounts.client.address }));
assert.ok(clientBalance >= parseEther("1"), `Insufficient Bradbury balance: ${formatEther(clientBalance)} GEN`);
for (const role of ["A", "B"]) {
  const target = parseEther("0.05");
  const balance = await retryRead(`${role}:balance`, () => publicClient.getBalance({ address: accounts[role].address }));
  if (balance < target) await evmStep(`fund-${role.toLowerCase()}`, "client", () => evmWallets.client.sendTransaction({ to: accounts[role].address, value: target - balance }));
}

const buildResult = await solidity.build([
  fileURLToPath(new URL("../contracts/VeriStepReceiptRouter.sol", import.meta.url)),
], { force: true, quiet: true, cleanupArtifacts: true });
assert.ok(solidity.isSuccessfulBuildResult(buildResult), "Receipt router compile failed");
const routerArtifact = await artifacts.readArtifact("VeriStepReceiptRouter");
if (!manifest.router) {
  const routerDeployment = await evmStep("deploy-router", "client", () => evmWallets.client.deployContract({ abi: routerArtifact.abi, bytecode: routerArtifact.bytecode }));
  manifest.router = routerDeployment.to;
  assert.match(manifest.router ?? "", /^0x[0-9a-fA-F]{40}$/, "Router address missing");
  await save();
}
const routerCode = await publicClient.getCode({ address: manifest.router });
assert.ok(routerCode && routerCode !== "0x", "Router bytecode missing on Bradbury");

async function deployV2Bounded() {
  // Use the SDK's public calldata/transaction serializers and the chain's
  // official addTransaction ABI, while signing the outer legacy transaction
  // explicitly. This makes the exact nonce, gas and replacement policy
  // auditable; mutating an already-created SDK client does not alter the
  // closures captured by deployContract().
  const constructor = genlayerAbi.calldata.encode(
    genlayerAbi.calldata.makeCalldataObject(undefined, [manifest.router], undefined),
  );
  const txData = genlayerAbi.transactions.serialize([code, constructor, false]);
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const encodedData = encodeFunctionData({
    abi: testnetBradbury.consensusMainContract.abi,
    functionName: "addTransaction",
    args: [
      accounts.client.address,
      zeroAddress,
      testnetBradbury.defaultNumberOfInitialValidators,
      3n,
      txData,
      validUntil,
    ],
  });
  const estimate = await publicClient.estimateGas({
    account: accounts.client.address,
    to: testnetBradbury.consensusMainContract.address,
    data: encodedData,
  });
  const gasLimit = estimate + 200_000n;
  assert.ok(gasLimit <= 25_000_000n, `Bradbury deploy gas ${gasLimit} exceeds the 25M transaction cap`);
  const checkpoint = BigInt(manifest.steps["deploy-contract"].nonceBefore);
  const gasPrice = (await publicClient.getGasPrice()) * 2n;
  const outerHash = await evmWallets.client.sendTransaction({
    to: testnetBradbury.consensusMainContract.address,
    data: encodedData,
    nonce: Number(checkpoint),
    gas: gasLimit,
    gasPrice,
    type: "legacy",
  });
  const outerReceipt = await publicClient.waitForTransactionReceipt({ hash: outerHash, confirmations: 1, timeout: 300_000 });
  assert.equal(outerReceipt.status, "success", `Bradbury deploy outer transaction reverted: ${outerHash}`);
  const events = parseEventLogs({ abi: testnetBradbury.consensusMainContract.abi, logs: outerReceipt.logs });
  const created = events.find((event) => event.eventName === "NewTransaction" || event.eventName === "CreatedTransaction");
  const txId = created?.args?.txId;
  assert.match(txId ?? "", /^0x[0-9a-fA-F]{64}$/, `Bradbury deploy outer transaction emitted no GenLayer tx id: ${outerHash}`);
  manifest.deployGasPolicy = {
    sdk: "genlayer-js@1.1.8 public abi.calldata + abi.transactions",
    estimate: estimate.toString(),
    limit: gasLimit.toString(),
    cap: "25000000",
    gasPriceMultiplier: "2",
    nonce: checkpoint.toString(),
    outerHash,
  };
  await writeFile(resolve(reportDir, "deploy-contract.outer-receipt.json"), stringify(outerReceipt));
  await save();
  return txId;
}

const deployment = await genStep("deploy-contract", "client", deployV2Bounded);
manifest.contract ??= deployment.to;
assert.match(manifest.contract ?? "", /^0x[0-9a-fA-F]{40}$/, "V2 contract address missing");
await save();
const address = manifest.contract;
const deployedCode = await retryRead("contract-code", () => clients.client.getContractCode(address));
const deployedText = typeof deployedCode === "string" ? deployedCode : new TextDecoder().decode(deployedCode);
assert.equal(createHash("sha256").update(deployedText).digest("hex"), sourceHash, "Bradbury contract source hash mismatch");
const capabilities = JSON.parse(await retryRead("capabilities", () => clients.client.readContract({ address, functionName: "get_capabilities", args: [] })));
assert.deepEqual(
  { version: capabilities.version, status: capabilities.status, router: capabilities.router.toLowerCase() },
  { version: "veristep-2.0-rc", status: "RELEASE_CANDIDATE", router: manifest.router.toLowerCase() },
  "Bradbury capability manifest mismatch",
);
manifest.contractVerified = true;
manifest.routerVerified = true;
await save();

const githubHeaders = { accept: "application/vnd.github+json", "user-agent": "VeriStep-v2-Bradbury-release" };
const githubJson = async (path) => {
  const response = await retryRead(`github:${path}`, () => fetch(`https://api.github.com${path}`, { headers: githubHeaders, redirect: "manual" }));
  assert.equal(response.status, 200, `GitHub ${path} returned ${response.status}`);
  assert.ok(response.headers.get("content-type")?.toLowerCase().startsWith("application/json"), "GitHub content type mismatch");
  return response.json();
};
const repo = await githubJson(`/repos/${owner}/${repository}`);
assert.deepEqual({ id: repo.id, owner_id: repo.owner?.id, full_name: repo.full_name }, { id: origin.repository_id, owner_id: origin.owner_id, full_name: `${owner}/${repository}` });
const tree = await githubJson(`/repos/${owner}/${repository}/git/trees/${evidenceCommit}?recursive=1`);
assert.equal(tree.truncated, false, "GitHub evidence tree truncated");
const commitments = {};
for (const [role, path] of Object.entries(evidencePaths)) {
  const entry = tree.tree.find((item) => item.path === path);
  assert.deepEqual({ type: entry?.type, mode: entry?.mode }, { type: "blob", mode: "100644" }, `${role} tree identity mismatch`);
  const blob = await githubJson(`/repos/${owner}/${repository}/git/blobs/${entry.sha}`);
  assert.equal(blob.encoding, "base64", `${role} blob encoding mismatch`);
  const bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
  assert.equal(bytes.length, entry.size, `${role} blob size mismatch`);
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

const fee = parseEther("0.01"), bond = parseEther("0.005"), penalty = parseEther("0.003");
const terms = {
  workers: { A: accounts.A.address, B: accounts.B.address },
  origins: { SOURCE: origin, A: origin, B: origin },
  source: commitments.SOURCE,
  money: {
    A: { fee: fee.toString(), bond: bond.toString(), penalty: penalty.toString() },
    B: { fee: fee.toString(), bond: bond.toString(), penalty: penalty.toString() },
  },
  windows: { accept: 86400, step: 86400, review: 86400, adjudication: 86400 },
  max_revisions: 0,
  semantic_obligations: [
    { id: "SEM_A_POLICY_ACCURACY", stage: "A", statement: "Stage A must preserve every export-policy rule in SOURCE, including the final exception.", evidence_ids: ["SOURCE", "A"] },
    { id: "SEM_B_FAITHFUL_HANDOFF", stage: "B", statement: "Stage B must faithfully preserve A without weakening, contradicting or inventing a material claim.", evidence_ids: ["A", "B"] },
  ],
};
manifest.dealId ??= `bradbury-v2-happy-${sourceHash.slice(0, 8)}`;
await save();
const readDeal = () => retryRead("read-deal", async () => JSON.parse(await clients.client.readContract({ address, functionName: "get_terms", args: [manifest.dealId] })));
const write = (name, role, functionName, args, value = 0n) => genStep(name, role, () => clients[role].writeContract({
  address,
  functionName,
  args,
  value,
  leaderOnly: false,
  consensusMaxRotations: 3,
}));

await write("create-terms", "client", "create_terms", [manifest.dealId, JSON.stringify(terms)]);
let deal = await readDeal();
assert.equal(deal.deal_id, manifest.dealId);
await write("fund-terms", "client", "fund_terms", [manifest.dealId, deal.terms_hash], fee * 2n);
await write("accept-a", "A", "accept_work", [manifest.dealId, deal.terms_hash], bond);
await write("accept-b", "B", "accept_work", [manifest.dealId, deal.terms_hash], bond);
deal = await readDeal();
await write("submit-a", "A", "submit_artifact", [manifest.dealId, JSON.stringify(commitments.A), deal.artifacts.SOURCE.submission_id]);
deal = await readDeal();
await write("submit-b", "B", "submit_artifact", [manifest.dealId, JSON.stringify(commitments.B), deal.artifacts.A.submission_id]);
await write("request-review", "client", "request_review", [manifest.dealId]);
await write("resolve-review", "client", "resolve_review", [manifest.dealId]);
deal = await readDeal();
assert.equal(deal.status, "SETTLEMENT_PENDING", `Review did not reach settlement: ${deal.status}`);
assert.deepEqual(deal.report.score, { A: 10000, B: 10000 }, "Bradbury semantic review did not satisfy the frozen obligations");
const obligationIds = deal.manifest.obligations.map((item) => item.id).sort();
assert.deepEqual(deal.report.obligation_assessments.map((item) => item.obligation_id).sort(), obligationIds, "Bradbury report obligation set mismatch");
assert.equal(deal.report.source_assessments.length, 3);
assert.ok(deal.report.evidence_citations.length >= 4, "Bradbury report citations missing");
await writeFile(resolve(reportDir, "semantic-report.json"), stringify(deal.report));

const routerRead = getContract({ address: manifest.router, abi: routerArtifact.abi, client: publicClient });
const roleByAddress = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [account.address.toLowerCase(), role]));
for (const initialLeg of deal.settlement_legs) {
  await write(`route-${initialLeg.sequence}`, "client", "route_settlement", [manifest.dealId, initialLeg.id]);
  deal = await readDeal();
  const leg = deal.settlement_legs.find((item) => item.id === initialLeg.id);
  assert.equal(leg.state, "ROUTED");
  assert.equal(await routerRead.read.receiptState([address, `0x${leg.receipt_id}`]), 1, "Router did not persist exact funded receipt");
  const role = roleByAddress[leg.recipient.toLowerCase()];
  assert.ok(role === "A" || role === "B" || role === "client", `No recipient signer for ${leg.recipient}`);
  const balanceBefore = await publicClient.getBalance({ address: leg.recipient });
  const routerBalanceBefore = await publicClient.getBalance({ address: manifest.router });
  const router = getContract({ address: manifest.router, abi: routerArtifact.abi, client: { public: publicClient, wallet: evmWallets[role] } });
  const release = await evmStep(`release-${leg.sequence}`, role, () => router.write.release([address, `0x${leg.receipt_id}`]));
  const releaseReceipt = JSON.parse(await readFile(resolve(reportDir, `release-${leg.sequence}.receipt.json`), "utf8"));
  const balanceAfter = await publicClient.getBalance({ address: leg.recipient });
  const routerBalanceAfter = await publicClient.getBalance({ address: manifest.router });
  assert.equal(routerBalanceBefore - routerBalanceAfter, BigInt(leg.amount), "Router balance delta does not equal receipt amount");
  const gas = BigInt(releaseReceipt.gasUsed) * BigInt(releaseReceipt.effectiveGasPrice);
  assert.equal(balanceAfter - balanceBefore + gas, BigInt(leg.amount), "Recipient balance plus gas does not equal released amount");
  assert.equal(await routerRead.read.receiptState([address, `0x${leg.receipt_id}`]), 2, "Router receipt is not released");
  await write(`confirm-${leg.sequence}`, "client", "confirm_settlement", [manifest.dealId, leg.id]);
  manifest.steps[`release-${leg.sequence}`].proof = {
    recipient: leg.recipient,
    amount: leg.amount,
    receiptId: leg.receipt_id,
    transaction: release.hash,
    routerBalanceDelta: (routerBalanceBefore - routerBalanceAfter).toString(),
    recipientNetDelta: (balanceAfter - balanceBefore).toString(),
    gas: gas.toString(),
  };
  await save();
}
deal = await readDeal();
assert.equal(deal.status, "COMPLETED");
assert.equal(deal.ledger.received, deal.ledger.routed);
assert.equal(deal.ledger.received, deal.ledger.confirmed);
assert.ok(deal.settlement_legs.every((leg) => leg.state === "CONFIRMED"));
await writeFile(resolve(reportDir, "final-deal.json"), stringify(deal));
manifest.completedAt = new Date().toISOString();
manifest.result = { passed: true, contract: address, router: manifest.router, dealId: manifest.dealId, status: deal.status, score: deal.report.score, legs: deal.settlement_legs.length };
await save();
console.log(JSON.stringify(manifest.result));
