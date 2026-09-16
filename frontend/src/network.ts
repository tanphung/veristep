import {studioDevnet} from "genlayer-js/chains";

export const STUDIO_NEXT_RPC="https://studio-next.genlayer.com/api";
export const STUDIO_NEXT_EXPLORER="https://explorer-studio-dev.genlayer.com";

export const studioNext={
  ...studioDevnet,
  id:61997,
  name:"GenLayer Studio Next",
  rpcUrls:{default:{http:[STUDIO_NEXT_RPC]}},
  blockExplorers:{default:{name:"GenLayer Studio Next Explorer",url:STUDIO_NEXT_EXPLORER}},
} satisfies typeof studioDevnet;
