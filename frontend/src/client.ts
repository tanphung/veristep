import {createClient} from 'genlayer-js';
import {TransactionHashVariant, type Address} from 'genlayer-js/types';
import deployment from './deployment.json';
import {studioNext} from './network';
import type {Job,Obligation} from './types';
import {canonical,digest,verifyArtifacts} from './evidence';

export const chain = studioNext;
if(chain.id!==deployment.chainId)throw new Error('Deployment RPC chain configuration mismatch');
export const contract = deployment.contract as Address;
export const evidenceChainId = deployment.contractChainId;
export const writesEnabled = deployment.network === 'studio-next' && deployment.releaseStatus === 'READY' && deployment.submissionReady;
export const readClient = createClient({chain});
export const explorer = (chain.blockExplorers?.default.url ?? '').replace(/\/$/,'');
export const short = (value:string)=>`${value.slice(0,6)}…${value.slice(-4)}`;
export const jobHref = (id:string)=>`#job=${encodeURIComponent(id)}`;
export async function readJob(id:string):Promise<Job> {
  const value = await readClient.readContract({address:contract,functionName:'get_job',args:[id],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
  if (typeof value !== 'string') throw new Error('Unexpected contract response');
  const job = JSON.parse(value) as Job;
  if (job.id !== id || job.chain_id !== evidenceChainId || job.contract.toLowerCase() !== contract.toLowerCase()) throw new Error('Contract evidence domain mismatch');
  await verifyArtifacts(job);
  const configRaw=await readClient.readContract({address:contract,functionName:'get_config',args:[],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
  if(typeof configRaw!=='string')throw new Error('Missing contractual obligations');
  const config=JSON.parse(configRaw);
  if(config.version!==job.terms.version||String(config.chain_id)!==evidenceChainId||config.contract?.toLowerCase()!==contract.toLowerCase()||!Array.isArray(config.obligations))throw new Error('Contractual rubric mismatch');
  job.obligations=(config.obligations as Obligation[]).filter(o=>o.id!=='B_SOURCE'||job.terms.verify_source);
  if(job.review){
    const raw=await readClient.readContract({address:contract,functionName:'get_review_input',args:[id],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
    if(typeof raw!=='string')throw new Error('Missing review snapshot');
    const input=JSON.parse(raw);
    const expected=await digest(canonical(input.snapshot));
    if(expected!==job.review.snapshot_sha256||expected!==input.snapshot_sha256||input.snapshot.terms_hash!==job.terms_hash||canonical(input.snapshot.artifacts)!==canonical((['SOURCE','A','B'] as const).flatMap(role=>job.artifacts[role]?[job.artifacts[role]]:[])))throw new Error('Review snapshot mismatch');
  }
  return job;
}
export async function listJobs():Promise<string[]> {
  const raw = await readClient.readContract({address:contract,functionName:'list_jobs',args:[0n,50n],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
  if (typeof raw !== 'string') throw new Error('Unexpected job list');
  return (JSON.parse(raw) as {ids:string[]}).ids;
}
