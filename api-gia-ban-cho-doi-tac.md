# Tài liệu API — Giá bán theo mã hàng (dành cho đối tác)

Phiên bản: 1.0 · Ngày phát hành: (điền ngày triển khai thật)
Liên hệ kỹ thuật: đội IT BRGMART

## 1. Tổng quan

API này tra **giá bán hiện tại** (giá thường + giá khuyến mại nếu đang áp
dụng) của **1 mã hàng cụ thể tại 1 siêu thị cụ thể** — dùng cho ứng dụng
quét mã khi khách tự thanh toán (vd BRG Scan and Checkout) hoặc bất kỳ app
nào cần tra giá theo từng mã hàng.

Khác hẳn API "Tồn kho toàn hệ thống" (`ton-kho`, tải TRỌN GÓI toàn bộ danh
mục rồi phân trang) — API này **tra ĐÚNG 1 mã hàng mỗi lần gọi**, trả lời
NHANH, hợp usage "quét tới đâu, hỏi giá tới đó", không cần tải/cache trước
cả danh mục hàng chục nghìn mã.

Dữ liệu đồng bộ từ hệ thống quản lý giá trung tâm mỗi 15 phút.

## 2. Xác thực

Gọi API kèm header:
```
X-API-Key: <api key được cấp>
```
(hoặc OAuth2/HMAC nếu đối tác được cấp theo cách đó — xem tài liệu chung).

## 3. Endpoint

```
GET /api/v1/reports/gia-ban/run?maHang=<mã hàng>&maDiem=<mã Điểm>
GET /api/v1/reports/gia-ban/run?maVach=<mã vạch>&maDiem=<mã Điểm>
```

**Tham số:**

| Tham số | Bắt buộc? | Mô tả |
|---|---|---|
| `maDiem` | BẮT BUỘC | Mã Điểm (siêu thị) — giống `maDiem` ở API Tồn kho |
| `maHang` | 1 trong 2 | Mã mặt hàng (SKU nội bộ, 10 chữ số — giống `maHang` ở API Tồn kho) |
| `maVach` | 1 trong 2 | Mã vạch THẬT in trên sản phẩm (EAN-13) — dùng khi app quét mã vạch ở quầy, KHÔNG có sẵn mã nội bộ |

Gửi `maDiem` + ÍT NHẤT 1 trong 2 (`maHang` hoặc `maVach`) — gửi cả 2 thì
ưu tiên `maHang`. Thiếu `maDiem`, hoặc thiếu cả `maHang` lẫn `maVach` →
lỗi `400`.

> **Không chắc giá trị đang có trong tay là mã hàng hay mã vạch?** Không
> sao — gửi lên bằng tham số NÀO CŨNG ĐƯỢC, API tự nhận diện: nếu gửi dưới
> `maVach` mà giá trị đó hoá ra lại là mã hàng (không phải mã vạch đã đăng
> ký), hệ thống tự thử lại coi nó như `maHang` trước khi báo lỗi — chỉ cần
> gửi đúng GIÁ TRỊ, không cần tự phân biệt loại mã (bản 10.77).

## 4. Cấu trúc phản hồi

**Khác API Tồn kho** — API này trả **TRỰC TIẾP 1 object** (không có
`rows`/phân trang, vì luôn đúng 1 kết quả):

```json
{
  "reportId": "gia-ban",
  "maHang": "2003330491",
  "tenHang": "Sữa tươi TH True Milk 1L",
  "maVach": "8934696001589",
  "giaThuong": 24000,
  "giaKhuyenMai": 21500,
  "coKhuyenMai": true,
  "capNhatLuc": "2026-11-10T09:00:18.000Z"
}
```

### Mô tả từng trường

| Trường | Kiểu | Mô tả |
|---|---|---|
| `maHang` | chuỗi | Mã mặt hàng (đúng mã đã gửi lên) |
| `tenHang` | chuỗi | Tên mặt hàng |
| `maVach` | chuỗi hoặc `null` | Mã vạch thật (EAN-13) — `null` nếu chưa khai |
| `giaThuong` | số | Giá bán thường (chưa áp khuyến mại) |
| `giaKhuyenMai` | số hoặc `null` | Giá SAU khi áp khuyến mại đang hiệu lực — `null` nếu KHÔNG có khuyến mại nào đang áp dụng (dùng `giaThuong`) |
| `coKhuyenMai` | boolean | `true` nếu `giaKhuyenMai` đang có giá trị |
| `capNhatLuc` | chuỗi ISO 8601 | Thời điểm đồng bộ giá này gần nhất |

> **Giá cuối cùng để tính tiền cho khách**: nếu `coKhuyenMai = true`, dùng
> `giaKhuyenMai`; nếu không, dùng `giaThuong`.

## 5. Ví dụ gọi API

```bash
curl "https://api.brgmart.vn/api/v1/reports/gia-ban/run?maHang=2003330491&maDiem=001" \
  -H "X-API-Key: <api key được cấp>"

# Hoặc tra bằng mã vạch quét được ở quầy:
curl "https://api.brgmart.vn/api/v1/reports/gia-ban/run?maVach=8934696001589&maDiem=001" \
  -H "X-API-Key: <api key được cấp>"
```

## 6. Mã lỗi

| Mã | Ý nghĩa | Xử lý |
|---|---|---|
| `400` | Thiếu `maDiem`, hoặc thiếu cả `maHang` lẫn `maVach` | Kiểm tra lại tham số |
| `401` | Thiếu/sai `X-API-Key` | Kiểm tra lại header |
| `403` | API key hợp lệ nhưng chưa được cấp quyền gọi báo cáo này | Liên hệ IT BRGMART xác nhận quyền |
| `404` | Không tìm thấy mã Điểm, không xác định được vùng giá cho siêu thị đó, hoặc không có giá cho đúng mã hàng này | Kiểm tra lại `maHang`/`maDiem`, hoặc mã hàng chưa khai giá ở vùng này |
| `429` | Gọi quá tần suất cho phép | Thử lại sau, xem header `Retry-After` |
| `500` | Lỗi phía máy chủ BRGMART | Thử lại sau; báo IT BRGMART nếu lặp lại nhiều lần |

---

## 7. (NỘI BỘ) Triển khai — không gửi mục này cho đối tác

**Nguồn dữ liệu** (đã xác nhận bằng dữ liệu thật trên DSMART16, không
đoán):
- `dbo.RTPRICE` — bảng giá, khoá theo `(ZONE_CODE, SKU_ID)`. Cột
  `RTPRICE` = giá thường. Cột `DISC_CODE`/`DISC_RTPR` — khi `DISC_CODE`
  khác rỗng, `DISC_RTPR` là giá ĐÃ TÍNH SẴN sau khuyến mại đang hiệu lực
  (DSMART tự cập nhật liên tục trong ngày, nhiều khả năng qua stored
  procedure có sẵn `spK_PriceSync`) — KHÔNG tự tính lại luật khuyến mại ở
  `dbo.RDISCINF` (bảng luật khuyến mại phức tạp, chỉ tham khảo khi cần
  điều tra sâu).
- Giá áp theo VÙNG (`ZONE_CODE`), KHÔNG áp riêng từng siêu thị — 1 siêu
  thị thuộc đúng 1 vùng qua `dbo.STOCK.ZONE_CODE`.
- VIEW gộp: `deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Giá bán theo SKU (DSMART16).sql` (tạo
  `dbo.vw_GiaBanTheoSKU`, nối `RTPRICE` + `SKU_DEF`).
- `dbo.BARCODE` (bản 10.75) — 1 mã hàng CÓ THỂ có NHIỀU mã vạch (cột
  `ISDEFAULT` đánh dấu mã mặc định, trùng `SKU_DEF.BARCODE`) — API tra
  theo `maVach` PHẢI dịch qua domain riêng `mavach_mahang` (xem VIEW
  `vw_MaVachTheoSKU`), KHÔNG được khớp trực tiếp cột `maVach` của domain
  giá (domain đó chỉ mang đúng 1 mã vạch mặc định mỗi SKU).

**Các bước triển khai (theo đúng thứ tự):**

1. Chạy cả 3 VIEW trên CSDL `DSMART16` (AN TOÀN chạy lại nhiều lần):
   `deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Giá bán theo SKU (DSMART16).sql`,
   `deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Vùng giá theo siêu thị (DSMART16).sql`,
   `deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Mã vạch theo SKU (DSMART16).sql`.
2. Chạy `node etl/scripts/seedVungGiaSync.js` (thư mục `etl/`) — tạo job
   đồng bộ nhỏ "Vùng giá theo siêu thị" (domain `vung_gia_stk`, đọc VIEW
   `vw_VungGiaTheoSieuThi` ở bước 1, ~34 dòng — KHÔNG đọc trực tiếp bảng
   `STOCK` nữa, xem bản 10.73: `STOCK.MODI_DATE` NULL ở 1 số siêu thị
   khiến đồng bộ trực tiếp bỏ sót vĩnh viễn, VIEW đã tự xử lý bằng
   `COALESCE`). Script TỰ reset watermark mỗi lần chạy — an toàn chạy lại.
3. Chạy `node etl/scripts/seedGiaBanSync.js` (thư mục `etl/`) — tạo job
   đồng bộ chính "Giá bán theo SKU" (domain `giaban_zone_sku`, đọc VIEW ở
   bước 1). **Lượt chạy ĐẦU TIÊN quét toàn bộ `RTPRICE`** (~1 triệu dòng
   sau khi lọc vùng hợp lệ) — có thể mất vài phút; các lượt sau chỉ lấy
   giá VỪA ĐỔI (nhờ `UpdatedAtColumn = CapNhatNguon`, bọc `COALESCE` từ
   bản 10.74). Script TỰ reset watermark mỗi lần chạy.
4. Chạy `node etl/scripts/seedMaVachSync.js` (thư mục `etl/`, bản 10.75) —
   tạo job đồng bộ "Mã vạch theo SKU" (domain `mavach_mahang`, ~91.260
   dòng, quét lại toàn bộ mỗi lượt vì `dbo.BARCODE` không có cột ngày).
5. Chạy `node api-server/scripts/seedGiaBanReport.js` (thư mục
   `api-server/`) — tạo/cập nhật báo cáo `gia-ban` trong
   `api.ReportCatalog`.
6. `.env` của `api-server` đã có `ETL_DIEM_STK_*` (dùng lại cấu hình đã
   điền cho API `ton-kho` — xem `api-server/.env.example`) — KHÔNG cần
   thêm biến môi trường mới (`lib/zoneLookup.js`/`lib/barcodeLookup.js`
   đọc thẳng `dwh.ReportFacts` qua pool `DWH` đã có sẵn, không mở kết nối
   mới).
7. `pm2 restart` đúng tiến trình `api-server` (route mới
   `handleSingleLookup` nằm trong `routes/v1/reports.js` đã sửa).
8. Vào `api-admin` → "Đối tác" → đúng đối tác cần dùng (vd BRG Scan and
   Checkout) → "Báo cáo được gọi" → tick "Giá bán theo mã hàng" — mặc định
   KHÔNG đối tác nào gọi được dù có scope `reports` hợp lệ.

**Kiểm tra sau khi triển khai xong**:
```bash
curl "http://localhost:<port>/api/v1/reports/gia-ban/run?maHang=<mã hàng thật>&maDiem=<mã Điểm thật>" \
  -H "X-API-Key: <api key thật của đối tác>"
```
Phải thấy đủ 7 trường ở mục 4. Thử lại với 1 mã hàng ĐANG có khuyến mại
(tra trực tiếp `SELECT TOP 5 * FROM dbo.RTPRICE WHERE DISC_CODE <> ''` để
biết mã nào) — `coKhuyenMai` phải là `true` và `giaKhuyenMai` có giá trị
nhỏ hơn `giaThuong`. Thử tiếp với 1 mã hàng KHÔNG có khuyến mại —
`coKhuyenMai` phải là `false`, `giaKhuyenMai` là `null`.

Thử lại CÙNG mã hàng đó bằng `maVach` thay vì `maHang` (lấy mã vạch THẬT
từ chính kết quả vừa trả về ở trên) → phải ra ĐÚNG kết quả giống hệt.

**Quan trọng (bản 10.75)** — thử THÊM bằng 1 mã vạch PHỤ (KHÔNG mặc định)
của CÙNG mã hàng đó: `SELECT * FROM dbo.BARCODE WHERE SKU_ID = '<SKU_ID
thật>'` để lấy mã vạch nào có `ISDEFAULT = 0` → gọi API với mã vạch đó →
PHẢI ra ĐÚNG kết quả giống hệt (trước bản 10.75, trường hợp này sẽ báo
sai "Không tìm thấy giá" dù mã vạch hợp lệ).

Thử `maDiem` không tồn tại → phải trả `404` (không phải `500`). Thử thiếu
`maDiem`, hoặc thiếu cả `maHang` lẫn `maVach` → phải trả `400`.

**Phụ thuộc dùng chung với API `ton-kho`** (KHÔNG tạo lại): "Ánh xạ Điểm -
STK_ID" (`etl.DiemStkMapping`, `api-server/lib/diemStkMapping.js`), cơ chế
xác thực/giới hạn tần suất/phân quyền đối tác (`api.ApiConsumers`,
`api.ConsumerReportAccess`).

### Tự nhận diện mã hàng/mã vạch dù gửi nhầm tham số (bản 10.77)

**SỬA LỖI THẬT**: app "Giỏ hàng" (BRG Scan and Checkout) báo "chưa có giá"
cho nhiều mã hàng — xác nhận bằng dữ liệu thật (DSMART16) các mã này ĐỀU
LÀ MÃ HÀNG THẬT, có giá đầy đủ ở MỌI vùng giá, KHÔNG thiếu giá gì — nguyên
nhân THẬT là app gửi các mã này lên dưới tham số `maVach` (không phải
`maHang`), nên `lib/barcodeLookup.js:loadBarcodeLookup()` không dịch được
(giá trị đó không phải mã vạch đã đăng ký trong `dbo.BARCODE`).

**Đã sửa**: `routes/v1/reports.js:handleSingleLookup()` — khi `maVach`
KHÔNG khớp được mã vạch nào qua `loadBarcodeLookup()`, THỬ LẠI coi nguyên
giá trị đó NHƯ 1 `maHang` trước khi báo lỗi 404 (`maHang = barcodeLookup.get(maVach) || maVach`)
— đối tác gửi ĐÚNG hay NHẦM loại tham số đều ra giá như nhau, không cần tự
phân biệt mã hàng/mã vạch. KHÔNG cần VIEW/job đồng bộ mới — chỉ sửa code.

**Triển khai**: `git pull` + `pm2 restart api-server` (không cần chạy lại
script seed nào, không đổi `DefinitionJson`).

**Kiểm tra**: gọi API với 1 mã hàng thật nhưng CỐ Ý gửi qua tham số
`maVach` (vd `?maVach=2003320425&maDiem=...`) — phải RA ĐÚNG GIÁ, không
còn báo "Không tìm thấy giá".
