import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {V2MyDeals} from "../../frontend/src/V2MyDeals";
import type {V2Deal} from "../../frontend/src/v2-types";

const read=vi.hoisted(()=>vi.fn());
vi.mock("../../frontend/src/v2-client",()=>({readV2Deal:read,readFinalizedWithRetry:(fn:()=>Promise<unknown>)=>fn()}));
const wallet="0xAbC",other="0xDef";
const deal=(id:string,client:string)=>({deal_id:id,manifest:{client},status:"DRAFT_UNFUNDED",settlement_legs:[]} as unknown as V2Deal);
beforeEach(()=>{read.mockReset();});
describe("wallet-scoped deals",()=>{
  it("never claims no deals during a 3-second list load and a 12-second ownership scan",async()=>{
    vi.useFakeTimers();
    try{
      read.mockImplementation((id:string)=>new Promise(resolve=>setTimeout(()=>resolve(deal(id,wallet)),12000)));
      const {rerender}=render(<V2MyDeals account={wallet} ids={[]} idsReady={false} selected=""/>);
      const expectSync=()=>{expect(screen.getByRole("status")).toHaveTextContent("Syncing your deals");expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();};
      expectSync();
      await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
      expectSync();
      rerender(<V2MyDeals account={wallet} ids={["mine"]} idsReady selected=""/>);
      await act(async()=>{await vi.advanceTimersByTimeAsync(11999);});
      expectSync();
      await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
      expect(screen.getByRole("link",{name:/mine/})).toBeVisible();
      expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
    }finally{vi.useRealTimers();}
  });
  it("scans again when the same wallet reconnects after an earlier empty result",async()=>{
    const {rerender}=render(<V2MyDeals account={wallet} ids={[]} idsReady selected=""/>);
    await screen.findByText(/No deals yet/);
    rerender(<V2MyDeals ids={[]} idsReady={false} selected=""/>);
    rerender(<V2MyDeals account={wallet} ids={[]} idsReady={false} selected=""/>);
    expect(screen.getByRole("status")).toHaveTextContent("Syncing your deals");
    expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
    read.mockResolvedValue(deal("mine",wallet));
    rerender(<V2MyDeals account={wallet} ids={["mine"]} idsReady selected=""/>);
    expect(await screen.findByRole("link",{name:/mine/})).toBeVisible();
  });
  it("waits for the global list before reporting an empty wallet",async()=>{
    const {rerender}=render(<V2MyDeals account={wallet} ids={[]} idsReady={false} selected=""/>);
    await act(async()=>{});
    expect(screen.getByRole("status")).toHaveTextContent("Syncing your deals");
    expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    read.mockResolvedValue(deal("mine",wallet));
    rerender(<V2MyDeals account={wallet} ids={["mine"]} idsReady selected=""/>);
    expect(await screen.findByRole("link",{name:/mine/})).toBeVisible();
  });
  it("shows progress while the wallet connection is still pending",()=>{
    render(<V2MyDeals connecting ids={[]} idsReady={false} selected=""/>);
    expect(screen.getByRole("status")).toHaveTextContent("Connecting wallet");
    expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
  });
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
  it("shows a clear sync indicator and keeps results when IDs are recreated with the same contents",async()=>{
    let finish!:(value:V2Deal)=>void;
    read.mockImplementationOnce(()=>new Promise<V2Deal>(resolve=>{finish=resolve;}));
    const {rerender}=render(<V2MyDeals account={wallet} ids={["mine"]} selected=""/>);
    expect(screen.getByRole("status")).toHaveTextContent("Syncing your deals from GenLayer");
    expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
    await act(async()=>finish(deal("mine",wallet)));
    await screen.findByRole("link",{name:/mine/});
    rerender(<V2MyDeals account={wallet} ids={["mine"]} selected=""/>);
    expect(screen.getByRole("link",{name:/mine/})).toBeVisible();
    expect(read).toHaveBeenCalledTimes(1);
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
