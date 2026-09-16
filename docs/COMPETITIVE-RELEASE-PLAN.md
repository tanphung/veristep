# VeriStep — rà soát cạnh tranh và kế hoạch hoàn thiện

> Kế hoạch thực hiện hiện hành từ 13/09/2026: [RELEASE-COMPLETION-PLAN.md](RELEASE-COMPLETION-PLAN.md). Tài liệu mới hợp nhất phần còn thiếu của IC V2, worker OpenAI được hosting, UX, kiểm thử và hồ sơ; thay thế lịch R0–R5 bên dưới. Video và việc nộp do người dùng tự thực hiện. Những phân tích cũ dưới đây giữ làm lịch sử, không phải trạng thái release hiện tại.

Ngày: 09/09/2026, UTC+7. Trạng thái: KẾ HOẠCH HIỆN HÀNH, CHƯA HOÀN THÀNH.

> Cập nhật yêu cầu contract: [IC-V2-ARCHITECTURE.md](IC-V2-ARCHITECTURE.md) là nguồn ưu tiên cho kiến trúc và thứ tự triển khai. Người dùng yêu cầu provenance bên ngoài và receipt confirmation trong Intelligent Contract. Vì vậy đề xuất freeze v1.1/generic frontend verifier bên dưới đã bị thay thế. V1.1 chỉ còn baseline lịch sử. Lịch R0–R5 là ước lượng cũ, phải tính lại sau feasibility gates của v2. Không deploy v2 trước khi toàn bộ contract tests pass và người dùng xác nhận.

Tài liệu này thay thế các thứ tự thực hiện và tuyên bố “chỉ còn nộp” trong kế hoạch/checkpoint cũ. Giữ nguyên lịch sử test và receipt. Đây là rà soát sản phẩm, source frontend, luồng tích hợp và mẫu đối thủ; không phải kiểm toán toàn bộ contract hoặc xác nhận của panel.

## 1. Kết luận và nguồn kiểm tra

VeriStep có nền tảng thử nghiệm kỹ thuật hữu ích nhưng chưa đủ bằng chứng để gọi là một bài dự thi cạnh tranh cao. Trở ngại lớn nhất là khác biệt chưa hiển thị rõ trong sản phẩm, chưa có worker agent thực thi, và trải nghiệm job mới chưa hoàn chỉnh như bản demo đã chuẩn bị. Thêm ảnh hero và animation không đóng được các khoảng trống này.

- Explorer hiển thị 46 dự án thuộc Agent Tank lúc kiểm tra. Đây không phải tổng số đơn đăng ký và không phải số dự án được duyệt cuối cùng: https://portal.genlayer.foundation/builders/explorer/?category=agent-tank
- Tiêu chuẩn người dùng đặt ra: hoàn thiện như một bài cần vượt qua mức tuyển chọn chỉ khoảng 5%. Đây là mức yêu cầu chất lượng cho dự án; không tiếp tục tranh luận về nguồn/tỷ lệ. Luật và lịch chiến dịch tham chiếu: https://portal.genlayer.foundation/agent-tank/hackathon/
- Hạn trang luật hiển thị: 17/09 lúc 15:30 UTC (22:30 UTC+7). Mục tiêu nội bộ bàn giao ngày 15/09 để người dùng tự nộp và còn thời gian xử lý lỗi.
- Các mô tả đối thủ dưới đây do dự án tự khai trên portal; chưa kiểm toán code/giao dịch của họ. Cả ba trang hiện hiển thị IN REVIEW. Rating cộng đồng không được coi là điểm panel.

| Dự án | Điều đã đọc/quan sát | Hệ quả cho VeriStep |
| --- | --- | --- |
| FirstFault | Research → Writer → Publisher; xác định vi phạm vật chất đầu tiên, bằng chứng liên kết, settlement; có demo video và website hoạt động. Trang khai StudioNet, contract đóng băng. | Không quảng cáo “tìm bước gây lỗi” là ý tưởng độc nhất. |
| CausalBond | Nghĩa vụ ban đầu truyền qua mandate có chữ ký và bond; xác định cạnh đánh rơi nghĩa vụ. Trang khai bằng chứng runtime StudioNet. | “Có bond và xác định trách nhiệm” cũng chưa đủ khác biệt. |
| Agent Handoff Verifier | Stage specs, artifact URLs, xác minh handoff và vị trí lỗi; trang có link Bradbury. URL website trả DEPLOYMENT_NOT_FOUND khi kiểm tra. | Phải có demo mở được liên tục và luồng thử rõ; lỗi website quan sát tại một thời điểm không chứng minh toàn bộ dự án kém. |

Nguồn:
- https://portal.genlayer.foundation/builders/explorer/firstfault/
- https://portal.genlayer.foundation/builders/explorer/causalbond/
- https://portal.genlayer.foundation/builders/explorer/agent-handoff-verifier?category=agent-tank
- https://firstfault.vercel.app/
- https://agent-handoff-verifier.vercel.app/

## 2. Hiện trạng có bằng chứng và khoảng trống

| Hạng mục | Hiện trạng | Khoảng trống phải xử lý |
| --- | --- | --- |
| Consensus | Báo cáo lưu 16/16 case StudioNet, 113 step finalized; contract Bradbury và happy path thật | Case sai A/sai B nổi bật chưa được trình bày trực tiếp trên Bradbury demo hiện tại |
| Payout | Claim A demo có finalized receipt và +0.03 GEN; code chỉ nhận đúng bản ghi trong payment-verification.json | Job mới không có cơ chế xác minh tổng quát; B vẫn có credit 0.04 GEN trong demo quan sát |
| Agent | WebMCP đọc hồ sơ và mở form; runner test nộp fixture | Chưa có agent A/B đọc việc, tạo đầu ra và hoàn thành bằng ví riêng; validator AI không phải worker agent |
| UX tạo việc | Một form dài, phải chuẩn bị ba ví và tự dán text; các cửa sổ thời gian cố định 1 ngày | Thiếu hướng dẫn vai trò, draft preview, mẫu công việc, bước tiếp theo và giải thích chi phí |
| Điều hướng | Hash chọn job; list_jobs chỉ lấy 50 mục đầu | CTA mới #live-record làm mất job selection; cần routing riêng và phân trang |
| Giao diện | Production là bản tối cũ. Local có ảnh 3D mới và CSS override | Chữ chồng vùng minh họa, hero quá lớn, chi tiết công việc xuống sâu, ba lớp CSS dễ xung đột |
| Nội dung | Demo mang tên smoke test; “four findings” cố định | B_SOURCE tùy chọn làm số finding thay đổi; đổi tên hiển thị phải giữ tên/id on-chain có thể đối chiếu |
| Kiểm thử | Rerun local hiện tại: 65 frontend + 2 receipt tests PASS; build PASS, JS 762.67 kB trước gzip | Test pass chưa bao phủ CTA mới hoặc chứng nhận UX, trình duyệt MetaMask/Snap thật, thị trường |
| Hồ sơ | Receipt, design docs, submission draft đầy đủ nền tảng | Một số checkpoint nói “chỉ còn nộp” quá sớm; chưa có video cuối và thử với người dùng mới |

Các vị trí đối chiếu: frontend/src/App.tsx, Actions.tsx, client.ts, payment.ts, payment-verification.json, webmcp.ts; docs/VERIFICATION-REPORT.md; reports/bradbury-release/; reports/studionet-sep07probe/.

## 3. Định vị duy nhất xuyên suốt bản tiếp theo

Track vẫn là Future of Work. Tên vẫn là VeriStep. Một khách hàng, một agent trích xuất A, một agent viết B; dữ liệu là tài liệu văn bản nhỏ do các bên thống nhất.

Giá trị cần thể hiện: với báo cáo sai, kiểm tra từng nghĩa vụ đã chấp nhận để phân biệt lỗi đầu vào được truyền tiếp và lỗi mới do người viết tạo ra; thanh toán theo nghĩa vụ và số tiền đã khóa trước. Không khẳng định suy ra mọi nguyên nhân thực tế hoặc chỉ phạt duy nhất bước đầu tiên. Nếu hai bên vi phạm độc lập, cả hai có thể bị xử lý.

Màn demo chủ đạo: hai job có cùng câu kết luận sai nhưng evidence handoff khác nhau → verdict khác vai trò → tiền thay đổi tương ứng. Thêm job bật/tắt nghĩa vụ B kiểm tra nguồn để người xem hiểu rằng trách nhiệm phụ thuộc điều khoản đã chấp nhận. Đây là cách trình bày cần làm tốt; không phải tuyên bố tính năng độc quyền trên thị trường.

Không mở rộng thành marketplace, workflow DAG tổng quát, đa chain, token, reputation chống Sybil, web scraping hay hệ thống appeal mới trong đợt này. Không đổi settlement/rubric để làm đẹp demo.

## 4. Kiến trúc nhất quán

- Contract veristep-1.1 tiếp tục là nguồn quyết định nghĩa vụ, trạng thái, kết quả và tiền. Freeze source/hash hiện tại trong các bước UI và agent.
- Một adapter đọc/verifier dùng chung cho workspace, compare, receipt view và WebMCP. Manifest demo chỉ lưu metadata/ID và link chứng cứ; không ghi đè state live.
- Một cơ chế route phân biệt trang, job, tab và vị trí citation. Anchor cuộn không được thay job hoặc kích hoạt transaction.
- Một transaction layer dùng chung cho mọi write. Ghi intent/hash, resume đúng hash, kiểm tra sender/chain/contract/method/execution/post-state; không tự ký lại khi trạng thái broadcast chưa rõ.
- Agent runner chạy local/server riêng của operator với hai ví A/B, policy theo job và ngân sách. Website Vercel là frontend public; không đưa funded key hoặc model credential vào frontend.
- Client chấp nhận ngân sách/điều khoản trước khi chạy. A chỉ nhận source+task; B chỉ nhận upstream+task trừ khi nghĩa vụ kiểm tra nguồn yêu cầu thêm source. Log lưu input/output/model ID/hash/thời gian, không lưu bí mật hoặc giả reasoning nội bộ.
- Worker inference là phụ thuộc mới, tách khỏi inference của validators. Phải chọn provider và xác minh credential/runtime hợp lệ ở gate đầu. Nếu chưa có, không quảng cáo agent tự sinh nội dung và không tự coi fixture runner là agent.
- Primary hosting: Vercel veristep-genlayer. Sites cũ là lịch sử; không tự publish đổi audience hay xóa site trong bước lập kế hoạch.
- Mọi thay đổi source contract nếu thực sự bắt buộc phải trở thành một quyết định riêng: cập nhật 4 design docs, phiên bản mới, test đầy đủ và giữ nguyên receipts cũ. Không trộn manifest giữa hai contract.

## 5. Tính năng bắt buộc và điều kiện nghiệm thu

### P0 — Comparative evidence workspace (tính năng nổi bật)

- Thư viện case: A gây lỗi, B gây lỗi, không lỗi, cả hai lỗi, nghĩa vụ kiểm tra nguồn, kết quả chưa thể kết luận nếu có evidence thật.
- Chọn hai case để so sánh Reference/A/B, nghĩa vụ, findings và tiền trên cùng màn hình.
- Click finding làm nổi đúng đoạn trích bằng byte offset được giải mã UTF-8 đúng. Diff văn bản chỉ là hỗ trợ đọc, không tự kết luận lỗi.
- Các nhánh/handoff hiển thị kết quả theo assessment thật; không suy diễn phiếu validator hoặc nguyên nhân ngoài contract.
- Nghiệm thu: người chưa biết dự án chỉ ra được vì sao A hoặc B chịu trách nhiệm trong tối đa 2 phút, không đọc GitHub và không kết nối ví.
- Case StudioNet lưu trữ phải ghi rõ chain/nguồn và tách với live Bradbury. Ưu tiên chạy lại ba case chủ đạo trên Bradbury bằng manifest riêng, giữ mọi lần thất bại.

### P0 — Agent A/B có thể chạy thực tế

- Một lệnh local nhận job ID đã được phê duyệt, đọc accepted terms, chạy A, chờ finalized handoff, chạy B từ đúng upstream và nộp bằng đúng ví.
- Kết quả generate được preview trước chế độ ký lần đầu. Auto-run chỉ trong job/phạm vi giá trị đã cho phép; không nhận lệnh điều khiển từ nội dung source.
- Runner có trạng thái chờ, dừng, tiếp tục; crash rồi resume không phát sinh nộp/claim trùng. Không mô tả hai ví của cùng operator là hai tổ chức độc lập.
- Nghiệm thu: một job mới có output inference thật, ID model và input/output hash, hai sender đúng; transcript có thể kiểm tra. GenLayer đánh giá output độc lập với worker generation.
- Giới hạn thời gian spike: nửa ngày kiểm chứng provider, khóa cục bộ và transaction adapter. Thiếu phụ thuộc phải báo đúng blocker, không âm thầm đổi thành hardcoded demo.

### P0 — Xác minh settlement cho job mới

- Viết verifier nhận job/role/claim hash bất kỳ; kiểm tra parent finalized+execution, message đúng recipient/amount và liên kết tới execution thanh toán.
- Balance delta chỉ là chứng cứ bổ trợ và phải xét giao dịch khác trong block. Không suy ra payout chỉ từ số dư tăng.
- Cache receipt có identity/chain/contract/hash rõ và kiểm tra lại khi đọc. Sai/mất/thiếu liên kết → trạng thái chờ/chưa xác minh, không xanh giả.
- Spike trước UI: kiểm chứng API Bradbury có cung cấp đủ liên kết cho claim bất kỳ không. Nếu không đủ, giữ trạng thái chưa xác minh và quyết định kiến trúc rõ ràng; đây là gate chưa đạt, không tự thêm router hay redeploy contract.
- Nghiệm thu: ít nhất hai job, hai recipient khác nhau, có cả payout/refund khi phù hợp; sai recipient/amount/hash bị từ chối; tiền đã nhận không bị cộng thành credit có thể rút lần hai.

### P0 — Journey tạo và hoàn thành việc

- Wizard: chọn mẫu → source/task → ví và nghĩa vụ → phí/bond/tổng nộp → preview bất biến → ký.
- Ba mẫu phù hợp cùng rubric hiện tại: chính sách export, điều kiện refund, điều kiện eligibility; không mở lời hứa arbitrary workflow.
- Các trang Overview, Work records, Compare, job workspace với tab Evidence / Review / Settlement / Activity. Gộp phần ít dữ liệu; không tạo menu không có chức năng.
- Job workspace dùng header gọn; hero đầy đủ chỉ ở Overview. CTA theo đúng vai trò và state. Hết hạn hiển thị hành động hợp lệ.
- History theo receipt có trạng thái và link; list records phân trang qua 50 mục, không chỉ history trong thiết bị.
- Nghiệm thu: cold load, đổi job, back/forward, refresh, mở citation, sai chain/account, không có wallet, reject signature, pending/error đều kiểm tra trong browser thật.

## 6. Thiết kế và chuyển động

Direction: nền ivory/sáng, chữ xanh đen, cobalt cho primary action; sidebar xanh đen. Lime chỉ là chi tiết thương hiệu, coral dùng có tiết chế. Status dùng màu riêng kèm nhãn/icon.

- Tách vùng typography và minh họa trong hero, giới hạn tiêu đề/chiều cao; không đặt copy trên chi tiết ảnh. Mobile phải thấy CTA trước khi cuộn quá nhiều.
- Ảnh handoff mới là bản concept, cần crop/optimize WebP/AVIF và xem lại ở đúng layout; không mặc nhiên coi asset đã được người dùng duyệt.
- Font body mặc định 16px; meta tối thiểu 12px; controls tối thiểu 44px; contrast body mục tiêu 4.5:1. Không ép mọi thông tin thành pill/card.
- Tokens chung cho color/spacing/type/radius; component CSS có scope. Hợp nhất styles.css/workspace.css/redesign.css có chủ đích, không tiếp tục chồng override.
- Animation ưu tiên thể hiện handoff đang chọn, mở finding, highlight citation và trạng thái pending thật. Decorative motion ngắn, nhẹ; có pause nếu vòng lặp dài, reduced-motion tắt, không giả live review/vote.
- Mục tiêu đo: hero tối đa khoảng 300 KB nếu chất lượng cho phép; màn đọc không tải sẵn toàn bộ wallet SDK; test mobile production LCP mục tiêu ≤2.5 giây theo điều kiện đo được công bố. Đây là mục tiêu chưa đạt, không phải số đo hiện tại.
- QA viewport 390/768/1280/1440, keyboard/focus, giảm chuyển động, loading/error/empty/long text. So sánh cùng viewport, không lấy desktop ClauseFlow đối chiếu mobile VeriStep rồi suy ra ưu thế.

## 7. Trình tự thực hiện và gate chống xung đột

| Mốc | Dự kiến | Đầu ra | Gate đi tiếp |
| --- | --- | --- | --- |
| R0 Baseline & feasibility | 09–10/09 | Phân loại local edits, snapshot/branch an toàn; spike agent provider và generic payout; sửa tiêu chí success | Hai phụ thuộc quan trọng khả thi hoặc blocker ghi rõ; không còn tuyên bố “xong hết” |
| R1 Product & design | 10–11/09 | IA/route, tokens, Overview + job + Compare ở desktop/mobile; sửa hash collision | Preview local rõ, hoạt động cơ bản, không mix light/dark; định vị thống nhất |
| R2 Functional completion | 11–13/09 | Agent runner, compare thật, generic receipt verifier, wizard và state UX | Job mới chạy được; không cần thêm hardcoded proof mỗi job; tests đúng rủi ro |
| R3 Network & usability | 13–14/09 | Bradbury cases A-fault/B-fault/no-fault, payout/refund; browser wallet E2E, fault recovery | Kết quả đúng với expected trước khi chạy; lưu attempts/failures; không bỏ gate khi RPC chậm |
| R4 Release freeze | 14–15/09 | Bundle tối ưu, browser QA, docs khớp, video 90–120s, version/commit deploy rõ | Mọi P0 đạt; fresh-clone instructions dùng được; không còn critical/high bug |
| R5 User review/submission buffer | 15–17/09 | Bàn giao URL + draft + video + evidence; user tự submit | Người dùng kiểm tra, xác nhận GitHub portal, nộp trước deadline |

Đây là lịch dự kiến, không hứa chắc vì consensus, provider credential và browser wallet có phụ thuộc ngoài repo. Nếu chậm, cắt trang analytics, motion trang trí, export bổ sung trước; không cắt kiểm chứng tiền/agent nhưng vẫn giữ lời quảng cáo tương ứng.

Workflow Git: hiện có local edits Vercel docs và visual prototype. Lưu hai nhóm riêng, dùng nhánh release cạnh tranh trước thay đổi tiếp; không git reset/xóa history. Một mốc một commit có phạm vi rõ. Không push main giữa bước UI thử nghiệm vì Vercel đã liên kết GitHub và push có thể tự deploy.

Schema và adapters trước → components → browser QA → hồ sơ. Thay đổi architecture phải ghi decision, ảnh hưởng test/docs, lý do; không vừa đổi contract vừa redesign và đổi SDK trong một commit. Không nâng SDK chỉ để theo bản mới khi integration hiện tại đang hoạt động.

## 8. Tiêu chuẩn được phép nói “sẵn sàng để bạn kiểm tra và nộp”

- [ ] Người xem hiểu đúng ai dùng, nguồn chứng cứ là gì và tại sao cần GenLayer trong 30 giây.
- [ ] Compare cho thấy hai case sai cùng kết luận nhưng trách nhiệm khác bằng receipt/state thật.
- [ ] Agent A/B tạo output và nộp một job mới; retry/recovery và giới hạn quyền được kiểm chứng.
- [ ] Generic payment verification hoạt động ngoài golden demo; mọi lời khẳng định nhận tiền có proof đúng.
- [ ] Luồng browser wallet thực tế được kiểm thử hoặc ghi chính xác điểm còn cần người dùng kiểm tra; không gọi provider test là chứng nhận Snap.
- [ ] Visual desktop/mobile nhất quán, CTA không lỗi, keyboard/contrast/motion đạt checklist.
- [ ] Regression suite hiện có không giảm yêu cầu; tests mới tập trung routing, agent resume, claim identity và network failures.
- [ ] Cold-load production, direct links, assets và RPC đều hoạt động; không đăng nhập hosting.
- [ ] Số liệu trong UI/README/submission/video khớp chain, source hash, ngày và manifest.
- [ ] Có video tương tác thật; phân biệt footage live, case replay, prepared fault injection và đoạn tua thời gian.
- [ ] Ít nhất 3 lượt thử bởi người mới nếu có người tham gia: xem case, giải thích trách nhiệm, tìm receipt; lưu vấn đề thật và sửa. Agent tự đóng vai người dùng không được tính là người kiểm thử bên ngoài.
- [ ] Không tuyên bố odds thắng hoặc được team chấp thuận từ kết quả tự kiểm thử.

## 9. Điểm tiếp tục chính xác

Local preview: http://127.0.0.1:5174/#job=bradbury-happy-a5bc7d15

Production hiện tại: https://veristep-genlayer.vercel.app/#job=bradbury-happy-a5bc7d15 (bản cũ; redesign chưa publish).

Ở lượt lập kế hoạch này chỉ đọc/đánh giá, mở preview, chạy npm test/build và ghi kế hoạch. Không gửi giao dịch mới, không deploy thêm, không sửa code chức năng từ các phát hiện trên. R0 là công việc tiếp theo; mọi mục chưa tick vẫn là chưa hoàn thành.
