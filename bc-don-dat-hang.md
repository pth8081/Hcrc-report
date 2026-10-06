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

**CÒN CHỜ xác nhận**: cột **`REF`** (dạng `"3011-00100302609000206"`,
NHIỀU dòng cùng `TRANS_NUM` chia sẻ CHUNG 1 giá trị `REF`, rồi đổi sang
giá trị khác cho nhóm `TRANS_NUM` tiếp theo) có phải chính là **"mã đơn
đặt hàng gốc"** dùng để nhóm nhiều lần nhận hàng (`TRANS_CODE='333'`) lại
với đúng 1 đơn đặt (`TRANS_CODE='133'`) ban đầu hay không — đây là mảnh
ghép CUỐI CÙNG cần có trước khi khoá thiết kế VIEW. Nếu đúng, khả năng
cao TOÀN BỘ thiết kế sẽ CHUYỂN sang dùng `STRANS` (đã có sẵn cấu trúc
chi tiết dòng hàng tốt, đã dùng ổn định cho doanh thu) thay vì
`ST_ORDER`/`ON_ORDER`/`FN_ORDER` — **CHƯA đổi code/SQL cho tới khi xác
nhận xong điểm này.**

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
- **Tên nhà cung cấp** (`TenNCC`) — tương tự, chỉ có `SUPP_ID` (mã) — cần
  tên bảng "danh mục nhà cung cấp" (supplier master) để `JOIN`.
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

## 2. VIEW mẫu trên DSmart16 — ĐÃ CÓ ĐỦ DANH SÁCH CỘT THẬT (06/10/2026), chỉ còn vài điểm cần DBA xác nhận Ý NGHĨA

**Đã có đủ `INFORMATION_SCHEMA.COLUMNS` của `ST_ORDER` (116 cột)** — xem
danh sách đầy đủ + phân tích ở mục 1. Đã xác định rõ: `ST_ORDER` là bảng
GỘP header+chi tiết dòng hàng (1 dòng = 1 SKU trong 1 đơn), giải quyết
dứt điểm câu hỏi "1 dòng = 1 SKU hay 1 đơn" các bản trước. VIEW dưới đây
dùng ĐÚNG tên cột thật cho các ứng viên khá chắc chắn — các cột còn in
đậm `<<<` vẫn cần DBA xác nhận Ý NGHĨA (không phải tên, tên đã có).

```sql
CREATE VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(TRANS_NUM AS VARCHAR(50)) + '|' + CAST(IDX AS VARCHAR(10)) AS MaThucThe,  -- khoá 1 dòng hàng trong 1 đơn (IDX = STT dòng)
    CAST(TRAN_DATE AS DATE)     AS EventDate,        -- <<< Ngày đặt — xác nhận Ý NGHĨA đúng (tên cột đã chắc)
    STOPED_DT                   AS UpdatedAt,        -- <<< Watermark — CHƯA CHẮC, xem câu hỏi watermark bên dưới, có thể KHÔNG có cột phù hợp
    BU_ID                       AS MaDiem,           -- ĐÃ XÁC NHẬN — ánh xạ ra mã Điểm chuẩn ở tầng rp-server (buildBuIdLookup(), xem mục 4)
    NULL                        AS TenDiem,          -- Không có tên siêu thị trực tiếp trong ST_ORDER — hệ thống LUÔN ưu tiên tên trong bảng Ánh xạ Điểm-STK, cột này chỉ dự phòng nên để NULL
    TRANS_NUM                   AS SoDon,
    CAST(DUE_DATE AS DATE)      AS NgayGiao,         -- Ngày giao DỰ KIẾN
    CAST(DELIVER_DT AS DATE)    AS NgayNhanThat,      -- <<< MỚI — có thể là ngày giao/nhận THỰC TẾ, xác nhận với DBA (nếu đúng, bỏ được "Giới hạn đã biết" cũ)
    SUPP_ID                     AS MaNCC,
    NULL                        AS TenNCC,           -- <<< Cần tên bảng "danh mục nhà cung cấp" để JOIN lấy tên — xem câu hỏi bên dưới
    STAFF_ID                    AS NguoiDat,
    SKU_ID                      AS MaHang,
    NULL                        AS TenHang,          -- <<< Cần tên bảng "danh mục hàng hoá" để JOIN lấy tên — xem câu hỏi bên dưới
    UNIT_SYMB                   AS DVT,
    STATUS                      AS TrangThai,
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập'
        WHEN 'P' THEN N'Đã nhập 1 phần'
        WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa'
        WHEN 'D' THEN N'Đã xoá'
        WHEN 'E' THEN N'Đã huỷ'
        ELSE STATUS
    END                         AS TrangThaiLabel,
    ORD_QTY                     AS SoLuongTheoDon,   -- <<< CHƯA CHẮC — ORD_QTY hay ORDP_QTY mới đúng "SL đặt"? xem câu hỏi bên dưới
    DLV_QTY                     AS SoLuongThucNhan,  -- <<< Khá chắc (DLV=Deliver) nhưng vẫn cần DBA xác nhận
    ORD_PRICE                   AS DonGia,
    AMOUNT                      AS ThanhTien
FROM dbo.ST_ORDER
WHERE TRANS_CODE = '330'  -- <<< lọc đúng loại "đơn đặt hàng" — XÁC NHẬN đây là mã cố định, không lẫn mã khác trong bảng
UNION ALL
SELECT
    CAST(TRANS_NUM AS VARCHAR(50)) + '|' + CAST(IDX AS VARCHAR(10)), CAST(TRAN_DATE AS DATE), STOPED_DT, BU_ID, NULL,
    TRANS_NUM, CAST(DUE_DATE AS DATE), CAST(DELIVER_DT AS DATE), SUPP_ID, NULL, STAFF_ID, SKU_ID, NULL, UNIT_SYMB, STATUS,
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập' WHEN 'P' THEN N'Đã nhập 1 phần' WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa' WHEN 'D' THEN N'Đã xoá' WHEN 'E' THEN N'Đã huỷ' ELSE STATUS
    END,
    ORD_QTY, DLV_QTY, ORD_PRICE, AMOUNT
FROM dbo.ST_ORDER_ARC
WHERE TRANS_CODE = '330';
```

**Các câu hỏi còn CẦN DBA trả lời (đã thu hẹp từ "chưa biết tên cột" xuống
"biết tên rồi, cần xác nhận ý nghĩa"):**
1. **`ORD_QTY` vs `ORDP_QTY`** — cả 2 đều có vẻ là "số lượng đặt", khác
   nhau chỗ nào? Cột nào đúng là SL trên "Phiếu đặt hàng" (cột "Theo
   đơn")?
2. **`DLV_QTY`** — xác nhận đây đúng là SL thực nhận (cột "Thực nhận"
   trên phiếu)? Giá trị khi `STATUS='C'` (chưa nhập) là `0` hay `NULL`?
3. **Tên bảng "danh mục hàng hoá"** (để `JOIN SKU_ID` lấy Tên hàng) và
   **"danh mục nhà cung cấp"** (để `JOIN SUPP_ID` lấy Tên NCC) — `ST_ORDER`
   không có cột tên trực tiếp, chỉ có mã.
4. **`DELIVER_DT`** — có đúng là ngày giao/nhận THỰC TẾ không (khác
   `DUE_DATE` = ngày giao dự kiến)? Nếu đúng, báo cáo có thể lọc theo
   ngày nhận thật thay vì chỉ ngày đặt — cải thiện so với giới hạn v1 cũ.
5. **Watermark cập nhật** — `ST_ORDER` KHÔNG có cột nào rõ nghĩa "lần sửa
   gần nhất" (`UPDATED` chỉ là cờ `bit`, không phải mốc thời gian).
   `STOPED_DT`/`FINISH_DT` có phản ánh đúng lần sửa gần nhất không, hay
   cần chiến lược đồng bộ khác (vd quét lại toàn bộ mỗi lần thay vì theo
   watermark)?
6. **`TRANS_CODE='330'`** — xác nhận đây là mã CỐ ĐỊNH DUY NHẤT cho "đơn
   đặt hàng" trong `ST_ORDER`, hay bảng còn chứa giao dịch khác cần lọc
   thêm?

## 3. Thiết kế đồng bộ — domain `don_dat_hang`

Dùng chung 1 domain cho CẢ 3 báo cáo (SL đặt + SL nhận trên CÙNG 1 dòng —
không cần ghép composite nhiều nguồn):

- **Sync Job**: `etl/scripts/seedDonDatHangSync.js` — Type='table', trỏ
  `dbo.vw_DonDatHangChiNhanh`, `KeyColumn=MaThucThe`, `DateColumn=EventDate`
  (= ngày đặt), `UpdatedAtColumn=UpdatedAt`, `TargetDomain=don_dat_hang`,
  **`KeepHistory=1`** (bắt buộc — cần lưu riêng từng ngày để báo cáo lọc
  "theo ngày cả quá khứ").
- **Dimensions**: `MaDiem` (mã siêu thị thô, ghi đè bằng mã Điểm chuẩn lúc
  chạy báo cáo — xem mục 4), `TenDiem`, `SoDon`, `NgayGiao`, `MaNCC`,
  `TenNCC`, `NguoiDat`, `MaHang`, `TenHang`, `MaVach`, `DVT`, `TrangThai`,
  `TrangThaiLabel`.
- **Measures**: `SoLuongTheoDon`, `SoLuongThucNhan`, `DonGia`, `ThanhTien`.

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

## 5. 3 báo cáo — CÙNG 1 domain, khác cột hiển thị

| Báo cáo | ReportId | Cột chính |
|---|---|---|
| Đơn đặt hàng | `bc-don-dat-hang` | Ngày đặt, Số đơn, Siêu thị, NCC, Mã/Tên hàng, SL theo đơn, Đơn giá, Thành tiền, Ngày giao, Trạng thái |
| Đơn nhập hàng | `bc-don-nhap-hang` | Ngày đặt, Số đơn, Siêu thị, NCC, Mã/Tên hàng, SL thực nhận, Đơn giá, Thành tiền thực nhận, Trạng thái |
| So sánh đặt–nhận | `bc-so-sanh-dat-nhan` | Ngày đặt, Siêu thị, NCC, Mã/Tên hàng, SL theo đơn, SL thực nhận, Chênh lệch SL, Tỷ lệ hoàn thành (%), Chênh lệch giá trị, Trạng thái |

Cả 3 dùng `SourceType='purchaseOrder'` (runner riêng, KHÔNG phải
`directDb` thường — vì cần bước ánh xạ mã STK ở mục 4 mà `reportEngine.js`
gốc không có) — xem `rp-server/lib/purchaseOrderRunner.js`. Cột "Chênh
lệch"/"Tỷ lệ hoàn thành" dùng công thức (`lib/formulaEngine.js`) trên
CÙNG 1 dòng dữ liệu (`measures.SoLuongTheoDon - measures.SoLuongThucNhan`)
— không cần ghép composite nhiều khối.

## 6. Giới hạn đã biết (v1)

- Lọc/sắp xếp theo **ngày ĐẶT** (duy nhất có trong `EventDate`) — CHƯA có
  cột "ngày nhận thực tế" riêng (mẫu phiếu chỉ có "ngày giao DỰ KIẾN").
  Nếu DBA xác nhận có cột ngày nhận thật, có thể bổ sung sau.
- KHÔNG có bộ lọc "Siêu thị" trên giao diện ở v1 (yêu cầu ban đầu là xem
  TOÀN BỘ siêu thị cùng lúc) — `__storeScope` vẫn áp dụng đúng cho người
  dùng bị giới hạn phạm vi.
- `D` (đã xoá)/`E` (đã huỷ) vẫn hiện trong mọi báo cáo, có cột "Trạng
  thái" để tự phân biệt — CHƯA tự động loại (cần xác nhận thêm nghiệp vụ
  nếu muốn ẩn mặc định).
