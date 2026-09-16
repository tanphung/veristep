# VeriStep — Threat model v0.2

## Release addendum — receipt namespace and hosted workers (13/09/2026)

- An attacker can pre-fund a predictable receipt ID before the Intelligent Contract if the router indexes receipts by receipt ID alone. The release candidate namespaces every receipt by `(sourceContract, receiptId)`, derives `sourceContract` from `msg.sender` during funding, and requires that source on every read and release. A receipt created by another caller cannot block or authenticate the IC receipt.
- The hosted A/B worker and OpenAI output are untrusted producers. They cannot select a verdict, settlement amount, router target, arbitrary contract call, or mutable evidence URL. Their signing policy is limited to the configured chain, IC, deal, role and expected lifecycle method.
- Worker API abuse is bounded by wallet authorization, replay-resistant nonces, per-client concurrency and a hard OpenAI budget ledger. Operational checkpoints do not replace contract state.
- Every OpenAI request moves `RESERVED -> DISPATCHED -> SETTLED`. A crash or invalid/missing response after dispatch moves it to `UNCERTAIN`; restart cannot reuse that request ID and the full worst-case reserve remains charged until an explicit provider-backed reconciliation. This prevents a workflow restart from silently doubling inference spend.
- Every GenLayer worker action writes a unique `(run, role, method)` `SIGNING` journal row before broadcast. A crash or throw without a saved hash becomes `UNKNOWN` and blocks automatic resend; a known hash is observed until finality. This chooses a recoverable pause over a possible duplicate transaction.

## v2 design supersession — 09/09/2026

The proposed authority boundary and failure policy in [IC-V2-ARCHITECTURE.md](IC-V2-ARCHITECTURE.md) supersede the historical v1.1-only assumptions below. All provenance, independent assessment, eligibility and receipt confirmation belong to IC execution. UI/backend/worker output is untrusted.

New attack surfaces: canonical-host confusion and redirects; provider owner/repository transfer; mutable refs and symlink/submodule targets; API truncation/content-type confusion; valid prefix hiding contradictory tail; incomplete obligation lists; receipt replay across deals/contracts/chains/roles; reentrancy and release failure; forged or non-final receipt state. Require authoritative provider identity, complete immutable bytes and strict schema, independent validator fetch/derivation, pinned router/source identity and exact IC receipt confirmation. Unsupported providers fail closed. Provider availability/rate limits and SDK finality/redirect behavior are explicit feasibility gates. A wallet submission does not prove ownership of a GitHub account; a provider-bound document does not prove real-world truth.

Failed/unknown transfer state cannot recreate spendable credits or trigger automatic resend. No automatic migration of v1.1 balances/claims and no v2 deployment from earlier permission.

## Addendum v0.4 — explicit coverage, 06/09/2026

Live history proves that reviewers disagree whether a timing statement also answers a permission prerequisite. Version 1.1 defines coverage as an explicit answer (semantic paraphrases allowed) or explicit unknown for each requested topic; a timing assertion alone does not answer authorization, eligibility, cost, or other independent prerequisites. This rule applies equally to leader and grounding verifier. B remains required to flag missing requested information, as in the approved plan; faithfully copying an incorrect but complete answer is distinct from silently copying an omission. No per-obligation comparison or citation gate is removed. Old deployments/terms are not mutated. Historical failures remain public.

## Addendum v0.3 — 06/09/2026, review resilience

Receipt live đầu tiên báo thiếu citation nguồn/sản phẩm. Sửa prompt bằng output skeleton sinh từ obligation/chunk IDs đã xác minh; không sinh verdict hoặc quote mặc định. Mỗi node được thử tối đa hai lần tạo output trên cùng toàn bộ snapshot, chỉ khi parser báo lỗi `[LLM_ERROR]`. Không retry một output đã hợp lệ để chọn verdict thuận lợi. Lần hai vẫn lỗi thì fail closed/validator disagree, không phát hành credit hoặc biến lỗi thành UNASSESSABLE. Không đưa output lỗi trở lại prompt; chỉ dùng chẩn đoán từ parser để giảm đường prompt injection. Giới hạn này không giới hạn số giao dịch người dùng có thể gửi trong cửa sổ review; script giới hạn rotation và lưu mọi giao dịch. Chi phí và latency tăng tối đa một lần derive mỗi node, cần đo trên StudioNet.

Ngày: 05/09/2026. Trạng thái: thiết kế đã tự rà soát, chưa kiểm chứng bằng test hoặc audit độc lập.

## Tài sản và biên tin cậy

Tài sản: tiền công/bond, quyền nhận việc, nghĩa vụ và bản giao bất biến, kết luận và lịch sử công việc.

MVP nhận source/A/B trực tiếp trong contract. Source là căn cứ do khách hàng cung cấp và các bên chấp nhận trước active. Hệ thống xác minh trung thực với căn cứ đó; không chứng minh source mô tả đúng thế giới.

Issuer được xác định bởi sender của giao dịch và vai trò job. Không tin trường author do frontend cung cấp. Hash chứng minh nội dung/bản giao không thay đổi, không chứng minh chất lượng. Người dùng/browser và LLM output đều có thể độc hại.

## Nguy cơ và biện pháp

| Nguy cơ | Biện pháp | Kiểm thử |
| --- | --- | --- |
| Đổi điều khoản sau nhận việc | Khóa rubric/version/obligation IDs khi active | Sửa rubric sau accept |
| Tráo artifact | Full bytes lưu bất biến, SHA-256, revision | Đổi một byte hoặc ID |
| Giả issuer hoặc vai trò | Sender on-chain và role binding | Ví không được chỉ định nộp bài |
| B đổi đầu vào A | Bind upstream submission ID | Dùng revision A khác |
| Replay khác job/chain/contract | Domain binding đầy đủ | Chuyển proof sang job khác |
| Leader JSON hợp lệ nhưng sai | Validator đọc cùng snapshot và tự đánh giá | Sai A/B nhưng đúng schema |
| Bỏ nghĩa vụ | Exact obligation ID set, một assessment/ID | Thiếu/thừa/trùng |
| Bỏ phần cuối tài liệu | Full-byte review, đủ chunks | Ngoại lệ/injection chunk cuối |
| Prompt injection | Data delimiters, không thực thi code/URL từ LLM, độc lập đối chiếu | Giả instruction hoặc verdict |
| Phạt B chỉ vì A sai | Xét nghĩa vụ độc lập, dependency đã khóa | A sai/B trung thực |
| LLM chọn tiền/thời hạn | Quy tắc deterministic, F/B/P cố định | Response có recipient/amount tự chèn |
| Lặp review để chọn kết quả | Một review active trên snapshot, retry policy | Resolve sau decided |
| Khóa tiền do im lặng | Timeout/cancel đã thống nhất | Không nộp hoặc client im lặng |
| Double claim / race | Settlement ID, lock, conservation invariant | Claim lặp, refund-vs-claim |
| Thanh toán ảo | Finality, execution/message/recipient/amount match | Parent success/child error |
| Lộ khóa | Local .env, ignore, redaction, bundle scan | Source/history/build scan |
| Cạn phí | Byte caps, fee estimate, giới hạn retry và reserve | Dữ liệu lớn/LLM lỗi lặp |

## Rủi ro còn lại

- Validators có thể cùng hiểu sai; consensus không bảo đảm chân lý.
- Bộ nguồn được các bên chấp nhận có thể thiếu hoặc sai về thế giới thực.
- Lưu văn bản trên-chain có phí và công khai; bản đầu chỉ dùng tài liệu không bí mật.
- Hủy trung lập phần không thể kết luận có thể khiến người làm mất công; điều khoản phải nói rõ.
- Ví khác nhau không chứng minh người vận hành khác nhau; chưa chống Sybil.
- Nhu cầu khách hàng trả tiền chưa được xác thực.

## Quan hệ với AGENTS.md

Đây là thiết kế nhận bằng chứng qua giao dịch đã xác thực, không có external URL evidence adapter. Với dữ liệu on-chain, canonical origin là network/contract, issuer là sender, immutable artifact identity là job/stage/revision/hash; mỗi node đọc snapshot có thẩm quyền.

Nếu mở nguồn web sau này phải thực hiện đầy đủ các gate repo/owner/immutable version/redirect/full-artifact theo AGENTS.md; không coi việc bỏ web trong MVP là đã giải quyết provenance của web.
