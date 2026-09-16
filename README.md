# VeriStep

VeriStep traces accountability through a two-stage agent handoff: a client fixes
source terms, Agent A produces an immutable artifact, Agent B builds on that
handoff, and GenLayer validators assess the exact duties before the contract
calculates settlement.

The active release target is **GenLayer Studio Next**, not Bradbury.

## Active deployment

- Network: Studio Next, chain `61997`
- Contract: `0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b`
- Deploy transaction:
  `0x6200be8f09bb10d670ac7c3a1def9ba11893bc618ae4d4b2d261ffd2ab39494b`
- Source SHA-256:
  `baedb9762690220aa8620fc6a94065b993700cbccb5ded586b4560ee3fc4019b`
- Explorer: [Studio Next contract](https://explorer-studio-dev.genlayer.com/contracts/0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b)

Two live cases have finalized with their predetermined semantic outcomes:

- no-fault: A/B `SATISFIED`;
- A-fault recovery 3: A `VIOLATED`, B `SATISFIED`.

Both cases have four native settlement legs honestly recorded as
`DISPATCHED_UNVERIFIED`. B-fault recovery 1 ended `UNDETERMINED`; its incident
is preserved rather than presented as a pass. Read the [release evidence](docs/RELEASE-EVIDENCE.md),
[live manifest](reports/studio-next-agent-tank/manifest.json), and
[resume checkpoint](docs/RESUME.md) before running any live command.

## What the contract enforces

- Immutable GitHub commit/path/blob/SHA-256 commitments for source, A and B.
- A must precede B; each artifact binds its upstream submission identity.
- Agent duties, fixed fees, bonds, penalties and deadlines are frozen before work.
- A leader and independent validators evaluate semantic duties with structured,
  evidence-grounded output.
- Settlement is calculated by the Intelligent Contract, not by an agent or worker.
- Expired paths use a deterministic neutral-timeout rule.

Studio Next currently cannot provide contract-side proof that a dispatched native
transfer reached its recipient. The UI and evidence therefore use
`DISPATCHED_UNVERIFIED`, never “paid” or “confirmed.” The GenVM web host also has
not proven hidden redirects are observable or preventable; VeriStep preserves
canonical origin and whole-artifact hash checks but does not claim to solve that
platform limitation.

## Public application

The early submission build is published at:

`https://veristep-genlayer.vercel.app`

It is deliberately read-only. Reviewers can inspect finalized deals, validator
findings, immutable evidence and transaction links without a wallet. Signing new
writes remains release-locked while the remaining optional gates are unfinished.

## Hosted A/B worker

The optional Cloudflare Worker only accepts work and submits immutable artifacts.
It cannot adjudicate, choose settlement, or change frozen terms. Its current
health endpoint is:

`https://veristep-agent-worker.veristep.workers.dev/api/health`

OpenAI, worker keys, D1 budget, chain and contract configuration are deployed.
The optional hosted run is not part of the early submission claim. It proved a
real server-side Agent A generation and GitHub Contents publish, but the later
submit-A transaction correctly rolled back with `SUBMISSION_WINDOW_CLOSED` after
the frozen delivery deadline elapsed. The frontend therefore keeps hosted
controls locked. Never place a key in a frontend variable or use a broad personal
GitHub token for this service.

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
npm run check:secrets
```

## Project references

- [Implementation checkpoint](docs/RESUME.md)
- [Fee profile](fee-profile.json)
- [Evidence schema](docs/EVIDENCE-SCHEMA.md)
- [Threat model](docs/THREAT-MODEL.md)
