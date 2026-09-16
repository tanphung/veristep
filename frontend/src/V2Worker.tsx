import {useCallback,useEffect,useState} from "react";
import {Bot,PauseCircle,Play,RefreshCw} from "lucide-react";
import {toHex} from "viem";
import type {Address} from "genlayer-js/types";
import {chain} from "./client";
import {injected} from "./transactions";
import type {V2Deal} from "./v2-types";

interface WorkerState {run_id:string;state:"ACTIVE"|"COMPLETE"|"ERROR"|"CANCELLED";stage:string;detail:string;updated_at:number}
const workerUrl=String(import.meta.env.VITE_VERISTEP_WORKER_URL??"").replace(/\/$/,"");

function authMessage(input:{address:string;nonce:string;expiresAt:number;chainId:number;contract:string;dealId:string;termsHash:string}){
  return ["VeriStep hosted worker authorization v1",`address:${input.address.toLowerCase()}`,`nonce:${input.nonce}`,`expires_at:${input.expiresAt}`,`chain_id:${input.chainId}`,`contract:${input.contract.toLowerCase()}`,`deal_id:${input.dealId}`,`terms_hash:${input.termsHash}`,"scope:start_or_resume_agent_ab"].join("\n");
}

export function V2Worker({deal,account}:{deal:V2Deal;account?:Address}){
  const key=`veristep:v2-worker:${chain.id}:${deal.contract.toLowerCase()}:${deal.deal_id}`;
  const [runId,setRunId]=useState(()=>localStorage.getItem(key)??""),[state,setState]=useState<WorkerState>(),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const client=account?.toLowerCase()===deal.manifest.client.toLowerCase();
  const load=useCallback(async()=>{if(!workerUrl||!runId)return;try{const response=await fetch(`${workerUrl}/api/worker-runs/${encodeURIComponent(runId)}`,{cache:"no-store"}),data=await response.json() as {run?:WorkerState;error?:string};if(!response.ok||!data.run)throw new Error(data.error??"Hosted run unavailable");setState(data.run);setError("");}catch(cause){setError(cause instanceof Error?cause.message:"Hosted worker status unavailable");}},[runId]);
  useEffect(()=>{void load();if(!runId)return;const timer=setInterval(()=>void load(),8000);return()=>clearInterval(timer);},[load,runId]);
  async function signedBody(){if(!account)throw new Error("Connect the client wallet first");const nonceResponse=await fetch(`${workerUrl}/api/worker-nonce?address=${account}`),nonce=await nonceResponse.json() as {nonce?:string;expiresAt?:number;error?:string};if(!nonceResponse.ok||!nonce.nonce||!nonce.expiresAt)throw new Error(nonce.error??"Could not create a worker authorization");const body={address:account,nonce:nonce.nonce,expiresAt:nonce.expiresAt,chainId:chain.id,contract:deal.contract,dealId:deal.deal_id,termsHash:deal.terms_hash};const signature=await injected().request({method:"personal_sign",params:[toHex(authMessage(body)),account]}) as string;return {...body,signature};}
  async function command(action:"start"|"resume"|"cancel"){setBusy(true);setError("");try{const body=await signedBody(),url=action==="start"?`${workerUrl}/api/worker-runs`:`${workerUrl}/api/worker-runs/${runId}/${action}`,response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),data=await response.json() as {runId?:string;run?:WorkerState;error?:string};if(!response.ok)throw new Error(data.error??"Hosted worker request failed");const id=data.runId??data.run?.run_id??runId;if(id){localStorage.setItem(key,id);setRunId(id);}await load();}catch(cause){setError(cause instanceof Error?cause.message:"Hosted worker request failed");}finally{setBusy(false);}}
  const eligible=["FUNDED","ACTIVE_A","ACTIVE_B"].includes(deal.status);
  return <section className="v2-worker"><header><div className="worker-icon"><Bot/></div><div><span className="eyebrow">HOSTED AGENT HANDOFF</span><h2>Agent A extracts · Agent B reports</h2><p>The agents publish immutable work. GenLayer validators—not this service—verify evidence and decide settlement.</p></div><span className={`worker-state ${state?.state.toLowerCase()??"locked"}`}>{state?.stage.replaceAll("_"," ")??(workerUrl?"READY":"RELEASE LOCKED")}</span></header>{error&&<p className="error">{error}</p>}<div className="worker-controls">{!runId&&<button className="primary" disabled={!client||!eligible||busy||!workerUrl} onClick={()=>void command("start")}><Play/> Start A/B delivery</button>}{runId&&<button onClick={()=>void load()} disabled={busy}><RefreshCw/> Refresh checkpoint</button>}{state?.state==="ERROR"&&<button className="primary" onClick={()=>void command("resume")} disabled={!client||busy}><Play/> Resume safely</button>}{state&&["ACTIVE","ERROR"].includes(state.state)&&<button onClick={()=>void command("cancel")} disabled={!client||busy}><PauseCircle/> Stop workflow</button>}<small>{state?.detail||(!workerUrl?"The free hosted worker remains disabled until V2 passes release gates and receives its deployment URL.":!client?"Connect the frozen client wallet to authorize the hosted run.":"One signed authorization starts or resumes this exact deal only.")}</small></div></section>;
}
