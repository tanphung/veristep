# VeriStep demo video checklist

Target: 90 seconds. Record the public production site after the verified release
commit is deployed. Do not record localhost.

1. Open https://veristep-genlayer.vercel.app/#job=v2-studio-no-fault-358323c.
2. Show the five-step flow, A/B `SATISFIED`, 3/3 immutable artifacts, semantic
   findings and inline transaction proof.
3. Open https://veristep-genlayer.vercel.app/#job=v2-studio-a-fault-r3-358323c.
4. Show A `VIOLATED`, B `SATISFIED` and the evidence explaining where the error entered the handoff.
5. Open the B-fault case `#job=v2-studio-b-fault-r2-358323c`; show A
   `SATISFIED`, B `VIOLATED`, the material B finding and B refund dispatch.
6. Open the Hosted Agent case `#job=v2-hosted-agent-live-2`; show the real
   backend-agent statement, A/B immutable GitHub artifacts and eight on-chain
   lifecycle transactions.
7. Open one resolve transaction in Studio Next Explorer.
8. State: GenLayer validators judge semantic obligations; fees, penalties and
   recipients are frozen in the contract.
9. State: native transfers are dispatched, but contract-side receipt verification
   is unavailable on Studio Next.

Do not show private keys, Cloudflare/Vercel dashboards, secrets, local journals or the Portal wallet address unless intentionally public.
