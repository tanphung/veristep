export type V2Role = "CLIENT" | "A" | "B";
export type EvidenceRole = "SOURCE" | "A" | "B";
export type V2Outcome = "SATISFIED" | "VIOLATED" | "UNASSESSABLE";

export interface V2Origin {
  provider: "github";
  hostname: "api.github.com";
  owner: string;
  owner_id: number;
  repository: string;
  repository_id: number;
}

export interface V2Commitment {
  origin: V2Origin;
  commit: string;
  path: string;
  blob: string;
  content_type: "text/plain" | "text/markdown" | "application/json";
  encoding: "utf-8";
  byte_length: number;
  sha256: string;
}

export interface V2Obligation {
  id: string;
  kind: "SEMANTIC" | "DETERMINISTIC";
  stage?: "A" | "B";
  statement?: string;
  evidence_ids?: EvidenceRole[];
  parameters?: Record<string, unknown>;
}

export interface V2Submission {
  deal_id: string;
  role: EvidenceRole;
  issuer: string;
  revision: 0;
  upstream_submission_id: string;
  submission_id: string;
  commitment: V2Commitment;
}

export interface V2VerifiedSourceAssessment {
  artifact_id: EvidenceRole;
  adapter: "github-commit-v1";
  provider: "github";
  hostname: "api.github.com";
  owner: string;
  owner_id: number;
  repository: string;
  repository_id: number;
  commit: string;
  blob: string;
  path: string;
  content_type: string;
  byte_length: number;
  sha256: string;
  status: "VERIFIED";
}

export interface V2UnavailableSourceAssessment {
  artifact_id: EvidenceRole;
  status: "NOT_VERIFIED" | "MISSING";
  commitment?: V2Commitment | null;
  reason_code: string;
}

export type V2SourceAssessment = V2VerifiedSourceAssessment | V2UnavailableSourceAssessment;

export interface V2Citation {
  id: string;
  obligation_id: string;
  artifact_id: EvidenceRole;
  sha256: string;
  quote: string;
  start_byte: number;
  end_byte: number;
}

export interface V2Assessment {
  obligation_id: string;
  kind: "SEMANTIC" | "DETERMINISTIC";
  stage: "A" | "B" | null;
  status: V2Outcome;
  applicable: boolean;
  reason: string;
  citation_ids: string[];
  missing_evidence_ids: EvidenceRole[];
}

export interface V2Report {
  schema_version: "veristep-report-2";
  chain_domain: string;
  contract: string;
  job_id: string;
  review_id: string;
  revision: 0;
  terms_hash: string;
  evidence_manifest_hash: string;
  reviewed_at: string;
  source_assessments: V2SourceAssessment[];
  obligation_assessments: V2Assessment[];
  findings: Array<{id: string; obligation_id: string; severity: "MATERIAL"; summary: string; citation_ids: string[]}>;
  reasoning: string;
  evidence_citations: V2Citation[];
  missing_items: Array<{obligation_id: string; evidence_id: EvidenceRole; reason_code: string}>;
  score: {A: number | null; B: number | null};
  decision: {
    stages: Record<"A" | "B", {outcome: V2Outcome; entitlements: Record<"PAYOUT" | "REFUND" | "BOND_RETURN", string>}>;
    next_state: "READY_FOR_SETTLEMENT" | "NEUTRAL_UNWIND_REQUIRED";
  };
}

export interface V2SettlementLeg {
  id: string;
  role: "A" | "B";
  sequence: number;
  recipient: string;
  amount: string;
  kind: "PAYOUT" | "REFUND" | "BOND_RETURN";
  outcome: V2Outcome;
  state: "ELIGIBLE" | "DISPATCHED_UNVERIFIED";
  receipt_id: string;
  routed_at?: number;
}

export interface V2Deal {
  deal_id: string;
  chain_id: number;
  contract: string;
  router: string;
  status: string;
  terms_hash: string;
  accepted: {A: boolean; B: boolean};
  manifest: {
    version: "veristep-2.0-rc";
    chain_domain: string;
    contract: string;
    router: string;
    deal_id: string;
    client: string;
    terms: {
      workers: {A: string; B: string};
      origins: Record<EvidenceRole, V2Origin>;
      source: V2Commitment;
      money: Record<"A" | "B", {fee: string; bond: string; penalty: string}>;
      windows: {accept: number; step: number; review: number; adjudication: number};
      max_revisions: 0;
      semantic_obligations: Array<{id: string; stage: "A" | "B"; statement: string; evidence_ids: EvidenceRole[]}>;
    };
    obligations: V2Obligation[];
  };
  artifacts: Partial<Record<EvidenceRole, V2Submission>>;
  ledger: {received: string; routed: string; confirmed: string};
  settlement_legs: V2SettlementLeg[];
  report?: V2Report;
  decision_hash?: string;
  funded_at?: number;
  accept_deadline?: number;
  a_deadline?: number;
  b_deadline?: number;
  review_deadline?: number;
  adjudication_deadline?: number;
  completed_at?: number;
}
