import {fireEvent,render,screen} from "@testing-library/react";
import {describe,expect,it} from "vitest";
import agentTankManifest from "../../reports/studio-next-agent-tank/manifest.json";
import hostedManifest from "../../reports/studio-next-hosted-agent/manifest.json";
import hostedFinalManifest from "../../reports/studio-next-hosted-agent-final/manifest.json";
import bFaultFinalManifest from "../../reports/studio-next-b-fault-final/manifest.json";
import {V2LifecycleActivity,V2OnchainActivity} from "../../frontend/src/V2OnchainActivity";
import {activityForContext,activityForSettlementLeg,onchainActivityByDeal} from "../../frontend/src/onchain-activity";

function evidenceHashes():Set<string>{
  const tankSteps=Object.values(agentTankManifest.steps).flatMap(step=>"hash" in step&&typeof step.hash==="string"?[step.hash]:[]);
  const settlement=Object.values(agentTankManifest.cases).flatMap(item=>"settlementDispatch" in item&&Array.isArray(item.settlementDispatch)?item.settlementDispatch.map(leg=>leg.transaction):[]);
  const hostedSteps=Object.values(hostedManifest.steps).flatMap(step=>typeof step.hash==="string"?[step.hash]:[]);
  const bFaultFinal=Object.values(bFaultFinalManifest.steps).flatMap(step=>typeof step.hash==="string"?[step.hash]:[]);
  return new Set([...tankSteps,...settlement,...hostedSteps,...Object.values(hostedManifest.workerTransactions),...Object.values(hostedFinalManifest.transactionAudit.client),...Object.values(hostedFinalManifest.transactionAudit.workers),...bFaultFinal]);
}

describe("Studio Next on-chain activity",()=>{
  it("exposes only transaction hashes preserved in checked-in release evidence",()=>{const known=evidenceHashes();for(const items of Object.values(onchainActivityByDeal))for(const item of items){expect(item.hash).toMatch(/^0x[0-9a-f]{64}$/);expect(known.has(item.hash),item.hash).toBe(true);}});
  it("places deal and agent actions in lifecycle context",()=>{render(<V2LifecycleActivity dealId="v2-hosted-agent-live-1"/>);expect(screen.getByText("Deal / Terms")).toBeVisible();expect(screen.getByText("Agent A submission attempt")).toBeVisible();expect(screen.getByText("Finalized error")).toBeVisible();expect(screen.getAllByRole("link",{name:/View tx/})).toHaveLength(5);});
  it("keeps the complete transaction audit collapsed",()=>{render(<V2OnchainActivity dealId="v2-studio-no-fault-358323c"/>);expect(screen.getByText("All on-chain transactions")).toBeVisible();expect(screen.getByText("Agent A payout dispatched")).not.toBeVisible();fireEvent.click(screen.getByText("All on-chain transactions"));expect(screen.getByText("Agent A accepted")).toBeVisible();expect(screen.getByText("Agent A payout dispatch attempt")).toBeVisible();expect(screen.getByText("Finalized error")).toBeVisible();expect(screen.getAllByRole("link",{name:/View tx/})).toHaveLength(13);});
  it("labels unresolved review transactions without claiming success",()=>{expect(activityForContext("v2-studio-b-fault-358323c","REVIEW").map(item=>item.phase)).toEqual(["FINALIZED_SUCCESS","UNDETERMINED","UNDETERMINED"]);render(<V2OnchainActivity dealId="v2-studio-b-fault-358323c"/>);expect(screen.getAllByText("Undetermined")).toHaveLength(2);expect(screen.getAllByText("Undetermined")[0]).not.toBeVisible();fireEvent.click(screen.getByText("All on-chain transactions"));expect(screen.getAllByText("Undetermined")[0]).toBeVisible();expect(screen.queryByText("Review resolved")).not.toBeInTheDocument();});
  it("maps settlement legs to their exact dispatch hashes",()=>{const proof=activityForSettlementLeg("v2-studio-no-fault-358323c","A:PAYOUT");expect(proof?.hash).toBe("0x7453551caef14b18732b7476f88d4fbbb6139966475be4fddd0c2bee9b2b1dd1");expect(activityForSettlementLeg("v2-studio-b-fault-358323c","A:PAYOUT")).toBeUndefined();});
  it("exposes all eight passing hosted lifecycle transactions",()=>{render(<V2OnchainActivity dealId="v2-hosted-agent-live-2"/>);fireEvent.click(screen.getByText("All on-chain transactions"));expect(screen.getAllByRole("link",{name:/View tx/})).toHaveLength(8);expect(screen.queryByText("Finalized error")).not.toBeInTheDocument();});
  it("exposes twelve passing B-fault lifecycle and dispatch transactions",()=>{render(<V2OnchainActivity dealId="v2-studio-b-fault-r2-358323c"/>);fireEvent.click(screen.getByText("All on-chain transactions"));expect(screen.getAllByRole("link",{name:/View tx/})).toHaveLength(12);expect(screen.queryByText("Undetermined")).not.toBeInTheDocument();});
  it("does not render activity for a deal without preserved release hashes",()=>{const {container}=render(<V2OnchainActivity dealId="unknown-deal"/>);expect(container).toBeEmptyDOMElement();});
});
