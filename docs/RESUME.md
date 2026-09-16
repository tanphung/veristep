# Mốc tiếp tục VeriStep — cập nhật 16/09/2026

## Checkpoint mới nhất — không lặp giao dịch (16/09/2026)

- Quy tắc incident bắt buộc: không được mặc định lỗi là Studio Next/chain. Mỗi
  lỗi live phải kiểm input/config → script worker/frontend → contract/state →
  prompt/schema/model → evidence/API → platform, và ghi Expected, Actual, điểm
  fail đầu tiên, evidence/log, cùng `ROOT_CAUSE_CONFIRMED`,
  `ROOT_CAUSE_HYPOTHESIS` hoặc `ROOT_CAUSE_UNKNOWN`. Retry/recovery/redeploy cần
  minimal reproduction độc lập trước. `AGENTS.md` là nguồn policy đầy đủ.

- Timeout minimal reproduction cho deal `v2-studio-a-fault-358323c` được lưu ở
  `reports/studio-next-agent-tank/timeout-diagnostic-v2-studio-a-fault-358323c.json`.
  Contract/deployment/source hash khớp; state `REVIEW_REQUESTED`; deadline là
  `1789487114` Unix seconds = `1789483514` (review request) + `3600`, nên không
  cộng timeout hai lần. RPC latest timestamp là `1789558005` Unix seconds, nhưng
  SDK simulation **và** raw RPC `sim_call` cùng trả `DEADLINE_NOT_REACHED`; raw
  reproduction có HTTP 200/RPC `-32000`. Contract predicate do đó false cho
  simulation (`_now() < 1789487114`), nhưng receipt không expose absolute GenVM
  timestamp. Root cause được ghi đúng là `ROOT_CAUSE_UNKNOWN`, không phải Studio
  Next/platform, và timeout cleanup bị broadcast-lock cho tới một reproduction
  mới chứng minh `_now() >= deadline`.

- Không redeploy và không tạo lại bất kỳ case/hashi cũ nào. Audit đọc trực tiếp
  Studio Next đã đối chiếu **48 hash** trong
  `reports/studio-next-agent-tank/manifest.json`: không hash trùng, không hash
  pending và cả 48 đều `FINALIZED` (41 `FINISHED_WITH_RETURN`, 7
  `FINISHED_WITH_ERROR`). Hai record không có hash là `REJECTED_BEFORE_HASH`:
  `a-fault-resolve-review-retry-1` cũ và `a-fault-advance-timeout`; chúng không
  được broadcast.
- E2E `no-fault` đã được resume lại với
  `VERISTEP_STUDIO_NEXT_REPORT=studio-next-agent-tank` và
  `VERISTEP_STUDIO_NEXT_CASES=no-fault`. Nó xác nhận lại A/B `SATISFIED`, deal
  `SETTLEMENT_PENDING`, và bốn leg `DISPATCHED_UNVERIFIED`; runner no-op toàn bộ
  hash cũ. Kết quả tổng vẫn `partial` vì A-fault/B-fault chưa có consensus pass.
- Đã thử cleanup timeout bằng script manifest-guarded. Estimate bị từ chối trước
  khi ký; minimal reproduction sau đó xác nhận predicate false nhưng không
  expose actual GenVM timestamp (xem evidence ở trên). Nonce client giữ `43 →
  43`; **không có hash hay giao dịch timeout mới**. Không bypass estimate và
  không tạo A-r3/B-recovery chỉ để lặp lại outage.
- `fee-profile.json` giờ đúng schema `version`/`methods` của GenLayer: được tái
  tạo có kiểm tra từ 48 quote live, lấy maximum theo method và headroom 25%.
  Frontend dùng Transaction Kit với `suggestions`; worker dùng profile +
  `estimateTransactionFees` theo policy hiện hành, không simulate một write cho
  mỗi thao tác. `route_settlement` giữ recipient-specific message allocation
  đã được đo; `advance_timeout` cố ý không có profile và browser block signing
  cho đến khi Studio trả estimate thành công.
- Đã thêm `npm run audit:studio-next`, `npm run generate:fee-profile` và
  `npm run check:fee-profile`. Các runner không ghi raw RPC error vào manifest/
  console để tránh rò bí mật của hạ tầng validator.
- Các gate local sau thay đổi đạt: GenVM lint hai contract, Python suite,
  worker TypeScript + 16 tests, frontend TypeScript + 77 tests, production
  Vite build và `check:fee-profile`. Còn chạy secret scan, audit dependency,
  Wrangler dry-run và commit/push checkpoint sau khi review staged diff.
- Blocker thực tế còn lại: `GITHUB_EVIDENCE_TOKEN` **repo-scoped** cho
  `tanphung/veristep-evidence` chưa được cài làm Worker secret, khiến health
  `ready=false` và không thể chạy hosted A/B case; timeout estimate Studio Next
  hiện chưa đạt. Không dùng broad personal GitHub token và không tự tạo/đoán
  token. Không deploy Vercel current release hoặc bật `submissionReady` trước
  khi hai blocker và ba live gate được giải quyết.

## Safe stop trước khi người dùng nghỉ

- Quyết định ngày 16/09/2026: người dùng chọn **kịch bản 1**. Giữ nguyên contract
  Studio Next hiện tại; không sửa contract, không deploy lại và không chuyển sang
  deployment mới để xử lý HTTP/consensus. Tiếp tục E2E bằng bounded recovery trên
  deployment hiện tại, đúng thông báo mới nhất của team.

- Đã dừng chủ động sau checkpoint live; không còn runner hoặc giao dịch đang ở
  `PENDING`, `ACCEPTED`, `PROPOSING` hay `COMMITTING`. Mọi hash trong manifest đã
  terminal và tuyệt đối không resend.
- `no-fault` đã pass semantic A/B và bốn settlement leg đều
  `DISPATCHED_UNVERIFIED`. Đây là case hoàn tất, chỉ đọc lại khi tổng hợp report.
- A-fault gốc, recovery r1/r2 và B-fault gốc vẫn on-chain ở
  `REVIEW_REQUESTED`; các resolve/retry tương ứng đã terminal lỗi hoặc
  `UNDETERMINED`, không phải giao dịch đang chờ. Không chạy lại các prefix cũ.
- Khi người dùng nói **“tiếp tục”**: đọc manifest này, kiểm tra chain/deadline và
  tình trạng validator trước. Sau khi cửa sổ cũ hết, xử lý timeout/unwind nếu cần;
  chỉ tạo `a-fault` r3 và `b-fault` recovery-1 khi AI/consensus ổn định. Dùng
  `VERISTEP_STUDIO_NEXT_CASES` để chạy riêng từng case, không chạy lại no-fault.
- Sau live cases: tạo fee profile hợp nhất, dọn copy/script Bradbury khỏi luồng
  active, hoàn thiện hosted worker (còn thiếu repo-scoped GitHub token), Vercel,
  README và submission. Video vẫn do người dùng quay sau cùng.

## Checkpoint hiện hành — Studio Next Agent Tank

Đây là checkpoint ưu tiên cao nhất. Mọi phần bên dưới chỉ là lịch sử nếu mâu
thuẫn. Không dùng Bradbury nữa và không redeploy contract hiện tại nếu source
không đổi.

- Studio Next chain `61997`; contract
  `0xd72A7C7e1e9c1A56AE32B827b756fFff031B1b4b`; deploy transaction
  `0x6200be8f09bb10d670ac7c3a1def9ba11893bc618ae4d4b2d261ffd2ab39494b`;
  source SHA-256
  `baedb9762690220aa8620fc6a94065b993700cbccb5ded586b4560ee3fc4019b`.
- `.venv` đã tạo lại đúng repo. GenVM lint hai source V2 đạt và Python suite
  đạt `245 passed`. Test harness có adapter RC2 cho regression SDK V1; contract
  V2 không bị sửa bởi adapter này.
- Frontend + receipt đạt `77 + 2`, worker đạt `16`, typecheck, production build,
  worker build, Wrangler dry-run, secret scan và dependency audit đều đạt.
- Bốn ví Studio Next đã khác nhau, faucet thành công và đủ số dư. Không in hoặc
  commit private key.
- Cloudflare Worker đã tồn tại tại
  `https://veristep-agent-worker.veristep.workers.dev`. D1 migrations đã áp dụng;
  budget hiện là limit `1,200,000,000`, spent `172,200`, reserved `1,374,200`,
  remaining `1,198,453,600` nano-USD. Health còn `ready=false` vì thiếu duy nhất
  secret `GITHUB_EVIDENCE_TOKEN`; không redeploy trùng trước khi kiểm tra state.
- Manifest live là `reports/studio-next-agent-tank/manifest.json`. Case
  `no-fault` đã đạt A/B `SATISFIED`, bốn leg ở đúng trạng thái
  `DISPATCHED_UNVERIFIED`; không gửi lại bất kỳ step nào của case này.
- Case `a-fault` gốc đã final đến request review; resolve
  `0x878e79c309a1485fab7dbb284fd159d7ae5de5424867fe6f5ed6c4f84c715bfa`
  lỗi do `HTTP_UNAVAILABLE`/`MAJORITY_DISAGREE`, retry hết cửa sổ và không có
  hash. Giữ nguyên bằng chứng lỗi.
- Recovery A-fault `r1` và `r2` đều đã hoàn tất create → request review nhưng cả
  hai lượt resolve có hash của mỗi recovery đều kết thúc `UNDETERMINED`. Hash
  mới nhất của r2 là resolve
  `0xfa6074f7c2b632699ec0832b99e404efc34abb7506ddb4221e151d7792620951`
  và retry-1
  `0x61f3a90ef96f4f2dee5cb4de905c6b6a0e888bc1f14a0221005780e3ba00bfd2`.
  Receipt cho thấy validator `HTTP_UNAVAILABLE`/disagree; không gửi lại các hash
  này và chưa tạo r3 khi hạ tầng AI đang bất ổn.
- Case `b-fault` gốc đã hoàn tất create → request review. Resolve
  `0xbf303857a029bbe1c55d0861b1913f49e24319a898e02e997ba892766b4f6c58`
  và retry-1
  `0xd44b5a1229426af1634f54b4729388461281c27271f4ecc9cbb6d9356434259e`
  đều `UNDETERMINED`; chưa tạo recovery trong cùng đợt outage.
- Runner hỗ trợ `VERISTEP_STUDIO_NEXT_CASES` để tiếp tục từng case mà không ghi
  sai gate tổng, chọn recovery dựa trên manifest, dùng nonce guard, và chỉ dùng
  fee profile đã estimate thành công của cùng lời gọi làm fallback khi RPC
  estimate tạm lỗi. Mọi step có hash/finality đều được no-op khi chạy lại.
- Video và thao tác Portal do người dùng tự thực hiện sau khi dApp hoàn chỉnh.

Thứ tự còn lại: hợp nhất fee profile; sửa copy/UI Bradbury còn sót; publish
Vercel; cập nhật README/submission; sau đó thử recovery Studio Next khi validator
ổn định. Hosted worker còn cần repo-scoped GitHub token để health ready và chạy
một hosted A/B case. Trước mọi write
live, đọc manifest và quan sát hash hiện có; không tự resend trạng thái
`UNKNOWN`, ambiguous hoặc đã finalized.

## Trạng thái hiện hành — v2 release candidate, chưa deploy

Source hiện tại là `contracts/veristep.py` và
`contracts/VeriStepReceiptRouter.sol`; file draft `veristep_core.py` đã được
thay thế. IC đã có trọn lifecycle funding → accept → immutable GitHub commitment
→ independent consensus review → structured report → deterministic settlement
→ exact released-receipt confirmation. Lint đạt; v2 direct 157/157, toàn bộ Python
252/252, frontend 74/74 + receipt 2/2 và router EVM 16/16. Production vẫn cố ý giữ v1.1;
v2 chưa deploy, chưa được chọn trong frontend.

Đã hoàn tất semantic committee integration thật trên StudioNet bằng contract V2
`0x41BcdFB280BD26939cb6956B55ddA7e85b4567c9`: deploy + hai lifecycle đầy đủ có
17/17 step thành công; happy cho A/B `SATISFIED`, artifact mâu thuẫn ở cuối cho A
`VIOLATED`, B `SATISFIED`. Năm giao dịch âm khác đều finalized với execution lỗi
đúng mã và không lưu deal: hostname, owner, commit, SHA-256 và obligation set.
Manifest/receipt đã sanitize ở `reports/v2-studionet-semantic/`; ví StudioNet chỉ
ở `.secrets/` bị ignore. Một probe ban đầu sai cô lập object được giữ nguyên làm
bằng chứng harness failure rồi thay bằng probe đúng.

StudioNet cố ý dùng router dead address nên không tuyên bố settlement. Gate còn
lại là round trip IC → router EVM → recipient → exact released receipt → IC trên
Bradbury, cùng lựa chọn V2 cho public frontend. Không deploy Bradbury/Vercel trước
khi toàn bộ gate offline hiện tại được chạy lại và người dùng xác nhận mới theo
`AGENTS.md`. Hidden redirect đã-follow vẫn không quan sát được trong SDK pinned;
contract từ chối 3xx lộ ra và mọi origin không canonical, nhưng không được tuyên
bố đã giải quyết hạn chế SDK này.

Các mốc 10–11/09 bên dưới là lịch sử và bị phần hiện hành này thay thế nếu mâu
thuẫn.

## Tiến độ mới nhất — đã code lõi v2, chưa phải dApp v2 hoàn chỉnh

Đọc [V2-CORE-PROGRESS.md](V2-CORE-PROGRESS.md). Đã có `contracts/veristep_core.py`, 144 direct tests và toàn bộ 239 Python regression đạt; lint không warning. Adapter EVM WASI đã chạy trong binary GenVM v0.2.12 thực với controlled host, giữ đúng target/value; chưa phải router/finality/chain E2E. Probe web module chính thức đã chứng minh redirect cross-host bị tự follow và IC chỉ thấy final 200/body, không URL/history; vì vậy external acquisition vẫn đóng. Report assembler IC đã bind provenance đầy đủ và tách deterministic obligation A/B. Frontend đạt 2 receipt + 65 UI tests, build/typecheck sạch và bundle lớn nhất còn 285.22 kB; desktop/mobile đã kiểm tra trực quan. Chưa bật funding hoặc settlement, không dùng ví/deploy trong bước này.

## Mốc mới nhất — v2 preflight bị chặn, chưa deploy

Đã thực hiện kiểm tra SDK theo kế hoạch: 92 regression tests v1 đạt, 3 gate v2 thất bại (typed EVM view lỗi thuộc tính; typed emit làm value thành 0; web SDK không có redirect control/history). Đọc [V2-FEASIBILITY.md](V2-FEASIBILITY.md) và raw `reports/v2-preflight.xml` trước khi tiếp tục. Default pytest đã bao gồm feasibility để không che gate đỏ. Chưa sửa SDK, chưa code adapter/settlement v2, chưa gửi giao dịch/deploy/push production. Cần official supported API/runner và kiểm chứng finality/full integration; không bỏ yêu cầu của người dùng hoặc chuyển authority ra backend. Các mốc dưới là lịch sử, không phải tuyên bố sẵn sàng nộp.

## Trạng thái hiện hành — mở lại giai đoạn hoàn thiện sản phẩm

Yêu cầu mới nhất: triển khai kiến trúc [IC v2](IC-V2-ARCHITECTURE.md) trước các hạng mục UI. Mọi provenance, semantic validation và settlement/receipt decision thuộc IC. Đã trình kiến trúc, chưa viết/deploy v2. Skill write-contract và genvm-lint đã dùng; lint v1.1 hiện tại đạt nhưng không chứng minh v2 đạt. Điểm tiếp tục: kiểm chứng SDK redirect handling, provider provenance, EVM receipt/finality và môi trường integration trước deploy; sau đó code/tests. Quyền deploy cũ không áp dụng v2.

Người dùng đánh giá giao diện và mức hoàn thiện chưa đủ cạnh tranh, yêu cầu chuẩn chất lượng rất cao. Đọc [COMPETITIVE-RELEASE-PLAN.md](COMPETITIVE-RELEASE-PLAN.md) trước mọi kế hoạch/checkpoint bên dưới. Kế hoạch này thay thế tuyên bố “chỉ còn nộp”. Contract/receipts cũ vẫn là bằng chứng đã đạt; agent thực thi, generic payout verification, comparative workspace và UX release mới còn phải hoàn thiện.

Preview local đang ở cổng 5174; production Vercel vẫn là bản trước redesign. Local edits chưa commit gồm cập nhật hosting/docs, prototype UI/ảnh/CSS và kế hoạch mới. Bắt đầu từ R0 của kế hoạch; không push main bất chợt vì Vercel đã liên kết GitHub.

## Mốc public cuối cùng — 09/09/2026

- Demo chính đã deploy production trên Vercel từ commit `d34f6cdf20dd53934871cc5912da7d653e6e9a7e`: `https://veristep-genlayer.vercel.app/#job=bradbury-happy-a5bc7d15`.
- Đã kiểm tra lại alias Vercel trong trình duyệt: không cần đăng nhập; job Bradbury tải ở trạng thái `RESOLVED`, bốn finding đều `SATISFIED`, và payout A hiển thị `Recipient transfer verified` với chênh lệch chính xác `+0.03 GEN`.
- GitHub `main` chứa toàn bộ source, test, raw evidence Bradbury và tài liệu bàn giao public; commit cuối phải qua secret guard trước khi push.
- Việc còn lại duy nhất không tự động hóa: người dùng kiểm tra hồ sơ, xác nhận GitHub liên kết portal, kết nối ví của mình, chấp nhận điều khoản và tự nộp bài.
- Các phần bên dưới được giữ làm lịch sử kỹ thuật. Khi thông tin mâu thuẫn, mốc public cuối cùng và báo cáo `docs/VERIFICATION-REPORT.md` là nguồn hiện hành.

## Mốc Bradbury đã xác minh — 09/09/2026

- Contract v1.1 đã deploy/finalized trên Bradbury tại `0x3FC5dce3abadf149111A45ae9936eBdD7A67AA88`; deploy tx `0xb98884870579ce28d933677f1fe1889f227c86c7b3c302c3c51aef9a1d7e44d2`. Source hash vẫn là `a5bc7d153af669d5a03dc4e68e89ed88159ad0d265f17c2064a1f07733235391`.
- Bradbury RPC chain ID là `4221`; `gl.message.chain_id`/evidence-domain do contract trả về là `1`. Frontend kiểm tra riêng hai miền này.
- Smoke job `bradbury-happy-a5bc7d15` đã `RESOLVED`, A/B đều `SATISFIED`; tất cả giao dịch thành công đã final. Resolve lần đầu `UNDETERMINED` được giữ nguyên; bounded retry lần một final thành công.
- Claim A `0x5887...6218` final thành công. Finalize EVM tx `0xa677...c9ff`, block `21205036`; balance ví A tăng chính xác `0.03 GEN`. Xem `reports/bradbury-release/`.
- Frontend đã trỏ Bradbury và chỉ mở write sau `submissionReady` gate. Toàn bộ gate, browser QA và Vercel production deployment đã hoàn thành; người dùng tự kết nối portal wallet và tự nộp.

## Mốc release candidate v1.1 — 08/09/2026

Đây là mốc mới nhất và thay thế các số liệu cũ bên dưới khi có khác biệt.

- Contract StudioNet v1.1: `0x8128cD94346c94fe1FF20204d54a4B980Ae00b61`; source SHA-256 `a5bc7d153af669d5a03dc4e68e89ed88159ad0d265f17c2064a1f07733235391`. Schema và config đều đã xác minh.
- Rubric v1.1 định nghĩa coverage theo từng chủ đề được hỏi: phải trả lời rõ hoặc nói rõ là nguồn không xác định; chỉ nói “immediately” không tự động trả lời điều kiện approval/eligibility. Policy này được dùng chung trong leader prompt và validator grounding. Fixture timing-omission cũ được giữ nguyên để test, không sửa cho dễ pass.
- Ma trận thật trên StudioNet đạt **16/16 case**. Ba ca lõi a-fault, b-fault, no-fault đều đạt ba lần lặp liên tiếp; các ca timing-omission, both-fault, missing-data, source-duty, tail-injection và conflicting-source đều đạt. Manifest có **113/113 step `FINALIZED_SUCCESS`**: một deploy và bảy giao dịch cho mỗi case. Xem `reports/studionet-sep07probe/`.
- Full React/provider happy path đạt: job `work-69d379f8`, bảy giao dịch create → accept A/B → submit A/B → request review → resolve đều `FINALIZED_SUCCESS`; trạng thái cuối `RESOLVED`, A/B cùng `SATISFIED`. Xem `reports/frontend-live/`. Test dùng component/form thật và provider request thật với ví StudioNet cô lập; không phải chứng nhận MetaMask/Snap của người dùng.
- Gate local đạt ngày 08/09: GenVM lint 3/3 (chỉ cảnh báo có runner mới hơn; giữ pin đã review), 92 direct/adversarial tests, 64 frontend tests + 2 receipt tests, TypeScript test compile, production build, npm audit 0 lỗ hổng đã biết. Bundle còn cảnh báo 759.57 kB.
- Lỗi RPC thoáng qua trong polling được phục hồi bằng hash đã persist; runner không tự gửi lại transaction không chắc chắn. Toàn bộ failure v1.0 và run v1.1 cũ bị kẹt được giữ lại, không xóa để làm đẹp kết quả.
- Submission draft và logo 512×512 đã có trong `submission/`. Chưa public website, chưa deploy Bradbury, chưa xác minh external EOA child transfer và chưa nộp portal.
- Việc tiếp theo: review/commit/push release candidate; trình kết quả cho người dùng. Chỉ sau khi người dùng xác nhận rõ mới deploy Bradbury theo gate `AGENTS.md`. Sau Bradbury phải chạy smoke workflow và xác minh child transfer đến EOA trước khi ghi “payment verified”; rồi mới cấu hình frontend vào Bradbury, publish Sites, kiểm tra URL công khai và bàn giao bộ submission để người dùng tự nộp.

## Mốc mới nhất — đọc phần này trước lịch sử bên dưới

Người dùng đã yêu cầu tiếp tục xây dựng. Repo public đã có tại https://github.com/tanphung/veristep, baseline trước phiên này là `ca63b99`. Không còn ở trạng thái tạm dừng ngày 05/09.

- Contract sửa định dạng prompt và cho phép đúng một lần tạo lại output sai schema; không reroll verdict hợp lệ, không bỏ kiểm tra citation hay validator độc lập. Bốn tài liệu thiết kế đã có addendum trước sửa code.
- GenVM lint đạt; 81 direct/adversarial tests đạt (mock LLM). `npm test`: 50 frontend + 2 receipt tests đạt. TypeScript/Vite build đạt, còn cảnh báo bundle 755 kB.
- Studio contract hiện tại: `0x7df6bD92CEe3c7ABfD2CBc0c14B64f7dce8E7f72`, source SHA-256 `d7b95848879652f94acfedf5e384504cb49dfea836f33c533999470dba7856b0`. Frontend deployment config khớp địa chỉ này.
- Ba ca đầu `a-fault-1`, `b-fault-1`, `no-fault-1` đã FINALIZED, execution thành công, state RESOLVED và credits đúng. Xem manifest và `*.job.json` trong reports/studionet.
- Lần lặp `a-fault-2-d7b95848` thất bại UNDETERMINED sau 3 rotations; hash `0x0ef382211f5e821486fcdcec6050e1fe1d5a663510594dbb7ef83925aa7cc070`. Batch dừng tại đây, các lượt còn lại chưa chạy. KHÔNG được báo đạt stability gate.
- Công cụ read-only `node scripts/summarize-consensus.mjs reports/studionet/a-fault-2-d7b95848-resolve.receipt.json` giải mã candidate các vòng: vòng đầu A_COVERAGE/B_COVERAGE VIOLATED vì thiếu nội dung approval; các vòng sau SATISFIED vì diễn giải “immediately” hoặc bỏ sót topic approval. Đây là bằng chứng rubric/diễn giải chưa ổn định, không chứng minh được chính xác nhánh reject của từng validator.
- Hướng điều tra tiếp: làm rõ coverage và nghĩa vụ B đã chấp nhận, giữ ambiguity fixture như stress test; không đổi fixture để che thất bại. Nếu sửa contract, rà soát bốn tài liệu trước, thêm regression, deploy Studio mới và giữ toàn bộ lịch sử. Không nới xác minh để ép đồng thuận.
- Frontend có tạo job, role actions, evidence/citations toàn văn, deadline, credits, claim-warning, lưu hash chống gửi trùng, khôi phục hash không ký lại, và kiểm tra receipt + state trước báo thành công. Có WebMCP read-only và mở form không tự ký. Chưa có standalone worker agent.
- Browser đã kiểm tra live a-fault/b-fault, citation navigation, mobile 390px không tràn ngang, lỗi không có wallet và hai WebMCP tools. Chưa kiểm tra positive E2E bằng ví trình duyệt. Wallet event subscriptions còn cần bổ sung; mỗi write đã kiểm tra lại account/chain.
- Chưa gửi Bradbury, chưa xác minh recipient payout, chưa public website/nộp bài. Vẫn phải qua gate trong AGENTS và xin xác nhận sau khi người dùng xem kết quả.
- Lịch sử deployment lỗi ngày 05/09 được giữ tại `reports/archive/studionet-20260905-4606d038`.
- Lần đầu gửi a-fault-1 resolve gặp lỗi RPC `eth_gasPrice` trả HTML trước khi broadcast; kiểm tra SDK xác nhận bước này trước ký/gửi, sau đó mới thử lại. Không áp dụng cách này cho lỗi kết quả gửi không rõ.

## Lịch sử checkpoint 05/09 — thông tin dưới đây đã được thay thế khi khác phần trên

Người dùng yêu cầu lưu commit và push GitHub, sau đó tạm dừng để ngày mai tiếp tục. Không tự triển khai Bradbury hoặc nộp bài trong bước sao lưu này.

## Dự án và phạm vi đã chốt

- Thư mục làm việc: `D:\app genlayer\VeriStep` (đã đổi tên từ `New folder`).
- GitHub dự kiến: `tanphung/veristep`; xem remote `origin` để xác nhận.
- Track dự kiến: Future of Work. Chưa nộp portal, chưa được team chấp nhận.
- A trích xuất từ nguồn, B làm báo cáo từ A; phân biệt lỗi bắt nguồn ở A và lỗi mới ở B. B chỉ có trách nhiệm đối chiếu nguồn khi nghĩa vụ đó đã được chấp nhận trước.
- Nguồn là tài liệu tham chiếu được các bên thống nhất, không phải oracle xác nhận sự thật ngoài đời.
- Nguồn/A/B lưu toàn văn on-chain trong giới hạn byte. Không cắt phần đầu rồi bỏ phần cuối để review. Không để LLM quyết định số tiền, ví nhận hoặc thời hạn.
- Kế hoạch đầy đủ và bốn tài liệu bảo mật đã có trong `docs/`; `DESIGN-REVIEW.md` là tự rà soát thiết kế, không phải kiểm toán độc lập.

## Trạng thái đã có bằng chứng

1. Contract `contracts/veristep.py` đã qua lint ở phiên xây dựng; giữ runner hash hiện tại. Không sửa contract trong bước lưu GitHub.
2. 56 direct/adversarial tests đã pass; báo cáo `reports/direct-tests.xml`. LLM trong các test này là mock có kiểm soát, không được nói là 56 lần AI thực tế thành công.
3. Hai unit tests cho receipt decoder đã pass. Receipt của Studio chứa cả validator idle có ERROR; chỉ chọn đúng leader receipt, đồng thời yêu cầu lifecycle FINALIZED và execution thành công. Không đổi sang chấp nhận FINALIZED đơn thuần.
4. StudioNet chain `61999` đã deploy contract `0xebF38AD46a3C3D4728D84E0BF3EBD842Edab4802`, kiểm tra schema/config và hoàn thành create, accept A/B, submit A/B, request review cho case đầu.
5. Review thực tế đầu tiên thất bại `UNDETERMINED`. Final leader rollback: `[LLM_ERROR] Missing source/deliverable citation`. Đây là lỗi cần xử lý, không phải verdict thành công. Chưa có case live adjudication end-to-end pass.
6. Frontend hiện chỉ là bản đầu đọc dữ liệu thật. TypeScript/Vite build đã pass ở bước checkpoint; còn cảnh báo chunk lớn hơn 500 kB. Chưa có đủ wallet/forms, agent thực thi, trạng thái payout, component tests hoặc browser E2E. Vite/Vitest đã nâng bản vá, npm audit tại checkpoint báo 0 lỗ hổng đã biết; không tương đương kiểm toán bảo mật.
7. Chưa gửi giao dịch Bradbury. Chưa chứng minh payout tới ví nhận. Chưa deploy website công khai; Sites chỉ mới được đăng ký dự án.

Deploy tx: `0x8cf6c780629d4c08ee90fd279e477bdfa0010cb519d78ccfd83aa290353c371b`.

Failed review tx: `0x5884c07f6a95eb891e9f3857c420f5632ec2bcaf3548fbc3984fa51f512db0ec`.

Source SHA-256: `4606d0387360f0b4c0613a8188221def59225cdc0155e2b502af1b0dc2633f5c`.

## Thứ tự làm tiếp

1. Đọc `AGENTS.md`, README, tài liệu thiết kế và các skills GenLayer tương ứng; kiểm tra `git status` trước khi chỉnh sửa.
2. Đọc raw receipt lỗi và contract prompt/parser. Bổ sung hướng dẫn JSON/citation cụ thể hoặc cơ chế sửa output có giới hạn sau khi rà soát thiết kế. Tuyệt đối không bỏ yêu cầu dẫn chứng cả nguồn và sản phẩm, không bỏ validator độc lập, không chấp nhận lỗi thành verdict.
3. Thêm regression tests cho lỗi thực tế này; chạy lại GenVM lint, direct và adversarial tests. Giữ nguyên lịch sử lần chạy thất bại.
4. Nếu source thay đổi hoặc cần bộ ví mới, lưu toàn bộ `reports/studionet` cũ vào thư mục archive có tên/hash riêng đã kiểm tra đường dẫn, rồi khởi tạo lần chạy mới. Không ghi đè receipt cũ. Runner bảo vệ source hash, network, chain và ví để không vô tình dùng lại deployment sai. Không gửi lại giao dịch có trạng thái chưa rõ chỉ vì hết thời gian chờ.
5. Chạy ba ca cốt lõi thực tế (lỗi A, lỗi B, không lỗi), sau đó các ca còn lại và lặp có giới hạn. Mặc định runner chọn ba ca cốt lõi, một lượt; `VERISTEP_REPETITIONS` chỉ nhận 1–3, `VERISTEP_CASES` chọn ID trong fixtures. Lưu cả các lần thất bại, kiểm tra outcome và bảo toàn tiền. Runner hiện chưa kiểm chứng claim/payout.
6. Hoàn thiện luồng agent, wallet, tạo job, nhận việc/nộp artifact, yêu cầu review, dẫn chứng đầy đủ, timeout và claim. UI chỉ render state/receipt thật; MESSAGE_EMITTED không được hiện thành PAYMENT_CONFIRMED. Bổ sung frontend tests và E2E, kiểm tra desktop/mobile.
7. Sau khi tất cả gates đạt, báo kết quả cho người dùng và xin xác nhận triển khai Bradbury theo `AGENTS.md`. Khi có xác nhận mới kiểm tra chain/account/gas và deploy. Dùng tài khoản test/giới hạn tiền, kiểm tra cả transfer/child message trước khi khẳng định payout.
8. Hoàn thiện website công khai, README/submission, video/demo và bằng chứng test. Xác nhận GitHub đúng tài khoản liên kết portal, kiểm tra lại yêu cầu/hạn nộp hiện hành trước khi nộp. Không tự nhận dự án được chấp nhận hoặc chắc chắn đạt giải.

## Bí mật, tài khoản và hosting

- `.env` chứa ví đã được người dùng cấp; chỉ giữ tại máy. Không đọc ra log, chat, source, báo cáo, bundle hoặc GitHub.
- `.secrets/studionet.json` là các ví riêng cho StudioNet. File không được push; giữ thư mục gốc để tiếp tục run cũ. Clone repo không khôi phục được các khóa này.
- GitHub CLI đang đăng nhập `tanphung`; dùng keyring, không viết token vào remote URL.
- Vercel project chính: `vandas/veristep-genlayer`; alias production ghi ở mốc đầu tài liệu. `.vercel/` chỉ chứa liên kết local và bị ignore. Sites project cũ vẫn được ghi trong `.openai/hosting.json` để bảo toàn lịch sử triển khai; không dùng URL đó trong hồ sơ nộp.
- Mỗi lần commit: kiểm tra staged files, chạy `npm run check:secrets`, rồi kiểm tra lại committed tree. Đây là guard hỗ trợ, vẫn phải review nội dung trước public push.

## Lệnh kiểm tra nhanh trên máy hiện tại

```powershell
Set-Location 'D:\app genlayer\VeriStep'
git status --short
npm test
npm run build
npm audit
$env:GENVM_VERSION = 'v0.2.12'
.venv/Scripts/genvm-lint.exe check contracts/veristep.py --json
.venv/Scripts/python.exe -m pytest tests/direct tests/adversarial -q
```

Chỉ chạy `npm run test:integration` khi chủ động bắt đầu tiếp việc live StudioNet. Lệnh này có gửi giao dịch; không phải kiểm tra offline. Với manifest hiện tại, review đã terminal nên runner sẽ báo thất bại, không tự sửa được lỗi AI.

Người dùng chưa yêu cầu hẹn giờ tự chạy. Tiếp tục khi người dùng quay lại; không tạo automation hoặc tự chạy qua đêm.
