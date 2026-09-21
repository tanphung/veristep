import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {TxRecord} from "../../frontend/src/transactions";
import type {V2Deal} from "../../frontend/src/v2-types";

const mocks=vi.hoisted(()=>({list:vi.fn(),read:vi.fn(),history:vi.fn(),observe:vi.fn()}));
vi.mock("../../frontend/src/v2-client",()=>({listV2Deals:mocks.list,readV2Deal:mocks.read,readFinalizedWithRetry:(read:()=>Promise<unknown>)=>read()}));
vi.mock("../../frontend/src/v2-transactions",()=>({v2History:mocks.history,observeV2:mocks.observe,v2Pending:(row:TxRecord)=>["PENDING","ACCEPTED","UNKNOWN","SIGNING"].includes(row.phase)}));
vi.mock("../../frontend/src/V2Report",()=>({V2Report:()=>null}));
vi.mock("../../frontend/src/V2Actions",()=>({shouldRenderV2Actions:()=>false,V2Actions:()=>null}));
vi.mock("../../frontend/src/V2NewDeal",()=>({V2NewDeal:()=> <h2>New deal form</h2>}));
vi.mock("../../frontend/src/V2OnchainActivity",()=>({V2LifecycleActivity:()=>null,V2OnchainActivity:()=>null}));
import VeriStepApp from "../../frontend/src/VeriStepApp";

const pending={id:"create",jobId:"new-deal",method:"create_terms",phase:"ACCEPTED",hash:`0x${"ab".repeat(32)}`} as TxRecord;
beforeEach(()=>{
  vi.clearAllMocks();
  window.history.replaceState(null,"","#job=new-deal");
  mocks.list.mockResolvedValue([]);
  mocks.history.mockReturnValue([pending]);
  mocks.observe.mockResolvedValue(pending);
});
describe("new deal finality recovery",()=>{
  it("waits for creation instead of reading an absent finalized deal",async()=>{
    render(<VeriStepApp/>);
    expect(await screen.findByText(/Your signed transaction is awaiting finalized/)).toBeVisible();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"New Deal"})).toBeDisabled();
  });
  it("clears observation errors and unlocks New Deal after the same hash recovers",async()=>{
    mocks.observe.mockRejectedValueOnce(new Error("temporary receipt read failure"));
    render(<VeriStepApp/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporary receipt read failure");
    const finalized={...pending,phase:"FINALIZED_SUCCESS"};
    mocks.observe.mockImplementationOnce(async()=>{
      mocks.history.mockReturnValue([finalized]);
      mocks.list.mockResolvedValue([pending.jobId]);
      return finalized;
    });
    mocks.read.mockResolvedValue({deal_id:pending.jobId,status:"DRAFT_UNFUNDED",terms_hash:"a".repeat(64),router:"0x123",manifest:{obligations:[]},settlement_legs:[]} as unknown as V2Deal);
    await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Check same hashes"}));});
    await waitFor(()=>expect(screen.getByRole("button",{name:"New Deal"})).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith(pending.jobId,true,10);
    fireEvent.click(screen.getByRole("button",{name:"New Deal"}));
    expect(screen.getByRole("heading",{name:"New deal form"})).toBeVisible();
  });
});
