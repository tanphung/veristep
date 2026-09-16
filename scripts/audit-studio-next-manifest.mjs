import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { executionName, statusName } from "./receipts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = resolve(root, "reports", "studio-next-agent-tank");
const manifestPath = resolve(reportDir, "manifest.json");
const contract = "0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b";
const rpc = "https://studio-next.genlayer.com/api";
const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [rpc] } } };
const terminalStatuses = new Set(["FINALIZED", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

const safeErrorMessage = (error) => {
  const candidate = [error?.details, error?.shortMessage, error?.message, error?.cause?.message]
    .find((value) => typeof value === "string") ?? "";
  const codes = candidate.match(/\b[A-Z][A-Z0-9_]{2,}\b/g);
  return codes?.at(-1) ?? "RPC_READ_FAILED";
};

process.on("uncaughtException", (error) => {
  console.error(JSON.stringify({ fatal: { name: error?.name ?? "Error", code: error?.code ?? null, message: safeErrorMessage(error) } }));
  process.exitCode = 1;
});

const stringify = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.network, "studio-next", "Manifest network is not Studio Next");
assert.equal(manifest.chainId, 61997, "Manifest chain ID is not Studio Next");
assert.equal(manifest.contract?.toLowerCase(), contract.toLowerCase(), "Manifest contract differs from the release contract");

const source = await readFile(resolve(root, "contracts", "veristep_release.py"), "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), manifest.sourceHash, "Local release source differs from the manifest");

const rows = Object.entries(manifest.steps ?? {});
const hashes = new Map();
const noHash = [];
for (const [name, step] of rows) {
  if (!step.hash) {
    noHash.push({ name, phase: step.phase ?? "UNKNOWN", error: step.error ?? null });
    continue;
  }
  assert.match(step.hash, /^0x[0-9a-f]{64}$/i, `${name} has an invalid transaction hash`);
  const previous = hashes.get(step.hash.toLowerCase());
  assert.equal(previous, undefined, `Duplicate transaction hash in manifest: ${previous} and ${name}`);
  hashes.set(step.hash.toLowerCase(), name);
}

const client = createClient({ chain, endpoint: rpc });
assert.equal(await client.getChainId(), 61997, "Studio Next RPC chain guard failed");
const deployedSource = await client.getContractCode(contract);
assert.equal(createHash("sha256").update(deployedSource).digest("hex"), manifest.sourceHash, "Deployed contract source differs from the manifest");

const receipts = [];
const entries = [...hashes.entries()];
for (let offset = 0; offset < entries.length; offset += 4) {
  const batch = entries.slice(offset, offset + 4);
  const current = await Promise.all(batch.map(async ([hash, name]) => {
    const receipt = await client.getTransaction({ hash });
    const lifecycle = statusName(receipt);
    assert.ok(terminalStatuses.has(lifecycle), `${name} is not terminal on chain: ${lifecycle}`);
    assert.equal(receipt.hash?.toLowerCase(), hash, `${name} receipt hash does not match the manifest`);
    return { name, hash, lifecycle, execution: executionName(receipt) };
  }));
  receipts.push(...current);
}

const countBy = (items, key) => Object.fromEntries(Object.entries(Object.groupBy(items, key)).map(([name, group]) => [name, group.length]));
const result = {
  auditedAt: new Date().toISOString(),
  contract,
  sourceHash: manifest.sourceHash,
  steps: rows.length,
  storedHashes: hashes.size,
  duplicateHashes: 0,
  nonTerminalReceipts: 0,
  noHash,
  lifecycleCounts: countBy(receipts, (item) => item.lifecycle),
  executionCounts: countBy(receipts, (item) => item.execution),
  receipts,
};
await writeFile(resolve(reportDir, "audit-latest.json"), stringify(result));
console.log(JSON.stringify({
  audit: "passed",
  steps: result.steps,
  storedHashes: result.storedHashes,
  duplicateHashes: result.duplicateHashes,
  nonTerminalReceipts: result.nonTerminalReceipts,
  noHash: result.noHash.map(({ name, phase }) => ({ name, phase })),
  lifecycleCounts: result.lifecycleCounts,
  executionCounts: result.executionCounts,
}));
