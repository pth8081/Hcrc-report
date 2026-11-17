# Báo cáo `bc-thay-doi-gia-tuc-thoi`/`bc-thay-doi-gia-tu-thoi-diem` — "Thay đổi giá"

Tài liệu triển khai riêng cho 2 báo cáo MỚI (bản 10.79, theo yêu cầu người
dùng, dựa trên file mẫu thật `Price_Changes_18_10_2026_07_00_02.xlsx` đối
tác/đội vận hành đang tự xuất tay — ghi chú ngay trong file chỉ rõ nguồn
dữ liệu thật, đã xác nhận lại bằng dữ liệu thật 17/11/2026).

## 1. Báo cáo này làm gì

Theo dõi **lịch sử thay đổi giá bán** (giá cũ → giá mới) theo từng mã
hàng + vùng giá — 2 báo cáo RIÊNG vì 2 nghiệp vụ khác nhau:

- **"Thay đổi giá bán tức thời"** (`bc-thay-doi-gia-tuc-thoi`) — mỗi lần
  giá bán lẻ 1 mã hàng ở 1 vùng giá được đổi NGAY LẬP TỨC (admin DSMART
  sửa giá, áp dụng liền, không chờ ngày nào), hệ thống tự ghi lại 1 dòng
  log TẠI ĐÚNG THỜI ĐIỂM đổi.
- **"Thay đổi giá từ thời điểm"** (`bc-thay-doi-gia-tu-thoi-diem`) — các
  ĐỢT thay đổi giá được **LÊN LỊCH TRƯỚC** (vd đợt khuyến mãi/điều chỉnh
  giá Tết, lên lịch cả tháng trước), áp dụng vào ĐÚNG 1 ngày tương lai cụ
  thể (`Ngày áp dụng`) — tại thời điểm xem báo cáo, giá "Giá cũ" vẫn ĐANG
  là giá hiện hành thật (chưa đổi), "Giá mới" là giá SẼ áp dụng.

**KHÔNG có công thức tính phức tạp** — chỉ hiển thị lại đúng 2 giá trị cũ/
mới đã ghi nhận sẵn trên DSMART16, không tự tính toán gì thêm.

## 2. Nguồn dữ liệu

2 VIEW MỚI trên CSDL `DSMART16`:
- `dbo.vw_ThayDoiGiaTucThoi` — xem "deploy/VIEW DSMART16 (trung tâm)/Thiết
  lập VIEW Thay đổi giá bán tức thời (DSMART16 trung tâm).sql". Nguồn gốc
  bảng `dbo.HISRTPR` (log thay đổi giá NGAY LÚC xảy ra, cột `[DATE]` là
  thời điểm thật, luôn có giá trị — KHÔNG có rủi ro NULL watermark như vài
  domain cũ đã gặp) + JOIN `dbo.SKU_DEF`/`dbo.DEPTLIST` để lấy tên hàng/
  ngành hàng (theo đúng quy ước bắt buộc ở `CLAUDE.md`).
- `dbo.vw_ThayDoiGiaTuThoiDiem` — xem "deploy/VIEW DSMART16 (trung tâm)/
  Thiết lập VIEW Thay đổi giá từ thời điểm (DSMART16 trung tâm).sql".
  Nguồn gốc bảng `dbo.RTPRPRG` (các đợt thay đổi giá lên lịch trước, watermark
  = `MODI_DATE`). `MaThucThe` ghép `PR_DOC + SKU_ID + ZONE_CODE` — **KHÔNG**
  dùng cột `IDX` (đã xác nhận bằng dữ liệu thật: `IDX` KHÔNG phải số thứ
  tự duy nhất trong 1 đợt, nhiều mã hàng khác nhau cùng đợt có thể trùng
  `IDX`).

2 domain HOÀN TOÀN TÁCH BIỆT: `thaydoigia_tucthoi` và `thaydoigia_tuthoidiem`
— không dùng chung VIEW/job đồng bộ với nhau hay với bất kỳ domain giá nào
khác (`giaban_zone_sku`/`vung_gia_stk`/`mavach_mahang` ở api-server — xem
"api-gia-ban-cho-doi-tac.md" — đó là domain giá HIỆN TẠI/snapshot, khác
hẳn mục đích LỊCH SỬ THAY ĐỔI của 2 domain này).

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy CẢ 2 file `.sql` ở mục 2 trên CSDL `DSMART16` | DBA |
| 2 | Chạy `node etl/scripts/seedThayDoiGiaSync.js` (thư mục `etl/`) — tạo 2 job đồng bộ, tái dùng Nguồn dữ liệu "DSMART16 - Live" đã có | Admin etl-admin / IT-Dev |
| 3 | Chờ cả 2 job đồng bộ chạy xong ít nhất 1 lượt (etl-admin → Đồng bộ → xem "Lần chạy gần nhất") | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedThayDoiGiaReports.js [menuCode]` (thư mục `rp-server/`) — tạo 2 báo cáo trong danh mục; mặc định đặt ở menu `reports-kinh-doanh` ("Báo cáo kinh doanh"), truyền tham số khác nếu muốn đặt menu khác | Admin rp-user / IT-Dev |
| 5 | Vào Hệ thống → Phân quyền, gán quyền xem `bc-thay-doi-gia-tuc-thoi`/`bc-thay-doi-gia-tu-thoi-diem` cho đúng vai trò cần dùng — mặc định KHÔNG ai xem được, kể cả admin | Admin rp-user |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo "Thay đổi giá bán tức thời" — lọc Mã hàng = `1001601567` (mã
hiển thị/`SKU_CODE` của "Sầu riêng tách vỏ L1", `SKU_ID` nội bộ là
`296015670000` — đã dùng để xác nhận bằng dữ liệu thật 17/11/2026) — phải
thấy đúng dòng ngày 28/10/2026, vùng giá "001", Giá cũ = 399.000, Giá mới
= 409.000 (khớp đúng VIEW đã kiểm tra khi tạo).

Mở báo cáo "Thay đổi giá từ thời điểm" — nếu đang có đợt thay đổi giá nào
đã lên lịch (vd các đợt "TDG ..." đã thấy khi điều tra), phải thấy đúng
Ngày áp dụng ở tương lai, Giá cũ = giá hiện hành thật lúc đó, Giá mới =
giá sẽ áp dụng.

Cả 2 báo cáo: lọc theo Khoảng ngày/Ngành hàng/Mã hàng/Vùng giá đều phải
hoạt động đúng (bộ lọc tự đọc danh sách thật từ dữ liệu đã đồng bộ, không
cần khai tay).
