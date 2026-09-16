# V2 preflight — 10 September 2026

12 September status: this file is historical preflight evidence. The selected
WASI adapter, full IC lifecycle and receipt router are now implemented in
`contracts/veristep.py` and `contracts/VeriStepReceiptRouter.sol`; component
gates pass as recorded in [V2-CORE-PROGRESS.md](V2-CORE-PROGRESS.md). The remaining
gate is native full-environment integration, not the three original SDK probes.
No v2 public deployment is claimed.

11 September update: see [V2-CORE-PROGRESS.md](V2-CORE-PROGRESS.md). An official
WASI-level EVM adapter now has local tests preserving exact value/address and a
successful real GenVM v0.2.12 controlled-host execution. The high-level proxy
still fails and is not selected. Native router/finality remain unverified. A
real GenVM + official local web-module probe now confirms redirect safety is
unavailable: a cross-host redirect is followed and only final 200/body reaches
the IC. The historical observations below have not been erased.

Status: PARTIALLY UNBLOCKED for the selected EVM transport, still BLOCKED at the
official web redirect and live EVM finality capability gates. Not a completed v2,
not a deployment approval request, and not proof of live validator execution.
The user approved implementation, not waiving requirements or deployment.

## Work performed

- Read the approved architecture and all four security design documents.
- Inspected the exact installed runner and its transitive SDK, plus official
  GenVM source at `ea1de32ffbcdec286e665f10043a124848901237` (v0.2.12).
- Added executable diagnostics using the SDK's public typed EVM interface. Only the
  host-call boundary is intercepted; proxy construction and ABI encoding are
  the unmodified official implementation. No real wallet or network writes.
- Included feasibility tests in default pytest discovery. The two known broken
  high-level EVM behaviors are now locked as explicit diagnostics because the
  production core uses the documented WASI interface instead. There is no
  xfail/skip conversion; raw original failures remain preserved.

## Exact versions and results

Runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
Transitive SDK: `py-lib-genlayer-std:11rhn002yfajawsz7fai6mykznbxkxs6l91iskj5cm82c92qhy3v`.
Tools remain pinned by requirements.txt: genlayer-test 0.29.2,
genvm-linter 0.11.0, genlayer-py 0.16.3, pytest 9.0.3.

```
$env:GENVM_VERSION='v0.2.12'
.\.venv\Scripts\genvm-lint.exe check contracts/veristep.py --json
.\.venv\Scripts\pytest.exe -q --tb=short --junitxml=reports/v2-preflight.xml
```

Lint: existing v1.1 contract passed (3 checks, 13 methods). No new v2 contract
was linted. Tests: **92 passed, 3 failed**. The 92 are historical v1 regression
tests, not completed v2 adversarial coverage. Raw failures:
[v2-preflight.xml](../reports/v2-preflight.xml).

| Gate | Observed result | Consequence |
| --- | --- | --- |
| Typed EVM view | `AttributeError: ...ViewProxy... has no attribute 'parent'` | Proposed native receipt read fails before host call |
| Typed EVM value-bearing write | `.emit(value=123).fund(7)` constructs EthSend with `value=0` | Proposed single-message exact-value router funding does not work through this API |
| Redirect enforcement | Public request signature has no redirect control; Response has only status/headers/body | Contract cannot enforce the approved no-redirect policy with this SDK interface |
| Full local integration | Docker CLI installed, daemon unreachable at docker_engine pipe | No running full local GenVM environment established; Studio alone cannot prove native IC/EVM round trip |

The first two are executable SDK reproductions, not claims that a transaction
was broadcast and lost funds. They no longer gate the selected WASI transport,
which has its own direct and real-GenVM tests. The redirect observation is now
also backed by a real local GenVM/web-module test; that diagnostic passes by
proving the production capability must remain closed. It can be reopened only
with a documented supported API and real-runtime no-follow proof.

## Root-cause evidence

In the pinned `_internal/eth.py`, generated view code uses `self.parent`, whereas
generated proxy slots expose `_proxy_parent`. Generated send code obtains the
transaction dictionary from `_proxy_args[0]` but reads value from
`_proxy_kwargs`, which it simultaneously requires to be empty.

The pinned `nondet/web.py` exposes `Response.status`, not `status_code` as shown
in the current high-level web documentation. Follow the pinned source; do not
invent an alias or assume documentation examples prove runner compatibility.

The official v0.2.12 web implementation constructs a default reqwest client
without a no-redirect policy, then serializes only final status/headers/body.
Reqwest 0.12.15 defaults to following up to ten redirects. This is source-level
evidence about that release, not an assertion that Bradbury uses identical host
configuration: the contract runner hash does not pin validator host web config.
Contract enforcement still needs documented guarantees and real-runtime tests.

Inspected upstream release v0.3.0-rc7 (`b84d5b83b54a90ae40070636f285b8e0321abfbe`)
and main (`abb71bf891695b737e6a4f5211f4740a3b25543d`) source: view uses
`_proxy_parent`, but typed send still reads value from empty `_proxy_kwargs`.
The inspected rc7 web API still exposes no redirect policy/history. These were
source checks only; neither version was installed, selected, or tested on chain.
Blindly upgrading the runner does not resolve all gates.

Reproduction SDK file SHA-256:

- `_internal/eth.py`: `45878771cf402e3e471f25156b0c459e3eb8ca241746cde9681048b452b2aa52`
- `nondet/web.py`: `9aeefa3135838a42f20ecaf1b97dbe8cf949c4d09f584d94e90856006d186267`

## Next dependency, without weakening requirements

Need official GenLayer confirmation/documentation of a supported concrete
runner + host web API which enforces no redirects, plus native EVM read finality
semantics and a live router test. Exact EVM view/value-send bytes are no longer
blocked at the GenVM host ABI layer. A provider HTTP
signature or two-message router funding design would materially change the
approved architecture and requires a separate security review and user choice;
neither is silently substituted.

Do not patch the installed SDK, use undocumented private host calls, put the
verifier in a backend, drop exact value matching, or label balance deltas as
receipt confirmation. Do not deploy a broken adapter to obtain the missing
predeployment proof.

After an acceptable official path exists: rerun these gates; specify finality
and the full local integration environment; then implement the v2 IC, complete
the mandatory adversarial matrix and present results for deployment approval.
No public upstream issue/message has been posted on the user's behalf.

## Official source references

- [Pinned EVM implementation](https://github.com/genlayerlabs/genvm/blob/ea1de32ffbcdec286e665f10043a124848901237/runners/genlayer-py-std/src/genlayer/gl/_internal/eth.py)
- [Pinned proxy generator](https://github.com/genlayerlabs/genvm/blob/ea1de32ffbcdec286e665f10043a124848901237/runners/genlayer-py-std/src/genlayer/py/evm/generate.py)
- [Pinned web SDK](https://github.com/genlayerlabs/genvm/blob/ea1de32ffbcdec286e665f10043a124848901237/runners/genlayer-py-std/src/genlayer/gl/nondet/web.py)
- [Host client factory](https://github.com/genlayerlabs/genvm/blob/ea1de32ffbcdec286e665f10043a124848901237/modules/implementation/src/common/mod.rs)
- [Host response serialization](https://github.com/genlayerlabs/genvm/blob/ea1de32ffbcdec286e665f10043a124848901237/modules/implementation/src/scripting/mod.rs)
- [Reqwest redirect policy](https://github.com/seanmonstar/reqwest/blob/v0.12.15/src/redirect.rs)
- [GenLayer EVM interaction](https://docs.genlayer.com/developers/intelligent-contracts/features/interacting-with-evm-contracts)
- [GenLayer messages and Studio limitation](https://docs.genlayer.com/developers/intelligent-contracts/features/messages)
