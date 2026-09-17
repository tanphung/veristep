import {ArrowUpRight,Blocks} from "lucide-react";
import {explorer,short} from "./client";
import {activityForContext,onchainActivityByDeal,type ActivityContext,type OnchainActivityItem} from "./onchain-activity";

const statusLabel=(item:OnchainActivityItem)=>item.phase==="FINALIZED_SUCCESS"?"Finalized success":item.phase==="UNDETERMINED"?"Undetermined":"Finalized error";
const statusClass=(item:OnchainActivityItem)=>item.phase==="FINALIZED_SUCCESS"?"success":"error";

export function InlineTransactionProof({item,showLabel=true}:{item:OnchainActivityItem;showLabel?:boolean}){
  return <div className="inline-transaction-proof">{showLabel&&<strong>{item.label}</strong>}<div><span className={`activity-status ${statusClass(item)}`}>{statusLabel(item)}</span><code title={item.hash}>{short(item.hash)}</code><span aria-hidden="true">·</span><a href={`${explorer}/transactions/${item.hash}`} target="_blank" rel="noreferrer">View tx <ArrowUpRight/></a></div>{item.phase!=="FINALIZED_SUCCESS"&&<small>{item.execution}</small>}</div>;
}

function ActivityRows({items}:{items:OnchainActivityItem[]}){
  return <div className="onchain-activity-list">{items.map(item=><article key={item.hash}><div><strong>{item.label}</strong>{item.phase!=="FINALIZED_SUCCESS"&&<small>{item.execution}</small>}</div><span className={`activity-status ${statusClass(item)}`}>{statusLabel(item)}</span><code title={item.hash}>{short(item.hash)}</code><a href={`${explorer}/transactions/${item.hash}`} target="_blank" rel="noreferrer">View tx <ArrowUpRight/></a></article>)}</div>;
}

const contexts:Array<{id:ActivityContext;label:string}>=[{id:"DEAL",label:"Deal / Terms"},{id:"A",label:"Agent A"},{id:"B",label:"Agent B"}];

export function V2LifecycleActivity({dealId}:{dealId:string}){
  const groups=contexts.map(context=>({...context,items:activityForContext(dealId,context.id)})).filter(group=>group.items.length>0);
  if(!groups.length)return null;
  return <section className="contextual-activity" aria-label="Lifecycle transaction proof"><span className="eyebrow">LIFECYCLE TRANSACTION PROOF</span><div>{groups.map(group=><article key={group.id}><h3>{group.label}</h3>{group.items.map(item=><InlineTransactionProof item={item} key={item.hash}/>)}</article>)}</div></section>;
}

export function V2OnchainActivity({dealId}:{dealId:string}){
  const activity=onchainActivityByDeal[dealId];
  if(!activity?.length)return null;
  return <section className="v2-section v2-onchain-audit" id="onchain-proof"><details className="all-onchain-transactions"><summary><div><span className="eyebrow">ON-CHAIN AUDIT</span><strong>All on-chain transactions</strong><small>Complete transaction audit from checked-in Studio Next release evidence.</small></div><Blocks/></summary><ActivityRows items={activity}/></details></section>;
}
