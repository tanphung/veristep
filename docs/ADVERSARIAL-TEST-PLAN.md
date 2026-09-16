# VeriStep — Kế hoạch kiểm thử đối kháng v0.2

## Release addendum — receipt preemption and hosted worker cases (13/09/2026)

- Pre-fund the same receipt ID from an attacker source, then fund/release/read the legitimate IC namespace. Both namespaces must remain independent and the attack must not block the IC.
- Read or release a receipt with the wrong source contract; require zero/not-found or rejection without changing the legitimate receipt.
- Crash the worker before inference, after output persistence, after GitHub commit, after transaction broadcast and while polling. Resume must not repeat a valid inference unnecessarily, create another immutable artifact or submit a duplicate transaction.
- Replay an expired wallet authorization, alter chain/contract/deal/role/method, exceed per-client concurrency and exhaust the OpenAI reserve. All must fail before signing or calling the model.
- Crash before dispatch, after the D1 `DISPATCHED` marker, after an HTTP response and before usage settlement. Only a never-dispatched `RESERVED` request may continue automatically; `DISPATCHED`/`UNCERTAIN` keeps its reserve and must not call OpenAI again on workflow restart.
- Inject instructions in SOURCE/A content that request secrets, arbitrary transactions, changed destinations or relaxed obligations. Worker output remains bounded data and the signer still permits only the expected lifecycle call.

## v2 mandatory matrix — updated 11/09/2026

[IC-V2-ARCHITECTURE.md](IC-V2-ARCHITECTURE.md), section 9 governs the new release. Add direct + explicit validator-helper + full integration coverage for: valid prefix/contradictory tail; canonical-host/redirect/owner/repository/commit/blob/hash mismatch; symlink/submodule/truncated provider response; missing artifact/chunk; missing/duplicate/extra funded obligation; valid-schema wrong decision and unsupported reasoning; exact deal/source/recipient/amount/kind/RELEASED mismatch; reentrancy, failed recipient and duplicate release; no state mutations after rejected consensus; deadlines/revisions and refund eligibility.

Tests must demonstrate independent leader/validator acquisition and substantive rejection. Ordinary direct tests with a mocked LLM cannot establish real committee behavior. Studio does not fully implement EVM contract interaction; local router tests and mocked IC reads must not be represented as a passed native end-to-end integration. Missing full-path environment is an explicit open gate. No deployment until required contract tests pass and the user confirms.

Current evidence: 157 v2 direct tests pass, including whole-tail, identity,
report completeness, provenance-report binding, stage-specific deterministic
duties and exact receipt negatives. On StudioNet, two complete funded lifecycle
cases passed real protocol committee review: faithful A/B and a contradictory
tail that produces A `VIOLATED`, B `SATISFIED`. Five finalized negative writes
prove on GenVM that canonical-host confusion, wrong owner, mutable version,
malformed SHA-256 and an incomplete obligation set are rejected without state.
The real pinned GenVM controlled-host probe passes exact EVM target/value
encoding, and the 16-case router suite covers receipt identity and release
failures. The unmodified official local web module confirms cross-host redirects
are followed and hidden from the contract response; this is a passed diagnostic
but a **failed hidden-redirect capability gate**. Native IC/router execution and
receipt finality remain open until an authorized Bradbury round trip.

## Addendum v0.4 — preserve ambiguous historical case

The original A-fault fixture (`immediately`, with no explicit approval answer) conflated inherited incorrect information with an inherited omission that B was required to flag. Preserve its exact source/task/A/B bytes as `timing-omission`; under the clarified v1.1 rubric both stages violate coverage. Keep historical v1.0 receipts unchanged and report both versions, never combine them into a cleaned success rate.

For the unambiguous core A-fault case, use an explicit incorrect claim that approval is not needed. B faithfully reproducing this complete answer satisfies its non-source-checking duties. Versioned fixture changes are disclosed, not retroactively applied. Add tests asserting the same coverage policy reaches both derivation and grounding, independent status disagreement still rejects, and grounded-looking but unsupported reasoning still rejects. Unit mocks prove enforcement only; run all nine fixtures live, including the unchanged timing case, and repeat the three clear core cases three times.

## Addendum v0.3 — regression của lỗi live 05/09

- R01: thiếu citation SOURCE/A/B ở từng obligation determinate phải bị parser từ chối, kể cả SATISFIED coverage.
- R02: output lần đầu thiếu citation, lần hai hợp lệ: đúng hai calls với cùng full snapshot; kết quả hợp lệ không bị thay status.
- R03: cả hai outputs lỗi: dừng đúng hai calls, review/ledger giữ nguyên; không mint credit hoặc trả UNASSESSABLE giả.
- R04: snapshot hash bị sửa: không gọi LLM, không retry.
- R05: valid first output: đúng một call; prompt skeleton không điền verdict sẵn và chứa đủ roles/chunks, kể cả optional B_SOURCE.
- R06: validator vẫn từ chối leader sai material outcome hoặc reason không được evidence hỗ trợ sau sửa prompt/retry.

Các test trên là regression có output kiểm soát, không thay thế ba ca live consensus và các lần lặp bắt buộc.

Tất cả case trong file này là yêu cầu chưa chạy. Không được báo “pass” khi mới viết test hoặc dùng mock cho hành vi consensus thực.

## Phân tầng

- GenVM lint: header/storage/decorators/API restrictions.
- Direct tests: state machine, permissions, arithmetic, timeout và ledger invariants.
- Reviewer unit tests: gọi riêng leader/validator helper với response kiểm soát; chứng minh validator từ chối kết luận sai.
- Integration: SDK/network/GenVM/immutable state/LLM/committee với bằng chứng thật phù hợp môi trường.
- Bradbury E2E: parent/child/external-message finality và tiền tới EOA; Studio không thay thế phép thử này.
- Frontend: renders actual state, wrong chain, rejected signature, duplicate clicks, reload/pending/error, anonymous website.

## Test cases bắt buộc

| ID | Case | Kỳ vọng |
| --- | --- | --- |
| S01 | A trích sai, B trung thực theo A | Chỉ A vi phạm |
| S02 | A đúng, B tự bỏ điều kiện | Chỉ B vi phạm |
| S03 | A/B vi phạm độc lập | Phạt mỗi bước theo khoản cố định |
| S04 | A/B đúng, client khiếu nại sai | Trả công và bond; không lỗi danh tiếng |
| S05 | Nguồn mâu thuẫn, rubric chưa giải quyết | UNASSESSABLE; không ép phạt |
| S06 | B có nghĩa vụ kiểm tra nguồn được ghi rõ | Đánh giá đúng nghĩa vụ này, không dùng mặc định cũ |
| E01 | Byte cuối artifact thay đổi | Hash fail |
| E02 | File quá giới hạn/UTF-8 lỗi/binary/archive | Reject trước semantic review |
| E03 | Sửa artifact đã chốt hoặc trỏ revision khác | Chỉ bản bất biến gốc hợp lệ |
| E04 | Issuer/chain/contract mismatch | Domain/role validation fail |
| E05 | RPC unavailable, snapshot thiếu hoặc chưa finalized | Không báo đã xác minh/kết thúc |
| E06 | Thiếu/trùng/đảo chunks | Fail complete review gate |
| E07 | Ngoại lệ chỉ ở chunk cuối | Kết luận vẫn phải xét ngoại lệ |
| E08 | Contradiction ở hai chunks | Không approve từ một chunk đơn lẻ |
| E09 | Sai source/chunk citation | Reject verdict |
| E10 | Artifact/review của job khác, upstream version sai | Reject replay |
| E11 | Thiếu/thừa/trùng obligation ID | Deterministic failure |
| E12 | Injection yêu cầu chấp nhận/thay recipient/giảm penalty | Không thay rule hoặc ledger |
| C01 | Leader đúng schema nhưng sai A/B | Validator từ chối |
| C02 | JSON malformed/unknown enums/type/range lỗi | Attempt controlled failure |
| C03 | LLM calls ngoài nondet hoặc storage writes trong callback | Lint/test không cho qua |
| C04 | Validator dùng leader-only thay snapshot contract và tự đánh giá | Test phải bắt được |
| C05 | LLM agreement thất bại nhiều vòng | Hiển thị đúng unavailable/undetermined; không giả success |
| M01 | Sai ví accept/submit/claim | Revert |
| M02 | Job chưa funded đủ hoặc nhận value sai | Revert/refund theo spec |
| M03 | Claim hai lần hoặc retry sau response mất | Không trả thêm |
| M04 | Refund và settlement đua nhau | Một nhánh hợp lệ, ledger bảo toàn |
| M05 | F/B/P cực trị, rounding/overflow | Không âm, không vượt tiền đã nhận |
| M06 | Không nộp A/B hoặc client im lặng | Deadline branch đúng; không khóa tiền vĩnh viễn |
| M07 | Parent finalized success nhưng message transfer thất bại | UI không báo đã nhận tiền; không tự retry gây double pay |
| M08 | Receipt của khoản khác/recipient khác/amount khác | Không dùng làm bằng chứng thanh toán |
| M09 | Provisional verdict bị thay bởi appeal | Không thực hiện effect không thể thu hồi trước finality |
| U01 | Wrong chain, signature reject, RPC timeout | Lỗi có cách phục hồi, không fake tx hash |
| U02 | Reload khi pending; nhấn hai lần | History còn, không vô tình submit lại |
| U03 | RPC đã accepted nhưng execution error | Giao diện báo thất bại |
| U04 | Không ví và mở website ẩn danh | Xem case đã verify được |
| U05 | Source/history/build bundle | Không chứa .env/private key/OAuth token |
| U06 | fresh clone + hướng dẫn | Cài, test và build được theo phiên bản pin |

## Mốc ra quyết định

G1: 8 fixtures cốt lõi; chạy thực ít nhất 3 lượt cho S01, S02, S04 với ghi lại thành công/thất bại. Mục tiêu tất cả case rõ ràng kết luận đúng trong retry bound, không tự loại kết quả thất bại khỏi báo cáo.

G2/G3: toàn bộ tests bắt buộc phù hợp lớp chạy pass, có coverage theo test ID; không dùng số lượng tests thay chất lượng.

G4: ba case on-chain A lỗi/B lỗi/không lỗi, tiền có receipt và execution đúng; negative evidence case không được phạt.

Bug P0/P1 về mất tiền, bypass signer/version provenance, sai material verdict rõ ràng hoặc fake UI success phải sửa trước public submission.
