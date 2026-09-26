# VeriStep

VeriStep traces accountability through a two-stage agent handoff: a client fixes
source terms, Agent A produces an immutable artifact, Agent B builds on that
handoff, and GenLayer validators assess the exact duties before the contract
calculates settlement.

The active release target is **GenLayer Studio Next**, not Bradbury.

> VeriStep shows where a multi-agent workflow introduced an error by preserving
> immutable handoffs and asking GenLayer validators to judge the exact duties
> each agent accepted.

## Demo and Release

| Item | Verified release |
|---|---|
| Demo video | [Watch the 2:21 product demo on YouTube](https://www.youtube.com/watch?v=8mKo2xxYzgM) ([release file](submission/VeriStep-Agent-Tank-Demo.mp4)) |
| Live DApp | [veristep-genlayer.vercel.app](https://veristep-genlayer.vercel.app/) |
| Docs | [Judgment, evidence and settlement](https://veristep-genlayer.vercel.app/#docs) |
| Network | GenLayer Studio Next, chain `61997` |
| Contract | [`0xd72A...1b4b`](https://explorer-studio-dev.genlayer.com/contracts/0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b) |
| Release evidence | [docs/RELEASE-EVIDENCE.md](docs/RELEASE-EVIDENCE.md) |

The demo uses only the production DApp. Its [narration](submission/DEMO-NARRATION.md)
and [scene outline](submission/DEMO-SCENES.md) are included with the submission.

## Active Deployment

- Network: Studio Next, chain `61997`
- Contract: `0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b`
- Deploy transaction:
  `0x6200be8f09bb10d670ac7c3a1def9ba11893bc618ae4d4b2d261ffd2ab39494b`
- Source SHA-256:
  `baedb9762690220aa8620fc6a94065b993700cbccb5ded586b4560ee3fc4019b`
- Explorer: [Studio Next contract](https://explorer-studio-dev.genlayer.com/contracts/0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b)

All three semantic live cases have finalized with their predetermined outcomes:

- no-fault: A/B `SATISFIED`;
- A-fault recovery 3: A `VIOLATED`, B `SATISFIED`;
- B-fault recovery 2: A `SATISFIED`, B `VIOLATED`.

Earlier B-fault attempts ended `UNDETERMINED`; their
incidents remain preserved as recovery history. Read the [release evidence](docs/RELEASE-EVIDENCE.md),
[core manifest](reports/studio-next-agent-tank/manifest.json),
[final B-fault manifest](reports/studio-next-b-fault-final/manifest.json), and
[resume checkpoint](docs/RESUME.md) before running any live command.

## Why GenLayer

An event log can show that an agent submitted work. It cannot determine whether
Agent A changed a source rule, whether Agent B faithfully preserved the finalized
handoff, or which agent owns a semantic contradiction. VeriStep binds full
immutable source/A/B artifacts to frozen obligations, then asks the Intelligent
Contract's leader and independent GenLayer validators to assess the same evidence.

The completed release matrix is intentionally small and inspectable:

| Case | Agent A | Agent B |
|---|---:|---:|
| [Happy Path / no-fault](https://veristep-genlayer.vercel.app/#job=v2-studio-no-fault-358323c) | `SATISFIED` | `SATISFIED` |
| [Upstream Fault / A-fault](https://veristep-genlayer.vercel.app/#job=v2-studio-a-fault-r3-358323c) | `VIOLATED` | `SATISFIED` |
| [Downstream Fault / B-fault](https://veristep-genlayer.vercel.app/#job=v2-studio-b-fault-r2-358323c) | `SATISFIED` | `VIOLATED` |
| [Hosted Agent A to B](https://veristep-genlayer.vercel.app/#job=v2-hosted-agent-live-2) | `SATISFIED` | `SATISFIED` |

## What the Contract Enforces

- Immutable GitHub commit/path/blob/SHA-256 commitments for source, A and B.
- A must precede B; each artifact binds its upstream submission identity.
- Agent duties, fixed fees, bonds, penalties and deadlines are frozen before work.
- A leader and independent validators evaluate semantic duties with structured,
  evidence-grounded output.
- Settlement is calculated by the Intelligent Contract, not by an agent or worker.
- Expired paths apply frozen lifecycle rules: delivery failure can establish a
  violation; semantic uncertainty alone does not.

`UNASSESSABLE` is not `VIOLATED`. An `INCONCLUSIVE` deal preserves the report’s
role-specific outcomes and entitlements. After the adjudication deadline, a
successful timeout transition activates settlement legs from that report; a
satisfied role keeps its fee and full bond, while an unassessable role receives
no fee, returns its fee to the client and recovers its deposited bond without a
violation penalty. Without a resolved report, adjudication timeout assigns both
roles neutral outcomes. `SETTLEMENT_PENDING` means allocations exist, not that
payment occurred: each eligible leg requires explicit routing. Timeout signing
currently remains gated by the release’s chain-time simulation check.

[Docs](https://veristep-genlayer.vercel.app/#docs) distinguish these paths and
outline post-hackathon append-only evidence recovery with one bounded GenLayer
re-review; those extensions are not part of the submitted contract.

Studio Next currently cannot provide contract-side proof that a dispatched native
transfer reached its recipient. The UI and evidence therefore use
`DISPATCHED_UNVERIFIED`, never “paid” or “confirmed.” The GenVM web host also has
not proven hidden redirects are observable or preventable; VeriStep preserves
canonical origin and whole-artifact hash checks but does not claim to solve that
platform limitation.

## Public Application

The production build is published at:

[https://veristep-genlayer.vercel.app/](https://veristep-genlayer.vercel.app/)

Reviewers can inspect finalized deals, validator findings, immutable evidence
and transaction links without a wallet. New deals require a funded Studio Next
wallet and explicit user signatures.

## Hosted A/B Worker

The optional Cloudflare Worker only accepts work and submits immutable artifacts.
It cannot adjudicate, choose settlement, or change frozen terms. Its current
health endpoint is:

`https://veristep-agent-worker.veristep.workers.dev/api/health`

OpenAI, worker keys, D1 budget, chain and contract configuration are deployed.
The final hosted run `v2-hosted-agent-live-2` completed create, fund, A/B accepts,
A/B immutable submissions, review request and review resolution. Both agents
were `SATISFIED`; all eight transactions finalized successfully. The historical
`live-1` deadline failure remains preserved as recovery evidence. Its settlement
legs remain `ELIGIBLE`; no Hosted settlement transaction was sent. Never place a
key in a frontend variable or use a broad personal GitHub token for this service.

## Local development

Requirements: Node.js compatible with Vite 7, npm, Python 3.12 and `uv`.

```powershell
npm ci
npm run test:types
npm run test:worker
npm run test:frontend
npm run build
```

For contract tests:

```powershell
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv/Scripts/genvm-lint.exe check contracts/veristep.py --json
.venv/Scripts/genvm-lint.exe check contracts/veristep_release.py --json
.venv/Scripts/python.exe -m pytest -q
```

`fee-profile.json` is a measured Studio Next baseline shared by the frontend and
worker. It guards deployment identity and documents observed fee envelopes; it is
never replayed. Every transaction must obtain and submit a fresh SDK estimate.

## Live safety

The live runners read `reports/studio-next-agent-tank/manifest.json`, persist a
hash before polling, and never resend an existing hash. Do not run them on a fresh
machine without reading [docs/RESUME.md](docs/RESUME.md). Historical Bradbury and
older StudioNet reports remain in `reports/` strictly as evidence history; they
are not current release instructions or demos.

Before every commit:

```powershell
npm run check:submission
npm run check:secrets
```

`check:submission` compares contract sources, deployment configuration and raw
evidence with commit `ba065458dd6b70dcf168fb4a934cc1919d9317d4`, the baseline
preserved while awaiting team review. It reads local files and Git objects only;
it never deploys or sends a transaction. CI runs the same guard and the offline
receipt audits. See [submission preservation](docs/SUBMISSION-PRESERVATION.md).

## Project references

- [Implementation checkpoint](docs/RESUME.md)
- [Fee profile](fee-profile.json)
- [Evidence schema](docs/EVIDENCE-SCHEMA.md)
- [Threat model](docs/THREAT-MODEL.md)
