# Báo cáo `bc-doanh-thu-sku-nganhhang`/`bc-doanh-thu-sku-nganhhang-ldtd` — "Doanh thu theo ngành hàng - theo mã hàng"

Tài liệu triển khai riêng cho 2 báo cáo MỚI (bản 10.41, theo yêu cầu người
dùng) — đọc file này TRƯỚC khi sửa
`rp-server/scripts/seedDoanhThuSkuNganhHangReports.js`,
`etl/scripts/seedDoanhThuSkuNganhHangSync.js`, hoặc VIEW nguồn.

## 1. Báo cáo này làm gì

2 báo cáo "Doanh thu theo ngành hàng" (HCRC) và "(LDTD)" đã có
(`bc-doanh-thu-nganhhang`/`bc-doanh-thu-nganhhang-ldtd`, xem "báo cáo
doanh thu-nhập hàng theo ngành hàng.md") đọc VIEW `V_HCRC_DOANHTHU_NGANHHANG`
— VIEW đó CỘNG GỘP SẴN theo (siêu thị, ngành hàng, ngày), nên KHÔNG thể
lọc theo Mã hàng (dữ liệu mã hàng đã mất khi gộp).

2 báo cáo MỚI này là bản XEM CHI TIẾT TỪNG MÃ HÀNG (1 dòng = 1 siêu thị +
1 mã hàng + 1 ngày) của ĐÚNG domain Doanh thu theo ngành hàng — cho phép
lọc thêm theo **Mã hàng** (đa chọn + tìm kiếm + dán danh sách, giống các
báo cáo mua hàng/đơn đặt hàng), ngoài Ngành hàng/Siêu thị/Khoảng ngày sẵn
có. Đây là 2 báo cáo HOÀN TOÀN MỚI, KHÔNG sửa/ảnh hưởng 2 báo cáo gốc.

**Công thức Doanh thu/Lãi gộp**: NGUYÊN BẢN giống 2 báo cáo gốc — xem
"báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục 2 (dựa trên
`STRANS.TRANS_CODE`/`AMOUNT`/`SURPLUS`, 211/221/232 = bán, 212/222 = trả,
318 = hàng hỏng hủy tách riêng). CHỈ KHÁC: KHÔNG gộp `SKU_ID` vào `GROUP
BY` — giữ lại từng mã hàng làm 1 dòng riêng.

⚠️ **Đánh đổi dung lượng đã xác nhận với người dùng**: VIEW gốc ra ~1
dòng/(siêu thị, ngành hàng, ngày); VIEW này ra ~1 dòng/(siêu thị, MÃ
HÀNG, ngày) — nhiều hơn hàng trăm/hàng nghìn lần số dòng đồng bộ mỗi
ngày, tuỳ số mã hàng đang hoạt động.

⚠️ **Phạm vi bản 10.41 — CHỈ "Phase 1 — hệ gốc/trung tâm"**: domain mới
`doanhthu_sku_nganhhang` chỉ đọc DSMART16 trung tâm (Live). CHƯA làm bản
"Lịch sử (DSMART16_EOM)"/"(Thành viên)" — có thể thêm sau nếu cần, mirror
đúng `etl/scripts/seedNganhHangSync.js --with-history`/
`seedThanhVienHistorySync.js`.

⚠️ **Vị trí menu — khác với yêu cầu ban đầu của người dùng**: người dùng
đề nghị đặt ở "Báo cáo tự do" — ĐÃ KIỂM TRA kỹ thuật: `reports-adhoc`
(menu "Báo cáo tự do") route sang HẲN 1 trang khác
(`rp-user/src/pages/AdhocReportPage.jsx`, self-service kiểu Power-BI, bộ
lọc theo mã chỉ là `<select multiple>` đơn giản, KHÔNG hỗ trợ
SearchableSelect tìm kiếm+dán danh sách) — KHÔNG đặt được 1 báo cáo
admin-định-nghĩa (`app.ReportCatalog`, có bộ lọc Mã hàng kiểu
SearchableSelect) vào đó. Đã tạm đặt 2 báo cáo này ở menu **"Báo cáo
kinh doanh"** (`reports-kinh-doanh`, cạnh 2 báo cáo "Doanh thu theo ngành
hàng" gốc, cùng chủ đề) — đổi tham số `menuCode` khi chạy
`seedDoanhThuSkuNganhHangReports.js` nếu muốn đặt ở menu khác
(`reports-mua-hang`/`reports-van-hanh`).

## 2. Nguồn dữ liệu

VIEW MỚI `dbo.V_HCRC_DOANHTHU_SKU_NGANHHANG` trên CSDL `DSMART16` — xem
SQL đầy đủ tại "deploy/Thiết lập VIEW Doanh thu theo Mã hàng-Ngành hàng
(DSMART16 trung tâm).sql" (đã tạo + merge ở bản 10.40 cùng lúc với fix
khác — file SQL có từ bản đó, báo cáo dùng nó mới thêm ở bản 10.41).

Cột quan trọng: `MaThucThe` (khoá, `STK_ID + '_' + SKU_ID`), `STK_ID`,
`MaHang` (=`SKU_ID`), `MaHangHienThi` (=`SKU_CODE`, mã hiển thị),
`TenHang` (=`SKU_DEF.FULL_NAME_U`), `MaNganhHang` (=`DEPT_ID`),
`TenNganhHang` (=`DEPTLIST.DEPT_NAME_U`), `WORK_DATE`, và các cột đo
(`SoLuongBan`/`DoanhThu`/`DoanhThuBanLe`/`DoanhThuBanBuon`/`LaiGop`/
`LaiGopBanLe`/`LaiGopBanBuon`/`GiaTriHongHuy`).

**Siêu thị**: báo cáo lọc theo `STK_ID` thô của VIEW, dịch sang tên thật
qua "Ánh xạ Điểm - STK_ID" (`etl.DiemStkMapping`, `lib/diemStkMapping.js`
— KHÔNG đọc tên trực tiếp từ STOCK/VIEW, theo đúng quy ước bắt buộc ở
`CLAUDE.md`) — dùng lại NGUYÊN cơ chế `translateStkViaDiemStkMapping`
(bản 10.39, xem `bc-nhap-hang-nganhhang` trong "báo cáo doanh thu-nhập
hàng theo ngành hàng.md"), KHÔNG lặp lại giải thích ở đây.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy "deploy/Thiết lập VIEW Doanh thu theo Mã hàng-Ngành hàng (DSMART16 trung tâm).sql" trên CSDL `DSMART16` | DBA |
| 2 | Chạy `node etl/scripts/seedDoanhThuSkuNganhHangSync.js` (thư mục `etl/`) — tạo job đồng bộ `doanhthu_sku_nganhhang`, tái dùng Nguồn dữ liệu "DSMART16 - Live" đã có | Admin etl-admin / IT-Dev |
| 3 | Chờ job đồng bộ chạy xong ít nhất 1 lượt (etl-admin → Đồng bộ → xem "Lần chạy gần nhất") | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedDoanhThuSkuNganhHangReports.js [menuCode]` (thư mục `rp-server/`, mặc định `reports-kinh-doanh` nếu không truyền tham số) — tạo 2 báo cáo | IT/Dev |
| 5 | Gán quyền xem 2 báo cáo (Hệ thống → Phân quyền → đúng vai trò) | Admin rp-user |
| 6 | Kiểm tra theo mục 4 dưới đây | IT/Dev |

Script ETL (bước 2) tự kiểm tra VIEW đã tồn tại đúng cột cần thiết trước
khi tạo job — báo lỗi rõ ràng nếu chưa chạy bước 1.

## 4. Cách kiểm tra sau khi triển khai

1. Mở "Báo cáo kinh doanh" (hoặc menu đã chọn ở bước 4) → phải thấy 2
   báo cáo mới: "Báo cáo doanh thu theo ngành hàng - theo mã hàng" và
   "Báo cáo doanh thu theo ngành hàng (LDTD) - theo mã hàng".
2. Mở bộ lọc "Mã hàng" → phải hiện đúng tên hàng thật (không phải mã
   trần/NULL) — thử dán 1 danh sách nhiều mã hàng (mỗi mã 1 dòng) vào ô
   tìm kiếm → phải tự chọn đúng các mã khớp (giống báo cáo mua hàng).
3. Mở bộ lọc "Siêu thị" → phải hiện tên siêu thị thật (không phải mã
   kho trần/`"(chưa khai tên)"` cho mã ĐÃ khai tên trong Ánh xạ Điểm -
   STK_ID).
4. Chạy báo cáo với 1 khoảng ngày + 1 vài mã hàng cụ thể → đối chiếu
   Doanh thu/Lãi gộp của TỔNG các mã hàng đó, so với báo cáo gốc
   "Doanh thu theo ngành hàng" lọc cùng ngành hàng/siêu thị/khoảng ngày —
   2 số liệu PHẢI khớp (cùng công thức, chỉ khác mức chi tiết).
