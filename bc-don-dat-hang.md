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
  `ST_ORDER_ARC` chứa đơn hàng của TẤT CẢ siêu thị, phân biệt bằng 1 cột mã
  siêu thị (giả định tên `STK_ID`, cần DBA xác nhận tên cột thật).
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

## 2. VIEW mẫu trên DSmart16 — CHỈ VÍ DỤ, DBA PHẢI ĐỐI CHIẾU TÊN CỘT THẬT

**QUAN TRỌNG**: chưa có xác nhận tên cột thật của `ST_ORDER`/`ST_ORDER_ARC`
(mới chỉ biết tên 2 bảng + mã `STATUS`) — VIEW dưới đây dùng tên cột
**PHỎNG ĐOÁN** dựa trên mẫu "Phiếu đặt hàng" đã xem — **DBA PHẢI SỬA LẠI
ĐÚNG TÊN CỘT THẬT** (vế trái `AS`) trước khi tạo, KHÔNG được chạy nguyên
văn. Vế phải (tên alias sau `AS`) **GIỮ NGUYÊN** — khớp đúng tên dùng ở
`etl/scripts/seedDonDatHangSync.js`.

```sql
CREATE VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)) AS MaThucThe,  -- khoá duy nhất 1 dòng hàng
    CAST(NgayDat AS DATE)       AS EventDate,        -- cột ngày đặt thật, vd ORDER_DT
    UpdatedAt                   AS UpdatedAt,        -- watermark đồng bộ — CẦN XÁC NHẬN cột nào phản ánh lần sửa gần nhất (đơn sửa, trạng thái M)
    STK_ID                      AS MaDiem,           -- mã siêu thị thô (Nơi nhận) — ánh xạ ra mã Điểm chuẩn ở tầng rp-server
    TenSieuThiDSmart            AS TenDiem,          -- tên siêu thị theo DSmart16 (dự phòng, ưu tiên ánh xạ Điểm-STK nếu có)
    SoDon                       AS SoDon,
    CAST(NgayGiao AS DATE)      AS NgayGiao,
    MaNCC                       AS MaNCC,
    TenNCC                      AS TenNCC,
    NguoiDat                    AS NguoiDat,
    MaHang                      AS MaHang,
    TenHang                     AS TenHang,
    MaVach                      AS MaVach,
    DVT                         AS DVT,
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
    SoLuongTheoDon              AS SoLuongTheoDon,   -- SL đặt (cột "Theo đơn" trên phiếu)
    SoLuongThucNhan             AS SoLuongThucNhan,  -- SL nhận thật (cột "Thực nhận" trên phiếu, NULL/0 khi STATUS='C')
    DonGia                      AS DonGia,
    ThanhTien                   AS ThanhTien
FROM dbo.ST_ORDER
UNION ALL
SELECT
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)), CAST(NgayDat AS DATE), UpdatedAt, STK_ID, TenSieuThiDSmart,
    SoDon, CAST(NgayGiao AS DATE), MaNCC, TenNCC, NguoiDat, MaHang, TenHang, MaVach, DVT, STATUS,
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập' WHEN 'P' THEN N'Đã nhập 1 phần' WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa' WHEN 'D' THEN N'Đã xoá' WHEN 'E' THEN N'Đã huỷ' ELSE STATUS
    END,
    SoLuongTheoDon, SoLuongThucNhan, DonGia, ThanhTien
FROM dbo.ST_ORDER_ARC;
```

**Các điểm BẮT BUỘC đối chiếu lại với DBA trước khi tạo VIEW thật:**
1. Tên cột ngày đặt (`NgayDat` ở trên chỉ là ví dụ — có thể là `ORDER_DT`).
2. Tên cột watermark cập nhật (`UpdatedAt`) — cần 1 cột phản ánh ĐÚNG lần
   sửa gần nhất (để đồng bộ bắt được đơn chuyển trạng thái `C→P→F` hoặc
   `M`), KHÔNG dùng `NgayDat` (không đổi khi đơn được cập nhật).
3. Tên cột mã siêu thị (`STK_ID` ở trên) — xác nhận ĐÚNG tên cột trong
   `ST_ORDER`, và đúng là CSDL trung tâm (1 cột phân biệt siêu thị trong
   cùng bảng) như người dùng đã xác nhận.
4. `SoLuongThucNhan` khi `STATUS='C'` (chưa nhập) — xác nhận trả về `0`
   hay `NULL` (ảnh hưởng công thức "Chênh lệch"/"Tỷ lệ hoàn thành" ở báo
   cáo so sánh — cả 2 trường hợp đều cho kết quả ĐÚNG với công thức đã
   viết, chỉ cần biết để không nhầm "0" là lỗi dữ liệu).
5. `ST_ORDER`/`ST_ORDER_ARC` có đúng là "1 dòng = 1 dòng hàng (SKU) trong
   1 đơn" hay "1 dòng = 1 đơn hàng" (SL/Mã hàng nằm ở bảng khác) — VIEW
   trên giả định dòng chi tiết, nếu sai cấu trúc JOIN cần viết lại.

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

## 4. Ánh xạ mã siêu thị — dùng bảng "Ánh xạ Điểm - STK_ID" đã có

Theo yêu cầu người dùng ("vẫn dựa vào bảng ánh xạ mã STK để thực hiện") —
`rp-server/lib/purchaseOrderRunner.js` đọc `Dimensions.MaDiem` (mã STK thô
do DSmart16 đồng bộ sang), tra `etl.DiemStkMapping` (qua
`lib/diemStkMapping.js:buildStkIdLookup()`, dùng `MaStkMoi` — mã kho HIỆN
TẠI, vì đơn hàng là dữ liệu VẬN HÀNH LIVE, không có khái niệm "cùng kỳ năm
trước" như doanh thu) để **GHI ĐÈ** `MaDiem`/`TenDiem` bằng mã Điểm +
tên siêu thị CHUẨN của HCRC. STK thô **CHƯA khai** trong bảng ánh xạ bị
**LOẠI KHỎI báo cáo** (không hiện mã thô lẫn với mã Điểm chuẩn) — admin bổ
sung bảng ánh xạ để dòng đó xuất hiện.

`__storeScope` (bản 8.51, phạm vi siêu thị theo người dùng đăng nhập) áp
dụng như MỌI báo cáo khác — người dùng bị giới hạn 1/nhiều siêu thị chỉ
thấy đúng đơn hàng của siêu thị đó (lọc theo STK thô TRƯỚC khi ghi đè,
dùng `resolveStoreScopeStkIds()` đã có sẵn).

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
