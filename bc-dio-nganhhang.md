# Báo cáo `bc-dio-nganhhang` — "DIO theo ngành hàng" (nhóm Báo cáo vận hành)

Tài liệu triển khai riêng cho báo cáo mới (bản 11.32, theo yêu cầu người
dùng — báo cáo ĐẦU TIÊN trong 4 báo cáo "Báo cáo vận hành" mới, xem phương
án đã gửi "phuong-an-4-bao-cao-van-hanh.md" mục 3 "DIO theo ngành hàng",
ưu tiên 1). Đọc file này TRƯỚC khi sửa
`rp-server/lib/dioNganhHangRunner.js`, `rp-server/scripts/seedDioNganhHangReport.js`,
`etl/scripts/seedTonKhoGtriNganhHangSync.js`, hoặc VIEW nguồn.

## 1. Báo cáo này làm gì

**DIO** (Days Inventory Outstanding) = số ngày tồn kho hiện tại đủ dùng,
tính theo tốc độ bán ra gần đây — DIO cao = tồn quá nhiều (vốn chết, rủi
ro hết hạn/lỗi mốt), DIO thấp = sắp hết hàng. Mỗi dòng = 1 siêu thị (mã
Điểm) × 1 ngành hàng.

**Công thức** (⚠️ GIẢ ĐỊNH, CHƯA CHỐT với người dùng — không trích được
công thức Ô THẬT từ file Excel mẫu "11_Cần nắm tháng 11.2026..." sheet
"DIO MCH2", chỉ đối chiếu vài dòng mẫu khớp xấp xỉ. Nếu số ra lệch nhiều
so với file mẫu, báo lại — chỉ cần sửa `rp-server/lib/dioNganhHangRunner.js`,
KHÔNG cần đụng VIEW/ETL):

```
DIO (ngày) = Giá trị tồn hiện tại ÷ (Giá vốn bán ra TRUNG BÌNH 3 THÁNG gần nhất ÷ 30)
```

"3 tháng gần nhất" lấy xấp xỉ 90 ngày (`COGS_WINDOW_DAYS` trong runner),
KHÔNG chia đúng theo ranh giới tháng dương lịch — đơn giản hoá, sai lệch
không đáng kể.

## 2. Nguồn dữ liệu

### 2a. "Giá trị tồn" — domain MỚI `tonkho_gtri_nganhhang`

VIEW mới `dbo.V_HCRC_TONKHO_NGANHHANG` trên CSDL `DSMART16` trung tâm (xem
`deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Tồn kho Giá trị theo
Ngành hàng (DSMART16).sql`) — gộp `STK_INFO` theo (`STK_ID`, `DEPT_ID`):

```sql
GiaTriTon = SUM((M_BEGIN + M_IMP - M_EXP) * AVERIMPPR)
```

Tái dùng NGUYÊN VẸN 2 điều ĐÃ CHỐT ở 2 tài liệu khác (KHÔNG công thức mới):
`SoLuongTon = M_BEGIN + M_IMP - M_EXP` (đã chốt ở "bc-ton-kho-chi-tiet.md"),
giá vốn đơn vị = `STK_INFO.AVERIMPPR` (đã chốt ở "giá vốn dsmart.md" mục 3
— CHỈ đáng tin cho thời điểm HIỆN TẠI, đúng nhu cầu ở đây).

### 2b. "Giá vốn bán ra 3 tháng" — domain ĐÃ CÓ `doanhthu_nganhhang`

KHÔNG cần VIEW/job mới — domain này đã chạy sẵn cho báo cáo "Doanh thu
theo ngành hàng" (xem "báo cáo doanh thu-nhập hàng theo ngành hàng.md").
Giá vốn/ngày = `DoanhThu − LaiGop` (vì `DoanhThu = AMOUNT+SURPLUS`,
`LaiGop = SURPLUS`, nên hiệu số = `AMOUNT` = đúng phần giá vốn — xem "giá
vốn dsmart.md" mục 8), cộng dồn 90 ngày gần nhất ngay trong runner.

### 2c. Gộp theo mã Điểm

Cả 2 domain cùng khoá entityCode `"<STK_ID>_<DEPT_ID>"` — dịch `STK_ID` →
mã Điểm qua `etl.DiemStkMapping` (`lib/diemStkMapping.js:buildStkIdLookup()`,
ĐÃ CÓ SẴN, dùng chung bảng "Ánh xạ Điểm - STK_ID" ở etl-admin) — 1 mã Điểm
gồm nhiều mã kho STK_ID thì CỘNG DỒN cả `GiaTriTon` lẫn `GiaVon90Ngay`
trước khi tính DIO. Kho chưa khai ánh xạ — BỎ QUA (không đoán tên).

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy `deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Tồn kho Giá trị theo Ngành hàng (DSMART16).sql` | DBA |
| 2 | Chạy `node etl/scripts/seedTonKhoGtriNganhHangSync.js` (cần đã có Nguồn dữ liệu "DSMART16 - Live" — chạy `seedLdtdHcrcSync.js` trước nếu chưa) | Admin etl-admin / IT-Dev |
| 3 | Xác nhận domain `doanhthu_nganhhang` đã chạy ổn (xem "báo cáo doanh thu-nhập hàng theo ngành hàng.md") — KHÔNG cần làm gì thêm nếu đã có | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedDioNganhHangReport.js` | IT/Dev |
| 5 | Gán quyền xem báo cáo "DIO theo ngành hàng" (Hệ thống → Phân quyền) | Admin rp-user |
| 6 | Kiểm tra báo cáo có số liệu đúng | IT/Dev |

## 4. Kiểm tra sau khi triển khai

1. Chạy riêng VIEW (`SELECT TOP 20 * FROM dbo.V_HCRC_TONKHO_NGANHHANG ORDER BY GiaTriTon DESC`) trên DSMART16 — phải ra `GiaTriTon` dương ở hầu hết dòng.
2. etl-admin → Đồng bộ → "Chạy thử" job "Tồn kho Giá trị theo Ngành hàng - Live (DSMART16)" — không lỗi.
3. Mở báo cáo "DIO theo ngành hàng" trên rp-user — mỗi dòng có đủ Mã điểm/Tên điểm/Mã ngành/Tên ngành/Giá trị tồn/Giá vốn BQ tháng/DIO; đối chiếu vài dòng với sheet "DIO MCH2" của file Excel mẫu người dùng gửi — DIO lệch nhiều (không phải sai số làm tròn) thì báo lại để chỉnh công thức.
4. "Xuất Excel" — xác nhận ra đủ dữ liệu (không bị cắt bởi giới hạn hiển thị 100-200 dòng trên web).

## 5. Việc CHƯA làm (phạm vi báo cáo này, xem phương án gốc)

Báo cáo "Kế hoạch nhập hàng tháng" (từ CÙNG file Excel mẫu "Cần nắm tháng")
là 1 báo cáo RIÊNG, phức tạp hơn (trộn số liệu BAS ngoài + điều chỉnh tay)
— KHÔNG nằm trong phạm vi báo cáo này, xem
`phuong-an-4-bao-cao-van-hanh.md` mục 3 — ưu tiên 3, làm sau.
