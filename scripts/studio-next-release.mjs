import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rpc = "https://studio-next.genlayer.com/api";
const explorer = "https://explorer-studio-dev.genlayer.com";
const chain = {
  ...studioDevnet,
  name: "GenLayer Studio Next",
  rpcUrls: { default: { http: [rpc] } },
};
assert.equal(chain.id, 61997, "Studio Next chain guard");

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return [];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

const env = parseEnv(await readFile(resolve(root, ".env"), "utf8"));
const privateKey = env.PRIVATE_KEY?.startsWith("0x") ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY ?? ""}`;
assert.match(privateKey, /^0x[0-9a-fA-F]{64}$/, "PRIVATE_KEY format invalid");
const account = createAccount(privateKey);
const client = createClient({ chain, endpoint: rpc, account });
assert.equal(await client.getChainId(), 61997, "RPC returned the wrong chain");

const sourcePath = resolve(root, "contracts", "veristep_release.py");
const code = new Uint8Array(await readFile(sourcePath));
const sourceHash = createHash("sha256").update(code).digest("hex");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const reportDir = resolve(root, "reports", "studio-next-release");
const reportPath = resolve(reportDir, "manifest.json");
await mkdir(reportDir, { recursive: true });
const report = {
  version: "veristep-studio-next-v1",
  network: "studio-next",
  rpc,
  chainId: 61997,
  explorer,
  deployer: account.address,
  source: "contracts/veristep_release.py",
  sourceHash,
  gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  dependencies: {
    "genlayer-js": packageJson.dependencies["genlayer-js"],
    "@genlayer/transaction-kit": packageJson.dependencies["@genlayer/transaction-kit"],
    "@genlayer/transaction-kit-react": packageJson.dependencies["@genlayer/transaction-kit-react"],
    "genlayer-cli": packageJson.devDependencies.genlayer,
    "py-genlayer-runner": "5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng",
  },
  settlement: {
    mode: "NATIVE_STUDIO_NEXT",
    receiptVerification: "UNVERIFIED_PLATFORM_LIMITATION",
  },
  startedAt: new Date().toISOString(),
  steps: {},
};
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2));
await save();

try {
  const schema = await client.getContractSchemaForCode(code);
  report.steps.schema = { passed: true, methods: Object.keys(schema.methods ?? {}) };
  await save();
} catch (error) {
  report.steps.schema = { passed: false, error: error instanceof Error ? error.message : String(error) };
  report.blocker = "Studio Next runner resolver rejected the exact GenVM-linted artifact before deployment.";
  report.finishedAt = new Date().toISOString();
  await save();
  throw error;
}

const estimate = await client.estimateTransactionFees();
report.steps.feeEstimate = {
  feeValue: String(estimate.feeValue),
  distribution: JSON.parse(JSON.stringify(estimate.distribution, (_, value) => typeof value === "bigint" ? value.toString() : value)),
};
await save();

// One submission only. An unknown result is never automatically resent.
const hash = await client.deployContract({
  code,
  args: [account.address],
  fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
});
report.steps.deploy = { hash, explorer: `${explorer}/transactions/${hash}`, phase: "SUBMITTED" };
await save();
const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "finalized", retries: 240, interval: 1000 });
report.steps.deploy.receipt = receipt;
report.steps.deploy.phase = isSuccessful(receipt) ? "FINALIZED_SUCCESS" : "FINALIZED_ERROR";
await save();
assert.equal(isSuccessful(receipt), true, "Studio Next deployment execution failed");
const contract = receipt.txDataDecoded?.contractAddress ?? receipt.data?.contract_address;
assert.match(contract, /^0x[0-9a-fA-F]{40}$/, "Deployment receipt has no contract address");
report.contract = contract;
report.contractExplorer = `${explorer}/contracts/${contract}`;
report.finishedAt = new Date().toISOString();
await save();
await writeFile(resolve(root, "frontend", "src", "deployment.json"), JSON.stringify({
  protocolVersion: "v2",
  network: "studio-next",
  chainId: 61997,
  contractChainId: "61997",
  contract,
  deploymentTransaction: hash,
  sourceHash,
  verifiedAt: report.finishedAt,
  submissionReady: true,
}, null, 2) + "\n");
console.log(JSON.stringify({ passed: true, chainId: 61997, contract, hash, sourceHash }));
