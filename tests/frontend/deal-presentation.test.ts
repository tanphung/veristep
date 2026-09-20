import {describe,expect,it} from "vitest";
import {dealLifecycleStage,dealPresentation,dealStatusLabel,sortDealIds} from "../../frontend/src/deal-presentation";
import {writesEnabled} from "../../frontend/src/client";
import deployment from "../../frontend/src/deployment.json";

describe("deal presentation",()=>{
  it("prioritizes canonical reviewer scenarios and archives recovery attempts",()=>{
    const ids=["v2-studio-a-fault-r1-358323c","v2-hosted-agent-live-1","v2-hosted-agent-live-2","v2-studio-b-fault-358323c","v2-studio-b-fault-r2-358323c","v2-studio-a-fault-r3-358323c","v2-studio-no-fault-358323c"];
    expect(sortDealIds(ids)).toEqual(["v2-studio-no-fault-358323c","v2-studio-a-fault-r3-358323c","v2-studio-b-fault-r2-358323c","v2-hosted-agent-live-2","v2-hosted-agent-live-1","v2-studio-a-fault-r1-358323c","v2-studio-b-fault-358323c"]);
    expect(dealPresentation(ids[0]).archived).toBe(true);
    expect(dealPresentation(ids[5]).label).toBe("Upstream Fault — Agent A Responsible");
    expect(dealPresentation("v2-hosted-agent-live-1").archived).toBe(true);
    expect(dealPresentation("v2-studio-b-fault-358323c").archived).toBe(true);
  });
  it("distinguishes dispatched transfers from verified settlement",()=>{
    const deal={status:"SETTLEMENT_PENDING",settlement_legs:[{state:"DISPATCHED_UNVERIFIED"} as never]};
    expect(dealStatusLabel(deal)).toBe("Transfers dispatched");
    expect(dealLifecycleStage(deal)).toBe(6);
    expect(deal.status).toBe("SETTLEMENT_PENDING");
    for(const settlement_legs of [[],[{state:"ELIGIBLE"} as never],[{state:"DISPATCHED_UNVERIFIED"} as never,{state:"ELIGIBLE"} as never]]){
      expect(dealLifecycleStage({...deal,settlement_legs})).toBe(5);
      expect(dealStatusLabel({...deal,settlement_legs})).toBe("Awaiting transfer dispatch");
    }
  });
  it("marks the audited release ready while preserving platform limitations",()=>{
    expect(writesEnabled).toBe(true);
    expect(deployment.releaseStatus).toBe("READY");
    expect(deployment.submissionReady).toBe(true);
    expect(deployment.limitations).toContain("Studio Next cannot prove a native transfer receipt inside the Intelligent Contract.");
    expect(deployment.limitations).toContain("Timeout writes remain unavailable because Studio Next simulation time has not proven the deadline predicate.");
  });
});
