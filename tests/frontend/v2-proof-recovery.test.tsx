import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {canonicalReleaseProofs} from "../../frontend/src/deal-presentation";
const read=vi.hoisted(()=>vi.fn());
vi.mock("../../frontend/src/v2-client",()=>({cachedV2Deal:vi.fn(()=>undefined),cachedV2Ids:vi.fn(()=>undefined),isV2DealFresh:vi.fn(()=>false),readV2Deal:read,readFinalizedWithRetry:(fn:()=>Promise<unknown>)=>fn()}));
import {V2Compare} from "../../frontend/src/V2Compare";

it("retains three successful proofs and retries only the missing proof",async()=>{
  let offline=true;
  let failSlow!:(cause:Error)=>void;
  const missing=canonicalReleaseProofs[1].id;
  read.mockImplementation(async(id:string)=>{
    if(id===missing&&offline)return new Promise((_,reject)=>{failSlow=reject;});
    const item=canonicalReleaseProofs.find(item=>item.id===id)!;
    return {deal_id:id,status:"SETTLEMENT_PENDING",settlement_legs:[],report:{decision:{stages:{A:{outcome:item.expected.A},B:{outcome:item.expected.B}}}}};
  });
  render(<V2Compare ids={canonicalReleaseProofs.map(item=>item.id)}/>);
  await waitFor(()=>expect(screen.getAllByText("PASS")).toHaveLength(3));
  expect(screen.getByRole("status",{name:"Syncing verified examples"})).toBeVisible();
  await act(async()=>failSlow(new Error("Failed to fetch")));
  expect(screen.getByText("NOT LOADED")).toBeVisible();
  expect(screen.getByRole("link",{name:/Happy Path \/ No-fault/})).toBeVisible();
  offline=false;
  fireEvent.click(screen.getByRole("button",{name:"Retry examples"}));
  await waitFor(()=>expect(screen.getAllByText("PASS")).toHaveLength(4));
  expect(read).toHaveBeenCalledTimes(5);
  expect(read.mock.calls.filter(([id])=>id===missing)).toHaveLength(2);
  expect(screen.queryByText("NOT LOADED")).not.toBeInTheDocument();
});
