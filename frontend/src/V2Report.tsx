import {ArrowUpRight,CheckCircle2,FileCheck2,Landmark,ShieldCheck,TriangleAlert} from "lucide-react";
import {short} from "./client";
import {settlementStateLabel} from "./deal-presentation";
import {InlineTransactionProof} from "./V2OnchainActivity";
import {activityForContext,activityForSettlementLeg,type ActivityContext} from "./onchain-activity";
import type {V2Assessment,V2Citation,V2Deal,V2Outcome} from "./v2-types";

const title=(value:string)=>value.toLowerCase().replaceAll("_"," ").replace(/^\w/,letter=>letter.toUpperCase());
const score=(value:number|null)=>value===null?"—":`${(value/100).toFixed(0)}%`;
const statusClass=(value:V2Outcome)=>value.toLowerCase();
const github=(owner:string,repo:string,commit:string,path:string)=>`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
const semanticNames:Record<string,string>={SEM_A_POLICY_ACCURACY:"Agent A policy accuracy",SEM_A_SCOPE_ACCURACY:"Agent A scope accuracy",SEM_B_FAITHFUL_HANDOFF:"Agent B faithful handoff"};
const semanticTitle=(item:V2Assessment)=>semanticNames[item.obligation_id]??`${item.stage?`Agent ${item.stage}`:"Semantic"} ${item.obligation_id.replace(/^SEM_[AB]_/,"").toLowerCase().replaceAll("_"," ")}`;
const systemCategory=(id:string)=>id.includes("ACCEPT")?"Accept":id.includes("DELIVERY")||id.includes("UPSTREAM")?"Delivery":id.includes("MONEY")?"Funding":id.includes("PROVENANCE")?"Provenance":id.includes("REVIEW")?"Review":id.includes("REVISIONS")?"Revisions":id.includes("UNWIND")?"Unwind":"Other";
const categoryOrder=["Accept","Delivery","Funding","Provenance","Review","Revisions","Unwind","Other"];

function EvidenceQuotes({item,citations}:{item:V2Assessment;citations:Map<string,V2Citation>}){
  return <>{item.citation_ids.map(id=>{const citation=citations.get(id);return citation?<blockquote key={id}><span>{id} · {citation.artifact_id} · bytes {citation.start_byte}–{citation.end_byte}</span>“{citation.quote}”</blockquote>:null})}</>;
}

function ReviewTransactionProof({dealId}:{dealId:string}){
  const items=activityForContext(dealId,"REVIEW");
  if(!items.length)return null;
  return <div className="review-transaction-proof"><span className="eyebrow">ADJUDICATION TRANSACTIONS</span>{items.map(item=><InlineTransactionProof item={item} key={item.hash}/>)}</div>;
}

function ArtifactTransactionProof({dealId,artifactId}:{dealId:string;artifactId:"SOURCE"|"A"|"B"}){
  const context:ActivityContext=artifactId==="SOURCE"?"DEAL":artifactId;
  const items=activityForContext(dealId,context);
  if(!items.length)return null;
  return <div className="artifact-transaction-proof"><span className="eyebrow">{artifactId==="SOURCE"?"DEAL / TERMS":"ON-CHAIN ACTIONS"}</span>{items.map(item=><InlineTransactionProof item={item} key={item.hash}/>)}</div>;
}

export function V2Report({deal}:{deal:V2Deal}){
  const report=deal.report;
  if(!report)return <section className="v2-empty-review"><ShieldCheck/><div><span className="eyebrow">CONSENSUS REVIEW</span><h3>No authoritative report yet</h3><p>The interface will not infer a verdict. Only the structured report stored by the Intelligent Contract appears here.</p><ReviewTransactionProof dealId={deal.deal_id}/></div></section>;
  const citations=new Map(report.evidence_citations.map(item=>[item.id,item]));
  const semanticFindings=report.obligation_assessments.filter(item=>item.kind==="SEMANTIC"),systemChecks=report.obligation_assessments.filter(item=>item.kind==="DETERMINISTIC");
  const systemPassed=systemChecks.filter(item=>item.status==="SATISFIED").length;
  const systemCategories=categoryOrder.filter(category=>systemChecks.some(item=>systemCategory(item.obligation_id)===category));
  return <>
    <section className="v2-decision" aria-labelledby="decision-title">
      <div><span className="eyebrow">CONTRACT DECISION</span><h2 id="decision-title">Independent evidence verdict</h2><p>{report.reasoning}</p><ReviewTransactionProof dealId={deal.deal_id}/></div>
      {(["A","B"] as const).map(role=><article key={role}><span>Worker {role}</span><strong>{score(report.score[role])}</strong><em className={`verdict ${statusClass(report.decision.stages[role].outcome)}`}>{title(report.decision.stages[role].outcome)}</em></article>)}
    </section>
    <section className="v2-section" id="provenance"><header><div><span className="eyebrow">PROVENANCE / GITHUB</span><h2>Three artifacts, independently re-fetched</h2><p className="section-helper">Pinned GitHub evidence independently re-fetched by validators.</p></div><span className="count-pill">{report.source_assessments.filter(item=>item.status==="VERIFIED").length}/3 verified</span></header><div className="v2-source-grid">
      {report.source_assessments.map(source=>source.status==="VERIFIED"?<article key={source.artifact_id}><div className="source-top"><span className="artifact-role">{source.artifact_id}</span><span className="verified"><CheckCircle2 size={14}/> Verified</span></div><strong>{source.path}</strong><p>{source.owner}/{source.repository}</p><dl><div><dt>Commit</dt><dd><code>{short(source.commit)}</code></dd></div><div><dt>Blob</dt><dd><code>{short(source.blob)}</code></dd></div><div><dt>SHA-256</dt><dd><code>{short(source.sha256)}</code></dd></div><div><dt>Bytes</dt><dd>{source.byte_length.toLocaleString()}</dd></div></dl><a href={github(source.owner,source.repository,source.commit,source.path)} target="_blank" rel="noreferrer">Open immutable artifact <ArrowUpRight size={13}/></a><ArtifactTransactionProof dealId={deal.deal_id} artifactId={source.artifact_id}/></article>:<article key={source.artifact_id}><div className="source-top"><span className="artifact-role">{source.artifact_id}</span><span className="verdict unassessable">{title(source.status)}</span></div><strong>{source.commitment?.path??"Artifact unavailable"}</strong><p>{title(source.reason_code)}</p><dl>{source.commitment&&<><div><dt>Commit</dt><dd><code>{short(source.commitment.commit)}</code></dd></div><div><dt>SHA-256</dt><dd><code>{short(source.commitment.sha256)}</code></dd></div><div><dt>Bytes</dt><dd>{source.commitment.byte_length.toLocaleString()}</dd></div></>}</dl><ArtifactTransactionProof dealId={deal.deal_id} artifactId={source.artifact_id}/></article>)}
    </div></section>
    <section className="v2-section" id="obligations"><header><div><span className="eyebrow">EXACT OBLIGATION SET</span><h2>Every promise accounted for</h2></div><div className="obligation-counts"><span className="count-pill">{report.obligation_assessments.length} assessed</span><small>{report.obligation_assessments.length}/{report.obligation_assessments.length} obligations accounted for</small></div></header><div className="semantic-findings"><div className="obligation-subhead"><span className="eyebrow">SEMANTIC FINDINGS</span><h3>Business and AI judgments</h3></div><div className="obligation-list semantic-list">
      {semanticFindings.map(item=><article key={item.obligation_id}><div className="obligation-main"><span className={`verdict ${statusClass(item.status)}`}>{title(item.status)}</span><div><strong>{semanticTitle(item)}</strong><small>{item.obligation_id}{item.stage?` · Stage ${item.stage}`:""}{!item.applicable?" · Not applicable":""}</small></div></div><p>{item.reason}</p><EvidenceQuotes item={item} citations={citations}/></article>)}
    </div></div><details className="system-checks"><summary><div><strong>System checks — {systemPassed}/{systemChecks.length} passed</strong><span>{systemCategories.join(" • ")}</span></div><span className="system-check-action"><span>View system checks</span><span>Hide system checks</span></span></summary><div className="system-check-list">{systemChecks.map(item=><article key={item.obligation_id}><div className="system-check-main"><span className={`verdict ${statusClass(item.status)}`}>{title(item.status)}</span><div><strong>{systemCategory(item.obligation_id)} check</strong><small>{item.obligation_id}{!item.applicable?" · Not applicable":""}</small></div></div><p>{item.reason}</p><EvidenceQuotes item={item} citations={citations}/></article>)}</div></details></section>
    {(report.findings.length>0||report.missing_items.length>0)&&<section className="v2-alert-grid">{report.findings.map(item=><article className="material" key={item.id}><TriangleAlert/><div><span>{item.id} · MATERIAL</span><strong>{item.obligation_id}</strong><p>{item.summary}</p></div></article>)}{report.missing_items.map((item,index)=><article key={`${item.obligation_id}-${item.evidence_id}-${index}`}><FileCheck2/><div><span>MISSING EVIDENCE</span><strong>{item.obligation_id} / {item.evidence_id}</strong><p>{title(item.reason_code)}</p></div></article>)}</section>}
    <section className="v2-section" id="settlement"><header><div><span className="eyebrow">RECEIPT-BOUND SETTLEMENT</span><h2>Outcome and payment remain separate proofs</h2></div><Landmark/></header><div className="receipt-list">{deal.settlement_legs.length?deal.settlement_legs.map(leg=>{const proof=activityForSettlementLeg(deal.deal_id,leg.id);return <article key={leg.id}><span className={`receipt-state ${leg.state.toLowerCase()}`}>{settlementStateLabel(leg.state)}</span><div><strong>{title(leg.kind)} · Worker {leg.role}</strong><small>Recipient {short(leg.recipient)}</small>{proof&&<InlineTransactionProof item={proof}/>}</div><div className="receipt-amount"><strong>{leg.amount}</strong><small>attoGEN</small></div><details className="receipt-technical"><summary>Technical details</summary><div><code>{leg.state}</code><code title={leg.receipt_id}>{short(leg.receipt_id)}</code></div></details></article>}):<p>No settlement leg exists before a contract decision.</p>}</div></section>
  </>;
}
