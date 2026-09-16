import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createAccount,createClient} from "genlayer-js";
import {studioDevnet} from "genlayer-js/chains";

const root=resolve(import.meta.dirname,"..");
const rpc="https://studio-next.genlayer.com/api";
const chain={...studioDevnet,id:61997,name:"GenLayer Studio Next",rpcUrls:{default:{http:[rpc]}}};
const keys=JSON.parse(await readFile(resolve(root,".secrets","studio-next-wallets.json"),"utf8"));
const roles={client:keys.CLIENT_PRIVATE_KEY,A:keys.WORKER_A_PRIVATE_KEY,B:keys.WORKER_B_PRIVATE_KEY,outsider:keys.OUTSIDER_PRIVATE_KEY};
const accounts=Object.fromEntries(Object.entries(roles).map(([role,key])=>[role,createAccount(key)]));
assert.equal(new Set(Object.values(accounts).map(account=>account.address.toLowerCase())).size,4,"Wallets must be distinct");
const client=createClient({chain,endpoint:rpc,account:accounts.client});
assert.equal(await client.getChainId(),61997,"Studio Next chain guard failed");
const before={};
for(const [role,account] of Object.entries(accounts))before[role]=String(await client.getBalance({address:account.address}));
let faucetAvailable=true,faucetError="";
for(const [role,account] of Object.entries(accounts)){
  if(BigInt(before[role])>=5n*10n**18n)continue;
  // The RC RPC defines this amount as a JSON number in wei. 1e20 is exactly the
  // Studio faucet's 100 GEN test allocation and is never used for contract math.
  try{await client.request({method:"sim_fundAccount",params:[account.address,1e20]});}
  catch(error){faucetAvailable=false;faucetError=error instanceof Error?error.message:"sim_fundAccount failed";break;}
}
const after={};
for(const [role,account] of Object.entries(accounts))after[role]=String(await client.getBalance({address:account.address}));
const report={network:"studio-next",chainId:61997,rpc,faucetMethod:"sim_fundAccount",faucetAvailable,wallets:Object.fromEntries(Object.entries(accounts).map(([role,account])=>[role,{address:account.address,balanceBefore:before[role],balanceAfter:after[role]}])),checkedAt:new Date().toISOString(),...(faucetError?{error:faucetError.slice(0,500)}:{})};
await mkdir(resolve(root,"reports"),{recursive:true});
await writeFile(resolve(root,"reports","studio-next-wallets.json"),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({faucetAvailable,wallets:Object.fromEntries(Object.entries(report.wallets).map(([role,value])=>[role,{address:value.address,balance:value.balanceAfter}]))},null,2));
if(!faucetAvailable)process.exitCode=2;
