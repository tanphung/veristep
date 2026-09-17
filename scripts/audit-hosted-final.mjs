import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {abi} from "genlayer-js";
import {executionName,statusName} from "./receipts.mjs";

const root=resolve(import.meta.dirname,"..");
const reportDir=resolve(root,"reports","studio-next-hosted-agent-final");
const manifest=JSON.parse(await readFile(resolve(reportDir,"manifest.json"),"utf8"));
const deal=JSON.parse(await readFile(resolve(reportDir,"deal.json"),"utf8"));
const expected=[
  ["client-create","client-create.receipt.json","create_terms",manifest.client],
  ["client-fund","client-fund.receipt.json","fund_terms",manifest.client],
  ["A:accept_work","a-accept-work.receipt.json","accept_work",manifest.workers.A],
  ["B:accept_work","b-accept-work.receipt.json","accept_work",manifest.workers.B],
  ["A:submit_artifact","a-submit-artifact.receipt.json","submit_artifact",manifest.workers.A],
  ["B:submit_artifact","b-submit-artifact.receipt.json","submit_artifact",manifest.workers.B],
  ["client-request-review","client-request-review.receipt.json","request_review",manifest.client],
  ["client-resolve-review","client-resolve-review.receipt.json","resolve_review",manifest.client],
];
const clientHashes=manifest.transactionAudit.client,workerHashes=manifest.transactionAudit.workers;
const hashes=[];
for(const [key,file,method,sender] of expected){
  const receipt=JSON.parse(await readFile(resolve(reportDir,file),"utf8"));
  const hash=key.startsWith("client-")?clientHashes[key]:workerHashes[key];
  assert.equal(receipt.hash?.toLowerCase(),hash.toLowerCase(),`${key} receipt hash mismatch`);
  assert.equal(receipt.from_address?.toLowerCase(),sender.toLowerCase(),`${key} sender mismatch`);
  assert.equal(receipt.to_address?.toLowerCase(),manifest.contract.toLowerCase(),`${key} contract mismatch`);
  assert.equal(statusName(receipt),"FINALIZED",`${key} is not finalized`);
  assert.equal(executionName(receipt),"FINISHED_WITH_RETURN",`${key} execution failed`);
  const raw=receipt.data?.calldata?.raw;
  assert.ok(Array.isArray(raw),`${key} calldata unavailable`);
  const decoded=abi.calldata.decode(Uint8Array.from(raw));
  assert.ok(decoded instanceof Map,`${key} calldata invalid`);
  assert.equal(decoded.get("method")??decoded.get(""),method,`${key} method mismatch`);
  assert.equal(decoded.get("args")?.[0],manifest.dealId,`${key} deal mismatch`);
  hashes.push(hash);
}
assert.equal(hashes.length,8);
assert.equal(new Set(hashes.map(hash=>hash.toLowerCase())).size,8,"Hosted audit contains duplicate hashes");
assert.equal(manifest.transactionAudit.count,8);
assert.equal(manifest.transactionAudit.allFinalizedWithReturn,true);
assert.ok(manifest.elapsedMinutes<=60,"Hosted run exceeded 60 minutes");
assert.equal(deal.status,"SETTLEMENT_PENDING");
assert.equal(deal.report.decision.stages.A.outcome,"SATISFIED");
assert.equal(deal.report.decision.stages.B.outcome,"SATISFIED");
assert.ok(deal.settlement_legs.length>0&&deal.settlement_legs.every(leg=>leg.state==="ELIGIBLE"),"Settlement must remain undispatched");
assert.equal(expected.some(([, ,method])=>method==="route_settlement"),false);
console.log(JSON.stringify({passed:true,dealId:manifest.dealId,transactions:8,uniqueHashes:8,allFinalizedWithReturn:true,outcome:{A:"SATISFIED",B:"SATISFIED"},status:deal.status,settlementStates:[...new Set(deal.settlement_legs.map(leg=>leg.state))],elapsedMinutes:manifest.elapsedMinutes},null,2));
