import {useEffect,useState,type FormEvent} from "react";
import {parseUnits} from "viem";
import type {Address,CalldataEncodable} from "genlayer-js/types";
import {githubCommitment} from "./v2-evidence";
import {submitV2} from "./v2-transactions";
import {friendlyError} from "./errors";
import type {V2Deal,V2Role} from "./v2-types";
import feeProfile from "../../fee-profile.json";

export const rawAmount=(value:string)=>{if(!/^\d+(?:\.\d{1,18})?$/.test(value))throw new Error("Use a non-negative GEN amount with at most 18 decimals");const amount=parseUnits(value,18);if(amount<=0n||amount>100n*10n**18n)throw new Error("Use an amount above zero and at most 100 GEN");return amount;};
const roleOf=(deal:V2Deal,account?:string):V2Role|undefined=>{if(!account)return;if(deal.manifest.client.toLowerCase()===account.toLowerCase())return"CLIENT";for(const role of ["A","B"] as const)if(deal.manifest.terms.workers[role].toLowerCase()===account.toLowerCase())return role;};
const deadline=(deal:V2Deal)=>({FUNDED:deal.accept_deadline,ACTIVE_A:deal.a_deadline,ACTIVE_B:deal.b_deadline,REVIEWABLE:deal.review_deadline,REVIEW_REQUESTED:deal.adjudication_deadline,INCONCLUSIVE:deal.adjudication_deadline} as Record<string,number|undefined>)[deal.status];
const timeoutSigningBlocked=Boolean(feeProfile.provenance.excludedMethods.advance_timeout);

export function shouldRenderV2Actions(deal:V2Deal,account?:Address):boolean{
  const role=roleOf(deal,account),due=deadline(deal),expired=due!==undefined&&Date.now()/1000>=due;
  if(!account)return ["DRAFT_UNFUNDED","FUNDED","ACTIVE_A","ACTIVE_B","REVIEWABLE","REVIEW_REQUESTED","INCONCLUSIVE"].includes(deal.status);
  if(!role)return false;
  if(expired&&due)return true;
  if(deal.status==="DRAFT_UNFUNDED")return role==="CLIENT";
  if(deal.status==="FUNDED")return (role==="A"||role==="B")&&!deal.accepted[role];
  if(deal.status==="ACTIVE_A")return role==="A";
  if(deal.status==="ACTIVE_B")return role==="B";
  if(deal.status==="REVIEWABLE"||deal.status==="REVIEW_REQUESTED")return true;
  if(deal.status==="SETTLEMENT_PENDING")return deal.settlement_legs.some(leg=>leg.state==="ELIGIBLE");
  return false;
}

export function V2Actions({deal,account,busy,onSubmitted}:{deal:V2Deal;account?:Address;busy:boolean;onSubmitted:()=>void}){
  const [error,setError]=useState(""),[signing,setSigning]=useState(false),[commit,setCommit]=useState(""),[path,setPath]=useState("");
  const [now,setNow]=useState(Date.now()/1000);useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()/1000),1000);return()=>clearInterval(timer);},[]);
  const role=roleOf(deal,account),due=deadline(deal),expired=due!==undefined&&now>=due;
  async function send(method:string,args:CalldataEncodable[]=[deal.deal_id],value=0n){if(!account||signing)return;setSigning(true);setError("");try{await submitV2(account,deal.deal_id,method,args,value);onSubmitted();}catch(cause){setError(friendlyError(cause,"Transaction failed"));}finally{setSigning(false);}}
  async function submitArtifact(event:FormEvent){event.preventDefault();if(role!=="A"&&role!=="B")return;setSigning(true);setError("");try{const origin=deal.manifest.terms.origins[role],commitment=await githubCommitment(origin.owner,origin.repository,commit,path);if(JSON.stringify(commitment.origin)!==JSON.stringify(origin))throw new Error("GitHub repository identity differs from frozen terms");const upstream=deal.artifacts[role==="A"?"SOURCE":"A"]?.submission_id;if(!upstream)throw new Error("Upstream artifact is not finalized");await submitV2(account!,deal.deal_id,"submit_artifact",[deal.deal_id,JSON.stringify(commitment),upstream]);setCommit("");setPath("");onSubmitted();}catch(cause){setError(cause instanceof Error?cause.message:"Artifact commitment failed");}finally{setSigning(false);}}
  return <section className="v2-actions"><header><div><span className="eyebrow">NEXT CONTRACT ACTION</span><h2>{role?`Connected as ${role==="CLIENT"?"client":`worker ${role}`}`:"Connect a participant wallet"}</h2></div>{due&&<span className={expired?"deadline expired":"deadline"}>{expired?"Deadline reached":"Due"} · {new Date(due*1000).toLocaleString()}</span>}</header>{error&&<p className="error">{error}</p>}<fieldset disabled={!account||busy||signing}>
    {deal.status==="DRAFT_UNFUNDED"&&role==="CLIENT"&&<button className="primary" onClick={()=>void send("fund_terms",[deal.deal_id,deal.terms_hash],(["A","B"] as const).reduce((sum,item)=>sum+BigInt(deal.manifest.terms.money[item].fee),0n))}>Fund exact worker fees</button>}
    {deal.status==="FUNDED"&&(role==="A"||role==="B")&&!deal.accepted[role]&&!expired&&<button className="primary" onClick={()=>void send("accept_work",[deal.deal_id,deal.terms_hash],BigInt(deal.manifest.terms.money[role].bond))}>Accept exact terms & bond</button>}
    {!expired&&((deal.status==="ACTIVE_A"&&role==="A")||(deal.status==="ACTIVE_B"&&role==="B"))&&<form onSubmit={event=>void submitArtifact(event)}><p>The repository identity is frozen as <strong>{deal.manifest.terms.origins[role].owner}/{deal.manifest.terms.origins[role].repository}</strong>. The contract—not this form—independently re-fetches and verifies the complete file.</p><label>Immutable 40-character commit SHA<input required value={commit} onChange={event=>setCommit(event.target.value)} pattern="[0-9a-fA-F]{40}"/></label><label>Artifact path<input required value={path} onChange={event=>setPath(event.target.value)} placeholder="evidence/final.txt"/></label><button className="primary">Verify locally & submit commitment</button></form>}
    {deal.status==="REVIEWABLE"&&role&&!expired&&<button className="primary" onClick={()=>void send("request_review")}>Freeze evidence manifest</button>}
    {deal.status==="REVIEW_REQUESTED"&&role&&!expired&&<button className="primary" onClick={()=>void send("resolve_review")}>Run independent validator review</button>}
    {expired&&due&&role&&(timeoutSigningBlocked?<p className="error" role="status">Timeout signing is unavailable while the required no-broadcast simulation returns a transaction time before this deadline.</p>:<button className="primary" onClick={()=>void send("advance_timeout")}>Apply frozen timeout rule</button>)}
    {deal.status==="SETTLEMENT_PENDING"&&role&&<div className="settlement-actions">{deal.settlement_legs.map(leg=><article key={leg.id}><div><strong>{leg.id}</strong><small>{leg.amount} attoGEN · {leg.state.replaceAll("_"," ")}</small></div>{leg.state==="ELIGIBLE"&&<button onClick={()=>void send("route_settlement",[deal.deal_id,leg.id])}>Dispatch native transfer</button>}{leg.state==="DISPATCHED_UNVERIFIED"&&<p className="router-journal">Native transfer dispatched. Studio Next cannot provide contract-side receipt verification; this is not a confirmed payment.</p>}</article>)}</div>}
  </fieldset></section>;
}
