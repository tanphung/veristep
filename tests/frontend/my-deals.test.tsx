import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {V2MyDeals} from "../../frontend/src/V2MyDeals";
import type {V2Deal} from "../../frontend/src/v2-types";

const read=vi.hoisted(()=>vi.fn());
vi.mock("../../frontend/src/v2-client",()=>({readV2Deal:read,readFinalizedWithRetry:(fn:()=>Promise<unknown>)=>fn()}));
const wallet="0xAbC",other="0xDef";
const deal=(id:string,client:string)=>({deal_id:id,manifest:{client},status:"DRAFT_UNFUNDED",settlement_legs:[]} as unknown as V2Deal);
beforeEach(()=>read.mockReset());
describe("wallet-scoped deals",()=>{
  it("does not scan deals before a wallet connects",()=>{
    render(<V2MyDeals ids={["one"]} selected=""/>);
    expect(screen.getByText(/Connect your wallet/)).toBeVisible();
    expect(read).not.toHaveBeenCalled();
  });
  it("finds owned deals from chain state without local history and excludes others",async()=>{
    read.mockImplementation(async(id:string)=>deal(id,id==="mine"?wallet.toLowerCase():other));
    render(<V2MyDeals account={wallet} ids={["mine","theirs"]} selected="mine"/>);
    const link=await screen.findByRole("link",{name:/mine/});
    expect(link).toHaveAttribute("href","#job=mine");
    expect(link).toHaveClass("active");
    expect(link).toHaveTextContent("Awaiting funding");
    expect(screen.queryByRole("link",{name:/theirs/})).not.toBeInTheDocument();
  });
  it("discards late results after a wallet change or disconnect",async()=>{
    let finish!:(value:V2Deal)=>void;
    read.mockImplementationOnce(()=>new Promise<V2Deal>(resolve=>{finish=resolve;}));
    const ids=["mine"];
    const {rerender}=render(<V2MyDeals account={wallet} ids={ids} selected=""/>);
    read.mockResolvedValue(deal("mine",wallet));
    rerender(<V2MyDeals account={other} ids={ids} selected=""/>);
    await screen.findByText(/No deals yet/);
    await act(async()=>finish(deal("mine",wallet)));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<V2MyDeals ids={ids} selected=""/>);
    expect(screen.getByText(/Connect your wallet/)).toBeVisible();
  });
  it("reports incomplete reads instead of claiming there are no deals and allows retry",async()=>{
    read.mockRejectedValueOnce(new Error("offline"));
    render(<V2MyDeals account={wallet} ids={["mine"]} selected=""/>);
    const retry=await screen.findByRole("button",{name:"Retry my deals"});
    expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
    read.mockResolvedValue(deal("mine",wallet));
    fireEvent.click(retry);
    await waitFor(()=>expect(screen.getByRole("link",{name:/mine/})).toBeVisible());
  });
});
