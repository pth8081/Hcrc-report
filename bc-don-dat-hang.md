# Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận

Tài liệu tham chiếu chính thức cho 3 báo cáo: "Đơn đặt hàng", "Đơn nhập
hàng", "So sánh đặt–nhận" (toàn bộ siêu thị) — **đọc file này TRƯỚC khi sửa
bất kỳ logic nào liên quan** (`rp-server/lib/purchaseOrderRunner.js`,
`etl/scripts/seedDonDatHangSync.js`), cùng quy ước với "quy tắc mã BU_ID và
STK_ID.md"/"bc-ton-kho-0.md".

## 1. Nguồn dữ liệu DSmart16 (theo DBA xác nhận)

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

### Mã trạng thái (`STATUS`, đã xác nhận đủ 6 mã)

| Mã | Ý nghĩa | Xử lý trong báo cáo |
|---|---|---|
| `C` | Chưa nhập | Hiện bình thường |
| `P` | Đã nhập 1 phần | Hiện bình thường |
| `F` | Đã nhập hết | Hiện bình thường |
| `M` | Đơn sửa | Hiện bình thường (coi như đang hoạt động, giống `P`/`C`) |
| `D` | Đã xoá | Hiện bình thường, có cột trạng thái để người xem tự lọc |
| `E` | Đã huỷ | Hiện bình thường, có cột trạng thái để người xem tự lọc |

**CHƯA xác nhận với DBA**: `D`/`E` có tự loại khỏi báo cáo so sánh (coi
như "không tính chênh lệch") hay vẫn hiện để đối chiếu — tạm thời giữ
nguyên, hiện đủ cả 6 trạng thái, admin tự lọc qua cột "Trạng thái" nếu
cần loại trừ.

## 2. VIEW mẫu trên DSmart16 — ĐÃ XÁC NHẬN 1 PHẦN bằng SQL thật (06/10/2026), VẪN CÒN THIẾU cột hàng hoá

**Đã xác nhận bằng SQL thật** (`INFORMATION_SCHEMA.COLUMNS` + `SELECT TOP
20` trên `ST_ORDER`):
- Mã siêu thị = cột **`BU_ID`** (KHÔNG phải `STK_ID` như giả định ban đầu
  — xem sửa mục 4). Mẫu: `BU_ID='40000'`, `BU_ID='30400'`.
- Cột `STATUS` tồn tại đúng tên, chạy `GROUP BY STATUS` được — nhưng kết
  quả mẫu CHỈ thấy 3 nhóm (trống/`D`/`E`), CHƯA thấy `C`/`P`/`F`/`M` (có
  thể do mẫu dữ liệu đang xem, hoặc do lọc `TRANS_CODE='330'` — xem điểm
  mới bên dưới).
- Các cột khác đã thấy tên thật: `TRANS_NUM` (char 18, có thể là số đơn,
  dạng ghép), `TRANS_CODE` (char 3, mẫu toàn `'330'`), `TRAN_DATE`/
  `TRAN_TIME`, `EF_DATE`, `DUE_DATE`, `DELIVER_DT`, `FINISH_DT`,
  `STOPED_DT`, `REF_NO`, `REF_DATE`, `REF_TYPE`, `REF`, `EXPIRY_DT`.

**VẪN THIẾU — CHƯA thấy cột nào cho**: mã hàng, tên hàng, số lượng đặt,
số lượng thực nhận, đơn giá, thành tiền, mã/tên nhà cung cấp. 2 khả năng:
(a) các cột đó nằm ngoài phần đã xem (`ST_ORDER` có thể còn nhiều cột hơn
8-15 cột đã thấy), hoặc (b) `ST_ORDER` chỉ là bảng ĐẦU ĐƠN (header), chi
tiết từng mặt hàng nằm ở 1 bảng khác liên kết qua `TRANS_NUM`. **CHƯA thể
viết VIEW thật cho tới khi rõ điểm này** — VIEW dưới đây VẪN CHỈ LÀ VÍ DỤ
cho phần đã biết (mã siêu thị, trạng thái), phần hàng hoá/số lượng/giá
GIỮ NGUYÊN tên PHỎNG ĐOÁN cũ, chưa đối chiếu được.

```sql
CREATE VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)) AS MaThucThe,  -- khoá duy nhất 1 dòng hàng — CHƯA XÁC NHẬN, có thể TRANS_NUM đã đủ làm khoá nếu ST_ORDER là header
    CAST(NgayDat AS DATE)       AS EventDate,        -- CHƯA XÁC NHẬN — có thể là TRAN_DATE (đã thấy tên thật) thay vì NgayDat
    UpdatedAt                   AS UpdatedAt,        -- watermark đồng bộ — CHƯA XÁC NHẬN — ứng viên: STOPED_DT/FINISH_DT (đã thấy tên thật, cần hỏi DBA cột nào đúng nghĩa "lần sửa gần nhất")
    BU_ID                       AS MaDiem,           -- ĐÃ XÁC NHẬN đúng tên cột thật — mã siêu thị thô, ánh xạ ra mã Điểm chuẩn ở tầng rp-server (buildBuIdLookup(), xem mục 4)
    TenSieuThiDSmart            AS TenDiem,          -- CHƯA XÁC NHẬN tên cột — tên siêu thị theo DSmart16 (dự phòng, ưu tiên ánh xạ Điểm-STK nếu có)
    SoDon                       AS SoDon,            -- CHƯA XÁC NHẬN — có thể chính là TRANS_NUM
    CAST(NgayGiao AS DATE)      AS NgayGiao,         -- CHƯA XÁC NHẬN — có thể là DUE_DATE/DELIVER_DT (đã thấy tên thật)
    MaNCC                       AS MaNCC,            -- CHƯA THẤY cột này ở đâu cả — xem ghi chú "VẪN THIẾU" ở trên
    TenNCC                      AS TenNCC,           -- CHƯA THẤY
    NguoiDat                    AS NguoiDat,         -- CHƯA THẤY
    MaHang                      AS MaHang,           -- CHƯA THẤY
    TenHang                     AS TenHang,          -- CHƯA THẤY
    MaVach                      AS MaVach,           -- CHƯA THẤY
    DVT                         AS DVT,              -- CHƯA THẤY
    STATUS                      AS TrangThai,        -- ĐÃ XÁC NHẬN đúng tên cột thật
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập'
        WHEN 'P' THEN N'Đã nhập 1 phần'
        WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa'
        WHEN 'D' THEN N'Đã xoá'
        WHEN 'E' THEN N'Đã huỷ'
        ELSE STATUS
    END                         AS TrangThaiLabel,
    SoLuongTheoDon              AS SoLuongTheoDon,   -- CHƯA THẤY — SL đặt (cột "Theo đơn" trên phiếu)
    SoLuongThucNhan             AS SoLuongThucNhan,  -- CHƯA THẤY — SL nhận thật (cột "Thực nhận" trên phiếu, NULL/0 khi STATUS='C')
    DonGia                      AS DonGia,           -- CHƯA THẤY
    ThanhTien                   AS ThanhTien         -- CHƯA THẤY
FROM dbo.ST_ORDER
UNION ALL
SELECT
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)), CAST(NgayDat AS DATE), UpdatedAt, BU_ID, TenSieuThiDSmart,
    SoDon, CAST(NgayGiao AS DATE), MaNCC, TenNCC, NguoiDat, MaHang, TenHang, MaVach, DVT, STATUS,
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập' WHEN 'P' THEN N'Đã nhập 1 phần' WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa' WHEN 'D' THEN N'Đã xoá' WHEN 'E' THEN N'Đã huỷ' ELSE STATUS
    END,
    SoLuongTheoDon, SoLuongThucNhan, DonGia, ThanhTien
FROM dbo.ST_ORDER_ARC;
```

**Các điểm còn CẦN đối chiếu lại với DBA (đã bỏ điểm "mã siêu thị" — đã
xác nhận xong là `BU_ID`):**
1. **[MỚI, QUAN TRỌNG NHẤT]** Toàn bộ danh sách cột của `ST_ORDER` (SQL
   kiểm tra mới chỉ xem được ~15 cột, có vẻ chưa đủ hết) — đặc biệt cần
   tìm cột mã hàng/tên hàng/số lượng đặt/số lượng nhận/đơn giá/thành tiền/
   nhà cung cấp. Nếu KHÔNG có trong `ST_ORDER`, hỏi DBA tên bảng chi tiết
   (dòng hàng) liên kết qua `TRANS_NUM`.
2. **[MỚI]** `TRANS_CODE` — mẫu đã xem toàn bộ là `'330'`, hỏi DBA đây có
   phải mã CỐ ĐỊNH cho "đơn đặt hàng" hay `ST_ORDER` còn chứa cả mã khác
   (nếu có mã khác, VIEW cần thêm `WHERE TRANS_CODE = '330'` để lọc đúng
   loại giao dịch, tránh lẫn dữ liệu không phải đơn đặt hàng).
3. Tên cột ngày đặt thật — `TRAN_DATE` có khả năng cao là ứng viên (đã
   xác nhận TỒN TẠI, nhưng chưa xác nhận Ý NGHĨA đúng là "ngày đặt").
4. Tên cột watermark cập nhật — cần 1 cột phản ánh ĐÚNG lần sửa gần nhất
   (để đồng bộ bắt được đơn chuyển trạng thái `C→P→F` hoặc `M`) — ứng
   viên: `STOPED_DT`/`FINISH_DT` (đã xác nhận tồn tại, chưa xác nhận ý
   nghĩa).
5. `SoLuongThucNhan` khi `STATUS='C'` (chưa nhập) — xác nhận trả về `0`
   hay `NULL` (ảnh hưởng công thức "Chênh lệch"/"Tỷ lệ hoàn thành" ở báo
   cáo so sánh — cả 2 trường hợp đều cho kết quả ĐÚNG với công thức đã
   viết, chỉ cần biết để không nhầm "0" là lỗi dữ liệu).
6. `ST_ORDER`/`ST_ORDER_ARC` có đúng là "1 dòng = 1 dòng hàng (SKU) trong
   1 đơn" hay "1 dòng = 1 đơn hàng" (SL/Mã hàng nằm ở bảng khác, cần JOIN
   thêm) — mẫu dữ liệu đã xem (`TRANS_NUM` lặp lại 4 dòng giống hệt nhau ở
   1 mẫu) gợi ý CÓ THỂ là header lặp theo số lần cập nhật, KHÔNG phải dòng
   hàng khác nhau — CẦN XÁC NHẬN RÕ, ảnh hưởng toàn bộ thiết kế VIEW.

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
