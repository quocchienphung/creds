// The sheets Flip shows while the conversion logic is not written yet. The Collateral pages run on a UI simulation that receives only a file's name
// and size, never its bytes, so Flip does the same: this is a SAMPLE workbook, labelled as one on the page, chosen to hold the cells that make a CSV
// hard to write by hand (commas, quotes, line breaks, codes with leading zeros, empty cells, accents).

export interface SampleSheet { name: string; /** The first row is the header. */ rows: string[][] }

export const SAMPLE_ASSETS: SampleSheet = {
  name: "Sample assets",
  rows: [
    ["Mã TS", "Tên tài sản", "Địa chỉ", "Giá trị (VND)", "Ngày mua", "Ghi chú"],
    ["00101", "Máy chủ Dell PowerEdge R750", "Kho A, 12 Lê Lợi, Hà Nội", "185000000", "2025-03-14", ""],
    ["00102", "Xe tải Hyundai 5 tấn", "Bãi xe số 3 Đà Nẵng", "740000000", "2024-11-02", "Bảo hiểm đến 11/2026"],
    ["00103", "Laptop 14\" Latitude 5440", "Văn phòng chính", "28500000", "2026-01-20", "Đã cấp cho phòng Kế toán"],
    ["00104", "Nhà xưởng và quyền sử dụng đất", "Lô B7, KCN Tân Bình, TP.HCM", "6200000000", "2019-06-30", "Thế chấp: ngân hàng A\nGiấy chứng nhận số 0012"],
    ["00105", "Máy in màu Canon", "Tầng 2", "12400000", "2025-08-09", ""],
    ["00106", "Bàn họp 3 m", "Phòng họp 1", "8900000", "2022-02-17", ""],
    ["00107", "Xe nâng điện Toyota", "Kho B Hải Phòng", "310000000", "2023-09-05", "Bảo trì mỗi 6 tháng"],
    ["00108", "Máy chiếu \"Epson\" EB-L200", "Phòng đào tạo", "54000000", "2024-04-28", ""],
    ["00109", "Hệ thống camera (32 mắt)", "Toàn bộ khuôn viên", "96000000", "2025-12-01", "Gồm đầu ghi và ổ cứng"],
    ["00110", "Máy phát điện 500 kVA", "Khu kỹ thuật", "420000000", "2021-10-11", ""],
    ["00111", "Giá kệ kho", "Kho A", "67000000", "2020-05-22", ""],
    ["00112", "Điều hòa trung tâm", "Tòa nhà chính, tầng 1–5", "880000000", "2022-08-30", "Hết bảo hành 08/2027"],
  ],
};

export const SAMPLE_LOOKUPS: SampleSheet = {
  name: "Lookups",
  rows: [
    ["Mã", "Nhóm"],
    ["01", "Thiết bị CNTT"],
    ["02", "Phương tiện"],
    ["03", "Nhà xưởng"],
    ["04", "Nội thất"],
    ["05", "Máy móc, thiết bị"],
  ],
};

export const SAMPLE_SHEETS: readonly SampleSheet[] = [SAMPLE_ASSETS, SAMPLE_LOOKUPS];
