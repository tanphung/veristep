import {WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep} from "cloudflare:workers";
import {generatePersistedArtifact, markArtifactPublished} from "./artifacts";
import {acquireArtifact, publishArtifact} from "./github";
import {assertHostedWorkers, inspectTransaction, markTransactionFinal, readFinalDeal, submissionArgs, writeAgentAction} from "./genlayer";
import {buildAgentPrompt} from "./policy";
import type {AgentRole, Env, RunParams, WorkerDeal} from "./types";

const ONCE = {retries: {limit: 0, delay: "1 second" as const}, timeout: "5 minutes" as const};

async function setStage(env: Env, params: RunParams, stage: string, detail = ""): Promise<void> {
  await env.DB.prepare("UPDATE worker_runs SET stage = ?, detail = ?, updated_at = unixepoch() WHERE run_id = ?").bind(stage, detail, params.runId).run();
}

async function waitFinal(step: WorkflowStep, env: Env, params: RunParams, role: AgentRole, action: string, hash: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await step.do(`${role}-${action}-receipt-${attempt}`, ONCE, () => inspectTransaction(env, role, hash));
    if (state === "SUCCESS") {
      await step.do(`${role}-${action}-journal-final`, ONCE, () => markTransactionFinal(env, params, role, action));
      return;
    }
    await step.sleep(`${role}-${action}-backoff-${attempt}`, "5 seconds");
  }
  throw new Error(`${role} ${action} did not finalize within the worker polling window`);
}

async function acceptRole(step: WorkflowStep, env: Env, params: RunParams, role: AgentRole, deal: WorkerDeal): Promise<void> {
  if (deal.accepted[role]) return;
  if (deal.status !== "FUNDED") throw new Error(`${role} cannot accept in ${deal.status}`);
  const hash = await step.do(`${role}-accept-submit`, ONCE, () => writeAgentAction(env, params, role, "accept_work", [deal.deal_id, deal.terms_hash], BigInt(deal.manifest.terms.money[role].bond)));
  await waitFinal(step, env, params, role, "accept_work", hash);
}

export class VeriStepWorkflow extends WorkflowEntrypoint<Env, RunParams> {
  async run(event: Readonly<WorkflowEvent<RunParams>>, step: WorkflowStep): Promise<unknown> {
    const params = event.payload;
    try {
      let deal = await step.do("load-finalized-deal", ONCE, () => readFinalDeal(this.env, params));
      await step.do("verify-hosted-worker-identities", ONCE, async () => { assertHostedWorkers(this.env, deal); return true; });

      await step.do("stage-accepting", ONCE, () => setStage(this.env, params, "ACCEPTING"));
      await acceptRole(step, this.env, params, "A", deal);
      deal = await step.do("reload-after-a-accept", ONCE, () => readFinalDeal(this.env, params));
      await acceptRole(step, this.env, params, "B", deal);
      deal = await step.do("reload-after-b-accept", ONCE, () => readFinalDeal(this.env, params));

      if (!deal.artifacts.A) {
        await step.do("stage-agent-a", ONCE, () => setStage(this.env, params, "AGENT_A_GENERATING"));
        const source = await step.do("fetch-full-source", ONCE, () => acquireArtifact(this.env, deal.artifacts.SOURCE!.commitment));
        const prompt = buildAgentPrompt(deal, "A", {SOURCE: source});
        const artifact = await step.do("generate-persist-agent-a", ONCE, () => generatePersistedArtifact(this.env, params.runId, deal, "A", prompt));
        const published = await step.do("publish-agent-a", ONCE, () => publishArtifact(this.env, params.runId, deal.deal_id, "A", artifact, deal.manifest.terms.origins.A));
        await step.do("checkpoint-published-agent-a", ONCE, () => markArtifactPublished(this.env, params.runId, "A", published));
        const hash = await step.do("A-submit-artifact", ONCE, () => writeAgentAction(this.env, params, "A", "submit_artifact", submissionArgs(deal, "A", published.commitment), 0n));
        await waitFinal(step, this.env, params, "A", "submit_artifact", hash);
      }

      deal = await step.do("reload-finalized-a-handoff", ONCE, () => readFinalDeal(this.env, params));
      if (!deal.artifacts.A) throw new Error("Agent A transaction finalized without an observable A handoff");
      if (!deal.artifacts.B) {
        await step.do("stage-agent-b", ONCE, () => setStage(this.env, params, "AGENT_B_GENERATING"));
        const required = new Set(deal.manifest.terms.semantic_obligations.filter(item => item.stage === "B").flatMap(item => item.evidence_ids));
        const a = await step.do("fetch-full-finalized-a", ONCE, () => acquireArtifact(this.env, deal.artifacts.A!.commitment));
        const source = required.has("SOURCE") ? await step.do("refetch-full-source-for-b", ONCE, () => acquireArtifact(this.env, deal.artifacts.SOURCE!.commitment)) : undefined;
        const prompt = buildAgentPrompt(deal, "B", {A: a, SOURCE: source});
        const artifact = await step.do("generate-persist-agent-b", ONCE, () => generatePersistedArtifact(this.env, params.runId, deal, "B", prompt));
        const published = await step.do("publish-agent-b", ONCE, () => publishArtifact(this.env, params.runId, deal.deal_id, "B", artifact, deal.manifest.terms.origins.B));
        await step.do("checkpoint-published-agent-b", ONCE, () => markArtifactPublished(this.env, params.runId, "B", published));
        const hash = await step.do("B-submit-artifact", ONCE, () => writeAgentAction(this.env, params, "B", "submit_artifact", submissionArgs(deal, "B", published.commitment), 0n));
        await waitFinal(step, this.env, params, "B", "submit_artifact", hash);
      }

      deal = await step.do("reload-final-delivery", ONCE, () => readFinalDeal(this.env, params));
      if (!deal.artifacts.A || !deal.artifacts.B || deal.status !== "REVIEWABLE") throw new Error("Both finalized submissions are not observable");
      await step.do("complete-worker-run", ONCE, async () => {
        await setStage(this.env, params, "AWAITING_CLIENT_REVIEW", "Agent A/B delivery is final; the client must request Intelligent Contract review.");
        await this.env.DB.prepare("UPDATE worker_runs SET state = 'COMPLETE', updated_at = unixepoch() WHERE run_id = ?").bind(params.runId).run();
      });
      return {runId: params.runId, dealId: params.dealId, stage: "AWAITING_CLIENT_REVIEW"};
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown workflow failure";
      await this.env.DB.prepare("UPDATE worker_runs SET state = 'ERROR', detail = ?, updated_at = unixepoch() WHERE run_id = ?").bind(message, params.runId).run();
      throw error;
    }
  }
}
