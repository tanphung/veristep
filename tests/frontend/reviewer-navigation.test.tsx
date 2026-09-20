import {act,render,screen,waitFor,within} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {V2Deal} from "../../frontend/src/v2-types";
import {canonicalReleaseProofs} from "../../frontend/src/deal-presentation";

const deals=Object.fromEntries(canonicalReleaseProofs.map(item=>[item.id,{deal_id:item.id,status:"SETTLEMENT_PENDING",manifest:{obligations:[]},settlement_legs:[],report:{decision:{stages:{A:{outcome:item.expected.A},B:{outcome:item.expected.B}}},source_assessments:[],findings:[]}} as unknown as V2Deal]));
vi.mock("../../frontend/src/v2-client",()=>({listV2Deals:vi.fn(async()=>Object.keys(deals)),readV2Deal:vi.fn(async(id:string)=>deals[id]),readFinalizedWithRetry:vi.fn((read:()=>Promise<unknown>)=>read())}));
vi.mock("../../frontend/src/transactions",()=>({connect:vi.fn(),walletChanged:vi.fn(),watchWallet:vi.fn()}));
vi.mock("../../frontend/src/v2-transactions",()=>({observeV2:vi.fn(),v2History:vi.fn(()=>[]),v2Pending:vi.fn(()=>false)}));
import VeriStepApp from "../../frontend/src/VeriStepApp";
import {listV2Deals} from "../../frontend/src/v2-client";

describe("reviewer navigation",()=>{
  it("keeps custom deals out of Demo and collapses recovery history",async()=>{
    vi.mocked(listV2Deals).mockResolvedValueOnce([...Object.keys(deals),"evidence-other-wallet","v2-hosted-agent-live-1"]);
    render(<VeriStepApp/>);
    await waitFor(()=>expect(within(screen.getByRole("navigation",{name:"Verified VeriStep scenarios"})).getAllByRole("link")).toHaveLength(4));
    expect(screen.queryByText("evidence-other-wallet")).not.toBeInTheDocument();
    expect(screen.getByText("Technical history").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/Connect your wallet to see deals/)).toBeVisible();
  });
  beforeEach(()=>{window.history.replaceState(null,"","#view=compare");});
  it("keeps stable navigation in the navbar while opening the reviewer view through the primary CTA",async()=>{render(<VeriStepApp/>);const cta=screen.getAllByRole("link",{name:/Verify live cases/}).find(link=>link.classList.contains("nav-verify"));expect(cta).toHaveAttribute("href","#view=compare");expect(screen.getByRole("link",{name:"How it works"})).toHaveAttribute("href","#workflow");expect(screen.getByRole("link",{name:"Agents"})).toHaveAttribute("href","#workspace");expect(screen.getByRole("link",{name:"Why GenLayer"})).toHaveAttribute("href","#boundary");expect(screen.queryByRole("link",{name:"Studio Next"})).not.toBeInTheDocument();expect(screen.queryByRole("link",{name:"Product"})).not.toBeInTheDocument();expect(screen.queryByRole("link",{name:"Validator proof"})).not.toBeInTheDocument();expect(screen.queryByRole("link",{name:"On-chain proof"})).not.toBeInTheDocument();await waitFor(()=>expect(screen.getByRole("heading",{name:"Four finalized proofs"})).toBeVisible());expect(screen.getAllByText("PASS")).toHaveLength(4);});
  it("keeps reviewer state while an in-page anchor changes the hash",async()=>{render(<VeriStepApp/>);await waitFor(()=>expect(screen.getByRole("heading",{name:"Four finalized proofs"})).toBeVisible());act(()=>{window.history.replaceState(null,"","#workflow");window.dispatchEvent(new HashChangeEvent("hashchange"));});expect(screen.getByRole("heading",{name:"Four finalized proofs"})).toBeVisible();});
});
