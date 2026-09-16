# VeriStep Studio Next release evidence

Reference date: 2026-09-16. Network: Studio Next, chain `61997`.

## Deployment

- Contract: [`0xd72A...1b4b`](https://explorer-studio-dev.genlayer.com/contracts/0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b)
- Deployment transaction: [`0x6200...494b`](https://explorer-studio-dev.genlayer.com/transactions/0x6200be8f09bb10d670ac7c3a1def9ba11893bc618ae4d4b2d261ffd2ab39494b)
- Deployed source SHA-256: `baedb9762690220aa8620fc6a94065b993700cbccb5ded586b4560ee3fc4019b`
- Full transaction audit: `68` stored hashes, `0` duplicate hashes, `0` non-terminal receipts.

## Passing live cases

### No-fault

- Deal: `v2-studio-no-fault-358323c`
- Expected/actual: A `SATISFIED`, B `SATISFIED`
- Resolve: [`0x79b6...e1e5`](https://explorer-studio-dev.genlayer.com/transactions/0x79b6271e34dc4f8a122757936fbeb12f32896abab25460b1c0f62185103de1e5)
- Settlement dispatches: [`A payout`](https://explorer-studio-dev.genlayer.com/transactions/0x7453551caef14b18732b7476f88d4fbbb6139966475be4fddd0c2bee9b2b1dd1), [`A bond`](https://explorer-studio-dev.genlayer.com/transactions/0x9419eaccd1214f9ebb2e04a0644c5e499b65968eb70656df0996190e3b8cedae), [`B payout`](https://explorer-studio-dev.genlayer.com/transactions/0xd840e3776a6a4e6b856c8e8e9b0411a392a491070c9ea7a291d2411f22d2f210), [`B bond`](https://explorer-studio-dev.genlayer.com/transactions/0x41360d47b006149b3e2b452b904cdfc0962ef956ee6712ea7d7f741edad85a0f).

### A-fault recovery 3

- Deal: `v2-studio-a-fault-r3-358323c`
- Expected/actual: A `VIOLATED`, B `SATISFIED`
- Resolve: [`0x3d3b...2ddc`](https://explorer-studio-dev.genlayer.com/transactions/0x3d3b69c4cb96a089cd062fc8a00eb9a3cb6a3acea656b12e1d9923c78c8a2ddc)
- Settlement dispatches: [`A refund`](https://explorer-studio-dev.genlayer.com/transactions/0x1aef433655ab49d76c63bc5a72161236c4c8b0f2867cba868c2f179939c3d04b), [`A bond`](https://explorer-studio-dev.genlayer.com/transactions/0x389711cd7c833d0a0d0da0249e768c0f118e52c4bc61f039a0f9cb6e20916b19), [`B payout`](https://explorer-studio-dev.genlayer.com/transactions/0xce8f637cc9d74435898578ff5df00c0b897cbc0f7d4d3f88959673da4f9727d4), [`B bond`](https://explorer-studio-dev.genlayer.com/transactions/0x5261b05d41e9420f717c10c1bcb5b442d61dc41dcec391a72b0a04a1407fe43c).

All settlement states are `DISPATCHED_UNVERIFIED`; Studio Next does not expose a contract-side transfer receipt.

## Preserved non-passing evidence

- B-fault recovery 1 resolve [`0xfc0d...0387`](https://explorer-studio-dev.genlayer.com/transactions/0xfc0d1405e9561526f04ba1973225e2afd05f34b744585f0caae5505113760387) ended `UNDETERMINED + FINISHED_WITH_ERROR`. See `reports/studio-next-agent-tank/b-fault-recovery-1-incident.json`.
- The independent time probe demonstrated that Studio Next simulation supplied a 2024 GenVM timestamp while the finalized block timestamp was in 2026. Timeout broadcast remains locked.
- Hosted delivery deal `v2-hosted-agent-live-1` finalized create, fund and both accepts. Agent A was generated server-side and published at immutable commit [`c87572...f624`](https://github.com/tanphung/veristep-evidence/blob/c875720dcbeeeb6d9d5abd376d02faa68a5bf624/jobs/v2-hosted-agent-live-1/a.md). Submit A [`0x03e4...8568`](https://explorer-studio-dev.genlayer.com/transactions/0x03e4b526bcc69df0aaa59e4d3abb059a62e371cc684ef1a9ae7e4aa431918568) finalized with rollback `SUBMISSION_WINDOW_CLOSED`, so no hosted verdict is claimed.

## Public surfaces

- Application: https://veristep-genlayer.vercel.app
- Source: https://github.com/tanphung/veristep
- Evidence repository: https://github.com/tanphung/veristep-evidence
- Worker health: https://veristep-agent-worker.veristep.workers.dev/api/health

The application and documents do not claim hackathon acceptance, payment confirmation, hidden-redirect prevention, or a passing B-fault/hosted result.
