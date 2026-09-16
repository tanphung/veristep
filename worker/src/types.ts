export type AgentRole = "A" | "B";
export type EvidenceRole = "SOURCE" | AgentRole;

export interface Origin {
  provider: "github";
  hostname: "api.github.com";
  owner: string;
  owner_id: number;
  repository: string;
  repository_id: number;
}

export interface Commitment {
  origin: Origin;
  commit: string;
  path: string;
  blob: string;
  content_type: "text/plain" | "text/markdown" | "application/json";
  encoding: "utf-8";
  byte_length: number;
  sha256: string;
}

export interface Submission {
  submission_id: string;
  upstream_submission_id: string;
  commitment: Commitment;
}

export interface SemanticObligation {
  id: string;
  stage: AgentRole;
  statement: string;
  evidence_ids: EvidenceRole[];
}

export interface WorkerDeal {
  deal_id: string;
  chain_id: number;
  contract: string;
  status: string;
  terms_hash: string;
  accepted: Record<AgentRole, boolean>;
  manifest: {
    client: string;
    terms: {
      workers: Record<AgentRole, string>;
      origins: Record<EvidenceRole, Origin>;
      money: Record<AgentRole, {fee: string; bond: string; penalty: string}>;
      semantic_obligations: SemanticObligation[];
    };
  };
  artifacts: Partial<Record<EvidenceRole, Submission>>;
}

export interface RunParams {
  runId: string;
  client: string;
  chainId: number;
  contract: string;
  dealId: string;
}

export interface Env {
  DB: D1Database;
  VERISTEP_RUNNER: Workflow<RunParams>;
  OPENAI_API_KEY: string;
  OPENAI_WORKER_MODEL: string;
  WORKER_A_PRIVATE_KEY: `0x${string}`;
  WORKER_B_PRIVATE_KEY: `0x${string}`;
  GITHUB_EVIDENCE_TOKEN: string;
  GENLAYER_RPC_URL: string;
  VERISTEP_CHAIN_ID: string;
  VERISTEP_V2_CONTRACT: `0x${string}`;
  EVIDENCE_GITHUB_OWNER: string;
  EVIDENCE_GITHUB_REPOSITORY: string;
  ALLOWED_ORIGIN: string;
}

export interface BudgetReservation {
  requestId: string;
  reservedNanoUsd: number;
}

export interface PublishedArtifact {
  commitment: Commitment;
  content: string;
}
