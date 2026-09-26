import {readFileSync} from "node:fs";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {V2Deal} from "../../frontend/src/v2-types";
import {canonicalReleaseProofs,dealPresentation} from "../../frontend/src/deal-presentation";
import {createFinalizedReads,finalizedReads} from "../../frontend/src/finalized-reads";
import {readClient} from "../../frontend/src/client";
import {readV2Deal} from "../../frontend/src/v2-client";
import VeriStepApp from "../../frontend/src/VeriStepApp";

vi.mock("../../frontend/src/transactions",()=>({connect:vi.fn(),disconnectWallet:vi.fn(),walletChanged:vi.fn(),watchWallet:vi.fn()}));
vi.mock("../../frontend/src/v2-transactions",()=>({observeV2:vi.fn(),v2History:()=>[],v2Pending:()=>false}));
vi.mock("../../frontend/src/V2Actions",()=>({shouldRenderV2Actions:()=>false,V2Actions:()=>null}));
vi.mock("../../frontend/src/V2Worker",()=>({V2Worker:()=>null}));
vi.mock("../../frontend/src/V2Report",()=>({V2Report:({deal}:{deal:V2Deal})=><p>Report for {deal.deal_id}</p>}));
vi.mock("../../frontend/src/V2OnchainActivity",()=>({V2LifecycleActivity:()=>null,V2OnchainActivity:()=>null}));

// Preserve the real v2 reader, validation and shared cache. Only the RPC boundary
// is stubbed, with the checked-in reports; no live transaction is sent.
const files=["studio-next-agent-tank/no-fault.deal.json","studio-next-agent-tank/a-fault.deal.json","studio-next-b-fault-final/b-fault.deal.json","studio-next-hosted-agent-final/deal.json"];
const deals=Object.fromEntries(files.map(file=>{const value=JSON.parse(readFileSync(`reports/${file}`,"utf8")) as V2Deal;return [value.deal_id,value];}));
const first=canonicalReleaseProofs[0].id,second=canonicalReleaseProofs[1].id;
let now:number,offline:boolean;
let rpc:ReturnType<typeof vi.spyOn>;
const navigate=(hash:string)=>act(()=>{window.history.replaceState(null,"",hash);window.dispatchEvent(new HashChangeEvent("hashchange"));});
beforeEach(()=>{
  now=Date.now();offline=false;
  vi.spyOn(Date,"now").mockImplementation(()=>now);
  vi.spyOn(console,"warn").mockImplementation(()=>{});
  Object.assign(finalizedReads,createFinalizedReads(0,15000));
  Element.prototype.scrollIntoView=vi.fn();
  window.history.replaceState(null,"","#view=compare");
  rpc=vi.spyOn(readClient,"readContract").mockImplementation(async({functionName,args})=>{
    if(functionName==="list_deals")return JSON.stringify({ids:Object.keys(deals),total:4});
    if(offline)throw new Error("offline");
    return JSON.stringify(deals[String(args?.[0])]);
  });
});
afterEach(()=>vi.restoreAllMocks());

describe("shared finalized deal data across screens",()=>{
  it("uses the same four RPC responses for overview, details and pair comparison within TTL",async()=>{
    render(<VeriStepApp/>);
    await waitFor(()=>expect(screen.getAllByText("PASS")).toHaveLength(4));
    const initial=rpc.mock.calls.length;
    expect(initial).toBe(5); // One list and four reports.
    navigate(`#job=${first}`);
    expect(screen.getByText(`Report for ${first}`)).toBeVisible();
    expect(screen.queryByText("Reading the VeriStep Intelligent Contract…")).not.toBeInTheDocument();
    await act(async()=>{});
    navigate(`#job=${second}`);await act(async()=>{});
    navigate("#view=compare");await act(async()=>{});
    fireEvent.click(screen.getByText("Compare two outcomes"));
    await screen.findByText("Worker A decision");
    expect(rpc).toHaveBeenCalledTimes(initial);
  });

  it("shows an expired report during failed revalidation, then recovers on Retry",async()=>{
    await readV2Deal(second);now+=15001;offline=true;
    window.history.replaceState(null,"",`#job=${second}`);
    render(<VeriStepApp/>);
    expect(screen.getByText(`Report for ${second}`)).toBeVisible();
    expect(screen.getByText(/Showing previously loaded data/)).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("not been refreshed");
    expect(screen.getByRole("heading",{name:dealPresentation(second).label})).toBeVisible();
    expect(screen.getByText(`Report for ${second}`)).toBeVisible();
    offline=false;
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    await waitFor(()=>expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(()=>expect(screen.queryByText(/Checking for updates/)).not.toBeInTheDocument());
    expect(rpc.mock.calls.filter((call:unknown[])=>(call[0] as {functionName:string}).functionName==="get_terms")).toHaveLength(3);
  });

  it("keeps all previously loaded examples and the comparison visible when RPC later fails",async()=>{
    for(const id of Object.keys(deals))await readV2Deal(id);
    now+=15001;offline=true;
    render(<VeriStepApp/>);
    expect(screen.getAllByText("PASS")).toHaveLength(4);
    await screen.findByRole("button",{name:"Retry examples"});
    expect(screen.getAllByText("PASS")).toHaveLength(4);
    fireEvent.click(screen.getByText("Compare two outcomes"));
    await screen.findByRole("button",{name:"Retry comparison"});
    expect(screen.getByText("Worker A decision")).toBeVisible();
    expect(screen.getByRole("status",{name:"Verified examples need attention"})).toBeVisible();
  });
});
