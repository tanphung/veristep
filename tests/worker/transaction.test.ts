import {describe,expect,it,vi} from "vitest";
import {journaledTransaction} from "../../worker/src/genlayer";

function journalDb(){
  let row:{tx_hash:string|null;state:string}|undefined;
  const db={prepare(sql:string){return {bind(...args:unknown[]){return {
    async first(){return row??null;},
    async run(){
      if(sql.startsWith("INSERT INTO tx_journal")){if(row)return {meta:{changes:0}};row={tx_hash:null,state:"SIGNING"};return {meta:{changes:1}};}
      if(sql.includes("state = 'UNKNOWN'")){if(row?.state!=="SIGNING")return {meta:{changes:0}};row.state="UNKNOWN";return {meta:{changes:1}};}
      if(sql.includes("SET tx_hash = ?")){if(row?.state!=="SIGNING")return {meta:{changes:0}};row={tx_hash:String(args[0]),state:"PENDING"};return {meta:{changes:1}};}
      return {meta:{changes:0}};
    },
  };}};}} as unknown as D1Database;
  return {db,state:()=>row};
}

describe("GenLayer transaction journal",()=>{
  it("returns the same stored hash and never broadcasts a duplicate",async()=>{const memory=journalDb(),hash=`0x${"a".repeat(64)}`,submit=vi.fn(async()=>hash);await expect(journaledTransaction(memory.db,"run","A:submit_artifact",submit)).resolves.toBe(hash);await expect(journaledTransaction(memory.db,"run","A:submit_artifact",submit)).resolves.toBe(hash);expect(submit).toHaveBeenCalledTimes(1);expect(memory.state()).toEqual({tx_hash:hash,state:"PENDING"});});
  it("fails closed after an uncertain throw and does not retry on resume",async()=>{const memory=journalDb(),submit=vi.fn(async()=>{throw new Error("transport lost after dispatch");});await expect(journaledTransaction(memory.db,"run","B:accept_work",submit)).rejects.toThrow("transport lost");expect(memory.state()?.state).toBe("UNKNOWN");await expect(journaledTransaction(memory.db,"run","B:accept_work",submit)).rejects.toThrow("do not resend");expect(submit).toHaveBeenCalledTimes(1);});
});
