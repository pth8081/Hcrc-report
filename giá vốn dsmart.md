# Giá vốn bình quân gia quyền — nguồn dữ liệu DSMART16

Tài liệu tham chiếu chính thức cho cách tính "giá vốn" dùng trong báo cáo
HCRC (cả "Lãi gộp" ở "Báo cáo nhanh doanh thu" lẫn báo cáo "Báo cáo giá vốn"
riêng) — **đọc file này TRƯỚC khi sửa bất kỳ công thức giá vốn nào**, và
**cập nhật lại file này mỗi khi công thức/nguồn dữ liệu thay đổi**, cùng quy
ước với "quy tắc mã BU_ID và STK_ID.md"/"báo cáo doanh thu cuối ngày.md".

> **ĐÃ SUPERSEDE TOÀN BỘ (bản 8.10)** — mục 1-6 dưới đây (COSTPRICE →
> công thức tự tính từ `STK_INFO` → `STK_INFO.AVERIMPPR`) đều dựa trên
> cách tiếp cận "tính lại giá vốn từ nguồn tồn kho", và ĐỀU cho giá vốn ≈
> giá bán ở diện rộng mã hàng — không nguồn nào dùng được. **Công thức
> ĐANG DÙNG thực tế là `STRANS.SURPLUS`** (lãi gộp POS tự tính sẵn theo
> từng dòng giao dịch) — xem mục 8, đọc mục đó TRƯỚC nếu chỉ cần biết cách
> tính hiện hành. Giữ nguyên mục 1-6 để lưu vết quá trình điều tra.

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
| `AVERIMPPR` | Giá vốn bình quân (DBA xác nhận, **bản 8.8 — ĐANG DÙNG TRỰC TIẾP**, xem mục 3) |
| `COSTPRICE` (cột trong `STK_INFO`, KHÁC bảng `COSTPRICE` riêng ở mục 1) | Giá vốn hiện thời — ra toàn số 0 ở mọi mã đã kiểm, KHÔNG dùng được |
| `LASTIMPPR` | Giá nhập lần cuối — chưa dùng |
| `PREFPR` | Giá vốn chỉ định — chưa dùng |

**ĐÍNH CHÍNH (bản 8.8)** — công thức tự tính ở mục 3 (bản gốc) từng đối
chiếu KHỚP với `COSTPRICE`/`AVERIMPPR` trên đúng 10 mã hàng bán chạy nhất
(dùng để kiểm chứng ban đầu) — nhưng khi soi RỘNG hơn (toàn bộ mã hàng bán
ra tại 1 chi nhánh/1 ngày, không chỉ 10 mã), phát hiện RẤT NHIỀU mã khác
cho giá vốn tự tính ≈ giá bán, có mã khớp CHÍNH XÁC tới từng đồng — nghi
`M_IMPAMT` cũng nhiễm giá trị bán lẻ giống `COSTPRICE` cũ. Đã hỏi lại DBA
DSMART16 — chốt **dùng THẲNG cột `STK_INFO.AVERIMPPR`** (giá trị hệ thống
tự duy trì) thay vì tự tính lại từ 4 cột `M_BEGIN/M_IMP/M_BEGAMT/M_IMPAMT`
— xem công thức mới ở mục 3.

## 3. Công thức (đã chốt với người dùng, ĐÃ SỬA bản 8.8)

- **Kỳ tính**: theo TỪNG THÁNG (không phải luỹ kế từ đầu, không phải
  trượt 12 tháng) — `AVERIMPPR` tự thân đã là giá trị "tính tới hiện tại"
  của `STK_INFO` (tồn kho tức thời), không có tham số tháng riêng.
- **Phạm vi**: CHUNG toàn hệ thống theo mã hàng — bình quân gia quyền
  `AVERIMPPR` của TẤT CẢ `STK_ID` đang bán mã đó, quyền số theo số lượng
  đã luân chuyển trong kỳ của từng chi nhánh (`M_BEGIN + M_IMP`) — không
  tách riêng theo chi nhánh.
- **Giá vốn bình quân** (bản 8.8 — dùng cột có sẵn):
  ```sql
  GiaVonBinhQuan = SUM(AVERIMPPR * (M_BEGIN + M_IMP)) / NULLIF(SUM(M_BEGIN + M_IMP), 0)
  ```
- **Giá vốn đầu kỳ** (gắn đúng tồn kho đầu kỳ, đúng kế toán — CHƯA đổi,
  vẫn dùng giá trị tồn đầu kỳ thật vì `AVERIMPPR` không tách được phần
  "đầu kỳ" riêng khỏi phần "nhập trong kỳ"):
  ```sql
  GiaVonDauKy = SUM(M_BEGAMT) / NULLIF(SUM(M_BEGIN), 0)
  ```
- Cả 2 công thức `GROUP BY SKU_ID` (không `GROUP BY STK_ID`).

## 4. GIỚI HẠN QUAN TRỌNG — chỉ đúng cho THÁNG HIỆN TẠI

`STK_INFO` là bảng **tồn kho tức thời** (snapshot), KHÔNG có cột lưu
"tháng" để tách dữ liệu lịch sử — khác hẳn `STRANS`/`TRANSHDR` (có
`TRAN_DATE` lọc được mọi ngày quá khứ). Công thức ở mục 3 CHỈ chính xác
cho **tháng đang chạy** — **đã chốt với người dùng: KHÔNG hỗ trợ lọc sang
tháng cũ** (không có tồn đầu kỳ thật của tháng cũ, không giả lập).

**Áp dụng cho "Lãi gộp" ở "Báo cáo nhanh doanh thu" (bản 8.1)** — đã chốt
lại với người dùng: **CHỈ áp dụng cho VIEW "Live"** (`V_HCRC_DOANHTHU_CHINHANH`
trên `DSMART16`, Script A trong "báo cáo doanh thu cuối ngày.md") — VIEW
"Lịch sử" (`DSMART16_EOM`, Script B, phục vụ "Cùng kỳ năm trước") CỐ Ý
GIỮ NGUYÊN JOIN `COSTPRICE` cũ (đã biết không đáng tin) vì không có nguồn
giá vốn đáng tin cho tháng/năm cũ — "Lãi gộp" của dữ liệu quá khứ vẫn SAI,
chấp nhận tạm thời cho tới khi có nguồn giá vốn lịch sử đáng tin.

## 5. Tên mặt hàng — ĐÃ XÁC ĐỊNH (bản 8.9)

`GOODS.GOODS_NAME` KHÔNG dùng được (`GOODS.GOODS_ID` không khớp trực tiếp
`SKU_ID`, đã xác nhận ra rỗng hoàn toàn với 10 mã hàng ở mục 1). Bảng
trung gian `SKU_DEF` (dò ra khi tìm cột `PREFPR`, xem mục 6) có sẵn
`SKU_ID` LÀM KHOÁ CHÍNH — nối trực tiếp, không cần qua `GOODS`:

- **`FULL_NAME_U`** (nvarchar, cột cuối bảng) — tên đầy đủ, ĐÃ ĐÚNG FONT
  (kiểm tra thực tế: hiện đúng tiếng Việt có dấu, vd "C - MAMAMY - Khăn
  ướt có nắp ko mùi 100sx24") — **dùng cột này cho "Báo cáo giá vốn"**.
- `FULL_NAME` (không có hậu tố `_U`) — CÙNG nội dung nhưng LỖI FONT (hiện
  `Kh¨n ­ít` thay vì `Khăn ướt`, do khác bảng mã ký tự) — KHÔNG dùng cột
  này để hiển thị.
- `SHORT_NAME`, `MERC_NAME` — 2 ứng viên tên rút gọn khác nếu cần, chưa
  kiểm tra font.

**Đường nối cho VIEW/báo cáo mới**: `LEFT JOIN SKU_DEF sd ON sd.SKU_ID = <bảng giao dịch>.SKU_ID`,
lấy `sd.FULL_NAME_U`.

## 6. Câu hỏi nghiệp vụ còn mở — KẾT LUẬN Ở BẢN 8.2 ĐÃ BỊ ĐẢO NGƯỢC (bản 8.8)

**ĐÍNH CHÍNH QUAN TRỌNG**: kết luận "tỷ lệ lãi gộp thấp là ĐÚNG DỮ LIỆU"
ở bản 8.2 (dưới đây, giữ nguyên để lưu vết) chỉ dựa trên đúng 10 mã hàng
CHỌN SẴN để kiểm chứng ban đầu — khi soi RỘNG ra toàn bộ mã hàng bán tại 1
chi nhánh/1 ngày (bản 8.8), phát hiện tỷ lệ lãi gộp thấp/0%/âm xảy ra Ở
QUY MÔ LỚN HƠN NHIỀU, kể cả tổng toàn chuỗi (~0.5-0.6%, không phải vài mã
lẻ) — mức này KHÔNG hợp lý về kinh doanh cho một chuỗi siêu thị đang vận
hành. Đã xác định nguyên nhân kỹ thuật thật: công thức tự tính (nguồn 2 ở
dưới) dùng sai cột — đã đổi sang `AVERIMPPR` trực tiếp (mục 3, bản 8.8).
**CẦN NGƯỜI PHỤ TRÁCH KINH DOANH KIỂM TRA LẠI SỐ SAU KHI DEPLOY bản 8.8**
— chưa có cơ sở khẳng định đã hết sai, chỉ mới sửa đúng NGUỒN CỘT theo xác
nhận của DBA.

**Điều tra thêm (trước khi deploy bản 8.8) — vì sao một số mã hàng vẫn ra
giá vốn = giá bán dù đã đổi sang `AVERIMPPR`:**

- Soi trực tiếp cả 4 cột `COSTPRICE`/`AVERIMPPR`/`LASTIMPPR`/`PREFPR` cho
  đúng nhóm mã hàng đã phát hiện lỗi (ST HÀNG TRỐNG, 09/09/2026) — CẢ 4
  đều cho giá vốn ≈ giá bán y hệt công thức tự tính cũ: `AVERIMPPR` lệch
  rất nhỏ (vd mã `291515450000`: giá bán 38.400đ/cái, `AVERIMPPR` =
  38.398,65đ), `PREFPR` (bảng `SKU_DEF`) khớp TUYỆT ĐỐI ở mọi mã đã kiểm
  (vd `292715700000`: giá bán 364.519đ = `PREFPR` 364.519,00đ), `COSTPRICE`/
  `LASTIMPPR` = 0 ở mọi dòng — không cột nào trong 4 cột dùng được cho
  riêng nhóm mã hàng này.
- Tra tiếp bảng `HISIMPPR` (nghi là lịch sử giá nhập THẬT theo từng lần,
  gắn `SUPP_ID` nhà cung cấp) cho đúng các mã hàng này — **RỖNG HOÀN
  TOÀN**, không có 1 dòng nào. Thử lại KHÔNG lọc theo mã hàng, chỉ lọc
  theo CHI NHÁNH (`STK_ID = 10011`, TOP 50 mới nhất) — **VẪN RỖNG HOÀN
  TOÀN cho cả chi nhánh**, không riêng nhóm mã nghi vấn. Kết luận: bảng
  `HISIMPPR` KHÔNG được dùng/không có dữ liệu ở chi nhánh này — loại hẳn
  khỏi danh sách nguồn khả dụng (không chỉ cho nhóm mã đặc biệt, mà nói
  chung).
- Đã báo lại DBA đúng phát hiện này — **DBA XÁC NHẬN LẦN 2, DỨT KHOÁT: vẫn
  dùng `AVERIMPPR` làm giá vốn tính "Lãi gộp"** cho toàn bộ hệ thống (chấp
  nhận nhóm mã hàng đặc biệt trên sẽ tiếp tục ra biên lợi nhuận ≈0, coi đây
  là hiện tượng đúng bản chất nhóm hàng đó, không cần xử lý riêng). **CHỐT
  — dừng điều tra thêm cột/bảng khác cho việc này.**
- Tác dụng phụ có ích: `SKU_DEF` (bảng dò ra `PREFPR`) có cột tên mặt hàng
  dạng chữ rõ ràng ở cuối mỗi dòng (vd "C - MAMAMY - Khăn ướt có nắp ko
  mùi 100sx24") — rất có thể chính là lời giải cho mục 5 (`SKU_ID` → tên
  mặt hàng) — CẦN xác nhận lại tên cột chính xác qua
  `INFORMATION_SCHEMA.COLUMNS` trước khi dùng cho "Báo cáo giá vốn".

<details>
<summary>Kết luận CŨ ở bản 8.2 (đã đảo ngược, giữ lại để tham khảo)</summary>

Tỷ lệ lãi gộp tính ra cho 10 mã hàng bán chạy nhất (theo doanh thu) đều
RẤT THẤP (0–5%, có mã âm). Đã đối chiếu **3 nguồn ĐỘC LẬP** bằng dữ liệu
thật cho cùng 10 mã hàng:

1. Bảng `COSTPRICE` (đã loại, mục 1) — gần trùng khớp giá bán.
2. Công thức tự tính từ `STK_INFO.M_BEGAMT/M_IMPAMT` (mục 3 bản gốc, ĐÃ
   THAY bằng `AVERIMPPR` trực tiếp ở bản 8.8).
3. Cột `STK_INFO.AVERIMPPR` — DBA xác nhận đây chính là "GV bình quân"
   (giá vốn bình quân) DSMART tự duy trì.

Cả 3 nguồn hội tụ về cùng 1 mức giá vốn (nguồn 2 và 3 chênh lệch dưới 5%
ở 10 mã đã kiểm) — kết luận khi đó: "tỷ lệ lãi gộp thấp là ĐÚNG DỮ LIỆU".
**Kết luận này SAI** — phạm vi kiểm chứng (10 mã) quá hẹp để phát hiện vấn
đề chỉ lộ rõ khi soi rộng hơn.
</details>

## 8. LỜI GIẢI THẬT (bản 8.10) — `STRANS.SURPLUS`, không cần tính giá vốn nữa

DBA DSMART16 gửi thẳng câu lệnh báo cáo doanh thu/lãi họ đang dùng nội bộ —
hoá ra lời giải đơn giản hơn hẳn mọi hướng đã thử (mục 1-6 ở trên): **bảng
`STRANS` có sẵn cột `SURPLUS`** — hệ thống POS đã tự tính LÃI GỘP cho TỪNG
DÒNG giao dịch ngay tại thời điểm bán, không cần tra/tính giá vốn từ bất kỳ
bảng nào khác (`COSTPRICE`, `STK_INFO`...) nữa.

**Phát hiện quan trọng đi kèm — `AMOUNT` không phải doanh thu đầy đủ**:
đối chiếu `TRANS_CODE=221` (giao dịch bán lẻ thường) cho 1 chi nhánh/1
ngày: `AMOUNT` = 129.491.580,52 nhưng doanh thu THẬT (theo công thức DBA)
= `AMOUNT + SURPLUS` = 164.457.642,75. Vậy `AMOUNT` chỉ là 1 phần (gần
giống giá vốn/net), `SURPLUS` là phần chênh thêm để ra đúng giá bán —
khác hẳn giả định trước giờ (VIEW cũ coi `SUM(AMOUNT)` là doanh thu đầy đủ).

**`TRANS_CODE` phân loại giao dịch** (theo công thức DBA):
- `211`, `221`, `232` = giao dịch BÁN (cộng vào doanh thu/lãi).
- `212`, `222` = giao dịch TRẢ HÀNG tương ứng — **ghi `AMOUNT` DƯƠNG**
  (đã xác nhận thật: `TRANS_CODE 222` tại 1 chi nhánh, 14 dòng, `AMOUNT`
  từ 0 đến 348.809,71, không âm) — PHẢI trừ riêng, không tự netting qua
  `SUM` đơn giản.
- Các mã KHÁC (vd `333` — chiếm **55,6% doanh thu** 1 ngày mẫu tại 1 chi
  nhánh, `SURPLUS` = 0,00 tuyệt đối ở MỌI dòng) — **CHƯA XÁC ĐỊNH được
  nghĩa chính xác** (nghi bán sỉ/chuyển kho nội bộ/ký gửi — không phải bán
  lẻ thông thường). VIEW mới **LOẠI HẲN** các mã này khỏi "Doanh thu" —
  người dùng ĐÃ ĐƯỢC CẢNH BÁO việc này làm "Doanh thu" báo cáo giảm mạnh
  (~55% ở ngày mẫu) so với công thức cũ, và xác nhận dùng đúng theo công
  thức DBA (không hỏi thêm nghĩa mã `333` nữa để tránh chặn tiến độ) — xem
  VERSION.md bản 8.10.

**Đã kiểm chứng bằng dữ liệu thật trên diện rộng** (không chỉ 10 mã như
các lần trước) — ST HÀNG TRỐNG, STK_ID `10011`, 17 ngày đầu tháng 9/2026,
VÀ ~35 chi nhánh khác trong cùng khoảng thời gian: tỷ lệ `Lãi/DoanhThu`
ra **15-25%** ở GẦN NHƯ MỌI dòng — lần ĐẦU TIÊN ra con số hợp lý cho bán
lẻ trong suốt quá trình điều tra (mục 1-6). Vài ngày cá biệt (vd STK
`10021` 15/9, STK `12791` 15/9) ra Lãi ÂM kèm doanh thu tăng vọt bất
thường — nghi giao dịch điều chỉnh/đặc biệt, CHƯA điều tra sâu, không
chặn việc áp dụng công thức chung.

**Công thức VIEW mới** — xem đầy đủ ở "báo cáo doanh thu cuối ngày.md"
Script A (Bước 1). Tóm tắt: `doanhThu`/`laiGop`/`SoLuongBan`/`TienVAT`/
`TienGiamGia`/`HoaHong` đều tính theo mẫu
`SUM(CASE WHEN TRANS_CODE IN ('211','221','232') THEN <cột> ELSE 0 END) - SUM(CASE WHEN TRANS_CODE IN ('212','222') THEN <cột> ELSE 0 END)`,
riêng `doanhThu`/`TongTien` dùng `<cột>` = `AMOUNT + SURPLUS` (không phải
`AMOUNT` đơn thuần), `laiGop` dùng `<cột>` = `SURPLUS`. `STATUS` đọc THẲNG
từ `STRANS` (không cần JOIN `TRANSHDR` nữa) — áp dụng cho CẢ VIEW Doanh
thu lẫn VIEW Giao dịch (Giao dịch cũng chuyển hẳn từ `TRANSHDR` sang
`STRANS`, đếm `COUNT(DISTINCT TRANS_NUM)`).

**CÂU HỎI CÒN MỞ** (không chặn deploy, cần làm rõ dần):
1. `TRANS_CODE 333` (và các mã phụ khác) là loại giao dịch gì — có nên
   đưa vào 1 chỉ tiêu báo cáo RIÊNG (vd "Doanh thu bán sỉ"/"Doanh thu nội
   bộ") thay vì bỏ hẳn không hiển thị ở đâu cả?
2. ~~Script B (Lịch sử, `STRANS_EOM`/`STRANS_YYYYMM`) có cột `SURPLUS`/
   `TRANS_CODE` giống `STRANS` (Live) không?~~ **ĐÃ XÁC ĐỊNH (bản 8.12)** —
   CÓ, đã xác nhận bằng dữ liệu thật (`STRANS_EOM` VÀ `STRANS_202608` —
   bảng lưu trữ tháng gần nhất — đều đủ cột) và DBA gửi thẳng câu lệnh mẫu
   dùng đúng 2 cột này trên `STRANS_202510`. Script B đã viết lại theo
   ĐÚNG công thức Script A — xem "báo cáo doanh thu cuối ngày.md" mục
   "Script B". Giải quyết luôn "Lãi gộp lịch sử vẫn sai" tồn đọng từ bản
   8.1.
3. Vài ngày Lãi ÂM bất thường (mục trên) — cần hiểu rõ nguyên nhân trước
   khi coi công thức này là "xong hẳn", dù không chặn việc áp dụng ngay.

## 7. Trạng thái triển khai

- [x] Xác nhận `COSTPRICE` không dùng được (mục 1).
- [x] Xác nhận công thức tự tính từ `M_BEGAMT/M_IMPAMT` VÀ `STK_INFO.AVERIMPPR`
      đều KHÔNG đáng tin ở quy mô rộng (mục 2, 6) — **ĐÃ THAY HẲN sang
      `STRANS.SURPLUS`/`TRANS_CODE`** theo công thức DBA cung cấp (mục 8,
      bản 8.10) — không cần tính/tra giá vốn từ nguồn nào khác nữa.
- [x] Xác định đường nối `SKU_ID` → tên mặt hàng thật — `SKU_DEF.FULL_NAME_U`
      (mục 5, bản 8.9).
- [x] Kiểm tra số liệu thật diện rộng (35 chi nhánh × 17 ngày) — tỷ lệ lãi
      gộp 15-25%, hợp lý (mục 8).
- [ ] Làm rõ nghĩa `TRANS_CODE 333`/các mã phụ khác (mục 8, câu hỏi 1).
- [x] Kiểm tra Script B (Lịch sử) có `SURPLUS`/`TRANS_CODE` để áp dụng
      cùng công thức không (mục 8, câu hỏi 2) — CÓ, đã viết lại Script B
      theo đúng công thức Script A (bản 8.12), giải quyết "Lãi gộp lịch sử
      sai" tồn đọng từ bản 8.1. Cần chạy resync job Lịch sử (xem "báo cáo
      doanh thu cuối ngày.md") để dữ liệu đã đồng bộ trước đó cập nhật lại.
- [ ] Điều tra vài ngày Lãi ÂM bất thường (mục 8, câu hỏi 3).
- [ ] Tạo báo cáo "Báo cáo giá vốn" trong hệ thống — CẦN XEM LẠI THIẾT KẾ:
      với công thức mới (`SURPLUS` theo dòng giao dịch, không phải giá vốn
      bình quân theo `SKU_ID`), báo cáo "giá vốn bình quân/mã hàng" theo
      thiết kế cũ (mục 4, dựa trên `STK_INFO`) có còn cần thiết không, hay
      đổi hướng theo đúng dữ liệu `SURPLUS` sẵn có.
- [ ] Viết hướng dẫn triển khai riêng cho báo cáo mới (theo đúng quy ước
      mỗi báo cáo lớn có 1 file `.md` riêng, xem `bc-ton-kho-0.md` làm mẫu).

## 9. ĐANG ĐIỀU TRA (28-29/10/2026) — Lãi gộp HO lệch Lãi gộp Thành viên ~18,7 triệu/ngày

**CHƯA GIẢI QUYẾT — tạm dừng giữa chừng, tiếp tục từ đây khi có thêm dữ
liệu.** Không phải lỗi code báo cáo (công thức VIEW 2 bên — gốc
`V_HCRC_DOANHTHU_CHINHANH` và Thành viên — đã đối chiếu GIỐNG HỆT NHAU
từng dòng SQL, không lệch).

**Khởi nguồn**: Bên kinh doanh thắc mắc Lãi gộp báo cáo HO và báo cáo
Thành viên chênh nhau. Người dùng gửi 2 PDF thật "Báo cáo doanh thu cuối
ngày LDTD" ngày 28/10/2026 (bản gốc/HO và bản Thành viên) — Doanh thu/Giao
dịch khớp TUYỆT ĐỐI từng siêu thị ở cả 2 bản, CHỈ Lãi gộp lệch:
- Tổng Lãi gộp gốc: 389,539,609đ · Thành viên: 370,855,633đ · **lệch
  18,683,976đ**.
- Khối MINIMART gần như không lệch (−123,145đ, có 1 siêu thị khớp TUYỆT
  ĐỐI tới từng đồng — "SK Tô Ngọc Vân 1").
- Khối MART lệch +18,807,121đ, và riêng **1 siêu thị "ST 120 Hàng Trống"
  (Mã Điểm 001) chênh 11,572,547đ — chiếm 62% tổng chênh lệch cả hệ
  thống**. Các siêu thị MART khác lệch rải rác, có cả chiều ngược lại
  (Thành viên cao hơn gốc).

**Đã kiểm tra bằng SQL thật** (người dùng tự chạy, DBA xác nhận số liệu):
- `etl.DiemStkMapping` — Mã Điểm `001` ("ST 120 HÀNG TRỐNG") có
  `MaStkMoi` = **4 mã kho**: `10011, 20011, 20012, 20013` (không phải 1
  mã như ban đầu tưởng — `10011` = Siêu thị, `20011/20012/20013` nghi là
  kho phụ/kho trung chuyển).
- Trên CSDL TRUNG TÂM (DSMART16, nguồn báo cáo gốc), ngày 28/10/2026,
  `STK_ID IN ('10011','20011','20012','20013')`, `TRANS_CODE IN
  ('211','221','232','212','222')`, `STATUS <> 'D'`:
  `SoDong=4358, TongAmount=202,120,757.23, TongSurplus=46,121,779.80,
  TongDoanhThu=248,242,537.03`. Lọc riêng `10011` ra kết quả Y HỆT →
  3 kho `20011/20012/20013` KHÔNG có giao dịch nào ngày này (không phải
  do thiếu kho).
- Trên server LOCAL của chính siêu thị 120 Hàng Trống (172.16.74.11),
  CÙNG điều kiện nhưng chỉ `STK_ID = '10011'` (chưa test đủ 4 mã ở local):
  `SoDong=4358` (khớp TUYỆT ĐỐI với trung tâm — không thiếu/trùng giao
  dịch), `TongAmount=198,723,430.26, TongSurplus=49,519,106.74,
  TongDoanhThu=248,242,537.00` (TongDoanhThu khớp gần tuyệt đối, lệch 3
  xu do làm tròn) — nhưng **TongAmount/TongSurplus bị "đảo" ngược chiều
  nhau đúng ~3,397,327đ** giữa trung tâm và local (trung tâm ghi nhiều
  AMOUNT hơn/ít SURPLUS hơn; local thì ngược lại). Xác nhận: CÙNG 1 lượng
  tiền, nhưng DSMART chia AMOUNT/SURPLUS khác nhau giữa 2 nơi lưu — không
  phải do thiếu/trùng dòng.

**Vấn đề CHƯA GIẢI THÍCH được (bế tắc hiện tại)**:
1. Số 3,4 triệu lệch đo được ở `10011` (local) KHÔNG đủ giải thích 11,57
   triệu lệch của "ST 120 Hàng Trống" trên 2 PDF — cần test thêm
   `20011/20012/20013` ở LOCAL (đã hỏi người dùng, CHƯA có kết quả — lưu
   ý: các kho phụ này rất có thể KHÔNG tồn tại ở CSDL local, chỉ ở trung
   tâm, nếu vậy local sẽ báo lỗi/không ra dòng nào cho mấy mã đó).
2. PHÁT HIỆN MỚI, có thể QUAN TRỌNG HƠN cả câu hỏi gốc: `TongSurplus`
   truy vấn TRỰC TIẾP trên CSDL TRUNG TÂM (46,121,779.80, truy vấn lúc
   29/10) **cũng KHÔNG khớp** với số Lãi gộp 60,746,087đ in trên CHÍNH
   PDF báo cáo gốc cho "ST 120 Hàng Trống" ngày 28/10 — lệch tới 14,6
   triệu, dù cùng đọc 1 CSDL trung tâm. Nghi vấn: `STRANS.SURPLUS` có thể
   bị DSMART TỰ ĐỘNG TÍNH LẠI/ĐIỀU CHỈNH sau khi ngày đã đóng sổ (vd bước
   "chốt giá vốn" qua đêm) — nên dữ liệu truy vấn HÔM SAU đã khác dữ liệu
   TẠI THỜI ĐIỂM báo cáo PDF được tạo ra cuối ngày 28/10. Nếu đúng, đây
   không chỉ là câu chuyện "gốc vs thành viên" mà là `SURPLUS` NÓI CHUNG
   không ổn định theo thời gian cho 1 giao dịch đã đóng — ảnh hưởng tới
   MỌI báo cáo dùng công thức này (cả Script A/B ở mục 8), cần làm rõ
   TRƯỚC KHI kết luận nguyên nhân chênh HO/Thành viên.

**Việc cần làm tiếp khi quay lại** (đã hỏi người dùng, đang đợi phản hồi):
1. Kết quả câu SQL gộp đủ 4 mã kho (`10011,20011,20012,20013`) chạy trên
   server LOCAL của 120 Hàng Trống (đối chiếu với kết quả trung tâm ở
   trên).
2. Báo cáo PDF (cả 2 bản) được tạo/gửi vào LÚC MẤY GIỜ trong ngày 28/10 —
   để kiểm tra giả thuyết "chốt giá vốn qua đêm" ở câu 2 trên (nếu đúng,
   cần hỏi thêm DBA DSMART xem có job nào tính lại `SURPLUS` sau khi
   ngày đóng sổ không, và CHỐT ở mốc giờ nào thì `SURPLUS` mới "ổn định"
   — ảnh hưởng tới việc nên đồng bộ báo cáo Lãi gộp vào giờ nào trong
   ngày để số liệu không bị "nhảy" sau này).
3. Sau khi có đủ 2 ý trên, đối chiếu lại số liệu đầy đủ và kết luận
   nguyên nhân chính xác trước khi đề xuất hướng xử lý (có thể KHÔNG sửa
   được ở tầng báo cáo nếu đây là hành vi gốc của DSMART, mà chỉ có thể
   LƯU Ý/thông báo cho bên kinh doanh biết số có thể còn thay đổi sau khi
   ngày đã "chốt" ban đầu).

## 10. KẾT LUẬN + ĐÃ SỬA (bản 10.33, 29/10/2026) — SURPLUS vẫn đổi SAU khi
ngày đã đóng; ETL trước đây "đóng băng" vĩnh viễn, giờ quét lại thêm

**ĐÃ XÁC NHẬN bằng SQL thật** (tiếp nối mục 9) — người dùng chạy lại đúng
câu tổng hợp SURPLUS/AMOUNT cho "ST 120 Hàng Trống" (đủ cả 4 mã kho
`10011,20011,20012,20013`) ở 2 THỜI ĐIỂM CÁCH NHAU ĐÚNG 1 NGÀY (28/10 và
29/10), CÙNG 1 điều kiện lọc (`TRAN_DATE='2026-10-28'`), trên CẢ 2 bên
(trung tâm/local):
- `SoDong` = 4,358 ở CẢ 4 lần đo (không đổi) — xác nhận không có giao
  dịch mới phát sinh, không phải do thiếu/thừa dòng.
- Local (120 Hàng Trống): `TongAmount` đổi từ 198,723,430.26 (đo 29/10, chỉ
  lọc `10011`) → 201,937,176.31 (đo SAU ĐÓ, lọc đủ 4 mã kho — 3 mã còn lại
  xác nhận 0 dòng nên không phải nguyên nhân) — **tăng 3,213,746đ dù
  KHÔNG có giao dịch mới**. `TongSurplus` giảm tương ứng.
- Trung tâm (HO): giữ NGUYÊN không đổi giữa 2 lần đo (202,120,757.23 cả 2
  lần) — ngược hẳn với local.
- Sau khi gộp đủ 4 mã kho, chênh lệch SURPLUS giữa HO/local tại THỜI ĐIỂM
  ĐO CUỐI chỉ còn **183,581đ** (trước đó tưởng lệch 3,4 triệu do đo thiếu
  3 mã kho phụ) — nhưng điều quan trọng hơn không phải con số chênh cuối
  cùng, mà là **SURPLUS của 1 ngày ĐÃ QUA 1+ NGÀY vẫn đang tự thay đổi**.

**NGUYÊN NHÂN GỐC (xác nhận qua đọc code `etl/lib/tableSyncEngine.js`)**:
Job đồng bộ domain `doanhthu_chinhanh`(`_thanhvien`) dùng watermark theo
NGÀY (`floorToDay`) — mỗi lượt chạy chỉ quét lại ĐÚNG ngày đang ở mốc
watermark hiện tại (cố ý, từ bản 8.24, để không phải quét lại toàn bộ
lịch sử mỗi lần chạy). Một khi watermark NHẢY SANG NGÀY MỚI (có dòng dữ
liệu ngày mới xuất hiện), **ngày CŨ bị loại khỏi phạm vi quét mãi mãi** —
dù `STRANS.SURPLUS` của ngày đó ở NGUỒN vẫn tiếp tục bị DSMART điều chỉnh
sau đó (đã quan sát: vẫn đổi sau 1+ ngày, có thể do giá vốn hàng nhập
được cập nhật muộn/trả hàng/điều chỉnh nội bộ — CHƯA xác định chính xác
cơ chế DSMART, không cần biết để xử lý). Vì gốc (đồng bộ mỗi 15 phút) và
Thành viên (đồng bộ mỗi 1-2 phút) "chốt" giá trị cuối cùng của 1 ngày ở
2 THỜI ĐIỂM KHÁC NHAU (ngay trước lúc watermark của MỖI BÊN nhảy sang
ngày mới, độc lập nhau) → 2 báo cáo lệch nhau ở đúng `laiGop`/Lãi gộp
(phần SURPLUS), trong khi `doanhThu` (=`AMOUNT+SURPLUS`, tổng không đổi
dù SURPLUS tách ra sao) khớp tuyệt đối — ĐÚNG KHỚP triệu chứng thật đã
quan sát trên 2 PDF ban đầu (lệch 18,7 triệu Lãi gộp, Doanh thu/Giao dịch
khớp tuyệt đối).

**KHÔNG phải lỗi code báo cáo** (công thức VIEW 2 bên giống hệt nhau,
mục 9 đã xác nhận) — là hệ quả của (a) DSMART tiếp tục điều chỉnh SURPLUS
sau khi ngày đóng, kết hợp (b) kiến trúc watermark-theo-ngày "đóng băng"
vĩnh viễn ngay khi qua ngày mới.

**ĐÃ SỬA (bản 10.33)**: thêm cột `etl.SyncJobs.RescanLookbackDays` (mặc
định 0 = hành vi cũ) — mỗi lượt chạy MỞ RỘNG biên dưới câu quét lùi thêm
N ngày so với watermark (xem `tableSyncEngine.js:extractTable()`), KHÔNG
lùi watermark lưu lại (vẫn tiến bình thường) — `upsertReportFacts()` là
MERGE idempotent nên quét lại ngày cũ không tạo trùng/sai, chỉ "chốt lại"
đúng giá trị SURPLUS mới nhất. Đã đặt `RescanLookbackDays=7` cho 2 job
"Doanh thu chi nhánh - Live (DSMART16)" (gốc, `seedLdtdHcrcSync.js`) và
"Doanh thu (TV) - <từng siêu thị>" (Thành viên, `seedThanhVienLiveSync.js`,
cả 35 job) — KHÔNG áp dụng job "Lịch sử (DSMART16_EOM)" (dữ liệu tháng đã
đóng từ lâu) hay domain `giaodich_chinhanh(_thanhvien)` (không có lãi gộp).
Admin chỉnh được số ngày này qua trang "Đồng bộ" (etl-admin) bất kỳ lúc
nào, không cần sửa code/deploy lại.

**⚠️ LƯU Ý HIỆU NĂNG CHƯA KIỂM CHỨNG THỰC TẾ** — job Thành viên chạy MỖI
1-2 PHÚT (gấp ~10-15 lần tần suất gốc), giờ mỗi lượt quét thêm 7 NGÀY dữ
liệu thay vì 1 ngày — tăng đáng kể số dòng phải quét MỖI LẦN CHẠY trên
CSDL LOCAL của từng siêu thị (35 siêu thị độc lập). CHƯA đo tải thật trên
server nguồn — khuyến nghị triển khai THÍ ĐIỂM 1-2 siêu thị trước, theo
dõi tải CSDL/log lỗi vài ngày, rồi mới bật rộng cho cả 35 siêu thị; nếu
tải quá nặng, hạ `RescanLookbackDays` xuống thấp hơn (vd 2-3) ngay trên
giao diện "Đồng bộ", không cần sửa code.

**Việc còn lại (không bắt buộc)**: chưa xác định chính xác cơ chế/khoảng
thời gian DSMART cần để SURPLUS "ổn định hẳn" (quan sát được: vẫn đổi sau
1+ ngày, chưa rõ có tiếp tục đổi sau 7 ngày hay không) — 7 ngày là mốc
ước lượng hợp lý ban đầu theo yêu cầu người dùng, có thể cần điều chỉnh
lại sau khi quan sát thêm số liệu thật (so sánh lại Lãi gộp 2 báo cáo cho
cùng 1 ngày, vài ngày sau khi bản 10.33 chạy đủ 1 chu kỳ 7 ngày).

**BỔ SUNG (29/10/2026, theo người dùng)** — lệch Lãi gộp gốc/Thành viên
ĐÃ CÓ TỪ LÚC 22:30 TỐI 28/10 (cùng ngày, CHƯA cần đợi qua ngày hôm sau) —
củng cố thêm giả thuyết SURPLUS bị DSMART điều chỉnh LIÊN TỤC TRONG NGÀY
(không chỉ "sau khi đóng sổ"): 2 job (gốc 15 phút/lần, Thành viên 1-2
phút/lần) "chụp" SURPLUS tại 2 thời điểm KHÁC NHAU trong lúc nó còn đang
trôi, ra 2 số khác nhau NGAY TRONG NGÀY — không cần đợi watermark nhảy
qua ngày mới mới lệch. Hướng sửa `RescanLookbackDays` (bản 10.33) vẫn xử
lý đúng trường hợp này (quét lại nhiều lần trong 7 ngày giúp SURPLUS dần
"đuổi kịp" giá trị cuối), không cần sửa thêm.

**ĐÃ SỬA THÊM (bản 10.34)** — bản 10.33 (quét lại 7 ngày) KHÔNG xử lý
đúng trường hợp lệch NGAY TRONG NGÀY ở trên (bản 10.33 chỉ sửa việc "ngày
ĐÃ ĐÓNG bị đóng băng vĩnh viễn" — ngày HIỆN TẠI vốn đã được quét lại toàn
bộ mỗi lần chạy từ trước, không đổi gì thêm). Nguyên nhân riêng của lệch
trong ngày: job "Doanh thu chi nhánh - Live" (gốc) đồng bộ mỗi 15 PHÚT,
Thành viên mỗi 2 PHÚT — 2 bên "chụp" SURPLUS ở 2 thời điểm cách nhau tới
15 phút trong lúc nó còn đang biến động, đúng lúc báo cáo cuối ngày xuất
ra (vd 22:30) có thể rơi vào khoảng gốc vừa "lỡ" 1 lần chụp. Đã rút
`cronExpression` của job gốc xuống `*/2 * * * *` (khớp Thành viên) — xem
`seedLdtdHcrcSync.js`. CHƯA đo tải thật trên CSDL trung tâm (phục vụ tất
cả siêu thị cùng lúc) sau khi tăng tần suất gấp 7.5 lần — cần theo dõi.

**Đã xác nhận: "Hàng hỏng huỷ" (TRANS_CODE `318`) ĐÃ LOẠI TRỪ KHỎI "Doanh
thu cuối ngày"** — người dùng hỏi lại để chắc chắn. VIEW
`V_HCRC_DOANHTHU_CHINHANH` (mục 8) có `WHERE d.TRANS_CODE IN
('211','221','232','212','222')` — CHỈ liệt kê đúng 5 mã này, `318` KHÔNG
nằm trong danh sách nên KHÔNG BAO GIỜ được gộp vào `doanhThu`/`laiGop`
của báo cáo này (khác với báo cáo "Doanh thu theo ngành hàng" — xem "báo
cáo doanh thu-nhập hàng theo ngành hàng.md" — có CỘNG riêng `318` vào 1
cột "Giá trị hàng hỏng huỷ" rồi TRỪ RA khỏi "Doanh thu cuối" ở báo cáo
ĐÓ, khác domain/VIEW với "Doanh thu cuối ngày" LDTD/HCRC đang điều tra ở
đây). KHÔNG liên quan tới nguyên nhân lệch 18,7 triệu đang điều tra.
