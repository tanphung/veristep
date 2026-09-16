import {useEffect,useState} from "react";
import {ArrowLeftRight,CheckCircle2,MinusCircle} from "lucide-react";
import {readV2Deal} from "./v2-client";
import {dealPresentation,dealStatusLabel} from "./deal-presentation";
import type {V2Deal,V2Outcome} from "./v2-types";

const label=(value?:string)=>value?.replaceAll("_"," ")??"Not available";
const outcome=(deal:V2Deal|undefined,role:"A"|"B"):V2Outcome|undefined=>deal?.report?.decision.stages[role].outcome;

export function V2Compare({ids}:{ids:string[]}){
  const [leftId,setLeftId]=useState(ids[0]??""),[rightId,setRightId]=useState(ids[1]??ids[0]??"");
  const [left,setLeft]=useState<V2Deal>(),[right,setRight]=useState<V2Deal>(),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  useEffect(()=>{if(!leftId&&ids[0])setLeftId(ids[0]);if(!rightId&&(ids[1]||ids[0]))setRightId(ids[1]??ids[0]);},[ids,leftId,rightId]);
  useEffect(()=>{let live=true;if(!leftId||!rightId){setLeft(undefined);setRight(undefined);return;}setLoading(true);setError("");void Promise.all([readV2Deal(leftId),readV2Deal(rightId)]).then(([a,b])=>{if(live){setLeft(a);setRight(b);}}).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:"Comparison failed");}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[leftId,rightId]);
  const rows=[
    ["Contract status",left?dealStatusLabel(left):"Not available",right?dealStatusLabel(right):"Not available"],
    ["Worker A decision",label(outcome(left,"A")),label(outcome(right,"A"))],
    ["Worker B decision",label(outcome(left,"B")),label(outcome(right,"B"))],
    ["Frozen obligations",String(left?.manifest.obligations.length??"—"),String(right?.manifest.obligations.length??"—")],
    ["Verified sources",String(left?.report?.source_assessments.filter(item=>item.status==="VERIFIED").length??0),String(right?.report?.source_assessments.filter(item=>item.status==="VERIFIED").length??0)],
    ["Material findings",String(left?.report?.findings.length??0),String(right?.report?.findings.length??0)],
    ["Transfers dispatched (unverified)",`${left?.settlement_legs.filter(item=>item.state==="DISPATCHED_UNVERIFIED").length??0}/${left?.settlement_legs.length??0}`,`${right?.settlement_legs.filter(item=>item.state==="DISPATCHED_UNVERIFIED").length??0}/${right?.settlement_legs.length??0}`],
  ];
  return <section className="workspace v2-compare"><div className="section-heading"><div><span className="eyebrow">FINALIZED STATE COMPARISON</span><h2>Compare Outcomes</h2></div><ArrowLeftRight/></div><div className="compare-pickers"><label>Left scenario<select value={leftId} onChange={event=>setLeftId(event.target.value)}>{ids.map(id=><option key={id} value={id}>{dealPresentation(id).label}</option>)}</select></label><label>Right scenario<select value={rightId} onChange={event=>setRightId(event.target.value)}>{ids.map(id=><option key={id} value={id}>{dealPresentation(id).label}</option>)}</select></label></div>{error&&<p className="error">{error}</p>}{loading&&<p className="empty">Reading two finalized reports…</p>}{!loading&&!error&&left&&right&&<><div className="compare-head"><strong>Signal</strong><strong>{dealPresentation(left.deal_id).label}</strong><strong>{dealPresentation(right.deal_id).label}</strong></div>{rows.map(([name,a,b])=><div className="compare-row" key={name}><strong>{name}</strong><span>{a}</span><span className={a===b?"same":"different"}>{a===b?<CheckCircle2/>:<MinusCircle/>}{b}</span></div>)}<details className="compare-technical"><summary>Technical details</summary><div><span>Left record ID</span><code>{left.deal_id}</code><span>Right record ID</span><code>{right.deal_id}</code></div></details><p className="review-context">This view compares only finalized Intelligent Contract state. It never computes a verdict or alters an assessment.</p></>}</section>;
}
