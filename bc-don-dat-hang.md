# Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận

Tài liệu tham chiếu chính thức cho 3 báo cáo: "Đơn đặt hàng", "Đơn nhập
hàng", "So sánh đặt–nhận" (toàn bộ siêu thị) — **đọc file này TRƯỚC khi sửa
bất kỳ logic nào liên quan** (`rp-server/lib/purchaseOrderRunner.js`,
`etl/scripts/seedDonDatHangSync.js`), cùng quy ước với "quy tắc mã BU_ID và
STK_ID.md"/"bc-ton-kho-0.md".

## 1. Nguồn dữ liệu DSmart16 (theo DBA xác nhận — CÓ MÂU THUẪN MỚI, xem cảnh báo 06/10/2026)

- `ON_ORDER` — đơn hàng (bảng trạng thái SỐNG, KHÔNG dùng cho báo cáo —
  xem mục 2).
- `FN_ORDER` — đơn hàng đã nhận (bảng trạng thái SỐNG, KHÔNG dùng).
- `ST_ORDER` — đơn hàng tháng hiện tại (bảng LỊCH SỬ — **DÙNG**).
- `ST_ORDER_ARC` — đơn hàng tháng quá khứ, cùng cấu trúc `ST_ORDER`
  (**DÙNG**).
- CSDL **trung tâm** (không phải mỗi siêu thị 1 CSDL riêng) — `ST_ORDER`/
  `ST_ORDER_ARC` chứa đơn hàng của TẤT CẢ siêu thị, phân biệt bằng cột
  **`BU_ID`** (ĐÃ XÁC NHẬN bằng SQL thật 06/10/2026 — xem mục 4, KHÔNG
  phải `STK_ID` như giả định ban đầu ở bản 8.75).
- Mẫu "Phiếu đặt hàng" thật (người dùng cung cấp) xác nhận: **SL đặt và SL
  thực nhận nằm TRÊN CÙNG 1 DÒNG chứng từ** (cột "Theo đơn"/"Thực nhận"
  cạnh nhau) — `ST_ORDER`/`ST_ORDER_ARC` nhiều khả năng là CÙNG 1 bảng cho
  cả 2 khái niệm, KHÔNG phải 2 nguồn phải JOIN.

### ⚠️ MÂU THUẪN MỚI phát sinh (06/10/2026) — CHƯA GIẢI QUYẾT, CHƯA ĐỔI THIẾT KẾ

DBA trả lời lại (qua người dùng), **nguyên văn ý**: *"`ON_ORDER` là bảng
đặt hàng, `FN_ORDER` là bảng nhập hàng, `ON_ORDER` có trạng thái xoá đơn
hàng là `D`, bảng `ST_ORDER` có MỘT PHẦN trạng thái xoá của bảng
`ON_ORDER`."*

Mâu thuẫn trực tiếp với dòng đầu mục này (do chính DBA cung cấp lúc đầu,
ghi nhận ở bản 8.75): lúc đó nói `ON_ORDER`/`FN_ORDER` là bảng "trạng thái
SỐNG, KHÔNG dùng cho báo cáo", còn `ST_ORDER` mới là "bảng LỊCH SỬ". Câu
trả lời MỚI lại gọi thẳng `ON_ORDER`="bảng đặt hàng", `FN_ORDER`="bảng
nhập hàng" — nghe như ĐÂY MỚI LÀ bảng chính xác cho 2 khái niệm "đặt"/
"nhập", còn `ST_ORDER` chỉ là nơi lưu lại **MỘT PHẦN** (không phải toàn
bộ) các đơn bị XOÁ từ `ON_ORDER` — tức có thể `ST_ORDER` KHÔNG PHẢI "lịch
sử đầy đủ mọi đơn hàng" như vẫn tưởng, mà chỉ là 1 bảng PHỤ liên quan tới
việc xoá đơn.

**CHƯA đổi bất kỳ code/SQL nào** cho tới khi làm rõ — các câu hỏi cần hỏi
lại DBA:
1. `ON_ORDER` có giữ lại dữ liệu LÂU DÀI (xem được đơn hàng của nhiều
   tháng/năm trước) hay chỉ giữ đơn CÒN HOẠT ĐỘNG/gần đây (đơn cũ bị dọn
   đi sau khi xong)? Đây là câu hỏi mấu chốt — báo cáo cần xem được dữ
   liệu quá khứ nhiều tháng.
2. Quan hệ giữa `ON_ORDER` và `ST_ORDER` là gì — `ST_ORDER` có phải bản
   SAO/LƯU TRỮ của `ON_ORDER` (đồng bộ mọi thay đổi, trong đó phần "xoá"
   là 1 loại thay đổi) hay 2 bảng HOÀN TOÀN TÁCH BIỆT, chỉ tình cờ cùng
   phản ánh 1 phần dữ liệu xoá?
3. `FN_ORDER` (nhập hàng) có bảng LỊCH SỬ tương ứng kiểu `ST_ORDER`
   không, hay bản thân `FN_ORDER` đã là nơi lưu lâu dài?
4. Nếu `ON_ORDER`="đặt hàng" và `FN_ORDER`="nhập hàng" là **2 BẢNG RIÊNG
   BIỆT** — có mâu thuẫn với phát hiện trước đó (mẫu "Phiếu đặt hàng" cho
   thấy SL đặt + SL thực nhận NẰM CHUNG 1 DÒNG chứng từ, gợi ý 1 NGUỒN DUY
   NHẤT)? Nếu đúng là 2 bảng riêng, cần biết CỘT NÀO liên kết 1 dòng ở
   `ON_ORDER` với đúng 1 dòng tương ứng ở `FN_ORDER` để làm báo cáo "So
   sánh đặt–nhận" (JOIN theo gì — số đơn? mã hàng + ngày?).
5. (Nếu cần dùng `ON_ORDER`/`FN_ORDER` thay vì `ST_ORDER`) Cấu trúc cột 2
   bảng này — chạy lại đúng kiểu câu lệnh đã dùng cho `ST_ORDER`:
   ```sql
   SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = 'ON_ORDER' ORDER BY ORDINAL_POSITION;

   SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = 'FN_ORDER' ORDER BY ORDINAL_POSITION;
   ```

### Mã trạng thái (`STATUS`, đã xác nhận đủ 6 mã)

| Mã | Ý nghĩa | Xử lý trong báo cáo |
|---|---|---|
| `C` | Chưa nhập | Hiện bình thường |
| `P` | Đã nhập 1 phần | Hiện bình thường |
| `F` | Đã nhập hết | Hiện bình thường |
| `M` | Đơn sửa | Hiện bình thường (coi như đang hoạt động, giống `P`/`C`) |
| `D` | Đã xoá | Hiện bình thường, có cột trạng thái để người xem tự lọc |
| `E` | Đã huỷ | Hiện bình thường, có cột trạng thái để người xem tự lọc |

**ĐÃ XÁC NHẬN (06/10/2026, nguyên văn người dùng)**: *"loại cả đơn xóa
nữa bạn chỉ lấy đơn đặt thực tế và nhập thực tế"* — `D` (Đã xoá) VÀ `E`
(Đã huỷ) đều bị **LOẠI HẲN** khỏi CẢ 3 báo cáo (không chỉ báo cáo so sánh)
bằng `WHERE STATUS NOT IN ('D', 'E')` ngay trong VIEW/runner — KHÔNG còn
chỉ "hiện kèm cột để người xem tự lọc" như thiết kế v1 cũ. Chỉ còn
`C`/`P`/`F`/`M` được đưa vào báo cáo.

### ⚠️ "đơn nhập nhiều lần" (nhận hàng chia nhiều đợt) — ĐÃ XÁC NHẬN CƠ CHẾ, CÒN THIẾU VỊ TRÍ DỮ LIỆU

Người dùng xác nhận: 1 đơn đặt hàng có thể được **nhận hàng NHIỀU LẦN**
(giao/nhận từng đợt). **ĐÃ XÁC NHẬN (06/10/2026, nguyên văn người dùng)**:
*"dựa vào mã đơn đặt hàng để biet nhập nhiều lần"* — tức đúng khả năng
(1) dưới đây: mỗi lần nhận hàng tạo **1 DÒNG RIÊNG**, các dòng đó nhóm lại
được với nhau nhờ CÙNG MỘT **mã đơn đặt hàng gốc** (`TRANS_NUM` của đơn
ĐẶT ban đầu) được ghi lại trên mỗi dòng nhận hàng.

**Hệ quả thiết kế (ĐÃ CHỐT CÔNG THỨC, còn thiếu vị trí dữ liệu thật)**:
"SL thực nhận" (`SoLuongThucNhan`) của báo cáo so sánh PHẢI tính bằng
**`SUM(DLV_QTY)` nhóm theo (mã đơn đặt hàng gốc + mã hàng)`**, KHÔNG phải
đọc trực tiếp 1 giá trị `DLV_QTY` đơn lẻ như thiết kế VIEW nháp hiện tại
(1-1) — VIEW/runner cần sửa lại theo hướng GROUP BY + SUM thay vì chiếu
thẳng 1 dòng.

**CÒN THIẾU để viết VIEW thật**: các dòng "1 lần nhận hàng" đó nằm Ở ĐÂU
— trong chính `ST_ORDER` (vd nhiều dòng cùng `TRANS_NUM` gốc nhưng khác
`IDX`/`TRANS_CODE` cho mỗi đợt nhận) hay nằm ở `FN_ORDER` (bảng riêng,
cần `JOIN`/gộp thêm vào `ST_ORDER` qua đúng mã đơn đặt hàng gốc)? Đây
chính là lý do vẫn cần: (a) đủ danh sách cột `FN_ORDER`, và (b) kết quả
`SELECT DISTINCT TRANS_CODE` của `ON_ORDER`/`FN_ORDER` — đang chờ người
dùng gửi (xem câu hỏi ở cuối mục "MÂU THUẪN MỚI" phía trên).

### 🆕 PHÁT HIỆN MỚI (06/10/2026) — có thể nguồn dữ liệu thật nằm ở `STRANS`, không phải `ST_ORDER`/`FN_ORDER`

DBA gửi ảnh chụp SQL thật: `SELECT * FROM STRANS WHERE TRANS_CODE IN
('333','133')` — `STRANS` là bảng ĐÃ BIẾT TRƯỚC (dùng cho báo cáo doanh
thu cuối ngày, xem `deploy/Thiết lập VIEW ... Thành viên.sql`), cùng cấu
trúc cột với `ST_ORDER`/`ON_ORDER`/`FN_ORDER` (`TRANS_NUM`, `TRANS_CODE`,
`TRAN_DATE`, `BU_ID`...). Tài liệu doanh thu cũ từng ghi "mã `333` bị
LOẠI HẲN khỏi Doanh thu" mà không giải thích rõ — giờ có khả năng **`333`
VÀ `133` chính là giao dịch đặt/nhập hàng, nằm LẪN trong CÙNG bảng
`STRANS`** với giao dịch bán hàng (`211`/`221`/`232`/`212`/`222`), chỉ
phân biệt bằng `TRANS_CODE` — giống hệt cách `STRANS` đã hoạt động cho
domain doanh thu.

**ĐÃ XÁC NHẬN (06/10/2026, người dùng)**: `133` = đặt hàng, `333` = nhập
hàng.

**ĐÃ XÁC NHẬN (06/10/2026, nguyên văn người dùng)**: *"REF là mã đơn hàng
gốc nhé"* — cột `REF` chính là khoá dùng để nhóm nhiều lần nhận hàng
(`TRANS_CODE='333'`) lại với đúng 1 đơn đặt (`TRANS_CODE='133'`) ban đầu.

**KẾT LUẬN THIẾT KẾ (CHỐT nguồn dữ liệu)**: TOÀN BỘ 3 báo cáo chuyển sang
dùng **`STRANS`** (`WHERE TRANS_CODE IN ('133','333') AND STATUS NOT IN
('D','E')`) thay vì `ST_ORDER`/`ON_ORDER`/`FN_ORDER`:
- **"Đơn đặt hàng"**: lọc `TRANS_CODE='133'`.
- **"Đơn nhập hàng"**: lọc `TRANS_CODE='333'`.
- **"So sánh đặt–nhận"**: nhóm theo `REF` (+ mã hàng) — SL đặt lấy từ dòng
  `133`, SL thực nhận = `SUM(...)` mọi dòng `333` CÙNG `REF` (+ mã hàng)
  — đúng công thức đã chốt ở mục trên cho trường hợp nhận nhiều lần.

**CÒN THIẾU đúng 1 việc cuối** để viết VIEW thật — xác nhận CỘT nào trong
`STRANS` chứa số lượng/đơn giá cho dòng `133` vs dòng `333` (nghi vấn:
`STRANS` dùng CHUNG cấu trúc với `ST_ORDER` nên khả năng cao vẫn là
`SKU_ID`/`ORD_QTY`/`DLV_QTY`/`ORD_PRICE`/`AMOUNT`/`SUPP_ID`/`UNIT_SYMB`
như đã xác nhận ở `ST_ORDER`, nhưng CHƯA chắc 2 loại dòng `133`/`333` có
dùng CHUNG đúng những cột đó hay không). Câu lệnh sau sẽ trả lời dứt điểm
— chọn 1 giá trị `REF` đã thấy có cả 2 loại dòng (vd
`'3011-00100302609000206'`), xem TOÀN BỘ cột của cả dòng `133` lẫn `333`
cạnh nhau:

```sql
SELECT * FROM STRANS WHERE REF = '3011-00100302609000206' ORDER BY TRANS_CODE;
```

Sau khi có kết quả này, đủ thông tin viết VIEW thật — không cần hỏi thêm
gì khác (trừ khi kết quả lộ ra điều bất ngờ mới).

### Toàn bộ danh sách cột thật của `ST_ORDER` (SQL thật, 06/10/2026)

`ST_ORDER` là bảng **GỘP header + chi tiết dòng hàng TRONG CÙNG 1 BẢNG**
(mỗi dòng = 1 mặt hàng/SKU trong 1 đơn, các cột "header" như `TRANS_NUM`/
`BU_ID`/`STATUS` LẶP LẠI giống nhau ở mọi dòng cùng 1 đơn — ĐÃ XÁC NHẬN
cấu trúc, giải đáp điểm nghi vấn "1 dòng = 1 SKU hay 1 đơn" ở các bản
trước). Danh sách đầy đủ + cách đọc (phần nhiều cột KHÔNG liên quan tới 3
báo cáo này, ví dụ cột khuyến mãi/ngoại tệ của hệ POS — liệt kê đủ để dễ
đối chiếu):

**Các cột LIÊN QUAN trực tiếp tới 3 báo cáo (ứng viên khá chắc, vẫn cần
DBA xác nhận lần cuối — xem danh sách câu hỏi còn lại bên dưới mục 2)**:

| Cột thật | Kiểu | Ứng viên cho |
|---|---|---|
| `TRANS_NUM` | char | Số đơn (SoDon) |
| `IDX` | numeric | STT dòng hàng trong đơn (ghép với TRANS_NUM làm khoá `MaThucThe`) |
| `TRAN_DATE` | datetime | Ngày đặt (EventDate) |
| `DUE_DATE` | datetime | Ngày giao DỰ KIẾN (NgayGiao) |
| `DELIVER_DT` | datetime | **CÓ THỂ là ngày giao/nhận THỰC TẾ** — nếu đúng, giải quyết được "Giới hạn đã biết" cũ (trước đây tưởng KHÔNG có cột ngày nhận thật) |
| `BU_ID` | char | Mã siêu thị thô — ĐÃ XÁC NHẬN (xem mục 4) |
| `STATUS` | char | Trạng thái — ĐÃ XÁC NHẬN |
| `SKU_ID` | char | **Mã hàng** (MaHang) |
| `UNIT_SYMB` | char | Đơn vị tính (DVT) |
| `ORD_QTY` / `ORDP_QTY` | numeric | **2 ứng viên cho SL đặt** — CẦN DBA phân biệt rõ khác nhau thế nào |
| `DLV_QTY` | numeric | **SL thực nhận** (DLV = Deliver) |
| `ORD_PRICE` | numeric | Đơn giá đặt (DonGia) |
| `AMOUNT` | decimal | Thành tiền |
| `SUPP_ID` | char | Mã nhà cung cấp (MaNCC) |
| `STAFF_ID` / `USER_ID` | char/int | Người đặt (NguoiDat) |
| `HDR_REMARK` / `REMARK` | nvarchar | Ghi chú đầu đơn / ghi chú dòng |

**CHƯA thấy trong `ST_ORDER`, nhiều khả năng cần JOIN sang bảng khác**:
- **Tên hàng** (`TenHang`) — không có cột tên, chỉ có `SKU_ID` (mã) — cần
  hỏi DBA tên bảng "danh mục hàng hoá" (item master) để `JOIN` lấy tên.
- **Tên nhà cung cấp** (`TenNCC`) — tương tự, chỉ có `SUPP_ID` (mã) —
  **ĐÃ XÁC NHẬN 07/10/2026**: tên bảng là **`SUPPLIER`** — CÒN THIẾU tên
  cột chính xác (mã NCC + tên NCC trong chính bảng này) trước khi sửa
  VIEW, xem câu hỏi ở mục 2.
- **Watermark cập nhật** — CHƯA thấy cột nào rõ nghĩa "lần sửa gần nhất"
  (`UPDATED` là kiểu `bit` — cờ đúng/sai, KHÔNG phải mốc thời gian, không
  dùng được làm watermark). Ứng viên còn lại: `STOPED_DT`/`FINISH_DT`
  nhưng ý nghĩa thật chưa rõ — cần DBA xác nhận có cột nào khác phù hợp
  hơn, hoặc xác nhận KHÔNG CÓ (nếu vậy, đồng bộ phải đổi chiến lược — quét
  lại toàn bộ thay vì theo watermark, cần bàn thêm).

**Toàn bộ 116 cột đã thấy** (để tra cứu nhanh khi cần, phần lớn KHÔNG dùng
cho 3 báo cáo này — mã khuyến mãi/hoa hồng/ngoại tệ của hệ POS):
`TRANS_NUM, TRANS_CODE, TRAN_DATE, TRAN_TIME, EF_DATE, DUE_DATE,
DELIVER_DT, FINISH_DT, STOPED_DT, BU_ID, REF_NO, REF_DATE, REF_TYPE, REF,
RS_CODE, CS_ID, STAFF_ID, CARD_ID, CTC_ID, PMT_MODE, PMT_TYPE, PMT_TIME,
CR_TYPE, ORD_WAY, POST, UPDATED, ACTION, COPIES, SHIFT, USER_ID, WS_ID,
HDR_REMARK, STATUS, IMPORT, STK_ID, STK_TYPE, OSTK_ID, OSTK_TYPE, KIT_ID,
KIT_TYPE, KIT_QTY, IDX, SKU_ID, UNIT_SYMB, BASE_UNIT, UNITCONV, DMS,
SAL_QTY, STK_QTY, ORDP_QTY, ORD_QTY, ORD_PRICE, DLV_QTY, ST_QTY, QTY,
PRICE, AMOUNT, SURPLUS, VAT_AMT, VAT_INCL, COMM_AMT, COMM_RATE, DISCOUNT,
DISC_RATE, CDISC_CODE, CDISC_RATE, CDISC_AMT, TDISC_CODE, TDISC_RATE,
TDISC_AMT, MDISC_CODE, MDISC_AMT, MDISC_TYPE, GDISC_CODE, GDISC_TYPE,
GDISC_AMT, GIFT_SQTY, GIFT_QTY, CCOMM_CODE, CCOMM_RATE, CCOMM_AMT,
TCOMM_CODE, TCOMM_RATE, TCOMM_AMT, TCOMM_TYPE, MCOMM_CODE, MCOMM_AMT,
MCOMM_TYPE, GCOMM_CODE, GCOMM_TYPE, GCOMM_AMT, GCOMM_SQTY, GCOMM_QTY,
TAX_CODE, MERC_TYPE, ITEM_TYPE, FOREX_RATE, FOREX_CYS, FOREX_AMT,
EXPIRY_DT, WARR_TM, REMARK, SUPP_ID, CUST_ID, CDISC_TYPE, TDISC_TYPE,
TDADD_CODE, TDADD_TYPE, TDADD_RATE, TDADD_AMT, MDISC_RATE, MDADD_CODE,
MDADD_TYPE, MDADD_RATE, MDADD_AMT`.

**Phát hiện thêm cần lưu ý**: `ST_ORDER` CÒN CÓ 1 cột `STK_ID` RIÊNG (khác
`BU_ID`) — đây nhiều khả năng là mã KHO chi tiết (khớp đúng khái niệm
"STK_ID do người dùng tự tạo, gắn theo mã Điểm" trong "quy tắc mã BU_ID và
STK_ID.md") chứ KHÔNG phải mã dùng để ánh xạ siêu thị ở tầng báo cáo —
**VẪN dùng `BU_ID` để ánh xạ ra mã Điểm** (đã xác nhận đúng ở mục 4), cột
`STK_ID` này CHỈ mang tính tham khảo nội bộ DSmart16, không cần đưa vào
VIEW trừ khi DBA xác nhận cần dùng cho mục đích khác.

## 2. VIEW mẫu trên DSmart16 — ĐÃ CHỐT nguồn STRANS (06/10/2026), đã test thật, đang sửa theo lỗi thật

**SỬA bản 8.92**: bỏ hẳn `ST_ORDER`/`ST_ORDER_ARC` — nguồn THẬT đã xác
nhận là `STRANS` (bảng ĐÃ dùng cho báo cáo doanh thu cuối ngày),
`TRANS_CODE IN ('133','333')` (133=đặt hàng, 333=nhập hàng, MỖI LOẠI 1
DÒNG RIÊNG), `REF`=mã đơn hàng gốc (dùng gộp nhiều lần nhận ở tầng ứng
dụng, KHÔNG gộp trong VIEW). Xem `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập
hàng-So sánh (DSMART16 trung tâm).sql` — VIEW thật chạy trên server, nội
dung dưới đây PHẢI khớp y hệt file đó, đừng sửa lệch 2 nơi.

**SỬA 06/10/2026 (sau khi chạy thật)**: `STRANS` KHÔNG có cột `PRICE`
(lỗi `Invalid column name 'PRICE'` khi chạy lần đầu) — đúng như báo cáo
doanh thu cuối ngày đã xác nhận trước đó (`STRANS` chỉ có `QTY`/`AMOUNT`,
không có đơn giá riêng). Đã sửa `DonGia` = `AMOUNT / NULLIF(QTY, 0)`
(suy ra từ thành tiền/số lượng) thay vì đọc thẳng cột `PRICE`.

```sql
CREATE OR ALTER VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(m.TRANS_NUM AS VARCHAR(50)) + '|' + CAST(m.IDX AS VARCHAR(10)) AS MaThucThe,
    CAST(m.TRAN_DATE AS DATE)   AS EventDate,
    m.STOPED_DT                 AS UpdatedAt,        -- watermark — vẫn chưa chắc, xem cảnh báo dưới
    m.BU_ID                     AS MaDiem,           -- ánh xạ ra mã Điểm chuẩn ở tầng rp-server (buildBuIdLookup(), xem mục 4)
    NULL                        AS TenDiem,          -- hệ thống LUÔN ưu tiên tên trong bảng Ánh xạ Điểm-STK
    m.REF                       AS SoDon,            -- MÃ ĐƠN HÀNG GỐC (đã xác nhận) — dùng nhóm nhiều lần nhận hàng
    m.TRANS_CODE                AS LoaiGiaoDich,     -- '133'=đặt hàng, '333'=nhập hàng (đã xác nhận)
    CAST(m.DUE_DATE AS DATE)    AS NgayGiao,
    m.SUPP_ID                   AS MaNCC,
    s.SUPP_NAME                 AS TenNCC,           -- JOIN dbo.SUPPLIER (đã xác nhận 07/10/2026)
    m.STAFF_ID                  AS NguoiDat,
    m.SKU_ID                    AS MaHang,
    NULL                        AS TenHang,          -- cần JOIN bảng danh mục hàng hoá nếu muốn hiện tên (chưa có, hiện mã)
    m.UNIT_SYMB                 AS DVT,
    m.STATUS                    AS TrangThai,
    CASE m.STATUS
        WHEN 'C' THEN N'Chưa nhập' WHEN 'P' THEN N'Đã nhập 1 phần' WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa' ELSE m.STATUS
    END                         AS TrangThaiLabel,
    m.QTY                       AS SoLuong,
    m.AMOUNT / NULLIF(m.QTY, 0) AS DonGia,           -- STRANS không có cột PRICE — suy ra từ AMOUNT/QTY
    m.AMOUNT                    AS ThanhTien
FROM dbo.STRANS m
LEFT JOIN dbo.SUPPLIER s ON s.SUPP_ID = m.SUPP_ID
WHERE m.TRANS_CODE IN ('133','333') AND m.STATUS NOT IN ('D','E');
```

**✅ ĐÃ CHẠY THẬT 06/10/2026 — VIEW tạo thành công, có dữ liệu thật** (người
dùng gửi `SELECT TOP 20 ... ORDER BY EventDate DESC`, không còn lỗi
"Invalid column name" cho bất kỳ cột nào khác — `IDX`/`DUE_DATE`/`SUPP_ID`/
`STAFF_ID`/`UNIT_SYMB`/`STOPED_DT`/`REF` đều tồn tại và đọc được). 2 phát
hiện MỚI từ dữ liệu thật:

1. **`STOPED_DT` (watermark `UpdatedAt`) ra NULL HẾT** trên toàn bộ 20
   dòng mẫu — XÁC NHẬN đây KHÔNG dùng được làm watermark: `WHERE
   updatedAtCol >= watermark` sẽ luôn loại bỏ dòng có cột NULL (SQL:
   `NULL >= x` không bao giờ là `TRUE`), khiến job đồng bộ chạy "thành
   công" nhưng KHÔNG BAO GIỜ lấy được dòng nào. **ĐÃ SỬA** (tầng job,
   KHÔNG cần sửa/chạy lại VIEW): `etl/scripts/seedDonDatHangSync.js` đổi
   `updatedAtColumn` từ `'UpdatedAt'` sang `'EventDate'` — đúng tiền lệ
   `seedLdtdHcrcSync.js` dùng cho `V_HCRC_GIAODICH_CHINHANH` (cũng không
   có cột cập nhật thật) — `tableSyncEngine.js` đã có sẵn cơ chế quét lại
   trọn ngày mỗi lượt chạy (`floorToDay` + `>=`), an toàn vì upsert dùng
   MERGE idempotent.
2. **Phát hiện mã trạng thái MỚI `TrangThai = 'N'`** — KHÔNG có trong danh
   sách 6 mã đã xác nhận trước đây (C/P/F/M/D/E, xem bảng ở mục 1).
   KHÔNG gây lỗi (VIEW chỉ loại `D`/`E`, còn lại hiện bình thường — `CASE`
   rơi vào `ELSE STATUS` nên `TrangThaiLabel` hiện tạm đúng mã thô `"N"`
   thay vì nhãn tiếng Việt) — **CẦN hỏi DBA ý nghĩa mã `N`** để bổ sung
   nhãn đúng vào `CASE` (phỏng đoán: có thể là "Mới tạo", CHƯA XÁC NHẬN).

Còn lại, chưa xác nhận:
- `DonGia` tính từ `AMOUNT/QTY` — khi `QTY=0` ra `NULL` (đã chặn chia 0
  bằng `NULLIF`), cần xem có hợp lý với cách DBA/người dùng hiểu "đơn
  giá" trên 2 loại giao dịch 133/333 hay không (vd có thể cần xem thêm
  `VAT_AMT`/`DISCOUNT`/`COMM_AMT` nếu đơn giá hiển thị lệch so với phiếu
  giấy).

**✅ ĐÃ XÁC NHẬN (07/10/2026) — bảng `SUPPLIER`**: người dùng gửi kết quả
`INFORMATION_SCHEMA.COLUMNS` thật của bảng `SUPPLIER` — có đúng `SUPP_ID`
(`char`, khớp tên VÀ kiểu với `STRANS.SUPP_ID`, JOIN trực tiếp được không
cần ép kiểu) và `SUPP_NAME` (`nvarchar`, tên NCC hiển thị). VIEW ở trên đã
cập nhật `LEFT JOIN dbo.SUPPLIER s ON s.SUPP_ID = m.SUPP_ID` — dùng
`LEFT JOIN` (không phải `INNER JOIN`) để đơn hàng có mã NCC không khớp
dòng nào trong `SUPPLIER` vẫn hiện ra, chỉ tên NCC để trống.

**SỬA bản 8.95 (sau khi JOIN SUPPLIER)**: thêm cột `MaNCC` vào 2 báo cáo
"Đơn đặt hàng"/"Đơn nhập hàng" (trước đây chỉ có `TenNCC`, không có cột
mã) + thêm bộ lọc "Nhà cung cấp" (dropdown tìm kiếm được, DÙNG DỮ LIỆU
THẬT đã đồng bộ qua `optionsSource` — đúng cơ chế đang dùng cho bộ lọc
"Chi nhánh" ở báo cáo khác, KHÔNG phải danh sách gõ tay cố định nên tự
cập nhật khi có NCC mới) cho cả 3 báo cáo — xem
`rp-server/scripts/seedPurchaseOrderReports.js`.

## 3. Thiết kế đồng bộ — domain `don_dat_hang` (SỬA bản 8.92, nguồn STRANS)

**SỬA bản 8.92**: nguồn đổi sang `STRANS`, `TRANS_CODE` 133=đặt hàng/
333=nhập hàng — **MỖI LOẠI LÀ 1 DÒNG RIÊNG** (khác thiết kế 8.75 ban đầu
giả định SL đặt + SL nhận chung 1 dòng). Domain vẫn DÙNG CHUNG cho cả 3
báo cáo — chỉ khác ở việc runner lọc/gộp theo `LoaiGiaoDich`/`SoDon`:

- **Sync Job**: `etl/scripts/seedDonDatHangSync.js` — Type='table', trỏ
  `dbo.vw_DonDatHangChiNhanh`, `KeyColumn=MaThucThe`, `DateColumn=EventDate`,
  `UpdatedAtColumn=UpdatedAt`, `TargetDomain=don_dat_hang`,
  **`KeepHistory=1`** (bắt buộc — cần lưu riêng từng ngày để báo cáo lọc
  "theo ngày cả quá khứ").
- **Dimensions**: `MaDiem` (mã BU_ID thô, ghi đè bằng mã Điểm chuẩn lúc
  chạy báo cáo — xem mục 4), `TenDiem`, `SoDon` (= cột `REF`, "mã đơn hàng
  gốc" — ĐÃ XÁC NHẬN), `LoaiGiaoDich` (= `TRANS_CODE` thô, `'133'`/`'333'`),
  `NgayGiao`, `MaNCC`, `TenNCC`, `NguoiDat`, `MaHang`, `TenHang`, `DVT`,
  `TrangThai`, `TrangThaiLabel`.
- **Measures**: `SoLuong` (1 measure DUY NHẤT — SL đặt khi `LoaiGiaoDich=
  '133'`, SL nhận khi `'333'`, ý nghĩa tuỳ `LoaiGiaoDich` của dòng đó),
  `DonGia`, `ThanhTien`.

## 4. Ánh xạ mã siêu thị — dùng bảng "Ánh xạ Điểm - STK_ID" đã có (SỬA bản 8.91)

**SỬA bản 8.91** (đối chiếu lại "quy tắc mã BU_ID và STK_ID.md" theo yêu
cầu người dùng): mục này BAN ĐẦU (bản 8.75) viết SAI là dùng mã STK_ID —
SQL thật chạy trên `ST_ORDER` (06/10/2026) xác nhận cột mã siêu thị đồng
bộ về là **`BU_ID`** (y hệt `TRANSHDR`, domain `giaodich_chinhanh`),
**KHÔNG PHẢI** `STK_ID` (`STK_ID` CHỈ có ở `STRANS`, domain doanh thu) —
`ST_ORDER` KHÔNG có khái niệm "kỳ cũ/mới" như STK (kho), chỉ 1 giá trị
`BU_ID` DUY NHẤT, cố định theo mã Điểm.

`rp-server/lib/purchaseOrderRunner.js` đọc `Dimensions.MaDiem` (mã BU_ID
thô do DSmart16 đồng bộ sang), tra `etl.DiemStkMapping` (qua
`lib/diemStkMapping.js:buildBuIdLookup()` — đọc **tường minh** cột `BuId`
trong bảng "Ánh xạ Điểm - STK_ID", **KHÔNG tự suy** quy tắc "+00" — xem
file quy tắc, mục "Bỏ hẳn quy tắc tự suy '+00'") để **GHI ĐÈ** `MaDiem`/
`TenDiem` bằng mã Điểm + tên siêu thị CHUẨN của HCRC. BU_ID thô **CHƯA
khai tường minh** trong bảng ánh xạ bị **LOẠI KHỎI báo cáo** (không hiện
mã thô lẫn với mã Điểm chuẩn, không đoán bừa) — admin bổ sung cột `BuId`
trong bảng ánh xạ để dòng đó xuất hiện.

`__storeScope` (bản 8.51, phạm vi siêu thị theo người dùng đăng nhập) áp
dụng SAU khi đã dịch BU_ID → mã Điểm (so khớp TRỰC TIẾP theo mã Điểm
chuẩn, mirror đúng cách `lib/compositeReportRunner.js` áp storeScope sau
`mapBuIdToMaDiem` — KHÔNG dùng `resolveStoreScopeStkIds()`, hàm đó dành
riêng cho domain dùng STK_ID) — người dùng bị giới hạn 1/nhiều siêu thị
chỉ thấy đúng đơn hàng của siêu thị đó.

## 5. 3 báo cáo — CÙNG 1 domain, khác `transCode`/`aggregateByOrder` (SỬA bản 8.92)

| Báo cáo | ReportId | `definition` | Cột chính |
|---|---|---|---|
| Đơn đặt hàng | `bc-don-dat-hang` | `transCode: '133'` | Ngày đặt, Số đơn, Siêu thị, NCC, Mã/Tên hàng, SL đặt, Đơn giá, Thành tiền, Ngày giao, Trạng thái |
| Đơn nhập hàng | `bc-don-nhap-hang` | `transCode: '333'` | Ngày đặt(*), Số đơn, Siêu thị, NCC, Mã/Tên hàng, SL nhận, Đơn giá, Thành tiền, Trạng thái |
| So sánh đặt–nhận | `bc-so-sanh-dat-nhan` | `aggregateByOrder: true` | Ngày đặt, Siêu thị, NCC, Mã/Tên hàng, SL đặt (SUM dòng 133), SL thực nhận (SUM mọi dòng 333 CÙNG Số đơn — xử lý nhận NHIỀU LẦN), Chênh lệch SL, Tỷ lệ hoàn thành (%), Chênh lệch giá trị, Trạng thái |

(*) `eventDate`/`EventDate` = `TRAN_DATE` của CHÍNH dòng đó — với báo cáo
"Đơn nhập hàng", mỗi dòng là 1 LẦN NHẬN riêng nên `eventDate` ở đây thực
chất là NGÀY NHẬN của lần đó (không phải ngày đặt gốc) — tên field giữ
nguyên `eventDate` cho đồng bộ với các domain khác trong hệ thống, không
đổi tên riêng cho domain này.

Cả 3 dùng `SourceType='purchaseOrder'` (runner riêng, KHÔNG phải
`directDb` thường — vì cần bước ánh xạ BU_ID ở mục 4 VÀ bước lọc/gộp theo
`LoaiGiaoDich`/`SoDon` mà `reportEngine.js` gốc không có) — xem
`rp-server/lib/purchaseOrderRunner.js`. "So sánh đặt–nhận" gộp (SUM)
trong JS (`aggregateByOrder()`, nhóm theo `MaDiem+SoDon+MaHang`) — KHÔNG
gộp trong SQL/VIEW — để 2 báo cáo đơn lẻ vẫn thấy ĐÚNG từng dòng/lần giao
dịch riêng biệt. Cột "Chênh lệch"/"Tỷ lệ hoàn thành" dùng công thức
(`lib/formulaEngine.js`) trên kết quả ĐÃ GỘP
(`measures.SoLuongTheoDon - measures.SoLuongThucNhan`).

**Loại trừ đơn xoá/huỷ** (ĐÃ XÁC NHẬN, 06/10/2026): `D` (Đã xoá) và `E`
(Đã huỷ) bị loại HẲN khỏi cả 3 báo cáo ngay trong VIEW
(`WHERE STATUS NOT IN ('D','E')`), không chỉ riêng báo cáo so sánh.

## 6. Giới hạn đã biết (v1)

- **ĐÃ GIẢI QUYẾT ở bản 8.92** (không còn là giới hạn): trước đây tưởng
  CHỈ lọc được theo "ngày ĐẶT" — giờ mỗi dòng (`133`/`333`) tự mang ĐÚNG
  ngày của chính giao dịch đó (`EventDate`=`TRAN_DATE`) nhờ đổi nguồn sang
  `STRANS`, nên "Đơn nhập hàng" lọc được theo đúng NGÀY NHẬN thật của
  từng lần nhận, không chỉ ngày đặt gốc.
- KHÔNG có bộ lọc "Siêu thị" trên giao diện ở v1 (yêu cầu ban đầu là xem
  TOÀN BỘ siêu thị cùng lúc) — `__storeScope` vẫn áp dụng đúng cho người
  dùng bị giới hạn phạm vi.
- `D` (đã xoá)/`E` (đã huỷ) vẫn hiện trong mọi báo cáo, có cột "Trạng
  thái" để tự phân biệt — CHƯA tự động loại (cần xác nhận thêm nghiệp vụ
  nếu muốn ẩn mặc định).
