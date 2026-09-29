# Giá vốn bình quân gia quyền — nguồn dữ liệu DSMART16

Tài liệu tham chiếu chính thức cho cách tính "giá vốn" dùng trong báo cáo
HCRC (cả "Lãi gộp" ở "Báo cáo nhanh doanh thu" lẫn báo cáo "Báo cáo giá vốn"
riêng) — **đọc file này TRƯỚC khi sửa bất kỳ công thức giá vốn nào**, và
**cập nhật lại file này mỗi khi công thức/nguồn dữ liệu thay đổi**, cùng quy
ước với "quy tắc mã BU_ID và STK_ID.md"/"báo cáo doanh thu cuối ngày.md".

## 1. Vì sao không dùng bảng `COSTPRICE`

Bản 7.6 từng sửa VIEW `V_HCRC_DOANHTHU_CHINHANH` để tính "Lãi gộp" từ
`COSTPRICE.COSTPRICE` (JOIN theo `SKU_ID + MEC_YM + NODE_ID`). Sau khi sửa
xong lỗi nhân dòng, "Tỷ lệ Lãi gộp" vẫn ra gần 0% hoặc ÂM ở hầu hết chi
nhánh — **đã xác nhận bằng dữ liệu thật, KHÔNG dùng được cột này**:

- Đối chiếu 10 mã hàng bán chạy nhất tại 1 chi nhánh thật (ST HÀNG TRỐNG,
  STK_ID `10011`, tháng 9/2026): `COSTPRICE.COSTPRICE` gần như TRÙNG KHỚP
  tuyệt đối với giá bán bình quân thật (`SUM(AMOUNT)/SUM(QTY)` từ
  `STRANS`) — có mã khớp y hệt tới từng đồng (vd `33056.000000` =
  `33056.00`).
- Kiểm tra thêm các cột giá khác trong `COSTPRICE` (`MINPRICE`,
  `MAXPRICE`, `RTPRICE`, `MARGIN`, `MUTPRICE`) đều = 0.00 ở MỌI dòng đã
  kiểm — không có cột nào khác chứa giá vốn thấp hơn giá bán.
  `COSTPRICE.COSTPRICE` = `COSTPRICE.TRFPRICE` chính xác ở mọi dòng đã
  kiểm.
- **Kết luận**: bảng `COSTPRICE` (dù tên nghe hợp lý) không phản ánh giá
  vốn nhập hàng thật — có thể là giá bán/giá niêm yết hoặc giá tham chiếu
  khác. KHÔNG dùng bảng này để tính Lãi gộp.

## 2. Nguồn đã xác nhận dùng được: bảng `STK_INFO`

`STK_INFO` (tồn kho tức thời, 1 dòng/chi nhánh (`STK_ID`)/mã hàng
(`SKU_ID`)) có sẵn các cột tồn/nhập theo THÁNG:

| Cột | Ý nghĩa |
|---|---|
| `STK_ID` | Mã kho/chi nhánh |
| `SKU_ID` | Mã hàng |
| `M_BEGIN` | Số lượng tồn ĐẦU kỳ (tháng hiện tại) |
| `M_BEGAMT` | Giá trị tồn ĐẦU kỳ |
| `M_IMP` | Số lượng NHẬP trong kỳ |
| `M_IMPAMT` | Giá trị NHẬP trong kỳ |
| `M_EXP` / `M_EXPAMT` | Số lượng/giá trị XUẤT trong kỳ (chưa dùng) |
| `END_AMT` | Giá trị tồn CUỐI kỳ (chưa dùng) |
| `AVERIMPPR` / `COSTPRICE` / `LASTIMPPR` | Có sẵn nhưng CHƯA kiểm chứng — không dùng trực tiếp, tự tính theo công thức mục 3 |

**Đã đối chiếu chéo bằng dữ liệu thật**: tính giá vốn bình quân theo công
thức mục 3 cho đúng 10 mã hàng ở mục 1, ra kết quả **RẤT GẦN** với số từ
`COSTPRICE` (2 nguồn độc lập của DSMART16 cùng cho kết quả gần giống
nhau) — đủ tin cậy để dùng, dù tỷ lệ lãi gộp của riêng 10 mã bán chạy
nhất này vẫn thấp (có thể là hàng thiết yếu bán gần giá vốn để kéo
khách — xem mục 5, câu hỏi còn mở).

## 3. Công thức (đã chốt với người dùng)

- **Kỳ tính**: theo TỪNG THÁNG (không phải luỹ kế từ đầu, không phải
  trượt 12 tháng).
- **Phạm vi**: CHUNG toàn hệ thống theo mã hàng — gộp `SUM()` qua TẤT CẢ
  `STK_ID` (không tách riêng theo chi nhánh).
- **Giá vốn đầu kỳ** (gắn đúng tồn kho đầu kỳ, đúng kế toán):
  ```sql
  GiaVonDauKy = SUM(M_BEGAMT) / NULLIF(SUM(M_BEGIN), 0)
  ```
- **Giá vốn bình quân** (bình quân gia quyền cuối kỳ — tồn đầu kỳ CỘNG
  nhập trong kỳ):
  ```sql
  GiaVonBinhQuan = SUM(M_BEGAMT + M_IMPAMT) / NULLIF(SUM(M_BEGIN + M_IMP), 0)
  ```
- Cả 2 công thức `GROUP BY SKU_ID` (không `GROUP BY STK_ID`).

## 4. GIỚI HẠN QUAN TRỌNG — chỉ đúng cho THÁNG HIỆN TẠI

`STK_INFO` là bảng **tồn kho tức thời** (snapshot), KHÔNG có cột lưu
"tháng" để tách dữ liệu lịch sử — khác hẳn `STRANS`/`TRANSHDR` (có
`TRAN_DATE` lọc được mọi ngày quá khứ). Công thức ở mục 3 CHỈ chính xác
cho **tháng đang chạy** — **đã chốt với người dùng: KHÔNG hỗ trợ lọc sang
tháng cũ** (không có tồn đầu kỳ thật của tháng cũ, không giả lập).

## 5. Tên mặt hàng — CHƯA XONG, đang xác định

`GOODS.GOODS_NAME` là ứng viên tên mặt hàng, nhưng **đã xác nhận
`GOODS.GOODS_ID` KHÔNG khớp trực tiếp `SKU_ID`** (chạy thử với đúng 10 mã
hàng ở mục 1, ra rỗng hoàn toàn). Cần dò tiếp qua bảng trung gian
`SKU_DEF` (chưa kiểm chứng) — **CẬP NHẬT lại mục này ngay khi xác định
xong đường nối đúng**.

## 6. Câu hỏi nghiệp vụ còn mở (chưa có câu trả lời)

Tỷ lệ lãi gộp tính ra cho 10 mã hàng bán chạy nhất (theo doanh thu) đều
RẤT THẤP (0–5%, có mã âm) dù đã đối chiếu 2 nguồn độc lập khớp nhau. Có
2 khả năng:
1. Đúng là các mã hàng BÁN CHẠY NHẤT (gạo/dầu ăn/sữa...) được bán gần
   giá vốn để kéo khách — không đại diện biên lợi nhuận CHUNG toàn cửa
   hàng.
2. Có vấn đề dữ liệu SÂU HƠN ở DSMART16 mà chưa phát hiện ra.

**Chưa có câu trả lời** — cần người phụ trách nghiệp vụ giá xác nhận tỷ
lệ lãi gộp CHUNG toàn cửa hàng (không chỉ 10 mã bán chạy nhất) có hợp lý
không sau khi báo cáo "Báo cáo giá vốn" chạy thật.

## 7. Trạng thái triển khai

- [x] Xác nhận `COSTPRICE` không dùng được (mục 1).
- [x] Xác nhận `STK_INFO` có cột cần thiết + đối chiếu chéo hợp lý (mục 2, 3).
- [x] Chốt công thức + phạm vi + giới hạn tháng hiện tại với người dùng (mục 3, 4).
- [ ] Xác định đường nối `SKU_ID` → tên mặt hàng thật (mục 5).
- [ ] Viết VIEW `STK_INFO` + `GOODS`/`SKU_DEF` trên DSMART16.
- [ ] Tạo báo cáo "Báo cáo giá vốn" trong hệ thống (cột: STT, SKU_ID, Tên
      mặt hàng, Giá vốn bình quân, Giá vốn đầu kỳ, Tháng — có lọc theo
      tháng, chỉ hỗ trợ tháng hiện tại theo mục 4).
- [ ] Cập nhật lại "Lãi gộp" ở "Báo cáo nhanh doanh thu" dùng đúng nguồn
      này thay `COSTPRICE`.
- [ ] Viết hướng dẫn triển khai riêng cho báo cáo mới (theo đúng quy ước
      mỗi báo cáo lớn có 1 file `.md` riêng, xem `bc-ton-kho-0.md` làm mẫu).
