import type {V2Deal,V2SettlementLeg} from "./v2-types";

export const canonicalReleaseProofs=[
  {id:"v2-studio-no-fault-358323c",label:"Happy Path / No-fault",expected:{A:"SATISFIED",B:"SATISFIED"}},
  {id:"v2-studio-a-fault-r3-358323c",label:"Upstream Fault / A-fault",expected:{A:"VIOLATED",B:"SATISFIED"}},
  {id:"v2-studio-b-fault-r2-358323c",label:"Downstream Fault / B-fault",expected:{A:"SATISFIED",B:"VIOLATED"}},
  {id:"v2-hosted-agent-live-2",label:"Autonomous Handoff / Hosted Agent",expected:{A:"SATISFIED",B:"SATISFIED"}},
] as const;

export interface DealPresentation {
  label:string;
  archived:boolean;
  priority:number;
}

export function dealPresentation(id:string):DealPresentation {
  if(/^v2-studio-no-fault-[a-f0-9]+$/.test(id))return {label:"Happy Path — Both Agents Correct",archived:false,priority:0};
  if(/^v2-studio-a-fault-r3-[a-f0-9]+$/.test(id))return {label:"Upstream Fault — Agent A Responsible",archived:false,priority:1};
  if(id==="v2-studio-b-fault-r2-358323c")return {label:"Downstream Fault — Agent B Responsible",archived:false,priority:2};
  if(id==="v2-hosted-agent-live-2")return {label:"Autonomous Handoff — Agent A → Agent B",archived:false,priority:3};
  if(/^v2-hosted-agent-live-\d+$/.test(id))return {label:"Hosted recovery attempt",archived:true,priority:100};
  if(/(?:-recovery-|-a-fault-(?:r[12]-)?|-b-fault(?:-r\d+)?-)/.test(id))return {label:"Recovery attempt",archived:true,priority:100};
  return {label:id,archived:false,priority:10};
}

export function sortDealIds(ids:string[]):string[]{
  return [...ids].sort((left,right)=>{
    const a=dealPresentation(left),b=dealPresentation(right);
    return Number(a.archived)-Number(b.archived)||a.priority-b.priority||left.localeCompare(right);
  });
}

function allTransfersDispatched(deal:Pick<V2Deal,"settlement_legs">):boolean {
  return deal.settlement_legs.length>0&&deal.settlement_legs.every(leg=>leg.state==="DISPATCHED_UNVERIFIED");
}

export function dealLifecycleStage(deal:Pick<V2Deal,"status"|"settlement_legs">):number {
  if(deal.status==="SETTLEMENT_PENDING"&&allTransfersDispatched(deal))return 6;
  return ({DRAFT_UNFUNDED:0,FUNDED:1,ACTIVE_A:2,ACTIVE_B:2,REVIEWABLE:3,REVIEW_REQUESTED:4,INCONCLUSIVE:4,SETTLEMENT_PENDING:5,COMPLETED:6})[deal.status]??-1;
}

export function dealStatusLabel(deal:Pick<V2Deal,"status"|"settlement_legs">):string {
  if(deal.status==="SETTLEMENT_PENDING"&&allTransfersDispatched(deal))return "Transfers dispatched";
  const labels:Record<V2Deal["status"],string>={DRAFT_UNFUNDED:"Awaiting funding",FUNDED:"Awaiting worker acceptance",ACTIVE_A:"Awaiting Agent A delivery",ACTIVE_B:"Awaiting Agent B delivery",REVIEWABLE:"Ready for review",REVIEW_REQUESTED:"Review requested",INCONCLUSIVE:"Review inconclusive",SETTLEMENT_PENDING:"Awaiting transfer dispatch",COMPLETED:"Completed"};
  return labels[deal.status];
}

export function pendingReviewCopy(status:V2Deal["status"]):{title:string;description:string}{
  switch(status){
    case "DRAFT_UNFUNDED":return {title:"Deal created — awaiting funding",description:"The client must fund the worker fees before the agents can begin. A review report comes after both agents deliver their work."};
    case "FUNDED":return {title:"Funded — awaiting workers",description:"Workers must accept the frozen terms and post their bonds before delivery begins."};
    case "ACTIVE_A":return {title:"Awaiting Agent A delivery",description:"Agent A must submit its artifact before Agent B can continue."};
    case "ACTIVE_B":return {title:"Awaiting Agent B delivery",description:"Agent B must submit its artifact before the evidence is ready for review."};
    case "REVIEWABLE":return {title:"Evidence ready for review",description:"A participant can now freeze the evidence manifest and request validator review."};
    case "REVIEW_REQUESTED":return {title:"Review requested — no finalized report",description:"The review request is recorded, but no verdict is stored yet. This status alone does not mean validators are currently processing it. Check the available action and transaction details."};
    case "INCONCLUSIVE":return {title:"Review inconclusive",description:"The deal is marked inconclusive, but its report is unavailable in this view. Refresh finalized state to inspect each agent’s recorded outcome and entitlements; uncertainty alone is not a violation."};
    default:return {title:"Review report unavailable",description:"No review report is stored for this deal. Check its contract state and transaction details."};
  }
}

export function settlementStateLabel(state:V2SettlementLeg["state"]):string {
  return state==="DISPATCHED_UNVERIFIED"?"Dispatched · receipt unverified":"Eligible for dispatch";
}
