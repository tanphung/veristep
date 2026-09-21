// Share finalized reads across components (including React StrictMode mounts).
// Keep a margin below the public endpoint's 30 requests/minute allowance.
export function createFinalizedReads(spacingMs=2500,ttlMs=15000,cooldownMs=61000){
  const cache=new Map<string,{value:unknown;expires:number}>();
  type Job={key:string;fetch:()=>Promise<unknown>;promise:Promise<unknown>;resolve:(value:unknown)=>void;reject:(cause:unknown)=>void;priority:number;retried:boolean};
  const pending=new Map<string,Job>(),queue:Job[]=[];
  let active=0,nextStart=0,timer:ReturnType<typeof setTimeout>|undefined;
  // Limit starts, not response completion: a slow read must not freeze all readers.
  function pump(){
    if(timer!==undefined){clearTimeout(timer);timer=undefined;}
    if(active>=2||!queue.length)return;
    const delay=nextStart-Date.now();
    if(delay>0){timer=setTimeout(()=>{timer=undefined;pump();},delay);return;}
    queue.sort((a,b)=>b.priority-a.priority);
    const job=queue.shift()!;active++;nextStart=Date.now()+spacingMs;
    void (async()=>{
      let retry=false;
      try{
        const value=await job.fetch();
        cache.set(job.key,{value,expires:Date.now()+ttlMs});job.resolve(value);
      }catch(cause){
        if(isRateLimited(cause)){
          nextStart=Math.max(nextStart,Date.now()+cooldownMs);
          if(!job.retried){job.retried=true;retry=true;queue.unshift(job);}
        }
        if(!retry)job.reject(cause);
      }finally{
        active--;if(!retry)pending.delete(job.key);pump();
      }
    })();
    pump();
  }
  function read<T>(key:string,fetch:()=>Promise<T>,fresh=false,priority=0):Promise<T>{
    const existing=pending.get(key);
    if(existing){existing.priority=Math.max(existing.priority,priority);return existing.promise as Promise<T>;}
    const saved=cache.get(key);
    if(!fresh&&saved&&saved.expires>Date.now())return Promise.resolve(saved.value as T);
    let resolve!:(value:unknown)=>void,reject!:(cause:unknown)=>void;
    const promise=new Promise<unknown>((yes,no)=>{resolve=yes;reject=no;});
    const job:Job={key,fetch,promise,resolve,reject,priority,retried:false};
    pending.set(key,job);queue.push(job);pump();
    return promise as Promise<T>;
  }
  return {read};
}
export function isRateLimited(cause:unknown){return /rate.?limit|too many requests|\b429\b/i.test(cause instanceof Error?cause.message:String(cause));}
export const finalizedReads=createFinalizedReads();
export function finalizedReadError(cause:unknown,fallback:string){return isRateLimited(cause)?"The network is busy. Please wait about a minute, then try again. No new transaction has been sent.":fallback;}
