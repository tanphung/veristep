import {render,screen,waitFor} from "@testing-library/react";
import {describe,expect,it,vi} from "vitest";
import type {V2Deal} from "../../frontend/src/v2-types";

const expected:Record<string,{A:string;B:string}>={"v2-studio-no-fault-358323c":{A:"SATISFIED",B:"SATISFIED"},"v2-studio-a-fault-r3-358323c":{A:"VIOLATED",B:"SATISFIED"},"v2-studio-b-fault-r2-358323c":{A:"SATISFIED",B:"VIOLATED"},"v2-hosted-agent-live-2":{A:"SATISFIED",B:"SATISFIED"}};
vi.mock("../../frontend/src/v2-client",()=>({readV2Deal:vi.fn(async(id:string)=>({deal_id:id,status:id==="left"?"COMPLETED":"SETTLEMENT_PENDING",manifest:{obligations:[{},{}]},settlement_legs:[],report:expected[id]?{decision:{stages:{A:{outcome:expected[id].A},B:{outcome:expected[id].B}}},source_assessments:[],findings:[]}:undefined} as unknown as V2Deal)),readFinalizedWithRetry:vi.fn((read:()=>Promise<unknown>)=>read())}));
import {V2Compare} from "../../frontend/src/V2Compare";

describe("V2 comparison",()=>{
  it("compares finalized contract fields without manufacturing verdicts",async()=>{render(<V2Compare ids={["left","right"]}/>);await waitFor(()=>expect(screen.getByText("Completed")).toBeInTheDocument());expect(screen.getAllByText("Settlement pending").length).toBeGreaterThan(0);expect(screen.getByText(/only finalized Intelligent Contract state/i)).toBeInTheDocument();expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);});
  it("shows four canonical verified proofs from authoritative deal reports",async()=>{render(<V2Compare ids={Object.keys(expected)}/>);await waitFor(()=>expect(screen.getAllByText("PASS")).toHaveLength(4));expect(screen.getByText("Happy Path / No-fault")).toBeVisible();expect(screen.getByText("Upstream Fault / A-fault")).toBeVisible();expect(screen.getByText("Downstream Fault / B-fault")).toBeVisible();expect(screen.getByText("Autonomous Handoff / Hosted Agent")).toBeVisible();expect(screen.getAllByText("VIOLATED").length).toBeGreaterThanOrEqual(2);});
});
