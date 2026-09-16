import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createClient, createAccount, generatePrivateKey} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {CalldataAddress} from 'genlayer-js/types';
import {hexToBytes} from 'viem';
import {cases} from '../evidence/fixtures/cases.mjs';
import {assertExecution, statusName, executionName} from './receipts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolation=process.env.VERISTEP_ISOLATION??'';
assert.ok(!isolation||/^[a-z0-9]{1,12}$/.test(isolation),'Invalid isolated test-run identifier');
const runName=`studionet${isolation?'-'+isolation:''}`;
const reportDir = resolve(root, 'reports',runName);
const manifestPath = resolve(reportDir, 'manifest.json');
const secretsPath = resolve(root, '.secrets',runName+'.json');
const exists = async path => access(path).then(()=>true,()=>false);
const stringify = obj => JSON.stringify(obj, (_, v)=>typeof v === 'bigint' ? v.toString() : v, 2);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const code = await readFile(resolve(root,'contracts/veristep.py'),'utf8');
const sourceHash = createHash('sha256').update(code).digest('hex');
await mkdir(reportDir,{recursive:true});
await mkdir(dirname(secretsPath),{recursive:true});
if (!await exists(secretsPath)) await writeFile(secretsPath,stringify({client:generatePrivateKey(),A:generatePrivateKey(),B:generatePrivateKey()}),{mode:0o600,flag:'wx'});
const keys = JSON.parse(await readFile(secretsPath,'utf8'));
const clients = Object.fromEntries(Object.entries(keys).map(([role,key])=>[role,createClient({chain:studionet,account:createAccount(key)})]));
const wallet = role => createAccount(keys[role]).address;
const chain = await clients.client.getChainId();
assert.equal(chain,61999,'StudioNet chain guard: never use funded Bradbury wallet here');
let manifest = await exists(manifestPath) ? JSON.parse(await readFile(manifestPath,'utf8')) : {network:'studionet',chainId:chain,sourceHash,startedAt:new Date().toISOString(),wallets:Object.fromEntries(Object.keys(keys).map(role=>[role,wallet(role)])),steps:{},cases:{},limitations:['Studio has no EVM layer; MESSAGE_EMITTED is not recipient payment proof.']};
assert.equal(manifest.sourceHash,sourceHash,'Contract changed: archive the previous report and explicitly start a new run. Do not silently reuse a stale deployment.');
assert.equal(manifest.network,'studionet','Wrong saved network');
assert.equal(manifest.chainId,chain,'Wrong saved chain');
for (const role of ['client','A','B']) {
  assert.equal(manifest.wallets?.[role]?.toLowerCase(),wallet(role).toLowerCase(),'Saved run requires its original local StudioNet keys. Archive the report before starting a new run with different wallets.');
}
const save = ()=>writeFile(manifestPath,stringify(manifest));
await save();

async function transaction(step,client,submit) {
  let item = manifest.steps[step];
  if (!item) {
    item = manifest.steps[step] = {phase:'SIGNING',startedAt:new Date().toISOString()};
    await save(); // Persist intent before any potentially ambiguous signed submission.
    const txHash = await submit();
    Object.assign(item,{hash:txHash,phase:'PENDING',submittedAt:new Date().toISOString()});
    await save();
    console.log(JSON.stringify({step,submitted:txHash}));
  }
  assert.ok(item.hash,'Uncertain submission without a saved hash: inspect wallet/network history before any manual recovery. Never automatically resend.');
  if (item.finalized && item.execution === 'FINISHED_WITH_RETURN') return item;
  // Poll the SAME hash after any observation timeout. Never resubmit an uncertain write.
  let receipt;
  for (let attempt=0;attempt<180;attempt++) {
    await sleep(6000);
    try {
      receipt = await client.getTransaction({hash:item.hash});
      await writeFile(resolve(reportDir,`${step}.receipt.json`),stringify(receipt));
      const status = statusName(receipt);
      if (attempt % 5 === 0 || ['FINALIZED','UNDETERMINED','CANCELED'].includes(status)) console.log(JSON.stringify({step,status,execution:executionName(receipt)}));
      if (['UNDETERMINED','CANCELED','VALIDATORS_TIMEOUT','LEADER_TIMEOUT'].includes(status)) throw new Error(`TERMINAL ${status}`);
      if (status === 'FINALIZED') break;
    } catch (error) {
      if (String(error.message).startsWith('TERMINAL')) throw error;
      if (attempt % 5 === 0) console.log(JSON.stringify({step,observationError:String(error.shortMessage ?? error.message).split('\n')[0]}));
    }
  }
  assertExecution(receipt ?? {},true);
  item.finalized = true;
  item.phase = 'FINALIZED_SUCCESS';
  item.execution = executionName(receipt);
  item.finishedAt = new Date().toISOString();
  item.to = receipt.to_address ?? receipt.recipient ?? receipt.data?.contract_address;
  item.consensus = receipt.consensus_data ?? receipt.lastRound ?? null;
  await save();
  return item;
}

try {
  const deployment = await transaction('deploy',clients.client,()=>clients.client.deployContract({code,args:[],leaderOnly:false,consensusMaxRotations:3}));
  manifest.contract = manifest.contract ?? deployment.to;
  assert.match(manifest.contract ?? '',/^0x[0-9a-fA-F]{40}$/,'Missing deployed contract address');
  const address = manifest.contract;
  const read = async (fn,args=[])=>JSON.parse(await clients.client.readContract({address,functionName:fn,args}));
  const config = await read('get_config');
  assert.equal(Number(config.chain_id),chain);
  assert.equal(config.version,'veristep-1.1');
  const schema = await clients.client.getContractSchema(address);
  await writeFile(resolve(reportDir,'schema.json'),stringify(schema));
  manifest.schemaVerified = true;
  manifest.configVerified = true;
  await save();
  const repetitions = Number(process.env.VERISTEP_REPETITIONS ?? '1');
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 3);
  const runLabel=process.env.VERISTEP_RUN_LABEL??'';
  assert.ok(!runLabel||/^[a-z0-9]{1,12}$/.test(runLabel),'Invalid explicit run label');
  const selection = process.env.VERISTEP_CASES?.split(',');
  if(selection)assert.ok(selection.every(id=>cases.some(c=>c.id===id)),'Unknown fixture selection');
  const selected = selection ? cases.filter(c=>selection.includes(c.id)) : cases.filter(c=>c.core);
  assert.ok(selected.length,'No matching cases');
  for (const fixture of selected) {
    for (let repetition=1;repetition<=repetitions;repetition++) {
      const id = `${fixture.id}${runLabel?'-'+runLabel:''}-${repetition}-${sourceHash.slice(0,8)}`;
      const write = (step,role,fn,args,value=0n)=>transaction(`${id}-${step}`,clients[role],()=>clients[role].writeContract({address,functionName:fn,args,value,leaderOnly:false,consensusMaxRotations:3}));
      await write('create','client','create_job',[id,fixture.title,fixture.task,fixture.source,new CalldataAddress(hexToBytes(wallet('A'))),new CalldataAddress(hexToBytes(wallet('B'))),10n,20n,5n,7n,3n,4n,86400n,86400n,86400n,86400n,Boolean(fixture.verify_source)],30n);
      let job = await read('get_job',[id]);
      await write('accept-a','A','accept_job',[id,job.terms_hash],5n);
      await write('accept-b','B','accept_job',[id,job.terms_hash],7n);
      await write('submit-a','A','submit_work',[id,fixture.a,job.artifacts.SOURCE.submission_id]);
      job = await read('get_job',[id]);
      await write('submit-b','B','submit_work',[id,fixture.b,job.artifacts.A.submission_id]);
      await write('request-review','client','request_review',[id]);
      if(!manifest.steps[`${id}-resolve`]){
        const current=await read('get_job',[id]);
        assert.ok(current.adjudication_deadline>Math.floor(Date.now()/1000)+60,'Review deadline expired or too close. Preserve this job and explicitly start a new labeled run; do not send an expired resolve.');
      }
      await write('resolve','client','resolve_review',[id]);
      job = await read('get_job',[id]);
      manifest.cases[id] = {fixture:fixture.id,repetition,expected:fixture.expected,actual:job.outcomes,status:job.status,passed:false};
      await writeFile(resolve(reportDir,`${id}.job.json`),stringify(job));
      await save();
      assert.equal(job.status,'RESOLVED');
      assert.deepEqual(job.outcomes,fixture.expected,`Wrong material outcome for ${id}`);
      assert.equal(Object.values(job.ledger.credits).reduce((a,b)=>a+BigInt(b),0n),42n);
      manifest.cases[id].passed = true;
      await save();
      console.log(JSON.stringify({case:id,passed:true,outcomes:job.outcomes}));
    }
  }
  manifest.lastRunCompletedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({completed:true,contract:address,passingCases:Object.values(manifest.cases).filter(c=>c.passed).length}));
} catch (error) {
  manifest.lastError = {at:new Date().toISOString(),message:String(error.shortMessage ?? error.message).split('\n')[0]};
  (manifest.errors ??= []).push(manifest.lastError);
  await save();
  console.error(JSON.stringify(manifest.lastError));
  process.exitCode = 1;
}
