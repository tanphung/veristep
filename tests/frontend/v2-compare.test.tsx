import {render,screen,waitFor} from "@testing-library/react";
import {describe,expect,it,vi} from "vitest";
import type {V2Deal} from "../../frontend/src/v2-types";

vi.mock("../../frontend/src/v2-client",()=>({readV2Deal:vi.fn(async(id:string)=>({deal_id:id,status:id==="left"?"COMPLETED":"SETTLEMENT_PENDING",manifest:{obligations:[{},{}]},settlement_legs:[],report:undefined} as unknown as V2Deal))}));
import {V2Compare} from "../../frontend/src/V2Compare";

describe("V2 comparison",()=>{
  it("compares finalized contract fields without manufacturing verdicts",async()=>{render(<V2Compare ids={["left","right"]}/>);await waitFor(()=>expect(screen.getByText("COMPLETED")).toBeInTheDocument());expect(screen.getByText("SETTLEMENT PENDING")).toBeInTheDocument();expect(screen.getByText(/only finalized Intelligent Contract state/i)).toBeInTheDocument();expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);});
});
