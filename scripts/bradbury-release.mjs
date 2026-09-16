import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAccount, createClient, generatePrivateKey} from 'genlayer-js';
import {testnetBradbury} from 'genlayer-js/chains';
import {CalldataAddress} from 'genlayer-js/types';
import {createPublicClient, createWalletClient, formatEther, hexToBytes, http, keccak256, parseEther, stringToBytes} from 'viem';
import {assertExecution, executionName, statusName} from './receipts.mjs';

assert.equal(process.env.VERISTEP_BRADBURY_CONFIRM, 'deploy-and-smoke-v1.1', 'Explicit Bradbury opt-in required');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = resolve(root, 'reports', 'bradbury-release');
const manifestPath = resolve(reportDir, 'manifest.json');
const secretsPath = resolve(root, '.secrets', 'bradbury-release.json');
const stringify = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2);
const exists = path => access(path).then(() => true, () => false);
const sleep = milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const separator = trimmed.indexOf('=');
    if (separator < 1) return [];
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[trimmed.slice(0, separator).trim(), value]];
  }));
}

const env = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
const normalizedPrivateKey = env.PRIVATE_KEY?.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY ?? ''}`;
assert.match(normalizedPrivateKey, /^0x[0-9a-fA-F]{64}$/, 'PRIVATE_KEY format invalid');
const deployer = createAccount(normalizedPrivateKey);
assert.equal(deployer.address.toLowerCase(), env.ADDRESS?.toLowerCase(), 'ADDRESS does not match PRIVATE_KEY');

const code = await readFile(resolve(root, 'contracts', 'veristep.py'), 'utf8');
const sourceHash = createHash('sha256').update(code).digest('hex');
assert.equal(sourceHash, 'a5bc7d153af669d5a03dc4e68e89ed88159ad0d265f17c2064a1f07733235391', 'Only the reviewed v1.1 source may be deployed');

await mkdir(reportDir, {recursive: true});
await mkdir(dirname(secretsPath), {recursive: true});
if (!await exists(secretsPath)) {
  await writeFile(secretsPath, stringify({A: generatePrivateKey(), B: generatePrivateKey()}), {mode: 0o600, flag: 'wx'});
}
const smokeKeys = JSON.parse(await readFile(secretsPath, 'utf8'));
const accounts = {client: deployer, A: createAccount(smokeKeys.A), B: createAccount(smokeKeys.B)};
const glClients = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, createClient({chain: testnetBradbury, account})]));
const publicClient = createPublicClient({chain: testnetBradbury, transport: http()});
const walletClient = createWalletClient({chain: testnetBradbury, account: deployer, transport: http()});
const chainId = await glClients.client.getChainId();
assert.equal(chainId, 4221, 'Bradbury chain guard failed');

let manifest = await exists(manifestPath)
  ? JSON.parse(await readFile(manifestPath, 'utf8'))
  : {
      network: 'testnet-bradbury',
      chainId,
      sourceHash,
      startedAt: new Date().toISOString(),
      wallets: Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, account.address])),
      steps: {},
      limitations: ['This is a bounded public-testnet smoke run, not a security audit or hackathon acceptance.']
    };
assert.equal(manifest.network, 'testnet-bradbury');
assert.equal(manifest.chainId, chainId);
assert.equal(manifest.sourceHash, sourceHash);
for (const [role, account] of Object.entries(accounts)) {
  assert.equal(manifest.wallets?.[role]?.toLowerCase(), account.address.toLowerCase(), 'Saved run requires its original wallet set');
}
const save = () => writeFile(manifestPath, stringify(manifest));
await save();

async function genlayerTransaction(step, client, submit) {
  let item = manifest.steps[step];
  if (!item) {
    item = manifest.steps[step] = {kind: 'GENLAYER', phase: 'SIGNING', startedAt: new Date().toISOString()};
    await save();
    const hash = await submit();
    Object.assign(item, {hash, phase: 'PENDING', submittedAt: new Date().toISOString()});
    await save();
    console.log(JSON.stringify({step, submitted: hash}));
  }
  assert.ok(item.hash, `Uncertain ${step} submission without hash; inspect the account before resending`);
  if (item.phase === 'TERMINAL_FAILED') throw new Error(`TERMINAL ${item.status} for ${step}`);
  if (['ACCEPTED_SUCCESS', 'FINALIZED_SUCCESS'].includes(item.phase)) return item;
  let receipt;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await sleep(10_000);
    try {
      receipt = await client.getTransaction({hash: item.hash});
      await writeFile(resolve(reportDir, `${step}.receipt.json`), stringify(receipt));
      const status = statusName(receipt);
      if (attempt % 3 === 0 || ['FINALIZED', 'UNDETERMINED', 'CANCELED'].includes(status)) {
        console.log(JSON.stringify({step, status, execution: executionName(receipt)}));
      }
      if (['UNDETERMINED', 'CANCELED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(status)) {
        Object.assign(item, {phase: 'TERMINAL_FAILED', status, execution: executionName(receipt), failedAt: new Date().toISOString()});
        await save();
        throw new Error(`TERMINAL ${status} for ${step}`);
      }
      if (['ACCEPTED', 'FINALIZED'].includes(status)) break;
    } catch (error) {
      if (String(error.message).startsWith('TERMINAL')) throw error;
      if (attempt % 3 === 0) console.log(JSON.stringify({step, observationError: String(error.shortMessage ?? error.message).split('\n')[0]}));
    }
  }
  assertExecution(receipt ?? {}, false);
  const finalized = statusName(receipt) === 'FINALIZED';
  Object.assign(item, {
    phase: finalized ? 'FINALIZED_SUCCESS' : 'ACCEPTED_SUCCESS',
    execution: executionName(receipt),
    [finalized ? 'finalizedAt' : 'acceptedAt']: new Date().toISOString(),
    to: receipt.to_address ?? receipt.recipient ?? receipt.data?.contract_address ?? null
  });
  await save();
  return item;
}

async function awaitAllGenlayerFinality() {
  for (let attempt = 0; attempt < 480; attempt += 1) {
    let pendingCount = 0;
    for (const [step, item] of Object.entries(manifest.steps)) {
      if (item.kind !== 'GENLAYER' || ['FINALIZED_SUCCESS', 'TERMINAL_FAILED'].includes(item.phase)) continue;
      pendingCount += 1;
      const receipt = await glClients.client.getTransaction({hash: item.hash});
      await writeFile(resolve(reportDir, `${step}.receipt.json`), stringify(receipt));
      const status = statusName(receipt);
      if (['UNDETERMINED', 'CANCELED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(status)) throw new Error(`TERMINAL ${status} for ${step}`);
      if (status === 'FINALIZED') {
        assertExecution(receipt, true);
        Object.assign(item, {phase: 'FINALIZED_SUCCESS', execution: executionName(receipt), finalizedAt: new Date().toISOString()});
        pendingCount -= 1;
      } else if (status === 'READY_TO_FINALIZE') {
        if (!item.finalization) {
          item.finalization = {phase: 'SIGNING', startedAt: new Date().toISOString()};
          await save();
          const finalizeHash = await glClients.client.finalizeTransaction({txId: item.hash});
          Object.assign(item.finalization, {phase: 'PENDING', hash: finalizeHash, submittedAt: new Date().toISOString()});
          await save();
          console.log(JSON.stringify({step, finalizeSubmitted: finalizeHash}));
        }
        assert.ok(item.finalization.hash, `Uncertain ${step} finalization without hash; inspect before retrying`);
        if (item.finalization.phase !== 'CONFIRMED') {
          try {
            const finalizeReceipt = await publicClient.getTransactionReceipt({hash: item.finalization.hash});
            assert.equal(finalizeReceipt.status, 'success', `${step} finalization reverted`);
            await writeFile(resolve(reportDir, `${step}.finalization.receipt.json`), stringify(finalizeReceipt));
            Object.assign(item.finalization, {phase: 'CONFIRMED', confirmedAt: new Date().toISOString(), blockHash: finalizeReceipt.blockHash});
          } catch (error) {
            if (!/not found|could not be found/i.test(String(error.shortMessage ?? error.message))) throw error;
          }
        }
      }
    }
    await save();
    if (pendingCount === 0) return;
    if (attempt % 6 === 0) console.log(JSON.stringify({step: 'all-finality', pending: pendingCount}));
    await sleep(10_000);
  }
  throw new Error('Timed out waiting for every GenLayer transaction to finalize');
}

async function nativeTransfer(step, recipient, targetBalance) {
  const currentBalance = await publicClient.getBalance({address: recipient});
  if (currentBalance >= targetBalance) {
    manifest.steps[step] ??= {kind: 'EVM_TRANSFER', phase: 'FINALIZED_SUCCESS', skipped: true, balance: currentBalance.toString()};
    await save();
    return;
  }
  let item = manifest.steps[step];
  if (!item) {
    item = manifest.steps[step] = {kind: 'EVM_TRANSFER', phase: 'SIGNING', startedAt: new Date().toISOString(), recipient, amount: (targetBalance - currentBalance).toString()};
    await save();
    const hash = await walletClient.sendTransaction({to: recipient, value: targetBalance - currentBalance});
    Object.assign(item, {hash, phase: 'PENDING', submittedAt: new Date().toISOString()});
    await save();
    console.log(JSON.stringify({step, submitted: hash}));
  }
  assert.ok(item.hash, `Uncertain ${step} transfer without hash; inspect the account before resending`);
  if (item.phase === 'FINALIZED_SUCCESS') return;
  const receipt = await publicClient.waitForTransactionReceipt({hash: item.hash, confirmations: 1, timeout: 300_000});
  await writeFile(resolve(reportDir, `${step}.receipt.json`), stringify(receipt));
  assert.equal(receipt.status, 'success', `${step} EVM transfer reverted`);
  const resultingBalance = await publicClient.getBalance({address: recipient});
  assert.ok(resultingBalance >= targetBalance, `${step} recipient balance below target`);
  Object.assign(item, {phase: 'FINALIZED_SUCCESS', finalizedAt: new Date().toISOString(), blockHash: receipt.blockHash, balance: resultingBalance.toString()});
  await save();
}

const deployment = await genlayerTransaction('deploy', glClients.client, () => glClients.client.deployContract({code, args: [], leaderOnly: false, consensusMaxRotations: 3}));
manifest.contract ??= deployment.to;
assert.match(manifest.contract ?? '', /^0x[0-9a-fA-F]{40}$/, 'Missing deployed contract address');
const address = manifest.contract;
console.log(JSON.stringify({stage: 'verify-contract', address}));
const read = async (functionName, args = []) => {
  const result = await glClients.client.readContract({address, functionName, args});
  return typeof result === 'string' ? JSON.parse(result) : result;
};
const waitForJob = async (label, predicate) => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const observed = await read('get_job', [jobId]);
      if (predicate(observed)) return observed;
    } catch (error) {
      if (attempt % 15 === 0) console.log(JSON.stringify({step: label, observationError: String(error.shortMessage ?? error.message).split('\n')[0]}));
    }
    await sleep(2_000);
  }
  throw new Error(`${label} accepted execution is not observable in contract state`);
};

const schema = await glClients.client.getContractSchema(address);
await writeFile(resolve(reportDir, 'schema.json'), stringify(schema));
const deployedCode = await glClients.client.getContractCode(address);
const deployedText = typeof deployedCode === 'string' ? deployedCode : new TextDecoder().decode(deployedCode);
assert.equal(createHash('sha256').update(deployedText).digest('hex'), sourceHash, 'Deployed source hash mismatch');
const config = await read('get_config');
assert.match(String(config.chain_id), /^\d+$/, 'Contract evidence-domain chain id is invalid');
assert.ok(Number(config.chain_id) > 0, 'Contract evidence-domain chain id must be positive');
assert.equal(config.version, 'veristep-1.1');
assert.equal(config.contract.toLowerCase(), address.toLowerCase());
manifest.contractChainId = String(config.chain_id);
manifest.contractVerified = true;
manifest.schemaVerified = true;
manifest.configVerified = true;
await save();
console.log(JSON.stringify({stage: 'contract-verified', contractChainId: manifest.contractChainId}));

const deployerBalance = await publicClient.getBalance({address: accounts.client.address});
assert.ok(deployerBalance >= parseEther('3'), `Insufficient remaining deployer balance: ${formatEther(deployerBalance)} GEN`);
await nativeTransfer('fund-a', accounts.A.address, parseEther('0.75'));
await nativeTransfer('fund-b', accounts.B.address, parseEther('0.75'));
console.log(JSON.stringify({stage: 'smoke-workflow'}));

const feeA = parseEther('0.02');
const feeB = parseEther('0.03');
const bondA = parseEther('0.01');
const bondB = parseEther('0.01');
const penaltyA = parseEther('0.005');
const penaltyB = parseEther('0.005');
const jobId = `bradbury-happy-${sourceHash.slice(0, 8)}`;
const source = 'Export requires approval. Trial accounts cannot export. Paid accounts may export after approval.';
const task = 'Explain whether trial and paid accounts can export, and whether approval is needed.';
const artifact = 'Trial accounts cannot export. Paid accounts may export only after approval.';
const write = (step, role, functionName, args, value = 0n) => genlayerTransaction(step, glClients[role], () => glClients[role].writeContract({address, functionName, args, value, leaderOnly: false, consensusMaxRotations: 3}));

await write('smoke-create', 'client', 'create_job', [jobId, 'Bradbury export policy smoke test', task, source, new CalldataAddress(hexToBytes(accounts.A.address)), new CalldataAddress(hexToBytes(accounts.B.address)), feeA, feeB, bondA, bondB, penaltyA, penaltyB, 86400n, 86400n, 86400n, 86400n, false], feeA + feeB);
let job = await waitForJob('smoke-create-state', observed => observed?.id === jobId);
assert.equal(job.chain_id, manifest.contractChainId, 'Job evidence-domain chain id differs from contract config');
assert.equal(job.contract.toLowerCase(), address.toLowerCase(), 'Job evidence-domain contract differs from deployment');
await write('smoke-accept-a', 'A', 'accept_job', [jobId, job.terms_hash], bondA);
job = await waitForJob('smoke-accept-a-state', observed => observed?.accepted?.A === true);
await write('smoke-accept-b', 'B', 'accept_job', [jobId, job.terms_hash], bondB);
job = await waitForJob('smoke-accept-b-state', observed => observed?.accepted?.B === true);
await write('smoke-submit-a', 'A', 'submit_work', [jobId, artifact, job.artifacts.SOURCE.submission_id]);
job = await waitForJob('smoke-submit-a-state', observed => observed?.artifacts?.A?.issuer?.toLowerCase() === accounts.A.address.toLowerCase());
await write('smoke-submit-b', 'B', 'submit_work', [jobId, artifact, job.artifacts.A.submission_id]);
job = await waitForJob('smoke-submit-b-state', observed => observed?.artifacts?.B?.issuer?.toLowerCase() === accounts.B.address.toLowerCase());
await write('smoke-request-review', 'client', 'request_review', [jobId]);
job = await waitForJob('smoke-request-review-state', observed => ['REVIEW_REQUESTED', 'RESOLVED', 'INCONCLUSIVE'].includes(observed?.status));
let resolveReceipt;
for (const step of ['smoke-resolve', 'smoke-resolve-retry-1', 'smoke-resolve-retry-2']) {
  try {
    resolveReceipt = await write(step, 'client', 'resolve_review', [jobId]);
    break;
  } catch (error) {
    if (!String(error.message).startsWith('TERMINAL')) throw error;
    console.log(JSON.stringify({step, preservedTerminalFailure: String(error.message)}));
  }
}
assert.ok(resolveReceipt, 'Bradbury adjudication exhausted the bounded terminal retries');
job = await waitForJob('smoke-resolve-state', observed => observed?.status === 'RESOLVED');
assert.equal(job.status, 'RESOLVED');
assert.deepEqual(job.outcomes, {A: 'SATISFIED', B: 'SATISFIED'});
await writeFile(resolve(reportDir, `${jobId}.job.json`), stringify(job));
manifest.smoke = {jobId, passed: true, outcomes: job.outcomes};
await save();

const expectedClaim = feeA + bondA;
const claimStep = await write('claim-a', 'A', 'claim', [jobId]);
job = await waitForJob('claim-a-state', observed => observed?.claims?.A?.state === 'MESSAGE_EMITTED');
assert.equal(job.claims.A.state, 'MESSAGE_EMITTED');
assert.equal(job.claims.A.recipient.toLowerCase(), accounts.A.address.toLowerCase());
assert.equal(BigInt(job.claims.A.amount), expectedClaim);
console.log(JSON.stringify({stage: 'await-all-finality'}));
await awaitAllGenlayerFinality();
console.log(JSON.stringify({stage: 'verify-message-processing'}));
const finalClaimReceipt = await glClients.client.getTransaction({hash: claimStep.hash});
assertExecution(finalClaimReceipt, true);
assert.equal(finalClaimReceipt.messages?.length, 1, 'Finalized claim must contain exactly one external message');
assert.equal(finalClaimReceipt.messages[0].recipient.toLowerCase(), accounts.A.address.toLowerCase(), 'Finalized transfer message recipient mismatch');
assert.equal(BigInt(finalClaimReceipt.messages[0].value), expectedClaim, 'Finalized transfer message amount mismatch');
const proposalBlock = BigInt(finalClaimReceipt.readStateBlockRange?.proposalBlock ?? 0);
const finalizedTopic = keccak256(stringToBytes('TransactionFinalized(bytes32)'));
let finalizationLog;
for (let attempt = 0; attempt < 180 && !finalizationLog; attempt += 1) {
  const logs = await publicClient.getLogs({
    address: testnetBradbury.consensusMainContract.address,
    fromBlock: proposalBlock,
    toBlock: 'latest'
  });
  finalizationLog = logs.find(log => log.topics[0]?.toLowerCase() === finalizedTopic && log.topics[1]?.toLowerCase() === claimStep.hash.toLowerCase());
  if (!finalizationLog) await sleep(10_000);
}
assert.ok(finalizationLog, 'No canonical TransactionFinalized event found for the claim');
const evmReceipt = await publicClient.getTransactionReceipt({hash: finalizationLog.transactionHash});
assert.equal(evmReceipt.status, 'success', 'Claim finalization transaction reverted');
const balanceBefore = await publicClient.getBalance({address: accounts.A.address, blockNumber: finalizationLog.blockNumber - 1n});
const balanceAfter = await publicClient.getBalance({address: accounts.A.address, blockNumber: finalizationLog.blockNumber});
assert.equal(balanceAfter - balanceBefore, expectedClaim, 'Recipient balance delta does not equal the finalized claim message');
await writeFile(resolve(reportDir, 'claim-a-finalization.receipt.json'), stringify(evmReceipt));
manifest.claimVerification = {
  passed: true,
  parentHash: claimStep.hash,
  parentStatus: statusName(finalClaimReceipt),
  parentExecution: executionName(finalClaimReceipt),
  finalizationTransaction: finalizationLog.transactionHash,
  finalizationBlock: finalizationLog.blockNumber.toString(),
  recipient: accounts.A.address,
  amount: expectedClaim.toString(),
  recipientBalanceBefore: balanceBefore.toString(),
  recipientBalanceAfter: balanceAfter.toString(),
  recipientBalanceDelta: (balanceAfter - balanceBefore).toString()
};
manifest.completedAt = new Date().toISOString();
await writeFile(resolve(reportDir, `${jobId}.claimed.job.json`), stringify(job));
await save();
console.log(JSON.stringify({completed: true, contract: address, jobId, outcomes: job.outcomes, claim: manifest.claimVerification}));
