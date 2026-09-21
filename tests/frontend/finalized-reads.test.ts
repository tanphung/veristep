import {afterEach,describe,expect,it,vi} from "vitest";
import {createFinalizedReads} from "../../frontend/src/finalized-reads";
afterEach(()=>vi.useRealTimers());
describe("shared finalized RPC reads",()=>{
  it("starts a second slow read after 2.5 seconds, not after the first response",async()=>{
    vi.useFakeTimers();const queue=createFinalizedReads();
    let finish!:(value:string)=>void;
    const first=queue.read("slow",()=>new Promise<string>(resolve=>{finish=resolve;}));
    const fetch=vi.fn(async()=>"visible"),second=queue.read("visible",fetch);
    await vi.advanceTimersByTimeAsync(2499);expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(await second).toBe("visible");
    finish("slow done");await first;
  });
  it("caps concurrency at two and promotes the selected deal above queued scans",async()=>{
    vi.useFakeTimers();const queue=createFinalizedReads();
    let finishA!:(value:string)=>void,finishB!:(value:string)=>void;
    const a=queue.read("a",()=>new Promise<string>(resolve=>{finishA=resolve;}));
    const b=queue.read("b",()=>new Promise<string>(resolve=>{finishB=resolve;}));
    const scan=vi.fn(async()=>"scan"),selected=vi.fn(async()=>"selected");
    const c=queue.read("scan",scan,false,-1),d=queue.read("selected",selected,false,-1);
    await vi.advanceTimersByTimeAsync(2500);
    const promoted=queue.read("selected",selected,false,10);expect(promoted).toBe(d);
    await vi.advanceTimersByTimeAsync(2500);expect(scan).not.toHaveBeenCalled();expect(selected).not.toHaveBeenCalled();
    finishA("a");await a;await vi.advanceTimersByTimeAsync(0);
    expect(await d).toBe("selected");expect(scan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);expect(await c).toBe("scan");
    finishB("b");await b;
  });
  it("coalesces concurrent reads and caches only successful results",async()=>{
    const queue=createFinalizedReads(0,15000),fetch=vi.fn(async()=>({status:"finalized"}));
    const a=queue.read("deal:1",fetch),b=queue.read("deal:1",fetch);
    expect(a).toBe(b);await a;await queue.read("deal:1",fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    await queue.read("deal:1",fetch,true);expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("spaces different requests instead of sending bursts",async()=>{
    vi.useFakeTimers();const queue=createFinalizedReads(),fetch=vi.fn(async()=>1);
    const first=queue.read("a",fetch),second=queue.read("b",fetch);
    await first;expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2499);expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);await second;expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("pauses the entire queue for a rate limit and resumes the same read once",async()=>{
    vi.useFakeTimers();const queue=createFinalizedReads(),fetch=vi.fn().mockRejectedValueOnce(new Error("Rate limit exceeded: 30 requests per minute")).mockResolvedValue("ok"),other=vi.fn(async()=>"other");
    const a=queue.read("a",fetch),b=queue.read("b",other);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(1);expect(other).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);expect(await a).toBe("ok");
    await vi.advanceTimersByTimeAsync(2500);expect(await b).toBe("other");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not cache failures or retry validation errors",async()=>{
    const queue=createFinalizedReads(0),fetch=vi.fn().mockRejectedValueOnce(new Error("domain mismatch")).mockResolvedValue("valid");
    await expect(queue.read("a",fetch)).rejects.toThrow("domain mismatch");
    expect(await queue.read("a",fetch)).toBe("valid");expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("expires cached state",async()=>{
    vi.useFakeTimers();const queue=createFinalizedReads(0,15000),fetch=vi.fn(async()=>1);
    await queue.read("a",fetch);await vi.advanceTimersByTimeAsync(15001);await queue.read("a",fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
