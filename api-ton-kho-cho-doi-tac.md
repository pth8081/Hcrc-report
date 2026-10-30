# Tài liệu API — Tồn kho toàn hệ thống (dành cho đối tác)

Phiên bản: 1.3 · Ngày phát hành: 30/10/2026
Liên hệ kỹ thuật: đội IT BRGMART

## 1. Tổng quan

API này trả về **số lượng tồn kho hiện tại (live)** của **tất cả mã hàng,
tất cả siêu thị** trong hệ thống BRGMART. Dữ liệu được đồng bộ từ hệ
thống quản lý kho trung tâm mỗi 15 phút, nên số liệu trả về luôn là số
**TẠI THỜI ĐIỂM ĐỒNG BỘ GẦN NHẤT** (không phải số liệu lịch sử/quá khứ).

API trả về dữ liệu của **TOÀN BỘ siêu thị trong 1 lần gọi** — hệ thống
đối tác tự chịu trách nhiệm lọc đúng siêu thị cho từng người dùng của
mình (vd theo tài khoản người dùng đang đăng nhập bên đối tác).

## 2. Xác thực

Gọi API kèm header:

```
X-API-Key: <api key được cấp>
```

API key do BRGMART cấp riêng cho từng đối tác — liên hệ đội IT BRGMART để
được cấp. Mỗi API key có:
- **Giới hạn IP** — chỉ gọi được từ (các) địa chỉ IP đã đăng ký trước.
- **Giới hạn tần suất** — số lượt gọi tối đa/phút (BRGMART cấu hình riêng
  theo thoả thuận với từng đối tác).

## 3. Endpoint

```
GET /api/v1/reports/ton-kho/run
```

**Tham số (query string, không bắt buộc):**

| Tham số | Mô tả |
|---|---|
| `page` | Trang kết quả, mặc định `1` |
| `pageSize` | Số dòng/trang, mặc định `200`, **tối đa `1000`** |
| `fields` | Chỉ lấy đúng các cột cần (phân cách bởi dấu phẩy, vd `fields=maHang,soLuongTon`) — không truyền thì nhận đủ mọi cột |

⚠️ **BẮT BUỘC đọc kỹ**: dữ liệu tồn kho toàn hệ thống có thể lên tới
**hàng chục nghìn dòng** (mỗi dòng = 1 mã hàng tại 1 siêu thị). API trả
về **CÓ PHÂN TRANG** — 1 lần gọi KHÔNG trả hết toàn bộ dữ liệu. Hệ thống
đối tác cần **GỌI LẶP LẠI, tăng dần `page`**, cho tới khi số dòng trả về
ít hơn `pageSize` (hết dữ liệu).

## 4. Cấu trúc phản hồi

```json
{
  "reportId": "ton-kho",
  "page": 1,
  "pageSize": 200,
  "columns": [
    { "key": "maNganhHang", "label": "Mã ngành hàng" },
    { "key": "tenNganhHang", "label": "Tên ngành hàng" },
    { "key": "maHang", "label": "Mã mặt hàng" },
    { "key": "tenHang", "label": "Tên mặt hàng" },
    { "key": "maVach", "label": "Mã vạch" },
    { "key": "soLuongTon", "label": "Số lượng tồn" },
    { "key": "maKho", "label": "Mã kho" },
    { "key": "maDiem", "label": "Mã Điểm (siêu thị)" },
    { "key": "tenSieuThi", "label": "Tên siêu thị" },
    { "key": "ngay", "label": "Ngày" },
    { "key": "ngayNhapGanNhat", "label": "Ngày nhập gần nhất" },
    { "key": "capNhatLuc", "label": "Cập nhật lúc" }
  ],
  "rows": [
    {
      "maNganhHang": "DEP012",
      "tenNganhHang": "Sữa & Đồ uống",
      "maHang": "2003330491",
      "tenHang": "Sữa tươi TH True Milk 1L",
      "maVach": "8934696001589",
      "soLuongTon": 186,
      "maKho": "10041",
      "maDiem": "004",
      "tenSieuThi": "ST Hải Phòng",
      "ngay": "2026-10-30",
      "ngayNhapGanNhat": "2026-10-27",
      "capNhatLuc": "2026-10-30T14:15:00.000Z"
    },
    {
      "maNganhHang": "DEP007",
      "tenNganhHang": "Đồ khô & Gia vị",
      "maHang": "2003290553",
      "tenHang": "Dầu ăn Simply 1L",
      "maVach": null,
      "soLuongTon": 86,
      "maKho": "10011",
      "maDiem": "001",
      "tenSieuThi": "ST 120 Hàng Trống",
      "ngay": "2026-10-30",
      "ngayNhapGanNhat": null,
      "capNhatLuc": "2026-10-30T14:15:00.000Z"
    }
  ]
}
```

### Mô tả từng trường

| Trường | Kiểu | Mô tả |
|---|---|---|
| `maNganhHang` | chuỗi | Mã ngành hàng |
| `tenNganhHang` | chuỗi | Tên ngành hàng |
| `maHang` | chuỗi (10 chữ số) | Mã mặt hàng (SKU nội bộ) — **dùng làm mã định danh chính** |
| `tenHang` | chuỗi | Tên mặt hàng |
| `maVach` | chuỗi (thường 13 chữ số, chuẩn EAN-13) hoặc `null` | Mã vạch sản phẩm thật — `null` nếu mặt hàng đó chưa khai mã vạch trong hệ thống nguồn (không phải lỗi) |
| `soLuongTon` | số | Số lượng tồn kho hiện tại |
| `maKho` | chuỗi | Mã kho vật lý (có thể nhiều mã kho cùng thuộc 1 siêu thị, có thể đổi theo thời gian) |
| `maDiem` | chuỗi | **Mã Điểm** — mã định danh SIÊU THỊ, ỔN ĐỊNH lâu dài (không đổi dù siêu thị đổi/thêm mã kho) — **khuyến nghị dùng trường này làm khoá chính khi lưu trữ/đối chiếu dữ liệu phía đối tác**, không nên dùng `maKho` làm khoá cố định |
| `tenSieuThi` | chuỗi | Tên siêu thị CHUẨN (đã dịch sẵn qua danh mục siêu thị nội bộ, không cần tự tra cứu) |
| `ngay` | chuỗi (YYYY-MM-DD) | Ngày của số liệu tồn kho (= ngày đồng bộ gần nhất) |
| `ngayNhapGanNhat` | chuỗi (YYYY-MM-DD) hoặc `null` | Ngày NHẬP HÀNG gần nhất của đúng mã hàng này tại đúng siêu thị này — `null` nếu mã hàng chưa từng có lịch sử nhập (hàng tồn từ trước khi hệ thống theo dõi được) |
| `capNhatLuc` | chuỗi (ISO 8601, có giờ:phút) | Thời điểm CHỐT số liệu tồn kho này — dùng để hiển thị "Tồn kho cập nhật lúc HH:mm" |

> **Lưu ý về `maKho` vs `maDiem`**: 1 siêu thị có thể có NHIỀU mã kho vật
> lý khác nhau (vd kho chính + kho phụ/kho trung chuyển), và mã kho CÓ
> THỂ thay đổi theo thời gian (siêu thị đổi hệ thống quản lý kho). `maDiem`
> là mã siêu thị KHÔNG ĐỔI theo thời gian — nếu hệ thống đối tác cần lưu
> trữ/liên kết dữ liệu lâu dài theo siêu thị, dùng `maDiem`, không dùng
> `maKho`.

> **Về mã vạch**: `maVach` là mã vạch THẬT lấy từ hệ thống nguồn (không
> phải mã 10 số `maHang`). Không phải mặt hàng nào cũng có — mặt hàng
> chưa khai mã vạch sẽ trả về `null` ở trường này, hệ thống đối tác nên
> dùng `maHang` làm khoá định danh chính (LUÔN có), coi `maVach` là
> trường bổ sung để đối chiếu/quét mã khi có.

> **Về Đơn vị tính (ĐVT)**: hiện CHƯA có trong API này — đang chờ DBA xác
> nhận có cột cố định theo mã hàng hay không. Sẽ cập nhật sau.

## 5. Ví dụ gọi API

```bash
curl "https://api.brgmart.vn/api/v1/reports/ton-kho/run?page=1&pageSize=1000" \
  -H "X-API-Key: <api key được cấp>"
```

Chỉ lấy đúng cột cần:

```bash
curl "https://api.brgmart.vn/api/v1/reports/ton-kho/run?fields=maHang,soLuongTon,maDiem&page=1&pageSize=1000" \
  -H "X-API-Key: <api key được cấp>"
```

## 6. Mã lỗi

| Mã | Ý nghĩa | Xử lý |
|---|---|---|
| `401` | Thiếu/sai `X-API-Key` | Kiểm tra lại header |
| `403` | API key hợp lệ nhưng gọi từ IP chưa đăng ký, HOẶC chưa được cấp quyền gọi báo cáo này | Liên hệ IT BRGMART xác nhận IP/quyền |
| `400` | Tham số `fields` chứa tên cột không tồn tại | Kiểm tra lại đúng tên cột ở mục 4 |
| `429` | Gọi quá tần suất cho phép | Thử lại sau, xem header `Retry-After` (giây) |
| `500` | Lỗi phía máy chủ BRGMART | Thử lại sau; báo IT BRGMART nếu lặp lại nhiều lần |

Mọi lỗi trả về dạng: `{ "error": "<mô tả lỗi>" }`.

## 7. Độ trễ dữ liệu

Dữ liệu tồn kho đồng bộ từ hệ thống trung tâm **mỗi 15 phút** — số liệu
trả về có độ trễ tối đa khoảng 15 phút so với thực tế tại kho, KHÔNG phải
dữ liệu real-time tuyệt đối từng giây.

## 8. Khuyến nghị tần suất gọi API

Vì dữ liệu chỉ cập nhật mỗi 15 phút, hệ thống đối tác **KHÔNG CẦN gọi dồn
dập** — khuyến nghị đồng bộ định kỳ **mỗi 15-30 phút/lần** là đủ, vừa đáp
ứng được nhu cầu dữ liệu mới nhất, vừa tránh chạm giới hạn tần suất.

---

## 9. (NỘI BỘ) Triển khai — không gửi mục này cho đối tác

**Nguồn dữ liệu**: dùng chung domain `tonkho_chitiet_sku` đã có (VIEW
`dbo.vw_TonKhoChiTietTheoSKU`, CSDL `DSMART16`, job đồng bộ "Tồn kho Chi
tiết theo SKU - Live (DSMART16)") — KHÔNG tạo nguồn mới. Xem
`bc-ton-kho-chi-tiet.md` cho phần dùng chung (VIEW gốc, job đồng bộ).
`maVach` (bản 10.50) lấy từ `dbo.SKU_DEF.BARCODE` — bảng `SKU_DEF` ĐÃ JOIN
SẴN trong VIEW (dùng chung cho `maHang`/`tenHang`), không JOIN thêm bảng
nào — đã xác nhận bằng dữ liệu thật (DBA chạy `SELECT TOP 5 * FROM
dbo.SKU_DEF`) là mã EAN-13 hợp lệ (cột `UPC_CODE` cùng bảng rỗng ở mọi
dòng mẫu nên KHÔNG dùng).

**Các bước triển khai (theo đúng thứ tự):**

1. Chạy lại "deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql"
   trên CSDL `DSMART16` (bản 10.46 — thêm cột `NgayNhapGanNhat`; bản
   10.50 — thêm cột `MaVach` từ `SKU_DEF.BARCODE`; AN TOÀN chạy lại nhiều
   lần).
2. Chạy lại `node etl/scripts/seedTonKhoChiTietSync.js` (thư mục `etl/`)
   — cập nhật job đồng bộ, thêm cột mới vào danh sách đồng bộ.
3. Chạy `etl-db/grants.sql` trên SQL Server chứa `etl.DiemStkMapping`
   (nếu `api-server` dùng SQL Server/login KHÁC với `rp-server` — nếu
   CÙNG 1 instance đã chạy cho rp-server rồi thì bỏ qua, login
   `etl_diem_stk_reader` dùng CHUNG được).
4. Điền đủ `ETL_DIEM_STK_*` trong `.env` của `api-server` (xem
   `api-server/.env.example`) — trỏ ĐÚNG server/database chứa
   `etl.DiemStkMapping`.
5. `pm2 restart` đúng tiến trình `api-server`.
6. Chạy `node scripts/seedTonKhoReport.js` (thư mục `api-server/`) — tạo/
   cập nhật báo cáo `ton-kho` trong `api.ReportCatalog` (bản 10.50 đã
   thêm cột `maVach` vào định nghĩa báo cáo — BẮT BUỘC chạy lại script
   này sau bước 1-2, nếu không `maVach` sẽ luôn trả về `null`).
7. Vào `api-admin` → "Đối tác" → đúng đối tác cần dùng → "Báo cáo được
   gọi" → tick "Tồn kho toàn hệ thống" — mặc định KHÔNG đối tác nào gọi
   được dù có scope `reports` hợp lệ.

**Kiểm tra sau khi triển khai**:
```bash
curl "http://localhost:<port>/api/v1/reports/ton-kho/run?pageSize=5" \
  -H "X-API-Key: <api key thật của đối tác>"
```
Phải thấy đủ 12 cột, `tenSieuThi` hiện tên THẬT (không phải mã kho trần/
"(chưa khai tên)" — nếu hiện "(chưa khai tên)" cho MỌI dòng, kiểm tra lại
bước 3-4, xem "Hệ thống → Log" bên rp-server để biết cách chẩn đoán kiểu
lỗi tương tự nếu `api-server` cũng áp dụng cơ chế ghi log này sau).
`maVach` phải có giá trị (mã 13 số) ở các mặt hàng đã khai mã vạch trong
`SKU_DEF.BARCODE` — `null` ở mặt hàng chưa khai là bình thường.

**Việc CÒN THIẾU, cần bổ sung sau**:
- Đơn vị tính (ĐVT) — cần DBA xác nhận `SKU_DEF` có cột cố định theo mã
  hàng hay chỉ có theo từng giao dịch (`STRANS.UNIT_SYMB`).
- Endpoint "realtime" tra 1 mã tức thời (`GET /api/v1/realtime/ton-kho/{maHang}`)
  — dành riêng cho tính năng "Ghi nhận trên kệ" (PWA, quét 1 mã cần trả
  lời ngay, khác hẳn nhu cầu tải hàng loạt của đối tác ngoài) — CHƯA làm ở
  bản này, chờ xác nhận phạm vi.
