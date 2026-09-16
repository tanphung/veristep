# VeriStep v2 — Intelligent Contract architecture proposal

12/09/2026 implementation update: this architecture now has a local release
candidate in `contracts/veristep.py` plus the minimal
`contracts/VeriStepReceiptRouter.sol`. Funding, immutable submissions,
independent acquisition/review, complete structured reports, deterministic
timeouts/entitlements, routing and exact released-receipt confirmation are public
IC lifecycle methods. GenVM lint and all current component/regression suites pass.
It is still **not deployed**: native full-environment integration and fresh user
approval remain release gates. Earlier draft/preflight notes below are retained as
design history and are superseded where they describe features as unimplemented.

09/09/2026 architecture baseline. Implementation status is tracked below; no
v2 deployment is claimed.

10/09/2026 historical preflight: approved implementation began with capability tests;
three SDK gates currently fail. See [V2-FEASIBILITY.md](V2-FEASIBILITY.md).
External adapter and receipt-router implementation remain gated; no deployment.

11/09/2026 historical checkpoint: isolated deterministic core and callback implementation existed;
see [V2-CORE-PROGRESS.md](V2-CORE-PROGRESS.md). Draft-only public interface cannot
receive funds or accept external reports. A documented WASI message adapter is
has passed a real pinned-GenVM controlled-host ABI probe as the replacement for
the broken high-level EVM proxy. The official local web module also proved that
it follows a cross-host redirect while exposing only the final 200/body to the
contract. Therefore redirect rejection is not implementable on this runner and
the external adapter remains deliberately disabled. Exact single-message funding
and IC receipt authority are unchanged.

This design implements the user's eight mandatory contract requirements and supersedes conflicting parts of COMPETITIVE-RELEASE-PLAN.md. In particular, v1.1 is historical, and a frontend/backend receipt verifier is not the authority for payment completion. The current user instruction requires all contract tests to pass and fresh explicit confirmation before deployment. Earlier Bradbury deployment permission does not authorize this version.

## 1. Authority and components

| Component | Authority |
| --- | --- |
| VeriStep Intelligent Contract | Funded terms, exact obligations, evidence identity/provenance/full bytes, independent semantic review, report validation/storage, deadlines, revisions, credits, payout/refund eligibility and receipt confirmation |
| Protocol-selected leader and validators | Execute contract-defined nondeterministic acquisition and assessment; validators independently refetch and derive results |
| Pinned on-chain settlement router | Mechanically execute the IC's exact authorized transfer and retain immutable receipt fields; no AI, obligation evaluation or entitlement choice |
| Worker agents | Produce and submit A/B artifacts under accepted permissions. Their output remains untrusted evidence |
| UI / optional backend | Input, preview, indexing, display, transaction submission and read-only caching. No authoritative evidence verdict, report synthesis or settlement confirmation |

The router is an execution component, not a relocation of settlement decision. Its source/ABI/address and authorized IC are fixed; no owner override, arbitrary recipient substitution or admin release. A new router is a proposal, not something deployed in this turn.

Proposed application lifecycle:

Draft terms → funded immutable terms → workers accept → immutable evidence submissions → locked review snapshot → IC consensus report → deterministic settlement instruction → router execution → IC receipt confirmation.

Work status and transfer status are separate. RESOLVED never implies money received. Native GEN only for this release.

## 2. Terms and exact obligation identity

- Store explicit obligations per job: id, stage, kind, statement, required evidence IDs, acceptance rule, missing-evidence rule, material flag and rubric version.
- Semantic duties and deterministic duties each have IDs. Delivery deadlines, allowed revisions, provenance requirements and payment rules are included in the commitment manifest; they cannot exist only in free-form UI copy.
- Semantic requested topics must be enumerated before funding. A title/summary is descriptive, not an extra hidden obligation. If accepting a free-form brief for term extraction, its completeness must be checked by IC consensus and explicitly accepted before funding; do not silently use a frontend-generated checklist as authoritative.
- Funded terms bind participants, source manifest, per-stage allowed artifact origin and issuer, dependency policy, exact fees/bonds/penalties, all windows, max revisions, accepted content types, evidence limits, adapter/rubric version and router identity.
- Worker artifact hashes cannot be known before production: the immutable submission later supplies its commit/path/hash under the pre-funded issuer/provider policy. The review snapshot binds these exact submissions. This is not permission to change terms.
- Initial v2 policy: one final submission per worker (max_revisions = 0), enforced by contract. Revision history is immutable. Nonzero revisions require an explicit later design with downstream acceptance invalidation; no hidden revision feature.
- Compare report IDs as a multiset and count, then order canonically. Set equality alone does not reject duplicates. Require exactly one final assessment for every stored obligation, including deterministic and not-applicable duties, with a contract-verifiable applicability reason.
- The LLM is responsible only for semantic assessments; IC generates deterministic assessments and assembles the complete report. The semantic candidate must contain the exact semantic ID list. Missing A/B must not silently shrink the funded obligation list.

## 3. Evidence provenance: narrow, explicit adapters

First implementation target: public GitHub files at full immutable commits. This provides owner/repository/version metadata through a public authoritative API. It is not blanket support for arbitrary web URLs. CID and Vercel deployment adapters are unsupported until each has its own independently verifiable identity chain and tests; unsupported inputs fail before funding/submission.

An external evidence commitment includes:

provider + canonical API origin + stable owner ID/login + stable repository ID/name + full commit ID + exact relative path + blob ID + declared artifact media type/encoding + expected byte length + whole-artifact SHA-256 + issuer wallet + job/stage/revision + upstream submission ID + adapter version.

Every field affecting identity is committed and checked inside the IC. A GitHub repository owner is a provider identity, not automatically the same person as a wallet. A/B signing commits them to the approved repository and artifact; it does not prove they control that GitHub account. Do not claim wallet↔GitHub ownership without a separate verifiable binding.

Acquisition inside EACH leader/validator execution:

1. Parse structured identity; construct HTTPS API requests from validated fields. Exact hostname/port/path policy, not string contains. Reject userinfo, IP literals, nonstandard ports, encoded traversal, ambiguous separators, fragments and extra query parameters.
2. Obtain and compare repository/owner stable IDs and canonical names through the provider API. Renames/transfers changing a committed identity fail closed instead of transparently following redirects.
3. Resolve only a full immutable commit and verify the exact file path belongs to that commit tree. Reject branch/tag/short hash, symlink/submodule/LFS pointer, recursive tree truncation and unsupported entry types. A generic contents response alone is insufficient because the provider may dereference symlinks.
4. Fetch the complete blob, verify tree/blob identity and recompute its SHA-256 and decoded byte length. A Git SHA/blob ID is distinct from the artifact SHA-256. Do not substitute one for the other.
5. Validate response envelope Content-Type and strict schema separately from artifact type. JSON API bytes/base64 envelope are transport, not the reviewed artifact. Artifact type is declared in the accepted manifest and verified by strict UTF-8/JSON parser and allowed file policy. Do not claim MIME is cryptographically proven from a filename.
6. Reject redirects. Confirm that the pinned SDK can disable following them or exposes enough redirect history to enforce this BEFORE enabling the adapter. If it cannot, the adapter fails this gate; final hostname alone is not evidence that no redirect occurred.
7. Use the exact decoded artifact bytes for hashing, citations and semantic review. No trim, newline normalization, HTML readability conversion, rendering or prefix slicing.

Public API origin and provider responses remain a disclosed trust dependency. Correct provenance binds bytes to that provider identity/version; it does not prove real-world truth or trustworthy authorship.

## 4. Evidence and report limits

Proposed conservative application caps, not claims about GenVM protocol limits:

- Three artifacts: reference, A extraction, B report.
- Each artifact 1–4096 UTF-8 bytes; total <=8192 bytes.
- Initially text/plain, text/markdown and strict application/json; no HTML, PDF, archives, images or executable content.
- Metadata API envelope bounded separately (initial target 64 KiB); bounded tree traversal depth (target 4). Unsupported/oversized repositories or paths are rejected, not partially traversed.
- Up to 19 funded obligations including deterministic entries. Accept, delivery
  and upstream IDs are separate for A/B so one participant's deterministic fault
  cannot be silently attributed to the other. Up to 4 citations per semantic
  entry; each quote <=500 bytes; each reason <=900 bytes; final stored report
  <=32 KiB. Validate feasibility/cost and tune before freezing v2, never silently truncate.
- Full-artifact review in one prompt for this small evidence set. No chunking in the initial v2 path. Report requires all expected artifact IDs and hashes, not an assertion that the model thought about each byte.
- If measured limits require chunking later: deterministic UTF-8 boundaries, contiguous offsets, exact ordered IDs/digests, reconstruction hash and cross-chunk synthesis. All chunks go through both leader and independent validator acquisition/review. Missing/duplicated/reordered chunks reject. No partial approval mode.
- In full-artifact mode, unexpected chunked/partial input is rejected; the requested missing-chunk negative test exercises that rejection. If chunking is enabled, test the full omission and boundary-contradiction matrix as well.

## 5. Equivalence Principle and validator function

Use documented gl.vm.run_nondet_unsafe(leader_fn, validator_fn) for semantic adjudication. Validators are chosen by the protocol; the app does not select its committee or simulate extra voters.

Conceptual application functions (not SDK APIs or deployable code):

    leader_fn:
        acquire_and_verify_all_evidence(frozen_manifest)
        independently_assess_semantic_obligations(full_artifacts, frozen_rubric)
        validate_exact_candidate_schema_and_citations()
        return bounded_candidate

    validator_fn(leader_result):
        require successful gl.vm.Return, otherwise reject
        independently_acquire_and_verify_all_evidence(frozen_manifest)
        independently_assess_without_showing_leader_verdict_first()
        validate leader schema, all IDs, evidence commitments, citations
        compare exact per-obligation statuses and material missing-item IDs
        independently check leader findings/reasons against full evidence
        accept only if every substantive and structural check succeeds

Exact comparison: artifact identities/hashes/lengths/type, expected IDs, per-obligation statuses, material missing IDs, applicability, deterministic score and derived decisions. Prose may differ, but leader prose and citations still require evidence-grounding checks. No loose numeric tolerance across settlement thresholds.

Strict equality can be used for independently obtained normalized immutable provider/receipt fields where appropriate; never require byte-for-byte equality of independent free-form LLM reasoning.

No callbacks mutate storage, balances, timestamps, credits or emitted messages. No nested nondeterministic calls. After consensus, the deterministic IC revalidates schema/identities, generates offsets, computes decisions and scores, stores the accepted report and applies the frozen rules.

Invalid LLM schema/unsupported reason is a failed attempt, not approval or synthetic UNASSESSABLE. A bounded format-repair attempt may be added only with identical evidence/rubric and regression coverage; valid outcomes cannot be rerolled. Protocol rotation remains protocol-controlled.

## 6. Stored structured report

Report identity: schema_version, rubric_version, chain/domain, contract, job_id, review_id, revision, terms_hash, evidence_manifest_hash and reviewed timestamp.

Required stored sections:

- source_assessments: one per expected artifact; verified provider identity, path/version/hash/length/type, availability/provenance status and failure codes.
- obligation_assessments: exactly the complete funded obligation set; deterministic and semantic kinds distinguished; status, applicability and evidence references.
- findings: IDs bound to obligations and citations; no free-floating unsupported allegations.
- reasoning: short evidence-grounded justification, not hidden chain-of-thought or invented validator transcripts.
- evidence_citations: exact artifact ID/hash, quote and verified UTF-8 start/end byte offsets. Reject ambiguous unmatched offsets rather than guessing occurrence.
- missing_items: structured obligation/evidence IDs and reason codes. Structural failure is not rewritten as a worker's substantive violation.
- score: IC-derived semantic fulfillment fraction in integer basis points; null for invalid evidence or unresolved required semantic obligations. Diagnostic only, never an LLM-chosen penalty or quality promise.
- decision: IC-derived per-stage outcomes and next state, plus deterministic settlement entitlements if eligible.

Final report includes all required keys even for a consensus-backed failed-evidence assessment, with null/empty fields where appropriate. An aborted/undetermined transaction cannot persist a new report; UI displays contract's last state and transaction status without fabricating one.

## 7. Deterministic deadlines, failure policy and eligibility

All windows, max revisions, fees, bonds, penalties and neutral-unwind rules are funded terms. Contract time controls transitions. Off-chain timers are display only. Semantic outcome does not set time or amount.

| Failure | IC behavior |
| --- | --- |
| Invalid submission identity/format/size | Reject submission; no semantic review; no deadline extension |
| Provenance/hash/version/redirect mismatch at review | No successful semantic approval or performance penalty from the mismatch alone; store bounded failure report only if independently agreed; permit only pre-funded recovery policy |
| Timeout/429/5xx/provider unavailable | Unavailable attempt, never worker fault by inference; no settlement based on an errored call |
| Complete evidence but insufficient meaning | UNASSESSABLE; no invented answer; apply pre-funded neutral unwind at deadline |
| Malformed/incomplete/extra-ID report, false citation or unsupported reasoning | Reject candidate; no report/credit mutations from that failed attempt |
| Independent validators disagree | Protocol rotation/terminal status; no false success; bounded external retries only for demonstrably terminal failure and unchanged snapshot within deadline |
| A/B fails deterministic delivery obligation | Contract applies exact accepted timeout rule; infrastructure failure is not automatically absence of submitted work |
| Receipt missing/wrong/unreleased | Keep transfer pending/unverified; no PAID/REFUNDED and no duplicate credit |

For determinate stages keep fixed v1.1 F/B/P formulas; unresolved stages unwind fee to client and bond to worker at the agreed expiry. Every stage's eligibility is computed in IC. Direct client acceptance, if retained, cannot bypass mandatory provenance and core IC review or be labeled validator approval; proposed v2 removes that bypass from the review-required product path.

State persistence is transactional: a revert/undetermined execution cannot both abort and persist a diagnostic. Any persistent attempt lock/timer must be established by a prior successful request-review transaction. Do not promise post-revert storage or count protocol attempts as successful contract writes.

## 8. Receipt-bound transfer execution and confirmation

Proposed router receipt key binds chain ID, source IC, job ID, role, settlement sequence, kind and terms/decision identity using canonical domain-separated encoding.

1. IC freezes exact settlement instruction and marks its credit committed before emitting value on finalization. PAYOUT, REFUND and BOND_RETURN are distinct kinds/legs; no netting that loses identity.
2. Router accepts exact msg.value and stored fields only from the authorized IC address. Reject mismatched source, reused receipt key and altered recipient/amount/kind. Persist funding receipt with custody conservation.
3. Designated recipient releases the receipt. Router locks state against reentrancy, sends only to that fixed address, and retains RELEASED only if value transfer succeeds atomically. A failed call reverts the release state. Release never selects entitlement or amount.
4. Anyone may request IC confirmation as a liveness convenience, but cannot supply an authoritative report. IC uses the documented typed EVM interface to read the pinned router's receipt and verifies exact job, source IC, receipt key, recipient, amount, kind and RELEASED state against its stored instruction.
5. Confirm finality semantics of that native read on the pinned runner. Confirmation must use protocol-supported stable/final state, not an arbitrary browser RPC result. If native read cannot meet that requirement, fail the design gate and specify a separately reviewed consensus-backed final-state proof adapter; no silent backend substitute.
6. IC marks each leg PAID/REFUNDED only after exact receipt confirmation; frontend shows final success only after that IC confirmation transaction itself finalizes with successful execution. Job completion requires all required legs confirmed.

Lost response after release: re-read same immutable receipt; never pay again. Funding/message failure: retain pending obligation, inspect authoritative receipt/custody before any recovery; do not recreate a spendable credit from an API timeout. Cross-deal/role/chain replay and refund-vs-payout races must fail.

Current payment-verification.json stays historical evidence for v1.1. It is not an authority or fallback for v2. Native balance increases are supporting diagnostics only, never receipt identity proof.

## 9. Test and deployment gates

1. Review/update threat model, evidence schema, complete-artifact strategy and adversarial plan against this architecture before writing v2 contract code.
2. Pin runner hash. Current reviewed starting candidate is py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6; verify required web/EVM APIs against that runner, not latest docs alone.
3. GenVM lint before tests and after every contract change. Preserve strict parsers; do not copy loose score coercion, arbitrary eval or broad tolerance examples from a skill into settlement logic.
4. Direct contract tests: identity/authorization, exact obligation multiset, full byte hashing, empty/malformed/oversized artifacts, tail contradictions, UTF-8, deterministic deadlines, revision 0, conservation, duplicate claim/release and receipt identity mismatch.
5. Explicit validator-function tests: count independent fetches; different leader/validator content; valid JSON with wrong outcome/reason; false whole-review claims; same status but ungrounded citation; no state effects from rejected candidate. Ordinary direct mode does not establish protocol validator execution.
6. Integration tests: real GenVM committee/web/LLM behavior, frozen public provider fixtures plus controlled server fixtures; valid prefix/conflicting tail, redirect domain/owner/version/hash mismatch, missing/extra obligation, missing artifact/chunk, API failure, no consensus and retry boundaries. Test fixtures do not expand production hostname allowlist.
7. Router EVM tests: unauthorized source, wrong deal/source/recipient/amount/kind, unreleased and forged receipt, reentrancy, failed recipient, double release and value conservation. IC/router harness tests check exact ABI/read/confirmation behavior.
8. Native EVM interaction is documented as not fully supported in Studio. A local EVM router test + mocked IC read is only component integration, not full Bradbury proof. Verify whether a local GenVM+EVM integration environment can exercise the full path. If unavailable, explicitly mark the full-path test blocked; never mark it passed/skipped-as-passed or deploy to bypass the user's gate.
9. Present matrix, raw failures, source hash, pinned APIs and every remaining gap. No v2 deployment until all required contract tests pass and the user explicitly confirms. A running local test harness is not permission for a new public chain deployment.
10. After authorized deployment, read code/schema/config and run Bradbury smoke including receipt confirmation; only then select v2 in frontend/production. Keep v1.1 separate and preserve historical records.

## 10. Verification in this architecture turn

Inspected v1.1 code and official docs. Re-ran existing source with GENVM_VERSION=v0.2.12:

    .venv/Scripts/genvm-lint.exe check contracts/veristep.py --json

Result: ok=true; lint 3 passed; validation ok; VeriStep 13 methods (4 view, 9 write). This says nothing about passing the NEW v2 requirements. No new tests or v2 code claimed and no deployment performed.

Official references:
- https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- https://docs.genlayer.com/developers/intelligent-contracts/features/web-access
- https://docs.genlayer.com/developers/intelligent-contracts/features/messages
- https://docs.genlayer.com/developers/intelligent-contracts/features/interacting-with-evm-contracts
- https://docs.github.com/en/rest/repos/contents

Known feasibility gates: pinned SDK redirect handling; provider identity/file-entry validation and public rate limits; exact receipt read/finality behavior; availability of a full predeployment GenVM+EVM integration environment. Architecture approval is distinct from deployment authorization.
