import {ArrowUpRight,CheckCircle2,ChevronDown,FileCheck2,Landmark,ShieldCheck,TriangleAlert} from "lucide-react";
import {short} from "./client";
import {pendingReviewCopy,settlementStateLabel} from "./deal-presentation";
import {InlineTransactionProof} from "./V2OnchainActivity";
import {activityForContext,activityForSettlementLeg,type ActivityContext} from "./onchain-activity";
import type {V2Assessment,V2Citation,V2Deal,V2Outcome,V2SourceAssessment} from "./v2-types";

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

const evidenceLabels={SOURCE:"Original source",A:"Agent A output",B:"Agent B output"};
const evidenceDescriptions={SOURCE:"The original material used for this deal.",A:"The artifact submitted by Agent A.",B:"The artifact submitted by Agent B."};

function SourceEvidenceCard({source,dealId}:{source:V2SourceAssessment;dealId:string}){
  const verified=source.status==="VERIFIED";
  const evidence=source.status==="VERIFIED"?source:source.commitment;
  const origin=source.status==="VERIFIED"?source:source.commitment?.origin;
  const label=evidenceLabels[source.artifact_id];
  return <article className="source-evidence-card">
    <div className="source-top"><span className="artifact-role">{source.artifact_id}</span>{verified?<span className="verified"><CheckCircle2 size={14}/> Verified</span>:<span className="verdict unassessable">{title(source.status)}</span>}</div>
    <strong>{label}</strong><p>{evidenceDescriptions[source.artifact_id]}</p>
    {source.status!=="VERIFIED"&&<p className="evidence-warning">{title(source.reason_code)}</p>}
    {evidence&&origin?<a href={github(origin.owner,origin.repository,evidence.commit,evidence.path)} target="_blank" rel="noreferrer">Open {source.artifact_id==="SOURCE"?"source":"output"} <ArrowUpRight size={13}/></a>:<p>Artifact unavailable</p>}
    <details className="evidence-disclosure">
      <summary aria-label={`${label}: verification details`}>Verification details <ChevronDown size={14} aria-hidden="true"/></summary>
      {evidence&&origin&&<dl>
        <div><dt>File path</dt><dd>{evidence.path}</dd></div>
        <div><dt>Repository</dt><dd>{origin.owner}/{origin.repository}</dd></div>
        <div><dt>Commit</dt><dd><code>{evidence.commit}</code></dd></div>
        <div><dt>Blob</dt><dd><code>{evidence.blob}</code></dd></div>
        <div><dt>SHA-256</dt><dd><code>{evidence.sha256}</code></dd></div>
        <div><dt>Bytes</dt><dd>{evidence.byte_length.toLocaleString()}</dd></div>
        <div><dt>Content type</dt><dd>{evidence.content_type}</dd></div>
      </dl>}
      <ArtifactTransactionProof dealId={dealId} artifactId={source.artifact_id}/>
    </details>
  </article>;
}

export function V2Report({deal}:{deal:V2Deal}){
  const report=deal.report;
  if(!report){const copy=pendingReviewCopy(deal.status);return <section className="v2-empty-review"><ShieldCheck/><div><span className="eyebrow">DEAL PROGRESS</span><h3>{copy.title}</h3><p>{copy.description}</p><ReviewTransactionProof dealId={deal.deal_id}/></div></section>;}
  const citations=new Map(report.evidence_citations.map(item=>[item.id,item]));
  const semanticFindings=report.obligation_assessments.filter(item=>item.kind==="SEMANTIC"),systemChecks=report.obligation_assessments.filter(item=>item.kind==="DETERMINISTIC");
  const systemPassed=systemChecks.filter(item=>item.status==="SATISFIED").length;
  const systemCategories=categoryOrder.filter(category=>systemChecks.some(item=>systemCategory(item.obligation_id)===category));
  return <>
    <section className="v2-decision" aria-labelledby="decision-title">
      <div className="decision-intro"><span className="eyebrow">CONTRACT DECISION</span><h2 id="decision-title">Results for each agent</h2><p>Finalized assessment from the Intelligent Contract.</p></div>
      {(["A","B"] as const).map(role=><article className="agent-result" key={role}><header><span>Agent {role}</span><em className={`verdict ${statusClass(report.decision.stages[role].outcome)}`}>{title(report.decision.stages[role].outcome)}</em></header><div className="agent-score"><strong>{score(report.score[role])}</strong><span>{report.score[role]===null?"Task requirements could not be fully assessed":"Task requirements met"}</span></div></article>)}
      <p className="score-explanation">The percentage shows task requirements satisfied, not AI confidence. System checks also affect the final outcome.</p>
      <details className="evidence-disclosure decision-audit"><summary>Decision details &amp; transactions <ChevronDown size={14} aria-hidden="true"/></summary><p>{report.reasoning}</p><ReviewTransactionProof dealId={deal.deal_id}/></details>
    </section>
    <section className="v2-section" id="provenance"><header><div><span className="eyebrow">SUPPORTING EVIDENCE</span><h2>Source and agent outputs</h2><p className="section-helper">Pinned GitHub evidence independently re-fetched by validators.</p></div><span className="count-pill">{report.source_assessments.filter(item=>item.status==="VERIFIED").length}/3 verified</span></header><div className="v2-source-grid">
      {report.source_assessments.map(source=><SourceEvidenceCard source={source} dealId={deal.deal_id} key={source.artifact_id}/>)}
    </div></section>
    <section className="v2-section" id="obligations"><header><div><span className="eyebrow">EXACT OBLIGATION SET</span><h2>Every promise accounted for</h2></div><div className="obligation-counts"><span className="count-pill">{report.obligation_assessments.length} assessed</span><small>{report.obligation_assessments.length}/{report.obligation_assessments.length} obligations accounted for</small></div></header><div className="semantic-findings"><div className="obligation-subhead"><span className="eyebrow">SEMANTIC FINDINGS</span><h3>Business and AI judgments</h3></div><div className="obligation-list semantic-list">
      {semanticFindings.map(item=><article key={item.obligation_id}><div className="obligation-main"><span className={`verdict ${statusClass(item.status)}`}>{title(item.status)}</span><div><strong>{semanticTitle(item)}</strong><small>{item.obligation_id}{item.stage?` · Stage ${item.stage}`:""}{!item.applicable?" · Not applicable":""}</small></div></div><p>{item.reason}</p><EvidenceQuotes item={item} citations={citations}/></article>)}
    </div></div><details className="system-checks"><summary><div><strong>System checks — {systemPassed}/{systemChecks.length} passed</strong><span>{systemCategories.join(" • ")}</span></div><span className="system-check-action"><span>View system checks</span><span>Hide system checks</span></span></summary><div className="system-check-list">{systemChecks.map(item=><article key={item.obligation_id}><div className="system-check-main"><span className={`verdict ${statusClass(item.status)}`}>{title(item.status)}</span><div><strong>{systemCategory(item.obligation_id)} check</strong><small>{item.obligation_id}{!item.applicable?" · Not applicable":""}</small></div></div><p>{item.reason}</p><EvidenceQuotes item={item} citations={citations}/></article>)}</div></details></section>
    {(report.findings.length>0||report.missing_items.length>0)&&<section className="v2-alert-grid">{report.findings.map(item=>{
      const assessment=report.obligation_assessments.find(row=>row.obligation_id===item.obligation_id);
      return <details className="finding-details" key={item.id}><summary><TriangleAlert className="finding-warning" size={16} aria-hidden="true"/><strong>{assessment?`${semanticTitle(assessment)} — issue found`:"Important issue found"}</strong><span className="finding-toggle"><span>View details</span><span>Hide details</span></span><ChevronDown className="finding-chevron" size={14} aria-hidden="true"/></summary><div className="finding-content"><p>{item.summary}</p><dl><div><dt>Finding ID</dt><dd>{item.id}</dd></div><div><dt>Severity</dt><dd>{item.severity}</dd></div><div><dt>Obligation</dt><dd><code>{item.obligation_id}</code></dd></div></dl>{item.citation_ids.map(id=>{const citation=citations.get(id);return citation?<blockquote key={id}><small>{id} · {citation.artifact_id} · bytes {citation.start_byte}–{citation.end_byte}</small><p>“{citation.quote}”</p></blockquote>:<p key={id}>Evidence reference: {id}</p>;})}</div></details>;
    })}{report.missing_items.map((item,index)=><article key={`${item.obligation_id}-${item.evidence_id}-${index}`}><FileCheck2/><div><span>MISSING EVIDENCE</span><strong>{item.obligation_id} / {item.evidence_id}</strong><p>{title(item.reason_code)}</p></div></article>)}</section>}
    <section className="v2-section" id="settlement"><header><div><span className="eyebrow">RECEIPT-BOUND SETTLEMENT</span><h2>Outcome and payment remain separate proofs</h2>{deal.settlement_legs.some(leg=>leg.state==="DISPATCHED_UNVERIFIED")&&<p className="section-helper">Native transfer dispatched; contract-side receipt verification is unavailable on Studio Next.</p>}</div><Landmark/></header><div className="receipt-list">{deal.settlement_legs.length?deal.settlement_legs.map(leg=>{const proof=activityForSettlementLeg(deal.deal_id,leg.id);return <article key={leg.id}><span className={`receipt-state ${leg.state.toLowerCase()}`}>{settlementStateLabel(leg.state)}</span><div><strong>{title(leg.kind)} · Worker {leg.role}</strong><small>Recipient {short(leg.recipient)}</small>{proof&&<InlineTransactionProof item={proof}/>}</div><div className="receipt-amount"><strong>{leg.amount}</strong><small>attoGEN</small></div><details className="receipt-technical"><summary>Technical details</summary><div><code>{leg.state}</code><code title={leg.receipt_id}>{short(leg.receipt_id)}</code></div></details></article>}):<p>No settlement leg exists before a contract decision.</p>}</div></section>
  </>;
}
