import type {V2Deal,V2SettlementLeg} from "./v2-types";

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
  return {label:"Custom Evidence Scenario",archived:false,priority:10};
}

export function sortDealIds(ids:string[]):string[]{
  return [...ids].sort((left,right)=>{
    const a=dealPresentation(left),b=dealPresentation(right);
    return Number(a.archived)-Number(b.archived)||a.priority-b.priority||left.localeCompare(right);
  });
}

export function dealStatusLabel(deal:Pick<V2Deal,"status"|"settlement_legs">):string {
  const allDispatched=deal.settlement_legs.length>0&&deal.settlement_legs.every(leg=>leg.state==="DISPATCHED_UNVERIFIED");
  if(deal.status==="SETTLEMENT_PENDING"&&allDispatched)return "Transfers Dispatched — Verification Pending";
  return deal.status.replaceAll("_"," ");
}

export function settlementStateLabel(state:V2SettlementLeg["state"]):string {
  return state==="DISPATCHED_UNVERIFIED"?"Dispatched — verification pending":"Eligible for dispatch";
}
