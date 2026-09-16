import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rpc = "https://studio-next.genlayer.com/api";
const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [rpc] } } };
const contract = "0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b";
const reportDir = resolve(root, "reports", "studio-next-agent-tank");
const manifestPath = resolve(reportDir, "manifest.json");
const secretsPath = resolve(root, ".secrets", "studio-next-wallets.json");
const releasePath = resolve(root, "contracts", "veristep_release.py");
const dealIds = [
  "v2-studio-a-fault-r2-358323c",
  "v2-studio-b-fault-358323c",
  "v2-studio-b-fault-r1-358323c",
];
const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const codeTokens = (value, found = new Set(), seen = new WeakSet()) => {
  if (typeof value === "string") {
    for (const token of value.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []) found.add(token);
    return found;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return found;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) if (!/secret|token|credential|config/i.test(key)) codeTokens(child, found, seen);
  return found;
};
const safeError = (error) => ({
  name: error?.name ?? "Error",
  codes: [...codeTokens({ message: error?.message, cause: error?.cause?.message, receipt: error?.cause?.data?.receipt })].sort(),
});

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.contract.toLowerCase(), contract.toLowerCase(), "Manifest contract mismatch");
const secrets = JSON.parse(await readFile(secretsPath, "utf8"));
const client = createClient({ chain, endpoint: rpc, account: createAccount(secrets.CLIENT_PRIVATE_KEY) });
assert.equal(await client.getChainId(), 61997, "Studio Next chain guard failed");
const deployed = await client.getContractCode(contract);
assert.equal(createHash("sha256").update(deployed).digest("hex"), createHash("sha256").update(await readFile(releasePath)).digest("hex"), "Deployed source identity mismatch");
const latest = await client.getBlock({ blockTag: "latest" });
const report = {
  mode: "READ_AND_SIMULATE_ONLY_NO_BROADCAST",
  contract,
  chainId: 61997,
  rpcLatestBlock: { timestampUnixSeconds: Number(latest.timestamp) },
  cases: [],
  startedAt: new Date().toISOString(),
};
for (const dealId of dealIds) {
  const deal = JSON.parse(await client.readContract({ address: contract, functionName: "get_terms", args: [dealId] }));
  let capturedParams = null;
  const originalFetch = globalThis.fetch;
  let sdk;
  try {
    globalThis.fetch = async (input, init) => {
      try {
        const request = JSON.parse(String(init?.body ?? ""));
        if (request?.method === "sim_call") capturedParams = structuredClone(request.params?.[0] ?? null);
      } catch { /* only the SDK RPC body is relevant */ }
      return originalFetch(input, init);
    };
    const simulated = await client.simulateWriteContract({ address: contract, functionName: "resolve_review", args: [dealId], includeReceipt: true });
    sdk = { outcome: "RETURNED", receiptExecution: simulated.receipt?.execution_result ?? null };
  } catch (error) {
    sdk = { outcome: "REJECTED", error: safeError(error) };
  } finally {
    globalThis.fetch = originalFetch;
  }
  let raw = { attempted: false };
  if (capturedParams) {
    const response = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `resolve-probe-${dealId}`, method: "sim_call", params: [capturedParams] }) });
    const body = await response.json();
    raw = { attempted: true, httpStatus: response.status, rpcCode: body?.error?.code ?? null, errorCodes: [...codeTokens(body?.error)].sort(), hasResult: Object.hasOwn(body ?? {}, "result") };
  }
  const firstFailurePoint = sdk.outcome === "RETURNED" ? null : "Direct SDK simulateWriteContract(resolve_review), reproduced with its exact raw sim_call request";
  report.cases.push({
    dealId,
    state: deal.status,
    expected: "REVIEW_REQUESTED resolves to the fixture's predetermined semantic outcome without emitting a transaction during this reproduction.",
    actual: sdk.outcome === "RETURNED" ? "Simulation returned." : "Simulation rejected; inspect safe error codes.",
    firstFailurePoint,
    evidence: { sourceIdentityVerified: true, sdk, rawSimCall: raw, noBroadcast: true },
    rootCause: sdk.outcome === "RETURNED" ? "ROOT_CAUSE_HYPOTHESIS" : "ROOT_CAUSE_UNKNOWN",
    rootCauseScope: sdk.outcome === "RETURNED"
      ? "The contract path is simulatable; a future recovery still requires a bounded decision about a new transaction after checking all existing manifest hashes."
      : "This direct reproduction excludes the app runner/frontend/worker from the first failing layer. Do not attribute a raw sim_call rejection to platform until contract, prompt, and evidence paths are further isolated.",
  });
}
report.finishedAt = new Date().toISOString();
await mkdir(reportDir, { recursive: true });
await writeFile(resolve(reportDir, "resolve-simulation-diagnostic.json"), json(report) + "\n");
console.log(json(report));
