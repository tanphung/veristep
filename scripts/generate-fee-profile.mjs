import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "reports", "studio-next-agent-tank", "manifest.json");
const profilePath = resolve(root, "fee-profile.json");
const headroomBps = 12_500n;
const roundUp = (value) => (value * headroomBps + 9_999n) / 10_000n;
const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`;
const methodForStep = (name) => {
  if (name.includes("-request-review")) return "request_review";
  if (name.includes("-resolve-review")) return "resolve_review";
  if (name.includes("-route-")) return "route_settlement";
  if (name.endsWith("-create")) return "create_terms";
  if (name.endsWith("-fund")) return "fund_terms";
  if (name.includes("-accept-")) return "accept_work";
  if (name.includes("-submit-")) return "submit_artifact";
  return null;
};

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.network, "studio-next");
assert.equal(manifest.chainId, 61997);
const grouped = new Map();
for (const [name, quote] of Object.entries(manifest.feeProfiles ?? {})) {
  const method = methodForStep(name);
  const distribution = quote?.distribution;
  if (!method || !distribution) continue;
  const values = grouped.get(method) ?? [];
  values.push(distribution);
  grouped.set(method, values);
}
const maximum = (entries, field) => entries.reduce((current, entry) => {
  const next = BigInt(entry[field] ?? 0);
  return next > current ? next : current;
}, 0n);
const methodNames = ["create_terms", "fund_terms", "accept_work", "submit_artifact", "request_review", "resolve_review", "route_settlement"];
const methods = Object.fromEntries(methodNames.map((method) => {
  const entries = grouped.get(method) ?? [];
  assert.ok(entries.length > 0, `No measured finalized quote is available for ${method}`);
  const rotations = [...new Set(entries.flatMap((entry) => entry.rotations ?? []).map(String))];
  assert.equal(rotations.length, 1, `${method} needs one measured rotations-per-round value`);
  return [method, {
    leaderTimeunitsAllocation: String(roundUp(maximum(entries, "leaderTimeunitsAllocation"))),
    validatorTimeunitsAllocation: String(roundUp(maximum(entries, "validatorTimeunitsAllocation"))),
    executionBudgetPerRound: String(roundUp(maximum(entries, "executionBudgetPerRound"))),
    totalMessageFees: String(maximum(entries, "totalMessageFees")),
    rotationsPerRound: rotations[0],
  }];
}));
const route = methods.route_settlement;
assert.equal(route.totalMessageFees, "120000000000010352", "Route profile must retain the observed native-transfer message budget");
const profile = {
  version: 1,
  network: "studio-next",
  chainId: 61997,
  measuredAt: "2026-09-16T11:00:00.000Z",
  methods,
  provenance: {
    contract: manifest.contract,
    sourceHash: manifest.sourceHash,
    measuredFrom: "reports/studio-next-agent-tank/manifest.json",
    observedTransactions: Object.values(manifest.steps ?? {}).filter((step) => step?.hash).length,
    headroomBps: Number(headroomBps),
    routeSettlement: {
      requiresRecipientSpecificMessageAllocation: true,
      childBudget: route.totalMessageFees,
      childFeeParams: {
        leaderTimeunitsAllocation: "100",
        validatorTimeunitsAllocation: "200",
        appealRounds: "0",
        executionBudgetPerRound: "25000000000000000",
        rotations: ["3"],
        maxPriceGenPerTimeUnit: "2",
        storageFeeMaxGasPrice: "300000000",
        receiptFeeMaxGasPrice: "300000000",
      },
    },
    excludedMethods: {
      advance_timeout: "A no-broadcast raw sim_call reproduces DEADLINE_NOT_REACHED, but the simulation receipt does not expose its GenVM timestamp. Browser signing remains blocked until a fresh simulation proves the predicate.",
    },
  },
};
const next = stringify(profile);
if (process.argv.includes("--check")) {
  assert.equal(await readFile(profilePath, "utf8"), next, "fee-profile.json is stale; run npm run generate:fee-profile");
} else {
  await writeFile(profilePath, next);
}
console.log(JSON.stringify({ profile: "verified", methods: Object.keys(methods), observedTransactions: profile.provenance.observedTransactions }));
