# RPC read recovery — 26/09/2026

Expected: opening the A-fault example reads finalized contract state and displays
its recorded verdict and evidence without a wallet.

Actual: a user screenshot showed “Version of JSON-RPC protocol is not supported.”
The same page subsequently recovered. The installed viem version maps RPC code
`-32006` to that message; the failing raw response was not captured.

First observed failure point: the frontend's finalized-state read path. The
existing retry filter did not recognize this protocol error and the detail view
could not reuse the overview's separately retained data after the shared TTL
expired. This explains the missing recovery behavior, not the upstream cause.

Evidence: independent read-only reproductions of `get_terms` for
`v2-studio-a-fault-r3-358323c` and `list_deals` both succeeded. An instrumented
`gen_call` sent `jsonrpc: "2.0"` and received HTTP 200 with `jsonrpc: "2.0"`.
The on-chain source hash still matched the release hash recorded in deployment.json.
No transaction or deployment was performed.

Root-cause status: `ROOT_CAUSE_UNKNOWN` for the intermittent RPC rejection.
There is insufficient evidence to attribute it to a particular provider layer.

The frontend now keeps successfully validated reads in one session-memory cache,
scoped to chain and contract. Wallet lists filter ownership from those validated
records. A 15-second TTL still controls fresh reads; expired data can be displayed
while updating, with explicit pending/failure text. Cached state is not a new
verification, and no snapshot is manufactured when the first read fails.

Transient and protocol errors receive at most one application-level retry, after
1.5 seconds and the shared request limiter. Rate limits use the existing shared
61-second cooldown and one queue retry instead. Deterministic validation failures
are not retried. Signing and broadcasting do not use this read recovery helper.
The existing SDK may also apply its own transport retry policy.

Diagnostics log only operation, error category, numeric code when available and
time. Raw responses, calldata and wallet information are omitted. Regression
tests cover cache expiry, navigation reuse, failed refresh retention, wallet
switching and bounded retry using stubbed RPC responses, without live writes.
