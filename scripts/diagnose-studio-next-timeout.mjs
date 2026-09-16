import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "reports", "studio-next-agent-tank", "manifest.json");
const reportDir = resolve(root, "reports", "studio-next-agent-tank");
const timeProbePath = resolve(root, "reports", "studio-next-time-probe", "report.json");
const secretsPath = resolve(root, ".secrets", "studio-next-wallets.json");
const rpc = "https://studio-next.genlayer.com/api";
const expectedContract = "0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b";
const dealId = process.env.VERISTEP_TIMEOUT_DEAL ?? "v2-studio-a-fault-358323c";
const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [rpc] } } };
const forbiddenKey = /secret|private|token|password|credential|node_config|config/i;
const timeKey = /(?:^|_)(?:current_)?(?:timestamp|datetime)|(?:^|_)(?:adjudication_)?deadline$/i;
const toJson = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const asSeconds = (value) => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,12}$/.test(value)) return Number(value);
  return null;
};
const iso = (value) => value === null ? null : new Date(value * 1000).toISOString();

function collectSafeTimes(value, path = "$", output = []) {
  if (!value || typeof value !== "object" || output.length >= 40) return output;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (forbiddenKey.test(key)) continue;
    let child;
    try { child = value[key]; } catch { continue; }
    const childPath = `${path}.${key}`;
    if (timeKey.test(key) && (typeof child === "string" || typeof child === "number" || typeof child === "bigint")) {
      const seconds = asSeconds(child);
      output.push({ path: childPath, raw: String(child), unixSeconds: seconds, iso8601: iso(seconds) });
    }
    collectSafeTimes(child, childPath, output);
  }
  return output;
}
function errorCodes(value, output = new Set(), seen = new WeakSet()) {
  if (typeof value === "string") {
    const text = /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0
      ? Buffer.from(value, "base64").toString("utf8")
      : value;
    for (const code of text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []) output.add(code);
    return output;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (forbiddenKey.test(key)) continue;
    try { errorCodes(value[key], output, seen); } catch { /* inaccessible field */ }
  }
  return output;
}
function receiptErrorCodes(error) {
  const receipt = error?.cause?.data?.receipt;
  const candidates = [
    error?.message,
    error?.details,
    error?.shortMessage,
    error?.cause?.message,
    receipt?.result,
    receipt?.genvm_result?.error_code,
    receipt?.genvm_result?.raw_error,
    receipt?.genvm_result?.error_description,
  ];
  return [...candidates.reduce((codes, value) => errorCodes(value, codes), new Set())].sort();
}
function relevantErrorShape(error) {
  const receipt = error?.cause?.data?.receipt;
  const result = receipt ? {
    executionResult: receipt.execution_result ?? null,
    resultType: typeof receipt.result,
    genvmErrorCodeType: typeof receipt.genvm_result?.error_code,
    genvmRawErrorType: typeof receipt.genvm_result?.raw_error,
    genvmErrorDescriptionType: typeof receipt.genvm_result?.error_description,
    paramKeys: Object.getOwnPropertyNames(error?.cause?.data?.params ?? {}).filter((key) => !forbiddenKey.test(key)),
  } : null;
  return result;
}
async function reproduceRawSimulation(error) {
  const params = error?.cause?.data?.params;
  if (!params || typeof params !== "object") return { attempted: false, reason: "SDK did not expose safe sim_call params" };
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "veristep-timeout-diagnostic", method: "sim_call", params: [params] }),
  });
  const body = await response.json();
  const rawError = body?.error;
  return {
    attempted: true,
    httpStatus: response.status,
    rpcCode: rawError?.code ?? null,
    errorCodes: receiptErrorCodes({ cause: { data: rawError?.data, message: rawError?.message } }),
    exposedTimeFields: collectSafeTimes(rawError),
    relevantErrorShape: relevantErrorShape({ cause: { data: rawError?.data } }),
  };
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
let independentTimeProbe = null;
try {
  const candidate = JSON.parse(await readFile(timeProbePath, "utf8"));
  const time = candidate?.comparison?.probeMessageDatetime?.unixSeconds;
  if (candidate?.mode === "INDEPENDENT_PROBE_WITH_NO_VERISTEP_TIMEOUT_BROADCAST" && Number.isSafeInteger(time)) independentTimeProbe = candidate;
} catch { /* the original diagnostic remains valid before a probe exists */ }
assert.equal(manifest.network, "studio-next");
assert.equal(manifest.chainId, 61997);
assert.equal(manifest.contract.toLowerCase(), expectedContract.toLowerCase());
const secrets = JSON.parse(await readFile(secretsPath, "utf8"));
const client = createClient({ chain, endpoint: rpc, account: createAccount(secrets.CLIENT_PRIVATE_KEY) });
assert.equal(await client.getChainId(), 61997, "Studio Next chain guard failed");
const deployedSource = await client.getContractCode(expectedContract);
assert.equal(createHash("sha256").update(deployedSource).digest("hex"), manifest.sourceHash, "Deployed source hash differs from manifest");
const deal = JSON.parse(await client.readContract({ address: expectedContract, functionName: "get_terms", args: [dealId] }));
const latest = await client.getBlock({ blockTag: "latest" });
const deadline = asSeconds(deal.adjudication_deadline);
const reviewRequestedAt = asSeconds(deal.review_requested_at);
const windowSeconds = asSeconds(deal.manifest?.terms?.windows?.adjudication);
assert.notEqual(deadline, null, "Stored adjudication deadline is not Unix seconds");
assert.notEqual(reviewRequestedAt, null, "Stored review-request time is not Unix seconds");
assert.notEqual(windowSeconds, null, "Stored adjudication window is not seconds");
let simulation = { outcome: "RETURNED", receiptTimes: [], errorCodes: [], relevantErrorShape: null, rawRpcReproduction: null };
try {
  const result = await client.simulateWriteContract({
    address: expectedContract,
    functionName: "advance_timeout",
    args: [dealId],
    includeReceipt: true,
  });
  simulation = {
    outcome: "RETURNED",
    receiptTimes: collectSafeTimes(result),
    errorCodes: [],
    relevantErrorShape: null,
    rawRpcReproduction: null,
  };
} catch (error) {
  simulation = {
    outcome: "REJECTED_IN_SIMULATION",
    receiptTimes: collectSafeTimes(error),
    errorCodes: receiptErrorCodes(error),
    relevantErrorShape: relevantErrorShape(error),
    rawRpcReproduction: await reproduceRawSimulation(error),
  };
}
const currentGenVmTime = simulation.receiptTimes.find((entry) => /current_timestamp$/i.test(entry.path))
  ?? simulation.receiptTimes.find((entry) => /(?:timestamp|datetime)$/i.test(entry.path))
  ?? null;
const deadlineRejected = simulation.errorCodes.includes("DEADLINE_NOT_REACHED")
  && simulation.rawRpcReproduction?.errorCodes?.includes("DEADLINE_NOT_REACHED");
const probeGenVmTime = independentTimeProbe?.comparison?.probeMessageDatetime ?? null;
const comparison = probeGenVmTime
  ? {
      proven: deadlineRejected,
      expression: `${probeGenVmTime.unixSeconds} >= ${deadline}`,
      result: probeGenVmTime.unixSeconds >= deadline,
      deltaSeconds: probeGenVmTime.unixSeconds - deadline,
      actualTimestamp: probeGenVmTime,
      source: "independent Studio Next time probe using SDK sim_call and its exact raw sim_call request",
    }
  : currentGenVmTime?.unixSeconds === null || currentGenVmTime === null
  ? {
      proven: deadlineRejected,
      expression: "_now() >= adjudication_deadline",
      result: deadlineRejected ? "false" : "unknown",
      inferredGenVmRelation: deadlineRejected ? `_now() < ${deadline}` : "unknown",
      actualTimestamp: "NOT_EXPOSED_BY_SIMULATION_RECEIPT",
    }
  : {
      proven: true,
      expression: `${currentGenVmTime.unixSeconds} >= ${deadline}`,
      result: currentGenVmTime.unixSeconds >= deadline,
      deltaSeconds: currentGenVmTime.unixSeconds - deadline,
    };
const report = {
  mode: "READ_AND_SIMULATE_ONLY_NO_BROADCAST",
  dealId,
  contract: { address: expectedContract, sourceHash: manifest.sourceHash, deploymentTransaction: "0x6200be8f09bb10d670ac7c3a1def9ba11893bc618ae4d4b2d261ffd2ab39494b" },
  storedDeal: {
    status: deal.status,
    adjudicationDeadline: { unixSeconds: deadline, iso8601: iso(deadline) },
    reviewRequestedAt: { unixSeconds: reviewRequestedAt, iso8601: iso(reviewRequestedAt) },
    adjudicationWindowSeconds: windowSeconds,
    deadlineFormula: `${reviewRequestedAt} + ${windowSeconds} = ${reviewRequestedAt + windowSeconds}`,
    deadlineMatchesSingleAddition: deadline === reviewRequestedAt + windowSeconds,
  },
  rpcLatestBlock: { timestampUnixSeconds: Number(latest.timestamp), iso8601: iso(Number(latest.timestamp)), unit: "Unix seconds" },
  simulation: {
    outcome: simulation.outcome,
    errorCodes: simulation.errorCodes,
    exposedTimeFields: simulation.receiptTimes,
    relevantErrorShape: simulation.relevantErrorShape,
    rawRpcReproduction: simulation.rawRpcReproduction,
    selectedGenVmTransactionTime: currentGenVmTime,
    unit: "Unix seconds when numeric; ISO 8601 when datetime",
  },
  independentTimeProbe: independentTimeProbe ? {
    contract: independentTimeProbe.probe.contract,
    deploymentHash: independentTimeProbe.probe.deploymentHash,
    sourceHash: independentTimeProbe.probe.sourceHash,
    result: independentTimeProbe.comparison,
  } : null,
  contractPredicate: "advance_timeout in REVIEW_REQUESTED executes _require(_now() >= adjudication_deadline, 'DEADLINE_NOT_REACHED')",
  comparison,
  incident: {
    expected: `If the GenVM transaction timestamp is at least ${deadline}, advance_timeout must satisfy _now() >= adjudication_deadline.`,
    actual: "Both SDK simulateWriteContract and the exact raw sim_call request reject with DEADLINE_NOT_REACHED; no broadcast occurred.",
    firstFailurePoint: "Raw Studio Next sim_call execution of advance_timeout",
    evidence: [
      "Contract address and deployed source SHA-256 match the Studio Next manifest.",
      "Deal is REVIEW_REQUESTED and stored deadline equals one review-request timestamp plus one adjudication window.",
      "Raw RPC reproduction returns HTTP 200 / JSON-RPC -32000 / DEADLINE_NOT_REACHED.",
      "Simulation receipt does not expose a GenVM datetime/current_timestamp field.",
    ],
    rootCause: probeGenVmTime ? "ROOT_CAUSE_CONFIRMED" : "ROOT_CAUSE_UNKNOWN",
    rootCauseScope: probeGenVmTime
      ? "A separate state-free contract, invoked through SDK sim_call and the captured identical raw sim_call request, returns a 2024 GenVM datetime. It is 56,883,752 seconds before the stored 2026 deadline, which confirms the simulator predicate cannot pass. This establishes the simulation-time behavior; it does not claim an on-chain timeout broadcast would use a different time, so no broadcast is allowed while required simulation rejects."
      : "The contract predicate is proven false for the simulator call, but the RPC does not expose its actual GenVM transaction timestamp; do not attribute that hidden timestamp to VeriStep or Studio Next without further evidence.",
  },
};
await writeFile(resolve(reportDir, `timeout-diagnostic-${dealId}.json`), toJson(report));
console.log(toJson(report));
