# VeriStep — Review thiết kế và điểm còn mở v0.2

## Review addendum v0.3 — 06/09/2026, trước thay contract

Đã đọc và tự rà soát bốn addenda v0.3: thay đổi giới hạn ở prompt scaffolding và tối đa một lần regenerate cho output không qua parser. Không thay economics, provenance, đầy đủ artifact hoặc tiêu chí validator. Không dùng candidate lỗi làm instruction; chỉ diagnostic do code tạo. Không tự điền quotes/status. R01–R06 phải qua trước chạy lại live StudioNet. Rủi ro còn lại: AI vẫn có thể sai hoặc không đồng thuận, chi phí derive tăng; cần bằng chứng thực tế. Đây là self-review của trợ lý, không phải review độc lập/team approval. Bradbury gate giữ nguyên.

Ngày 05/09/2026. Người rà soát: trợ lý lập kế hoạch. Đây là tự rà soát, chưa phải audit độc lập hoặc duyệt của GenLayer.

## Quyết định đã chỉnh

- Giới hạn hai bước trích xuất → viết; không hứa tìm mọi nguyên nhân workflow.
- Nguồn/A/B được đăng trực tiếp trong contract qua đúng ví. Bỏ GitHub/API khỏi đường review để giảm rate limits, biến động web và yêu cầu credentials.
- Nguồn là căn cứ các bên thống nhất, không tuyên bố xác minh chân lý ngoài đời.
- Tách không vi phạm với chưa thể kết luận; không phạt khi thiếu căn cứ.
- B chỉ chịu nghĩa vụ đã nhận, không tự có lỗi vì A sai.
- F/B/P cố định trước active; LLM không quyết số tiền.
- Full bytes và exact obligation/chunk set là điều kiện bắt buộc.
- 12 GEN chưa được khẳng định đủ trước khi đo fee.
- .env không thay phiên portal/GitHub OAuth; accepted receipt không chứng minh payout.
- GitHub dùng cho code và fixtures, không là oracle cho bản nộp.

## Điểm cần đóng bằng thực nghiệm

| Điểm | Cách đóng | Hiện tại |
| --- | --- | --- |
| Cùng report nhưng lỗi thuộc A/B khác nhau | G1 multi-validator tests | Chưa chạy |
| Chi phí lưu 8 KiB tổng và full review | Latency/fee/storage measurements | Chưa đo |
| Sender/role/domain/chunk validation | Lint, direct và adversarial tests | Chưa chạy |
| SDK/CLI phù hợp Bradbury | Network config + pinned package smoke test | Chưa chốt version |
| Finality/message transfer | Integration và Bradbury E2E | Chưa chạy |
| Neutral-timeout incentives | Điều khoản UI/README và acceptance upfront | Thiết kế nêu rõ; chưa thử người dùng |
| GitHub của portal khớp tanphung | Kiểm tra đúng phiên portal/ví | Chưa xác minh |
| Hosting public và RPC CORS | Deploy static + anonymous access | Chưa triển khai |
| Tên VeriStep và rename thư mục | Kiểm tra đích, review tên trước publish | Chưa tạo |

## Quan hệ với chỉ dẫn dự án

Bốn tài liệu THREAT-MODEL.md, EVIDENCE-SCHEMA.md, FULL-ARTIFACT-REVIEW.md, ADVERSARIAL-TEST-PLAN.md hiện có bản v0.2 để review trước code theo AGENTS.md.

Canonical provenance của bản đầu là chain/contract/job/stage/revision/sender, xác thực bằng giao dịch và snapshot contract. Nếu thêm external artifact provider sẽ phải áp dụng đầy đủ provider API/signature, redirects và independent refetch gates của AGENTS.md trước khi dùng để settlement.

Tự rà soát tài liệu không thay audit hoặc test. Bản kế hoạch không tự chứng nhận rằng các cổng kỹ thuật đã qua.

Lượt lập kế hoạch: không deploy contract, không ký giao dịch, không đổi tên thư mục hoặc sửa .env. User đã cho phép dùng khóa testnet để thực hiện dự án khi chốt ý tưởng; phần xác minh test và quyền tài khoản thực tế vẫn cần hoàn thành.
# Review addendum v0.4 — 06/09/2026

Self-review before code (not independent audit): compared the failed v1.0 round candidates against the approved requirement that B flag missing information. Clarify explicit coverage in both prompts, bump terms version, retain per-obligation independent comparison, and preserve the exact ambiguous fixture and all historical failures. No change to funds, role authorization, provenance, or full-byte review. Risks: models can still violate the clarified rubric; live stability and adversarial gates remain mandatory and are not yet satisfied.
