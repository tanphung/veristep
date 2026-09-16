# VeriStep v1.1 verification report

Product-readiness update, 9 September: the historical technical results below remain valid for their recorded runs. The user requested a higher product-quality release; agent execution, general payment verification, comparative UX and visual redesign remain open under [the current release plan](COMPETITIVE-RELEASE-PLAN.md). Earlier statements that only portal submission remained are superseded.

Verified through 9 September 2026. This report describes a StudioNet test matrix and a Bradbury release candidate. It is not a security audit, hackathon submission, or acceptance by GenLayer.

## Build identity

- Bradbury RPC chain ID: `4221`; deployed GenVM evidence-domain chain ID: `1`
- Bradbury contract: `0x3FC5dce3abadf149111A45ae9936eBdD7A67AA88`
- Bradbury deployment transaction: `0xb98884870579ce28d933677f1fe1889f227c86c7b3c302c3c51aef9a1d7e44d2`
- StudioNet matrix contract: `0x8128cD94346c94fe1FF20204d54a4B980Ae00b61` on chain `61999`
- Contract version: `veristep-1.1`
- Source SHA-256: `a5bc7d153af669d5a03dc4e68e89ed88159ad0d265f17c2064a1f07733235391`
- Raw integration evidence: `reports/studionet-sep07probe/`
- Bradbury release evidence: `reports/bradbury-release/`
- React/provider evidence: `reports/frontend-live/`
- Public demo: `https://veristep-genlayer.vercel.app/#job=bradbury-happy-a5bc7d15`
- Hosted source version: commit `d34f6cdf20dd53934871cc5912da7d653e6e9a7e` (Vercel project `vandas/veristep-genlayer`)

## Offline and build gates

| Gate | Result |
| --- | --- |
| GenVM lint | PASS, 3 checks |
| Direct and adversarial contract tests | PASS, 92 tests |
| Receipt-decoder tests | PASS, 2 tests |
| Frontend unit/component tests | PASS, 65 tests |
| Live React/provider happy path | PASS, 1 test |
| TypeScript test compile | PASS |
| Production build | PASS; 761.07 kB bundle warning remains |
| npm production dependency audit | 0 known vulnerabilities; not a security audit |

The direct tests use controlled LLM mocks. Live accuracy claims below come only from finalized StudioNet transactions.

## Live consensus matrix

All 16 cases matched the expected outcomes. The manifest contains 113 tracked steps: one deployment plus seven finalized lifecycle transactions per case. Every tracked step is `FINALIZED_SUCCESS`; schema and deployed-config checks are true.

| Case | Runs | Expected and actual result |
| --- | ---: | --- |
| A introduces the error | 4 | A violated, B satisfied |
| B introduces the error | 3 | A satisfied, B violated |
| Neither introduces an error | 3 | A satisfied, B satisfied |
| Timing answer omits approval prerequisite | 1 | A violated, B violated |
| A and B make independent errors | 1 | A violated, B violated |
| Source lacks requested information; both state uncertainty | 1 | A satisfied, B satisfied |
| B accepted an optional source-verification duty | 1 | A violated, B violated |
| Prompt injection appears in the final source chunk | 1 | A satisfied, B violated |
| Reference source conflicts with itself | 1 | A satisfied, B satisfied |

The fourth A-error run is the first v1.1 probe; the three `core` runs are the consecutive stability set. The conflicting-source case required additional validator rounds before finalizing, but it converged to the expected result.

## React/provider live path

Job `work-69d379f8` was driven through the actual React form components and the application's provider request path with three isolated StudioNet accounts. The seven persisted records—create, accept A, accept B, submit A, submit B, request review, and resolve—are all `FINALIZED_SUCCESS`. Final on-chain state is `RESOLVED`; A and B are both `SATISFIED`.

This test proves the application wiring can produce and observe real StudioNet writes. It does not certify a user's MetaMask extension or GenLayer Wallet Snap installation.

## Bradbury deployment, consensus, and payout

The deployed code hash exactly matches the reviewed v1.1 source. Schema, version, contract address, and evidence-domain configuration were read back from Bradbury before the smoke workflow continued.

Job `bradbury-happy-a5bc7d15` used three isolated wallets and the full create → accept A/B → submit A/B → request review → resolve flow. Its final state is `RESOLVED`; both workers are `SATISFIED`. All successful lifecycle hashes are `FINALIZED` with `FINISHED_WITH_RETURN`. The first resolve attempt, `0x9db1c4213360511484334079fd65856689b6308cea79858cdc1ecf7388cdfb48`, ended `UNDETERMINED` after validator/leader instability. That failure remains in the manifest. One bounded retry, `0x0831fbb01e5b8e7ac931598b30042c0e32620d5b8aff93e46e2e1d3365ae99f6`, finalized successfully; no ambiguous write was automatically resent.

Worker A then claimed `0.03 GEN`. Parent claim `0x5887f65277dc770bac30c60d3a319bba52a31e3239efe4674ba547caa8936218` finalized successfully with exactly one message naming A and `30000000000000000` wei. EVM finalization transaction `0xa6770b72cd00d6fa1bd0393ecd0e50df39d513b1a7825e573070524112e5c9ff` succeeded at block `21205036`; A's balance changed from `739538900509084400` to `769538900509084400` wei in that block, an exact `+0.03 GEN` delta.

## Safety properties exercised

- Transaction intent and hash are persisted before polling; uncertain writes are not automatically resubmitted.
- Final UI success requires a receipt bound to the expected sender, contract, calldata, hash, successful execution, and expected post-state.
- Full UTF-8 artifacts are size-bounded, chunked deterministically, hashed, and reviewed as a complete snapshot.
- Findings require exact source and deliverable citations; untrusted document text cannot change reviewer instructions.
- Immutable terms, accepted obligations, settlement arithmetic, claim recipient, and emitted-message accounting are revalidated by the frontend.
- AI output cannot choose fees, bonds, penalties, recipients, deadlines, or transfer amounts.

## Public-demo verification and remaining gate

Vercel production deployment `dpl_GYZ8N8HdjTYHPcjuH8USjq6wzFa6` reached `READY` on 9 September 2026. A browser opened the neutral production alias without authentication and loaded job `bradbury-happy-a5bc7d15` as `RESOLVED`, all four findings as `SATISFIED`, the committed evidence hashes, and the exact `+0.03 GEN` recipient balance delta with its Bradbury finalization link.

Public deployment is complete for the earlier technical release. Product work now continues under the current release plan; portal review and submission remain user-controlled. No portal entry has been submitted by this build process.

The frontend still treats `MESSAGE_EMITTED` as a request rather than generic payment proof. The Bradbury claim above is called verified only because its finalized parent message, EVM finalization receipt, recipient, amount, and exact block balance delta all agree.
