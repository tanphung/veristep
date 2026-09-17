# VeriStep final submission handoff

## Verified release claims

- Studio Next chain `61997` contract:
  `0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b`
- Semantic matrix complete:
  - Happy Path: A/B `SATISFIED`
  - Upstream Fault: A `VIOLATED`, B `SATISFIED`
  - Downstream Fault: A `SATISFIED`, B `VIOLATED`
- Hosted Agent A → B: eight unique lifecycle transactions, all finalized with
  successful execution; A/B `SATISFIED`.
- All three semantic settlement examples have four legs recorded as
  `DISPATCHED_UNVERIFIED`.

## Reproducible evidence

```powershell
npm run audit:hosted-final
npm run audit:b-fault-final
npm run test:frontend
npm run test:worker
npm run build
npm run build:worker
npm run check:secrets
```

Raw evidence:

- `reports/studio-next-agent-tank/`
- `reports/studio-next-hosted-agent-final/`
- `reports/studio-next-b-fault-final/`
- `docs/RELEASE-EVIDENCE.md`

## User-owned final actions

1. Review the final production deployment and all four canonical scenarios.
2. Confirm the public demo video URL: https://www.youtube.com/watch?v=8mKo2xxYzgM.
3. Add that video URL to the Portal entry.
4. Confirm the Portal-linked GitHub account can select `tanphung/veristep`.
5. Review every field, connect the intended Portal wallet and submit.
6. Save the final submission URL/status and any reviewer feedback.

Do not claim payment confirmation, hidden-redirect prevention, hackathon
acceptance or guaranteed eligibility.
