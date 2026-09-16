import {studioDevnet} from "genlayer-js/chains";

export const STUDIO_NEXT_CHAIN_ID=61997;

export function studioNext(endpoint:string){
  return {
    ...studioDevnet,
    id:STUDIO_NEXT_CHAIN_ID,
    name:"GenLayer Studio Next",
    rpcUrls:{default:{http:[endpoint]}},
  } satisfies typeof studioDevnet;
}
