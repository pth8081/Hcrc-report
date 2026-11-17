# Báo cáo `bc-check-lech-thue-rvorder` — "Check lệch thuế RV_ORDER"

Tài liệu triển khai riêng cho báo cáo MỚI (bản 10.80, theo yêu cầu người
dùng, dựa trên file mẫu thật `Check_RV_ORDER_33317_10_2026_15_00_00.xlsx`
đội vận hành đang tự xuất tay để rà soát — đã xác nhận lại với DBA
DSMART16 17/11/2026).

## 1. Báo cáo này làm gì

Tự động phát hiện các chứng từ **nhập/xuất trả hàng NCC** (`RV_ORDER`,
`TRANS_CODE = '315'`) đang **LỆCH giữa mã thuế và giá trị thuế** — tức là
chứng từ có khai `Mã thuế` (vd T1/T5, nghĩa là CÓ chịu thuế) nhưng
**`Giá trị thuế` lại ghi 0** (đáng lẽ phải có giá trị thuế tương ứng nếu
mã thuế không phải miễn thuế).

**Mỗi dòng gồm**: ngày, số chứng từ, mã hàng, 2 mã NHÀ CUNG CẤP khác nhau:
- **Mã/Tên NCC nội bộ** — NCC dùng để MUA CHUNG với FJ (mã cố định, theo
  DBA xác nhận — gần như luôn là `251000000005` ở thời điểm viết tài liệu
  này).
- **Mã/Tên NCC thực giao** — NCC THẬT SỰ giao hàng cho chứng từ đó (khác
  nhau tuỳ chứng từ).

Báo cáo CHỈ liệt kê các dòng ĐANG LỆCH (lọc sẵn trong VIEW nguồn) — không
phải toàn bộ `RV_ORDER`, giống đúng tinh thần "cảnh báo"/"kiểm tra" như
`bc-canh-bao-ton.md`.

## 2. Nguồn dữ liệu

VIEW MỚI `dbo.vw_CheckLechThueRVOrder` trên CSDL `DSMART16` — xem SQL đầy
đủ tại "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Check lệch thuế
RV_ORDER (DSMART16 trung tâm).sql".

**Đã xác nhận với DBA DSMART16 (17/11/2026)**:
- `RV_ORDER.OSTK_ID` = Mã NCC NỘI BỘ (NCC mua chung với FJ).
- `RV_ORDER.SUPP_ID` = Mã NCC THỰC GIAO.
- "Lệch giữa mã thuế và giá trị thuế" = `TAX_CODE` KHÔNG phải miễn thuế
  (`'K0'`/rỗng) NHƯNG `TAX_AMT` = 0.

Cả 2 mã NCC đều JOIN sang `dbo.SUPPLIER.SUPP_NAME_U` để lấy tên hiển thị
(theo đúng quy ước bắt buộc ở `CLAUDE.md` — không hiện mã trần).

**Watermark** — dùng CHÍNH `EventDate` (=`TRAN_DATE`) làm cả `DateColumn`
lẫn `UpdatedAtColumn`, theo ĐÚNG tiền lệ domain `don_dat_hang` (cùng nguồn
`RV_ORDER`/`STRANS`) — xem `etl/scripts/seedDonDatHangSync.js`: cột
`STOPED_DT` đã xác nhận ra NULL HẾT khi test thật trên domain đó, không
dùng được làm watermark.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Check lệch thuế RV_ORDER (DSMART16 trung tâm).sql" trên CSDL `DSMART16` | DBA |
| 2 | Chạy `node etl/scripts/seedCheckLechThueRVOrderSync.js` (thư mục `etl/`) — tạo job đồng bộ, tái dùng Nguồn dữ liệu "DSMART16 - Live" đã có | Admin etl-admin / IT-Dev |
| 3 | Chờ job đồng bộ chạy xong ít nhất 1 lượt (etl-admin → Đồng bộ → xem "Lần chạy gần nhất") | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedCheckLechThueRVOrderReport.js [menuCode]` (thư mục `rp-server/`) — mặc định đặt ở menu `reports-mua-hang` ("Báo cáo Mua hàng") | Admin rp-user / IT-Dev |
| 5 | Vào Hệ thống → Phân quyền, gán quyền xem `bc-check-lech-thue-rvorder` cho đúng vai trò cần dùng | Admin rp-user |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo — tại thời điểm viết tài liệu này, GẦN NHƯ TOÀN BỘ chứng từ
`TRANS_CODE = '315'` đang lệch (đã xác nhận bằng dữ liệu thật), nên báo
cáo PHẢI ra khá nhiều dòng, KHÔNG rỗng. Nếu rỗng, kiểm tra lại bước 1-3
(VIEW/job đồng bộ).

Chọn 1 dòng bất kỳ, đối chiếu lại trực tiếp trên DSMART16 (`SELECT * FROM
RV_ORDER WHERE TRANS_NUM = '<số chứng từ trên báo cáo>'`) — `TAX_CODE`
phải khác `'K0'`/rỗng và `TAX_AMT` phải đúng bằng 0, khớp với báo cáo.

**Lưu ý nghiệp vụ**: đây là lỗi dữ liệu ĐANG TỒN TẠI PHỔ BIẾN trên
DSMART16 tại thời điểm làm báo cáo này (không phải lỗi hiếm/cá biệt) —
cần đội vận hành/kế toán xem lại quy trình nhập liệu `TAX_AMT` cho chứng
từ `TRANS_CODE=315`, báo cáo này chỉ có nhiệm vụ PHÁT HIỆN, không tự sửa
dữ liệu nguồn.
