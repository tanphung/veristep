# V2 release-candidate checkpoint — 13 September 2026

## Current release implementation checkpoint — 13 September 2026 16:54 ICT

- Current IC source SHA-256: `7ec34154e1bb490649ba0e1362c36886012f0c961af04a0bfad840e2a5f4d927`.
- Fresh gasless StudioNet contract: `0x21f3D8DBB47DFb7dd031a7bC453614513c86DFfF`. The complete fresh run in `reports/v2-studionet-release-20260913/` passed 2 semantic cases and 5 expected-rejection cases. Happy produced A/B `SATISFIED`; valid-prefix/conflicting-tail produced A `VIOLATED`, B `SATISFIED`. The run is semantic/provenance committee evidence only and deliberately uses the disabled router.
- GenVM lint/ABI passes on the pinned concrete runner; the newer rc7 SDK was inspected and still exposes status/headers/body without redirect policy or redirect history. Therefore the source rejects every surfaced 3xx and all identity mismatches, but the hidden-redirect capability gate remains open and is not misreported as solved.
- Full Python regression: 252/252. Current router namespace suite: 20/20. Frontend: 80/80 plus receipt 2/2. Worker: 15/15, TypeScript build and Wrangler dry-run pass; fresh D1 migration enforces the approved 800,000,000 nano-USD cap.
- Cloudflare worker source now implements wallet-bound chain/contract/deal/terms authorization, per-client/global quota, durable checkpoints, A/B distinct signing identities, full immutable GitHub artifacts, B-after-finalized-A, and an OpenAI `RESERVED -> DISPATCHED -> SETTLED|UNCERTAIN` journal. It never requests review or performs settlement.
- A fresh project key was verified against the model endpoint without exposing its value. The real OpenAI A/B smoke then passed on `gpt-5.6-luna` with `store:false`, Structured Outputs and reasoning disabled for bounded cost. A used 132 input/50 output tokens and B used 129 input/50 output tokens; total recorded spend is 172,200 nano-USD (0.0001722 USD). Both artifacts preserved the source's final provenance exception. The earlier HTTP 401 request ID remains non-retriable with a conservative 1,374,200 nano-USD reserve, leaving 798,453,600 nano-USD available under the approved cap. No key value is logged or committed; see `reports/openai-worker-smoke.json`.
- Bradbury V2, the remote Cloudflare worker and the V2 frontend are **not deployed**. Per owner policy, the native IC -> router -> recipient -> IC receipt round trip must be proved only after all predeployment results are reviewed and the owner explicitly confirms deployment.

Current source is `contracts/veristep.py`, not the former draft-only
`veristep_core.py`. The IC now exposes the complete funded lifecycle,
independently acquires all committed GitHub bytes in leader and validator runs,
stores the full structured report, applies deterministic deadline/settlement
rules and confirms only an exact released router receipt. The production v1.1
deployment remains unchanged. V2 has not been released to Bradbury or selected
by the public frontend; a semantic-only copy is deployed to gasless StudioNet
for committee verification.

The minimal Solidity router is `contracts/VeriStepReceiptRouter.sol`; adversarial
recipient contracts live only under `tests/evm/`. Latest component gates are:

- GenVM lint: 3 checks and ABI validation pass; 3 views and 9 writes.
- V2 direct suite: 157 passed; full Python regression: 252 passed.
- Router: 16 EVM cases pass, including wrong recipient, duplicate receipt,
  recipient revert and reentrancy.
- Frontend 74/74 plus receipt 2/2, TypeScript/Vite production build and
  dependency audit pass; largest built chunk is 285.22 kB before gzip.

## Real StudioNet committee gate

- Chain `61999`; contract `0x41BcdFB280BD26939cb6956B55ddA7e85b4567c9`.
- Deploy transaction `0xea5700856225a70267eb8d4dce92e0b9c1ddb2223d35685a4e971b449a4f2cef`
  finalized with successful execution. Deployed schema has 3 views and 9 writes;
  `get_capabilities` returns `veristep-2.0-rc` and the deliberately disabled
  router address.
- Exact source SHA-256 is
  `3133e10bf159d16a9fa49a1ec93f70cd02d1396e6f37983ed75534c5b2c3768e`.
  All artifacts are public immutable blobs at commit
  `f4b48b235d15c0be61cbd75bf491dde1b98ad058`.
- Happy case: A/B `SATISFIED`. Tail-contradiction case: A `VIOLATED`, B
  `SATISFIED`. Both traverse create, fund, accept A/B, submit A/B, request review
  and resolve review; 17/17 positive steps, including deploy, are
  `FINALIZED_SUCCESS`.
- Five additional committee transactions are
  `FINALIZED_EXPECTED_REJECTION`: canonical-host confusion, wrong committed
  owner, mutable commit name, malformed artifact SHA-256 and incomplete semantic
  obligation set. Each has `FINISHED_WITH_ERROR`, the expected contract error and
  no persisted deal.
- One preliminary owner probe correctly rejected `ORIGIN_HOST` instead of the
  intended owner check because the test runner shared a mutated origin object.
  It is retained as `FINALIZED_HARNESS_REJECTION`; the isolated replacement
  passed. Failures were not deleted or rewritten as successes.
- The 27 report JSON files are sanitized; signing keys remain only in ignored
  `.secrets/v2-studionet-semantic.json`.

The remaining native release gate is the exact IC → EVM router → recipient → IC
receipt-confirmation round trip. StudioNet was intentionally deployed with a dead
router and cannot establish this claim. The Solidity router suite and pinned
GenVM host-protocol adapter pass as component tests, but Bradbury execution still
requires fresh user approval. The official pinned web response also cannot expose
already-followed redirect history; surfaced 3xx and every noncanonical origin are
rejected, while hidden redirects remain an explicitly disclosed SDK limitation.

The 11 September text below is kept as historical evidence of how the
implementation evolved; its “disabled” and “unimplemented” statements no longer
describe the current source.

## Historical 11 September core checkpoint

This is implemented local work, NOT a funded/deployed v2 application. The live
v1.1 contract and UI configuration are unchanged. User retains submission and
new-contract deployment approval. Wallet permission is not a waiver of tests.

## Implemented in Intelligent Contract source

`contracts/veristep_core.py` used the original concrete runner hash. Its only
write entry point stores immutable **unfunded** draft terms with authenticated
client, distinct workers, chain/contract/deal domain and canonical terms hash.
It explicitly reports funding, external review and settlement as disabled.
No caller can submit a verdict/receipt to mark work paid.

Internal components now implemented and tested:

- Strict JSON: duplicate keys/nonfinite constants/trailing data rejected; no
  truthy-boolean, numeric-string or float coercion in authoritative fields.
- Contract-generated deterministic obligation IDs plus explicit semantic IDs;
  exactly complete report IDs, with no missing, duplicate or invented duties.
- Canonical provider identity commitment, immutable full commit, safe bounded
  path and explicit media type, whole byte length and SHA-256 limits.
- GitHub metadata verifier: stable owner/repository identity, commit-to-tree
  path chain, regular-file mode, blob identity, decoded Base64, Git blob SHA-1
  and full content SHA-256. Reject missing/extra trees, truncation, symlinks,
  submodules, executable artifacts, altered tails and provider identity changes.
- HTTP envelope schema/MIME/byte cap/status validation. A 3xx rejects, but this
  does not detect a hidden redirect already followed by the host. That gate is
  still open; these helpers are NOT an enabled external evidence adapter.
- Complete-artifact semantic input, strict candidates, unique grounded citation
  offsets in UTF-8 bytes, exact per-duty status/missing-ID comparison, independent
  acquisition/derivation followed by a separate grounding judgment. Contract
  callbacks use the official custom Equivalence Principle. Tests explicitly
  exercise both callbacks; this is not real protocol-selected committee proof.
- Exact receipt identity comparator, including chain/router/source/deal/role/
  sequence/terms/decision/key/recipient/amount/kind/RELEASED. Comparisons remain
  internal and cannot authenticate an arbitrary caller-supplied receipt.
- Fixed fee/bond/penalty entitlements with separate transfer kinds and value
  conservation, including the maximum fee+penalty refund boundary.

## EVM compatibility correction

The prior high-level SDK proxy failures remain reproducible and their tests
remain red. Found an official lower-level interface rather than editing the
SDK installation: `_genlayer_wasi.gl_call`, specified in the pinned release's
`_genlayer_wasi.pyi`, carrying documented `EthCall` and `EthSend` messages encoded
by `genlayer.py.calldata`.

The new narrow internal adapter uses those exact messages. It preserves the
requested value and target, reads a bounded response descriptor, handles the
documented no-result sentinel, and never calls an undocumented host message.
No changes to the runner, SDK, host implementation, network config, entitlement
policy or single-message funding architecture. This is a transport implementation
correction, not relocation of settlement logic. It has now passed execution in
the real pinned GenVM v0.2.12 binary against the official host protocol decoder.
The host was controlled and recorded one exact read and one exact send with value
123; this is not a live EVM router, committee or finality test.

The official v0.2.12 local web module was also exercised with a controlled
loopback redirect from `127.0.0.1` to `localhost`. Server logs prove both requests;
the IC received only the final status 200/body and the response exposed neither
URL nor history. This confirms the redirect gate is unavailable on this runner.
External acquisition remains disabled rather than trusting final bytes or moving
provenance authority to a backend.

References:

- [Official WASI message specification](https://sdk.genlayer.com/v0.2.14/spec/02-execution-environment/03-wasi_genlayer_sdk/02-gl_call.html)
- [Pinned Python WASI declarations](https://github.com/genlayerlabs/genvm/blob/ea1de32ffbcdec286e665f10043a124848901237/runners/genlayer-py-std/src/_genlayer_wasi.pyi)
- [Pinned executor EthCall/EthSend implementation](https://github.com/genlayerlabs/genvm/blob/ea1de32ffbcdec286e665f10043a124848901237/executor/src/wasi/genlayer_sdk.rs)
- [GitHub tree API](https://docs.github.com/en/rest/git/trees)
- [GitHub blob API](https://docs.github.com/en/rest/git/blobs)

## Verification and honest remaining scope

GenVM lint: 3 checks passed, no warnings; ABI: 1 write, 2 views.
Direct core suite: **144 passed**, `reports/v2-core.xml`.
Full local Python regression: **239 passed, 0 failed**, including v1 history,
v2 core/adversarial coverage and pinned-SDK safety diagnostics;
`reports/v2-regression.xml`. A passing safety diagnostic means the unsupported
external adapter remains closed, not that redirects are now safe.
One test-harness failure from an automatically generated oversized test ID was
fixed by explicit short test IDs; artifact limits/negative test unchanged. Raw
failed run retained in `reports/v2-core-long-test-id.xml`.

The IC now assembles the complete structured report privately and refuses to call
provenance `VERIFIED` from hash-valid bytes alone. Report provenance must exactly
match the committed provider/owner/repository/commit/blob/path/type/length/hash.
Accept, delivery and upstream obligations are stage-specific for A/B, and their
deterministic status participates in the contract-derived stage outcome.

Still unimplemented/unverified: enabled redirect-safe external acquisition,
public persisted consensus-report lifecycle and funded lifecycle/deadlines, native router
release/confirmation, real committee semantic/adversarial tests, actual worker
agents and final frontend integration/UX. Do not infer these are complete from
the helper tests or the number of passing cases.

Native test environment preparation uses official v0.2.12 release assets under
ignored `.cache/genvm-native-v0.2.12`. Linux binary relocation via upstream
post-install is installation only, not modifying GenVM logic or runner content.
No new chain transaction or public deployment is authorized by this checkpoint.

Frontend regression remains **2 receipt + 65 UI tests passed**. TypeScript and
the production Vite build pass. The primary 762.67 kB bundle was split into
bounded UI, GenLayer and EVM chunks (largest 285.22 kB); desktop and 390 px mobile
were visually checked with no horizontal overflow. The public UI still targets
the historical verified v1.1 contract and does not pretend the draft v2 core is
live.
