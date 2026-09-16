import {abi,createClient,deriveInternalMessageCallKey,encodeInternalMessageFeeParams} from "genlayer-js";
import {createTransactionKit} from "@genlayer/transaction-kit";
import type {Address,CalldataEncodable,Hash,MessageFeeAllocationInput} from "genlayer-js/types";
import {chain,contract,readClient,writesEnabled} from "./client";
import {readV2Deal} from "./v2-client";
import {executionName,statusName} from "../../scripts/receipts.mjs";
import feeProfile from "../../fee-profile.json";
import {injected,type TxRecord,type Phase} from "./transactions";

export const v2HistoryKey=`veristep:v2:transactions:${chain.id}:${contract.toLowerCase()}`;
export const v2Pending=(record:TxRecord)=>["SIGNING","PENDING","ACCEPTED","UNKNOWN"].includes(record.phase);
export function v2History():TxRecord[]{const raw=localStorage.getItem(v2HistoryKey);if(!raw)return[];const rows:unknown=JSON.parse(raw);if(!Array.isArray(rows)||rows.some(item=>{const row=item as TxRecord;return !row||row.chainId!==chain.id||row.contract.toLowerCase()!==contract.toLowerCase()||typeof row.id!=="string"||typeof row.jobId!=="string"||typeof row.method!=="string"||!/^0x[\da-f]{40}$/i.test(row.account)||!/^\d+$/.test(row.value)||!(["SIGNING","PENDING","ACCEPTED","FINALIZED_SUCCESS","FAILED","REJECTED","UNKNOWN"] as Phase[]).includes(row.phase)}))throw new Error("Invalid v2 transaction history; inspect the wallet before submitting again");return rows as TxRecord[];}
function save(record:TxRecord){const rows=v2History(),index=rows.findIndex(item=>item.id===record.id);if(index<0)rows.unshift(record);else rows[index]=record;localStorage.setItem(v2HistoryKey,JSON.stringify(rows));window.dispatchEvent(new Event("veristep:v2-transactions"));}
const methods=new Set(["create_terms","fund_terms","accept_work","submit_artifact","request_review","resolve_review","advance_timeout","route_settlement"]);
function assertMeasuredProfile(method:string){
  if(feeProfile.network!=="studio-next"||feeProfile.chainId!==chain.id||feeProfile.provenance.contract.toLowerCase()!==contract.toLowerCase())throw new Error("Measured Studio Next fee profile does not match this deployment");
  if(!Object.hasOwn(feeProfile.methods,method)){
    const excluded=feeProfile.provenance.excludedMethods as Record<string,string>;
    throw new Error(excluded[method]??"No shared fee profile exists for this contract action");
  }
}
function provider(){return injected();}
function routeAllocation(recipient:Address):MessageFeeAllocationInput{
  const config=feeProfile.provenance.routeSettlement;
  return {
    messageType:1,
    onAcceptance:false,
    recipient,
    callKey:deriveInternalMessageCallKey(),
    budget:BigInt(config.childBudget),
    feeParams:encodeInternalMessageFeeParams({
      leaderTimeunitsAllocation:BigInt(config.childFeeParams.leaderTimeunitsAllocation),
      validatorTimeunitsAllocation:BigInt(config.childFeeParams.validatorTimeunitsAllocation),
      appealRounds:BigInt(config.childFeeParams.appealRounds),
      executionBudgetPerRound:BigInt(config.childFeeParams.executionBudgetPerRound),
      rotations:config.childFeeParams.rotations.map(BigInt),
      maxPriceGenPerTimeUnit:BigInt(config.childFeeParams.maxPriceGenPerTimeUnit),
      storageFeeMaxGasPrice:BigInt(config.childFeeParams.storageFeeMaxGasPrice),
      receiptFeeMaxGasPrice:BigInt(config.childFeeParams.receiptFeeMaxGasPrice),
    }),
  };
}
export async function submitV2(account:Address,dealId:string,method:string,args:CalldataEncodable[],value=0n){
  if(!writesEnabled)throw new Error("Writes remain locked until the verified v2 deployment is selected");
  if(!methods.has(method))throw new Error("Unsupported v2 contract action");
  assertMeasuredProfile(method);
  if(!navigator.locks)throw new Error("Web Locks are required to prevent duplicate submissions");
  return navigator.locks.request(v2HistoryKey,{ifAvailable:true},async lock=>{
    if(!lock||v2History().some(v2Pending))throw new Error("Another v2 transaction is unresolved; check its existing hash before sending again");
    const wallet=provider(),accounts=await wallet.request({method:"eth_accounts"}) as string[];
    if(accounts[0]?.toLowerCase()!==account.toLowerCase())throw new Error("Wallet account changed; reconnect before signing");
    if(Number(await wallet.request({method:"eth_chainId"}))!==chain.id)throw new Error(`Switch the wallet to ${chain.name}`);
    const tx={kind:"write" as const,address:contract,method,args};
    let submit:()=>Promise<Hash>;
    let feeValue:string,feeVerification:TxRecord["feeVerification"];
    if(method==="route_settlement"){
      if(value!==0n)throw new Error("Settlement routing cannot carry a user value");
      const legId=args[1];
      if(typeof legId!=="string")throw new Error("Settlement leg ID is invalid");
      const deal=await readV2Deal(dealId),leg=deal.settlement_legs.find(item=>item.id===legId);
      if(!leg||leg.state!=="ELIGIBLE"||!/^0x[\da-f]{40}$/i.test(leg.recipient))throw new Error("Settlement leg is not eligible for native-transfer dispatch");
      const suggestion=feeProfile.methods.route_settlement;
      const allocation=routeAllocation(leg.recipient as Address);
      const writer=createClient({chain,account,provider:wallet});
      const estimate=await writer.estimateTransactionFees({
        leaderTimeunitsAllocation:BigInt(suggestion.leaderTimeunitsAllocation),
        validatorTimeunitsAllocation:BigInt(suggestion.validatorTimeunitsAllocation),
        executionBudgetPerRound:BigInt(suggestion.executionBudgetPerRound),
        totalMessageFees:BigInt(suggestion.totalMessageFees),
        appealRounds:3n,
        rotations:Array.from({length:4},()=>BigInt(suggestion.rotationsPerRound)),
        messageAllocations:[allocation],
      });
      feeValue=String(estimate.feeValue);feeVerification="unavailable";
      submit=async()=> (await writer.writeContract({address:contract,functionName:"route_settlement",args,fees:{distribution:estimate.distribution,messageAllocations:estimate.messageAllocations??[allocation],feeValue:estimate.feeValue}})) as Hash;
    }else{
      const kit=createTransactionKit({chain,account,provider:wallet,suggestions:feeProfile});
      const quote=await kit.estimate({preset:"standard",userValue:value},tx);
      if(quote.source!=="developer")throw new Error("No measured developer fee profile was applied; refusing to sign");
      if(quote.verification.status==="mismatch")throw new Error("Studio Next fee policy changed; estimate again before signing");
      feeValue=String(quote.feeValue);feeVerification=quote.verification.status;
      submit=async()=> (await kit.submit(quote,tx)).genlayerTxId as Hash;
    }
    const record:TxRecord={id:crypto.randomUUID(),jobId:dealId,method,account,chainId:chain.id,contract,value:String(value),phase:"SIGNING",createdAt:Date.now(),feeValue,feeSource:"developer",feeVerification};
    save(record);
    try{
      record.hash=await submit();
      record.phase="PENDING";save(record);return record;
    }catch(cause){
      let current=cause as {code?:number;cause?:unknown};let rejected=false;
      for(let i=0;current&&i<5;i++){if(current.code===4001)rejected=true;current=current.cause as typeof current;}
      record.phase=rejected?"REJECTED":"UNKNOWN";
      record.error=rejected?"Signature rejected; no transaction was sent":"Submission outcome is uncertain; check wallet history and do not resend";
      save(record);throw new Error(record.error);
    }
  });
}
function receiptPhase(receipt:unknown):Phase{const status=statusName(receipt);if(["UNDETERMINED","CANCELED","CANCELLED","VALIDATORS_TIMEOUT","LEADER_TIMEOUT"].includes(status))return"FAILED";if(status==="FINALIZED"){const execution=executionName(receipt);return execution==="FINISHED_WITH_RETURN"?"FINALIZED_SUCCESS":execution==="FINISHED_WITH_ERROR"?"FAILED":"UNKNOWN";}return status==="ACCEPTED"?"ACCEPTED":"PENDING";}
export async function observeV2(record:TxRecord){
  if(!record.hash||!v2Pending(record))return record;
  const receipt=await readClient.getTransaction({hash:record.hash});
  const next:TxRecord={...record,phase:receiptPhase(receipt)};
  const accounting=(receipt as {data?:{fee_accounting?:{execution_fee_consumed?:unknown;primary_fee_refunded?:unknown}}}).data?.fee_accounting;
  if(accounting){
    next.feeConsumed=String(accounting.execution_fee_consumed??"");
    next.feeRefunded=String(accounting.primary_fee_refunded??"");
  }
  if(next.phase==="FINALIZED_SUCCESS"){
    const raw=receipt as {hash?:string;from_address?:string;to_address?:string;data?:{calldata?:{raw?:number[]}}};
    if(raw.hash?.toLowerCase()!==record.hash.toLowerCase()||raw.from_address?.toLowerCase()!==record.account.toLowerCase()||raw.to_address?.toLowerCase()!==contract.toLowerCase()||!Array.isArray(raw.data?.calldata?.raw))throw new Error("Finalized receipt identity does not match this v2 action");
    const call=abi.calldata.decode(Uint8Array.from(raw.data.calldata.raw));
    if(!(call instanceof Map)||call.get("method")!==record.method||!Array.isArray(call.get("args"))||(call.get("args") as unknown[])[0]!==record.jobId)throw new Error("Finalized receipt belongs to another v2 operation");
    const deal=await readV2Deal(record.jobId);
    const role=deal.manifest.client.toLowerCase()===record.account.toLowerCase()?"CLIENT":(["A","B"] as const).find(item=>deal.manifest.terms.workers[item].toLowerCase()===record.account.toLowerCase());
    const legId=String((call.get("args") as unknown[])[1]??"");
    const leg=deal.settlement_legs.find(item=>item.id===legId);
    const matched=record.method==="create_terms"?role==="CLIENT"
      :record.method==="fund_terms"?deal.status!=="DRAFT_UNFUNDED"
      :record.method==="accept_work"?Boolean(role&&role!=="CLIENT"&&deal.accepted[role])
      :record.method==="submit_artifact"?Boolean(role&&role!=="CLIENT"&&deal.artifacts[role]?.issuer.toLowerCase()===record.account.toLowerCase())
      :record.method==="request_review"?Boolean(deal.adjudication_deadline)
      :record.method==="resolve_review"?Boolean(deal.report)
      :record.method==="advance_timeout"?deal.status==="SETTLEMENT_PENDING"
      :record.method==="route_settlement"?leg?.state==="DISPATCHED_UNVERIFIED":false;
    if(!matched)throw new Error("Transaction finalized but expected v2 contract state is not observable");
  }
  if(next.phase==="FAILED")next.error=`${statusName(receipt)} / ${executionName(receipt)}; successful execution was not proven`;
  save(next);return next;
}
