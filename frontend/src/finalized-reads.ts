// Share finalized reads across components (including React StrictMode mounts).
// Keep a margin below the public endpoint's 30 requests/minute allowance.
export function createFinalizedReads(spacingMs=2500,ttlMs=15000,cooldownMs=61000){
  const cache=new Map<string,{value:unknown;expires:number}>();
  const pending=new Map<string,Promise<unknown>>();
  let tail:Promise<unknown>=Promise.resolve(),nextStart=0;
  const wait=async()=>{const delay=nextStart-Date.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));};
  function read<T>(key:string,fetch:()=>Promise<T>,fresh=false):Promise<T>{
    const existing=pending.get(key);if(existing)return existing as Promise<T>;
    const saved=cache.get(key);
    if(!fresh&&saved&&saved.expires>Date.now())return Promise.resolve(saved.value as T);
    const result=tail.then(async()=>{
      await wait();nextStart=Date.now()+spacingMs;
      let value:T;
      try{value=await fetch();}
      catch(cause){
        if(!isRateLimited(cause))throw cause;
        nextStart=Date.now()+cooldownMs;
        await wait();nextStart=Date.now()+spacingMs;
        try{value=await fetch();}catch(retryError){if(isRateLimited(retryError))nextStart=Date.now()+cooldownMs;throw retryError;}
      }
      cache.set(key,{value,expires:Date.now()+ttlMs});return value;
    });
    pending.set(key,result);tail=result.catch(()=>{});
    void result.finally(()=>{pending.delete(key);}).catch(()=>{});
    return result;
  }
  return {read};
}
export function isRateLimited(cause:unknown){return /rate.?limit|too many requests|\b429\b/i.test(cause instanceof Error?cause.message:String(cause));}
export const finalizedReads=createFinalizedReads();
export function finalizedReadError(cause:unknown,fallback:string){return isRateLimited(cause)?"The network is busy. Please wait about a minute, then try again. No new transaction has been sent.":fallback;}
