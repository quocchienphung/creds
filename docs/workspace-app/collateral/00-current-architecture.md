# 00 · Kiến trúc hiện tại và điểm tích hợp (Gate A)

> Tài liệu an toàn để commit: không chứa dữ liệu khách hàng; mọi con số lấy từ hai file tham chiếu đều được làm tròn.

## Stack thực tế (đã kiểm tra, không giả định)

| Hạng mục | Giá trị |
| --- | --- |
| Framework | Next.js **16.3.8** (App Router, Turbopack), React 19.2.4, TypeScript strict |
| Node | `>=24` (đang chạy 24.21) |
| UI | Design system affectUI tự dựng (class `ui-as-*`, `ui-sb-*`, `ui-seg`, `ui-button`), `lucide-react`, `motion` 13 |
| Validation có sẵn | `zod` 4 (dependency trực tiếp) |
| ZIP/XML | `fflate` 0.8.3 (dependency trực tiếp, MIT) – `storage-extract.ts` đã dùng nó đọc XLSX |
| Test | `node --experimental-strip-types --test "src/**/*.test.mjs"` (module thuần `.ts` import bằng đuôi `.ts`) |
| State phía dữ liệu | `useResource` / `resources.*` (`src/lib/workspace-backend`), backend local `localStorage` hoặc REST/home-server |
| Worker | Chưa có Web Worker nào trong repo → engine mới tạo worker đầu tiên |

## Đường đi của `?section=excel-formation` và `?section=json-formation`

1. `src/app/personalize/page.tsx` → client boundary `Crm` (`affectui-crm/Crm.tsx`). `Crm` bọc mọi thứ trong `CollateralProvider` để file Excel đang mở sống qua việc chuyển giữa hai mục.
2. `useWorkspaceRoute()` đọc `?section=`; `"Excel formation"` và `"JSON formation"` nằm trong `workspaceSections`.
3. Hai mục nạp lazy (`dynamic`), skeleton `files` / `settings`.
4. Nhóm Guide me **Rules** (`guide-navigation/navigation-model.ts`) chứa hai mục; trong sidebar chúng nằm dưới thư mục **Collateral** (`sidebarFolders` trong `Crm.tsx`, component `SidebarFolder` dựng từ block Sidebar của UIArc, xem `docs/research/uiarc-sidebar-block/`).
5. Mục Excel formation có số lỗi nghiêm trọng đang mở; JSON formation có chấm xanh khi JSON sẵn sàng (`useCollateralBadges`).

## Cấu trúc thư mục

```
src/components/sites/collateral/
  CollateralProvider.tsx   một file, hai mục (worker, bộ lọc, kế hoạch JSON)
  shell.tsx  Stepper.tsx   breadcrumbs, file chip, tab bước (dùng chung)
  engine/                  Web Worker, giao thức, client
  excel-formation/         MỌI logic Excel: engine/ (đọc, phát hiện, rà soát, vá XLSX), gallery/ (mặt file + kính lúp), steps/
  json-formation/          MỌI logic JSON: engine/ (gom nhóm, schema, kiểm tra xuất, kiểm toán), steps/
```

## Điểm sửa dự kiến

- `src/components/sites/collateral/**` (mới: engine thuần + UI).
- `src/components/sites/storage/StorageDropzone.tsx`: chỉ **thêm prop tùy chọn** (`accept`, `hint`, `inputLabel`, `multiple`); mặc định giữ nguyên.
- `src/components/sites/i18n/vi-credit.ts`: bản dịch.
- `.gitignore`: đã chặn file tham chiếu bí mật và đầu ra sinh ra từ chúng.

## Ma trận tái sử dụng

| Nhu cầu | Có sẵn → dùng | Ghi chú |
| --- | --- | --- |
| Upload/Dropzone | `storage/StorageDropzone` (+ `storage-dropzone.css`) | thêm prop tùy chọn; có hàng đợi, tiến độ, thử lại |
| Tabs/Stepper | `.ui-as-tabs` + pill `layoutId` (mẫu `SettingsBilling`) | stepper 5 bước dùng cùng pill |
| Table | `.ui-sb-table` + `.ui-sb-table-wrap` | cần **ảo hóa** (windowing) – repo chưa có; viết hook nhỏ cố định chiều cao dòng |
| Drawer/Modal | `affectui-crm/WorkspaceDialog` (`<dialog>` native) | dùng cho xác nhận/xuất |
| Badge/Status | `.ui-sb-pill[data-tone]` | thêm tone `red` trong `credit.css` (chỉ scope `.credit`) |
| Progress | `storage/StorageRun` / thanh `shm` | dùng thanh tiến độ thật từ worker |
| Toast | prop `notify` của `Crm` | |
| Confirm | `skilled/ui/ConfirmMorph`, `ActionButton` | cho "chấp nhận ngoại lệ" và xuất file |
| Download | `downloadFile`, `toCsv` (`workspace-state.ts`) | thêm `downloadBlob` cho XLSX/JSON |
| Segmented | `.ui-seg` | bộ lọc mức độ |
| Gallery + kính lúp | **mới**: dựng lại từ preview công khai UIArc Product gallery | xem `docs/research/product-gallery/` |

## Mô hình bảo mật dữ liệu

- Backend của app có thể **từ xa** (REST/home-server) → file Excel **không bao giờ** đi qua `useResource`/`fetch`. Toàn bộ đọc, quét, vá, xuất chạy trong **Web Worker trên trình duyệt**; chỉ siêu dữ liệu không nhạy cảm (nếu có) mới được lưu.
- Trạng thái rà soát (giá trị gốc, sửa đổi) **chỉ nằm trong bộ nhớ** theo mặc định. Không `localStorage`/IndexedDB tự động.
- Không có telemetry, log hay snapshot chứa giá trị ô.
