# VeriStep — Kế hoạch xây và nộp Agent Tank Hackathon

> Kế hoạch gốc được giữ làm lịch sử. Từ 09/09/2026, dùng [kế hoạch hoàn thiện cạnh tranh](COMPETITIVE-RELEASE-PLAN.md) cho phạm vi, thứ tự công việc và điều kiện bàn giao hiện hành.

Ngày kiểm tra: 05/09/2026 · Múi giờ: UTC+7

Trạng thái khi lập kế hoạch: đề xuất sản phẩm; chưa triển khai contract, chưa nộp bài. Xem RESUME.md để biết tiến độ hiện tại.

Thư mục được chỉ định ban đầu: D:\app genlayer\New folder. Sau khi chốt ý tưởng đã đổi thành D:\app genlayer\VeriStep.
Track đề xuất: Future of Work.

## 1. Quyết định sản phẩm

**VeriStep xác minh trách nhiệm ở từng bước bàn giao của một công việc viết báo cáo, rồi phân bổ tiền công và tiền bảo đảm theo quy tắc đã thống nhất.**

MVP có một khách hàng và hai người thực hiện: người trích xuất thông tin và người viết báo cáo. Người thực hiện có thể dùng AI; dApp không đòi hỏi người dùng biết cách vận hành agent. Địa chỉ ví chỉ xác định bên chịu trách nhiệm cho phần việc đã nhận.

Đây là lựa chọn tiếp tục phát triển VeriStep với phạm vi hẹp hơn. Không cam kết giải thích mọi nguyên nhân của mọi workflow. Chỉ xét việc tuân thủ các nghĩa vụ cụ thể, dựa trên tài liệu và sản phẩm đã khóa phiên bản trực tiếp trên-chain. Tài liệu nguồn là căn cứ các bên đồng ý sử dụng, không phải một sự thật ngoài đời được hệ thống tự xác thực. Không dùng tỷ lệ điểm chủ quan 8/10 hoặc 9/10 trước đây làm bằng chứng về khả năng thắng.

Khách hàng dự kiến: nhóm sản xuất báo cáo có nhiều người hoặc nhiều dịch vụ AI tham gia. Nhu cầu thị trường hiện là giả thuyết; chưa có khách hàng trả tiền hoặc người dùng bên ngoài được xác minh.

### Tình huống demo chủ đạo

Khách hàng yêu cầu tóm tắt chính sách tính năng của một sản phẩm dựa trên tài liệu được chỉ định. Ví dụ tài liệu nói chức năng xuất dữ liệu phải được duyệt và không áp dụng cho bản dùng thử.

- Bước A phải trích xuất cả tính năng và các điều kiện/ngoại lệ.
- Bước B phải viết trung thực từ bản trích xuất, giữ các điều kiện và đánh dấu chỗ thiếu thông tin.
- Bước B không mặc nhiên chịu trách nhiệm kiểm tra nguồn gốc nếu hợp đồng không giao nghĩa vụ đó.

Hai job demo tạo ra cùng một kết luận sai: “Bản dùng thử được xuất dữ liệu ngay”.

- Job 1: A đã trích sai; B truyền đạt đúng bản A giao. Lỗi thuộc A theo nghĩa vụ đã ký.
- Job 2: A trích đúng; B tự bỏ điều kiện. Lỗi thuộc B.
- Job 3: dữ kiện/bằng chứng không đủ để xác định vi phạm. Kết quả phải là chưa thể kết luận, không tự chọn một người để phạt.

Giám khảo có thể xem tài liệu, bản A, bản B và các điều khoản được viện dẫn. Những tình huống được tạo có chủ đích phải ghi rõ là bộ thử; phán quyết và giao dịch được thực thi thật, không hardcode.

### Quyết định giảm phụ thuộc bên ngoài

Nguồn, bản trích A và bản viết B là các văn bản nhỏ được đăng ký trực tiếp qua giao dịch vào contract. Mỗi bản có issuer wallet lấy từ sender, job/stage ID, revision, full-byte SHA-256 và độ dài. B bind đúng ID bản giao của A. Contract lưu đầy đủ nội dung bất biến để tất cả validators có cùng căn cứ.

GitHub chỉ phục vụ source code và test fixtures của bài nộp; không nằm trên đường quyết định của review. MVP không gọi GitHub API hoặc website khác để lấy bằng chứng khi phân xử. Tính thật của thông tin ngoài tài liệu đã thống nhất là ngoài phạm vi; không dùng sản phẩm để gắn nhãn claim ngoài đời là đúng/sai.

Nếu về sau thêm nguồn web, phải bổ sung provenance adapter và kiểm thử theo quy tắc external-evidence trong AGENTS.md trước khi bật nguồn đó.

### Vì sao dùng GenLayer

Phần cần đồng thuận là diễn giải nghĩa vụ và kiểm tra việc giữ nguyên ý nghĩa, điều kiện, ngoại lệ giữa các tài liệu. Kiểm tra hash, số byte, người gửi, thời hạn và số tiền là logic xác định.

GenLayer chịu trách nhiệm về kết quả đánh giá có tác động tới tiền trong contract. Backend hoặc frontend không được cung cấp một kết luận đã tính sẵn để contract đóng dấu.

Tài liệu chính thức liệt kê việc xác định người tham gia gây lỗi trong workflow là một ứng dụng phù hợp. Đây là cơ sở về độ phù hợp công nghệ, không phải lời hứa ban tổ chức sẽ chấp nhận. [Use cases](https://docs.genlayer.com/understand-genlayer-protocol/typical-use-cases)

## 2. Đối chiếu cạnh tranh và điều kiện hackathon

Ở lần kiểm tra hiện tại, trang builds hiển thị 11 dự án. Các mô tả gồm VeriGrant, Synq, recourse, AgentMandate, MeaningNonce, Gotham-like justice/scanning, commerce escrow và các hướng khác. Chưa thấy mô tả nào nêu rõ phép thử hai job cùng đầu ra nhưng lỗi thuộc hai bước khác nhau. Đây chỉ là so sánh với nội dung đã nhìn thấy, chưa phải kết luận không có đối thủ trên thị trường.

| Dự án/nhóm đã xem | Chỗ giao nhau | VeriStep phải chứng minh thêm |
| --- | --- | --- |
| GitDrip | AI đánh giá công việc và tiền | Trách nhiệm từng lần bàn giao, thay vì điểm đóng góp |
| Gotham Court | Bằng chứng hai bên, phán quyết | Nghĩa vụ và dependency cố định trước công việc; không có betting |
| VERIDIAN | Đánh giá tài liệu và nguồn | Trách nhiệm theo phạm vi công việc, không chấm độ đúng của mọi claim |
| VeriGrant / freelance escrow / Synq | Kiểm tra sản phẩm và trả tiền | Phân biệt lỗi đầu vào với lỗi tạo thêm ở bước sau |
| AgentMandate / MeaningNonce | Quyết định đối với hành động AI | Đánh giá sản phẩm đã bàn giao, không cấp quyền hoặc chống diễn đạt lại yêu cầu |
| recourse | Hoàn tiền | Giữ công và bond cho bước đã làm đúng; quy trách nhiệm theo nghĩa vụ |

Nguồn cạnh tranh: [Builds](https://portal.genlayer.foundation/agent-tank/hackathon/builds/).
Tham khảo kết quả cuộc thi cũ, không dùng làm rubric cho cuộc thi mới: [Bradbury winners](https://portal.genlayer.foundation/hackathon-winners/).

Theo các trang hiện tại:

- Một dự án trên mỗi tài khoản, chỉnh sửa được trước khi đóng cổng.
- Chọn một trong sáu track; kế hoạch chọn Future of Work.
- Repository GitHub phải công khai và thuộc tài khoản GitHub liên kết trên portal.
- Website bắt buộc trước review; hồ sơ phải có mô tả và đường dẫn kiểm chứng.
- Đóng cổng: 17/09/2026 15:30 UTC, tức 22:30 UTC+7.
- Mục tiêu nội bộ: nộp bản hoạt động trước 15/09, còn 16–17/09 dự phòng.
- Chưa tìm thấy rubric có trọng số chi tiết trong các trang đã kiểm tra. Các quality gate dưới đây là tiêu chuẩn tự đặt của dự án.

Nguồn: [Hackathon](https://portal.genlayer.foundation/agent-tank/hackathon/), [Submit](https://portal.genlayer.foundation/agent-tank/hackathon/submit/).

## 3. Kiểm tra môi trường đã thực hiện

| Hạng mục | Kết quả thực tế | Ý nghĩa |
| --- | --- | --- |
| Thư mục đích | Có .env và AGENTS.md | Chưa có source dự án cần kế thừa |
| Private key | Đọc cục bộ, định dạng hợp lệ, suy ra được địa chỉ | Không in khóa hoặc đưa vào browser |
| Bradbury | Node.js RPC trả chain ID 4221 | Kết nối mạng theo đường Node hoạt động |
| Số dư | 12.003823085908386412 GEN tại lúc kiểm tra | Chưa chứng minh đủ mọi phí deploy, review và demo |
| Giao dịch đã gửi | 0 | Các kiểm tra đến hiện tại chỉ đọc |
| GitHub CLI | Đăng nhập tanphung thành công ngoài sandbox | Có thể chuẩn bị repo dưới tài khoản đó; liên kết portal chưa xác minh |
| Node / npm | 24.15.0 / 11.12.1 | Có runtime cho frontend và deploy scripts |
| Python mặc định | 3.14.5 | Sẽ tạo môi trường riêng; smoke test tính tương thích trước |
| GenLayer CLI | 0.39.2 | Không tự coi tương thích mọi network/RC |
| Python packages | genlayer-test 0.29.2; genvm-linter 0.11.0; genlayer-py 0.16.3 | Có sẵn, chưa chạy bài thử contract mới |
| Python RPC | HTTP 403 | Node.js gọi cùng RPC được HTTP 200; dùng Node cho deploy |
| uv | Cache mặc định bị hạn chế quyền trong sandbox | Đặt cache trong vùng dự án khi cần môi trường mới |
| Portal ở browser | Chưa kết nối ví | Key hợp lệ không đồng nghĩa đã có phiên portal/GitHub OAuth |
| Hosting | Có khả năng Sites trong phiên công cụ | Chưa tạo site, chưa xác minh URL public và truy cập ẩn danh |

Không thay đổi .env, không đổi tên thư mục, không tạo repository từ xa hoặc upload khóa trong bước lập kế hoạch.

## 4. Phạm vi phiên bản nộp bài

### Chức năng phải có

1. Tạo job: tài liệu nguồn, câu hỏi/yêu cầu, hai ví nhận việc, nghĩa vụ mỗi bước, phí/bond, thời hạn.
2. Hai bên nhận việc và khóa tiền bảo đảm. Điều khoản không đổi sau khi job active.
3. A nộp artifact; B nhận đúng phiên bản A để làm tiếp.
4. B nộp artifact; mọi lần bàn giao có ví gửi, job/stage ID, revision bất biến và hash của toàn nội dung.
5. Khách hàng xác nhận hoặc yêu cầu review trong cửa sổ đã quy định.
6. Contract đọc/kiểm tra toàn bộ bằng chứng, đánh giá mỗi obligation và tạo kết quả đồng thuận.
7. Tính khoản được nhận theo công thức cố định; chủ khoản nhận gọi rút.
8. Theo dõi giao dịch và chứng minh tiền đã được chuyển; xem lịch sử review công khai.

### Giới hạn giúp hoàn thành được

- Chỉ một workflow hai bước; không xây marketplace hoặc workflow engine tổng quát.
- Chỉ văn bản UTF-8 nhỏ: Markdown, plain text, JSON theo schema; giao trực tiếp vào contract.
- Bộ bằng chứng tối đa 8 KiB tổng, tối đa 4 KiB mỗi artifact; quá giới hạn thì từ chối trước review. Các mức này cần đo chi phí lưu trữ trong G1.
- Một nguồn chứng cứ: nội dung bất biến trong chính contract, đăng bởi đúng vai trò; không nhận URL làm bằng chứng settlement.
- Một chain cho settlement: Bradbury test GEN.
- Không yêu cầu OpenAI API key riêng cho phần phán quyết; sử dụng LLM của GenLayer validators.
- Không có slash theo “phần trăm lỗi AI tự nghĩ ra”. Số tiền phạt đã thống nhất trước.
- Không quảng cáo reputation chống Sybil. Bản đầu chỉ lưu lịch sử kết quả theo ví.
- Appeal giao thức chỉ tích hợp khi SDK/network hiện tại hỗ trợ và đã test; chưa có nút không hoạt động.
- Video và các tính năng tiện ích không thay thế cổng kiểm chứng contract.

## 5. Quy tắc tiền và trạng thái

Gọi F_A, F_B là tiền công; B_A, B_B là bond; P_A, P_B là tiền phạt cố định với 0 ≤ P_i ≤ B_i. Người nhận việc thấy và chấp nhận các số này trước khi job active.

| Kết quả mỗi bước | Khách hàng được ghi có | Người thực hiện được ghi có |
| --- | --- | --- |
| Hoàn thành đúng nghĩa vụ | 0 | F_i + B_i |
| Vi phạm được chứng minh | F_i + P_i | B_i − P_i |
| Chưa thể kết luận khi hết hạn xử lý | F_i | B_i |

“Cùng lỗi” nghĩa là cả A và B đều có vi phạm độc lập thuộc trách nhiệm đã nhận. Việc B trung thực dùng đầu vào sai không tự động thành vi phạm của B.

Bản MVP dùng hủy trung lập cho phần chưa kết luận được: trả lại vốn cho người đã nộp, không phạt hoặc ghi lỗi danh tiếng. Đây là đánh đổi rõ ràng: có thể làm người thực hiện mất tiền công khi bằng chứng không đủ. Cần mô tả trong điều khoản; chưa phù hợp công việc giá trị cao.

Các nhánh bắt buộc khác: không đủ người nhận việc; A/B bỏ nộp; thời hạn trễ; khách hàng im lặng; review lỗi hạ tầng; hủy trước active. Nhánh nào xảy ra được quyết định bằng state và thời gian của contract, không bằng LLM.

State machine dự kiến:
DRAFT → FUNDED → ACTIVE → A_SUBMITTED → B_SUBMITTED → REVIEWABLE → RESOLVED → CLAIMABLE.
Nhánh phụ: CANCELLED, TIMED_OUT, REVIEW_UNAVAILABLE; trạng thái chuyển tiền theo từng claim là REQUESTED / PENDING / CONFIRMED / FAILED_OR_UNKNOWN.

Các tên trên là thiết kế ứng dụng, không phải status có sẵn của GenLayer.

Invariant: tổng nghĩa vụ với người dùng + số tiền đang gửi đi không vượt tổng tiền nhận còn chưa thanh toán. Mọi credit/debit, refund, penalty có job ID và settlement ID. Claim lặp lại không tạo thêm tiền; frontend không tự tăng số dư.

Tiền gửi vào contract và phí giao thức là hai mục riêng. Số dư ví phải đủ cả hai. Phải xác minh finality và việc thực thi message chuyển tiền; receipt ACCEPTED đơn thuần không phải thanh toán thành công. [Value transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers), [Finality](https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/finality).

## 6. Kiến trúc và thiết kế màn hình

| Thành phần | Phạm vi |
| --- | --- |
| Intelligent Contract | Job, nghĩa vụ, người gửi, evidence commitments, review, ledger, eligibility, settlement messages |
| Reviewer trong GenVM | Đọc snapshot bằng chứng on-chain, kiểm tra issuer/hash/toàn nội dung, đánh giá nghĩa vụ và đối chiếu độc lập |
| Frontend React + TypeScript + Vite | Kết nối ví EIP-1193, form, timeline, hiển thị evidence và kết quả đã xác minh |
| Node.js scripts | Preflight, deploy, tạo ví demo riêng, gửi artifact bằng đúng ví, chạy E2E và lưu receipt |
| GitHub public repo | Source code, evidence fixtures công khai và hướng dẫn; không chứa .env; không là oracle cho verdict |
| Sites static hosting | Website public; kiểm tra hoạt động ẩn danh và RPC CORS trước khi chốt |
| Test tooling | pytest/genlayer-test; Vitest; browser tests; các phiên bản pin trong lockfiles |

Python ưu tiên môi trường 3.12 riêng để giảm rủi ro hỗ trợ package. Phiên bản thực tế chỉ pin sau smoke test. CLI/SDK stable và RC không được trộn tùy ý. Tài liệu hiện phân biệt v0.6 RC/Studio-dev với stable; phải kiểm tra network trước khi chọn release family. [Migration guide](https://docs.genlayer.com/developers/consensus-v06-migration).

Màn hình cần có:

- Trang giới thiệu: một câu giải thích, minh họa hai bước, mở case thật đã finalize.
- Danh sách job và form tạo job theo template.
- Workspace job: nguồn → trích xuất A → bản viết B, người chịu trách nhiệm và hạn nộp.
- Review: từng obligation, nguồn/chunk được trích dẫn, trạng thái kiểm chứng và kết luận.
- Thanh toán: tiền công, bond, khoản phạt, khoản được rút, receipt từng khoản.
- “Try a new case”: thực hiện luồng mới có ví; “View verified case”: xem dữ liệu thật không cần ví.

Không hiển thị LLM đang suy nghĩ hoặc vote của validator nếu RPC không cung cấp dữ liệu đó.

## 7. Kế hoạch theo giai đoạn và cổng kiểm chứng

Các ngày là mục tiêu tiến độ, phụ thuộc giờ bắt đầu và khả năng network. Không tạo automation nền hoặc giả định agent tự chạy khi phiên đã kết thúc.

| Giai đoạn | Mục tiêu ngày | Công việc và đầu ra | Điều kiện đi tiếp |
| --- | --- | --- | --- |
| G0 — Chốt đặc tả | 05–06/09 | Kế hoạch này; bốn tài liệu bảo mật; 8 tình huống có expected outcome; kiểm tra tên/thư mục | Nghĩa vụ, nguồn và bảng tiền không còn nhánh mơ hồ |
| G1 — Chứng minh phần khó | 06–07/09 | Contract thử nhỏ trên môi trường test; nộp/đọc đủ văn bản on-chain; review hai case A/B; một vòng nhận và gửi GEN thử | Consensus phân biệt A/B; signer/version/hash đúng; message thanh toán xác minh được |
| G2 — Contract hoàn chỉnh | 07–09/09 | State machine, ledger, nhận việc, review, timeout, claims; lint và direct/adversarial tests | Không double-claim; bảo toàn tiền; lỗi bằng chứng không dẫn đến phạt sai |
| G3 — Giao diện tích hợp | 09–11/09 | Các màn hình chính, kết nối ví, transaction tracker, template job | Người dùng mới đi hết luồng; reload không mất receipt; trạng thái đúng |
| G4 — Bradbury E2E | 11–13/09 | Deploy chính thức bản dự thi; ba ví thử khác nhau; chạy 3 case chính; lưu source hash/schema/receipt | Mọi kết quả và chuyển tiền có bằng chứng finalized; frontend dùng đúng contract |
| G5 — Đóng gói bài nộp | 13–15/09 | GitHub public, website public, README, video 60–90 giây, toàn bộ form draft | Giám khảo truy cập ẩn danh, làm theo hướng dẫn được; không có khóa trong bundle |
| G6 — Nộp và dự phòng | 15–17/09 | Gửi bài; lưu ID/URL/trạng thái; sửa lỗi cần thiết trước deadline | Portal hiển thị bài đã gửi; trạng thái review ghi đúng thực tế |

### G1 là phép thử quyết định, không chỉ là “deploy Hello World”

Tập kiểm chứng ban đầu có 8 case: A lỗi, B lỗi, cả hai lỗi độc lập, không lỗi, thiếu dữ liệu, ngữ nghĩa mơ hồ, injection ở cuối artifact, sai signer/version/hash.

- Kiểm thử mock tất cả; mock không được tính là đã chứng minh multi-validator consensus.
- Chạy lặp lại ít nhất ba lần cho A lỗi, B lỗi và không lỗi trong môi trường consensus thật phù hợp.
- Chạy negative tests cho nội dung bị thay đổi, sai phiên bản/issuer và kết luận thiếu căn cứ. Lỗi RPC không được biến thành vi phạm nội dung.
- Ghi số lần thử, kết quả, số vòng/retry nếu đọc được, độ trễ, chi phí lưu văn bản và phí review.
- Mục tiêu trước khi làm UI hoàn chỉnh: không có trường hợp rõ ràng bị phạt nhầm; tất cả case rõ ràng finalize thành công trong giới hạn retry được công bố.
- Nếu không đạt: sửa rubric/evidence size và chạy lại tập cố định. Không nới validator cho qua hoặc coi kết quả sai là thành công.
- Nếu đến hết G1 vẫn không ổn định: giữ lại kết quả kỹ thuật, báo rõ vấn đề và điều chỉnh phạm vi trước khi tiếp tục tốn phí.
- Studio không chứng minh được toàn bộ hành vi EVM transfer của Bradbury; trước bản deploy dự thi cần kiểm chứng khác biệt đó trên Bradbury sau các test bắt buộc.

G0 bao gồm rà soát bốn tài liệu được yêu cầu trong AGENTS.md. Bản tự rà soát không phải audit độc lập; ghi rõ người thực hiện, ngày và vấn đề còn mở.

## 8. Ngân sách và mức tự động hóa

PRIVATE_KEY được đọc cục bộ bởi Node.js deploy runner, không truyền qua command-line, không import vào browser, không upload lên hosting. .env và key ví demo được ignore; artifacts nộp bài chỉ chứa địa chỉ công khai và transaction hash.

Đề xuất kiểm soát ngân sách:

- Đo phí bằng phiên bản SDK phù hợp và branch profile.
- Mọi giao dịch đều có chain guard 4221, địa chỉ contract allowlist và kiểm tra số dư.
- Demo dùng chính ví người dùng làm client và hai ví test riêng cho A/B; không dùng cùng một ví để giả ba người.
- Tiền bond/fee của demo nhỏ, xác định sau estimate; test GEN có thể cần nhận thêm từ faucet.
- Giữ lại ít nhất 6 GEN trong ví nguồn trong giai đoạn thử ban đầu; tổng chuyển đi và phí của giai đoạn này tối đa phần số dư còn lại. Đây là giới hạn vận hành đề xuất, không phải ước lượng phí mạng.
- Sau G1, lập ngân sách các giao dịch còn lại từ số đo. Không gọi thử lặp vô hạn hoặc tiêu toàn bộ ví.

Có thể tự xử lý source, test, ký giao dịch testnet bằng khóa đã được cho phép, deploy, demo scripts và chuẩn bị hồ sơ. Các phần tài khoản còn phụ thuộc phiên/quyền truy cập thực tế:

- Gh auth đã hoạt động; vẫn phải kiểm tra tanphung có đúng GitHub đang liên kết portal không.
- Portal cần phiên đúng ví; không giả định có .env là đã đăng nhập portal.
- Website phải public; site chỉ mở được cho chủ sở hữu chưa đủ nộp.
- Video YouTube không bắt buộc; nếu chưa có phiên upload, nộp repo + website + contract vẫn không bị chặn bởi riêng video.
- CAPTCHA/OTP hoặc quyền hệ thống phát sinh được xử lý khi gặp đúng bước; không thể hứa bỏ qua mọi trở ngại bên ngoài.

Lệnh cũ trong AGENTS.md dùng “genlayer network testnet-bradbury”; tài liệu/skill CLI hiện dùng “genlayer network set testnet-bradbury”. Khi triển khai sẽ kiểm tra --help và dùng cú pháp của phiên bản đã pin; không sửa cấu hình CLI toàn máy lúc lập kế hoạch.

## 9. Checklist hồ sơ nộp

| Trường | Nội dung sẽ chuẩn bị |
| --- | --- |
| Track | Future of Work |
| Repository | Public repo thuộc GitHub liên kết portal; tên chỉ chốt sau kiểm tra không đụng repo hiện có |
| Project name | VeriStep, tên làm việc; kiểm tra tên trước public |
| Logo | PNG/JPEG/WebP, 128–2048 px, ≤2 MB; coi là cần hoàn thiện cho bài nộp dù mức bắt buộc validation chưa kiểm tra |
| One-liner ≤180 ký tự | VeriStep verifies each handoff in a two-step research job and settles fees and performance bonds through GenLayer consensus. |
| Description ≤1000 ký tự | Vấn đề, ai dùng, hai bước, cách xác minh evidence, tác động on-chain, giới hạn bản demo |
| How-to | Mở case thật, xem nguồn, xem nghĩa vụ, đối chiếu artifact, mở verdict và receipt; luồng tạo case mới có ví |
| Expected outcome ≤500 ký tự | Hai case có đầu ra giống nhau nhưng verdict khác bước; obligation/chunk citations; credits và transfer được xác minh |
| Website | URL public, hoạt động không yêu cầu login vào công cụ hosting |
| Contract links | URL address Bradbury đã xác minh source/schema/view |
| Video | Quay tương tác thật, có giải thích đoạn chờ consensus được tua; không ghép hiệu ứng giả kết quả |
| Verification bundle | Lệnh test, results, deployment manifest, case IDs, tx/message IDs, version hashes |
| README | Chạy local, network, .env.example không khóa, kiến trúc, trust model, giới hạn, lý do dùng GenLayer, nguồn tham khảo |

Trạng thái “submitted” không đồng nghĩa “accepted”. Lưu URL/ID bài nộp và kết quả portal; chỉ báo được duyệt khi portal thực sự xác nhận.

## 10. Cấu trúc dự án dự kiến

```text
VeriStep/
  .env                        # cục bộ, không publish
  .gitignore
  AGENTS.md                   # giữ nguyên chỉ dẫn người dùng
  docs/                       # bộ thiết kế hiện tại
  contracts/veristep.py
  tests/direct/
  tests/integration/
  tests/adversarial/
  evidence/fixtures/
  scripts/preflight.mjs
  scripts/deploy.mjs
  scripts/run-demo.mjs
  frontend/
  deployments/
  submission/
  README.md
```

Tên đường dẫn là thiết kế của dự án, không phải API GenLayer. Giai đoạn hiện tại chỉ lưu kế hoạch và tài liệu; việc đổi New folder thành VeriStep thực hiện khi ý tưởng được chốt và sau khi kiểm tra đích không tồn tại.

## 11. Tiêu chuẩn “sẵn sàng nộp”

- [ ] Rubric và evidence gate được kiểm chứng bằng case đúng/sai/không thể kết luận.
- [ ] GenVM lint, direct, integration, adversarial tests và frontend build pass.
- [ ] Luồng người dùng tạo job mới chạy được; demo không chỉ xem một kết quả có sẵn.
- [ ] Hai ví contributor thật tham gia, không giả dữ liệu signer.
- [ ] Chỉ khoản vi phạm được chứng minh mới bị phạt.
- [ ] Mọi tiền công/bond/refund xác minh ở contract và receipt finality/message.
- [ ] Có trường hợp hệ thống từ chối phán quyết khi evidence không hợp lệ.
- [ ] Repo và website mở ẩn danh; không có private key trong source, history, logs hoặc bundle.
- [ ] Repository khớp account GitHub của portal.
- [ ] Hồ sơ đủ trường, được gửi trước deadline và lưu bằng chứng submit.

Không có bảo đảm chiến thắng hoặc “không trở ngại”. Mục tiêu kế hoạch là kiểm tra sớm các phụ thuộc và chỉ đầu tư tiếp khi những phần quyết định đã chạy được.
