# Implementation decisions — 2026-09-05

User approved VeriStep. Four security design documents v0.2 self-reviewed before code. This is not an independent audit. Source, A and B are submitted on-chain; no external web oracle or LLM API key.

Both workers accept all terms by hash before activation. Source plus A reserves 1024 bytes for B. UTF-8 whole-document and chunk hashes are independently checked.

Review requests lock before adjudication. A bounded adjudication window permits infrastructure retries; scripts cap retries at three. A completed verdict cannot be rerolled. UNASSESSABLE unwinds neutrally at expiry. Missing A unwinds B; missing B still allows review of A. Client inactivity after undisputed submission accepts both stages, as agreed upfront.

Fixed uniquely identified obligations, with optional B source-verification duty agreed upfront. Task data cannot override rules. LLM cannot choose recipients, amounts or deadlines. Claim consumes credit and records MESSAGE_EMITTED, never PAYMENT_CONFIRMED.

Initial testing explicitly uses StudioNet. Bradbury follows lint, direct/adversarial, integration and frontend checks, then user review of results and deployment confirmation per AGENTS.md. Studio cannot prove EOA payments.
