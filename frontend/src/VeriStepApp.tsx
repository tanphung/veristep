import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeftRight,ArrowRight,ArrowUpRight,CheckCircle2,Plus,RefreshCw,Wallet} from "lucide-react";
import type {Address} from "genlayer-js/types";
import {contract,deploymentTransaction,explorer,jobHref,short,writesEnabled} from "./client";
import {connect,disconnectWallet,walletChanged,watchWallet} from "./transactions";
import {cachedV2Deal,cachedV2Ids,isV2IdsFresh,listV2Deals,readFinalizedWithRetry,readV2Deal} from "./v2-client";
import {finalizedReadError} from "./finalized-reads";
import {V2Report} from "./V2Report";
import {shouldRenderV2Actions,V2Actions} from "./V2Actions";
import {V2NewDeal} from "./V2NewDeal";
import {Atmosphere} from "./Atmosphere";
import {Docs} from "./Docs";
import {V2MyDeals} from "./V2MyDeals";
import {V2Compare} from "./V2Compare";
import {V2Worker} from "./V2Worker";
import {V2LifecycleActivity,V2OnchainActivity} from "./V2OnchainActivity";
import {observeV2,v2History,v2Pending} from "./v2-transactions";
import {friendlyError} from "./errors";
import {canonicalReleaseProofs,dealLifecycleStage,dealPresentation,dealStatusLabel,sortDealIds} from "./deal-presentation";
import type {TxRecord} from "./transactions";
import type {V2Deal} from "./v2-types";

function routeFromUrl():{hasContractRoute:boolean;selected:string;view:"deals"|"compare"}{
  const params=new URLSearchParams(location.hash.slice(1)),hasJob=params.has("job"),hasView=params.has("view");
  const view:"deals"|"compare"=hasJob?"deals":"compare";
  return {hasContractRoute:hasJob||hasView,selected:hasJob?params.get("job")??"":"",view};
}
const selectedFromUrl=()=>routeFromUrl().selected;
const viewFromUrl=()=>routeFromUrl().view;
const docsFromUrl=()=>location.hash==="#docs"||location.hash.startsWith("#docs?");
const lifecycle=["Terms frozen","Fees funded","Workers bonded","Artifacts committed","Committee review","Native transfer dispatch"];

export default function VeriStepApp(){
  const [docs,setDocs]=useState(docsFromUrl);
  const [ids,setIds]=useState<string[]>(()=>sortDealIds(cachedV2Ids()??[])),[deal,setDeal]=useState<V2Deal|undefined>(()=>cachedV2Deal(selectedFromUrl()));
  const [idsReady,setIdsReady]=useState(isV2IdsFresh);
  const [view,setView]=useState<"deals"|"compare">(viewFromUrl);
  const [selected,setSelected]=useState(selectedFromUrl),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [account,setAccount]=useState<Address>(),[connecting,setConnecting]=useState(false),[walletError,setWalletError]=useState("");
  const [creating,setCreating]=useState(false),[records,setRecords]=useState<TxRecord[]>([]),[historyError,setHistoryError]=useState("");
  const generation=useRef(0),observing=useRef(false);
  const refresh=useCallback(async(fresh=false)=>{
    const turn=++generation.current;setError("");
    setIdsReady(!fresh&&isV2IdsFresh());
    const pendingCreation=selected&&v2History().some(record=>record.jobId===selected&&record.method==="create_terms"&&v2Pending(record));
    // Start the visible deal first. Its ID is already known from the route.
    const cached=cachedV2Deal(selected);
    if(view==="deals")setDeal(cached);
    const selectedRead=view==="deals"&&selected&&!pendingCreation
      ?readFinalizedWithRetry(()=>readV2Deal(selected,fresh,10)):undefined;
    // Attach a handler immediately while the independent list is being loaded.
    void selectedRead?.catch(()=>{});
    const listRead=readFinalizedWithRetry(()=>listV2Deals(fresh)).then(found=>{
      const sorted=sortDealIds(found);
      if(turn===generation.current){setIds(sorted);setIdsReady(true);}
      return sorted;
    });
    void listRead.catch(cause=>{if(turn===generation.current){setIdsReady(false);setError(finalizedReadError(cause,"Could not update the deal list. Previously loaded deals remain visible. Please retry."));}});
    try{
      if(view==="compare"){await listRead;return;}
      setLoading(true);
      let id=selected,value:V2Deal;
      if(selectedRead){value=await selectedRead;}
      else{
        const found=await listRead;
        if(turn!==generation.current)return;
        id=selected||canonicalReleaseProofs.find(item=>found.includes(item.id))?.id||"";
        if(!id||(!found.includes(id)&&pendingCreation)){setDeal(undefined);return;}
        setDeal(cachedV2Deal(id));
        value=await readFinalizedWithRetry(()=>readV2Deal(id,fresh,10));
      }
      if(turn!==generation.current)return;
      setDeal(value);
      if(!selected){location.hash=jobHref(id);setSelected(id);}
    }catch(cause){if(turn===generation.current)setError(finalizedReadError(cause,"Could not update finalized contract data. Previously loaded data remains visible; it has not been refreshed. Please retry."));}
    finally{if(turn===generation.current)setLoading(false);}
  },[selected,view]);
  useEffect(()=>{if(!docs)void refresh();return()=>{generation.current++;};},[refresh,docs]);
  useEffect(()=>{
    const change=()=>setDocs(docsFromUrl());
    window.addEventListener("hashchange",change);
    return()=>window.removeEventListener("hashchange",change);
  },[]);
  useEffect(()=>{
    const scroll=()=>requestAnimationFrame(()=>{
      const section=new URLSearchParams(location.hash.split("?")[1]).get("section");
      const target=docsFromUrl()?(section?`docs-${section}`:"top"):location.hash.slice(1);
      document.getElementById(target)?.scrollIntoView({block:"start"});
    });
    scroll();window.addEventListener("hashchange",scroll);
    return()=>window.removeEventListener("hashchange",scroll);
  },[docs]);
  useEffect(()=>{const change=()=>{const next=routeFromUrl();if(!next.hasContractRoute)return;if(next.selected===selected&&next.view===view)return;setSelected(next.selected);setView(next.view);setDeal(next.view==="deals"?cachedV2Deal(next.selected):undefined);setCreating(false);};window.addEventListener("hashchange",change);return()=>window.removeEventListener("hashchange",change);},[selected,view]);
  useEffect(()=>{if(!account)return;return watchWallet(change=>{if(!walletChanged(account,change))return;setAccount(undefined);setWalletError("Wallet or network changed. Reconnect before signing.");});},[account]);
  const loadHistory=useCallback(()=>{try{setRecords(v2History());setHistoryError("");}catch(cause){setHistoryError(friendlyError(cause,"VeriStep transaction tracking unavailable"));}},[]);
  useEffect(()=>{loadHistory();window.addEventListener("veristep:v2-transactions",loadHistory);return()=>window.removeEventListener("veristep:v2-transactions",loadHistory);},[loadHistory]);
  const checkTransactions=useCallback(async()=>{if(observing.current)return;observing.current=true;try{for(const record of v2History().filter(v2Pending)){const result=await observeV2(record);if(result.phase==="FINALIZED_SUCCESS")await refresh(true);}loadHistory();}catch(cause){setHistoryError(friendlyError(cause,"Could not observe the existing VeriStep transaction"));}finally{observing.current=false;}},[refresh,loadHistory]);
  useEffect(()=>{if(docs)return;void checkTransactions();const timer=setInterval(()=>void checkTransactions(),8000);return()=>clearInterval(timer);},[checkTransactions,docs]);
  async function connectWallet(){setConnecting(true);setWalletError("");try{setAccount(await connect());}catch(cause){setWalletError(friendlyError(cause,"Wallet connection failed"));}finally{setConnecting(false);}}
  function openCreate(){setCreating(true);requestAnimationFrame(()=>document.getElementById("workspace")?.scrollIntoView({behavior:"smooth"}));}
  function openReviewer(){requestAnimationFrame(()=>document.getElementById("workspace")?.scrollIntoView({behavior:"smooth"}));}
  const stage=deal?dealLifecycleStage(deal):-1;
  const busy=records.some(v2Pending)||Boolean(historyError);
  const primaryIds=canonicalReleaseProofs.map(item=>item.id);
  const unresolved=records.filter(v2Pending).length;
  return <div className="veristep-app">
    <header className="vs-navbar">
      <a className="vs-brand" href="#top" aria-label="VeriStep home"><img className="brand-glyph" src="/veristep-logo-mark.png" alt=""/><strong>VeriStep</strong></a>
      <nav aria-label="Primary navigation"><a href="#workspace">Workspace</a><a href="#workflow">How it works</a><a href="#docs" aria-current={docs?"page":undefined}>Docs</a></nav>
      <div className="vs-nav-actions"><span className="network-note">STUDIO NEXT</span>{account?<details className="wallet-menu"><summary className="wallet-button" aria-label="Connected wallet options"><Wallet/>{short(account)}</summary><div className="wallet-menu-panel"><span>Connected wallet</span><code>{account}</code><button onClick={()=>{disconnectWallet();setAccount(undefined);setWalletError("");}}>Disconnect wallet</button><small>Disconnects this dApp session. Wallet site permissions are managed in the extension.</small></div></details>:<button className="wallet-button" onClick={()=>void connectWallet()} disabled={connecting}><Wallet/>{connecting?"Opening wallet…":"Connect wallet"}</button>}</div>
    </header>
    <main id="top">
      {docs?<Docs/>:<>
      <section className="vs-intro">
        <Atmosphere/>
        <div><span className="eyebrow">ACCOUNTABILITY FOR AGENT WORK</span><h1>Clear terms.<br/>Accountable agents.</h1></div>
        <div className="intro-aside"><p>Define the work. Let two agents deliver. See where responsibility lies, with a verdict recorded on GenLayer.</p><div className="intro-actions"><button className="primary" onClick={openCreate} disabled={busy||!writesEnabled}>Create a deal <ArrowRight/></button><a className="text-link" href="#view=compare" onClick={()=>{setCreating(false);openReviewer();}}>Explore examples <ArrowUpRight/></a></div><small>Prepare your deal first. Connect a wallet when you are ready to sign.</small></div>
      </section>
      <section className="vs-product" id="product">
        <div className="workspace-title"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>{creating?"Create a new deal":"From terms to a verifiable outcome."}</h2></div><span className="workspace-note">Public records · Finalized contract state</span></div>
        {walletError&&<p className="error" role="alert">{walletError}</p>}
        {historyError&&<p className="error" role="alert">{historyError}</p>}
        {error&&<p className="error" role="alert">{error}<button onClick={()=>void refresh()}>Retry</button></p>}
        {unresolved>0&&<p className="pending-notice" role="status">A signed transaction is still being checked. New submissions unlock once its outcome is confirmed. <a href="#transaction-history">View transaction</a></p>}
        <div className={`vs-dashboard ${creating?"is-creating":""}`} id="workspace">
          {!creating&&<aside className="vs-records">
            <button className="primary new-deal-secondary" onClick={openCreate} disabled={busy||!writesEnabled}><Plus/> New Deal</button>
            <V2MyDeals account={account} ids={ids} idsReady={idsReady} connecting={connecting} selected={view==="deals"?selected:""}/>
            <div className="sidebar-demo"><strong>Demo</strong><span className="meta">See the protocol in action.</span></div>
            <a className={`verify-cases ${view==="compare"?"active":""}`} href="#view=compare"><ArrowLeftRight/> Verify live cases</a>
            <nav aria-label="Verified VeriStep scenarios">{primaryIds.map((id,index)=><a className={view==="deals"&&selected===id?"active":""} href={jobHref(id)} key={id}><span className="scenario-number">0{index+1}</span><span>{dealPresentation(id).label}</span></a>)}</nav>
            <a className="contract-link" href={`${explorer}/contracts/${contract}`} target="_blank" rel="noreferrer">View contract <ArrowUpRight/></a>
          </aside>}
          <div className="vs-record-main">
            {creating?<V2NewDeal account={account} connecting={connecting} onConnect={()=>void connectWallet()} onClose={()=>setCreating(false)} onSubmitted={id=>{loadHistory();location.hash=jobHref(id);setSelected(id);setView("deals");setDeal(undefined);setCreating(false);}}/>:view==="compare"?<V2Compare ids={primaryIds}/>:<section className="workspace v2-workspace">
              <div className="section-heading"><div><span className="eyebrow">DEAL DETAILS</span><h2>{deal?dealPresentation(deal.deal_id).label:selected?dealPresentation(selected).label:"Select a demo or your deal"}</h2></div><button className="icon-button" aria-label="Refresh finalized contract state" onClick={()=>void refresh(true)} disabled={loading}><RefreshCw className={loading?"spinning":""}/></button></div>
              {!deal&&!error&&<p className="empty">{loading?"Reading the VeriStep Intelligent Contract…":records.some(record=>record.jobId===selected&&record.method==="create_terms"&&v2Pending(record))?"Your signed transaction is awaiting finalized contract state. Its existing hash is being checked automatically.":"Choose an example or connect your wallet to find your deals."}</p>}
              {deal&&<>
                {loading&&<p className="meta" role="status">Checking for updates… Showing previously loaded data.</p>}
                <div className="v2-identity"><span className="status">{dealStatusLabel(deal)}</span><details><summary>Technical details</summary><div><span>Record ID</span><code>{deal.deal_id}</code><span>Contract status</span><code>{deal.status}</code>{deal.status==="SETTLEMENT_PENDING"&&<p className="contract-status-note">{stage===6?"All transfer instructions have been dispatched. Studio Next cannot verify receipt inside the contract, so its stored status remains SETTLEMENT_PENDING.":"The review is finalized. Transfer instructions still await dispatch; see the settlement section for each transfer."}</p>}<span>Terms</span><code>{short(deal.terms_hash)}</code><span>Deployment owner</span><code>{short(deal.router)}</code></div></details></div>
                <section className="v2-lifecycle" aria-label="Deal progress"><ol>{lifecycle.map((item,index)=><li className={stage>index?"done":stage===index?"current":""} key={item}><span>{stage>index?<CheckCircle2/>:index+1}</span><strong>{item}</strong></li>)}</ol></section>
                <div id="agent-actions">{shouldRenderV2Actions(deal,account)&&<V2Actions deal={deal} account={account} busy={busy||loading||Boolean(error)} onSubmitted={loadHistory}/>}{(["FUNDED","ACTIVE_A","ACTIVE_B"].includes(deal.status)||deal.deal_id==="v2-hosted-agent-live-2")&&<V2Worker key={deal.deal_id} deal={deal} account={account} readOnly={loading||Boolean(error)}/>}</div>
                <div id="validator-proof"><V2Report deal={deal}/></div>
                {!deal.report&&<details className="lifecycle-details"><summary>View lifecycle transactions</summary><V2LifecycleActivity dealId={deal.deal_id}/></details>}
                <V2OnchainActivity dealId={deal.deal_id}/>
              </>}
            </section>}
          </div>
        </div>
        {!!records.length&&<details id="transaction-history" className="transaction-panel journal-disclosure" open={unresolved>0}>
          <summary><span>Transaction history <small>{records.length} recorded in this browser</small></span><span>{unresolved?unresolved+" unresolved":"View history"} <ArrowRight/></span></summary>
          <div className="journal-tools"><p>Existing hashes are checked automatically. Checking never sends another transaction.</p><button onClick={()=>void checkTransactions()}>Check same hashes</button></div>
          {records.slice(0,8).map(record=><div className="transaction" key={record.id}><div><strong>{record.method.replaceAll("_"," ")}</strong><span className="meta">{dealPresentation(record.jobId).label}</span></div><span className={`verdict ${record.phase==="FINALIZED_SUCCESS"?"satisfied":record.phase==="FAILED"?"violated":""}`}>{record.phase.replaceAll("_"," ")}</span>{record.hash?<a href={`${explorer}/transactions/${record.hash}`} target="_blank" rel="noreferrer"><code>{short(record.hash)}</code><ArrowUpRight/></a>:<span className="meta">Check wallet before retrying</span>}</div>)}
        </details>}
      </section>
      <section className="vs-explainer" id="workflow">
        <div className="explainer-heading"><span className="eyebrow">HOW IT WORKS</span><h2>One agreement.<br/>Every handoff accounted for.</h2></div>
        <ol><li><span>01</span><div><strong>Set the terms</strong><p>Choose source evidence, define each agent’s duties and fund the deal.</p></div></li><li><span>02</span><div><strong>Follow the handoff</strong><p>Agent A works from the source. Agent B works from A’s finalized delivery.</p></div></li><li><span>03</span><div><strong>Verify responsibility</strong><p>GenLayer validators assess the evidence. Frozen rules determine settlement.</p></div></li></ol>
        <details id="boundary"><summary>Why GenLayer?</summary><p>Independent validators assess meaning, not just matching text. Their report can distinguish an error introduced by A from an error introduced by B. The contract applies the agreed settlement rules.</p><p>Native transfers on Studio Next are dispatched but cannot be verified inside the contract. Dispatch is not proof of confirmed payment.</p><a href={`${explorer}/transactions/${deploymentTransaction}`} target="_blank" rel="noreferrer">Inspect the deployment <ArrowUpRight/></a></details>
      </section>
      </>}
    </main>
    <footer className="vs-footer"><a className="vs-brand" href="#top"><strong>VeriStep</strong></a><p>Accountability, recorded on GenLayer.</p><a href="https://github.com/tanphung/veristep" target="_blank" rel="noreferrer">GitHub <ArrowUpRight/></a></footer>
  </div>;
}
