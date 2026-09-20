import {beforeEach,describe,expect,it,vi} from "vitest";
import {abi} from "genlayer-js";
import receipt from "../../reports/studio-next-agent-tank/no-fault-create.receipt.json";
import {chain,contract,readClient} from "../../frontend/src/client";
import {readV2Deal} from "../../frontend/src/v2-client";
import {observeV2,v2History,v2HistoryKey,v2Pending} from "../../frontend/src/v2-transactions";
import type {TxRecord} from "../../frontend/src/transactions";
import type {V2Deal} from "../../frontend/src/v2-types";

vi.mock("../../frontend/src/v2-client",()=>({readV2Deal:vi.fn()}));
const call=abi.calldata.decode(Uint8Array.from(receipt.data.calldata.raw)) as Map<string,unknown>;
const record:TxRecord={id:"existing-create",jobId:(call.get("args") as string[])[0],method:"create_terms",account:receipt.from_address,chainId:chain.id,contract,value:"0",phase:"ACCEPTED",hash:receipt.hash as NonNullable<TxRecord["hash"]>,createdAt:1};
beforeEach(()=>{
  vi.restoreAllMocks();
  localStorage.setItem(v2HistoryKey,JSON.stringify([record]));
  vi.spyOn(readClient,"getTransaction").mockResolvedValue(receipt as never);
  vi.mocked(readV2Deal).mockReset().mockResolvedValue({manifest:{client:record.account},settlement_legs:[]} as unknown as V2Deal);
});
describe("v2 receipt recovery with real Studio Next calldata",()=>{
  it("recovers an existing accepted create without another signature",async()=>{
    expect(call.get("")).toBe("create_terms");
    expect(call.has("method")).toBe(false);
    expect((await observeV2(record)).phase).toBe("FINALIZED_SUCCESS");
    expect(v2History()[0].hash).toBe(record.hash);
    expect(v2History().some(v2Pending)).toBe(false);
    expect(readV2Deal).toHaveBeenCalledWith(record.jobId);
  });
  it.each(["method","jobId"] as const)("keeps another %s blocked",async field=>{
    await expect(observeV2({...record,[field]:"wrong"})).rejects.toThrow("another v2 operation");
    expect(readV2Deal).not.toHaveBeenCalled();
    expect(v2History()[0]).toEqual(record);
  });
  it("retains the hash until finalized state can be read, then recovers",async()=>{
    vi.mocked(readV2Deal).mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(observeV2(record)).rejects.toThrow("RPC unavailable");
    expect(v2History()[0]).toEqual(record);
    expect((await observeV2(record)).phase).toBe("FINALIZED_SUCCESS");
  });
  it("does not read the new deal while its receipt is only accepted",async()=>{
    vi.mocked(readClient.getTransaction).mockResolvedValue({...receipt,statusName:"ACCEPTED",status:"ACCEPTED"} as never);
    expect((await observeV2(record)).phase).toBe("ACCEPTED");
    expect(readV2Deal).not.toHaveBeenCalled();
    expect(v2History().some(v2Pending)).toBe(true);
  });
});
