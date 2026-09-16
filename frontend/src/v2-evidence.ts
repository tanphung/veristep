import type {V2Commitment,V2Origin} from "./v2-types";

const headers={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
const api="https://api.github.com/repos";
function requireText(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
function cleanOwner(value:string){value=value.trim();requireText(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value),"Invalid GitHub owner");return value;}
function cleanRepo(value:string){value=value.trim();requireText(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/.test(value),"Invalid GitHub repository");return value;}
function cleanPath(value:string){value=value.trim();const parts=value.split("/");requireText(parts.length>=1&&parts.length<=4&&parts.every(part=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/.test(part)),"Artifact path must contain 1–4 safe path segments");return {value,parts};}
async function json(url:string){const response=await fetch(url,{headers});if(response.status!==200)throw new Error(`GitHub returned HTTP ${response.status}`);const contentType=response.headers.get("content-type")?.toLowerCase()??"";if(!contentType.startsWith("application/json")&&!contentType.startsWith("application/vnd.github+json"))throw new Error("GitHub returned an unexpected content type");return response.json() as Promise<Record<string,unknown>>;}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
function base64(value:string){const binary=atob(value.replaceAll("\n",""));return Uint8Array.from(binary,character=>character.charCodeAt(0));}

export async function githubOrigin(ownerInput:string,repoInput:string):Promise<V2Origin>{
  const owner=cleanOwner(ownerInput),repository=cleanRepo(repoInput);
  const value=await json(`${api}/${owner}/${repository}`);
  const repoOwner=value.owner as Record<string,unknown>|undefined;
  requireText(Number.isSafeInteger(value.id)&&Number(value.id)>0&&Number.isSafeInteger(repoOwner?.id)&&Number(repoOwner?.id)>0,"GitHub repository identity is incomplete");
  requireText(value.private===false&&value.name===repository&&value.full_name===`${owner}/${repository}`&&repoOwner?.login===owner,"GitHub repository identity does not match the requested origin");
  return {provider:"github",hostname:"api.github.com",owner,owner_id:Number(repoOwner.id),repository,repository_id:Number(value.id)};
}

export async function githubCommitment(ownerInput:string,repoInput:string,commitInput:string,pathInput:string):Promise<V2Commitment>{
  const origin=await githubOrigin(ownerInput,repoInput),commit=commitInput.trim().toLowerCase(),path=cleanPath(pathInput);
  requireText(/^[0-9a-f]{40}$/.test(commit),"Use a full immutable 40-character commit SHA");
  const base=`${api}/${origin.owner}/${origin.repository}`;
  const commitValue=await json(`${base}/git/commits/${commit}`);
  const rootTree=commitValue.tree as Record<string,unknown>|undefined;
  requireText(commitValue.sha===commit&&typeof rootTree?.sha==="string"&&/^[0-9a-f]{40}$/.test(rootTree.sha),"GitHub commit identity mismatch");
  let expected=String(rootTree.sha),entry:Record<string,unknown>|undefined;
  for(let index=0;index<path.parts.length;index++){
    const tree=await json(`${base}/git/trees/${expected}`),entries=tree.tree;
    requireText(tree.sha===expected&&tree.truncated===false&&Array.isArray(entries)&&entries.length<=256,"GitHub tree is truncated or oversized");
    const matches=(entries as Record<string,unknown>[]).filter(item=>item.path===path.parts[index]);
    requireText(matches.length===1,"Artifact path is not unique in the immutable tree");
    entry=matches[0];expected=String(entry.sha??"");
    requireText(index<path.parts.length-1?entry.mode==="040000"&&entry.type==="tree":entry.mode==="100644"&&entry.type==="blob","Artifact must be a regular committed file");
  }
  requireText(entry&&typeof entry.sha==="string"&&Number.isInteger(entry.size)&&Number(entry.size)>=1&&Number(entry.size)<=4096,"Artifact must be 1–4096 bytes");
  const blob=await json(`${base}/git/blobs/${entry.sha}`);
  requireText(blob.sha===entry.sha&&blob.encoding==="base64"&&blob.size===entry.size&&typeof blob.content==="string","GitHub blob identity mismatch");
  const bytes=base64(blob.content as string);
  requireText(bytes.length===entry.size,"GitHub blob byte length mismatch");
  const decoder=new TextDecoder("utf-8",{fatal:true});decoder.decode(bytes);
  const sha256=hex(await crypto.subtle.digest("SHA-256",bytes));
  const prefix=new TextEncoder().encode(`blob ${bytes.length}\0`),gitBytes=new Uint8Array(prefix.length+bytes.length);gitBytes.set(prefix);gitBytes.set(bytes,prefix.length);
  requireText(hex(await crypto.subtle.digest("SHA-1",gitBytes))===entry.sha,"Git blob digest mismatch");
  const content_type=path.value.endsWith(".txt")?"text/plain":path.value.endsWith(".md")?"text/markdown":path.value.endsWith(".json")?"application/json":undefined;
  requireText(content_type,"Only .txt, .md and .json evidence files are supported");
  return {origin,commit,path:path.value,blob:entry.sha,content_type,encoding:"utf-8",byte_length:bytes.length,sha256};
}
