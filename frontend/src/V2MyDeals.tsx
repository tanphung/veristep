import {useEffect,useState} from "react";
import {LoaderCircle} from "lucide-react";
import {jobHref} from "./client";
import {cachedV2Deal,isV2DealFresh,readFinalizedWithRetry,readV2Deal} from "./v2-client";
import {canonicalReleaseProofs,dealPresentation,dealStatusLabel} from "./deal-presentation";
import type {V2Deal} from "./v2-types";

export function V2MyDeals({account,ids,selected,idsReady=true,connecting=false}:{account?:string;ids:string[];selected:string;idsReady?:boolean;connecting?:boolean}){
  const [result,setResult]=useState<{account:string;idsKey:string;attempt:number;deals:V2Deal[];loading:boolean;failed:boolean;checked:number;total:number}>();
  const [retry,setRetry]=useState(0);
  const idsKey=ids.join("\u0000");
  const personalIds=ids.filter(id=>!canonicalReleaseProofs.some(item=>item.id===id)&&!dealPresentation(id).archived);
  const cachedOwned=personalIds.flatMap(id=>{const deal=cachedV2Deal(id);return deal&&account&&deal.manifest.client.toLowerCase()===account.toLowerCase()?[deal]:[];});
  useEffect(()=>{
    if(!account){setResult(undefined);return;}
    if(!idsReady)return;
    let cancelled=false;
    const merge=(previous:V2Deal[],next:V2Deal[])=>[...new Map([...previous,...next].map(item=>[item.deal_id,item])).values()];
    setResult(previous=>({account,idsKey,attempt:retry,deals:merge(previous?.account===account?previous.deals:[],cachedOwned),loading:true,failed:false,checked:0,total:personalIds.length}));
    void (async()=>{
      const owned:V2Deal[]=[],checkedIds=new Set<string>();let failed=false,checked=0;
      // The deployed contract lists IDs globally; verify ownership from finalized state.
      for(let offset=0;offset<personalIds.length;offset+=4){
        if(cancelled)return;
        await Promise.all(personalIds.slice(offset,offset+4).map(async id=>{
          try{
            const value=await readFinalizedWithRetry(()=>readV2Deal(id,false,-1));
            if(cancelled)return;
            checkedIds.add(id);
            if(value.manifest.client.toLowerCase()===account.toLowerCase())owned.push(value);
          }catch{failed=true;}
          finally{
            checked++;
            if(!cancelled)setResult(previous=>({account,idsKey,attempt:retry,deals:[...new Map([...(previous?.account===account?previous.deals:[]),...owned].map(item=>[item.deal_id,item])).values()],loading:true,failed,checked,total:personalIds.length}));
          }
        }));
      }
      if(!cancelled)setResult(previous=>({account,idsKey,attempt:retry,deals:merge(previous?.account===account?previous.deals.filter(item=>personalIds.includes(item.deal_id)&&!checkedIds.has(item.deal_id)):[],owned),loading:false,failed,checked,total:personalIds.length}));
    })();
    return()=>{cancelled=true;};
  },[account,idsKey,retry,idsReady]);
  const current=result?.account===account?result:undefined;
  const visibleDeals=current?.deals??cachedOwned;
  const cachedScanComplete=idsReady&&retry===0&&personalIds.every(isV2DealFresh);
  // A completed scan of an older ID list is not an empty result for the current list.
  const scanComplete=idsReady&&current?.idsKey===idsKey&&current.attempt===retry&&!current.loading;
  return <section className="my-deals" aria-label="My deals"><strong>My deals</strong>
    {!account?connecting?<p className="meta my-deals-loading" role="status"><LoaderCircle className="spinning" aria-hidden="true"/> Connecting wallet… Your deals will sync after connection.</p>:<p className="meta">Connect your wallet to see deals you created.</p>:<>
      {!scanComplete&&!cachedScanComplete&&<p className="meta my-deals-loading" role="status"><LoaderCircle className="spinning" aria-hidden="true"/> Syncing your deals from GenLayer… {current&&current.total>0?`${current.checked}/${current.total} records checked. You can open deals as they appear.`:"Finding records for this wallet. Existing deals will appear as they are checked."}{visibleDeals.length>0&&" Previously loaded deals remain visible while checking for updates."}</p>}
      {current&&<>
        {scanComplete&&current.failed&&<p className="meta" role="status">Some deals could not be updated. Previously loaded deals remain visible; they have not been refreshed. <button onClick={()=>setRetry(value=>value+1)}>Retry my deals</button></p>}
        {scanComplete&&!current.failed&&!current.deals.length&&<p className="meta">No deals yet for this wallet. Select New Deal to create one.</p>}
      </>}
      <nav aria-label="Deals created by your wallet">{visibleDeals.map(deal=><a href={jobHref(deal.deal_id)} className={selected===deal.deal_id?"active":""} key={deal.deal_id}><span className="tiny-dot"/><span>{deal.deal_id}<small className="meta">{dealStatusLabel(deal)}</small></span></a>)}</nav>
      <p className="meta">Filtered by your wallet. Blockchain records are public.</p>
    </>}
  </section>;
}
