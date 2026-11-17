# Báo cáo `bc-ban-buon-chi-tiet` — "Bán buôn chi tiết theo khách hàng"

Tài liệu triển khai riêng cho báo cáo MỚI (bản 10.81, theo yêu cầu người
dùng, dựa trên file mẫu thật `Ban_buon_chi_tiet_ngay_07.11.2026.xlsx`/
`...08.11.2026.xlsx` đội vận hành đang tự xuất tay — đã xác nhận lại với
DBA DSMART16 17/11/2026).

## 1. Báo cáo này làm gì

Chi tiết các giao dịch **BÁN BUÔN** (khác bán lẻ — đã có sẵn khái niệm
này trong `doanhthu_nganhhang`/`doanhthu_sku_nganhhang`, công thức
`DoanhThuBanBuon` dựa trên `TRANS_CODE = '211'`/`'212'`) — nhưng ở mức
chi tiết HƠN: **1 dòng/(siêu thị, khách hàng, mã hàng, ngày)**, kèm đầy
đủ thông tin khách hàng (tên, nhóm, cấp, mã số thuế) — việc mà 2 báo cáo
"Doanh thu theo ngành hàng" hiện có KHÔNG làm được (chỉ gộp theo ngành
hàng, không có khái niệm khách hàng).

**Công thức**:
- `Doanh thu` = `AMOUNT + SURPLUS` (211 trừ 212) — giống hệt
  `DoanhThuBanBuon` đã chốt ở "báo cáo doanh thu-nhập hàng theo ngành
  hàng.md".
- `Doanh số` = `AMOUNT + SURPLUS + VAT_AMT` (211 trừ 212) — GIÁ TRỊ GỒM
  THUẾ (cột MỚI, chưa có domain nào khác dùng) — đã xác nhận khớp CHÍNH
  XÁC với số liệu thật trong file Excel mẫu.

## 2. Nguồn dữ liệu

VIEW MỚI `dbo.vw_BanBuonChiTiet` trên CSDL `DSMART16` — xem SQL đầy đủ
tại "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Bán buôn chi tiết
theo khách hàng (DSMART16 trung tâm).sql".

**Đã xác nhận bằng dữ liệu thật + DBA (17/11/2026)**:
- Giao dịch bán buôn: `dbo.STRANS` với `TRANS_CODE IN ('211','212')`.
- Nối sang khách hàng BUÔN qua cặp cột `OSTK_ID`/`OSTK_TYPE = '04'`
  (**KHÔNG** phải `CUST_ID` — bảng `STRANS` không có cột này).
- Bảng khách hàng DOANH NGHIỆP/bán buôn là `dbo.DEALER` (**KHÔNG** phải
  `dbo.CUSTOMER` — bảng đó chỉ chứa khách lẻ/thành viên cá nhân, mã bắt
  đầu "23..."). `TAX_ID` = mã số thuế, `GRP_ID` = nhóm khách (`cs_grp`
  trong file mẫu), `CS_LEVEL` = cấp khách (`cs_level`).
- Mã hàng/Tên hàng/Mã vạch/Ngành hàng: JOIN `dbo.SKU_DEF`/`dbo.DEPTLIST`
  (theo đúng quy ước bắt buộc ở `CLAUDE.md`).
- Nhà cung cấp mặt hàng: `STRANS.SUPP_ID` JOIN `dbo.SUPPLIER.SUPP_NAME_U`.

**Tên siêu thị**: VIEW chỉ trả `STK_ID` thô. Báo cáo dùng
`translateStkViaDiemStkMapping` cho bộ lọc "Siêu thị" (dropdown hiện tên
CHUẨN để chọn) — nhưng **CỘT KẾT QUẢ trong bảng CHỈ hiện "Mã kho"** (rp-server
hiện CHƯA có cơ chế dịch tên siêu thị ở tầng hiển thị kết quả, khác hẳn
api-server — xem `rp-server/scripts/seedDoanhThuSkuNganhHangReports.js`
cũng làm y hệt vậy, KHÔNG phải thiếu sót riêng của báo cáo này).

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Bán buôn chi tiết theo khách hàng (DSMART16 trung tâm).sql" trên CSDL `DSMART16` | DBA |
| 2 | Chạy `node etl/scripts/seedBanBuonChiTietSync.js` (thư mục `etl/`) — tạo job đồng bộ, tái dùng Nguồn dữ liệu "DSMART16 - Live" đã có | Admin etl-admin / IT-Dev |
| 3 | Chờ job đồng bộ chạy xong ít nhất 1 lượt (etl-admin → Đồng bộ → xem "Lần chạy gần nhất") | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedBanBuonChiTietReport.js [menuCode]` (thư mục `rp-server/`) — mặc định đặt ở menu `reports-kinh-doanh` ("Báo cáo kinh doanh") | Admin rp-user / IT-Dev |
| 5 | Vào Hệ thống → Phân quyền, gán quyền xem `bc-ban-buon-chi-tiet` cho đúng vai trò cần dùng | Admin rp-user |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo — lọc Khách hàng = "Công ty TNHH Maersk" (mã `240000000018`) —
phải thấy nhiều dòng mã hàng khác nhau, đúng mã số thuế "0303728327",
nhóm khách "4003", cấp khách "1" (khớp dữ liệu đã xác nhận 17/11/2026).

Đối chiếu 1 dòng bất kỳ với file Excel mẫu gốc (nếu còn giữ) — `Doanh số`
phải bằng `Doanh thu + VAT` (vd 252.777,78 + 20.222,22 = 273.000,00).
