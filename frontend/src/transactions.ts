import {abi,createClient} from 'genlayer-js';
import type {Address,CalldataEncodable,Hash} from 'genlayer-js/types';
import {chain,contract,readClient,readJob,writesEnabled} from './client';
import {executionName,statusName} from '../../scripts/receipts.mjs';

export type Provider=NonNullable<NonNullable<Parameters<typeof createClient>[0]>['provider']>;
export type Phase='SIGNING'|'PENDING'|'ACCEPTED'|'FINALIZED_SUCCESS'|'FAILED'|'REJECTED'|'UNKNOWN';
export type TxRecord={id:string;jobId:string;method:string;account:string;chainId:number;contract:string;value:string;phase:Phase;hash?:Hash;error?:string;createdAt:number;feeValue?:string;feeSource?:'developer'|'network-default';feeVerification?:'verified'|'mismatch'|'unavailable';feeConsumed?:string;feeRefunded?:string};
export const historyKey=`veristep:transactions:${chain.id}:${contract.toLowerCase()}`;
export const pending=(item:TxRecord)=>['SIGNING','PENDING','ACCEPTED','UNKNOWN'].includes(item.phase);
export function history():TxRecord[]{
  const text=localStorage.getItem(historyKey);if(!text)return [];
  const value:unknown=JSON.parse(text);
  const valid=Array.isArray(value)&&value.every(item=>item&&item.chainId===chain.id&&typeof item.contract==='string'&&item.contract.toLowerCase()===contract.toLowerCase()&&typeof item.id==='string'&&typeof item.jobId==='string'&&typeof item.method==='string'&&typeof item.account==='string'&&/^0x[\da-f]{40}$/i.test(item.account)&&typeof item.value==='string'&&/^\d+$/.test(item.value)&&typeof item.createdAt==='number'&&['SIGNING','PENDING','ACCEPTED','FINALIZED_SUCCESS','FAILED','REJECTED','UNKNOWN'].includes(item.phase)&&(item.hash===undefined||/^0x[\da-f]{64}$/i.test(item.hash)));
  if(!valid)throw new Error('Invalid local transaction history; do not submit again before checking the wallet.');
  return value as TxRecord[];
}
function save(record:TxRecord){
  const records=history();const index=records.findIndex(r=>r.id===record.id);
  if(index<0)records.unshift(record);else records[index]=record;
  localStorage.setItem(historyKey,JSON.stringify(records));
  window.dispatchEvent(new Event('veristep:transactions'));
}
export function injected():Provider {
  const provider=(window as unknown as {ethereum?:Provider}).ethereum;
  if(!provider?.request)throw new Error('Open this page in MetaMask with the GenLayer Wallet Snap. Never paste a private key here.');
  return provider;
}
export async function connect():Promise<Address>{
  const provider=injected();
  const accounts=await provider.request({method:'eth_requestAccounts'}) as Address[];
  if(!accounts?.[0])throw new Error('No wallet account selected');
  const client=createClient({chain,account:accounts[0],provider});
  try{await client.connect(chain.id===61997?'studioDevnet':chain.id===61999?'studionet':'testnetBradbury');}
  catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(/wallet_(?:get|request)Snaps/i.test(message))throw new Error('This GenLayer wallet flow requires MetaMask and the GenLayer Wallet Snap. Approve the Snap request, then reconnect.');
    throw error;
  }
  const actual=await provider.request({method:'eth_chainId'});
  if(Number(actual)!==chain.id)throw new Error(`Switch your wallet to ${chain.name}`);
  const current=await provider.request({method:'eth_accounts'}) as Address[];
  if(current?.[0]?.toLowerCase()!==accounts[0].toLowerCase())throw new Error('Wallet account changed during connection. Connect again.');
  return accounts[0];
}
export function watchWallet(invalidate:()=>void):()=>void {
  const provider=injected() as Provider & {on?:(event:string,listener:()=>void)=>unknown;removeListener?:(event:string,listener:()=>void)=>unknown};
  if(!provider.on||!provider.removeListener)return ()=>{};
  const events=['accountsChanged','chainChanged','disconnect'];
  for(const event of events)provider.on(event,invalidate);
  return ()=>{for(const event of events)provider.removeListener?.(event,invalidate);};
}
const methods=new Set(['create_job','accept_job','cancel_job','submit_work','approve_work','request_review','resolve_review','advance_timeout','claim']);
export async function submit(account:Address,jobId:string,method:string,args:CalldataEncodable[],value=0n):Promise<TxRecord>{
  if(!writesEnabled&&import.meta.env.MODE!=="test")throw new Error('Studio Next writes remain locked until the committed deployment verification gate passes.');
  if(!methods.has(method))throw new Error('Unsupported contract action');
  if(!navigator.locks)throw new Error('A browser with Web Locks is required to prevent duplicate wallet submissions.');
  return navigator.locks.request(historyKey,{ifAvailable:true},async lock=>{
    if(!lock||history().some(pending))throw new Error('Another transaction is unresolved. Check its existing hash or wallet history before sending anything again.');
    const provider=injected();
    const accounts=await provider.request({method:'eth_accounts'}) as string[];
    if(accounts[0]?.toLowerCase()!==account.toLowerCase())throw new Error('Wallet account changed. Reconnect before signing.');
    if(Number(await provider.request({method:'eth_chainId'}))!==chain.id)throw new Error(`Wrong network. Reconnect to ${chain.name}.`);
    const record:TxRecord={id:crypto.randomUUID(),jobId,method,account,chainId:chain.id,contract,value:String(value),phase:'SIGNING',createdAt:Date.now()};
    save(record); // Fail before signing if durable local tracking is unavailable.
    try{
      const client=createClient({chain,account,provider});
      record.hash=await client.writeContract({address:contract,functionName:method,args,value,leaderOnly:false,consensusMaxRotations:3});
      record.phase='PENDING';save(record);return record;
    }catch(error){
      let current=error as {code?:number;cause?:unknown;message?:string};let rejected=false;
      for(let i=0;current&&i<5;i++){if(current.code===4001)rejected=true;current=current.cause as typeof current;}
      record.phase=rejected?'REJECTED':'UNKNOWN';
      record.error=rejected?'Signature rejected. No retry was sent.':'Submission outcome is uncertain. Check the wallet; do not resend automatically.';
      save(record);throw new Error(record.error);
    }
  });
}
export function receiptPhase(receipt:unknown):Phase {
  const status=statusName(receipt);
  if(['UNDETERMINED','CANCELED','CANCELLED','VALIDATORS_TIMEOUT','LEADER_TIMEOUT'].includes(status))return 'FAILED';
  if(status==='FINALIZED'){
    const execution=executionName(receipt);
    return execution==='FINISHED_WITH_RETURN'?'FINALIZED_SUCCESS':execution==='FINISHED_WITH_ERROR'?'FAILED':'UNKNOWN';
  }
  if(status==='ACCEPTED')return 'ACCEPTED';
  return 'PENDING';
}
export async function observe(record:TxRecord):Promise<TxRecord>{
  if(!record.hash||!pending(record))return record;
  const receipt=await readClient.getTransaction({hash:record.hash});
  const next={...record,phase:receiptPhase(receipt)};
  if(next.phase==='FINALIZED_SUCCESS'){
    assertReceiptMatches(record,receipt);
    const job=await readJob(record.jobId);
    const role=job.client.toLowerCase()===record.account.toLowerCase()?'CLIENT':(['A','B'] as const).find(r=>job.workers[r].toLowerCase()===record.account.toLowerCase());
    const settled=['RESOLVED','CANCELLED'].includes(job.status);
    const matched=record.method==='create_job'?role==='CLIENT'
      :record.method==='accept_job'?role&&role!=='CLIENT'&&job.accepted[role]
      :record.method==='submit_work'?role&&role!=='CLIENT'&&job.artifacts[role]?.issuer.toLowerCase()===record.account.toLowerCase()
      :record.method==='request_review'?Boolean(job.adjudication_deadline)
      :record.method==='resolve_review'?Boolean(job.review)&&['RESOLVED','INCONCLUSIVE'].includes(job.status)
      :record.method==='approve_work'?settled&&job.settlement_reason==='CLIENT_ACCEPTED'
      :record.method==='cancel_job'?job.status==='CANCELLED'
      :record.method==='advance_timeout'?settled||job.status==='REVIEW_REQUESTED'
      :record.method==='claim'?role&&Boolean(job.claims[role])&&job.ledger.credits[role]==='0':false;
    if(!matched)throw new Error('Finalized receipt found, but the expected contract state is not observable yet.');
  }
  if(next.phase==='FAILED')next.error=`${statusName(receipt)} / ${executionName(receipt)}. No successful execution proven.`;
  save(next);return next;
}
export async function recoverHash(record:TxRecord,hash:string):Promise<void>{
  if(record.hash||!pending(record)||!/^0x[\da-f]{64}$/i.test(hash))throw new Error('Provide the existing transaction hash from the wallet.');
  const next={...record,hash:hash as Hash,phase:'PENDING' as const};
  const receipt=await readClient.getTransaction({hash:next.hash});
  assertReceiptMatches(next,receipt);
  save(next);
}
export function assertReceiptMatches(record:TxRecord,receipt:unknown):void {
  const r=receipt as {hash?:string;from_address?:string;to_address?:string;data?:{calldata?:{raw?:number[]}}};
  if(r.hash?.toLowerCase()!==record.hash?.toLowerCase()||r.from_address?.toLowerCase()!==record.account.toLowerCase()||r.to_address?.toLowerCase()!==record.contract.toLowerCase())throw new Error('Receipt identity does not match this transaction.');
  if(!Array.isArray(r.data?.calldata?.raw))throw new Error('Receipt is missing canonical call data.');
  const call=abi.calldata.decode(Uint8Array.from(r.data.calldata.raw));
  if(!(call instanceof Map)||call.get('method')!==record.method||!Array.isArray(call.get('args'))||(call.get('args') as unknown[])[0]!==record.jobId)throw new Error('Receipt belongs to another job or operation.');
}
