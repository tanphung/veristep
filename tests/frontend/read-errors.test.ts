import {describe,expect,it,vi} from "vitest";
import {readErrorInfo,reportReadFailure} from "../../frontend/src/read-errors";
import {readFinalizedWithRetry} from "../../frontend/src/v2-client";
import {finalizedReadError,isRateLimited} from "../../frontend/src/finalized-reads";

describe("bounded read-only RPC recovery",()=>{
  it("recovers one protocol-version error without changing RPC protocol or deployment",async()=>{
    const read=vi.fn().mockRejectedValueOnce({code:-32006,message:"Version of JSON-RPC protocol is not supported."}).mockResolvedValue("finalized");
    expect(await readFinalizedWithRetry(read,0)).toBe("finalized");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("stops after one retry when a protocol error persists",async()=>{
    const cause={cause:{code:-32006}},read=vi.fn().mockRejectedValue(cause);
    await expect(readFinalizedWithRetry(read,0)).rejects.toBe(cause);
    expect(read).toHaveBeenCalledTimes(2);
    expect(finalizedReadError(cause,"fallback")).toContain("not been refreshed");
  });
  it("finds nested rate limits and leaves the cooldown to the shared queue",async()=>{
    const cause={message:"RPC request failed",cause:{code:429}},read=vi.fn().mockRejectedValue(cause);
    expect(isRateLimited(cause)).toBe(true);
    await expect(readFinalizedWithRetry(read,0)).rejects.toBe(cause);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each([{code:-32602},{message:"Unknown RPC error",cause:{message:"V2 contract evidence domain mismatch"}},{message:"FINISHED_WITH_ERROR"}])("never retries a deterministic rejection: %j",async cause=>{
    const read=vi.fn().mockRejectedValue(cause);
    await expect(readFinalizedWithRetry(read,0)).rejects.toBe(cause);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("handles cyclic causes and logs only a minimal diagnostic",()=>{
    const cause:{code:number;cause?:unknown;message:string}={code:-32006,message:"sensitive raw response"};cause.cause=cause;
    expect(readErrorInfo(cause).kind).toBe("protocol");
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    reportReadFailure("get_terms",cause);
    expect(warn).toHaveBeenCalledWith("[VeriStep read]",expect.objectContaining({operation:"get_terms",kind:"protocol",code:-32006}));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive raw response");
    warn.mockRestore();
  });
});
