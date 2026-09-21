import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {describe,expect,it,vi} from "vitest";
import {contract,evidenceChainId,readClient} from "../../frontend/src/client";
import {listV2Deals,readFinalizedWithRetry,validateV2Deal} from "../../frontend/src/v2-client";
import {V2Report} from "../../frontend/src/V2Report";
import {V2Worker} from "../../frontend/src/V2Worker";
import {V2NewDeal} from "../../frontend/src/V2NewDeal";
import {shouldRenderV2Actions,V2Actions} from "../../frontend/src/V2Actions";
import type {V2Deal,V2Report as Report,V2SourceAssessment} from "../../frontend/src/v2-types";
vi.mock("../../frontend/src/finalized-reads",async original=>({...await original<typeof import("../../frontend/src/finalized-reads")>(),finalizedReads:{read:(_key:string,fetch:()=>Promise<unknown>)=>fetch()}}));

const hash="a".repeat(64),commit="b".repeat(40),router=`0x${"44".repeat(20)}`;
const origin={provider:"github" as const,hostname:"api.github.com" as const,owner:"tanphung",owner_id:1,repository:"veristep",repository_id:2};
const commitment={origin,commit,path:"evidence/a.txt",blob:"c".repeat(40),content_type:"text/plain" as const,encoding:"utf-8" as const,byte_length:10,sha256:hash};
const obligations=[
  {id:"SEM_A_TEST",kind:"SEMANTIC" as const,stage:"A" as const,statement:"A test",evidence_ids:["SOURCE","A"] as const},
  {id:"SYS_REVIEW",kind:"DETERMINISTIC" as const,parameters:{seconds:60}},
];
function fixture():V2Deal{return {
  deal_id:"deal-1",chain_id:Number(evidenceChainId),contract,router,status:"REVIEW_REQUESTED",terms_hash:hash,accepted:{A:true,B:true},
  manifest:{version:"veristep-2.0-rc",chain_domain:evidenceChainId,contract,router,deal_id:"deal-1",client:`0x${"11".repeat(20)}`,
    terms:{workers:{A:`0x${"22".repeat(20)}`,B:`0x${"33".repeat(20)}`},origins:{SOURCE:origin,A:origin,B:origin},source:commitment,money:{A:{fee:"10",bond:"5",penalty:"3"},B:{fee:"10",bond:"5",penalty:"3"}},windows:{accept:60,step:60,review:60,adjudication:60},max_revisions:0,semantic_obligations:[{id:"SEM_A_TEST",stage:"A",statement:"A test",evidence_ids:["SOURCE","A"]}]},
    obligations:obligations.map(item=>({...item,evidence_ids:item.evidence_ids?[...item.evidence_ids]:undefined}))},
  artifacts:{},ledger:{received:"30",routed:"0",confirmed:"0"},settlement_legs:[],
};}
function report():Report{
  const sources=(["SOURCE","A","B"] as const).map((artifact_id):V2SourceAssessment=>({artifact_id,adapter:"github-commit-v1",...origin,commit,blob:commit,path:`evidence/${artifact_id}.txt`,content_type:"text/plain",byte_length:10,sha256:hash,status:"VERIFIED"}));
  return {schema_version:"veristep-report-2",chain_domain:evidenceChainId,contract,job_id:"deal-1",review_id:hash,revision:0,terms_hash:hash,evidence_manifest_hash:hash,reviewed_at:"1",source_assessments:sources,
    obligation_assessments:obligations.map(item=>({obligation_id:item.id,kind:item.kind,stage:item.stage??null,status:"SATISFIED",applicable:true,reason:"Verified",citation_ids:[],missing_evidence_ids:[]})),findings:[],reasoning:"Contract result",evidence_citations:[],missing_items:[],score:{A:10000,B:10000},decision:{stages:{A:{outcome:"SATISFIED",entitlements:{PAYOUT:"10",REFUND:"0",BOND_RETURN:"5"}},B:{outcome:"SATISFIED",entitlements:{PAYOUT:"10",REFUND:"0",BOND_RETURN:"5"}}},next_state:"READY_FOR_SETTLEMENT"}};
}

describe("VeriStep v2 finalized-state renderer",()=>{
  it("preserves mixed role outcomes and recorded allocations while inconclusive, including after the deadline",()=>{
    const deal=fixture();deal.status="INCONCLUSIVE";deal.adjudication_deadline=1;deal.report=report();
    deal.report.decision.next_state="NEUTRAL_UNWIND_REQUIRED";
    deal.report.decision.stages.B={outcome:"UNASSESSABLE",entitlements:{PAYOUT:"0",REFUND:"10",BOND_RETURN:"5"}};
    deal.report.score.B=null;
    const original=JSON.stringify(deal);const {rerender}=render(<V2Report deal={deal}/>);
    expect(screen.getByRole("heading",{name:"Review inconclusive"})).toBeVisible();
    expect(screen.getByText(/Uncertainty alone is not treated as a violation/)).toBeVisible();
    expect(screen.getByText(/Expiry alone does not activate or dispatch transfers/)).toBeVisible();
    const a=within(screen.getByRole("article",{name:"Agent A result"})),b=within(screen.getByRole("article",{name:"Agent B result"}));
    expect(a.getByText("Satisfied")).toBeVisible();expect(b.getByText("Unassessable")).toBeVisible();
    fireEvent.click(a.getByText("Recorded entitlements · Agent A"));fireEvent.click(b.getByText("Recorded entitlements · Agent B"));
    expect(a.getByText("10 attoGEN")).toBeVisible();expect(b.getByText("10 attoGEN")).toBeVisible();
    expect(a.getByText("0 attoGEN")).toBeVisible();expect(b.getByText("0 attoGEN")).toBeVisible();
    expect(screen.queryByText("No settlement leg exists before a contract decision.")).not.toBeInTheDocument();
    expect(JSON.stringify(deal)).toBe(original);
    deal.status="SETTLEMENT_PENDING";deal.report.decision.next_state="READY_FOR_SETTLEMENT";
    deal.settlement_legs=[{id:"A:PAYOUT",role:"A",sequence:0,recipient:deal.manifest.terms.workers.A,amount:"10",kind:"PAYOUT",outcome:"SATISFIED",state:"ELIGIBLE",receipt_id:hash}];
    rerender(<V2Report deal={deal}/>);
    expect(screen.queryByRole("heading",{name:"Review inconclusive"})).not.toBeInTheDocument();
    expect(screen.getByText(/settlement pending does not mean paid/)).toBeVisible();
    expect(screen.getByText("Eligible for dispatch")).toBeVisible();
    expect(b.getByText("Unassessable")).toBeVisible();
  });
  it("shows both neutral adjudication timeout roles without inventing a semantic verdict",()=>{
    const deal=fixture();deal.status="SETTLEMENT_PENDING";deal.report=report();
    for(const role of ["A","B"] as const){deal.report.decision.stages[role]={outcome:"UNASSESSABLE",entitlements:{PAYOUT:"0",REFUND:"10",BOND_RETURN:"5"}};deal.report.score[role]=null;}
    render(<V2Report deal={deal}/>);
    expect(screen.getAllByText("Unassessable")).toHaveLength(2);expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:/appeal|re-review|submit more evidence/i})).not.toBeInTheDocument();
  });
  it("collapses the entire finding while keeping its evidence available",()=>{
    const deal=fixture();deal.report=report();
    deal.report.findings=[{id:"F001",obligation_id:"SEM_A_TEST",severity:"MATERIAL",summary:"Agent A changed the approval requirement.",citation_ids:["C001"]}];
    deal.report.evidence_citations=[{id:"C001",obligation_id:"SEM_A_TEST",artifact_id:"A",sha256:hash,start_byte:0,end_byte:17,quote:"Approval required"}];
    render(<V2Report deal={deal}/>);
    const toggle=screen.getByText("Agent A test — issue found");
    expect(toggle).toBeVisible();
    expect(screen.getByText("Agent A changed the approval requirement.")).not.toBeVisible();
    expect(screen.getByText("F001")).not.toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText("Agent A changed the approval requirement.")).toBeVisible();
    expect(screen.getByText("F001")).toBeVisible();
    expect(screen.getByText("“Approval required”")).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText("Agent A changed the approval requirement.")).not.toBeVisible();
  });
  it("does not invent a report while consensus is pending",()=>{render(<V2Report deal={fixture()}/>);expect(screen.getByText("Review requested — no finalized report")).toBeInTheDocument();expect(screen.queryByText("100%")).not.toBeInTheDocument();});
  it("explains the funding step before review for a new deal",()=>{const deal=fixture();deal.status="DRAFT_UNFUNDED";render(<V2Report deal={deal}/>);expect(screen.getByText("Deal created — awaiting funding")).toBeVisible();expect(screen.getByText(/client must fund the worker fees/)).toBeVisible();});
  it("accepts a report only when it covers the exact frozen obligation set",()=>{const deal=fixture();deal.report=report();render(<V2Report deal={deal}/>);expect(screen.getByText("Pinned GitHub evidence independently re-fetched by validators.")).toBeVisible();expect(validateV2Deal(deal,"deal-1")).toBe(deal);deal.report.obligation_assessments.pop();expect(()=>validateV2Deal(deal,"deal-1")).toThrow("exact obligation set");});
  it("rejects a source assessment outside the canonical GitHub API host",()=>{const deal=fixture();deal.report=report();const source=deal.report.source_assessments[0];if(source.status!=="VERIFIED")throw new Error("fixture source must be verified");source.hostname="github.com" as "api.github.com";expect(()=>validateV2Deal(deal,"deal-1")).toThrow("source provenance");});
  it("renders a timeout report without pretending unavailable sources were verified",()=>{const deal=fixture();const value=report();value.source_assessments=value.source_assessments.map((source)=>({artifact_id:source.artifact_id,status:"NOT_VERIFIED",commitment,reason_code:"ACCEPTANCE_TIMEOUT"}));deal.report=value;render(<V2Report deal={deal}/>);expect(screen.getByText("0/3 verified")).toBeInTheDocument();expect(screen.getAllByText("Not verified")).toHaveLength(3);expect(screen.getAllByText("Acceptance timeout")).toHaveLength(3);});
  it("leads with semantic findings and keeps every deterministic check in a collapsed audit layer",()=>{const deal=fixture();deal.report=report();render(<V2Report deal={deal}/>);expect(screen.getByText("Business and AI judgments")).toBeInTheDocument();expect(screen.getByText("Agent A test")).toBeVisible();const semanticId=screen.getByText((_,element)=>element?.tagName==="SMALL"&&element.textContent?.startsWith("SEM_A_TEST")===true);expect(semanticId.tagName).toBe("SMALL");expect(screen.getByText("2 assessed")).toBeVisible();expect(screen.getByText("2/2 obligations accounted for")).toBeVisible();expect(screen.getByText("System checks — 1/1 passed")).toBeVisible();expect(screen.getByText("Review")).toBeVisible();expect(screen.getByText("SYS_REVIEW")).not.toBeVisible();fireEvent.click(screen.getByText("View system checks"));expect(screen.getByText("SYS_REVIEW")).toBeVisible();expect(screen.getByText("Review check")).toBeVisible();});
  it("enables hosted delivery only when production health matches the frozen deal",async()=>{const deal=fixture();deal.status="FUNDED";const fetchMock=vi.fn(async()=>({ok:true,json:async()=>({ready:true,network:{chainId:Number(evidenceChainId),contract,workers:deal.manifest.terms.workers}})}));vi.stubGlobal("fetch",fetchMock);localStorage.clear();render(<V2Worker deal={deal} account={deal.manifest.client as `0x${string}`}/>);await waitFor(()=>expect(screen.getByText("SERVICE READY")).toBeInTheDocument());expect(screen.getByRole("button",{name:/Start A\/B delivery/})).toBeEnabled();vi.unstubAllGlobals();});
  it("explains that hosted agents are real server-side transaction actors",async()=>{const deal=fixture();const fetchMock=vi.fn(async()=>({ok:true,json:async()=>({ready:true,network:{chainId:Number(evidenceChainId),contract,workers:deal.manifest.terms.workers}})}));vi.stubGlobal("fetch",fetchMock);localStorage.clear();render(<V2Worker deal={deal}/>);expect(screen.getByText(/real backend agents/)).toBeInTheDocument();expect(screen.getByText(/server-side OpenAI API/)).toBeInTheDocument();expect(screen.getByText(/signs its own transaction/)).toBeInTheDocument();vi.unstubAllGlobals();});
  it("keeps finalized hosted proof valid when current worker health is unavailable",async()=>{const deal=fixture();deal.deal_id="v2-hosted-agent-live-2";deal.status="SETTLEMENT_PENDING";deal.report=report();vi.stubGlobal("fetch",vi.fn(async()=>{throw new Error("offline");}));localStorage.clear();render(<V2Worker deal={deal}/>);expect(screen.getByText("FINALIZED PROOF")).toBeVisible();await waitFor(()=>expect(screen.getByText("Current worker health unavailable.")).toBeVisible());expect(screen.queryByText("SERVICE UNAVAILABLE")).not.toBeInTheDocument();expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();vi.unstubAllGlobals();});
  it("labels dispatched native transfers without claiming payment confirmation",()=>{const deal=fixture();deal.status="SETTLEMENT_PENDING";deal.report=report();deal.settlement_legs=[{id:"A:PAYOUT",role:"A",sequence:0,recipient:deal.manifest.terms.workers.A,amount:"10",kind:"PAYOUT",outcome:"SATISFIED",state:"DISPATCHED_UNVERIFIED",receipt_id:hash}];render(<V2Report deal={deal}/>);expect(screen.getByText("Dispatched · receipt unverified")).toBeVisible();expect(screen.getByText("Native transfer dispatched; contract-side receipt verification is unavailable on Studio Next.")).toBeVisible();expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument();fireEvent.click(screen.getByText("Technical details"));expect(screen.getByText("DISPATCHED_UNVERIFIED")).toBeInTheDocument();});
  it("keeps complete evidence and transaction proof available in expandable details",()=>{
    const deal=fixture();deal.deal_id="v2-studio-no-fault-358323c";deal.report=report();
    deal.settlement_legs=[{id:"A:PAYOUT",role:"A",sequence:0,recipient:deal.manifest.terms.workers.A,amount:"10",kind:"PAYOUT",outcome:"SATISFIED",state:"DISPATCHED_UNVERIFIED",receipt_id:hash}];
    const {container}=render(<V2Report deal={deal}/>);
    expect(screen.getByText("Original source")).toBeVisible();
    expect(screen.getByText(/not AI confidence/)).toBeVisible();
    expect(screen.getByRole("link",{name:"Open source"})).toHaveAttribute("href",`https://github.com/tanphung/veristep/blob/${commit}/evidence/SOURCE.txt`);
    expect(screen.getByText("Deal created")).not.toBeVisible();
    expect(screen.getByText("Contract result")).not.toBeVisible();
    expect(screen.getByText("evidence/SOURCE.txt")).not.toBeVisible();
    const disclosures=container.querySelectorAll<HTMLDetailsElement>(".evidence-disclosure");
    expect(disclosures).toHaveLength(4);
    disclosures.forEach(details=>fireEvent.click(details.querySelector("summary")!));
    for(const label of ["Deal created","Agent A accepted","Agent B submitted","Review requested","Review resolved","Agent A payout dispatched","Contract result","evidence/SOURCE.txt"]){expect(screen.getByText(label)).toBeVisible();}
    expect(screen.getAllByText(hash)).toHaveLength(3);
    screen.getAllByText(hash).forEach(element=>expect(element).toBeVisible());
    expect(screen.getAllByRole("link",{name:/View tx/}).length).toBeGreaterThanOrEqual(9);
    disclosures.forEach(details=>fireEvent.click(details.querySelector("summary")!));
    expect(screen.getByText("Deal created")).not.toBeVisible();
    expect(screen.getByText("Review resolved")).not.toBeVisible();
    expect(screen.getByText("Agent A payout dispatched")).toBeVisible();
  });
  it("withholds an expired timeout action while no-broadcast simulation is before its deadline",()=>{const deal=fixture();deal.adjudication_deadline=1;render(<V2Actions deal={deal} account={deal.manifest.client as `0x${string}`} busy={false} onSubmitted={()=>undefined}/>);expect(screen.getByRole("status")).toHaveTextContent("Timeout signing is unavailable");expect(screen.queryByRole("button",{name:/Apply frozen timeout rule/})).not.toBeInTheDocument();});
  it("hides the participant action shell for finalized reviewer-only records",()=>{const deal=fixture();deal.status="SETTLEMENT_PENDING";deal.report=report();deal.settlement_legs=[];expect(shouldRenderV2Actions(deal)).toBe(false);expect(shouldRenderV2Actions(deal,deal.manifest.client as `0x${string}`)).toBe(false);deal.status="FUNDED";expect(shouldRenderV2Actions(deal)).toBe(true);});
  it("presents three reviewer-ready templates while keeping immutable evidence config non-editable",()=>{const {container}=render(<V2NewDeal account={`0x${"11".repeat(20)}`} onClose={()=>undefined} onSubmitted={()=>undefined}/>);fireEvent.change(screen.getByLabelText("Worker A wallet"),{target:{value:`0x${"22".repeat(20)}`}});fireEvent.change(screen.getByLabelText("Worker B wallet"),{target:{value:`0x${"33".repeat(20)}`}});fireEvent.click(screen.getByRole("button",{name:/Continue/}));expect(screen.getAllByRole("radio")).toHaveLength(3);expect(screen.getByText(/Select a card below/)).toBeVisible();expect(screen.queryByLabelText("Source repository")).not.toBeInTheDocument();const repo=container.querySelector<HTMLInputElement>('input[name="sourceRepo"]'),commitInput=container.querySelector<HTMLInputElement>('input[name="sourceCommit"]'),pathInput=container.querySelector<HTMLInputElement>('input[name="sourcePath"]'),snapshotPath=()=>container.querySelector<HTMLElement>(".source-snapshot code");expect(repo).toHaveAttribute("type","hidden");expect(repo).toHaveValue("veristep-evidence");expect(commitInput).toHaveValue("5502b42323eb533306dbae2c82cf0e0f25b6cd8b");expect(snapshotPath()).toHaveTextContent("templates/export-rights.md");fireEvent.click(screen.getByRole("radio",{name:/Refund Policy/}));expect(pathInput).toHaveValue("templates/refund-policy.md");expect(snapshotPath()).toHaveTextContent("templates/refund-policy.md");fireEvent.click(screen.getByText("View source and repository details"));expect(screen.getByText("5502b42323eb533306dbae2c82cf0e0f25b6cd8b")).toBeVisible();});
  it("paginates the complete finalized deal list",async()=>{const ids=Array.from({length:55},(_,index)=>`deal-${index}`),spy=vi.spyOn(readClient,"readContract");spy.mockResolvedValueOnce(JSON.stringify({total:55,ids:ids.slice(0,50)})).mockResolvedValueOnce(JSON.stringify({total:55,ids:ids.slice(50)}));await expect(listV2Deals()).resolves.toEqual(ids);expect(spy).toHaveBeenCalledTimes(2);spy.mockRestore();});
  it("fails closed if pagination total changes between finalized reads",async()=>{const spy=vi.spyOn(readClient,"readContract");spy.mockResolvedValueOnce(JSON.stringify({total:51,ids:Array.from({length:50},(_,index)=>`deal-${index}`)})).mockResolvedValueOnce(JSON.stringify({total:52,ids:["deal-50"]}));await expect(listV2Deals()).rejects.toThrow("changed while paging");spy.mockRestore();});
  it("retries one transient finalized RPC read without retrying contract validation",async()=>{let calls=0;await expect(readFinalizedWithRetry(async()=>{calls+=1;if(calls===1)throw new Error("An unknown RPC error occurred.");return "finalized";},0)).resolves.toBe("finalized");expect(calls).toBe(2);});
});
