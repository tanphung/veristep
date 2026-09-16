import {describe,expect,it} from "vitest";
import {budgetSnapshot,markBudgetDispatched,markBudgetUncertain,reserveBudget,settleBudget} from "../../worker/src/budget";
import {BUILD_BUDGET_NANO_USD} from "../../worker/src/policy";

type Reservation={reserved_nano_usd:number;state:string;actual_nano_usd?:number;error?:string};
function budgetDb(){
  let budget={limit_nano_usd:BUILD_BUDGET_NANO_USD,spent_nano_usd:0,reserved_nano_usd:0};const reservations=new Map<string,Reservation>();
  const prepare=(sql:string)=>({async first(){return sql.includes("FROM openai_budget")?{...budget}:null;},bind(...args:unknown[]){const statement={
    async first(){if(sql.includes("FROM openai_reservations"))return reservations.get(String(args[0]))??null;if(sql.includes("FROM openai_budget"))return {...budget};return null;},
    async run(){
      if(sql.startsWith("INSERT INTO openai_reservations")){const id=String(args[0]);if(reservations.has(id))throw new Error("UNIQUE");reservations.set(id,{reserved_nano_usd:Number(args[1]),state:"RESERVED"});return {success:true,meta:{changes:1}};}
      if(sql.includes("reserved_nano_usd = reserved_nano_usd +")){const amount=Number(args[0]);if(budget.spent_nano_usd+budget.reserved_nano_usd+amount>budget.limit_nano_usd)throw new Error("CHECK cap");budget.reserved_nano_usd+=amount;return {success:true,meta:{changes:1}};}
      if(sql.includes("state = 'UNCERTAIN'")){const row=reservations.get(String(args[1]));if(row?.state!=="DISPATCHED")return {success:true,meta:{changes:0}};row.state="UNCERTAIN";row.error=String(args[0]);return {success:true,meta:{changes:1}};}
      if(sql.includes("state = 'SETTLED'")){const row=reservations.get(String(args[3]));if(row?.state!=="DISPATCHED")return {success:true,meta:{changes:0}};row.state="SETTLED";row.actual_nano_usd=Number(args[0]);return {success:true,meta:{changes:1}};}
      if(sql.includes("state = 'DISPATCHED'")){const row=reservations.get(String(args[0]));if(row?.state!=="RESERVED")return {success:true,meta:{changes:0}};row.state="DISPATCHED";return {success:true,meta:{changes:1}};}
      if(sql.includes("reserved_nano_usd = reserved_nano_usd -")){budget.reserved_nano_usd-=Number(args[0]);budget.spent_nano_usd+=Number(args[1]);return {success:true,meta:{changes:1}};}
      return {success:true,meta:{changes:0}};
    },
  };return statement;}});
  const db={prepare,async batch(items:Array<{run:()=>Promise<unknown>}>){const budgetBefore={...budget},reservationsBefore=new Map([...reservations].map(([key,value])=>[key,{...value}]));try{return await Promise.all(items.map(item=>item.run()));}catch(error){budget=budgetBefore;reservations.clear();for(const [key,value] of reservationsBefore)reservations.set(key,value);throw error;}}} as unknown as D1Database;
  return {db,reservations,snapshot:()=>({...budget})};
}

describe("OpenAI hard budget journal",()=>{
  it("atomically refuses any reservation above the approved total cap",async()=>{const memory=budgetDb();await expect(reserveBudget(memory.db,"too-large",BUILD_BUDGET_NANO_USD+1)).rejects.toThrow("EXHAUSTED");expect(memory.snapshot().reserved_nano_usd).toBe(0);expect(memory.reservations.size).toBe(0);});
  it("keeps the full reserve and blocks reuse after an uncertain dispatch",async()=>{const memory=budgetDb(),reservation=await reserveBudget(memory.db,"run:A",2_000_000);await markBudgetDispatched(memory.db,reservation);await markBudgetUncertain(memory.db,reservation,"lost response");await expect(reserveBudget(memory.db,"run:A",2_000_000)).rejects.toThrow("already settled");expect(memory.snapshot()).toMatchObject({spent_nano_usd:0,reserved_nano_usd:2_000_000});expect(memory.reservations.get("run:A")?.state).toBe("UNCERTAIN");});
  it("settles actual token usage once and returns unused reserve",async()=>{const memory=budgetDb(),reservation=await reserveBudget(memory.db,"run:B",2_000_000);await markBudgetDispatched(memory.db,reservation);await expect(settleBudget(memory.db,reservation,100,100)).resolves.toBe(140_000);expect(await budgetSnapshot(memory.db)).toEqual({limitNanoUsd:BUILD_BUDGET_NANO_USD,spentNanoUsd:140_000,reservedNanoUsd:0,remainingNanoUsd:BUILD_BUDGET_NANO_USD-140_000});await expect(settleBudget(memory.db,reservation,100,100)).rejects.toThrow("twice");});
});
