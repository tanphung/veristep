import {useCallback,useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {ArrowUpRight,Plus,RefreshCw,Route,FileText,ShieldCheck,ArrowRight,Layers3,Wallet} from 'lucide-react';
import type {Address} from 'genlayer-js/types';
import {chain,contract,explorer,short,listJobs,readJob,jobHref} from './client';
import type {Job,Artifact} from './types';
import {Findings,Payments,label} from './Findings';
import {Actions,NewJob} from './Actions';
import {connect,history,observe,pending,watchWallet,type TxRecord} from './transactions';
import {pageContext,registerWorkTools} from './webmcp';
import {RecoverTransaction} from './RecoverTransaction';

export function Evidence({artifact,label:indexLabel,index}:{artifact?:Artifact;label:string;index:string}) {
  return <article className="evidence-card" id={`evidence-${artifact?.role??index}`}><div className="card-heading"><span className="step-square">{index}</span><div><h3>{indexLabel}</h3><span className="meta">{artifact?`${artifact.byte_length} bytes · immutable revision 1`:'Awaiting submission'}</span></div>{artifact&&<ShieldCheck size={18} className="mint" aria-label="Displayed content hash checked"/>}</div><div className="document">{artifact?.content??'No document has been submitted for this step.'}</div>{artifact&&<footer><span>SHA-256</span><code title={artifact.sha256}>{short(artifact.sha256)}</code></footer>}</article>;
}
const selectedFromUrl=()=>new URLSearchParams(location.hash.slice(1)).get('job')??'';

export default function App(){
  const [ids,setIds]=useState<string[]>([]),[job,setJob]=useState<Job>();
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [selected,setSelected]=useState(selectedFromUrl),[newJob,setNewJob]=useState(false);
  const [account,setAccount]=useState<Address>(),[connecting,setConnecting]=useState(false),[walletError,setWalletError]=useState('');
  const [records,setRecords]=useState<TxRecord[]>([]),[historyError,setHistoryError]=useState('');
  const generation=useRef(0),observing=useRef(false);
  useEffect(()=>{if(!account)return;return watchWallet(()=>{setAccount(undefined);setWalletError('Wallet account or network changed. Reconnect before taking an action.');});},[account]);
  useEffect(()=>registerWorkTools(pageContext(),()=>flushSync(()=>setNewJob(true))),[]);
  const refresh=useCallback(async()=>{
    const turn=++generation.current;setLoading(true);setError('');setJob(undefined);
    try{
      const found=await listJobs();if(turn!==generation.current)return;setIds(found);
      const id=selected||found[0];if(!id){setJob(undefined);return;}
      const result=await readJob(id);if(turn!==generation.current)return;setJob(result);
      if(!selected){location.hash=jobHref(id);setSelected(id);}
    }catch(e){if(turn===generation.current){setJob(undefined);setError(e instanceof Error?e.message:'Unable to read the network');}}
    finally{if(turn===generation.current)setLoading(false);}
  },[selected]);
  useEffect(()=>{void refresh();return()=>{generation.current++;};},[refresh]);
  useEffect(()=>{const change=()=>{const id=selectedFromUrl();if(id===selected)return;generation.current++;setJob(undefined);setLoading(true);setSelected(id);setNewJob(false);};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[selected]);
  const loadHistory=useCallback(()=>{try{setRecords(history());setHistoryError('');}catch(e){setHistoryError(e instanceof Error?e.message:'Local tracking unavailable');}},[]);
  useEffect(()=>{loadHistory();window.addEventListener('veristep:transactions',loadHistory);window.addEventListener('storage',loadHistory);return()=>{window.removeEventListener('veristep:transactions',loadHistory);window.removeEventListener('storage',loadHistory);};},[loadHistory]);
  const checkTransactions=useCallback(async()=>{
    if(observing.current)return;observing.current=true;
    try{for(const record of history().filter(item=>pending(item)&&item.hash)){const next=await observe(record);if(next.phase==='FINALIZED_SUCCESS')await refresh();}}
    catch{/* Keep the same hash after observation errors. Never automatically resubmit. */}
    finally{observing.current=false;}
  },[refresh]);
  useEffect(()=>{void checkTransactions();const timer=setInterval(()=>void checkTransactions(),8000);return()=>clearInterval(timer);},[checkTransactions]);
  async function connectWallet(){setConnecting(true);setWalletError('');try{setAccount(await connect());}catch(e){setAccount(undefined);setWalletError(e instanceof Error?e.message:'Wallet connection failed');}finally{setConnecting(false);}}
  function choose(id:string){setJob(undefined);setNewJob(false);location.hash=jobHref(id);setSelected(id);}
  function showRecord(){document.getElementById('live-record')?.scrollIntoView({behavior:'smooth',block:'start'});}
  const busy=Boolean(historyError)||records.some(pending);
  return <div className="app-shell">
    <aside className="sidebar"><a href="#" className="brand"><img src="/icon.svg" alt=""/><span>VeriStep<span className="brand-dot">.</span></span></a><div className="sidebar-label">WORKSPACE</div><a className="nav-item active" href="#"><Layers3 size={18}/> Work handoffs <span>{ids.length}</span></a><div className="sidebar-label jobs-label">ON-CHAIN JOBS</div><nav aria-label="Jobs">{ids.map(id=><a className={`job-link ${id===selected?'selected':''}`} key={id} href={jobHref(id)} onClick={()=>choose(id)}><span className="tiny-dot"/>{id.replace(/-\d+-[a-f0-9]+$/,'').replaceAll('-',' ')}</a>)}</nav><div className="sidebar-bottom"><ShieldCheck size={19}/><p>Evidence first.<br/><strong>Responsibility follows.</strong></p><a href={`${explorer}/contracts/${contract}`} target="_blank" rel="noreferrer">View contract <ArrowUpRight size={14}/></a></div></aside>
    <main className="main"><header className="topbar"><span className="breadcrumb">Workspace <span>/</span> Work handoffs</span><div className="button-row"><span className="network"><span className="tiny-dot"/>{chain.name}</span><button className="wallet-button" onClick={()=>void connectWallet()} disabled={connecting}><Wallet size={17}/>{connecting?'Connecting…':account?short(account):'Connect wallet'}</button></div></header>
      <div className="content"><section className="hero-stage" aria-labelledby="hero-title"><div className="page-heading"><div className="hero-copy"><span className="eyebrow">ACCOUNTABILITY FOR HUMAN + AGENT WORK</span><h1 id="hero-title">Trace the work.<span>Trust the evidence.</span></h1><p>Find where a mistake entered a multi-agent handoff, with decisions and settlement rules enforced by GenLayer.</p><div className="hero-actions"><button className="primary" onClick={()=>setNewJob(true)} disabled={busy}><Plus size={17}/> New job</button><button className="secondary-link" onClick={showRecord}>View work record <ArrowRight size={16}/></button></div></div></div><div className="hero-proof"><span><span className="proof-pulse"/> LIVE ON BRADBURY</span><strong>3-stage evidence trail</strong><small>Reference → Worker A → Worker B</small></div><div className="hero-motes" aria-hidden="true"><i/><i/><i/></div></section>
        <section className="signal-strip" aria-label="VeriStep verification highlights"><article><span><Layers3 size={18}/></span><div><strong>Immutable handoffs</strong><small>Complete artifacts, hashes and accepted duties</small></div></article><article><span><ShieldCheck size={18}/></span><div><strong>Independent review</strong><small>Exact obligation assessments and citations</small></div></article><article><span><Route size={18}/></span><div><strong>Separate settlement proof</strong><small>Work outcome never masquerades as payment</small></div></article></section>
        <div className="notice"><Route size={17}/><span>Bradbury public testnet. Test amounts only. Accepted transactions remain provisional until finalized.</span></div>
        {walletError&&<p className="error" role="alert">{walletError}</p>}{historyError&&<p className="error" role="alert">{historyError}</p>}
        {!!records.length&&<section className="transaction-panel" aria-label="Transaction history"><div className="section-heading"><h3>Transactions on this device</h3><button onClick={()=>void checkTransactions()}>Check existing hashes</button></div>{records.slice(0,8).map(item=><div className="transaction" key={item.id}><div><strong>{label(item.method)}</strong><span className="meta">{item.jobId}</span></div><span className={`verdict ${item.phase==='FINALIZED_SUCCESS'?'satisfied':item.phase==='FAILED'?'violated':''}`}>{item.phase==='FINALIZED_SUCCESS'?'Finalized execution':label(item.phase)}</span>{item.hash?<a href={`${explorer}/transactions/${item.hash}`} target="_blank" rel="noreferrer"><code>{short(item.hash)}</code><ArrowUpRight size={13}/></a>:<span className="meta">Check wallet history before retrying</span>}{item.error&&<p className="meta">{item.error}</p>}{!item.hash&&pending(item)&&<RecoverTransaction record={item}/>}</div>)}<p className="meta">A finalized execution is not proof of recipient payment. Pending or uncertain actions are never automatically resent.</p></section>}
        {newJob?<NewJob account={account} onClose={()=>setNewJob(false)} onSubmitted={id=>{loadHistory();choose(id);}}/>:<section className="workspace" id="live-record"><div className="section-heading"><div><span className="eyebrow">LIVE WORK RECORD</span><h2>{job?.terms.title??'Your work handoffs'}</h2></div><button className="icon-button" aria-label="Refresh on-chain data" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={17} className={loading?'spinning':''}/></button></div>
          <label className="mobile-job-picker">Work record<select value={selected} onChange={e=>choose(e.target.value)}>{ids.map(id=><option key={id}>{id}</option>)}</select></label>
          {error&&<div className="error" role="alert">{error}<button onClick={()=>void refresh()}>Retry read</button></div>}{!job&&!error&&<p className="empty">{loading?'Reading finalized contract state…':'No finalized jobs yet. Create a work record to begin.'}</p>}
          {job&&<><div className="job-summary"><span className="status">{label(job.status)}</span><code>{job.id}</code><span className="meta">Client {short(job.client)}</span></div><div className="brief"><FileText size={18}/><div><span className="eyebrow">AGREED TASK</span><p>{job.terms.task}</p><span className="meta">B source verification: {job.terms.verify_source?'required':'not part of the agreed duty'}</span></div></div><div className="handoff-path"><span>01 <strong>Reference</strong></span><ArrowRight size={18}/><span>02 <strong>Extraction · A</strong></span><ArrowRight size={18}/><span>03 <strong>Report · B</strong></span></div><div className="evidence-grid"><Evidence index="01" label="Agreed reference" artifact={job.artifacts.SOURCE}/><Evidence index="A" label="Extraction handoff" artifact={job.artifacts.A}/><Evidence index="B" label="Final report" artifact={job.artifacts.B}/></div><Actions key={job.id+job.status+(account??'')} job={job} account={account} busy={busy} onSubmitted={loadHistory}/><Findings job={job}/><Payments job={job}/></>}
        </section>}
        <footer className="page-footer"><span>VeriStep / Future of Work</span><a href="https://github.com/tanphung/veristep" target="_blank" rel="noreferrer">Source & test evidence <ArrowUpRight size={13}/></a></footer>
      </div>
    </main>
  </div>;
}
