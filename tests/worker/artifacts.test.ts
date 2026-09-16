import {describe, expect, it} from "vitest";
import {recoveryRequestId} from "../../worker/src/artifacts";

describe("hosted artifact recovery", () => {
  it("uses the original request id before any provider dispatch", () => {
    expect(recoveryRequestId("run:A", [null, null, null])).toBe("run:A");
  });

  it("permits exactly one named recovery after settled output was lost", () => {
    expect(recoveryRequestId("run:A", [{state: "SETTLED"}, null, null])).toBe("run:A:recovery-1");
    expect(recoveryRequestId("run:A", [{state: "SETTLED"}, {state: "SETTLED"}, null])).toBe("run:A:recovery-2");
    expect(recoveryRequestId("run:A", [{state: "SETTLED"}, {state: "SETTLED"}, {state: "UNCERTAIN", error: "HTTP 400: Invalid schema for response_format 'veristep_worker_artifact'"}])).toBe("run:A:recovery-3");
  });

  it("refuses regeneration for ambiguous provider states", () => {
    expect(() => recoveryRequestId("run:A", [{state: "DISPATCHED"}, null, null])).toThrow("unsafe");
    expect(() => recoveryRequestId("run:A", [{state: "SETTLED"}, {state: "UNCERTAIN"}, null])).toThrow("unsafe");
    expect(() => recoveryRequestId("run:A", [{state: "SETTLED"}, {state: "SETTLED"}, {state: "UNCERTAIN", error: "network failure"}])).toThrow("unsafe");
  });
});
