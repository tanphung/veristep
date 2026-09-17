# VeriStep — submission draft, NOT SUBMITTED

Track: Future of Work

Repository: https://github.com/tanphung/veristep

Website: https://veristep-genlayer.vercel.app

Demo video: https://www.youtube.com/watch?v=8mKo2xxYzgM

Contract: https://explorer-studio-dev.genlayer.com/contracts/0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b

## One-liner (maximum 180 characters)

VeriStep locates responsibility across agent handoffs using immutable evidence,
independent GenLayer validation, and fixed on-chain settlement rules.

## Description (maximum 1000 characters)

When an agent-produced report is wrong, the last writer may not be responsible.
VeriStep separates source interpretation from downstream reporting. A and B accept
frozen duties, then publish immutable GitHub-committed artifacts. A GenLayer
Intelligent Contract independently verifies origin, commit, path, blob hash and
whole-file SHA-256 before validators assess every semantic obligation with exact
citations. The contract—not an LLM—fixes fees, bonds, penalties, deadlines and
settlement. B is accountable for changing a faithful handoff, not automatically
for inheriting A's error. Failed consensus does not become a success; the timeout
path produces a neutral unwind. The demo uses public, intentionally constructed
evidence and test GEN. It evaluates compliance with agreed terms, not real-world
truth.

## Expected outcome (maximum 500 characters)

Two similar incorrect reports can assign responsibility to different stages based
on immutable handoffs and the duties accepted before work. Findings cite the exact
source material. Fixed amounts follow contract rules, never model-selected values.
Unresolved consensus and native transfers without a contract-side receipt remain
explicitly unverified.

## Verification links and current status

- Studio Next contract: `0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b`
- Deployment transaction:
  `0x6200be8f09bb10d670ac7c3a1def9ba11893bc618ae4d4b2d261ffd2ab39494b`
- Source SHA-256:
  `baedb9762690220aa8620fc6a94065b993700cbccb5ded586b4560ee3fc4019b`
- No-fault live case: A/B `SATISFIED`; settlement legs are
  `DISPATCHED_UNVERIFIED`, not payment-confirmed.
- A-fault recovery 3: A `VIOLATED`, B `SATISFIED`; all four settlement legs are
  `DISPATCHED_UNVERIFIED`.
- B-fault recovery 2: A `SATISFIED`, B `VIOLATED`; all four settlement legs are
  `DISPATCHED_UNVERIFIED`. Earlier `UNDETERMINED` attempts remain preserved.
- Hosted Agent deal `v2-hosted-agent-live-2`: Agent A and B ran server-side,
  published immutable artifacts, submitted with distinct wallets and reached
  A/B `SATISFIED` through eight finalized contract transactions.
- Public Studio Next application: `https://veristep-genlayer.vercel.app`.
- Portal account linkage and final submission: user-owned, incomplete.

## Do not claim

- Contract-side confirmation of Studio Next native transfers.
- Prevention or observation of hidden redirects by the Studio Next web host.
- Hackathon acceptance or submission before the user completes Portal actions.
