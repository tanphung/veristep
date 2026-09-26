import {useEffect,useRef,useState} from "react";
import {ArrowLeftRight,CheckCircle2,CircleAlert,LoaderCircle,MinusCircle} from "lucide-react";
import {cachedV2Deal,readFinalizedWithRetry,readV2Deal} from "./v2-client";
import {canonicalReleaseProofs,dealPresentation,dealStatusLabel} from "./deal-presentation";
import type {V2Deal,V2Outcome} from "./v2-types";

import {finalizedReadError} from "./finalized-reads";

const label=(value?:string)=>value?.replaceAll("_"," ")??"Not available";
const outcome=(deal:V2Deal|undefined,role:"A"|"B"):V2Outcome|undefined=>deal?.report?.decision.stages[role].outcome;
function cachedProofs(){return Object.fromEntries(canonicalReleaseProofs.flatMap(item=>{
  const deal=cachedV2Deal(item.id);return deal?[[item.id,deal]]:[];
}));}

export function V2Compare({ids}:{ids:string[]}){
  const [retry,setRetry]=useState(0);
  const [comparing,setComparing]=useState(false);
  const [leftId,setLeftId]=useState(ids[0]??""),[rightId,setRightId]=useState(ids[1]??ids[0]??"");
  const [left,setLeft]=useState<V2Deal>(),[right,setRight]=useState<V2Deal>(),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  const [proofs,setProofs]=useState<Record<string,V2Deal>>(cachedProofs),[proofError,setProofError]=useState(""),[proofLoading,setProofLoading]=useState(true);
  const failedProofs=useRef(new Set<string>());
  const allProofsPass=canonicalReleaseProofs.every(item=>{
    const stages=proofs[item.id]?.report?.decision.stages;
    return stages?.A.outcome===item.expected.A&&stages?.B.outcome===item.expected.B;
  });
  useEffect(()=>{if(!leftId&&ids[0])setLeftId(ids[0]);if(!rightId&&(ids[1]||ids[0]))setRightId(ids[1]??ids[0]);},[ids,leftId,rightId]);
  useEffect(()=>{
    let live=true;setProofLoading(true);setProofError("");
    const targets=canonicalReleaseProofs.filter(item=>retry===0||failedProofs.current.has(item.id));
    void Promise.allSettled(targets.map(item=>readFinalizedWithRetry(()=>readV2Deal(item.id,retry>0)).then(deal=>{
      if(live){failedProofs.current.delete(item.id);setProofs(previous=>({...previous,[item.id]:deal}));}
    }).catch(cause=>{if(live)failedProofs.current.add(item.id);throw cause;}))).then(results=>{
      if(!live)return;
      const failed=results.find((result):result is PromiseRejectedResult=>result.status==="rejected");
      if(failed)setProofError(finalizedReadError(failed.reason,"Some examples could not be updated. Previously loaded data remains visible; it has not been refreshed. Please retry."));
      setProofLoading(false);
    });
    return()=>{live=false;};
  },[retry]);
  useEffect(()=>{
    let live=true;if(!comparing||!leftId||!rightId)return;
    setLeft(cachedV2Deal(leftId));setRight(cachedV2Deal(rightId));setLoading(true);setError("");
    void Promise.allSettled(([ [leftId,setLeft],[rightId,setRight] ] as const).map(([id,setValue])=>
      readFinalizedWithRetry(()=>readV2Deal(id)).then(value=>{if(live)setValue(value);})
    )).then(results=>{
      if(!live)return;
      const failed=results.find((result):result is PromiseRejectedResult=>result.status==="rejected");
      if(failed)setError(finalizedReadError(failed.reason,"Could not update the comparison. Previously loaded data remains visible; it has not been refreshed. Please retry."));
      setLoading(false);
    });return()=>{live=false;};
  },[comparing,leftId,rightId,retry]);
  const rows=[
    ["Contract status",left?dealStatusLabel(left):"Not available",right?dealStatusLabel(right):"Not available"],
    ["Worker A decision",label(outcome(left,"A")),label(outcome(right,"A"))],
    ["Worker B decision",label(outcome(left,"B")),label(outcome(right,"B"))],
    ["Frozen obligations",String(left?.manifest.obligations.length??"—"),String(right?.manifest.obligations.length??"—")],
    ["Verified sources",String(left?.report?.source_assessments.filter(item=>item.status==="VERIFIED").length??0),String(right?.report?.source_assessments.filter(item=>item.status==="VERIFIED").length??0)],
    ["Material findings",String(left?.report?.findings.length??0),String(right?.report?.findings.length??0)],
    ["Transfers dispatched (unverified)",`${left?.settlement_legs.filter(item=>item.state==="DISPATCHED_UNVERIFIED").length??0}/${left?.settlement_legs.length??0}`,`${right?.settlement_legs.filter(item=>item.state==="DISPATCHED_UNVERIFIED").length??0}/${right?.settlement_legs.length??0}`],
  ];
  return <section className="workspace v2-compare"><section className="verified-release-summary"><div className="section-heading"><div><span className="eyebrow">EXPLORE THE PROTOCOL</span><h2>Four verified examples.</h2><p className="section-description">Choose a case to inspect its evidence and validator decisions. No wallet needed.</p></div><span className={`proof-sync-indicator ${proofLoading?"is-loading":proofError||!allProofsPass?"has-error":"is-verified"}`} role="status" aria-label={proofLoading?"Syncing verified examples":proofError||!allProofsPass?"Verified examples need attention":"Four verified examples loaded"}>{proofLoading?<LoaderCircle className="spinning" aria-hidden="true"/>:proofError||!allProofsPass?<CircleAlert aria-hidden="true"/>:<CheckCircle2 aria-hidden="true"/>}</span></div>{proofError&&<p className="error">{proofError}<button onClick={()=>setRetry(value=>value+1)}>Retry examples</button></p>}{proofLoading&&<p className="empty">{Object.keys(proofs).length?"Checking for updates… Showing previously loaded examples.":"Loading verified examples… If the network is busy, this may take about a minute."}</p>}{(!proofLoading||Object.keys(proofs).length>0)&&<div className="verified-proof-grid">{canonicalReleaseProofs.map(item=>{const deal=proofs[item.id],actual=deal?.report?.decision.stages,passed=Boolean(actual&&actual.A.outcome===item.expected.A&&actual.B.outcome===item.expected.B),result=!deal||!actual?"NOT LOADED":passed?"PASS":"VERDICT MISMATCH";return <a href={`#job=${encodeURIComponent(item.id)}`} className="verified-proof" key={item.id}><div><strong>{item.label}</strong><span className={`proof-result ${passed?"pass":"error"}`}>{result}</span></div><dl><div><dt>Agent A</dt><dd className={actual?.A.outcome.toLowerCase()}>{label(actual?.A.outcome)}</dd></div><div><dt>Agent B</dt><dd className={actual?.B.outcome.toLowerCase()}>{label(actual?.B.outcome)}</dd></div></dl><small>{deal?dealStatusLabel(deal):"Authoritative report unavailable"}</small></a>;})}</div>}</section><details className="pairwise-comparison" onToggle={event=>setComparing(event.currentTarget.open)}><summary className="comparison-toggle"><span>Compare two outcomes<small>Optional · inspect the differences side by side</small></span><ArrowLeftRight/></summary><div className="section-heading"><div><span className="eyebrow">DEEPER INSPECTION</span><h2>Compare Outcomes</h2></div><ArrowLeftRight/></div><div className="compare-pickers"><label>Left scenario<select value={leftId} onChange={event=>setLeftId(event.target.value)}>{ids.map(id=><option key={id} value={id}>{dealPresentation(id).label}</option>)}</select></label><label>Right scenario<select value={rightId} onChange={event=>setRightId(event.target.value)}>{ids.map(id=><option key={id} value={id}>{dealPresentation(id).label}</option>)}</select></label></div>{error&&<p className="error">{error}<button onClick={()=>setRetry(value=>value+1)}>Retry comparison</button></p>}{loading&&<p className="empty">{left&&right?"Checking for updates… Showing previously loaded comparison.":"Loading finalized reports… Waiting requests resume automatically."}</p>}{left?.deal_id===leftId&&right?.deal_id===rightId&&left&&right&&<><div className="compare-head"><strong>Signal</strong><strong>{dealPresentation(left.deal_id).label}</strong><strong>{dealPresentation(right.deal_id).label}</strong></div>{rows.map(([name,a,b])=><div className="compare-row" key={name}><strong>{name}</strong><span>{a}</span><span className={a===b?"same":"different"}>{a===b?<CheckCircle2/>:<MinusCircle/>}{b}</span></div>)}<details className="compare-technical"><summary>Technical details</summary><div><span>Left record ID</span><code>{left.deal_id}</code><span>Right record ID</span><code>{right.deal_id}</code></div></details><p className="review-context">This view compares only finalized Intelligent Contract state. It never computes a verdict or alters an assessment.</p></>}</details></section>;
}
