# VeriStep hosted A/B worker

Cloudflare Workers + Workflows + D1 implementation for the optional hosted A/B delivery path. It never evaluates obligations or decides settlement. Agent keys are restricted by code and product flow to `accept_work` and `submit_artifact`; client review and all settlement operations remain outside this service.

The OpenAI ledger is initialized to the approved build/test cap of **1,200,000,000 nano-USD = 1.20 USD**. Every inference reserves a conservative maximum before dispatch. A network/response ambiguity retains the reservation and is not retried automatically.

Before any remote deployment:

1. The D1 Free database is provisioned in APAC and its ID is pinned in `wrangler.jsonc`.
2. Set the verified Studio Next contract address and keep it aligned with the shared `fee-profile.json` deployment identity.
3. Create a dedicated public evidence repository matching all frozen origins.
4. `OPENAI_API_KEY` and distinct worker keys are stored as Wrangler secrets. Add only the remaining repository-scoped `GITHUB_EVIDENCE_TOKEN`; never reuse a broad personal GitHub token.
5. Apply migrations and run the health/budget and one-job browser acceptance tests.

Do not put any secret in `vars`, the frontend, Git, Vercel client variables, or a demo recording.
