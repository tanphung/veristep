import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient, deriveInternalMessageCallKey, encodeInternalMessageFeeParams } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { executionName, statusName } from "./receipts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportName = "studio-next-agent-tank";
const reportDir = resolve(root, "reports", reportName);
const manifestPath = resolve(reportDir, "manifest.json");
const secretsPath = resolve(root, ".secrets", "studio-next-wallets.json");
const rpc = "https://studio-next.genlayer.com/api";
const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [rpc] } } };
const contract = "0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b";
const deals = [
  { id: "v2-studio-a-fault-358323c", prefix: "a-fault" },
  { id: "v2-studio-a-fault-r1-358323c", prefix: "a-fault-recovery-1" },
  { id: "v2-studio-a-fault-r2-358323c", prefix: "a-fault-recovery-2" },
  { id: "v2-studio-b-fault-358323c", prefix: "b-fault" },
];
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const stringify = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const terminalFailure = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);
const safeErrorMessage = (error) => {
  const candidate = [error?.details, error?.shortMessage, error?.message]
    .find((value) => typeof value === "string") ?? "";
  const codes = candidate.match(/\b[A-Z][A-Z0-9_]{2,}\b/g);
  return codes?.at(-1) ?? "RPC_SUBMISSION_REJECTED";
};
const publicError = (error) => ({
  name: error?.name ?? "Error",
  message: safeErrorMessage(error),
  code: error?.code ?? error?.cause?.code ?? null,
});
process.on("uncaughtException", (error) => {
  console.error(JSON.stringify({ fatal: publicError(error) }));
  process.exitCode = 1;
});
const internalTransferAllocation = (recipient) => ({
  messageType: 1,
  onAcceptance: false,
  recipient,
  callKey: deriveInternalMessageCallKey(),
  budget: 120000000000010352n,
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

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const walletSecrets = JSON.parse(await readFile(secretsPath, "utf8"));
const client = createClient({
  chain,
  endpoint: rpc,
  account: createAccount(walletSecrets.CLIENT_PRIVATE_KEY),
});
assert.equal(await client.getChainId(), 61997, "Studio Next chain guard failed");
assert.equal(manifest.contract.toLowerCase(), contract.toLowerCase(), "Manifest contract guard failed");
const save = () => writeFile(manifestPath, stringify(manifest));
const readDeal = async (dealId) => JSON.parse(await client.readContract({ address: contract, functionName: "get_terms", args: [dealId] }));

async function transaction(name, submit) {
  let step = manifest.steps[name];
  if (!step || (step.phase === "REJECTED_BEFORE_HASH" && step.nonceBefore === step.nonceAfter)) {
    step = manifest.steps[name] = { phase: "SIGNING", startedAt: new Date().toISOString() };
    await save();
    const nonceBefore = await client.getTransactionCount({ address: client.account.address, blockTag: "pending" });
    try {
      const hash = await submit();
      Object.assign(step, { hash, phase: "PENDING", submittedAt: new Date().toISOString() });
      await save();
      console.log(JSON.stringify({ step: name, submitted: hash }));
    } catch (error) {
      const nonceAfter = await client.getTransactionCount({ address: client.account.address, blockTag: "pending" });
      Object.assign(step, {
        phase: "REJECTED_BEFORE_HASH",
        error: safeErrorMessage(error),
        nonceBefore: nonceBefore.toString(),
        nonceAfter: nonceAfter.toString(),
        finishedAt: new Date().toISOString(),
      });
      await save();
      if (nonceAfter !== nonceBefore) throw new Error(`${name} nonce advanced without a hash; inspect before any retry`);
      throw error;
    }
  }
  assert.match(step.hash ?? "", /^0x[0-9a-f]{64}$/i, `${name} has no persisted hash; do not resend`);
  if (step.finalized) {
    assert.equal(step.phase, "FINALIZED_SUCCESS", `${name} previously finalized unsuccessfully`);
    return step;
  }
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await sleep(5000);
    const receipt = await client.getTransaction({ hash: step.hash });
    await writeFile(resolve(reportDir, `${name}.receipt.json`), stringify(receipt));
    const lifecycle = statusName(receipt);
    if (attempt % 6 === 0 || lifecycle === "FINALIZED" || terminalFailure.has(lifecycle)) {
      console.log(JSON.stringify({ step: name, status: lifecycle, execution: executionName(receipt) }));
    }
    if (terminalFailure.has(lifecycle)) {
      Object.assign(step, { finalized: true, phase: lifecycle, execution: executionName(receipt), finishedAt: new Date().toISOString() });
      await save();
      throw new Error(`${name} reached terminal ${lifecycle}`);
    }
    if (lifecycle !== "FINALIZED") continue;
    const execution = executionName(receipt);
    Object.assign(step, {
      finalized: true,
      phase: execution === "FINISHED_WITH_RETURN" ? "FINALIZED_SUCCESS" : "FINALIZED_ERROR",
      execution,
      finishedAt: new Date().toISOString(),
    });
    await save();
    assert.equal(execution, "FINISHED_WITH_RETURN", `${name} finalized with ${execution}`);
    return step;
  }
  throw new Error(`${name} did not finalize within polling budget; hash is persisted and must not be resent`);
}

async function write(name, functionName, args, feeOptions = {}) {
  return transaction(name, async () => {
    const call = { address: contract, functionName, args };
    const estimate = await client.estimateTransactionFeesForWrite({ ...call, ...feeOptions });
    manifest.feeProfiles ??= {};
    manifest.feeProfiles[name] = {
      feeValue: String(estimate.feeValue),
      distribution: JSON.parse(stringify(estimate.distribution)),
      ...(estimate.messageAllocations ? { messageAllocations: JSON.parse(stringify(estimate.messageAllocations)) } : {}),
    };
    await save();
    return client.writeContract({
      ...call,
      fees: {
        distribution: estimate.distribution,
        ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}),
        feeValue: estimate.feeValue,
      },
    });
  });
}

for (const target of deals) {
  let deal = await readDeal(target.id);
  if (deal.status === "REVIEW_REQUESTED") {
    const latestBlock = await client.getBlock({ blockTag: "latest" });
    assert.ok(BigInt(latestBlock.timestamp) >= BigInt(deal.adjudication_deadline), `${target.id} adjudication deadline has not passed`);
    await write(`${target.prefix}-advance-timeout`, "advance_timeout", [target.id]);
    deal = await readDeal(target.id);
  }
  assert.equal(deal.status, "SETTLEMENT_PENDING", `${target.id} is not ready for neutral timeout settlement`);
  for (const leg of deal.settlement_legs) {
    if (leg.state === "DISPATCHED_UNVERIFIED") continue;
    const legSlug = leg.id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await write(`${target.prefix}-timeout-route-${legSlug}`, "route_settlement", [target.id, leg.id], {
      messageAllocations: [internalTransferAllocation(leg.recipient)],
    });
    deal = await readDeal(target.id);
    const updated = deal.settlement_legs.find((item) => item.id === leg.id);
    assert.equal(updated?.state, "DISPATCHED_UNVERIFIED", `${target.id}/${leg.id} was not dispatched`);
  }
  await writeFile(resolve(reportDir, `${target.prefix}.timeout-deal.json`), stringify(deal));
  manifest.timeoutCleanup ??= {};
  manifest.timeoutCleanup[target.id] = {
    prefix: target.prefix,
    status: deal.status,
    legs: deal.settlement_legs.map((leg) => ({ id: leg.id, state: leg.state, amount: leg.amount, recipient: leg.recipient })),
    completedAt: new Date().toISOString(),
  };
  await save();
  console.log(JSON.stringify({ deal: target.id, neutralTimeoutCleanup: true, legs: deal.settlement_legs.map((leg) => ({ id: leg.id, state: leg.state })) }));
}
