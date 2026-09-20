import {useEffect,useState} from "react";
import {LoaderCircle} from "lucide-react";
import {jobHref} from "./client";
import {readFinalizedWithRetry,readV2Deal} from "./v2-client";
import {canonicalReleaseProofs,dealPresentation,dealStatusLabel} from "./deal-presentation";
import type {V2Deal} from "./v2-types";

export function V2MyDeals({account,ids,selected}:{account?:string;ids:string[];selected:string}){
  const [result,setResult]=useState<{account:string;deals:V2Deal[];loading:boolean;failed:boolean}>();
  const [retry,setRetry]=useState(0);
  const idsKey=ids.join("\u0000");
  useEffect(()=>{
    if(!account)return;
    let cancelled=false;
    setResult(previous=>({account,deals:previous?.account===account?previous.deals:[],loading:true,failed:false}));
    void (async()=>{
      const owned:V2Deal[]=[];let failed=false;
      // The deployed contract lists IDs globally; verify ownership from finalized state.
      const personalIds=ids.filter(id=>!canonicalReleaseProofs.some(item=>item.id===id)&&!dealPresentation(id).archived);
      for(let offset=0;offset<personalIds.length;offset+=4){
        if(cancelled)return;
        const batch=await Promise.allSettled(personalIds.slice(offset,offset+4).map(id=>readFinalizedWithRetry(()=>readV2Deal(id))));
        for(const item of batch){
          if(item.status==="rejected"){failed=true;continue;}
          if(item.value.manifest.client.toLowerCase()===account.toLowerCase())owned.push(item.value);
        }
      }
      if(!cancelled)setResult({account,deals:owned,loading:false,failed});
    })();
    return()=>{cancelled=true;};
  },[account,idsKey,retry]);
  const current=result?.account===account?result:undefined;
  return <section className="my-deals" aria-label="My deals"><strong>My deals</strong>
    {!account?<p className="meta">Connect your wallet to see deals you created.</p>:<>
      {(!current||current.loading)&&<p className="meta my-deals-loading" role="status"><LoaderCircle className="spinning" aria-hidden="true"/> Syncing your deals from GenLayer… Previously created deals will appear here when the scan finishes.</p>}
      {current&&<>
        {!current.loading&&current.failed&&<p className="meta" role="status">Some deals could not be checked. <button onClick={()=>setRetry(value=>value+1)}>Retry my deals</button></p>}
        {!current.loading&&!current.failed&&!current.deals.length&&<p className="meta">No deals yet for this wallet. Select New Deal to create one.</p>}
        <nav aria-label="Deals created by your wallet">{current.deals.map(deal=><a href={jobHref(deal.deal_id)} className={selected===deal.deal_id?"active":""} key={deal.deal_id}><span className="tiny-dot"/><span>{deal.deal_id}<small className="meta">{dealStatusLabel(deal)}</small></span></a>)}</nav>
      </>}
      <p className="meta">Filtered by your wallet. Blockchain records are public.</p>
    </>}
  </section>;
}
