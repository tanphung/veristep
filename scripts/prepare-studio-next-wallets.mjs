import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createAccount} from "genlayer-js";

const root=resolve(import.meta.dirname,"..");
const lines=(await readFile(resolve(root,".env"),"utf8")).split(/\r?\n/);
const candidates=[];
for(const [index,line] of lines.entries()){
  const assignment=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  const name=assignment?.[1]??`BARE_LINE_${index+1}`;
  const raw=(assignment?.[2]??line.trim()).replace(/^(['"])(.*)\1$/,"$2");
  const match=assignment&&/^(?:0x)?[0-9a-fA-F]{64}$/.test(raw)?raw.match(/(?:0x)?[0-9a-fA-F]{64}/):raw.match(/(?:0x)?[0-9a-fA-F]{64}/);
  if(match){const value=match[0];candidates.push({name,key:value.startsWith("0x")?value:`0x${value}`});}
}
const primary=candidates.find(item=>item.name==="PRIVATE_KEY");
assert.ok(primary,"PRIVATE_KEY is required for the client wallet");
const unique=[primary,...candidates.filter(item=>item.key.toLowerCase()!==primary.key.toLowerCase())]
  .filter((item,index,rows)=>rows.findIndex(row=>row.key.toLowerCase()===item.key.toLowerCase())===index);
assert.ok(unique.length>=4,"Expected PRIVATE_KEY plus three distinct Studio Next test wallets");
const keys={CLIENT_PRIVATE_KEY:unique[0].key,WORKER_A_PRIVATE_KEY:unique[1].key,WORKER_B_PRIVATE_KEY:unique[2].key,OUTSIDER_PRIVATE_KEY:unique[3].key};
const accounts=Object.fromEntries(Object.entries(keys).map(([name,key])=>[name.replace("_PRIVATE_KEY",""),createAccount(key).address]));
assert.equal(new Set(Object.values(accounts).map(value=>value.toLowerCase())).size,4,"All Studio Next test wallets must be distinct");
await mkdir(resolve(root,".secrets"),{recursive:true});
await writeFile(resolve(root,".secrets","studio-next-wallets.json"),`${JSON.stringify(keys,null,2)}\n`,{mode:0o600});
console.log(JSON.stringify({prepared:true,wallets:accounts},null,2));
