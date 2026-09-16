// Explicit opt-in integration, NOT an extension-wallet/browser certification.
// React runs in jsdom; the unmocked SDK submits real StudioNet transactions.
// Dedicated keys stay inside this Node test process, never in frontend source/bundles.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeAll,it,expect} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {createAccount,createClient} from 'genlayer-js';
import type {Address} from 'genlayer-js/types';
import {chain,contract,readJob,readClient} from '../../frontend/src/client';
import {Actions,NewJob} from '../../frontend/src/Actions';
import {connect,history,historyKey,observe,pending} from '../../frontend/src/transactions';

const root=process.cwd(),folder=resolve(root,'reports/frontend-live');
type TestRole='client'|'A'|'B';
let role:TestRole='client';
let accounts:Record<TestRole,ReturnType<typeof createAccount>>;
let writes=0;
const wait=()=>new Promise(resolve=>setTimeout(resolve,6000));

beforeAll(async()=>{
  if(process.env.VERISTEP_LIVE_WALLET_TEST!=='studionet-only')throw new Error('Explicit StudioNet opt-in required');
  expect(chain.id).toBe(61999);
  const deployment=JSON.parse(readFileSync(resolve(root,'reports/studionet-sep07probe/manifest.json'),'utf8'));
  expect(deployment.contract.toLowerCase()).toBe(contract.toLowerCase());
  expect(deployment.schemaVerified&&deployment.configVerified).toBe(true);
  const keys=JSON.parse(readFileSync(resolve(root,'.secrets/studionet-sep07probe.json'),'utf8'));
  accounts=Object.fromEntries((['client','A','B'] as const).map(r=>[r,createAccount(keys[r])])) as typeof accounts;
  for(const r of ['client','A','B'] as const)expect(accounts[r].address.toLowerCase()).toBe(deployment.wallets[r].toLowerCase());
  mkdirSync(folder,{recursive:true});
  const saved=resolve(folder,'tracking.json');
  if(existsSync(saved)){
    const tracking=JSON.parse(readFileSync(saved,'utf8'));expect(tracking.contract).toBe(contract);expect(tracking.chainId).toBe(chain.id);
    localStorage.setItem(historyKey,JSON.stringify(tracking.records));
  }
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    original.call(this,key,value);
    if(key===historyKey)writeFileSync(saved,JSON.stringify({chainId:chain.id,contract,records:JSON.parse(value)},null,2));
  };
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(_name:unknown,_opts:unknown,callback:(lock:object)=>unknown)=>callback({name:'single-process-live-test'})}});
  const provider={request:async({method,params=[]}:{method:string;params?:any[]})=>{
    if(method==='eth_accounts'||method==='eth_requestAccounts')return [accounts[role].address];
    if(method==='eth_chainId')return '0xf22f';
    if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain'){
      expect(Number(params[0].chainId)).toBe(61999);return null;
    }
    if(method==='wallet_getSnaps')return {'npm:genlayer-wallet-plugin':{id:'npm:genlayer-wallet-plugin'}};
    if(method==='wallet_requestSnaps'){expect(params[0]).toHaveProperty('npm:genlayer-wallet-plugin');return {'npm:genlayer-wallet-plugin':{id:'npm:genlayer-wallet-plugin'}};}
    if(method!=='eth_sendTransaction')throw new Error(`Unsupported test-provider request: ${method}`);
    if(++writes>12)throw new Error('Live-test submission bound exceeded');
    const tx=params[0],account=accounts[role];
    expect(tx.from.toLowerCase()).toBe(account.address.toLowerCase());expect(Number(tx.chainId)).toBe(61999);
    expect(BigInt(tx.value??0)).toBeLessThanOrEqual(42n);
    const client=createClient({chain,account});
    const signed=await account.signTransaction({chainId:61999,type:'legacy',to:tx.to,data:tx.data,nonce:Number(tx.nonce),value:BigInt(tx.value??0),gas:BigInt(tx.gas),gasPrice:BigInt(tx.gasPrice??0)});
    return client.sendRawTransaction({serializedTransaction:signed});
  }};
  Object.defineProperty(window,'ethereum',{configurable:true,value:provider});
});

async function settleTracking(){
  for(const record of history().filter(pending)){
    expect(record.hash,'Uncertain submission must be recovered, not resent').toBeTruthy();
    let current=record;
    for(let attempt=0;attempt<120&&pending(current);attempt++){
      await wait();current=await observe(current);
    }
    expect(current.phase).toBe('FINALIZED_SUCCESS');
    const receipt=await readClient.getTransaction({hash:current.hash!});
    writeFileSync(resolve(folder,`${current.method}-${current.account}.receipt.json`),JSON.stringify(receipt,(_,v)=>typeof v==='bigint'?String(v):v,2));
    console.log(JSON.stringify({method:current.method,job:current.jobId,hash:current.hash,phase:current.phase}));
  }
}

it('uses actual React forms, wallet-provider requests and finalized Studio state through the full happy path',async()=>{
  await settleTracking();
  let id=history().find(r=>r.method==='create_job'&&r.phase==='FINALIZED_SUCCESS')?.jobId;
  if(!id){
    role='client';const account=await connect();let submitted=false;
    render(<NewJob account={account} onClose={()=>{}} onSubmitted={value=>{id=value;submitted=true;}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Worker A wallet'}),{target:{value:accounts.A.address}});
    fireEvent.change(screen.getByRole('textbox',{name:'Worker B wallet'}),{target:{value:accounts.B.address}});
    const fields={feeA:'10',feeB:'20',bondA:'5',bondB:'7',penaltyA:'3',penaltyB:'4'};
    for(const [name,wei] of Object.entries(fields))fireEvent.change(document.querySelector(`[name="${name}"]`)!,{target:{value:'0.'+wei.padStart(18,'0')}});
    fireEvent.click(screen.getByRole('checkbox',{name:/all evidence is public/}));
    fireEvent.click(screen.getByRole('button',{name:/Create job & deposit/}));
    await waitFor(()=>expect(submitted).toBe(true),{timeout:120_000});cleanup();await settleTracking();
  }
  expect(id).toBeTruthy();
  async function action(actor:TestRole,button:RegExp,prepare?:()=>void){
    role=actor;const account=await connect(),job=await readJob(id!);let submitted=false;
    render(<Actions job={job} account={account as Address} busy={false} onSubmitted={()=>{submitted=true;}}/>);
    prepare?.();fireEvent.click(screen.getByRole('button',{name:button}));
    await waitFor(()=>expect(submitted).toBe(true),{timeout:120_000});cleanup();await settleTracking();
  }
  for(const actor of ['A','B'] as const){
    const job=await readJob(id!);
    if(!job.accepted[actor])await action(actor,/Accept & deposit/,()=>fireEvent.click(screen.getByRole('checkbox',{name:/I accept this source/})));
  }
  for(const actor of ['A','B'] as const){
    const job=await readJob(id!);
    if(!job.artifacts[actor])await action(actor,/Submit immutable work/,()=>fireEvent.change(screen.getByRole('textbox',{name:/Final/}),{target:{value:'Trial accounts cannot export. Paid accounts may export only after approval.'}}));
  }
  if((await readJob(id!)).status==='REVIEWABLE')await action('client',/Request GenLayer review/);
  if((await readJob(id!)).status==='REVIEW_REQUESTED')await action('client',/Run independent consensus review/);
  const result=await readJob(id!);expect(result.status).toBe('RESOLVED');expect(result.outcomes).toEqual({A:'SATISFIED',B:'SATISFIED'});
  writeFileSync(resolve(folder,'result.job.json'),JSON.stringify(result,null,2));
});
