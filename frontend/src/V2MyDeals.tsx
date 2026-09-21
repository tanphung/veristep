import {useEffect,useState} from "react";
import {LoaderCircle} from "lucide-react";
import {jobHref} from "./client";
import {readFinalizedWithRetry,readV2Deal} from "./v2-client";
import {canonicalReleaseProofs,dealPresentation,dealStatusLabel} from "./deal-presentation";
import type {V2Deal} from "./v2-types";

export function V2MyDeals({account,ids,selected,idsReady=true,connecting=false}:{account?:string;ids:string[];selected:string;idsReady?:boolean;connecting?:boolean}){
  const [result,setResult]=useState<{account:string;idsKey:string;attempt:number;deals:V2Deal[];loading:boolean;failed:boolean;checked:number;total:number}>();
  const [retry,setRetry]=useState(0);
  const idsKey=ids.join("\u0000");
  useEffect(()=>{
    if(!account){setResult(undefined);return;}
    if(!idsReady)return;
    let cancelled=false;
    const personalIds=ids.filter(id=>!canonicalReleaseProofs.some(item=>item.id===id)&&!dealPresentation(id).archived);
    setResult(previous=>({account,idsKey,attempt:retry,deals:previous?.account===account?previous.deals:[],loading:true,failed:false,checked:0,total:personalIds.length}));
    void (async()=>{
      const owned:V2Deal[]=[];let failed=false,checked=0;
      // The deployed contract lists IDs globally; verify ownership from finalized state.
      for(let offset=0;offset<personalIds.length;offset+=4){
        if(cancelled)return;
        await Promise.all(personalIds.slice(offset,offset+4).map(async id=>{
          try{
            const value=await readFinalizedWithRetry(()=>readV2Deal(id,false,-1));
            if(cancelled)return;
            if(value.manifest.client.toLowerCase()===account.toLowerCase())owned.push(value);
          }catch{failed=true;}
          finally{
            checked++;
            if(!cancelled)setResult(previous=>({account,idsKey,attempt:retry,deals:[...new Map([...(previous?.account===account?previous.deals:[]),...owned].map(item=>[item.deal_id,item])).values()],loading:true,failed,checked,total:personalIds.length}));
          }
        }));
      }
      if(!cancelled)setResult({account,idsKey,attempt:retry,deals:owned,loading:false,failed,checked,total:personalIds.length});
    })();
    return()=>{cancelled=true;};
  },[account,idsKey,retry,idsReady]);
  const current=result?.account===account?result:undefined;
  // A completed scan of an older ID list is not an empty result for the current list.
  const scanComplete=idsReady&&current?.idsKey===idsKey&&current.attempt===retry&&!current.loading;
  return <section className="my-deals" aria-label="My deals"><strong>My deals</strong>
    {!account?connecting?<p className="meta my-deals-loading" role="status"><LoaderCircle className="spinning" aria-hidden="true"/> Connecting wallet… Your deals will sync after connection.</p>:<p className="meta">Connect your wallet to see deals you created.</p>:<>
      {!scanComplete&&<p className="meta my-deals-loading" role="status"><LoaderCircle className="spinning" aria-hidden="true"/> Syncing your deals from GenLayer… {current&&current.total>0?`${current.checked}/${current.total} records checked. You can open deals as they appear.`:"Finding records for this wallet. Existing deals will appear as they are checked."}</p>}
      {current&&<>
        {scanComplete&&current.failed&&<p className="meta" role="status">Some deals could not be checked. <button onClick={()=>setRetry(value=>value+1)}>Retry my deals</button></p>}
        {scanComplete&&!current.failed&&!current.deals.length&&<p className="meta">No deals yet for this wallet. Select New Deal to create one.</p>}
        <nav aria-label="Deals created by your wallet">{current.deals.map(deal=><a href={jobHref(deal.deal_id)} className={selected===deal.deal_id?"active":""} key={deal.deal_id}><span className="tiny-dot"/><span>{deal.deal_id}<small className="meta">{dealStatusLabel(deal)}</small></span></a>)}</nav>
      </>}
      <p className="meta">Filtered by your wallet. Blockchain records are public.</p>
    </>}
  </section>;
}
