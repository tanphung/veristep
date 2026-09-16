import {beforeEach,describe,it,expect,vi} from 'vitest';
import {chain,contract,readClient} from '../../frontend/src/client';
import {connect,history,historyKey,observe,pending,receiptPhase,submit,assertReceiptMatches,recoverHash,walletChanged,watchWallet,type TxRecord} from '../../frontend/src/transactions';
import {abi} from 'genlayer-js';
import * as clientModule from '../../frontend/src/client';
import {jobFixture} from './fixtures';
const mocks=vi.hoisted(()=>({write:vi.fn(),connect:vi.fn(),request:vi.fn()}));
vi.mock('genlayer-js',async original=>({...await original<typeof import('genlayer-js')>(),createClient:vi.fn(()=>({writeContract:mocks.write,connect:mocks.connect,getTransaction:vi.fn(),readContract:vi.fn()}))}));
const account='0x2222222222222222222222222222222222222222';
const hash=('0x'+'ab'.repeat(32)) as NonNullable<TxRecord['hash']>;
const record=():TxRecord=>({id:'test-tx',jobId:'test-job',method:'request_review',account,chainId:chain.id,contract,value:'0',phase:'PENDING',hash,createdAt:1});
const matchedReceipt=()=>({hash,from_address:account,to_address:contract,data:{calldata:{raw:Array.from(abi.calldata.encode(new Map([['method','request_review'],['args',['test-job']]] as [string,any][])))}}});
beforeEach(()=>{
  vi.clearAllMocks();mocks.connect.mockResolvedValue(undefined);mocks.write.mockResolvedValue(hash);
  mocks.request.mockImplementation(async({method}:{method:string})=>method==='eth_chainId'?`0x${chain.id.toString(16)}`:method==='wallet_getSnaps'?{'npm:genlayer-wallet-plugin':{id:'npm:genlayer-wallet-plugin'}}:[account]);
  Object.defineProperty(window,'ethereum',{value:{request:mocks.request},configurable:true});
  Object.defineProperty(navigator,'locks',{value:{request:async(_name:unknown,_opts:unknown,callback:(lock:object)=>unknown)=>callback({name:'test-lock'})},configurable:true});
});
describe('transaction safety',()=>{
  it('forwards wallet event payloads and removes listeners',()=>{
    const listeners=new Map<string,(...args:unknown[])=>void>();const onChange=vi.fn();
    Object.defineProperty(window,'ethereum',{value:{request:mocks.request,on:(event:string,fn:(...args:unknown[])=>void)=>listeners.set(event,fn),removeListener:(event:string,fn:(...args:unknown[])=>void)=>{if(listeners.get(event)===fn)listeners.delete(event);}},configurable:true});
    const cleanup=watchWallet(onChange);expect(listeners.size).toBe(3);
    listeners.get('accountsChanged')!([account]);listeners.get('chainChanged')!(`0x${chain.id.toString(16)}`);listeners.get('disconnect')!();
    expect(onChange).toHaveBeenNthCalledWith(1,{type:'accountsChanged',accounts:[account]});expect(onChange).toHaveBeenNthCalledWith(2,{type:'chainChanged',chainId:`0x${chain.id.toString(16)}`});expect(onChange).toHaveBeenNthCalledWith(3,{type:'disconnect'});cleanup();expect(listeners.size).toBe(0);
  });
  it('keeps the connected UI state for matching account and network events',()=>{
    expect(walletChanged(account,{type:'accountsChanged',accounts:[account.toUpperCase()]})).toBe(false);
    expect(walletChanged(account,{type:'chainChanged',chainId:`0x${chain.id.toString(16)}`})).toBe(false);
    expect(walletChanged(account,{type:'accountsChanged',accounts:[]})).toBe(true);
    expect(walletChanged(account,{type:'chainChanged',chainId:'0x1'})).toBe(true);
    expect(walletChanged(account,{type:'disconnect'})).toBe(true);
  });
  it('rejects accounts changed during the connect flow',async()=>{
    mocks.request.mockImplementation(async({method}:{method:string})=>method==='eth_chainId'?`0x${chain.id.toString(16)}`:method==='eth_requestAccounts'?[account]:['0x3333333333333333333333333333333333333333']);
    await expect(connect()).rejects.toThrow('during connection');
  });
  it('does not mark finalized execution successful until expected state is observable',async()=>{
    const item=record();localStorage.setItem(historyKey,JSON.stringify([item]));
    vi.mocked(readClient.getTransaction).mockResolvedValue({...matchedReceipt(),status:'FINALIZED',tx_execution_result_name:'FINISHED_WITH_RETURN'} as never);
    const read=vi.spyOn(clientModule,'readJob').mockResolvedValue(await jobFixture());
    try{await expect(observe(item)).rejects.toThrow('expected contract state');expect(history()[0]).toEqual(item);expect(mocks.write).not.toHaveBeenCalled();}finally{read.mockRestore();}
  });
  it('marks finality only after receipt binding and observable review request',async()=>{
    const item=record();localStorage.setItem(historyKey,JSON.stringify([item]));
    vi.mocked(readClient.getTransaction).mockResolvedValue({...matchedReceipt(),status:'FINALIZED',tx_execution_result_name:'FINISHED_WITH_RETURN'} as never);
    const job=await jobFixture();job.status='REVIEW_REQUESTED';job.adjudication_deadline=300;
    const read=vi.spyOn(clientModule,'readJob').mockResolvedValue(job);
    try{expect((await observe(item)).phase).toBe('FINALIZED_SUCCESS');expect(history()[0].phase).toBe('FINALIZED_SUCCESS');expect(mocks.write).not.toHaveBeenCalled();}finally{read.mockRestore();}
  });
  it('rejects successful execution for another transaction before reading state',async()=>{
    const item=record();localStorage.setItem(historyKey,JSON.stringify([item]));
    vi.mocked(readClient.getTransaction).mockResolvedValue({...matchedReceipt(),hash:'0xdead',status:'FINALIZED',tx_execution_result_name:'FINISHED_WITH_RETURN'} as never);
    const read=vi.spyOn(clientModule,'readJob');
    try{await expect(observe(item)).rejects.toThrow('identity');expect(read).not.toHaveBeenCalled();expect(history()[0]).toEqual(item);}finally{read.mockRestore();}
  });
  it('binds canonical calldata, sender, target and hash',()=>expect(()=>assertReceiptMatches(record(),matchedReceipt())).not.toThrow());
  it.each(['hash','from_address','to_address'])('rejects mismatched receipt %s',field=>{const receipt={...matchedReceipt(),[field]:'0xdead'};expect(()=>assertReceiptMatches(record(),receipt)).toThrow('identity');});
  it('rejects a receipt for another job or method',()=>expect(()=>assertReceiptMatches({...record(),jobId:'another-job'},matchedReceipt())).toThrow('another job'));
  it('recovers only an existing matching hash without signing',async()=>{const item={...record(),phase:'UNKNOWN' as const,hash:undefined};localStorage.setItem(historyKey,JSON.stringify([item]));vi.mocked(readClient.getTransaction).mockResolvedValue(matchedReceipt() as never);await recoverHash(item,hash);expect(history()[0].hash).toBe(hash);expect(mocks.write).not.toHaveBeenCalled();});
  it('does not silently discard corrupt pending records',()=>{localStorage.setItem(historyKey,JSON.stringify([{...record(),phase:'CORRUPTED'}]));expect(()=>history()).toThrow('Invalid local');});
  it('accepted is provisional even with successful execution',()=>expect(receiptPhase({status:'ACCEPTED',tx_execution_result_name:'FINISHED_WITH_RETURN'})).toBe('ACCEPTED'));
  it('finalized errors are not success',()=>expect(receiptPhase({status:'FINALIZED',tx_execution_result_name:'FINISHED_WITH_ERROR'})).toBe('FAILED'));
  it('unknown finalized execution remains blocked',()=>{expect(receiptPhase({status:'FINALIZED'})).toBe('UNKNOWN');expect(pending({...record(),phase:'UNKNOWN'})).toBe(true);});
  it('requires finality and successful execution',()=>expect(receiptPhase({status:'FINALIZED',tx_execution_result_name:'FINISHED_WITH_RETURN'})).toBe('FINALIZED_SUCCESS'));
  it('persists returned hash and blocks duplicate submit',async()=>{await submit(account,'test-job','request_review',['test-job']);expect(history()[0].hash).toBe(hash);await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow('unresolved');expect(mocks.write).toHaveBeenCalledTimes(1);});
  it('fails before signing on wrong network',async()=>{mocks.request.mockImplementation(async({method}:{method:string})=>method==='eth_chainId'?'0x1':[account]);await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow('Wrong network');expect(mocks.write).not.toHaveBeenCalled();});
  it('fails before signing if the wallet account changed',async()=>{mocks.request.mockResolvedValue(['0x3333333333333333333333333333333333333333']);await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow('account changed');expect(mocks.write).not.toHaveBeenCalled();});
  it('marks rejection without inventing a hash',async()=>{mocks.write.mockRejectedValue({cause:{code:4001}});await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow('Signature rejected');expect(history()[0].phase).toBe('REJECTED');expect(history()[0].hash).toBeUndefined();});
  it('does not retry an ambiguous submission error',async()=>{mocks.write.mockRejectedValue(new Error('connection lost'));await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow('uncertain');expect(history()[0].phase).toBe('UNKNOWN');await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow('unresolved');expect(mocks.write).toHaveBeenCalledTimes(1);});
  it('retains hash and phase when observation fails',async()=>{const item=record();localStorage.setItem(historyKey,JSON.stringify([item]));vi.mocked(readClient.getTransaction).mockRejectedValue(new Error('RPC unavailable'));await expect(observe(item)).rejects.toThrow('RPC');expect(history()[0]).toEqual(item);});
  it('does not sign without a cross-tab lock',async()=>{Object.defineProperty(navigator,'locks',{value:{request:async(_n:unknown,_o:unknown,cb:(lock:null)=>unknown)=>cb(null)},configurable:true});await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow('unresolved');expect(mocks.write).not.toHaveBeenCalled();});
  it('fails closed on malformed local history',async()=>{localStorage.setItem(historyKey,'not-json');await expect(submit(account,'test-job','request_review',['test-job'])).rejects.toThrow();expect(mocks.write).not.toHaveBeenCalled();});
  it('connect verifies the actual chain after requesting a switch',async()=>{mocks.request.mockImplementation(async({method}:{method:string})=>method==='eth_chainId'?'0x1':[account]);await expect(connect()).rejects.toThrow('Switch your wallet');});
});
