# Báo cáo `bc-doanh-thu-nganhhang-ldtd` — "Báo cáo doanh thu theo ngành hàng (LDTD)"

Tài liệu triển khai riêng cho ĐÚNG 1 báo cáo này — dành cho team IT/DBA thực
hiện từng bước. File NGẮN vì báo cáo này DÙNG LẠI NGUYÊN VẸN nguồn dữ liệu
(VIEW/job đồng bộ) đã có cho "Báo cáo doanh thu theo ngành hàng" gốc — xem
**`báo cáo doanh thu-nhập hàng theo ngành hàng.md`** TRƯỚC (mục 2 "Nguồn
dữ liệu DSMART16", mục 3 "Đồng bộ (ETL)") để tạo VIEW `V_HCRC_DOANHTHU_NGANHHANG`
+ job đồng bộ domain `doanhthu_nganhhang` nếu chưa từng làm.

## 1. Báo cáo này làm gì

Y HỆT báo cáo "Doanh thu theo ngành hàng" gốc (`bc-doanh-thu-nganhhang`) —
cùng công thức, cùng nguồn dữ liệu thực đạt (domain `doanhthu_nganhhang`) —
**CHỈ KHÁC Chỉ tiêu**: báo cáo này đọc Chỉ tiêu từ domain RIÊNG
(`sales-targets-nganhhang-dt-ldtd`), để đội **Lãnh đạo Tập đoàn (LDTD)** tự
nhập Chỉ tiêu độc lập, không đụng chạm/ghi đè Chỉ tiêu của báo cáo gốc
(nhóm quản lý khác, trang etl-admin khác — xem "Chỉ tiêu Doanh thu theo
ngành hàng" vs "Chỉ tiêu Doanh thu theo ngành hàng (LDTD)").

## 2. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Đã có VIEW + job đồng bộ `doanhthu_nganhhang` chạy ổn (xem `báo cáo doanh thu-nhập hàng theo ngành hàng.md` mục 2-3) | — (dùng lại, không làm thêm nếu đã có) |
| 2 | Chạy script tạo báo cáo | IT/Dev |
| 3 | Đội LDTD nhập Chỉ tiêu riêng | Admin etl-admin (đội LDTD) |
| 4 | Gán quyền xem báo cáo | Admin rp-user |
| 5 | Kiểm tra báo cáo có số liệu | IT/Dev |

Thiếu bước 1 thì "Thực đạt" **luôn = 0/trống** — không phải lỗi, chỉ là
chưa có dữ liệu nguồn (phần này DÙNG CHUNG với báo cáo gốc, đã có thì
không cần làm lại).

## Bước 2 — Tạo báo cáo

```bash
cd rp-server
node scripts/seedNganhHangReports.js [menuCode]   # mặc định reports-mua-hang
```

Script tạo CẢ 3 báo cáo ngành hàng cùng lúc (gốc, nhập hàng, LDTD) —
`ReportId = bc-doanh-thu-nganhhang-ldtd`, `SourceType = 'composite'`,
`targetDomain = 'sales-targets-nganhhang-dt-ldtd'` (khác `targetDomain`
của báo cáo gốc). Chạy lại an toàn (idempotent, khớp theo `ReportId`,
KHÔNG đụng 2 báo cáo kia nếu đã tồn tại).

## Bước 3 — etl-admin: nhập Chỉ tiêu riêng cho LDTD

Vào **"Chỉ tiêu Doanh thu theo ngành hàng (LDTD)"** (menu
`sales-targets-nganhhang-dt-ldtd`, KHÁC trang "Chỉ tiêu Doanh thu theo
ngành hàng" của báo cáo gốc) — upload Excel shape "generic" (xem
`etl/lib/salesTargetsImport.js:parseGenericShape()`): để TRỐNG `MaSieuThi`,
điền `MaNganhHang` (= `DEPT_ID`) + cột `ChiTieuDoanhThu` — Chỉ tiêu nhập
THEO TOÀN CÔNG TY, không tách chi nhánh.

## Bước 4 — Gán quyền xem

Vào **Hệ thống → Phân quyền**, tick `bc-doanh-thu-nganhhang-ldtd` cho
đúng vai trò cần xem (script Bước 2 KHÔNG tự gán quyền).

## Bước 5 — Kiểm tra

Mở báo cáo trên rp-user → "Thực đạt"/"Cùng kỳ năm trước" khớp ĐÚNG với
báo cáo "Doanh thu theo ngành hàng" gốc (cùng nguồn dữ liệu). Sửa thử 1
dòng Chỉ tiêu ở "Chỉ tiêu Doanh thu theo ngành hàng (LDTD)" → CHỈ báo cáo
này đổi "Chỉ tiêu"/"Tỷ lệ đạt", báo cáo gốc (`bc-doanh-thu-nganhhang`)
**KHÔNG đổi** — xác nhận 2 domain Chỉ tiêu độc lập, không ghi đè nhau.
