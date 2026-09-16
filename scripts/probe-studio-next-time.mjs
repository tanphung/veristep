import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rpc = "https://studio-next.genlayer.com/api";
const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [rpc] } } };
const reportDir = resolve(root, "reports", "studio-next-time-probe");
const reportPath = resolve(reportDir, "report.json");
const codePath = resolve(root, "contracts", "studio_next_time_probe.py");
const secretsPath = resolve(root, ".secrets", "studio-next-wallets.json");
const deadline = 1789487114;
const dealId = "v2-studio-a-fault-358323c";
const veristepContract = "0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b";
const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const iso = (seconds) => new Date(seconds * 1000).toISOString();
const safeError = (error) => ({
  name: error?.name ?? "Error",
  message: [error?.shortMessage, error?.message, error?.cause?.message].find((item) => typeof item === "string")?.match(/\b[A-Z][A-Z0-9_]{2,}\b/)?.at(-1) ?? "SIMULATION_REJECTED",
});

const code = new Uint8Array(await readFile(codePath));
const sourceHash = createHash("sha256").update(code).digest("hex");
const secrets = JSON.parse(await readFile(secretsPath, "utf8"));
const account = createAccount(secrets.CLIENT_PRIVATE_KEY);
const client = createClient({ chain, endpoint: rpc, account });
assert.equal(await client.getChainId(), 61997, "Studio Next chain guard failed");
await mkdir(reportDir, { recursive: true });

let report = {
  version: "studio-next-time-probe-1",
  mode: "INDEPENDENT_PROBE_WITH_NO_VERISTEP_TIMEOUT_BROADCAST",
  network: "studio-next",
  chainId: 61997,
  veristep: { contract: veristepContract, dealId, deadline: { unixSeconds: deadline, iso8601: iso(deadline) } },
  probe: { source: "contracts/studio_next_time_probe.py", sourceHash, contract: null, deploymentHash: null },
  steps: {},
  startedAt: new Date().toISOString(),
};
try { report = JSON.parse(await readFile(reportPath, "utf8")); } catch { /* first run */ }
const save = async () => writeFile(reportPath, json(report) + "\n");

if (!report.probe || report.probe.sourceHash !== sourceHash) {
  throw new Error("Probe source identity changed; create a new report directory instead of replacing a probe deployment");
}
if (!report.probe.contract) {
  const schema = await client.getContractSchemaForCode(code);
  report.steps.schema = { passed: true, methods: Object.keys(schema.methods ?? {}) };
  const fees = await client.estimateTransactionFees();
  report.steps.deploy = { phase: "SIGNING", feeValue: String(fees.feeValue), distribution: JSON.parse(json(fees.distribution)) };
  await save();
  const hash = await client.deployContract({ code, args: [], fees: { distribution: fees.distribution, feeValue: fees.feeValue } });
  report.probe.deploymentHash = hash;
  report.steps.deploy = { ...report.steps.deploy, phase: "SUBMITTED", hash };
  await save();
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "finalized", retries: 240, interval: 1000 });
  report.steps.deploy = { ...report.steps.deploy, phase: isSuccessful(receipt) ? "FINALIZED_SUCCESS" : "FINALIZED_ERROR", finalized: true, execution: receipt.execution_result ?? null };
  assert.equal(isSuccessful(receipt), true, "Probe deployment did not finish successfully");
  const address = receipt.txDataDecoded?.contractAddress ?? receipt.data?.contract_address;
  assert.match(address ?? "", /^0x[0-9a-fA-F]{40}$/, "Probe deployment receipt has no contract address");
  report.probe.contract = address;
  await save();
}

const latest = await client.getBlock({ blockTag: "latest" });
let capturedParams = null;
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input, init) => {
    try {
      const request = JSON.parse(String(init?.body ?? ""));
      if (request?.method === "sim_call") capturedParams = structuredClone(request.params?.[0] ?? null);
    } catch { /* a non-RPC fetch is irrelevant to this capture */ }
    return originalFetch(input, init);
  };
  const simulated = await client.simulateWriteContract({
    address: report.probe.contract,
    functionName: "probe",
    includeReceipt: true,
  });
  const values = JSON.parse(simulated.result);
  assert.equal(typeof values["gl.message_raw.datetime"], "string", "Probe did not return gl.message.raw datetime");
  assert.equal(typeof values["time.time"], "number", "Probe did not return time.time");
  report.steps.sdkSimulation = { outcome: "RETURNED", values, receiptExecution: simulated.receipt?.execution_result ?? null };
} catch (error) {
  report.steps.sdkSimulation = { outcome: "REJECTED", error: safeError(error) };
} finally {
  globalThis.fetch = originalFetch;
}
await save();
assert.ok(capturedParams, "SDK simulation did not expose an exact sim_call request");
const response = await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: "studio-next-time-probe", method: "sim_call", params: [capturedParams] }),
});
const raw = await response.json();
report.steps.rawSimCall = {
  httpStatus: response.status,
  rpcCode: raw?.error?.code ?? null,
  hasResult: Object.hasOwn(raw ?? {}, "result"),
  sameRequestAsSdk: true,
};
const values = report.steps.sdkSimulation.values;
const messageDatetimeMs = Date.parse(values?.["gl.message_raw.datetime"] ?? "");
const messageDatetime = Number.isNaN(messageDatetimeMs) ? null : Math.floor(messageDatetimeMs / 1000);
const timeTime = values?.["time.time"];
report.comparison = {
  unit: "Unix seconds (message datetime parsed from ISO 8601)",
  probeMessageDatetime: { raw: values?.["gl.message_raw.datetime"] ?? null, unixSeconds: messageDatetime },
  probeTimeTime: timeTime,
  rpcLatestBlock: { unixSeconds: Number(latest.timestamp), iso8601: iso(Number(latest.timestamp)) },
  veristepDeadline: { unixSeconds: deadline, iso8601: iso(deadline) },
  predicateAtProbe: messageDatetime === null ? "UNKNOWN" : `${messageDatetime} >= ${deadline} is ${messageDatetime >= deadline}`,
  deltaProbeMinusDeadlineSeconds: messageDatetime === null ? null : messageDatetime - deadline,
};
report.incident = {
  expected: "The independent probe returns both gl.message.raw['datetime'] and time.time() through the SDK sim_call path, then the same raw sim_call request succeeds.",
  actual: report.steps.sdkSimulation.outcome === "RETURNED" && report.steps.rawSimCall.httpStatus === 200 && report.steps.rawSimCall.rpcCode === null ? "Probe completed." : "Probe did not complete; see recorded first failure point.",
  firstFailurePoint: report.steps.sdkSimulation.outcome === "RETURNED" ? null : "Independent probe SDK simulation",
  evidence: ["Probe is a separate state-free contract.", "VeriStep advance_timeout was not simulated or broadcast by this script.", "The raw RPC call reuses the SDK-captured sim_call params."],
  rootCause: report.steps.sdkSimulation.outcome === "RETURNED" ? "ROOT_CAUSE_CONFIRMED" : "ROOT_CAUSE_UNKNOWN",
};
report.finishedAt = new Date().toISOString();
await save();
console.log(json({ probe: report.probe, comparison: report.comparison, rawSimCall: report.steps.rawSimCall, incident: report.incident }));
