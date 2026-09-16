# VeriStep — kế hoạch hoàn thiện để người dùng kiểm tra và tự nộp

Ngày lập: 13/09/2026. Baseline: nhánh `feat/ic-v2-preflight`, commit `19f52ee`.
Trạng thái: kế hoạch thực hiện, chưa phải chứng nhận hoàn thành hoặc cho phép deploy V2.

Tài liệu này là đầu mối cho thứ tự công việc còn lại. Nó thay thế lịch R0–R5 và các mục worker/UX đã lỗi thời trong COMPETITIVE-RELEASE-PLAN.md. Các yêu cầu bảo mật của người dùng và IC-V2-ARCHITECTURE.md vẫn là ràng buộc. Các báo cáo cũ giữ nguyên làm lịch sử, không cộng kết quả V1 thành kết quả V2.

## 1. Sản phẩm và tiêu chí nộp

Giữ tên VeriStep, track Future of Work. Một khách hàng thuê hai worker: A trích xuất từ tài liệu nguồn, B viết từ đầu ra A. GenLayer kiểm tra từng nghĩa vụ đã được chấp nhận và quyết định trách nhiệm, quyền nhận tiền/refund theo điều khoản đã funding.

Điểm trình diễn chính: hai báo cáo có cùng kết luận sai nhưng handoff khác nhau dẫn tới trách nhiệm khác nhau. Thêm trường hợp B có nghĩa vụ kiểm tra nguồn để thể hiện trách nhiệm thay đổi theo điều khoản. Không tuyên bố ý tưởng độc quyền hoặc bảo đảm được panel chấp thuận.

Phân biệt yêu cầu form với tiêu chuẩn chất lượng: form có repository công khai, thông tin dự án, track, logo và website trước review; các yêu cầu IC chặt chẽ, agent thật và UX bên dưới là tiêu chuẩn đã chốt cho VeriStep. Chưa thấy rubric chấm điểm có trọng số được portal công bố trong các lần kiểm tra.

Form đã kiểm tra trong phiên làm việc trước: tên tối đa 120 ký tự; one-liner 180; description 1000; expected outcome 500; logo PNG/JPEG/WebP 128–2048 px, tối đa 2 MB. YouTube và contract links là trường tùy chọn của form. Với sản phẩm này vẫn cung cấp link contract đã xác minh. Repository phải thuộc GitHub liên kết với Portal; đăng nhập gh ở máy không chứng minh liên kết Portal. Người dùng tự quay video, tự kiểm tra cuối và tự submit.

Hạn đã quan sát: 17/09/2026 15:30 UTC, tức 22:30 Việt Nam. Đối chiếu lại form trước bàn giao; không cắt test bảo mật để kịp hạn. Lượt lập tài liệu này web reader không đọc được form động, còn công cụ browser bị lỗi khởi tạo; các giới hạn form trên được lấy từ lần kiểm tra đã ghi trong submission/DRAFT.md, không giả là vừa kiểm tra lại thành công.

## 2. Điểm bắt đầu có bằng chứng

| Phần | Đã có | Còn thiếu |
| --- | --- | --- |
| IC V2 | Lifecycle funding/submission/review/timeout, report, exact receipt comparison | Redirect ẩn chưa kiểm soát được; vòng IC–router–recipient–IC chưa được chứng minh native |
| Test theo checkpoint | 252 Python; 16 router; 74 frontend + 2 receipt; lint/typecheck/build pass | Các thay đổi mới phải chạy lại; số lượng cũ không chứng minh đóng mọi gate |
| StudioNet V2 | Happy và tail-contradiction có review consensus thật; 5 negative cases | Dùng router vô hiệu nên chưa có chứng minh native payout/refund |
| Worker | Có fixture và integration runner | Chưa có A/B tạo sản phẩm thật bằng inference, chạy bền vững trên hosting |
| Frontend | V1 đang public; V2 có code render report/lifecycle | Compare, wizard, routing, timeout reports, pagination, wallet browser E2E V2 |
| Hồ sơ | Logo hợp lệ, public repo, draft cũ | Nội dung và manifest bản cuối đồng nhất; người dùng xem lại |

`.env` có mục OPENAI_API_KEY và được Git ignore. Người dùng đã duyệt tổng trần OpenAI **0,80 USD cho toàn bộ đợt build và kiểm thử**, gồm A/B, thử model và mọi retry. Docker local đã được dọn theo yêu cầu người dùng; môi trường Python/Node, source và báo cáo trong repo còn nguyên. Nếu một integration bắt buộc cần môi trường đầy đủ, đây vẫn là phụ thuộc phải giải quyết; OpenAI worker API không thay thế GenVM hoặc full integration tests.

## 3. Kiến trúc và giao diện dữ liệu

### IC và Equivalence Principle

- Giữ runner hash cụ thể hiện tại; nâng chỉ khi có API chính thức giải quyết được vấn đề, kiểm thử tương thích và cập nhật hash. Không dùng latest/test hoặc sửa SDK cục bộ để tạo kết quả giả tương thích.
- `leader_fn` tải đầy đủ artifact theo manifest đã khóa, xác minh provenance/bytes và đánh giá nghĩa vụ semantic.
- `validator_fn` do protocol gọi phải tải lại và tự đánh giá trước khi xem kết luận leader, sau đó kiểm tra kết luận, lý do và citations của leader. Dùng custom Equivalence Principle hiện tại theo API chính thức; không chọn validator bằng app và không suy ra phiếu bầu từ trạng thái UI.
- Candidate semantic phải có chính xác semantic obligation IDs. IC bổ sung nghĩa vụ deterministic và yêu cầu report cuối có đúng toàn bộ IDs đã funding, mỗi ID đúng một lần.
- Giới hạn hiện tại: 3 artifact SOURCE/A/B; mỗi artifact 1–4096 UTF-8 bytes; tổng tối đa 8192 bytes; report tối đa 32768 bytes. Chỉ plain text, Markdown và JSON nghiêm ngặt. Toàn bộ bytes được hash cũng được đưa vào semantic review; không cắt prefix. Chưa bật chunking; input chia chunk/thiếu chunk không được chấp nhận như artifact đầy đủ.
- Chỉ adapter GitHub commit bất biến. Kiểm tra canonical hostname, owner/repo names và stable IDs, full commit, tree/path/blob, MIME envelope, artifact type, byte length và SHA-256. CID/deployment URL tùy ý nằm ngoài bản này.
- IC lưu source assessments, obligation assessments, findings, reasoning, citations, missing items, score và decision. Frontend kiểm tra schema để render, không tự tạo phân tích.
- Deadline, max_revisions=0, timeout, neutral unwind, fee/bond/penalty và settlement do IC thực thi. Mất API/consensus không được đổi thành lỗi của agent hoặc tự sửa điều khoản.

### Receipt router

Rà soát và sửa nguy cơ đăng ký trước receipt: mapping hiện tại dùng receipt ID toàn cục, caller bất kỳ có thể fund một ID đã biết trước. Chọn namespace theo source contract: `receipts[sourceContract][receiptId]`; khi fund, source lấy từ msg.sender. `release(sourceContract, receiptId)`, `receiptDigest(sourceContract, receiptId)` và `receiptState(sourceContract, receiptId)` đều truy cập cùng namespace. Event release có sourceContract để index không nhập nhằng.

IC chỉ đọc namespace của chính nó ở router đã pin. Router không quyết định người được hưởng hoặc số tiền; nó chỉ thực thi các trường cố định. Cập nhật ABI, IC call encoder, frontend và tests cùng một mốc. Đây là thay đổi router ứng viên chưa public; không ghi đè địa chỉ hoặc dữ liệu V1.

Receipt chỉ được IC xác nhận khi khớp chain, router, source contract, deal, role, sequence, terms hash, decision hash, recipient, amount, settlement kind và RELEASED. Parent finalized không thay cho child execution thành công; retry mất phản hồi phải kiểm tra lại cùng receipt trước khi có hành động gửi tiền khác.

### Worker được hosting

- Người dùng đã chốt hosting chỉ miễn phí. Frontend tiếp tục ở Vercel; mục tiêu worker là Cloudflare Workers + Workflows + D1 trên Free plan, viết TypeScript với adapter runtime riêng. Workflows chạy các bước và chờ giao dịch; D1 lưu checkpoint/quota/journal lâu dài. Không triển khai Railway/PostgreSQL trả phí, không dùng trial trả phí làm nền lâu dài và không cần Docker trên máy người dùng.
- M0 phải kiểm chứng bundle GenLayerJS, signing và workflow nằm trong giới hạn CPU/size của Free plan. Tài liệu hiện ghi 3.000 workflow steps/ngày, 1 GB-month state và giới hạn CPU rất thấp; đo trên runtime thực trước khi hứa đáp ứng. Pricing ghi CPU theo invocation trong khi limits mô tả theo step: áp dụng giới hạn bảo thủ và kiểm chứng thực tế, không giả định sleep reset CPU. Network waiting không tính CPU. Journal bền vững ở D1 vì workflow state hoàn tất chỉ giữ ngắn hạn. Nếu runtime không đủ, tìm free runtime khác hoặc trình đúng phần không khả thi, không tự nâng gói.
- OpenAI Responses API với Structured Outputs, `store:false`, model pin `gpt-5.6-luna`. Giá dùng cho bộ chặn ngân sách là 0,20 USD/triệu input token và 1,20 USD/triệu output token; thay đổi model hoặc bảng giá phải là thay đổi cấu hình có review, không được fallback sang model đắt hơn. Dùng output schema cho sản phẩm công việc, không dùng schema này làm verdict.
- A đọc source và nghĩa vụ A. B đọc đúng artifact A đã finalized cùng nghĩa vụ B; B chỉ nhận source khi nghĩa vụ kiểm tra nguồn yêu cầu. Hai vai trò có hai ví worker riêng; cùng operator thì ghi đúng là cùng operator.
- Ví từ `.env` cục bộ chỉ dùng theo phạm vi test GEN đã được cho phép. Worker hosted dùng ví riêng, hạn mức nhỏ; không đưa funded deployer key lên hosting.
- Artifact xuất bản vào repository evidence công khai chuyên dụng `tanphung/veristep-evidence` (mục tiêu đề xuất, chưa tạo), bằng credential giới hạn repository. Người tạo job phải biết evidence sẽ công khai. Chỉ public source được hỗ trợ trong bản này. Worker ghi commit bất biến, lưu model ID, prompt version, input/output hashes, thời điểm và tx hashes. GitHub credential trên máy không tự trở thành credential hosting.
- Worker journal: QUEUED → A_RUNNING → A_SUBMITTED → A_FINALIZED → B_RUNNING → B_SUBMITTED → B_FINALIZED → REVIEW_PENDING → REVIEW_FINALIZED → SETTLEMENT_PENDING → COMPLETE; các trạng thái lỗi/chờ phải có reason. Worker journal là tiến độ vận hành; trạng thái contract vẫn là nguồn quyết định.
- Queue bền vững dùng Workflows với unique key `(chain, contract, deal, role, revision)` lưu trong D1 và lease/conditional updates để chống hai instance chạy trùng. Lưu output trước publish, commit trước submit, transaction intent/hash trước polling. Sau crash đối chiếu chain, nonce và artifact đã lưu trước khi tiếp tục; không tự ký lại giao dịch có kết quả chưa rõ.
- API tối thiểu: POST `/api/worker-runs`, GET `/api/worker-runs/:id`, POST `/api/worker-runs/:id/resume`, POST `/api/worker-runs/:id/cancel`. Request bắt đầu/resume phải có wallet authorization nonce một lần, expiry, chain/contract/deal/terms hash; xác minh đúng client và job đủ điều kiện. Cancel chỉ ngừng bước chưa gửi, không đảo giao dịch on-chain.
- Giới hạn ban đầu: 1 run đang hoạt động mỗi ví client, 2 run đồng thời toàn service, tối đa 5 run mới/ngày; reserve chi phí tối đa trước mỗi inference và đối soát usage sau đó. Sổ cái dùng nano-USD nguyên, có hard cap `800000000` nano-USD (= 0,80 USD). Request chỉ được gửi sau một cập nhật D1 nguyên tử chứng minh `spent + reserved + worst_case <= cap`; lỗi mất phản hồi sau dispatch giữ nguyên reserve và không tự retry. Hosting đã chốt 0 USD. Giới hạn nội bộ 2.000 workflow steps/ngày, để phần dư cho recovery và tác vụ khác; trước khi nhận job reserve số bước dự kiến dựa trên deadline. Poll có sleep/backoff và tổng step cap mỗi run. Hết quota phải hiển thị tạm dừng, không tự nâng gói; read-only case vẫn mở được. Free tier có thể không phục vụ liên tục khi quá hạn mức, phải thể hiện giới hạn này trong UI.
- Retry 429/5xx có backoff giới hạn; response bị cắt, refusal hoặc sai schema không được publish như sản phẩm hoàn tất. Không reroll một sản phẩm hợp lệ chỉ để biến verdict thành PASS. Phân biệt lỗi vận hành và sản phẩm agent thực sự sai.

## 4. Các mốc thực hiện và điều kiện đi tiếp

### M0 — Khóa baseline và giải quyết phụ thuộc

1. Ghi baseline source/config/manifest, giữ nhánh V2 và tách các file thử nghiệm untracked. Không stage toàn bộ báo cáo thô vì có thể chứa khóa test validator.
2. Cập nhật và review threat model, evidence schema, full-artifact strategy, adversarial test plan trước sửa contract. Chỉ sửa tài liệu có liên quan, giữ một kiến trúc và một release checklist.
3. Spike redirect: kiểm tra SDK/host chính thức và runner được hỗ trợ, dựng test chứng minh wrong-domain redirect bị từ chối trước khi adapter được chứng nhận. Kiểm tra API metadata và SHA-256 chỉ là các lớp ràng buộc bytes, không chứng minh không có redirect ẩn.
4. Spike native integration: tìm môi trường chính thức hỗ trợ đầy đủ GenVM + EVM và finalized receipt reads mà không tái tải bộ model local. Một host giả lập không được tính là full native test. Môi trường remote phải thuộc hạn mức miễn phí; nếu không có phương án đáp ứng thì ghi rõ phụ thuộc còn thiếu, không tự tạo dịch vụ trả phí.
5. Spike Cloudflare Free: tương thích SDK/signing, D1 atomic quota, workflow restart và polling budget. Chuẩn bị config/code trước; khi cần tài khoản Cloudflare của người dùng thì dùng quyền truy cập chính thức, không tạo tài khoản hoặc chấp nhận điều khoản thay họ.

Gate: không đánh dấu redirect/native capability pass bằng mô tả hạn chế. Nếu platform chưa cung cấp primitive bắt buộc, hoàn thiện các phần độc lập và giữ release blocked; muốn thay đổi yêu cầu gốc phải trình bày rõ để người dùng quyết định. Không dùng backend proxy làm bằng chứng rằng IC đã kiểm tra redirect.

### M1 — Hoàn thiện IC/router và hợp đồng dữ liệu frontend

- Viết test tái hiện receipt preemption rồi sửa namespace nêu trên; kiểm tra cùng receipt ID của source khác không chặn hoặc giả mạo source thật.
- Hoàn thiện schema frontend với union VERIFIED / NOT_VERIFIED / MISSING tương ứng report IC. Sửa validateV2Deal đang từ chối mọi source không VERIFIED, khiến timeout report hợp lệ không hiển thị được. Không hạ kiểm tra identity hoặc exact IDs.
- Hoàn thiện lỗi provenance, provider unavailable, malformed model output, deadline/revision và recovery theo funded rules. Mọi report được persist phải là dữ liệu IC hợp lệ; transaction revert chỉ để lại trạng thái trước đó.
- Chạy GenVM lint, direct tests, explicit validator callbacks, router EVM tests, adapter integration và typecheck trước cập nhật các component phụ thuộc.

Gate: mọi test component/adversarial tương ứng thay đổi pass; source hash và ABI mới được lưu. Full native gate vẫn theo M0/M4, không bị thay thế bởi component pass.

### M2 — Worker thật và job mới

- Implement Workers API, Workflows, D1 journal, OpenAI adapter, artifact publisher và signer A/B theo phần 3. Test logic orchestration bằng provider fixtures trước; inference thật chỉ chạy qua hard cap 0,80 USD và được ghi usage vào báo cáo.
- Ba mẫu công việc cùng phạm vi văn bản nhỏ: điều kiện refund, quyền export, điều kiện eligibility. Form thể hiện nghĩa vụ rõ; brief không được tự tạo điều khoản ngầm chưa funding.
- Job mới phải có input/output OpenAI thật, immutable artifact, hai sender đúng, B chờ A finalized và GenLayer review độc lập. Fixture chỉ dùng làm đối chứng hoặc cố tình đưa lỗi đã ghi nhãn.
- Bổ sung health check, run status, queue recovery sau restart, quota/cost ledger và log bỏ secrets. Dừng retry khi cần người vận hành xử lý quyền/credential, không tạo vòng gọi API vô hạn.

Gate: một job mới hoàn thành generation/submission/review bằng service; restart giữa các bước không nộp trùng; public client không thể ép signer gọi địa chỉ/method tùy ý. Hosted uptime được kiểm chứng ở M5.

### M3 — Giao diện hoàn chỉnh và khác biệt dễ thấy

- Giữ direction đã chọn: ivory sáng, chữ navy, cobalt cho hành động chính; sidebar navy; trạng thái có nhãn/icon. Hợp nhất token/component CSS, dùng lại hai ảnh WebP đã có. Hero chỉ ở Overview; job workspace dùng header gọn.
- Trang chính: Overview, Work records có pagination, Compare, và job workspace với Evidence / Review / Settlement / Activity. Không thêm marketplace, token, reputation, appeals hoặc workflow nhiều nhánh.
- Route có page/job/tab/citation riêng; chuyển anchor hoặc cuộn đến finding không làm mất job. Giữ tương thích link V1 cũ bằng route riêng và nhãn version, không đọc job V1 bằng contract V2.
- Wizard: chọn mẫu → source → nghĩa vụ/vai trò → fee/bond/deadline → preview điều khoản bất biến → funding. Người dùng thấy số GEN thông thường; attoGEN/hash/ABI chỉ trong chi tiết kỹ thuật.
- Agent panel thể hiện bước đang chạy, sản phẩm đã tạo, lý do chờ và transaction link. Cấm countdown/votes/progress giả; report loading không hiển thị reasoning tự tạo.
- Compare hiển thị source/A/B, nghĩa vụ, citations và tiền từ hai deal thật. Click citation dùng UTF-8 byte offsets chính xác; diff giúp đọc, không tự gán lỗi.
- Hành động theo đúng vai trò và trạng thái: wrong chain, thiếu wallet, reject signature, insufficient gas, API quota, pending, failed, indexing, timeout, refund và released-awaiting-confirmation đều có cách tiếp tục.
- Motion nhẹ cho handoff, chọn citation và state transition; hỗ trợ reduced-motion. Kiểm tra 390/768/1280/1440 px, không overflow, focus bàn phím, contrast và text dài. Không gọi worker API khi chỉ xem demo.

Gate: người xem không cần ví vẫn hiểu case và tìm receipt; người tạo job đi hết wizard bằng UI; reload/back/forward và trang hơn 50 job hoạt động. UI render được cả report thành công lẫn timeout/thiếu artifact.

### M4 — Kiểm thử đầy đủ và chuẩn bị phê duyệt deploy

Ma trận bắt buộc:

| Nhóm | Tình huống và kết quả yêu cầu |
| --- | --- |
| Full evidence | Prefix đúng/tail sai; UTF-8 nhiều byte; file sát/vượt giới hạn; không chấp nhận review prefix hoặc thiếu chunk |
| Provenance | Sai host/redirect/owner/repo/commit/path/type/length/hash; tree thiếu/truncated, symlink và mutable ref bị từ chối |
| Obligations | Thiếu/trùng/thêm ID, status đúng nhưng citation/reason sai, leader và validator tải bytes khác nhau không được approve |
| Lifecycle | Chưa funding/accept; nộp muộn; revision; A không giao; B không giao; review timeout; neutral unwind; provider unavailable |
| Settlement | Sai deal/source/recipient/amount/kind/chain/sequence; chưa released; preemption; duplicate/reentrancy; recipient revert; crash/retry; conservation |
| Worker | Inference thật, prompt injection không điều khiển signer, quota song song, restart, ambiguous transaction, missing GitHub credential |
| Browser | Wallet thực, job mới, routes/citations, compare, pagination, reject/pending/error/reload và mobile |

Rerun theo thứ tự lint → direct/validator → router/adapter → môi trường integration thật → frontend/typecheck/build/security scan. Tách rõ PASS, expected rejection, FAILED và NOT VERIFIED. Kết quả fail cũ được giữ, không tính lặp lại thành thành công độc lập.

Danh mục case để bàn giao: no-fault, A-fault, B-fault là ba case chính; cả hai lỗi, B-checks-source và timeout/neutral unwind là case bổ sung. Expected outcomes được xác định trước lần chạy; fault injection phải ghi nhãn. Mỗi case có manifest chain/contract/source hash/artifact commits/transactions/report/receipt.

Yêu cầu gốc vẫn áp dụng: không deploy Bradbury V2 trước khi toàn bộ contract tests bắt buộc pass và người dùng xác nhận sau khi xem kết quả. Nếu native vòng đầy đủ chỉ kiểm thử được sau deploy, phải trình phương án probe testnet giá trị nhỏ như một ngoại lệ cụ thể để người dùng duyệt; không mặc định có ngoại lệ hoặc gọi nó là predeploy pass.

### M5 — Phát hành và hồ sơ cuối

- Sau gate và phê duyệt, deploy router/IC Bradbury, kiểm tra chain 4221, source/schema/address, constructor binding, finalized execution và views. Chạy ba case chính và các payout/refund/bond-return thực; IC xác nhận exact released receipts cho mọi leg.
- Triển khai worker ở Cloudflare Free sau feasibility, GitHub evidence credential giới hạn và ví worker riêng. Kiểm chứng một job tiếp tục khi workflow resume và không phụ thuộc terminal/máy local. Người dùng có thể tắt máy sau khi các phụ thuộc hosted hoạt động, trong quota hosting và API đã cấp.
- Vercel preview trước, kiểm tra link public ở phiên chưa đăng nhập; chỉ sau đó đưa release manifest V2 đúng địa chỉ/hash lên production. Một manifest thống nhất cho frontend, demo library và submission. Giữ URL/hồ sơ V1 có nhãn lịch sử.
- Merge/push có chủ đích vì main gắn auto-deploy Vercel. Commit theo mốc; kiểm tra secrets trước push. Release tag gắn đúng commit đã kiểm tra. Rollback frontend/config khả thi, không mô tả rollback UI là đảo giao dịch on-chain.
- Viết lại README và submission/DRAFT.md đúng hành vi V2, xóa khỏi mô tả hiện hành luồng client tự accept để bỏ qua review. Thêm hướng dẫn fresh clone, env.example chỉ tên biến, demo cases, known limits và transaction links. Không yêu cầu reviewer phải cài Docker để xem DApp.
- Handoff gồm URL Vercel public, repository/commit/tag, contract explorer, ba demo case, hướng dẫn thử job mới, kết quả kỳ vọng, nội dung form đúng giới hạn và checklist cho người dùng tự kiểm tra. Logo hiện có dùng lại nếu hiển thị tốt.
- Video do người dùng tự quay và tự quyết định thời điểm; cung cấp kịch bản thao tác và trạng thái sẵn để quay. Không submit, ký Portal hoặc liên kết tài khoản thay người dùng.

Gate cuối: không còn lỗi nghiêm trọng đã biết, các yêu cầu IC bắt buộc đều có bằng chứng, job mới chạy được bằng worker hosted, payout/refund thực được IC xác nhận, giao diện public đúng release, nội dung hồ sơ khớp sản phẩm. Review pass riêng sau implementation không được quảng cáo là audit bên thứ ba. Nếu có người dùng mới tham gia thử, lưu phản hồi thật; không coi agent đóng vai người dùng là đánh giá độc lập.

## 5. Điều kiện bên ngoài và thứ tự ưu tiên

OpenAI đã được chọn; hosting chỉ miễn phí đã được chốt. Người dùng đã duyệt **0,80 USD là tổng trần cho mọi OpenAI call của cả đợt build/test**, không phải mỗi call và không phải giá trọn đời DApp. Không có quyền tự tăng trần hoặc tự đổi sang model đắt hơn. Ngân sách vận hành sau phát hành là khoản riêng: mặc định không cho chạy inference public mới sau đợt thử cho tới khi có allowance rõ; case đã hoàn tất vẫn xem được.

Không thể hứa chắc ngày xong khi redirect và native integration chưa có đường chứng minh đáp ứng yêu cầu. Ưu tiên đóng hai vấn đề đó, đồng thời làm các phần độc lập. Nếu thiếu thời gian, giảm trang trí/analytics/template phụ, không giảm provenance, full review, receipt hoặc giả worker hoạt động.

Checkpoint thực hiện 13/09/2026: bốn design artifacts đã cập nhật; receipt preemption đã được tái hiện và sửa bằng namespace source-contract; IC/router/frontend/worker test đều pass; worker Cloudflare/D1 đã build/dry-run; wizard, Compare, timeout report và agent checkpoint UI đã triển khai. Fresh StudioNet committee run của source hiện tại pass 2 semantic + 5 rejection cases. OpenAI A/B smoke thật đã pass bằng `gpt-5.6-luna`; cả A và B giữ điều kiện provenance cuối, tổng usage đã đối soát là 0,0001722 USD. Request ID 401 cũ không retry và tiếp tục giữ reserve bảo thủ 0,0013742 USD, nên ngân sách khả dụng còn 0,7984536 USD. Hai release gate cố ý còn mở là (1) khả năng chứng minh không có redirect ẩn trong host GenVM và (2) native Bradbury IC→router→recipient→IC receipt round trip. Bradbury deployment vẫn chờ người dùng xem kết quả và xác nhận như đã yêu cầu.

Nguồn: [Portal hackathon](https://portal.genlayer.foundation/agent-tank/hackathon/), [form nộp](https://portal.genlayer.foundation/agent-tank/hackathon/submit/), [giới hạn Studio](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio/limitations), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Cloudflare Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/), [Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). Nguồn repo: IC-V2-ARCHITECTURE.md, V2-CORE-PROGRESS.md, V2-FEASIBILITY.md, source V2 và submission/DRAFT.md.
