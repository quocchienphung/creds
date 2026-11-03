# affectUI → Guide me: bàn giao cho Claude Code

## Excel review workbench — 2026-11-02

Review của Excel formation nay dùng hai khối toàn chiều ngang xếp dọc: xem tệp gọn ở trên, sửa nội dung ở dưới; ba bước **xác định ô → chọn/nhập từ sửa → đọc lại và duyệt**. Thẻ Draft/Target được thay bằng bảng từ thay thế có cơ sở, nhập tay, giữ nguyên và kiểm tra sau. Bộ đoán xét cả cụm từ, học các đoạn sạch của ô hỏng và giữ nguyên từ chưa chắc chắn khi đưa vào nháp. Chi tiết hiện hành, giới hạn và phép đo: [09-correction-workbench.md](collateral/09-correction-workbench.md). QA thêm: `node scripts/qa/collateral-correction-workbench.mjs <production-url>`.

## Collateral: Excel formation + JSON formation — 2026-11-02

Nhóm **Rules** của bộ chọn Guide me có thư mục **Collateral** (sidebar, dựng từ block Sidebar của UIArc) chứa hai mục: **Excel formation** (`/personalize?section=excel-formation`) và **JSON formation** (`?section=json-formation`). Một tệp `.xlsx` được mở, sửa lỗi ký tự/dữ liệu bằng tay, xuất bản Excel đã sửa; rồi gom nhóm thành JSON báo cáo (chi nhánh → khách hàng → tài sản) với 9 kiểm tra trước khi cho tải. Mọi xử lý nằm trong Web Worker của thẻ trình duyệt, không lưu, không gửi đi. Code: `src/components/sites/collateral/` (logic Excel ở `excel-formation/`, logic JSON ở `json-formation/`, dùng chung ở gốc). Tài liệu đầy đủ, quyết định thư viện, quy tắc và kết quả đối soát: [docs/collateral/](collateral/IMPLEMENTATION_CHECKLIST.md). QA: `node --experimental-strip-types scripts/qa/collateral.mjs <url>`, `node scripts/qa/rules-collateral.mjs <url>`. File tham chiếu bí mật nằm trong `.gitignore`.

Đợt Phase 5 (2026-11-02): bước Review của Excel formation xem toàn bộ tệp (`gallery/SheetViewer.tsx`, hình học thuần `engine/sheet-geometry.ts`), kính lúp vẽ ô thật, thẻ **Guess and check** dựng từ UIArc Speculative decoding (`gallery/SpeculativePanel.tsx`, `engine/{predict,speculative,playback}.ts`), **Save/Resume progress** (`engine/progress.ts`), `CollateralBoundary.tsx`, cảnh báo rời trang. Đọc `docs/collateral/08-whole-file-viewer-and-guessing.md` và `docs/research/speculative-decoding/README.md`. Cẩn thận: lưới CSS một cột ngầm nở theo nội dung nowrap (đặt `minmax(0, 1fr)`), trang `inert` khi viewer mở (trả focus sau khi viewer rời cây), QA `node scripts/qa/collateral.mjs <base-url>` (87 kiểm tra), số trên tệp thật `collateral-reference-browser.mjs`.

JSON formation (2026-11-02): bước Preview dùng `src/components/sites/json-viewer/` (clone UIArc JSON viewer; nguồn dữ liệu từ worker `collateral/json-formation/remote-source.ts` + `engine/json-doc.ts`), bước Export bắt đầu bằng `src/components/sites/json-pipeline/Workflow.tsx` (clone UIArc AI workflow, Pro: chỉ đọc preview mở) gắn bởi `steps/JsonPipeline.tsx`. Đọc `docs/collateral/11-json-viewer-and-workflow.md`, `docs/research/json-viewer/README.md`, `docs/research/ai-workflow/README.md`. QA: `node scripts/qa/json-viewer.mjs <url>` (59 kiểm tra), `scripts/forensics/json-viewer-fps.mjs`. Cẩn thận: nguồn của viewer đổi bằng `useSyncExternalStore` (đừng đăng ký trong effect, sẽ mất cập nhật); hàng là component `memo`.

## Agent Lanes trong khung CRM — 2026-10-20

Ảnh ở hàng **CRM** của `/personalize?browse=1&group=crm` được thay bằng **Agent Lanes** chạy DOM/SVG, dựng lại từ preview/docs/CSS công khai của `https://www.affectui.com/components/agent-lanes` bằng clone engine trong repo; không dùng CLI, registry/API cài đặt, MCP hay source Pro. Giữ logo Claude/ChatGPT/Gemini gốc, tăng tile/logo lên 28/18px cho dễ thấy trong khung 380:401. Có timeline, đường handoff, tooltip, Approve/Reject, keyboard, native touch, reduced motion và clock tạm dừng khi ẩn. Code: `src/components/sites/affectui-agent-lanes/`; [phân tích, phần tự quyết, ảnh so sánh và giới hạn](research/agent-lanes/README.md). QA: `node scripts/qa/agent-lanes.mjs`, so hình `node scripts/forensics/agent-lanes-compare.mjs`. Mọi tác vụ/approval là demo cục bộ; bấm hàng CRM vẫn mở Home thật của workspace. Guide links dùng roving tab stop để Tab từ nhóm đang chọn vào các control của preview.

## Delegate Board trong khung Project Management — 2026-10-20

Hàng **Project Management** của `/personalize?browse=1` không còn khung xám: nó chạy **Delegate Board** dựng lại từ preview công khai `https://www.affectui.com/components/delegate-board` (chỉ quan sát giao diện/docs/số đo; không dùng CLI, registry, MCP hay mã Pro). Kéo task sang một thành viên: thành viên đó hiện trước giờ "Busy until" mới; thả vào Unassigned để trả về; công tắc **Auto** giao mỗi giây cho người rảnh sớm nhất; bàn phím Enter/↑↓/Esc/1–9/0; kéo bằng cảm ứng thật. Agent = Planner/Writer/Coder/Ops với **logo hãng thật** (Anthropic, OpenAI, Gemini) và task mang **logo công cụ thật** (Notion, GitHub, Slack, Figma, HubSpot, Stripe), xuất từ SVG inline của preview bằng `scripts/forensics/affectui-delegate-board-icons.mjs` (không vẽ tay; `brand-icons.generated.ts` là file sinh); tên model lấy từ `assistant-models.ts`; không đặt giá/phút nên tổng cộng thời gian. Bố cục cân trục và vừa khít ở 6 kích thước (QA đo). Code: `src/components/sites/affectui-delegate-board/` (luật thuần `delegate-model.ts` có test, `DelegateBoard.tsx`, `delegate-board.css`, dữ liệu khung ở `ProjectDelegateBoard.tsx`). Phân tích, phần tự quyết, giới hạn: [research/delegate-board/README.md](research/delegate-board/README.md). QA: `node scripts/qa/delegate-board.mjs`.

## Cảm ứng Guide me — 2026-10-20

Bộ chọn `/personalize?browse=1` hỗ trợ kéo dọc qua các hàng để đổi preview, vuốt ngang để chuyển nhóm và chạm lần hai vào nhóm đang chọn để mở trang. Chạm chọn có phản hồi ngay; click phát sinh sau kéo bị chặn theo gesture, không dùng cửa sổ 400ms. Vùng ngoài danh sách vẫn cuộn dọc, pinch zoom và tương tác card giữ được. Top-level route dùng `useSearchParams`, bỏ key theo group để tránh mất gesture/draft và lỗi WebKit URL đã đổi nhưng UI đứng nguyên. Nguyên nhân, giới hạn kiểm thử Safari và QA: [Guide navigation](research/guide-navigation/README.md). Test mới: `node scripts/qa/guide-touch.mjs`.

## Tỷ lệ preview Guide me — 2026-10-20

Theo ảnh người dùng, cả bốn khung Sales / Agent Chat / CRM / Project Management nay dùng tỷ lệ **380:401** của Writing Assistant public preview. Card cao hơn; chữ dùng mốc 380 px và giới hạn 1–1.25×, không phóng chữ theo khung ảnh 300 px cũ. Desktop là 384 × 405 CSS px; ở DPR 1.25 là khoảng 480 × 506 device px. Nội dung/chuyển mục giữ nguyên. Màn hình hẹp xếp dọc, màn ngang thấp cho cuộn thay vì thu nhỏ nút/chữ. Chỉ quan sát preview công khai và ảnh người dùng, không dùng CLI/registry/code Pro/prompt của affectUI. Chi tiết hiện hành: [Writing Assistant brief](research/writing-assistant/README.md), ảnh và so sánh trong `docs/research/writing-assistant/resize/`. QA Writing Assistant (15 nhóm), Guide navigation (11 nhóm) và production build đã qua. Các mô tả tỷ lệ 223:190 bên dưới là trạng thái compact cũ.

## Assistant Home / Agent Chat — 2026-10-20

**Agent Chat** mở `/personalize?section=new-chat`, dựng theo `https://www.affectui.com/screens/assistant-home/full`; sidebar gồm **New chat, Run, Settings**. Giữ Logio và đầu sidebar chỉ có Explore pages. UI/đối chiếu, file ownership, kiểm thử và giới hạn live nằm ở [Assistant brief](research/affectui-assistant/README.md); [API contract](research/affectui-assistant/api-contract.md) tái dùng cấu hình/xác thực backend workspace của Claude Code. Adapter chat có gửi tin, retry idempotent, hủy, history, upload, xóa và kết nối app. Chưa có backend chat live được cấu hình; khi chưa nối backend, giữ tin nháp và hiển thị lỗi đúng thay vì tạo câu trả lời giả.

## Gradient Floor + khung Agent Chat lớn hơn — 2026-10-20

Nền cả trang `/personalize?browse=1` là hiệu ứng **Gradient Floor** dựng lại từ `https://www.affectui.com/motion/gradient-floor` (chỉ quan sát preview công khai): hai lớp SVG làm mờ dâng lên từ mép dưới, năm điểm dao động hình sin chu kỳ 3 s, trôi ngang 2,5 s, dừng khi ra khỏi màn hình, reduced-motion giữ một tư thế tĩnh. Khung preview của bộ chọn rộng 256u thay vì 223u (cùng tỉ lệ 223:190), card chat lấp đầy khung, không còn viền xám (~384px trên laptop, rộng hơn card gốc 380px). Code `src/components/sites/affectui-gradient-floor/`; số đo, so hình (0,01% pixel lệch ở tư thế tĩnh), quyết định và giới hạn: [research/gradient-floor/README.md](research/gradient-floor/README.md). QA: `node scripts/qa/gradient-floor.mjs`, `node scripts/forensics/gradient-floor-compare.mjs`.

## Writing Assistant trong bộ chọn Guide me — 2026-10-20

Khung ảnh của hàng **Agent Chat** ở `/personalize?browse=1` nay là card chat chạy thật, dựng lại từ preview công khai `https://www.affectui.com/components/writing-assistant` (chỉ quan sát giao diện; không đọc/gọi code Pro). Card tự co theo khung với tỉ lệ cố định 223:190: màn dọc (≤ 899px) xếp danh sách trên – khung dưới, màn ngang giữ hai cột (màn ngang thấp tự co theo chiều cao). Gõ/chip/mic/New chat hoạt động ngay trong khung, không chuyển trang; bấm hàng Agent Chat (hoặc chạm lần hai) vẫn mở trang. Mic mặc định mô phỏng (không xin quyền, không gửi âm thanh); `speech="auto"` dùng `SpeechRecognition` của trình duyệt. Backend: prop `respond(message, { signal })`. Code: `src/components/sites/affectui-writing-assistant/`; chi tiết, số đo, phần tự quyết và giới hạn: [research/writing-assistant/README.md](research/writing-assistant/README.md). QA: `node scripts/qa/writing-assistant.mjs`, `node scripts/qa/guide-navigation.mjs`; so hình: `node scripts/forensics/writing-assistant-compare.mjs`.

## Backend API cho mọi section Guide me — 2026-10-20

Mọi dữ liệu của Guide me (Home, Companies, Contacts, Deals, Reports, Run, Settings, Mapping, Invoice, pipelines, shell) đi qua một lớp duy nhất: `src/lib/workspace-backend/`. Màn hình **không** gọi `localStorage` hay `fetch` trực tiếp; chúng đọc/ghi các *resource* được khai báo ở `src/components/sites/workspace-resources.ts` bằng `useResource` / `useQuery` (`react.tsx`).

- **Mặc định (không cấu hình gì): backend local.** Dữ liệu ở `localStorage` đúng các key cũ, đồng bộ giữa các tab, không có request nào ra ngoài. Toàn bộ QA cũ vẫn chạy trên chế độ này.
- **REST:** đặt `NEXT_PUBLIC_WORKSPACE_API_URL` hoặc `window.__workspaceBackendConfig = { baseUrl, headers, … }`. Hợp đồng route/JSON/status/phiên bản (If-Match), `changes` (create/update/delete theo id), `commands` (Mapping), query (`analytics`, `usage`, `invoices`, `plans`), command (`api-key.create`), upload (logo, avatar, document) và Run do server điều khiển (`serverRun: true`) nằm ở **`docs/backend-api.md`**. Hợp đồng này do phía FE định nghĩa, chưa có server nào; dùng `resolveUrl` nếu API thật khác route.
- **Backend khác:** hiện thực interface `WorkspaceBackend` (`types.ts`) và truyền vào `<WorkspaceBackendProvider backend>` (đặt trong `PersonalizeApp`).
- Hành vi chung: sửa hiện ngay, lưu sau ~400 ms (một request tại một thời điểm, luôn gửi giá trị mới nhất), tự thử lại khi mất mạng/5xx (3 lần), xung đột thì tải lại bản đã lưu, thanh trạng thái `SyncStatus` ở sidebar báo đang tải/đang lưu/lỗi + nút Retry. Dữ liệu server trả về được kiểm tra hình dạng trước khi vào UI; dữ liệu sai bị bỏ qua và báo lỗi, không làm hỏng màn hình. **Secret (giá trị API key) không bao giờ được gửi lên hoặc đọc lại**; server tạo key qua command và secret chỉ hiện một lần.
- Màn hình tính toán (Reports, usage/plans/invoices trong Settings) đọc qua `useQuery`: server không có dữ liệu (204/404) thì dùng dữ liệu mẫu kèm sẵn; server lỗi thì hiện dữ liệu mẫu **cùng thông báo lỗi và nút Retry**.
- Mapping và Invoice vẫn là component độc lập chỉ biết interface `dataSource` của riêng chúng; `BackendMapping.tsx` / `BackendInvoice.tsx` nối chúng với backend chung qua `createSnapshotSource`.
- Run: mặc định trình duyệt mô phỏng; khi `serverRun: true` server chạy agent, UI chỉ gửi hành động (`approve`, `deny`, `stop`, …) và hiển thị snapshot server trả về (poll), không chạy đồng hồ cục bộ.
- Kiểm thử: `npm test` (26 unit test cho route, version, retry, conflict, secret, query, upload, run), `node scripts/qa/backend.mjs [base-url]` (UI thật chạy với REST giả lập bằng Playwright). Bằng chứng ảnh nằm ở `docs/research/backend/`.
- Lưu ý: `useBrandedStoredState.ts` đã bị xóa vì `useResource` thay thế `useStoredState`; việc đổi Acme → Logio giờ chạy qua hook `normalize` của resource (`logioContent`).

## Model Picker trong New chat — 2026-10-20

Dropdown chọn model trong composer của **New chat** (Agent Chat) đã được thay bằng **Model Picker** dựng lại từ preview công khai `https://www.affectui.com/components/model-picker` (chỉ quan sát giao diện; phần code Pro không được đọc hay dùng, không gọi service nào của site đó). Tài liệu đầy đủ, bằng chứng đo và so sánh: `docs/research/model-picker/README.md`.

- Component độc lập: `src/components/sites/affectui-model-picker/` (`ModelPicker.tsx`, `model-picker-logic.ts`, `model-picker.css`). Menu là popover native (top layer nên không bị cắt), tự mở lên trên khi composer nằm dưới đáy (chế độ chat), danh sách cuộn có mờ viền khi cửa sổ thấp. Hover hàng thì thanh Speed/Quality/Cost đổ màu lần lượt, footer cuộn số first-token và giá; bật Extended thinking thì hàng Effort bung ra, bóng đèn sáng ở trigger, thời gian nhân ×1.6/×2.5/×4; Web search dùng chung trạng thái với plugin Web search. Bàn phím, aria, dark mode, touch, reduced motion đều có.
- Danh sách model ở `src/components/sites/affectui-assistant/assistant-models.ts` (Claude: Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5; ChatGPT: GPT-6 Astra, GPT-6.1 Sol, GPT-6 Luna; Gemini; Auto). **Lưu ý:** các thanh 1-5 là đánh giá của mình theo yêu cầu, không phải benchmark; thời gian first-token và giá/1M token là số tham khảo từ các trang tổng hợp của bên thứ ba, tên/id/giá của OpenAI là chưa kiểm chứng (các nguồn mâu thuẫn). Sửa file này cho khớp gói và backend của bạn; `id` của model chính là giá trị gửi lên API.
- API chat: `model` giờ là id cụ thể (id cũ `claude`/`chatgpt` đã lưu trong trình duyệt được tự chuyển sang `claude-sonnet-5-5`/`gpt-6-1-sol`), thêm `thinking` và `effort` (chỉ gửi khi bật thinking). Xem `docs/research/affectui-assistant/api-contract.md`.
- QA: `node scripts/qa/model-picker.mjs`, so sánh style với bản gốc `node scripts/forensics/affectui-model-picker-compare.mjs`; `scripts/qa/affectui-assistant.mjs` đã được cập nhật theo picker mới.

## Mapping — 2026-10-20

Guide me workspace có **Mapping** (sau Run, trước Settings) tại `/personalize?section=mapping`: bản đồ zoom Canvas 2D gồm team, project, task và người, lấp đầy khung workspace (không có container/tiêu đề riêng). Đây là bản dựng độc lập: chỉ lấy ý tưởng layout, lưới, camera fly-in, semantic zoom, tour và tương tác; không có API, terminal hay dữ liệu nào từ ARC. Dữ liệu mặc định là mẫu tên chung (User 1…21, Team 1…5, Project 1…21, Task 1…151) và **mọi thứ đều sửa được**: thêm/sửa/xóa team, project, task, checklist, người; kéo thả team/project; xuất/nhập JSON. Gắn backend qua `MappingDataSource` (xem [phân tách, mô hình dữ liệu, adapter và QA](research/mapping/README.md)). Code: `src/components/sites/mapping/`. QA: `node scripts/qa/mapping.mjs`; model/store: `node --experimental-strip-types --test src/components/sites/mapping/mapping-model.test.mjs`.

## Invoice — 2026-10-20

Section **Invoice** (`/personalize?section=invoice`, giữa Mapping và Settings): hóa đơn chỉnh sửa được với dòng thêm/xóa, tổng tiền cuộn trực tiếp và luồng "Save draft". Dựng độc lập theo UI kit quan sát được ở preview công khai (không dùng mã, API hay dữ liệu của nguồn); mọi trường sửa được, dữ liệu mặc định có tên chung, lưu qua `InvoiceDataSource` (mặc định `localStorage`). Đọc [số đo, hành vi, đối chiếu hình và giới hạn](research/invoice/README.md). QA: `node scripts/qa/invoice.mjs`; so hình: `node scripts/forensics/invoice-compare.mjs`.

Mapping: khi thu nhỏ, ô task đã hoàn thành (tick xanh) nay là **xanh lá**, task bị chặn đỏ, task chưa bắt đầu xám nhạt (đang làm là xám đậm, đang review xám vừa như cũ).

## Combobox — 2026-10-20

Mọi `<select>` trong workspace (CRM, Settings, Mapping) đã được thay bằng `src/components/sites/affectui-combobox/` (tự viết theo ý tưởng combobox affectUI, danh sách ở top layer nên hiện trên cả hộp thoại modal). Stripe clone, menu radio của affectUI và input date/month được giữ nguyên có chủ đích. Đọc [số đo, quét hiện trạng, phần tự quyết và QA](research/combobox/README.md). QA: `node scripts/qa/combobox.mjs`.

Ngày khảo sát: 2026-10-19. Bắt đầu bằng `AGENTS.md` và `.agents/skills/clone-website/SKILL.md`.

## Cập nhật 2026-10-20: bộ chọn Guide me (dựng lại từ video) và chia trang theo nhóm

Guide me desktop/mobile mở `/personalize?browse=1`: bộ chọn **Sales, Agent Chat, CRM, Project Management** dựng sát video người dùng (heading, nhãn đánh số, thanh active, khung ảnh với dải ảnh trượt dọc; mặc định mục thứ hai). Click/Enter mở trang vào của nhóm. **Mỗi trang thuộc đúng một nhóm và sidebar chỉ liệt kê trang của nhóm đó:** CRM = Home, Companies, Contacts, Deals, Reports + Pipelines (New business, Renewals, Partnerships); Agent Chat = Run, Settings; Sales = Invoice; Project Management = Mapping. Nhóm suy ra từ `?section=`, nên mọi link trực tiếp vẫn chạy; sang nhóm khác bằng **Explore pages** hoặc tìm kiếm workspace (Ctrl/Cmd+K). Hàng thứ tư chưa có ảnh nên dùng khung xám trung tính. Đọc [cách chia, số đo, motion và QA](research/guide-navigation/README.md). Implementation: `src/components/sites/guide-navigation/` (dữ liệu nhóm ở `navigation-model.ts`); QA: `node scripts/qa/guide-navigation.mjs`; QA khác chuyển nhóm qua `scripts/qa/lib/nav.mjs`.

## Kết quả và route

| Nguồn công khai | Route cục bộ | Phạm vi |
| --- | --- | --- |
| https://www.affectui.com/screens/crm | `/personalize` | Dựng app CRM trong preview, không dựng trang marketing/documentation bao ngoài |
| https://www.affectui.com/screens/crm/full | `/personalize` | Reference toàn màn hình cho đối chiếu trực tiếp |
| https://www.affectui.com/screens/analytics/full | `/personalize?section=reports` | Analytics trong Reports, dùng sidebar CRM |
| https://www.affectui.com/screens/settings-billing/full | `/personalize?section=settings` | Settings đầy đủ4 tab, dùng sidebar CRM |
| https://www.affectui.com/screens/agent-run/full | `/personalize?section=run` | Run dưới Reports: workflow, plan/activity, approval, inline diff |
| 109 trang thư viện | `docs/research/affectui-library/` | Hồ sơ khảo sát; đã dựng CRM + Analytics + Settings & Billing + Agent Run, còn 105 item tham khảo |

Navigation desktop giữ tên và biểu tượng **Guide me**, link `/personalize?browse=1`. Menu mobile có cùng link trong callout Company CRM. Trong menu tài khoản CRM và màn chọn có **Back to Stripe** để quay lại `/`.

Đây là bản dựng độc lập từ giao diện và hành vi preview công khai. Không có quyền truy cập mã nguồn Pro, API cài đặt có xác thực hoặc toàn bộ engine nội bộ của affectUI. Những phần đó chưa được lấy và không cần thiết để chạy CRM cục bộ.

## Clone engine của repo thực sự là gì?

Repo không có một hàm tự động chuyển mọi website thành React. Engine là workflow quan sát → lưu bằng chứng → dựng mã nguồn → kiểm tra:

1. `.agents/skills/clone-website/` là workflow chung cho Codex/Cursor/OpenCode/Claude. `.claude/commands/clone-website.md` chỉ dẫn tới workflow này.
2. `scripts/forensics/` dùng Playwright để khảo sát DOM, computed styles, assets, animation và chụp hình; `pixelmatch`/`pngjs` để so sánh.
3. Clone Stripe hiện có dùng DOM port + CSS reference được phân vùng + React controllers cho tương tác; Three.js xử lý các phần WebGL. Đọc ba tài liệu `docs/stripe-*` ghi trong AGENTS trước khi thay đổi Stripe.
4. Các stylesheet `src/styles/stripe/generated/` và `hds-*.css` là đầu ra được sinh. Sửa tại file overrides tương ứng, không ghi đè stylesheet gốc.
5. Next.js đang cài là **16.3.8**. Đọc guide trong `node_modules/next/dist/docs/` trước khi thay đổi conventions/router. Page là Server Component; CRM là client boundary.

Không thay homepage hoặc layout toàn cục khi thêm affectUI. Giao diện affectUI có namespace riêng và font Inter riêng.

## Bản đồ UI engine affectUI quan sát được

Toàn bộ danh mục công khai được lưu trong [inventory](research/affectui-library/README.md): **54 components, 12 screens, 11 blocks, 24 illustrations, 8 motion effects**. `engine-map.json` cho biết CSS module và namespace xuất hiện ở trang nào. Đây là bản đồ quan sát, không phải import graph từ source nội bộ: stylesheet toàn cục có thể xuất hiện dù component không hiển thị; đối chiếu thêm DOM roots và trạng thái trước khi tái dùng.

Những quy tắc xác minh trực tiếp trên CRM:

- **Shell `.ui-as` / `.ui-as-app`:** CSS variables `--page`, `--panel`, `--card`, `--ink`, `--line`, `--accent`, `--ease`; sidebar 220px, khoảng frame 8px, panel bo 18px. Main panel giữ toàn bộ chiều cao container.
- **Responsive theo container:** `@container ui-as (max-width: 900px)` đổi sidebar thành drawer; tới 600px giảm inset. Bảng giữ min-width 880px, cuộn bên trong. Không scale nguyên desktop thành mobile.
- **Dark mode:** selector ancestor `.dark` hoặc `[data-theme="dark"]` đổi token của shell và từng component. Local CRM dùng data-theme trên `.crm-page`, không đổi theme toàn bộ Stripe.
- **Chữ/icon:** Inter 400/500/600 đã có trong repo; SVG source là Hugeicons và logo công ty. Không thay toàn bộ bằng bộ icon khác nếu cần bám hình.
- **Motion:** layout sidebar 420ms, nội dung rise 380–420ms, easing `cubic-bezier(0.22,1,0.36,1)`, hover 140ms; tôn trọng reduced motion.
- **Composition:** CRM dùng shell + tab bar + `.ui-dt` table. Team strategy là board suy ra từ cùng danh sách company; Pixel integration là snippet và trạng thái kết nối; Sales docs dùng document cover bằng CSS.
- **State tách view:** không suy diễn chức năng backend từ preview. Public API của CRM có `workspace`, `user`, `className`, `onNavigate(label)`.

## File sở hữu và phần đã thực thi

| File | Trách nhiệm |
| --- | --- |
| `src/app/personalize/page.tsx` | Route, metadata, mount CRM |
| `src/components/sites/affectui-crm/Crm.tsx` | Shell, sidebar, drawer, workspace/user/view menus, favorite, onboarding, search |
| `crm-engine.ts` | Company schema, seed, cell conversion, lịch sử undo/redo dùng reducer |
| `CrmTable.tsx` | Spreadsheet: edit, tag picker, cell/range selection, bàn phím, TSV copy/paste, sort, bulk duplicate/delete, add row |
| `CrmViews.tsx` | Board, pixel demo, document covers và dialog |
| `WorkspacePages.tsx` | Home, Contacts CRUD, Deals và các pipeline có filter/export |
| `WorkspaceDocuments.tsx` | Folder, tạo/sửa/upload/download tài liệu |
| `WorkspaceEditors.tsx`, `WorkspaceDialog.tsx` | Profile, appearance/notifications, feedback, changelog, tạo workspace/view và native dialog có animation |
| `workspace-state.ts` | State lưu theo key trong browser, history/query navigation, CSV/download helpers |
| `workspace-interactions.css` | Motion và các màn tương tác mở rộng, được scope trong CRM |
| `src/components/sites/affectui-analytics/` | Reports: 3 period dataset, chart SVG tương tác, morph đường/số, CSV và saved reports |
| `src/components/sites/affectui-settings/` | Settings lazy-loaded: General, Members, Billing, API keys; xem brief riêng |
| `src/components/sites/affectui-run/` | Run lazy-loaded: simulation model, plan/activity, approval, draft diff; xem brief riêng |
| `reference.css` | CSS quan sát từ public preview; được sinh lại bởi prepare script |
| `crm-overrides.css` | Tích hợp và điều chỉnh cục bộ |
| `CrmIcon.tsx`, `icons.json`, `seed.json` | SVG tĩnh và dữ liệu lấy từ DOM công khai; không chạy remote bundle |
| `src/components/sites/affectui-fonts.css` | Inter dùng chung với hai affectUI component đã tồn tại |
| `src/components/stripe/Navigation/Navigation.tsx` | Entry Guide me desktop/mobile |

History undo/redo giới hạn 100 snapshot trong session. Company, contact, view tùy chỉnh, tài liệu/folder, saved report, kỳ báo cáo, checklist và favorite được lưu trong localStorage riêng từng workspace. Profile/preferences dùng chung tài khoản cục bộ. Refresh giữ dữ liệu; không có backend hoặc đồng bộ đa thiết bị. Acme khởi tạo bằng seed, Personal và workspace mới khởi tạo rỗng. Dữ liệu Analytics 7/30/90 ngày lấy từ preview gốc, độc lập với số liệu pipeline CRM.

Bàn phím: Enter/F2 sửa ô, Enter lưu và xuống hàng, Tab lưu và chuyển ô, Escape hủy, Arrow chuyển ô, Shift+Arrow chọn vùng, Delete/Backspace xóa vùng, Ctrl/Cmd+C/V cho TSV, Ctrl/Cmd+Z và Ctrl/Cmd+Shift+Z undo/redo. Ctrl/Cmd+K mở tìm kiếm. Board hỗ trợ kéo thả; có select Move to khi focus để dùng bàn phím.

## Nguồn bằng chứng

- `docs/research/affectui-crm/source-*.png`: desktop, mobile, drawer, bốn tab và các menu.
- `*-strategy.html`, `*-integration.html`, `sales-docs.html`, `stage-picker.html` và các `*.txt`: DOM/nội dung từng trạng thái.
- `assets.json`: URL asset thực tế đã tải. Fonts local dùng `/sites/affectui-usage-meter/fonts/inter-latin-{400,500,600}-normal.woff2`.
- `observed-styles.css`: CSS inject trong preview CRM. `icons.json`: SVG xuất từ DOM, không từ endpoint mã nguồn Pro.
- `comparison/`: ảnh source/local/diff, `metrics.json` ghi viewport, hình học và tỷ lệ pixel khác; `states.json` cho các tab phụ.
- `qa/results.json`: danh sách workflow đã kiểm tra và lỗi runtime.
- `docs/research/affectui-library/pages/<family>--<slug>.json`: nội dung docs/API công khai, controls, asset URLs, namespaces và style hashes của từng item. File PNG kế bên là viewport ban đầu. Chưa phải chứng cứ đầy đủ cho mọi animation/state của item đó.

## Lệnh làm việc

```powershell
npm run dev
# Mở http://localhost:3000/personalize, hoặc bấm Guide me trên homepage.

node scripts/forensics/affectui-inspect.mjs
node scripts/forensics/affectui-prepare.mjs
node scripts/forensics/affectui-library.mjs
node scripts/forensics/affectui-engine-map.mjs

node scripts/forensics/affectui-compare.mjs http://localhost:3000
node scripts/qa/affectui-crm.mjs http://localhost:3000
node scripts/forensics/affectui-analytics-compare.mjs http://localhost:3000
node scripts/qa/affectui-workspace.mjs http://localhost:3000
npm run check
```

Không chạy lại prepare sau khi sửa trực tiếp `reference.css`, `icons.json` hoặc `seed.json`: nó sẽ sinh lại các file đó. Sửa CSS mới trong overrides. Không commit production JS bundle của website làm implementation.

## Giới hạn và cách tiếp tục

- Pixel connection là mô phỏng; snippet Acme được hiển thị như văn bản, không được thực thi và không gửi tracking event. Trạng thái kết nối được giữ khi chuyển tab/refresh.
- Document gốc không được preview cung cấp. Bản local giữ cover gốc và bổ sung **workspace draft** có thể sửa/lưu/download; Pipeline Forecast có thể khởi tạo từ company hiện tại. File upload của người dùng được đọc/lưu cục bộ, giới hạn 2 MB mỗi file.
- Contacts có create/edit/delete/search/export. Profile và Appearance & notifications có form lưu thực tế trong browser; Help lưu feedback trên thiết bị, không gửi tới người khác. Full changelog mở nội dung chi tiết.
- New view tạo tab table/board có filter owner và lưu theo workspace. All views mở các tab. Preset Account executive/Partner manager lọc owner tương ứng. Đây là các workflow cục bộ bổ sung ngoài những state đã quan sát được trong public CRM demo.
- Board kéo thả và lựa chọn stage dùng chung model table; không giả định đó là toàn bộ nghiệp vụ của sản phẩm gốc.
- Reports có tooltip chuột/bàn phím/cảm ứng, chọn 7/30/90 ngày, ẩn/hiện series, thông tin metric/product, CSV thật và báo cáo đặt tên có thể mở/xóa. Xem [Analytics brief](research/affectui-analytics/README.md) cho đối chiếu và file ownership.
- Settings có General upload/name/region, member invite/role/remove, plan/cycle/cancel/resume, masked card/email, invoice CSV và demo API key create/copy/rename/revoke. State riêng workspace; không gửi email/thu tiền/cấp quyền API thật. Menu Settings và sidebar mở trang đầy đủ; appearance cũ giữ riêng. Xem [Settings brief](research/affectui-settings/README.md) cho kiểm tra20 viewport/state, regression và production performance.
- Run được đặt ngay dưới Reports và dựng hoàn toàn bằng React/CSS/SVG. Có5 bước/8 tool calls, đồng hồ, stop/retry/replay, approval gate, plan editing/drag, payload disclosure/clipboard và9 diff suggestions/Undo. Run và draft lưu riêng theo workspace. Share xuất JSON thật; View in Chat mở transcript cục bộ. Không gửi email/calendar hoặc gọi LLM thật. Xem [Run brief](research/affectui-run/README.md) cho kiến trúc, motion và QA.
- Motion chạy theo tương tác: shared selection pill, crossfade màn/tab/menu, layout animation khi sort/thêm/xóa/di chuyển card, accordion, native dialog, số và SVG path morph khi đổi period. Tôn trọng reduced motion; không có vòng lặp cập nhật dữ liệu giả khi người dùng không thao tác.
- Classic variants, toàn bộ trạng thái của 105 item khác và backend không được inventory desktop ban đầu xác minh. Phải khảo sát thêm item đang dựng.
- Kiểm tra pixel chỉ áp dụng viewport/state đã ghi trong JSON; không coi phần trăm này là bằng chứng mọi state giống tuyệt đối.
- `npm run check` có thể in 4 warning có sẵn ở `capture-nav-menus.mjs`, `products/build_css.mjs`, `Footer.tsx`, `Stats.tsx`. Phần CRM mới phải không có lint error.

Kết quả bản mở rộng: 11 nhóm workflow CRM và 17 nhóm workspace/Analytics đã qua, không có page error. Bộ workspace kiểm tra cả dữ liệu sau refresh, tách workspace, file export/upload và intermediate frame của path animation. Analytics so riêng phần main content vì sidebar cố ý giữ CRM: 0,052–0,308% pixel khác ở 390/768/1024/1440/1920. Số đo hiện hành nằm trong các `comparison/metrics.json`; ảnh Sales docs có thêm toolbar chức năng ngoài reference gốc.

## Prompt tiếp nối cho Claude Code

> Đọc AGENTS.md, docs/affectui-handoff.md và skill clone-website. Mở docs/research/affectui-library/README.md và tìm item cần dựng trong manifest/engine-map. Đọc JSON, ảnh và CSS hash của item đó; khảo sát thêm public preview để ghi rõ trigger/state/responsive. Tái dùng shell/tokens/fonts và cơ chế state phù hợp của affectui-crm, viết React/TypeScript có thể sửa, không import bundle production. Giữ nguyên các route Stripe. Chạy workflow thật bằng Playwright, so ảnh cùng viewport/state, sau đó npm run check. Báo rõ phần chưa quan sát hoặc đang mô phỏng.
# Files / Agent Chat — 2026-10-20

**Files** mở `/personalize?section=files`, sau **New chat** trong Agent Chat; thư mục con dùng `&folder=...`. Dựng React/CSS riêng dựa trên public preview `https://www.affectui.com/screens/files/full`, không dùng API/bundle của affectUI. Có filter/search/sort, grid/list, tạo/sửa/chia sẻ/xóa thư mục, tạo/sửa/di chuyển/tải/xóa file mẫu, upload file thật với retry/cancel và drag/drop. Thư mục dùng chung với composer của chat. Binaries local lưu IndexedDB; dữ liệu đi qua `useResource`, REST và multipart upload dùng backend chung. Đọc [brief, bằng chứng, file ownership và QA](research/affectui-files/README.md), [API contract cho BE](research/affectui-files/api-contract.md). Chưa có BE live được cấu hình; mock REST đã kiểm tra auth, multipart, revision, retry và 401. Rename/delete thư mục cần hai resource saves; atomic transaction và blob GC thuộc BE. UI ở `src/components/sites/affectui-files/`, CSS tự viết trong `files.css`.

## Invoice & Credit Note — 2026-10-21

Invoice at `/personalize?section=invoice` now replaces the previous single-sheet invoice with an independently authored React/CSS clone of the public `https://www.affectui.com/blocks/invoice-credit` preview. The block has the observed paper-stack/tab/checkmark motion, per-line credit amount limits and issue/edit states; no Pro source, production bundle, screenshot renderer or iframe is used. Workspace extensions include live invoice editing (parties, dates, metadata, currency, per-line quantity/rate/tax/group, payment link and notes), multiple saved invoices, search/sort/open, duplicate/delete, validated JSON import, CSV/JSON download and a dedicated browser print/Save as PDF layout.

Ownership stays in `src/components/sites/invoice/`, with `InvoiceBlock.tsx`, `InvoiceEditor.tsx`, `invoice-export.ts`, the rewritten `Invoice.tsx` and v2 model. Captured CSS is in `invoice-reference.css`; local fixes belong in `invoice.css`. The shared `invoice` backend resource and browser key stay the same; the v1 singleton is migrated to a v2 library on load. Save errors and revision conflicts retain edits, and issue only appears successful after persistence succeeds. Default storage is per-workspace browser storage; this change does not configure a live API or execute payments/refunds. Read [reference scope, functions and evidence](research/invoice-credit/README.md) and the [API contract](research/invoice-credit/api-contract.md) before extending it.

Verification: 8 model tests, 13 browser workflow groups and 4 authenticated REST mock groups; zero recorded runtime errors. Eight settled source/local comparisons at natural block widths 760/620/390/320px have identical heights and 0.129–0.470% differing pixels. Typecheck and production build pass. The attempted full `npm run check` was stopped by a lint error in the concurrently edited `src/components/sites/agent-process/AgentTree.tsx` (`react-hooks/set-state-in-effect`); Invoice-targeted lint passes. Results are in `docs/research/invoice-credit/qa/` and `comparison/`. Current entry points: `node scripts/qa/invoice-credit.mjs`, `node scripts/qa/invoice-credit-backend.mjs`, `node scripts/forensics/invoice-credit-compare.mjs`. Old invoice QA/compare commands forward to the new ones; the shared backend QA's invoice section now expects v2.

Final verification update: the concurrent AgentTree lint issue has been fixed. Re-running full `npm run lint` now exits 0 (seven unrelated existing warnings); `npm run typecheck` and the final `npm run build` also exit 0. Production smoke passes for rendering, live totals and save/reload. All 13 Invoice browser groups, 4 REST mock groups and 8 model tests pass. The earlier failed combined-check attempt is superseded by these final successful individual checks.

## Process map (Agent Tree) — 2026-10-21

`/personalize?section=process` is a full-bleed **map**: one block in the middle, the others around it, joined by arrows (no title/breadcrumb/toolbar rows; floating name pill, run bar, dock and a settings panel that opens when a block is clicked). Cards come from an independently authored rebuild of the public preview of affectUI's Agent Tree (`https://www.affectui.com/components/agent-tree`; no Pro source, host API or CLI), in `src/components/sites/affectui-agent-tree/`. People create blocks, choose a **role** (coordinator, planner, coder, fixer, reverter, revoker, instructor, helper, processor) and an **AI block** (Claude, Claude Code, OpenAI, Codex, Gemini, Kimi, Hermes Agent, Ollama, Qwen, DeepSeek, Mistral, a person, custom), add tools, approvals and cost limits, drag blocks (kept as `pos`), and can switch to a Tree view. Brand marks come from the MIT-licensed `@lobehub/icons-static-svg@1.95.1` via `scripts/forensics/agent-tree-ai-marks.mjs`.

The page never calls a model. A deterministic simulated engine is the default; a REST engine (`serverProcess: true`) is the integration point for local LLMs/chat bots: routes and JSON are in "Process (engine)" of `docs/backend-api.md`. Read `docs/research/process/README.md` (files, data, limits) and `docs/research/agent-tree/README.md` (analysis of the preview) before extending. The Figma board in the request was private (403), so the map layout follows the request's description, not that board.

The Skilled (Context window) frame in Guide me is now full-bleed like the other frames (`affectui-context-window/context-window.css`: stepped container-query zoom instead of a trig `zoom`, which WebKit mishandles).

Verification: `npm test` (194 pass, includes layout/run/engine/history/tree tests), `node scripts/qa/process.mjs` (28/28: Chromium, touch emulation, WebKit, mocked REST), lint and typecheck clean, `combobox.mjs` and `delegate-board.mjs` pass. `guide-navigation.mjs`, `guide-touch.mjs` and `agent-lanes.mjs` fail because they assume four Guide me groups / no image in the CRM preview; the fifth group (Skilled) predates this work and those scripts were not updated. Not tested on a physical iPhone; simulated costs and durations are demo values.

## Connections, loops, roles, 93 AI engines and Tracing — 2026-10-21

**Process** now lets the person decide every connection: drag from the `+` handle of the selected block onto any other block (or use "Connect this block to" in the settings panel). A connection back to an earlier block is a **loop** (the blocks from there run again, up to N rounds, each round asks its approvals again); any other connection makes its target wait. A closed-loop template ("Closed loop: ship to production") wires Planner, Creator, Coder, QA ⇄ Fixer, Reviewer and a Deployer that asks a person and loops back to the Coordinator. Roles gained **QA, Creator and Reviewer**, and each role has a guide in the settings panel (when to use it, what to give it, what it passes on, what to watch for, sub-blocks and next roles to add in one click). The AI picker lists **93 engines** (80 more in `agent-roster.ts`) with real logos from `@lobehub/icons-static-svg@1.95.1` (88 marks). Two bugs were fixed on the way: edges anchored at a stale block size (arrows ended far from the block on the way down), and undo merging every edit to one block within a second.

**Tracing** (`/personalize?section=tracing`, third section after Process) shows the run of a process on a Trace Waterfall rebuilt from the public preview of `https://www.affectui.com/components/trace-waterfall` (no Pro source, API or CLI): live bars, a "now" line, a ladder axis, folding, a details window, keyboard, dark mode and a stacked phone layout, plus performance cards (parallelism, waiting on people, critical path, time by block, by engine). It only reads: the same plans and run as the Process page, re-read every 1.5 s so a run started in another tab appears live. Calls inside a block are derived (demo values) for the simulated engine; a connected engine may report real ones (`calls`). Read `docs/research/trace-waterfall/README.md` (observed rules, the axis ladder, differences) and `docs/research/process/README.md` ("Connections and loops", "Roles", "AI engines", "Tracing"); the contract for `links`, `round`/`rounds`/`runId`, `waitedFrom` and `calls` is in "Process (engine)" of `docs/backend-api.md`.

Files: `src/components/sites/affectui-trace-waterfall/`, `src/components/sites/tracing/`, `process/trace-build.ts`, `process/run-model.ts` (loops and waits as a pure function), `process/LinkEditor.tsx`, `process/agent-roster.ts`, `process/roles.ts`.

Verification: `npm test` (243 pass), `node scripts/qa/process.mjs` (35/35), `node scripts/qa/tracing.mjs` (20/20), lint and typecheck clean. Not tested on a physical iPhone; the simulated engine decides nothing by itself ("until it passes" is a round count, not a judgement).

## Multi-delete, run notifications and loading skeletons — 2026-10-22

**Process**: Ctrl / Cmd (or Shift) + click chooses several blocks (Ctrl + A all, Escape lets go); Delete removes the group after one confirmation, as one undo step; dragging one block moves the group. **Run notifications**: a Notification Stack rebuilt from the public preview of `https://www.affectui.com/components/notification-stack` (no Pro source, API or CLI) pops up under the name pill when a block finishes, fails (with its reason and Retry) or the run ends (with a link to Tracing). Details, differences from the source and the layout reasoning: `docs/research/notification-stack/README.md`.

**Loading skeletons**: a Shimmer Loader rebuilt from the public preview of `https://www.affectui.com/motion/shimmer-loader` (shared, viewport-pinned sweep; `Skeleton`, `ShimmerText`) draws the frame of every workspace page while it loads: a skeleton per kind of page (`shimmer-loader/SectionSkeleton.tsx`), after a 140 ms delay so a fast load never flashes. This also fixes **every reload showing the Companies page first**: the server now reads `?section=` / `?crm-view=` and passes the route down (`InitialRouteProvider` in `workspace-state.ts`), the workspace shows the page's skeleton until its core resources have been read once, and the store's hydration snapshot says "loading" like the server. Details: `docs/research/shimmer-loader/README.md`.

Files: `src/components/sites/affectui-notification-stack/`, `src/components/sites/shimmer-loader/`, `process/run-notices.ts`, `process/ProcessPage.tsx` (group + notices), `process/ProcessMap.tsx` (group drag), `affectui-crm/Crm.tsx` (boot gate), `affectui-crm/workspace-state.ts` (initial route), `lib/workspace-backend/store.ts` (hydration snapshot).

Verification: `npm test` (260 pass), `node scripts/qa/process.mjs` (48/48), `node scripts/qa/skeleton.mjs` (8/8), `node scripts/qa/tracing.mjs` (20/20); CRM, workspace, mapping, invoice, settings and combobox QA still pass; lint, typecheck and build clean. Not tested on a physical iPhone. Note for later: `background-attachment: fixed` (the shared sweep) is ignored by iOS Safari, where each block sweeps on its own.

## Run notifications as a star beside the block — 2026-10-22

The Process map no longer keeps the Notification Stack in its top left corner. Each block that finished, failed or ends the run carries a small blinking four-point star (`process/NoticeSparks.tsx`, `notice-spark-model.ts`, `notice-spark.css`), and clicking it opens that block's notices as a Notification Stack card right next to the block. Reading a quiet notice removes it; a failure stays until the block runs again (Retry in the card). A star whose block is off screen is pinned to the edge of the map. The Tree view keeps the stack under the name pill. Details: `docs/research/notification-stack/README.md`. Verification: `npm test` (267 pass), `node scripts/qa/process.mjs` (52/52), lint and typecheck clean. Not tested on a physical iPhone.

## Invoice stamp — 2026-10-22

Sales → Invoice → **Mark as paid** opens a date picker (day/month/year wheels, kind Paid/Received/Approved/Due, five inks) that turns into a stamping scene: the card becomes a 3D rubber stamp (die, sole, housing, in the same camera as the paper), the camera tilts onto the invoice's own sheet, the stamp drops, presses and lifts, leaving a red/blue/green/violet/black impression; a toast offers Undo (the scene plays backwards) and Done (the paper settles flat, Download PDF / Next invoice). The stamp is stored on the invoice (`InvoiceData.stamp?: { kind, date, ink }`, validated by `normalizeInvoice`, in the CSV, the JSON export and the print layout, and not copied by Duplicate). Analysis of the recording, what was measured and the corrections made after review: `docs/research/invoice-stamp/README.md`.

Files: `src/components/sites/invoice/` (`StampStage.tsx`, `Stamp3D.tsx`, `stamp-timeline.ts`, `stamp-geometry.ts`, `stage-clock.ts`, `stage-paint.ts`, `DateWheel.tsx`, `StampMark.tsx`, `InvoicePaper.tsx`, `invoice-stamp-model.ts`, `invoice-stamp.css`); `InvoiceBlock.tsx` now exports `InvoiceSheetBody`. Fonts: `public/fonts/barlow-condensed-700.woff2` (impression lettering, OFL). Verification: `npm test` (280 pass), `node scripts/qa/invoice-stamp.mjs` (22/22). Not tested on a physical iPhone.


## Skilled workspace - 2026-10-22

### Activity terrain (added to /skilled, 2026-10-22)

A 3D terrain of the workspace's operations, deliveries and errors by hour, under the library and the realtime stream. Rebuilt from the public UIArc Activity terrain preview by recording the polygons its canvas draws and fitting camera, springs, framing and colours (no screenshot, bundle, API or Pro source). Read [Activity terrain](research/uiarc-terrain/README.md) before extending it: it lists every measured value, the validation numbers and the honest gaps. Code: `src/components/sites/skilled/terrain/` (pure `terrain-*.ts` + `ActivityTerrain.tsx`); tests: `terrain.test.mjs` with `docs/research/uiarc-terrain/fixtures/`; QA: `node scripts/qa/terrain.mjs`. With no recorded events a labelled sample week is shown; nothing is simulated.

`/skilled` now reuses the workspace shell and replaces the old standalone context-window preview. Independent public-UIArc Agent Tasks + Realtime Stream reconstruction, commit-pinned skill-folder imports with per-file SHA-256/provenance, per-workspace local/REST resources, portable local installer and receipt-validated agent transfer. Read [Skilled research and handoff](research/uiarc-skilled/README.md) before extending it. Code: `src/components/sites/skilled/`; GitHub importer: `src/lib/skilled/` and `src/app/api/skilled/import/`; QA: `node scripts/qa/skilled.mjs`. Supporting files inside the GitHub skill folder are bundled; external dependencies and a real database/agent backend are not included. No simulated operation readings or model correctness scores.


## Storage knowledge library ? 2026-10-23

**Storage** follows Skilled / Repo in the same group, at `/personalize?section=storage`. Read [Storage research and handoff](research/storage/README.md): all 13 supplied public UIArc/affectUI component references have local owners, measured rendered-preview evidence and explicit adaptations. React/CSS/SVG only; no source-site API, registry, Pro code, prompt, screenshot/iframe or remote component bundle.

The first-visit illustrated guide leads to a real document queue: PDF/DOCX/XLSX/text extraction, SHA-256 duplicate detection, chosen Finance/Banking/SQL/Data subjects, lexical passages and keywords, review of actual source text, then approval to store originals and indexes. The Treemap shows real file counts/bytes and drills from subject to format to file. Original-only extraction failures are visible. No AI or generated summaries are claimed. Full indexes/originals live in IndexedDB; light metadata uses workspace `knowledge-library`. A read-back receipt prevents a swallowed localStorage quota failure from showing Complete; save retry and deletion preserve originals until metadata is verified.

Code: `src/components/sites/storage/`; QA: `node scripts/qa/storage.mjs` (17 workflow checks), `node scripts/qa/storage-controls.mjs` (22), Dropzone integrated checks (17), plus guide/run and injected storage-failure/cancel checks. Source/local desktop/mobile/dark captures in `docs/research/storage/`. The PDF.js worker is generated locally before dev/build. All Storage styles are authored and scoped.


### Storage backend integration

Storage now uses `WorkspaceBackend.knowledge` for server originals, complete text indexes, authenticated original/ZIP downloads, full-text search and deletion, with the same workspace auth/config/resource versions as other pages. The built-in home server implements all routes under `/workspaces/{id}/storage/`; data persists under `LOGIO_DATA_DIR`. A new device needs no browser cache to use its documents. Metadata polling reflects other devices. Remote cache failures do not prevent server writes; API errors expose retry. Read [Storage API contract](research/storage/api-contract.md). QA: `node scripts/qa/storage-backend.mjs` (11 actual API/two-session checks with a disposable authenticated production server), plus browser-only regression. Docker build argument/data volumes/script context are prepared; no Docker CLI is available to run the image here.
