import {describe,expect,it} from "vitest";
import {dealPresentation,dealStatusLabel,sortDealIds} from "../../frontend/src/deal-presentation";
import {writesEnabled} from "../../frontend/src/client";
import deployment from "../../frontend/src/deployment.json";

describe("deal presentation",()=>{
  it("prioritizes canonical reviewer scenarios and archives recovery attempts",()=>{
    const ids=["v2-studio-a-fault-r1-358323c","v2-hosted-agent-live-1","v2-studio-b-fault-358323c","v2-studio-a-fault-r3-358323c","v2-studio-no-fault-358323c"];
    expect(sortDealIds(ids)).toEqual(["v2-studio-no-fault-358323c","v2-studio-a-fault-r3-358323c","v2-studio-b-fault-358323c","v2-hosted-agent-live-1","v2-studio-a-fault-r1-358323c"]);
    expect(dealPresentation(ids[0]).archived).toBe(true);
    expect(dealPresentation(ids[3]).label).toBe("Upstream Fault — Agent A Responsible");
  });
  it("distinguishes dispatched transfers from verified settlement",()=>{
    expect(dealStatusLabel({status:"SETTLEMENT_PENDING",settlement_legs:[{state:"DISPATCHED_UNVERIFIED"} as never]})).toBe("Transfers Dispatched — Verification Pending");
  });
  it("opens verified writes without overstating submission readiness",()=>{
    expect(writesEnabled).toBe(true);
    expect(deployment.submissionReady).toBe(false);
    expect(deployment.limitations).toContain("The live B-fault scenario ended UNDETERMINED and is not claimed as a passing release gate.");
  });
});
