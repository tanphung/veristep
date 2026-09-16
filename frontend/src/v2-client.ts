import {TransactionHashVariant} from "genlayer-js/types";
import {contract,evidenceChainId,readClient} from "./client";
import type {V2Deal} from "./v2-types";

function assertHex(value:string,bytes:number,label:string){
  if(!new RegExp(`^[0-9a-f]{${bytes*2}}$`).test(value))throw new Error(`Invalid ${label} in finalized contract state`);
}

export function validateV2Deal(value:unknown,id:string):V2Deal{
  const deal=value as V2Deal;
  if(!deal||deal.deal_id!==id||String(deal.chain_id)!==evidenceChainId||deal.contract.toLowerCase()!==contract.toLowerCase())throw new Error("V2 contract evidence domain mismatch");
  if(deal.manifest?.version!=="veristep-2.0-rc"||deal.manifest.deal_id!==id||deal.manifest.contract.toLowerCase()!==contract.toLowerCase()||deal.manifest.router.toLowerCase()!==deal.router.toLowerCase())throw new Error("V2 frozen manifest mismatch");
  assertHex(deal.terms_hash,32,"terms hash");
  const obligationIds=deal.manifest.obligations.map(item=>item.id);
  if(new Set(obligationIds).size!==obligationIds.length)throw new Error("Duplicate frozen obligation ID");
  if(deal.report){
    if(deal.report.schema_version!=="veristep-report-2"||deal.report.job_id!==id||deal.report.contract.toLowerCase()!==contract.toLowerCase()||deal.report.terms_hash!==deal.terms_hash)throw new Error("V2 report identity mismatch");
    const assessed=deal.report.obligation_assessments.map(item=>item.obligation_id);
    if(assessed.length!==obligationIds.length||new Set(assessed).size!==assessed.length||assessed.some(item=>!obligationIds.includes(item)))throw new Error("V2 report does not cover the exact obligation set");
    const sourceIds=deal.report.source_assessments.map(item=>item.artifact_id);
    if(sourceIds.length!==3||new Set(sourceIds).size!==3||(["SOURCE","A","B"] as const).some(item=>!sourceIds.includes(item)))throw new Error("V2 source provenance report is incomplete");
    if(deal.report.source_assessments.some(item=>item.status==="VERIFIED"?item.hostname!=="api.github.com":!item.reason_code))throw new Error("V2 source provenance report is incomplete");
    const citationIds=new Set(deal.report.evidence_citations.map(item=>item.id));
    if(deal.report.obligation_assessments.some(item=>item.citation_ids.some(citation=>!citationIds.has(citation))))throw new Error("V2 report references a missing citation");
  }
  if(deal.settlement_legs.some((leg,index)=>leg.sequence!==index||!/^([0-9a-f]{64})$/.test(leg.receipt_id)||!["ELIGIBLE","DISPATCHED_UNVERIFIED"].includes(leg.state)))throw new Error("V2 settlement receipt identity mismatch");
  return deal;
}

export async function listV2Deals():Promise<string[]>{
  const ids:string[]=[];let total=0;
  do{
    const raw=await readClient.readContract({address:contract,functionName:"list_deals",args:[BigInt(ids.length),50n],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
    if(typeof raw!=="string")throw new Error("Unexpected v2 deal list");
    const value=JSON.parse(raw) as {total:number;ids:string[]};
    if(!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.ids)||value.ids.some(id=>typeof id!=="string"||!id)||value.ids.length>50)throw new Error("Invalid v2 deal list");
    if(ids.length===0)total=value.total;else if(value.total!==total)throw new Error("V2 deal list changed while paging; retry");
    if(value.ids.length===0&&ids.length<total)throw new Error("Incomplete v2 deal list");
    ids.push(...value.ids);
  }while(ids.length<total);
  if(ids.length!==total||new Set(ids).size!==ids.length)throw new Error("Invalid v2 deal list");
  return ids;
}

export async function readV2Deal(id:string):Promise<V2Deal>{
  const raw=await readClient.readContract({address:contract,functionName:"get_terms",args:[id],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
  if(typeof raw!=="string")throw new Error("Unexpected v2 deal response");
  return validateV2Deal(JSON.parse(raw),id);
}
