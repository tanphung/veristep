import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {abi} from "genlayer-js";
import {executionName,statusName} from "./receipts.mjs";

const root=resolve(import.meta.dirname,"..");
const reportDir=resolve(root,"reports","studio-next-b-fault-final");
const manifest=JSON.parse(await readFile(resolve(reportDir,"manifest.json"),"utf8"));
const deal=JSON.parse(await readFile(resolve(reportDir,"b-fault.deal.json"),"utf8"));
const prefix="b-fault-final",dealId="v2-studio-b-fault-r2-358323c";
const expected=[
  ["create","create_terms",manifest.wallets.client],
  ["fund","fund_terms",manifest.wallets.client],
  ["accept-a","accept_work",manifest.wallets.A],
  ["accept-b","accept_work",manifest.wallets.B],
  ["submit-a","submit_artifact",manifest.wallets.A],
  ["submit-b","submit_artifact",manifest.wallets.B],
  ["request-review","request_review",manifest.wallets.client],
  ["resolve-review","resolve_review",manifest.wallets.client],
  ["route-a-payout","route_settlement",manifest.wallets.client],
  ["route-a-bond-return","route_settlement",manifest.wallets.client],
  ["route-b-refund","route_settlement",manifest.wallets.client],
  ["route-b-bond-return","route_settlement",manifest.wallets.client],
];
const hashes=[];
for(const [suffix,method,sender] of expected){
  const name=`${prefix}-${suffix}`,step=manifest.steps[name];
  assert.ok(step?.hash,`${name} hash missing`);
  const receipt=JSON.parse(await readFile(resolve(reportDir,`${name}.receipt.json`),"utf8"));
  assert.equal(receipt.hash?.toLowerCase(),step.hash.toLowerCase(),`${name} receipt mismatch`);
  assert.equal(receipt.from_address?.toLowerCase(),sender.toLowerCase(),`${name} sender mismatch`);
  assert.equal(receipt.to_address?.toLowerCase(),manifest.contract.toLowerCase(),`${name} contract mismatch`);
  assert.equal(statusName(receipt),"FINALIZED",`${name} is not finalized`);
  assert.equal(executionName(receipt),"FINISHED_WITH_RETURN",`${name} execution failed`);
  const raw=receipt.data?.calldata?.raw;
  assert.ok(Array.isArray(raw),`${name} calldata unavailable`);
  const decoded=abi.calldata.decode(Uint8Array.from(raw));
  assert.ok(decoded instanceof Map,`${name} calldata invalid`);
  assert.equal(decoded.get("method")??decoded.get(""),method,`${name} method mismatch`);
  assert.equal(decoded.get("args")?.[0],dealId,`${name} deal mismatch`);
  hashes.push(step.hash);
}
assert.equal(hashes.length,12);
assert.equal(new Set(hashes.map(hash=>hash.toLowerCase())).size,12,"B-fault audit contains duplicate hashes");
assert.equal(deal.deal_id,dealId);
assert.equal(deal.status,"SETTLEMENT_PENDING");
assert.equal(deal.report.decision.stages.A.outcome,"SATISFIED");
assert.equal(deal.report.decision.stages.B.outcome,"VIOLATED");
assert.equal(deal.report.obligation_assessments.length,deal.manifest.obligations.length);
assert.ok(deal.report.evidence_citations.length>=4);
assert.ok(deal.report.findings.some(item=>item.obligation_id==="SEM_B_FAITHFUL_HANDOFF"));
assert.equal(deal.settlement_legs.length,4);
assert.ok(deal.settlement_legs.every(leg=>leg.state==="DISPATCHED_UNVERIFIED"));
assert.equal(manifest.cases["b-fault"].passed,true);
assert.deepEqual(manifest.cases["b-fault"].actual,{A:"SATISFIED",B:"VIOLATED"});
console.log(JSON.stringify({passed:true,dealId,lifecycleTransactions:8,settlementTransactions:4,totalTransactions:12,uniqueHashes:12,allFinalizedWithReturn:true,outcome:{A:"SATISFIED",B:"VIOLATED"},status:deal.status,settlementStates:[...new Set(deal.settlement_legs.map(leg=>leg.state))]},null,2));
