# VeriStep — Evidence schema v0.2

## Release addendum — receipt lookup and worker provenance (13/09/2026)

- Router lookup identity is `(source_contract, receipt_id)`. `source_contract` is an explicit argument for `release`, `receiptDigest` and `receiptState`, and must equal the source stored by `fund` from `msg.sender`.
- Worker journal entries bind chain, IC, deal, role, revision, terms hash, model ID, prompt version, input hash, output hash, immutable GitHub commit/path/blob, transaction intent/hash and timestamps. This journal is operational evidence only; the Intelligent Contract independently fetches the committed artifact and stores the authoritative assessment.
- OpenAI credentials, wallet private keys and GitHub write credentials are never fields in evidence, logs, frontend configuration or public reports.
- The private operational cost journal stores integer nano-USD and request states `RESERVED`, `DISPATCHED`, `UNCERTAIN`, `SETTLED`. It is not contract evidence and cannot affect any obligation or settlement decision.

## v2 design supersession — 09/09/2026

The current proposed schema is defined in [IC-V2-ARCHITECTURE.md](IC-V2-ARCHITECTURE.md), sections 2–6. All older addenda below describe v1.1 history, not the new requirements.

V2 stores the complete funded obligation manifest, including deterministic duties. Final reports contain source_assessments, obligation_assessments, findings, reasoning, evidence_citations, missing_items, IC-derived score and decision, all bound to job/terms/review identity. Multiset counts reject missing/duplicate/extra IDs. External commitments bind canonical provider origin, stable owner/repository identity, full immutable commit, exact file/tree/blob identity, supported content type, whole decoded byte length/SHA-256, issuer and upstream. GitHub is the first proposed adapter; CID/deployment inputs are rejected until validated adapters exist. No backend-provided provenance flag or report is authoritative.

## Addendum v0.4 — version-bound coverage policy

New jobs bind `veristep-1.1` in immutable terms. Existing IDs and response schema remain unchanged; the A_COVERAGE/B_COVERAGE descriptions now require explicit answers or explicit unknowns. Timing alone cannot answer an independent prerequisite. Both derivation and grounding receive the same policy. This changes the rubric version, not artifact bytes, hash/chunk validation, money rules, or existing deployment state.

## Addendum v0.3 — schema thực thi cho regression citation

Parser hiện yêu cầu root đúng hai keys `reviewed_chunks`, `assessments`. Mỗi assessment đúng `obligation_id`, `status`, `reason`, `citations`; mỗi citation chỉ `chunk_id`, `quote`. Với SATISFIED hoặc VIOLATED, phải có citation từ cả hai `evidence_roles` của obligation, kể cả coverage. Quote phải là substring nguyên văn, 1–500 UTF-8 bytes; 1–4 citations/assessment, reason ≤900 bytes. UNASSESSABLE không được dùng chỉ để né lỗi format. Byte offsets được contract suy ra sau consensus. Prompt skeleton chỉ chứa ID hợp lệ và placeholder, không tự điền status/quote. Retry không thay đổi schema, artifact identity, rubric hoặc snapshot hash.

Đây là schema thiết kế của ứng dụng, chưa là ABI triển khai.

## Job và nghĩa vụ

Job chứa chain ID, contract address, job ID, client/A/B addresses, rubric version/hash, deadline và F/B/P từng stage. Mỗi obligation có ID duy nhất, stage chịu trách nhiệm, mô tả, loại deterministic/semantic, artifact IDs phải đọc và trường hợp UNASSESSABLE.

Tổng obligation dự kiến ≤6. Các bên chấp nhận toàn rubric và nguồn trước active. Scope của B phải quy định rõ có hoặc không có nghĩa vụ kiểm tra lại source gốc.

## Artifact đăng trực tiếp trên-chain

| Trường | Cách xác minh |
| --- | --- |
| origin_chain_id / origin_contract | Cấu hình chain và contract thực, không từ URL tùy ý |
| job_id / stage_id | Thuộc job đang thao tác, đúng vai trò |
| submission_id / revision | ID bất biến do contract cấp; MVP một bản chốt mỗi stage |
| upstream_submission_id | Với B, phải là bản A đã chốt và công bố trước B |
| issuer_wallet | Lấy từ authenticated transaction sender |
| evidence_role | SOURCE / EXTRACTION / REPORT, phải khớp role người gửi |
| content_type / encoding | Plain text/Markdown/JSON; UTF-8 hợp lệ |
| content | Toàn văn được lưu và không sửa sau chốt |
| byte_length / sha256 | Contract tính từ toàn bộ bytes UTF-8 |
| chunk_count / chunk_digests | Contract/reviewer tính theo thuật toán chung |
| committed_at | Thời gian on-chain |
| originating_tx | Ghi trong deployment/demo manifest từ receipt; không giả định hash hiện tại có sẵn trong GenVM |

Source do client đăng và được hai contributor chấp nhận khi nhận job. Nó là tài liệu quy chiếu đã thống nhất, không được quảng cáo là đã chứng thực thông tin ngoài đời.

Không nhận GitHub URL làm evidence ảnh hưởng tiền trong MVP. GitHub giữ source code/test fixtures cho giám khảo, không nằm trên đường review.

## Phân tách quyền và provenance

- Ví client chỉ đăng source/rubric cho job mới; không giả làm A/B.
- A chỉ đăng artifact của A; B phải trỏ đúng A submission.
- Contract từ chối role mismatch và sửa nội dung đã chốt.
- Schema frontend chỉ là tiện ích nhập; contract validate lại tất cả.
- Issuer wallet có nghĩa đã nộp/chấp nhận trách nhiệm cho văn bản, không chứng minh người viết bằng tay.
- Mỗi validator chạy deterministic path đọc cùng snapshot của contract, kiểm tra hash/length/domain rồi tự đánh giá. Frontend không được cung cấp snapshot có thẩm quyền.

## Review response

Kết quả chứa job/rubric/snapshot identity, ordered artifact hashes, evidence_complete và assessments. Mỗi assessment: obligation_id, SATISFIED / VIOLATED / UNASSESSABLE, reason code, citation evidence/chunk IDs và byte ranges, giải thích ngắn.

- Expected obligation set khớp tuyệt đối, đúng một assessment/ID.
- Stage verdict được suy ra từ assessments và dependency rules.
- Citation nằm trong đúng artifact/byte range; validator đánh giá nó có hỗ trợ kết luận không.
- Material outcomes phải đồng thuận; wording giải thích có thể khác.
- INCONCLUSIVE là thiếu căn cứ ngữ nghĩa; ERROR/UNAVAILABLE là review không chạy được.
- UNASSESSABLE không đồng nghĩa VIOLATED; không bị penalty hoặc fault history.
