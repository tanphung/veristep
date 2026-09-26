import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve(import.meta.dirname,"..");
const baseline="ba065458dd6b70dcf168fb4a934cc1919d9317d4";
const protectedPaths=["contracts","reports","evidence","frontend/src/deployment.json","frontend/src/payment-verification.json","fee-profile.json","worker/wrangler.jsonc","submission/VeriStep-Agent-Tank-Demo.mp4","submission/veristep-logo.png"];
const git=args=>execFileSync("git",args,{cwd:root,maxBuffer:8*1024*1024}).toString("utf8").trim();

export function verifySubmission(){
  const entries=git(["ls-tree","-r",baseline,"--",...protectedPaths]).split("\n").filter(Boolean);
  assert.ok(entries.length>0,"Submission baseline unavailable; fetch the baseline commit first.");
  const expected=new Map(entries.map(line=>{const [metadata,path]=line.split("\t");return [path,metadata.split(" ")[2]];}));
  const current=new Set(git(["ls-files","--cached","--others","--exclude-standard","--",...protectedPaths]).split("\n").filter(Boolean));
  const changed=[];
  for(const [path,blob] of expected){
    try{
      // Git normalizes checkout line endings. Content changes still fail.
      if(!current.has(path)||git(["hash-object",`--path=${path}`,"--",path])!==blob)changed.push(path);
    }catch{changed.push(path);}
  }
  for(const path of current)if(!expected.has(path))changed.push(path);
  assert.equal(changed.length,0,`Frozen submission files changed:\n${changed.join("\n")}`);
  const deployment=JSON.parse(readFileSync(resolve(root,"frontend/src/deployment.json"),"utf8"));
  const sourceHash=createHash("sha256").update(readFileSync(resolve(root,"contracts/veristep_release.py"))).digest("hex");
  assert.equal(sourceHash,"baedb9762690220aa8620fc6a94065b993700cbccb5ded586b4560ee3fc4019b","Deployed source byte hash changed");
  assert.equal(deployment.sourceHash,sourceHash);
  assert.equal(deployment.contract,"0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b");
  assert.equal(deployment.chainId,61997);
  console.log(`PASS: ${expected.size} frozen submission files match ${baseline}; deployment identity and source SHA-256 unchanged.`);
}

verifySubmission();
