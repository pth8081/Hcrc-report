# Hướng dẫn cấu hình báo cáo HCRC

File này gom hướng dẫn **cấu hình từng báo cáo cụ thể** (không phải tài
liệu kiến trúc/kỹ thuật — những cái đó nằm trong `README.md` của từng
service: `etl/README.md`, `rp-server/README.md`, `api-server/README.md`).
Mỗi báo cáo mới dựng xong sẽ có 1 mục hướng dẫn thêm vào đây, theo đúng
thứ tự dựng — không sửa lại hướng dẫn cũ trừ khi báo cáo đó thực sự đổi
cách cấu hình.

Quy ước tên viết tắt dùng xuyên suốt file:
- **DWH** — Data Warehouse (`dwh.ReportFacts`, `dwh.SalesTargets`).
- **etl-admin** — trang quản trị ETL (`http://<host-etl>:5175` lúc phát
  triển, hoặc domain nội bộ lúc triển khai thật — xem `deploy/README.md`).
- **api-admin** — trang quản trị API Server.
- **rp-user** — trang người dùng/quản trị Report Server, mục "Hệ thống →
  Biểu mẫu" là nơi tạo báo cáo.

---

## 1. Báo cáo doanh thu — toàn bộ dữ liệu từ Data Warehouse

### Khi nào dùng

Dữ liệu "hôm nay" đã có sẵn trong DWH với độ trễ chấp nhận được (ETL đồng
bộ định kỳ vài phút/vài chục phút là đủ, không cần realtime tức thời).
Đây là cách ĐƠN GIẢN HƠN — không cần cấu hình gì ở API Server.

### Bước 1 — etl-admin: đồng bộ dữ liệu doanh thu vào DWH

1. **Nguồn dữ liệu** — thêm kết nối tới từng CSDL nguồn (hoặc 1 nguồn tổng
   hợp nếu bạn có sẵn view gộp nhiều siêu thị). Tài khoản dùng ở đây nên
   CHỈ ĐỌC.
2. **Đồng bộ** — tạo job mới:
   - Loại **"Theo bảng"** — chọn nguồn vừa thêm, duyệt bảng/view thật,
     chọn **Cột khoá (EntityCode)** = mã siêu thị, **Cột ngày
     (EventDate)** = ngày phát sinh doanh thu THẬT (không phải "ngày cập
     nhật"/ngày chạy job), **Cột thời gian cập nhật (watermark)** = cột
     tăng dần dùng để đồng bộ tăng dần.
   - Tick vào **Dimensions** ít nhất: `chain` (`MART`/`MINIMART` — dùng
     cho dòng "Tổng cộng" ở Bước 3), `dienTich`.
   - Tick vào **Measures**: `doanhThu`, `giaoDich`, `laiGop` (hoặc tên bạn
     đặt tương ứng số liệu thật).
   - **Domain** — đặt tên domain, vd `doanhthu_chinhanh` (dùng lại y hệt ở
     mọi bước sau).
   - **BẬT "Giữ lịch sử theo ngày"** — bắt buộc để có "Cùng kỳ năm
     trước", nếu không mỗi ngày sẽ ghi đè ngày trước đó.
   - Lịch chạy (cron) theo tần suất bạn cần — vd `*/15 * * * *` (15 phút).

### Bước 2 — etl-admin: nhập chỉ tiêu tháng

Vào **Nhập chỉ tiêu**, upload file Excel (.xlsx), Domain = ĐÚNG domain ở
Bước 1 (`doanhthu_chinhanh`):

| MaSieuThi | Thang | ChiTieuDoanhThu | ChiTieuGiaoDich | TrangThai |
|---|---|---|---|---|
| BRGHP | 2026-08 | 177798956 | 646 | |
| BRGHD | 2026-08 | 241498448 | 615 | |

Cột `TrangThai` chỉ điền `DaDong` cho siêu thị đã đóng cửa tháng đó — để
trống với siêu thị đang hoạt động bình thường. Giữa tháng có mở/đóng thêm
siêu thị, dùng mục "Sửa / thêm 1 siêu thị" ngay dưới bảng — không cần chỉnh
lại cả file.

### Bước 3 — rp-user: tạo báo cáo

Vào **Hệ thống → Biểu mẫu → tab "Báo cáo"**, tạo báo cáo mới:

- **Mã báo cáo**: vd `bc-doanh-thu-chi-nhanh`.
- **Tiêu đề**: vd "Báo cáo nhanh doanh thu".
- **Domain**: `doanhthu_chinhanh` (chỉ mang tính khai báo/phân loại cho
  báo cáo composite — không quyết định câu query, mỗi khối bên dưới tự
  khai domain riêng).
- **Trang báo cáo**: chọn 1 trong các trang báo cáo đã có.
- **SourceType**: chọn **"Ghép nhiều nguồn (composite)"**.
- **DefinitionJson**:

```json
{
  "title": "Báo cáo nhanh doanh thu",
  "domain": "doanhthu_chinhanh",
  "filters": [
    { "field": "eventDate", "type": "date", "label": "Ngày báo cáo" }
  ],
  "blocks": [
    { "key": "current", "sourceType": "directDb", "domain": "doanhthu_chinhanh" },
    { "key": "lastYear", "sourceType": "directDb", "domain": "doanhthu_chinhanh", "dateOffsetYears": -1 },
    { "key": "target", "isTarget": true, "targetDomain": "doanhthu_chinhanh" }
  ],
  "columns": [
    { "key": "tenCuaHang", "label": "Siêu thị", "formula": "entityCode" },
    { "key": "dienTich", "label": "Diện tích", "formula": "current.dimensions.dienTich" },
    { "key": "thucDat", "label": "Thực đạt", "formula": "current.measures.doanhThu" },
    { "key": "chiTieu", "label": "Chỉ tiêu", "formula": "target.ChiTieuDoanhThu" },
    { "key": "tyLeDat", "label": "Tỷ lệ đạt (%)", "formula": "ROUND(current.measures.doanhThu / target.ChiTieuDoanhThu * 100, 1)" },
    { "key": "cungKyNamTruoc", "label": "Cùng kỳ năm trước", "formula": "lastYear.measures.doanhThu" },
    { "key": "tyLeLFL", "label": "Tỷ lệ % LFL", "formula": "ROUND(current.measures.doanhThu / lastYear.measures.doanhThu * 100, 1)" }
  ],
  "groupBy": {
    "field": "current.dimensions.chain",
    "groups": [
      { "value": "MART", "label": "Tổng cộng MART" },
      { "value": "MINIMART", "label": "Tổng cộng MINIMART" }
    ],
    "grandTotalLabel": "Tổng cộng",
    "labelColumn": "tenCuaHang"
  }
}
```

Lưu xong, vào **Hệ thống → Phân quyền → (chọn vai trò) → Phân quyền truy
cập**, tick báo cáo vừa tạo vào danh sách được xem — chưa gán thì chỉ vai
trò `admin`/hệ thống thấy được.

### Bước 4 — Kiểm tra

Mở báo cáo trong trang xem báo cáo, chọn "Ngày báo cáo" (mặc định hôm
nay), bấm chạy — kiểm tra: đủ số siêu thị đang hoạt động, đúng nhóm
MART/MINIMART, dòng "Tổng cộng" khớp tổng cộng dồn, siêu thị đánh dấu
`DaDong` không xuất hiện.

---

## 2. Báo cáo doanh thu — dữ liệu "hôm nay" qua API Server, Chỉ tiêu/Cùng kỳ vẫn từ Data Warehouse

### Khi nào dùng

DWH đồng bộ có độ trễ (vd chỉ đồng bộ vài lần/ngày) nhưng bạn cần số liệu
"hôm nay" sát thời gian thực hơn, lấy trực tiếp từ hệ thống bán hàng của
từng siêu thị qua API Server. "Chỉ tiêu" và "Cùng kỳ năm trước" VẪN lấy từ
DWH như Cách 1 — 2 thứ này không cần realtime, và DWH là nơi duy nhất giữ
lịch sử nhiều ngày.

### Bước 1 — api-admin: khai nguồn dữ liệu MỖI siêu thị

Mỗi siêu thị có CSDL bán hàng riêng thì cần khai riêng (đúng mô hình hiện
tại: 1 endpoint realtime = 1 nguồn dữ liệu, không gộp nhiều nguồn cùng lúc
được):

1. **Nguồn dữ liệu** — thêm 1 kết nối cho từng siêu thị (tài khoản CHỈ ĐỌC).
2. **Endpoint realtime** — tạo 1 endpoint (vd đặt tên trùng mã siêu thị,
   hoặc 1 endpoint dùng chung nếu các siêu thị đã gộp sẵn qua 1 view tổng
   hợp phía nguồn — xem `api-server/README.md` mục "Tạo một endpoint
   realtime mới"), chọn nguồn vừa thêm, duyệt bảng/view thật, chọn:
   - **Cột khoá** — mã tra cứu 1 dòng.
   - **Cột sắp xếp** — dùng cho `/list`.
   - **Cột hiển thị** — endpoint realtime trả NGUYÊN tên cột nguồn, KHÔNG
     tự đổi tên được (khác `apiReport`, có tầng chiếu cột riêng). Ghép
     dòng ở Bước 5 CẦN đúng 1 cột tên `entityCode` — nếu bảng nguồn không
     có sẵn cột tên vậy (thường không có, vd cột thật tên `MaCuaHang`),
     **tạo 1 VIEW phía nguồn đổi tên cột trước** rồi trỏ endpoint vào VIEW
     đó thay vì bảng gốc, vd:
     ```sql
     CREATE VIEW dbo.vw_DoanhThuHomNay AS
     SELECT MaCuaHang AS entityCode, DoanhThuHomNay AS doanhThu, ...
     FROM BangDoanhThuThat;
     ```
     (duyệt/chọn VIEW y hệt chọn bảng thật khi tạo endpoint — xem
     `etl/README.md` mục "Hai kiểu đồng bộ" cho ví dụ tương tự bên ETL).

### Bước 2 — api-admin: cấp API key cho rp-server

Vào **Đối tác**, tạo 1 đối tác tên `rp-server`, scope `realtime`, rồi bấm
**"Realtime được gọi"** — tick ĐÚNG (các) endpoint vừa tạo ở Bước 1 (mặc
định đối tác KHÔNG được gọi endpoint nào cho tới khi gán rõ ràng). Lưu lại
API key hiện ra — chỉ hiện MỘT LẦN lúc tạo.

### Bước 3 — rp-user: khai kết nối tới API Server

Vào **Hệ thống → Biểu mẫu → tab "Kết nối API Server"**, tạo kết nối mới:
Tên, Base URL (địa chỉ API Server, vd `http://api-server-host:4002`), API
Key (dán API key ở Bước 2). Bấm "Kiểm tra kết nối" trước khi lưu. Ghi nhớ
số **Id** hiện ở cột đầu bảng — cần dùng ở Bước 5.

### Bước 4 — etl-admin: vẫn cần đồng bộ "Cùng kỳ năm trước" + chỉ tiêu

Giống hệt Bước 1 + Bước 2 của Cách 1 ở trên (đồng bộ domain doanh thu vào
DWH với **"Giữ lịch sử theo ngày" bật**, và nhập chỉ tiêu tháng) — chỉ khác
domain này giờ CHỈ dùng cho "Cùng kỳ năm trước" + "Chỉ tiêu", không cần
dùng cho "hôm nay" nữa (khối "hôm nay" đã chuyển sang gọi API Server).

### Bước 5 — rp-user: tạo báo cáo

Giống Bước 3 của Cách 1, nhưng khối `current` đổi sang gọi API Server:

```json
{
  "title": "Báo cáo nhanh doanh thu (realtime)",
  "domain": "doanhthu_chinhanh",
  "filters": [
    { "field": "eventDate", "type": "date", "label": "Ngày báo cáo" }
  ],
  "blocks": [
    { "key": "current", "sourceType": "apiRealtime", "apiConnectionId": 1, "apiTarget": "ten-endpoint-da-tao-o-buoc-1" },
    { "key": "lastYear", "sourceType": "directDb", "domain": "doanhthu_chinhanh", "dateOffsetYears": -1 },
    { "key": "target", "isTarget": true, "targetDomain": "doanhthu_chinhanh" }
  ],
  "columns": [
    { "key": "tenCuaHang", "label": "Siêu thị", "formula": "entityCode" },
    { "key": "thucDat", "label": "Thực đạt", "formula": "current.doanhThu" },
    { "key": "chiTieu", "label": "Chỉ tiêu", "formula": "target.ChiTieuDoanhThu" },
    { "key": "tyLeDat", "label": "Tỷ lệ đạt (%)", "formula": "ROUND(current.doanhThu / target.ChiTieuDoanhThu * 100, 1)" },
    { "key": "cungKyNamTruoc", "label": "Cùng kỳ năm trước", "formula": "lastYear.measures.doanhThu" }
  ]
}
```

Đổi `apiConnectionId` thành ĐÚNG số Id đã ghi nhận ở Bước 3. **Chú ý khác
biệt cách đọc field** — khối `current` giờ là `apiRealtime` (dữ liệu ĐÃ
PHẲNG do API Server tự trả về, tham chiếu thẳng `current.doanhThu`, KHÔNG
qua `current.measures.doanhThu` như khối `directDb`); khối `lastYear` vẫn
`directDb` nên vẫn lồng qua `measures`. `groupBy` (nếu cần dòng "Tổng
cộng") thêm y hệt Cách 1 — chỉ cần endpoint realtime cũng trả về cột nhóm
(vd `chain`) và field trong `groupBy.field` trỏ đúng `current.chain` thay
vì `current.dimensions.chain`.

**Lưu ý riêng cho khối `apiRealtime`** — bộ lọc "Ngày báo cáo" (`eventDate`)
KHÔNG áp dụng được cho khối này (API Server hiện chưa hỗ trợ lọc động cho
`apiRealtime`, luôn trả trạng thái sống hiện tại của nguồn) — chỉ ảnh
hưởng tới khối `lastYear`/`target`. Chọn 1 ngày trong quá khứ vẫn đổi đúng
"Cùng kỳ năm trước"/"Chỉ tiêu" hiển thị, nhưng cột "Thực đạt" luôn là số
liệu SỐNG tại thời điểm bấm chạy, không phải số liệu của đúng ngày đã
chọn — cần hiểu rõ khác biệt này khi xem lại báo cáo cho 1 ngày trong quá
khứ.

### Bước 6 — Kiểm tra

Giống Bước 4 Cách 1 — thêm 1 bước: gọi thử `GET /api/v1/realtime/<endpoint>/list`
trực tiếp bằng API key (hoặc dùng nút kiểm tra kết nối) TRƯỚC khi chạy thử
báo cáo, để tách riêng lỗi "API Server chưa đúng" khỏi lỗi "báo cáo cấu
hình sai".

---

## Phụ lục — vấn đề dùng chung cho mọi báo cáo doanh thu chi nhánh

**`entityCode` phải khớp CHÍNH XÁC giữa mọi khối** — dữ liệu ETL đồng bộ
(`EntityCode`), file chỉ tiêu (`MaSieuThi`), và cột API Server trả về đều
phải cùng 1 chuỗi mã siêu thị. Lệch 1 ký tự (khoảng trắng, hoa/thường) là
dữ liệu của cùng 1 siêu thị không ghép được vào chung 1 dòng.

**Mở siêu thị mới** — không cần sửa báo cáo. Báo cáo composite không có
danh sách cố định, tự động hiện ra ngay khi có dữ liệu (ETL đồng bộ được,
hoặc endpoint realtime trả về). Nhớ gán đúng `chain` (Dimensions/cột trả
về) nếu dùng `groupBy`, và thêm dòng chỉ tiêu cho tháng đầu tiên.

**Đóng siêu thị** — cách chắc chắn nhất: đánh dấu `TrangThai=DaDong` trong
chỉ tiêu tháng đó (loại hẳn khỏi báo cáo composite, kể cả dòng tổng). Nếu
không đánh dấu, siêu thị tự biến mất khỏi báo cáo NGÀY KHÔNG CÒN dữ liệu
đồng bộ nữa (nhưng ngày trước đó, nếu `KeepHistory` đã bật, vẫn tra cứu lại
đúng như cũ).

**Tài liệu kỹ thuật đầy đủ hơn** (hình dạng JSON đầy đủ, mọi tuỳ chọn của
`blocks`/`groupBy`, cách hoạt động bên trong) — xem `rp-server/README.md`
mục "Báo cáo ghép nhiều nguồn (composite)", `etl/README.md` mục "Nhập chỉ
tiêu" và "Giữ lịch sử theo ngày".

---

## 3. Báo cáo tra cứu 1 mã qua API Server (`lookupField`) — vd Kiểm tra voucher

### Khi nào dùng

Người dùng gõ/quét MỘT mã (voucher, mã thẻ thành viên, số hoá đơn...) và
cần ra ĐÚNG 1 dòng kết quả — khác báo cáo 1 và 2 ở trên (kéo cả danh sách
nhiều dòng). Ví dụ case study: kiểm tra voucher —
- Voucher **chưa sử dụng** → trả trạng thái + ngày hết hạn.
- Voucher **đã sử dụng** → trả trạng thái + ngày sử dụng + người sử dụng +
  vị trí sử dụng (siêu thị).

Cả 2 tình huống xử lý bằng ĐÚNG 1 endpoint — các cột "chỉ có khi đã dùng"
(ngày/người/vị trí sử dụng) để `NULL` khi voucher chưa dùng, báo cáo tự
hiện đúng những cột có giá trị.

**Dữ liệu nằm rải ở NHIỀU bảng thì sao?** Ví dụ bảng `Vouchers` chỉ lưu
`UsedByCustomerId` (mã khách hàng), tên khách hàng thật nằm ở bảng
`Customers` riêng — **api-server tự JOIN, KHÔNG bắt báo cáo/rp-server tự
ghép** (đúng nguyên tắc "client chỉ nhận kết quả"). Xem Bước 2 bên dưới,
mục "Bảng liên kết (tuỳ chọn)". Giới hạn: TỐI ĐA 1 bảng liên kết — cần ghép
từ 3 bảng trở lên (hoặc logic phức tạp hơn 1 JOIN đơn giản) thì tạo VIEW ở
phía CSDL nguồn (gộp sẵn nhiều bảng) rồi trỏ endpoint vào VIEW đó thay vì
cố nhồi vào 1 JOIN.

### Bước 1 — api-admin: khai nguồn dữ liệu OLTP chứa bảng voucher

Trang "Nguồn dữ liệu" — trỏ tới CSDL OLTP đang lưu bảng voucher. Ví dụ có
JOIN (khách hàng nằm bảng riêng):
- `dbo.Vouchers`: `VoucherCode, Status, ExpiryDate, UsedAt, UsedByCustomerId,
  UsedLocation` (`UsedAt/UsedByCustomerId/UsedLocation` để trống khi chưa
  sử dụng).
- `dbo.Customers`: `CustomerId, CustomerName` (bảng liên kết, lấy tên thật
  từ mã khách hàng).

1 CSDL trung tâm là đủ nếu hệ thống voucher không tách theo từng chi nhánh
(khác báo cáo 2, mỗi chi nhánh 1 nguồn riêng).

### Bước 2 — api-admin: tạo endpoint realtime "tra 1 khoá"

Trang "Endpoint realtime" → tạo mới:
- **Endpoint**: `voucher`
- **Nguồn dữ liệu**: nguồn vừa tạo ở Bước 1
- **Bảng**: `dbo.Vouchers`
- **Cột khoá (KeyColumn)**: `VoucherCode`
- **Cột hiển thị**: `VoucherCode, Status, ExpiryDate, UsedAt, UsedByCustomerId, UsedLocation`
- **Cột sắp xếp**: `VoucherCode` (bắt buộc phải chọn dù chế độ tra-1-khoá
  không dùng tới — chỉ `/list` mới cần sắp xếp)
- **Bảng liên kết (tuỳ chọn)** — tick "Thêm bảng/view liên kết":
  - Bảng liên kết: `dbo.Customers`
  - Kiểu nối: `LEFT JOIN` (voucher chưa dùng vẫn hiện được, dù chưa có khách hàng)
  - Cột nối (bảng chính): `UsedByCustomerId`
  - Cột nối (bảng liên kết): `CustomerId`
  - Cột lấy từ bảng liên kết: `CustomerName`

Lưu xong hệ thống tự đối chiếu bảng/cột (CẢ bảng chính lẫn bảng liên kết)
với schema thật (không cần bấm gì thêm). Endpoint này lộ ra 2 cách gọi —
`GET /v1/realtime/voucher/list` (danh sách phân trang) và
`GET /v1/realtime/voucher/{mã}` (tra đúng 1 mã, báo cáo ở Bước 5 dùng cách
này) — kết quả LUÔN có `CustomerName` ghép sẵn, không lộ ra `UsedByCustomerId`
là khoá ngoại của bảng nào.

### Bước 3 — api-admin: cấp quyền cho rp-server gọi endpoint này

Trang "Đối tác" → tạo (hoặc dùng lại) đối tác cho rp-server, `Scope` có
`realtime`. Vào tab "Endpoint realtime" của đối tác đó, tick chọn
`voucher`. Copy API key (chỉ hiện 1 lần lúc tạo/luân chuyển).

### Bước 4 — rp-user: khai kết nối tới API Server (bỏ qua nếu đã có sẵn)

"Hệ thống → Kết nối API Server" → tạo kết nối, dán API key ở Bước 3. Dùng
lại được cho mọi báo cáo `apiReport`/`apiRealtime` khác đã trỏ cùng API
Server này.

### Bước 5 — rp-user: tạo báo cáo

"Hệ thống → Biểu mẫu" → tạo báo cáo mới:
- **SourceType**: `apiRealtime`
- **DefinitionJson**:

```json
{
  "apiConnectionId": 1,
  "apiTarget": "voucher",
  "lookupField": "voucherCode",
  "filters": [
    { "field": "voucherCode", "label": "Mã voucher", "type": "text" }
  ],
  "columns": [
    { "key": "VoucherCode", "label": "Mã voucher" },
    { "key": "Status", "label": "Trạng thái" },
    { "key": "ExpiryDate", "label": "Ngày hết hạn" },
    { "key": "UsedAt", "label": "Ngày sử dụng" },
    { "key": "CustomerName", "label": "Người sử dụng" },
    { "key": "UsedLocation", "label": "Nơi sử dụng (siêu thị)" }
  ]
}
```

`CustomerName` ở đây là cột LẤY TỪ BẢNG LIÊN KẾT (Bước 2) — báo cáo không
cần biết `Vouchers` với `Customers` là 2 bảng khác nhau, chỉ thấy 1 dòng
kết quả phẳng đã ghép sẵn.

`lookupField` (**bắt buộc để bật chế độ tra-1-khoá**) là tên field trong
`filters` sẽ được gửi làm khoá tra cứu — thiếu mã thì báo cáo trả 0 dòng,
không gọi API Server. `apiConnectionId` lấy từ Bước 4 (xem cột "Id" trên
trang "Kết nối API Server"). Gán quyền xem báo cáo cho vai trò cần dùng ở
trang "Vai trò" như mọi báo cáo khác.

**Giới hạn cố ý**: `lookupField` chỉ nhận ĐÚNG 1 điều kiện lọc (đúng 1
khoá) — không kết hợp thêm điều kiện khác (vd "voucher + loại voucher").
Cần lọc nhiều điều kiện cùng lúc thì dùng SourceType `apiReport` (báo cáo
tổng hợp thật, có lọc động qua `GET /v1/reports/.../run`) thay vì
`apiRealtime`.

### Bước 6 — Kiểm tra

Vào báo cáo, gõ mã voucher **chưa sử dụng** → thấy đúng 1 dòng, cột
`UsedAt/CustomerName/UsedLocation` trống. Gõ mã **đã sử dụng** → thấy đủ
ngày sử dụng + tên khách hàng (ghép từ bảng `Customers`) + nơi sử dụng. Gõ
mã **không tồn tại** → 0 dòng, KHÔNG báo lỗi (được coi là kết quả bình
thường, không phải sự cố hệ thống). Để trống ô mã → 0 dòng ngay, không tốn
lượt gọi API Server nào.

---

## Quy tắc chung — khi nào tạo VIEW, khi nào dùng JOIN có sẵn, khi nào dùng composite

Áp dụng cho MỌI báo cáo mới, không riêng case nào — 2 tình huống hoàn toàn
khác nhau, đừng nhầm lẫn:

### Ghép nhiều bảng TRONG CÙNG 1 CSDL nguồn (ETL, API Server)

| Số bảng cần ghép | ETL (`etl.SyncJobs`) | API Server (`api.RealtimeEndpointDefs`) |
|---|---|---|
| 1 bảng chính + 1 bảng liên kết | Dùng JOIN có sẵn trên giao diện — không cần VIEW | Dùng JOIN có sẵn trên giao diện — không cần VIEW |
| 3 bảng trở lên, hoặc logic phức tạp hơn 1 JOIN đơn giản (điều kiện lọc phức tạp, UNION, subquery...) | **Bắt buộc tạo VIEW** ở CSDL nguồn, trỏ job vào VIEW đó | **Bắt buộc tạo VIEW** ở CSDL nguồn, trỏ endpoint vào VIEW đó |

Cả 2 engine cố ý CHỈ hỗ trợ tối đa 1 bảng liên kết — không mở rộng thêm
(tránh biến chúng thành trình dựng SQL tuỳ ý). Vượt quá 1 bảng thì VIEW là
đường DUY NHẤT, không có cách nào khác.

### Ghép NHIỀU NGUỒN dữ liệu khác nhau để ra 1 báo cáo (Report Server)

**KHÔNG dùng VIEW** — dùng `SourceType='composite'` (mục 1 file này). VIEW
không làm được vì các nguồn có thể khác domain DWH, khác endpoint API
Server, thậm chí khác hẳn hệ thống — SQL không JOIN qua được 1 lượt gọi
HTTP. Report Server tự ghép ở TẦNG ỨNG DỤNG theo `entityCode`, các khối
chạy song song (không tuần tự — xem `rp-server/lib/compositeReportRunner.js`).

### Tóm tắt 1 câu

- Nhiều bảng, CÙNG 1 CSDL → JOIN có sẵn (≤2 bảng) hoặc VIEW (≥3 bảng).
- Nhiều NGUỒN khác nhau (khác domain/endpoint/hệ thống) → composite, không
  phải VIEW.

---

## 4. Báo cáo đối chiếu số liệu siêu thị ↔ trung tâm — gửi qua nội dung email (không phải file đính kèm)

Case thật: "Báo Cáo Nhanh Doanh Thu" — mỗi khung giờ trong ngày, so sánh
doanh thu ghi nhận ở **CSDL từng siêu thị** (phần mềm bán hàng tại điểm
bán, gọi tắt "Thành viên") với doanh thu **CSDL trung tâm** (phần mềm bán
hàng đồng bộ LÊN từ siêu thị, gọi tắt "HO") — lệch nhau quá 100.000đ thì
cảnh báo (tô đỏ). Đây là báo cáo ĐỌC NHANH, hiện ngay trong email, không
cần mở file đính kèm.

### Vì sao KHÔNG lấy thẳng từ Data Warehouse như mục 1/2

DWH bình thường chỉ đồng bộ MỘT nguồn: CSDL trung tâm (HO) → DWH. Số liệu
trong DWH lúc nào cũng RA TỪ trung tâm — dùng DWH để so sánh "siêu thị vs
trung tâm" thì thực chất đang so sánh trung tâm với chính nó, vô nghĩa.
Muốn đối chiếu thật, 2 con số phải đến từ **2 đường đồng bộ ĐỘC LẬP nhau**,
không chung nguồn gốc ở bất kỳ khâu nào.

### Kiến trúc: 2 đường ETL độc lập, gặp nhau ở DWH dưới 2 Domain khác nhau

DWH ở đây chỉ đóng vai trò NƠI CHỨA TẠM để ghép báo cáo (như mọi domain
khác) — KHÔNG phải nguồn sự thật dùng chung cho 2 số liệu, nên không vi
phạm nguyên tắc "không lấy từ data warehouse" nêu trên:

```
CSDL siêu thị #1 ──┐
CSDL siêu thị #2 ──┤   (mỗi siêu thị = 1 etl.DataSources RIÊNG,
       ...         ├──▶  1 etl.SyncJobs RIÊNG) ──▶ dwh.ReportFacts
CSDL siêu thị #33 ──┘         Domain = 'doanhthu_thanhvien'

CSDL trung tâm ─────────────▶ (1 etl.DataSources, 1 etl.SyncJobs) ──▶ dwh.ReportFacts
                                     Domain = 'doanhthu_ho'
```

- **33 kết nối siêu thị**: tạo hàng loạt qua "Nhập hàng loạt" trên
  etl-admin (mục B — file Excel liệt kê Name/Server/Database/Username/...
  33 dòng), mỗi kết nối 1 `etl.SyncJobs` đồng bộ đúng bảng doanh thu của
  CHÍNH siêu thị đó vào Domain `doanhthu_thanhvien`, `EntityCode` = mã
  siêu thị (khớp đúng mã dùng ở Domain `doanhthu_ho` — xem Phụ lục
  "entityCode phải nhất quán" mục 2).
- **1 kết nối trung tâm**: `etl.SyncJobs` đồng bộ CSDL trung tâm (đúng
  bảng phần mềm bán hàng ghi nhận SAU KHI siêu thị gửi lên) vào Domain
  `doanhthu_ho`, cũng `EntityCode` theo mã siêu thị.

Không cần VIEW/JOIN ở bước ETL — mỗi job vẫn đọc 1 bảng của 1 CSDL, đúng
khuôn sẵn có (mục "Quy tắc chung" ở trên).

### Báo cáo: composite ghép 2 Domain theo entityCode

Không cần code mới — dùng ĐÚNG cơ chế composite đã có (mục "Quy tắc
chung"), 2 khối `directDb`, cột "Chênh lệch" là CÔNG THỨC:

```json
{
  "blocks": [
    { "key": "ho", "sourceType": "directDb", "domain": "doanhthu_ho" },
    { "key": "thanhVien", "sourceType": "directDb", "domain": "doanhthu_thanhvien" }
  ],
  "columns": [
    { "key": "entityCode", "label": "STK_ID" },
    { "key": "thanhVien.dimensions.tenSieuThi", "label": "Cửa Hàng/Siêu Thị" },
    { "key": "ho.measures.doanhThu", "label": "HO" },
    { "key": "thanhVien.measures.doanhThu", "label": "Thành viên" },
    { "key": "chenhLech", "label": "Chênh lệch", "formula": "ho.measures.doanhThu - thanhVien.measures.doanhThu" },
    { "key": "tyLeDat", "label": "Tỷ lệ đạt", "formula": "ROUND(thanhVien.measures.doanhThu / ho.measures.doanhThu * 100, 1)" }
  ],
  "groupBy": {
    "field": "thanhVien.dimensions.chain",
    "groups": [
      { "value": "MART", "label": "Tổng cộng MART" },
      { "value": "MINIMART", "label": "Tổng cộng MiniMart" }
    ],
    "labelColumn": "entityCode"
  }
}
```

Siêu thị nào THIẾU 1 trong 2 khối (chưa đồng bộ kịp, hoặc mới mở/đã đóng —
xem Phụ lục) thì cột tương ứng trống, "Chênh lệch" không tính được
(`undefined`) — không lỗi, không làm hỏng dòng khác.

### Lịch gửi: Subject riêng + gửi qua nội dung email + tô đỏ khi vượt ngưỡng

Trang "Hệ thống → Lịch gửi email báo cáo" (đã tạo/sửa lịch cho báo cáo
trên) → điền:

- **Tiêu đề email (Subject)**: `Báo Cáo Nhanh Doanh Thu, Ngày: {ngay}` —
  `{ngay}` tự thay bằng ngày gửi thật (khớp đúng ảnh mẫu thật
  "...Ngày: 30/08/2026"). Để trống thì dùng mẫu mặc định
  `[HCRC] <tên báo cáo> — {ngay}`.
- **Cách gửi**: chọn "Bảng ngay trong nội dung email" (không phải "File
  đính kèm") — người nhận mở email là thấy bảng luôn.
- **Cột kiểm tra ngưỡng**: chọn `chenhLech` (đúng key cột "Chênh lệch" ở
  trên).
- **Ngưỡng cảnh báo**: `100000` — ô "Chênh lệch" nào có trị tuyệt đối vượt
  100.000đ (âm hay dương đều tính) sẽ tô đỏ trong email.

Ngưỡng/cột tô màu lưu THEO TỪNG LỊCH GỬI (không phải cố định trong
`DefinitionJson` báo cáo) — cùng 1 báo cáo có thể có nhiều lịch gửi cho
nhiều nhóm nhận khác nhau, mỗi lịch tự đặt ngưỡng cảnh báo riêng nếu cần.
Có thể tạo nhiều "giờ gửi" trong CÙNG 1 lịch (vd 09:00/13:00/17:00 — xem
mục "Nhiều lần gửi/ngày" trên trang này) để rà soát nhiều lần trong ngày.

**Giới hạn cố ý**: tô màu điều kiện hiện CHỈ áp dụng cho email HTML body —
xem báo cáo trên rp-user hay tải Excel/PDF vẫn ra đúng số, chỉ không tô
màu (phạm vi tô màu rộng hơn — cả màn hình rp-user lẫn Excel/PDF — là việc
làm thêm sau nếu cần).

## 5. Cảnh báo bất thường — tự động phát hiện chi nhánh/thực thể lệch khác thường

Khác "Lịch gửi email báo cáo" (mục 4 — gửi ĐỊNH KỲ, đúng nguyên bảng dù có
bất thường hay không): **Cảnh báo bất thường** chỉ gửi khi CÓ VẤN ĐỀ, và chỉ
liệt kê đúng những thực thể bất thường. Dùng lại BÁO CÁO ĐÃ CÓ — không cần
tạo báo cáo riêng, không giới hạn ở "doanh thu" (dùng được cho số đơn hàng,
tồn kho, tỷ lệ trả hàng... miễn báo cáo trả về 1 dòng/1 thực thể có cột số).
2 chế độ (chọn khi tạo cảnh báo):

- **So kỳ hiện tại/kỳ trước (%)** — chạy báo cáo 2 LẦN, so % chênh lệch với
  kỳ trước/cùng kỳ năm trước. Hợp các chỉ số có tính "theo giai đoạn" (doanh
  thu, số đơn hàng, lượt khách...) — xem mục "Điều kiện" + "Cấu hình" dưới.
- **Ngưỡng tuyệt đối** — chạy báo cáo ĐÚNG 1 LẦN, so trực tiếp với 1 giá trị
  cố định (không cần kỳ so sánh). Hợp các chỉ số dạng "tồn tại tại 1 thời
  điểm" (tồn kho, số dư, công nợ...) — xem mục "Ngưỡng tuyệt đối — vd tồn
  kho" dưới.

### Điều kiện báo cáo phải đáp ứng (chế độ "So kỳ hiện tại/kỳ trước")

- Trả về **1 dòng / 1 thực thể** (vd 1 dòng/chi nhánh) — báo cáo `composite`
  ở mục 1/mục 4 đúng dạng này.
- Có **đúng 1 bộ lọc kiểu "Khoảng ngày" (dateRange)** — đây là bộ lọc hệ
  thống sẽ TỰ DỊCH sang kỳ so sánh mỗi lần chạy. Báo cáo mục 1 hiện dùng
  filter kiểu **"Ngày" (date)** đơn (`eventDate`) — cần đổi hoặc thêm 1
  filter kiểu `dateRange` trong `DefinitionJson.filters` mới dùng được tính
  năng này, vd:
  ```json
  { "field": "khoangNgay", "type": "dateRange", "label": "Khoảng ngày" }
  ```
  (báo cáo `composite` cần tự đọc field này trong công thức nếu muốn lọc
  DWH theo khoảng chứ không phải đúng 1 ngày — xem cách các `blocks` khác
  dùng `dateOffsetYears`/tham chiếu `filters` hiện có).

### Cấu hình (trang "Hệ thống → Cảnh báo bất thường")

Ví dụ dựa trên báo cáo "Báo cáo nhanh doanh thu" ở mục 1 (cột `tenCuaHang`/
`thucDat`):

- **Báo cáo theo dõi**: chọn báo cáo đã có filter `dateRange`.
- **Bộ lọc khoảng ngày (kỳ hiện tại)**: chọn preset tương đối, vd "7 ngày
  qua" — tính lại đúng lúc chạy, không cố định 1 khoảng ngày mãi mãi (cùng
  cơ chế preset ở "Lịch gửi email báo cáo").
- **Cột xác định "thực thể"**: `tenCuaHang`.
- **Cột số cần theo dõi**: `thucDat`.
- **So với kỳ nào**: "Kỳ liền trước" (vd so 7 ngày này với 7 ngày ngay
  trước) hoặc "Cùng kỳ năm trước" (mùa vụ/Tết nên dùng cách này để không so
  nhầm ngày thường với ngày cao điểm).
- **Ngưỡng cảnh báo**: vd `20` (%) — chi nhánh nào lệch quá 20% so với kỳ
  so sánh (tăng HOẶC giảm) mới vào email.
- **Lịch kiểm tra**: cron, vd `0 7 * * *` (7h sáng hàng ngày).
- **Người nhận**: danh sách email, phân tách dấu phẩy.

Bấm **"Kiểm tra ngay"** để thử ngay không cần đợi tới giờ đã đặt — nếu
không có gì bất thường sẽ báo "không có gì bất thường, không gửi email"
(không gửi mail rỗng).

### Đọc kết quả

Mỗi dòng trong email là 1 thực thể vượt ngưỡng: giá trị kỳ này, giá trị kỳ
so sánh, % chênh lệch, và ghi chú riêng cho 2 trường hợp đặc biệt — **"Mới
phát sinh"** (không có ở kỳ so sánh, vd chi nhánh mới mở) và **"Về 0 ở kỳ
này"** (có ở kỳ so sánh nhưng kỳ này bằng 0, vd chi nhánh đóng cửa/mất dữ
liệu đồng bộ) — cả 2 trường hợp này LUÔN vượt ngưỡng (không tính % thật với
mẫu số 0), cần xem GHI CHÚ để hiểu đúng thay vì đọc thẳng con số %.

### Ngưỡng tuyệt đối — vd cảnh báo sắp hết hàng (tồn kho)

Khác chế độ so kỳ % ở trên — chế độ này **không cần kỳ so sánh**, không bắt
buộc báo cáo phải có bộ lọc khoảng ngày (vẫn dùng được nếu có, chỉ để lọc cố
định, không tự dịch kỳ). Giả sử đã có báo cáo "Tồn kho hiện tại" (đọc từ
domain ETL đồng bộ tồn kho — coi mỗi dòng là 1 SKU/chi nhánh, xem mục 6 cho
cách coi 1 SKU × 1 chi nhánh là 1 thực thể riêng nếu cần):

- **Chế độ**: chọn "Ngưỡng tuyệt đối".
- **Báo cáo theo dõi**: chọn báo cáo "Tồn kho hiện tại".
- **Cột xác định "thực thể"**: `maSKU` (hoặc `maSKU_maChiNhanh` nếu theo
  dõi riêng từng chi nhánh).
- **Cột số cần theo dõi**: `soLuongTon`.
- **Chiều ngưỡng**: "Thấp hơn ngưỡng" (sắp hết hàng) — chọn "Cao hơn
  ngưỡng" nếu muốn cảnh báo TỒN KHO Ứ ĐỌNG thay vì sắp hết.
- **Giá trị ngưỡng**: vd `10` — SKU nào còn dưới 10 đơn vị mới vào email.
- **Lịch kiểm tra**: cron, vd `0 8 * * *` (8h sáng hàng ngày, hoặc dày hơn
  nếu cần theo dõi sát).
- **Người nhận**: danh sách email, phân tách dấu phẩy.

Email chỉ liệt kê 2 cột: Thực thể + Giá trị hiện tại (không có "kỳ so
sánh"/"% chênh lệch" — không áp dụng cho chế độ này), sắp xếp gần ngưỡng
nhất lên đầu (thấp nhất trước với chiều "Thấp hơn", cao nhất trước với
chiều "Cao hơn").

## 6. Chỉ tiêu theo ngành hàng/SKU — mở rộng "Chỉ tiêu chi nhánh" (mục 1) xuống 1 cấp

Mục 1 lưu chỉ tiêu **theo cả siêu thị** — mỗi thực thể (`EntityCode`) là 1
siêu thị. Muốn theo dõi chỉ tiêu **theo ngành hàng trong TỪNG siêu thị**
(vd siêu thị BRGHP: ngành Thực phẩm đạt bao nhiêu % chỉ tiêu, ngành Điện máy
đạt bao nhiêu %) — KHÔNG cần bảng/tính năng mới, chỉ cần coi **"1 siêu thị ×
1 ngành hàng" là 1 thực thể riêng** (đúng nguyên tắc `EntityCode` đã dùng
xuyên suốt — thực thể không nhất thiết là 1 siêu thị vật lý).

**Điều kiện**: dữ liệu bán hàng tại nguồn (từng ST/trung tâm) phải có sẵn mã
ngành hàng trên TỪNG DÒNG bán hàng — không có thì chỉ làm được phần NHẬP
CHỈ TIÊU (dưới), chưa so sánh được với thực đạt.

### Bước 1 — Nguồn: tạo VIEW ghép "Mã thực thể" = SiêuThị_NgànhHàng

ETL job "Theo bảng" chỉ nhận **1 cột có sẵn** làm "Cột khoá (EntityCode)"
(không gõ được biểu thức) — cần 1 VIEW tại nguồn tự ghép sẵn cột này (đúng
"Quy tắc chung" ở trên — tạo VIEW khi cần tính toán/ghép trước khi ETL đọc):

```sql
CREATE VIEW dbo.vw_DoanhThuTheoNganhHang AS
SELECT
    MaSieuThi + '_' + MaNganhHang AS MaThucThe,  -- Cột khoá (EntityCode)
    MaSieuThi,
    MaNganhHang,
    NgayBan AS EventDate,                        -- Cột ngày
    SUM(ThanhTien) AS DoanhThu,
    NgayCapNhat AS UpdatedAt                      -- Cột watermark
FROM dbo.ChiTietBanHang
GROUP BY MaSieuThi, MaNganhHang, NgayBan, NgayCapNhat;
```

(Đổi tên bảng/cột đúng CSDL thật — đây chỉ là ví dụ khung.)

### Bước 2 — etl-admin: đồng bộ thực đạt theo ngành hàng

Tạo job "Theo bảng" MỚI (tách riêng job doanh thu toàn siêu thị ở mục 1):

- **Bảng nguồn**: `dbo.vw_DoanhThuTheoNganhHang` vừa tạo.
- **Cột khoá (EntityCode)**: `MaThucThe` (đã ghép sẵn trong VIEW).
- **Cột ngày**: `EventDate`. **Cột watermark**: `UpdatedAt`.
- **Dimensions**: tick `MaSieuThi`, `MaNganhHang` — để báo cáo lọc/hiện tên
  cột riêng mà không cần tự tách chuỗi `MaThucThe`.
- **Measures**: tick `DoanhThu`.
- **Domain**: đặt tên RIÊNG, vd `doanhthu_nganhhang` (khác domain
  `doanhthu_chinhanh` ở mục 1 — 2 domain độc lập, không đụng nhau).
- **BẬT "Giữ lịch sử theo ngày"** — cần cho "Cùng kỳ năm trước" nếu dùng.

### Bước 3 — etl-admin: nhập chỉ tiêu theo ngành hàng

Vào **Nhập chỉ tiêu**, upload file Excel, Domain = `doanhthu_nganhhang`
(ĐÚNG domain Bước 2), thêm cột `MaNganhHang` (TUỲ CHỌN — xem
`etl/lib/salesTargetsImport.js`):

| MaSieuThi | Thang | MaNganhHang | ChiTieuDoanhThu |
|---|---|---|---|
| BRGHP | 2026-08 | THUCPHAM | 50000000 |
| BRGHP | 2026-08 | DIENMAY | 30000000 |
| BRGHD | 2026-08 | THUCPHAM | 68000000 |

Dòng có `MaNganhHang` được lưu với mã thực thể ghép
`<MaSieuThi>_<MaNganhHang>` — **PHẢI khớp CHÍNH XÁC** cách VIEW ở Bước 1
ghép (`MaSieuThi + '_' + MaNganhHang`, cùng dấu gạch dưới, cùng thứ tự)
thì báo cáo composite ở Bước 4 mới ghép đúng dòng thực đạt với dòng chỉ
tiêu (ghép theo `EntityCode`, xem `rp-server/lib/compositeReportRunner.js`).
Vẫn dùng được trang "Sửa / thêm 1 siêu thị" cho từng dòng lẻ — gõ Mã thực
thể dạng `BRGHP_THUCPHAM` và thêm `MaSieuThi`/`MaNganhHang` vào ô JSON.

### Bước 4 — rp-user: tạo báo cáo composite theo ngành hàng

Giống hệt mục 1 (Bước 3), chỉ đổi domain cả 3 khối sang
`doanhthu_nganhhang`, và thêm cột hiện tên siêu thị/ngành hàng riêng:

```json
{
  "title": "Chỉ tiêu theo ngành hàng",
  "domain": "doanhthu_nganhhang",
  "filters": [
    { "field": "eventDate", "type": "date", "label": "Ngày báo cáo" }
  ],
  "blocks": [
    { "key": "current", "sourceType": "directDb", "domain": "doanhthu_nganhhang" },
    { "key": "target", "isTarget": true, "targetDomain": "doanhthu_nganhhang" }
  ],
  "columns": [
    { "key": "maSieuThi", "label": "Siêu thị", "formula": "current.dimensions.MaSieuThi" },
    { "key": "nganhHang", "label": "Ngành hàng", "formula": "current.dimensions.MaNganhHang" },
    { "key": "thucDat", "label": "Thực đạt", "formula": "current.measures.DoanhThu" },
    { "key": "chiTieu", "label": "Chỉ tiêu", "formula": "target.ChiTieuDoanhThu" },
    { "key": "tyLeDat", "label": "Tỷ lệ đạt (%)", "formula": "ROUND(current.measures.DoanhThu / target.ChiTieuDoanhThu * 100, 1)" }
  ],
  "groupBy": {
    "field": "current.dimensions.MaSieuThi",
    "groups": [
      { "value": "BRGHP", "label": "Tổng cộng BRGHP" },
      { "value": "BRGHD", "label": "Tổng cộng BRGHD" }
    ],
    "grandTotalLabel": "Tổng cộng toàn hệ thống",
    "labelColumn": "nganhHang"
  }
}
```

`groupBy` ở đây gộp theo SIÊU THỊ (mỗi siêu thị 1 dòng "Tổng cộng" cộng dồn
mọi ngành hàng) — đổi `field` sang `current.dimensions.MaNganhHang` nếu
muốn gộp theo NGÀNH HÀNG (mỗi ngành 1 dòng tổng cộng dồn mọi siêu thị)
thay vì theo siêu thị — tuỳ mục đích xem báo cáo.

**Thực thể thiếu 1 trong 2 khối** (chưa đồng bộ kịp thực đạt, hoặc chưa
nhập chỉ tiêu ngành hàng đó) — cột tương ứng trống, không lỗi, giống hành
vi đã có ở mục 1.

## 7. Xác thực HCRC Workspace + Đồng bộ tài khoản người dùng

Mục đích: người dùng thường (không phải Admin hệ thống) đăng nhập report
server (rp-user) bằng ĐÚNG tài khoản/mật khẩu bên hệ thống nội bộ "HCRC
Workspace" — không phải tạo/nhớ thêm 1 mật khẩu riêng cho report server —
và họ tên/phòng ban/chức danh/nơi làm việc/điện thoại được đồng bộ về để phân quyền
(nhóm quyền theo Vai trò/`app.Roles`, hoặc quyền riêng 1 người bằng cách
tạo 1 Vai trò chỉ gán cho đúng người đó). Vai trò Admin (hệ thống) LUÔN
xác thực bằng mật khẩu local ở report server, không phụ thuộc HCRC
Workspace.

Dưới đây là ĐÚNG 2 API HCRC Workspace đã công bố (bản v1.97) — cấu hình
Base URL + khoá API ở trang "Xác thực HCRC Workspace" →
`/system/hcrc-workspace` (đường dẫn 2 endpoint đã điền sẵn đúng mặc định
bên dưới, không cần gõ lại trừ khi bên HCRC Workspace đổi).

### 7.1 Xác thực & khoá API

Mọi request gửi tới cả 2 endpoint bên dưới đều kèm header:

```
Authorization: Bearer <khoá API do HCRC Workspace cấp>
```

- Khoá API chỉ hiển thị **đúng 1 lần** lúc quản trị viên HCRC Workspace
  tạo — nếu lộ/không dùng nữa phải báo họ **thu hồi** và cấp khoá mới
  (không có cách lấy lại khoá cũ).
- Giới hạn mặc định **300 lượt/15 phút/địa chỉ IP nguồn**, áp dụng chung
  cho cả 2 endpoint.
- Nếu report server gọi từ (các) IP tĩnh cố định, gửi danh sách IP đó cho
  quản trị viên HCRC Workspace để họ bật thêm lớp giới hạn theo IP (không
  cấu hình gì thêm ở report server) — gọi từ IP không nằm trong danh sách
  sẽ bị từ chối `403` dù khoá đúng.

### 7.2 Xác thực tài khoản — gọi MỖI LẦN người dùng đăng nhập

```
POST {BaseUrl}{VerifyPath}   (mặc định VerifyPath = "/api/external/verify-credentials")
Headers: Authorization: Bearer <khoá API>
         Content-Type: application/json
Body:    { "account": "...", "password": "..." }

200 OK   { "success": true }
200 OK   { "success": false, "error": "Tài khoản hoặc mật khẩu không chính xác" }
```

- **Sai tài khoản/mật khẩu vẫn trả `200 OK`** kèm `success: false` — KHÔNG
  phải `401`. Report server chỉ coi là đăng nhập sai khi nhận đúng
  `success: false` ở mã `200`.
- `400/401/403/429/500` (thiếu tham số/khoá API sai hoặc bị thu hồi/IP
  không được phép/gọi quá tần suất/lỗi máy chủ họ) — report server coi là
  "dịch vụ xác thực tạm thời không khả dụng", trả lỗi 503 riêng cho người
  đăng nhập, **KHÔNG tính vào số lần đăng nhập sai** (không khoá tài
  khoản oan vì lỗi cấu hình/hạ tầng không phải do người dùng gõ sai).
- Gọi endpoint này sai mật khẩu 5 lần liên tiếp cho cùng 1 tài khoản sẽ bị
  HCRC Workspace tự khoá tạm 15 phút (dùng chung bộ đếm với đăng nhập nội
  bộ của họ) — report server không cần tự làm thêm gì cho việc này.
- Report server timeout sau 8 giây nếu không phản hồi.

### 7.3 Đồng bộ danh bạ nhân sự — gọi khi admin bấm "Đồng bộ tài khoản"
(trang "Người dùng", bấm tay, KHÔNG tự động chạy theo giờ)

```
GET {BaseUrl}{DirectoryPath}   (mặc định DirectoryPath = "/api/external/users")
Headers: Authorization: Bearer <khoá API>

200 OK — mảng toàn bộ danh bạ
[
  {
    "position": "Văn phòng",
    "username": "nva",
    "name": "Nguyễn Văn A",
    "phone": "0901234567",
    "dept": "Phòng Kinh Doanh",
    "jobTitle": "Chuyên viên"
  },
  ...
]
```

Đúng 6 trường, không hơn — response **không bao giờ** kèm mật khẩu/hash/mã
PIN/email/trạng thái hoạt động:

| Trường | Ý nghĩa | report server lưu vào |
|---|---|---|
| `username` | Mã nhân viên — định danh **duy nhất/không đổi** của mỗi nhân sự | `Username` (khoá đồng bộ) |
| `name` | Tên nhân viên | `FullName` |
| `dept` | Phòng | `Department` |
| `jobTitle` | Chức danh | `Position` |
| `position` | Nơi làm việc — `"Văn phòng"` hoặc `"Siêu Thị"` (KHÁC "chức danh") | `WorkLocation` |
| `phone` | Điện thoại | `Phone` |

- **Không có `email`** — cột `Email` trên report server vẫn còn (đổi tay
  được ở trang "Người dùng"), nhưng "Đồng bộ tài khoản" KHÔNG đụng vào,
  tránh xoá mất giá trị admin đã tự nhập.
- **Không có trường trạng thái hoạt động riêng** (không `active`) — report
  server chỉ dựa vào việc 1 `username` còn xuất hiện trong mảng trả về
  hay không: biến mất khỏi danh bạ (nghỉ việc/đổi mã nhân viên) → report
  server tự động **khoá** tài khoản tương ứng (nếu trước đó đã từng đồng
  bộ), không cần thao tác tay.
- Report server ghép quyền như sau mỗi lần đồng bộ:
  - `username` MỚI (chưa từng thấy, và chưa tồn tại trong report server
    dưới bất kỳ hình thức nào) → tạo tài khoản mới, mặc định **CHƯA cho
    phép kết nối** (admin phải vào trang "Người dùng" bấm "Cho phép kết
    nối" từng người, và "Gán vai trò" để họ thấy được báo cáo nào).
  - `username` ĐÃ đồng bộ trước đó → chỉ cập nhật lại họ tên/phòng ban/
    chức danh/nơi làm việc/điện thoại, KHÔNG đụng quyền/trạng thái admin
    đã cấu hình (vd admin đã đổi tài khoản đó sang xác thực Local).
  - `username` trùng với 1 tài khoản report server ĐÃ CÓ nhưng KHÔNG PHẢI
    do đồng bộ tạo ra (vd trùng tên với tài khoản Admin local) → BỎ QUA,
    không tự gộp — admin tự xử lý tay nếu đúng là cùng 1 người.

Không có lịch tự động — mỗi lần công ty có người mới/nghỉ việc/đổi phòng
ban, admin vào trang "Người dùng" bấm lại "Đồng bộ tài khoản" khi cần.

### 7.4 Mã lỗi chung (áp dụng cả 2 endpoint)

| Mã | Ý nghĩa |
|----|---------|
| 200 | Request hợp lệ và đã xử lý (kể cả khi `success: false`) |
| 400 | Thiếu tham số bắt buộc |
| 401 | Khoá API thiếu/sai/đã bị thu hồi |
| 403 | Khoá API đúng nhưng IP gọi không nằm trong danh sách cho phép |
| 404 | Chỉ `GET /users?account=` với username không tồn tại (report server không dùng tham số này — luôn gọi lấy toàn bộ) |
| 429 | Gọi quá tần suất (300 lượt/15 phút/IP mặc định) |
| 500 | Lỗi phía máy chủ HCRC Workspace |

Định dạng lỗi chung (400/401/403/404/429/500): `{ "error": "Mô tả lỗi" }`.

## 8. Biểu đồ (visualization) cho báo cáo — hướng Power BI

### Khi nào dùng

Mặc định mọi báo cáo hiện dạng bảng số (`DataTable`). Thêm khoá
`"visualization"` vào `DefinitionJson` (áp dụng cho **mọi** `SourceType` —
`directDb`, `composite`, `apiReport`...) để rp-user vẽ biểu đồ thay bảng,
kèm nút "📋 Xem bảng" để người xem tự chuyển qua lại — không cần đổi gì ở
CSDL hay backend, `DefinitionJson` vẫn sửa qua đúng ô textarea JSON như
trước (rp-server tự forward nguyên `visualization` sang rp-user, không lọc
bớt như 3 trường nội bộ `dataSourceId`/`apiConnectionId`/`blocks`).

### Cấu trúc

```json
"visualization": {
  "type": "bar",
  "xField": "tenCuaHang",
  "valueFields": ["thucDat", "chiTieu"]
}
```

- **`type`**: `"bar"` | `"line"` | `"pie"` | `"kpi"` | `"pivot"` (xem cấu
  trúc riêng của `"pivot"` bên dưới — dùng `rowField`/`colField` thay vì
  `xField`/`valueFields`).
- **`xField`**/**`valueFields`**: dùng ĐÚNG `key` đã khai trong
  `columns` phía trên (KHÔNG phải path thô kiểu `current.measures.x`) — vì
  dữ liệu tới lúc vẽ biểu đồ đã được chiếu phẳng theo `columns`, không cần
  biết field gốc nằm ở Dimensions/Measures/khối nào.
- **`"bar"`/`"line"`**: `xField` là trục ngang (thường là tên thực thể/mốc
  thời gian), `valueFields` vẽ 1 cột/đường MỖI PHẦN TỬ trong mảng (nhiều
  chuỗi số so sánh cạnh nhau được, vd "Thực đạt" cạnh "Chỉ tiêu" như ví dụ
  mục 1 ở trên).
- **`"pie"`**: chỉ dùng `valueFields[0]` (đúng ngữ nghĩa biểu đồ tròn —
  "phần trăm của tổng" chỉ có ý nghĩa với 1 chuỗi số).
- **`"kpi"`**: không cần `xField` — mỗi phần tử trong `valueFields` vẽ 1
  thẻ số tổng (cộng dồn toàn bộ dòng; nếu báo cáo có `groupBy` với dòng
  "Tổng cộng" chính thì dùng thẳng dòng đó, không cộng lại).
- Dòng "Tổng cộng"/"Tổng nhóm" (`groupBy`, xem mục 4) tự động **không** vẽ
  lên bar/line/pie (chỉ có ý nghĩa trong bảng số, lẫn vào biểu đồ sẽ làm
  méo trục) — riêng `"kpi"` thì NGƯỢC LẠI, ưu tiên dùng đúng dòng tổng đó.

### Ví dụ đầy đủ — thêm biểu đồ cho báo cáo mục 1

Thêm đúng 1 khoá vào `DefinitionJson` đã có ở mục 1 (giữ nguyên `columns`/
`blocks`/`groupBy`), không cần sửa gì khác:

```json
{
  "title": "Báo cáo nhanh doanh thu",
  "domain": "doanhthu_chinhanh",
  "blocks": [ "... giữ nguyên như mục 1 ..." ],
  "columns": [ "... giữ nguyên như mục 1 ..." ],
  "groupBy": { "...": "giữ nguyên như mục 1" },
  "visualization": {
    "type": "bar",
    "xField": "tenCuaHang",
    "valueFields": ["thucDat", "chiTieu"]
  }
}
```

### `"type": "pivot"` — bảng chéo (cross-tab) + drill-down

```json
"visualization": {
  "type": "pivot",
  "rowField": "chain",
  "colField": "entityCode",
  "valueField": "doanhThu",
  "agg": "sum"
}
```

- `rowField`/`colField`: 2 trường dùng để nhóm theo hàng/cột (cùng quy tắc
  `key` như trên) — vd nhóm theo "Chuỗi" (hàng) x "Siêu thị" (cột).
- `valueField`: trường số cộng dồn vào từng ô.
- `agg` (mặc định `"sum"`): `"sum"` | `"avg"` | `"count"` — `"count"` đếm
  SỐ DÒNG rơi vào ô đó, không quan tâm `valueField` có phải số hay không.
- Tự động thêm dòng/cột "Tổng" + góc "Tổng" chung — tính từ TOÀN BỘ dòng
  gốc khớp điều kiện (không phải cộng lại các ô đã tổng hợp), đúng cho cả
  `"avg"` (không phải "trung bình của các trung bình").
- **Drill-down**: bấm vào 1 ô số → xổ ra bảng chi tiết đúng các dòng gốc
  tạo nên ô đó (dùng lại dữ liệu ĐÃ TẢI, không gọi lại API) — bấm lại (hoặc
  "Đóng") để thu gọn.
- Nhiều dòng cùng `(rowField, colField)` được **cộng dồn** vào 1 ô (đúng
  hành vi pivot chuẩn) — vd báo cáo có cột `eventDate` riêng (chi tiết theo
  ngày) nhưng pivot theo `chain x entityCode` thì mọi ngày trong khoảng đã
  lọc gộp thành 1 số duy nhất mỗi ô, xem chi tiết từng ngày qua drill-down.

### Giới hạn hiện tại (bản đầu)

- Chỉ admin định nghĩa sẵn `visualization` lúc tạo/sửa báo cáo — người
  dùng cuối KHÔNG tự chọn loại biểu đồ/trường vẽ (chỉ chuyển "xem bảng" ↔
  "xem biểu đồ"/"xem pivot" của ĐÚNG cấu hình admin đã đặt).
- Dashboard nhiều biểu đồ + lọc chéo — xem mục 9. Drill-through (nhảy sang
  báo cáo KHÁC đã lọc sẵn) — xem mục 10.

## 9. Dashboard nhiều biểu đồ + lọc chéo — hướng Power BI

### Khi nào dùng

Khi cần XEM NHIỀU báo cáo (đã tạo ở "Biểu mẫu → Báo cáo", mục 8) CÙNG lúc
trên 1 màn hình, thay vì mở từng cái riêng — vào "Biểu mẫu → Dashboard" để
tạo, người dùng cuối xem ở mục "Dashboard" (menu có sẵn). Dashboard KHÔNG
định nghĩa lại nguồn dữ liệu/công thức riêng — mỗi ô ("tile") chỉ TRỎ TỚI 1
`reportId` đã có, dùng lại nguyên `visualization` đã khai ở báo cáo đó.

### Cấu trúc `DefinitionJson`

```json
{
  "tiles": [
    { "key": "doanhThuChiNhanh", "reportId": "doanhthu-chinhanh" },
    { "key": "topSanPham", "reportId": "top-san-pham", "title": "Top sản phẩm" }
  ]
}
```

- **`key`**: định danh riêng của ô trong dashboard (không trùng nhau) —
  KHÔNG phải `reportId`, vì 1 báo cáo có thể xuất hiện ở nhiều ô/dashboard
  khác nhau.
- **`reportId`**: phải khớp 1 báo cáo đã có trong "Biểu mẫu → Báo cáo" —
  lưu dashboard sẽ báo lỗi ngay nếu gõ sai/báo cáo đã bị xoá.
- **`title`** (tuỳ chọn): tên hiện trên ô — để trống thì dùng đúng `Title`
  của báo cáo nguồn.

### Quyền xem

KHÔNG có bảng phân quyền riêng cho từng dashboard/từng ô — 2 lớp quyền sẵn
có tự động áp dụng, không cần cấu hình thêm:
1. Mục menu "Dashboard" (`app.MenuItems`, mã `dashboard`) — vào được trang
   hay không do `RoleMenuAccess` như mọi mục menu khác.
2. TỪNG Ô tự lọc theo đúng `app.RoleReportAccess` của báo cáo nó trỏ tới
   (gọi thẳng `GET/POST /api/reports/:reportId` đã có sẵn, không có API
   "chạy dashboard" riêng bỏ qua bước này) — vai trò không có quyền xem 1
   báo cáo thì ô tương ứng tự BIẾN MẤT khỏi dashboard, không hiện lỗi.

### Lọc chéo (cross-filter)

Bấm vào 1 điểm/cột/lát bất kỳ trên biểu đồ (bar/line/pie) ở MỘT ô sẽ lọc
LẠI toàn bộ các ô còn lại theo đúng trường đã bấm — không cần khai báo
"ô nào lọc theo ô nào" trong `DefinitionJson`:

- Field lọc dùng ĐÚNG tên `key` đã khai trong `columns`/`xField` của báo
  cáo nguồn (vd bấm cột "Chi nhánh" trên biểu đồ tile1 → lọc chéo theo
  field `chiNhanh`).
- MỌI ô khác tự chạy lại với bộ lọc này — ô nào không khai field đó trong
  `filters` của báo cáo mình thì rp-server tự bỏ qua (không lỗi), nên
  không có gì phải cấu hình thêm ở phía tile.
- Thanh "Đang lọc chéo" phía trên hiện các field đang áp dụng, bấm ✕ từng
  cái hoặc "Xoá hết lọc" để bỏ.
- Bảng Pivot (mục 8) KHÔNG phát lọc chéo khi bấm — click trong pivot vẫn
  chỉ để drill-down (xổ dữ liệu chi tiết), tránh 1 thao tác bấm mang 2 ý
  nghĩa khác nhau gây nhầm lẫn.

## 10. Drill-through — bấm 1 điểm nhảy sang báo cáo KHÁC đã lọc sẵn

### Khác gì drill-down (mục 8, pivot)

- **Drill-down** (pivot): xổ ra dữ liệu CHI TIẾT của CÙNG báo cáo, dùng lại
  dữ liệu ĐÃ TẢI, không gọi API mới — vd bấm ô "Tổng doanh thu Q1" xem
  từng dòng gộp nên số đó.
- **Drill-through** (mục này): nhảy sang MỘT báo cáo KHÁC (đã tạo sẵn ở
  "Biểu mẫu"), tự lọc theo giá trị vừa bấm — vd bấm cột "Chi nhánh A" trên
  biểu đồ tổng quan → mở báo cáo "Danh sách đơn hàng" đã lọc sẵn theo chi
  nhánh đó.

### Cấu trúc

Thêm khoá `drillThrough` vào TRONG `visualization` đã có (mục 8):

```json
"visualization": {
  "type": "bar",
  "xField": "tenCuaHang",
  "valueFields": ["thucDat"],
  "drillThrough": { "field": "maCuaHang", "targetReportId": "chi-tiet-don-hang" }
}
```

- **`field`**: tên field LỌC ở báo cáo ĐÍCH (khớp `filters[].field` của báo
  cáo đích, KHÔNG nhất thiết trùng `xField` của báo cáo nguồn — vd nguồn
  nhóm theo tên chi nhánh để hiển thị đẹp, đích lọc theo mã chi nhánh).
- **`targetReportId`**: `ReportId` của báo cáo đích — phải là báo cáo đã có
  và người xem phải có quyền (`app.RoleReportAccess`) mới mở được, đúng
  luật phân quyền hiện có (không có đường tắt bỏ qua quyền qua drill-through).
- Giá trị lọc luôn lấy từ điểm THẬT SỰ vừa bấm trên biểu đồ nguồn.

### Chỉ áp dụng cho bar/line/pie

`drillThrough` CHỈ có tác dụng khi bấm vào 1 cột/đường/lát trên biểu đồ
bar/line/pie ở trang Báo cáo (`/reports`) — KHÔNG áp dụng cho:
- **`"kpi"`**: 1 thẻ số cộng dồn TOÀN BỘ dòng, không có 1 giá trị đơn lẻ
  nào để lọc báo cáo đích theo đó.
- **`"pivot"`**: bấm ô pivot đã dành riêng cho drill-down (xem mục 8) —
  tránh 1 thao tác bấm mang 2 ý nghĩa khác nhau.
- **Tile trong Dashboard** (mục 9): bấm biểu đồ trong dashboard đã dành
  riêng cho lọc chéo giữa các tile — `drillThrough` bị BỎ QUA nếu khai ở
  báo cáo đang dùng làm tile (không xung đột, chỉ đơn giản không áp dụng).

### Sau khi nhảy sang báo cáo đích

Trang `/reports` VẪN LÀ TRANG CŨ (không mở tab/route mới) — chỉ tự chuyển
báo cáo đang chọn + tự điền bộ lọc + tự chạy ngay (không cần bấm "Lọc" lại
lần nữa). Muốn quay lại báo cáo trước, chọn lại từ ô "Chọn báo cáo" hoặc
đổi tab như bình thường — bộ lọc đã áp SẴN vẫn sửa được tiếp qua form lọc
phía trên như mọi báo cáo khác.

---

## 11. Kết nối DSMART16 (2 nguồn Live + Lịch sử) — chuẩn bị dữ liệu rộng cho nhiều loại báo cáo

### Cách job "Theo bảng" thực sự hoạt động (đọc trước khi làm theo sổ tay dưới)

1 job "Theo bảng" = `SELECT <các cột đã tick> FROM <1 bảng/view> [JOIN <tối
đa 1 bảng/view khác cùng nguồn>] WHERE <cột watermark> > <lần đồng bộ
trước>`. Mỗi DÒNG NGUỒN đọc được biến thành ĐÚNG 1 dòng `dwh.ReportFacts`,
ghi đè theo khoá `(SourceSystem, Domain, EntityCode, EventDate)` — KHÔNG có
bước gộp/SUM nào ở tầng ETL. Vì vậy:

- **Không có khái niệm "đồng bộ hết 435 bảng"** — mỗi job vẫn là 1
  bảng/view → 1 Domain với 1 bộ Dimensions/Measures admin tự chọn, giống
  hệt cách mục 1–7 đã làm. "Lấy dữ liệu OLAP rộng cho nhiều báo cáo sau
  này" trong thực tế nghĩa là: **tick DƯ Dimensions/Measures** hơn mức 1
  báo cáo cụ thể cần (sổ tay dưới đây đã làm vậy), không phải đồng bộ toàn
  bộ schema.
- **Bảng nào có NHIỀU dòng cho cùng 1 (chi nhánh, ngày)** — vd `DSTK_INFO`
  (schema DSMART16, 1 dòng/chi nhánh/SKU/ngày, rất nhiều SKU mỗi chi
  nhánh/ngày) — **KHÔNG được trỏ job thẳng vào bảng gốc** nếu
  `EntityCode` = mã chi nhánh: mỗi dòng SKU sẽ LẦN LƯỢT ghi đè cùng 1 khoá
  `(chi nhánh, ngày)`, kết quả cuối chỉ còn số liệu của SKU đồng bộ SAU
  CÙNG trong ngày đó — SAI hoàn toàn. Bắt buộc tạo 1 **VIEW gộp sẵn theo
  đúng cấp (chi nhánh, ngày)** ngay trong DSMART16 (`SUM(...) GROUP BY
  STK_ID, WORK_DATE`), rồi trỏ job vào VIEW đó — etl-admin duyệt VIEW y hệt
  bảng thật (không cần cấu hình gì khác).

### 2 nguồn (Live + Lịch sử) tự động ghép liền mạch — không cần cấu hình gì thêm

- Mỗi **Nguồn dữ liệu** (etl.DataSources) tự có 1 `SourceSystem` riêng
  (`ds<Id>`, hệ thống tự sinh theo Id của nguồn — admin không gõ tay).
- Báo cáo (`directDb`) chỉ lọc theo `Domain`, KHÔNG lọc theo `SourceSystem`
  — nên nếu bạn tạo 2 job "Theo bảng" CÙNG `Domain` (vd `doanhthu_chinhanh`),
  1 job trỏ nguồn Live, 1 job trỏ nguồn Lịch sử, dữ liệu 2 nguồn sẽ **tự
  gộp thành 1 dải liên tục** khi báo cáo chạy — không đụng, không cần khai
  báo gì thêm, miễn 2 nguồn KHÔNG cùng ghi đè 1 (chi nhánh, ngày) — thực tế
  luôn đúng vì DB lịch sử chỉ chứa ngày cũ, DB Live chỉ chứa ngày hiện tại.
- **Điều kiện bắt buộc để dùng chung 1 Domain**: 2 DB phải cùng cấu trúc
  bảng/cột VÀ cùng quy ước mã hoá `STK_ID`/`SKU_ID` (cùng 1 chi nhánh phải
  ra cùng 1 `STK_ID` ở cả 2 DB). Nếu DB lịch sử là bản backup/clone cũ của
  chính DSMART16 — gần như chắc chắn đúng. Nếu là hệ thống khác (đổi phần
  mềm ở giai đoạn trước) — phải khai Domain riêng (vd
  `doanhthu_chinhanh_v1`) và composite báo cáo tự ghép 2 domain lại (xem
  mục 1 khối `blocks`, thêm khối `directDb` thứ 2 trỏ domain kia).

### Sổ tay theo từng nhóm báo cáo (dựa trên DSMART16_SCHEMA.json đã gửi)

Cột chính xác lấy trực tiếp từ file schema — KHÔNG suy đoán tên cột. Riêng
mối liên hệ `BU_ID` (dùng ở `TRANSHDR`/`RV_ORDER`/`DLVHDR`/`CRDTRANS`) với
`STK_ID` (dùng ở `DSTK_INFO`/`STK_INFO`/`STOCK`) chưa xác nhận được (file
schema chỉ có tên cột, không có khoá ngoại) — sổ tay dưới đây coi 2 mã này
là 2 mã KHÁC NHAU của CÙNG 1 chi nhánh (thực tế phổ biến với hệ thống nhiều
lớp như DSMART16), và dùng **"Ánh xạ mã chi nhánh"** (trang mới trên
etl-admin, xem mục "Ánh xạ mã chi nhánh khi 1 chi nhánh có nhiều mã khác
nhau" ngay dưới) để quy đổi — domain dùng `TRANSHDR`/`RV_ORDER`/`DLVHDR`/
`CRDTRANS` (EntityCode gốc là `BU_ID`) tự động ghi đúng `STK_ID`/mã siêu thị
chuẩn vào `dwh.ReportFacts`,
không cần biết trước quan hệ `BU_ID`↔`STK_ID` lúc tạo job — chỉ cần khai
đúng cặp mã trong bảng ánh xạ (đối chiếu với đội kỹ thuật DSMART16/DBA nếu
chưa chắc), sửa lại bất cứ lúc nào qua giao diện nếu mã đổi, không cần đụng
tới cấu hình job hay code.

### Ánh xạ mã chi nhánh khi 1 chi nhánh có nhiều mã khác nhau

**etl-admin → Ánh xạ mã chi nhánh** (trang mới) — khai "mã X ở nguồn nào
đó" tương ứng "mã chuẩn Y" nào, upload hàng loạt qua Excel (giống hệt cách
dùng trang **Nhập chỉ tiêu**) hoặc sửa từng dòng qua form:

| LoaiMaKhac | MaKhac | MaChuan | TenSieuThi | TrangThai |
|---|---|---|---|---|
| BU_ID | 1001 | BRGHP | Hải Phòng | |
| BU_ID | 1002 | BRGHD | Hải Dương | |

- **LoaiMaKhac**: tên tự đặt (vd `BU_ID`) — PHẢI khớp CHÍNH XÁC ô "Ánh xạ mã
  chi nhánh" chọn ở job "Theo bảng" (etl-admin → Đồng bộ) cần áp dụng.
- **MaKhac**: giá trị mã gốc ở nguồn (vd giá trị `BU_ID` thật đọc được từ
  `TRANSHDR`).
- **MaChuan**: mã chuẩn dùng làm EntityCode cuối cùng — PHẢI khớp đúng mã
  đã dùng ở domain doanh thu/tồn kho (thường là `STK_ID`/`STK_CODE` của
  bảng `STOCK`, xem mục a bên dưới).
- **TrangThai**: để trống = đang áp dụng, `DaDong` = ngừng áp dụng dòng này
  (giữ lại lịch sử, không xoá).

Khi job "Theo bảng" bật đúng "Ánh xạ mã chi nhánh" = `BU_ID`, mỗi dòng đồng
bộ tự tra bảng này (nạp 1 lần/lượt chạy, không tốn 1 truy vấn/dòng) TRƯỚC
khi ghi `dwh.ReportFacts` — mã khớp thì dùng `MaChuan`, mã CHƯA khai trong
bảng vẫn GIỮ NGUYÊN mã gốc (không rớt dòng, không chặn đồng bộ) và được ghi
cảnh báo vào log ETL (liệt kê rõ những mã chưa ánh xạ trong lượt chạy đó) để
admin biết cần bổ sung thêm dòng nào. Vì vậy có thể bật tính năng này TRƯỚC
khi khai đủ toàn bộ ~30-40 chi nhánh — bổ sung dần theo cảnh báo, không cần
chờ có đủ danh sách mới bắt đầu đồng bộ.

**a) Thông tin siêu thị (`thongtin_sieuthi`) — bảng KHÔNG phải fact, dùng để JOIN/tra cứu tên hiển thị**

- Nguồn: bảng **`STOCK`** (KHÔNG phải `NODE_DEF`/`BU_INFO` — 2 bảng đó là
  cấu hình hạ tầng hệ thống DSMART16, có cột `SRV_IP`/`UID`/`PWD`, không
  phải dữ liệu nghiệp vụ chi nhánh).
- Cột khoá gợi ý: `STK_ID` = EntityCode.
- Dimensions tick dư: `STK_CODE`, `STK_NAME`, `STK_ADDR`, `DIMENSION`
  (diện tích), `PLACE`, `PHONE`, `EMAIL`, `ISCLOSED`, `OPEN_DATE`,
  `INVENTORY`.
- Không có Measures (bảng thông tin, không phải số liệu phát sinh) —
  EventDate dùng tạm `OPEN_DATE` hoặc `MODI_DATE` (không có "ngày phát
  sinh" thật vì đây là bảng master).
- Dùng làm bảng JOIN (mục "Quy tắc chung", xem mục 3) cho các domain khác
  cần hiện tên/địa chỉ chi nhánh thay vì chỉ mã.

**b) Doanh thu theo chi nhánh (`doanhthu_chinhanh`) — mở rộng mục 1**

- Nguồn: **VIEW gộp** từ `DSTK_INFO`, vd:
  ```sql
  CREATE VIEW V_HCRC_DOANHTHU_CHINHANH AS
  SELECT STK_ID, WORK_DATE,
         SUM(TOCUST_QTY) AS SoLuongBan, SUM(TOCUST_AMT) AS DoanhThu,
         SUM(TOCUST_VAT) AS TienVAT, SUM(TOCUST_DIS) AS TienGiamGia,
         SUM(TOCUST_COM) AS HoaHong
  FROM DSTK_INFO
  GROUP BY STK_ID, WORK_DATE;
  ```
- EntityCode = `STK_ID`, EventDate = `WORK_DATE`.
- Measures: `DoanhThu`, `SoLuongBan`, `TienVAT`, `TienGiamGia`, `HoaHong`
  (dư ra so với mục 1 gốc chỉ có `doanhThu`/`giaoDich`/`laiGop` — có sẵn để
  dùng cho báo cáo khác sau này).
- **Watermark**: `DSTK_INFO` là bảng tổng hợp CUỐI NGÀY, không có cột "giờ
  cập nhật" riêng — dùng tạm `WORK_DATE` làm cột watermark (chấp nhận: số
  liệu 1 ngày chỉ được đồng bộ sau khi ngày đó đã có dữ liệu, sửa số liệu
  NGÀY CŨ sau khi đã đồng bộ sẽ KHÔNG tự cập nhật lại — cần chạy lại job
  "Đồng bộ lại từ đầu" thủ công nếu có chỉnh sửa hồi tố).

**c) Số lượng giao dịch (`giaodich_chinhanh`)**

- Nguồn: **VIEW đếm** từ `TRANSHDR` (1 dòng/giao dịch, `TRANS_NUM` là khoá):
  ```sql
  CREATE VIEW V_HCRC_GIAODICH_CHINHANH AS
  SELECT BU_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
         COUNT(*) AS SoGiaoDich, SUM(AMOUNT) AS TongTien,
         SUM(DISCOUNT) AS TongGiamGia, SUM(VAT_AMT) AS TongVAT
  FROM TRANSHDR
  WHERE STATUS <> 'X' -- loại giao dịch huỷ, đối chiếu đúng mã STATUS thật với DBA DSMART16
  GROUP BY BU_ID, CAST(TRAN_DATE AS DATE);
  ```
- Cột khoá (EntityCode) chọn `BU_ID` khi tạo job như bình thường — **BẬT
  "Ánh xạ mã chi nhánh"** ở job này (chọn đúng Loại mã đã khai, vd `BU_ID`)
  để engine tự quy đổi sang mã chuẩn (khớp `STK_ID`/mã siêu thị ở domain
  `doanhthu_chinhanh`) TRƯỚC khi ghi `dwh.ReportFacts` — xem mục "Ánh xạ mã
  chi nhánh khi 1 chi nhánh có nhiều mã khác nhau" ngay dưới đây. EventDate
  = `TRAN_DATE`.
- Measures: `SoGiaoDich`, `TongTien`, `TongGiamGia`, `TongVAT`.
- Watermark: dùng `TRAN_DATE` (cùng lý do như mục b) — nếu DSMART16 có cột
  cập nhật thật (vd `UPDATED`, đã thấy trong `TRANSHDR` nhưng chưa rõ kiểu
  dữ liệu/có phải timestamp không) thì ưu tiên dùng cột đó, chính xác hơn.

**d) Tích điểm / thẻ thành viên (`thetv_giaodich`, `thetv_hoso`)**

- **Hồ sơ thẻ** (`thetv_hoso`) — nguồn bảng **`CSCARD`** (bản đầy đủ hơn
  `CS_CARD`, có thêm `MOBI`/địa chỉ chi tiết `CITY`/`DISTRICT`/`WARD`).
  EntityCode = `CARD_ID`, Dimensions: `NAME`, `PHONE`, `MOBI`, `EMAIL`,
  `DISC_LVL`, `BIRTHDAY`, `ISS_DATE`, `STATUS`. Không có Measures (bảng
  master) — EventDate dùng `LAST_DATE` (lần giao dịch gần nhất) hoặc
  `ISS_DATE`.
- **Giao dịch tích/đổi điểm** (`thetv_giaodich`) — nguồn **VIEW gộp** từ
  `CRDTRANS` (1 dòng/lần tích hoặc đổi điểm):
  ```sql
  CREATE VIEW V_HCRC_THETV_GIAODICH AS
  SELECT BU_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
         SUM(CASE WHEN TYPE = 'A' THEN MARK ELSE 0 END) AS DiemTich,   -- đối chiếu đúng mã TYPE thật với DBA
         SUM(CASE WHEN TYPE = 'R' THEN MARK ELSE 0 END) AS DiemDoi,
         SUM(AMOUNT) AS TongTienPhatSinh, COUNT(*) AS SoLuotGiaoDich
  FROM CRDTRANS
  GROUP BY BU_ID, CAST(TRAN_DATE AS DATE);
  ```
  Cột khoá chọn `BU_ID` — cũng BẬT "Ánh xạ mã chi nhánh" ở job này như mục
  c) để quy đổi đúng mã chuẩn. EventDate = `TRAN_DATE`. (Mã `TYPE`/quy ước
  điểm âm-dương trong `CRDTRANS` cần DBA DSMART16 xác nhận trước khi dùng
  thật —
  đây chỉ là khung, không đoán đúng-sai logic nghiệp vụ điểm thưởng.)

**e) Tồn kho (`tonkho_chinhanh`)**

- Nguồn: bảng **`STK_INFO`** (tồn tức thời, đã có sẵn `M_BEGIN`/nhập/xuất
  luỹ kế trong tháng, không cần GROUP BY — 1 dòng/chi nhánh/SKU, ĐÃ đúng
  cấp thấp nhất nên KHÔNG gộp theo chi nhánh được nếu muốn giữ chi tiết SKU
  — nếu chỉ cần tồn kho THEO CHI NHÁNH (không theo SKU), vẫn phải tạo VIEW
  gộp `SUM(END_AMT) GROUP BY STK_ID`).
- EntityCode = `STK_ID` (hoặc VIEW gộp nếu bỏ chi tiết SKU), EventDate =
  `LAST_DATE` hoặc `CACL_DATE`.
- Measures: `END_AMT` (tồn cuối), `M_BEGAMT` (tồn đầu kỳ), `M_IMPAMT`
  (nhập trong kỳ), `M_EXPAMT` (xuất trong kỳ), `AVERIMPPR` (giá vốn bình
  quân).
- Watermark: `LAST_DATE`.

**f) Xuất hàng giữa các chi nhánh (`xuatkho_chinhanh`)**

- Nguồn: **VIEW gộp** từ `DLVTRANS` (chứng từ điều chuyển hàng nội bộ,
  `STK_ID` = kho/chi nhánh XUẤT, `OSTK_ID` = kho/chi nhánh NHẬN):
  ```sql
  CREATE VIEW V_HCRC_XUATKHO_CHINHANH AS
  SELECT STK_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
         SUM(QTY) AS SoLuongXuat, COUNT(DISTINCT TRANS_NUM) AS SoChungTu
  FROM DLVTRANS
  GROUP BY STK_ID, CAST(TRAN_DATE AS DATE);
  ```
- EntityCode = `STK_ID` (chi nhánh xuất), EventDate = `TRAN_DATE`.
- Measures: `SoLuongXuat`, `SoChungTu`.
- Watermark: `TRAN_DATE` (cùng hạn chế như mục b/c — `DLVTRANS` không có cột
  giờ cập nhật riêng biệt trong file schema đã gửi).

**g) Nhập hàng giữa các chi nhánh (`nhapkho_noibo_chinhanh`)**

- CÙNG bảng `DLVTRANS` như mục f) nhưng đổi chiều gộp — group theo `OSTK_ID`
  (kho/chi nhánh NHẬN) thay vì `STK_ID`:
  ```sql
  CREATE VIEW V_HCRC_NHAPKHO_NOIBO_CHINHANH AS
  SELECT OSTK_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
         SUM(QTY) AS SoLuongNhap, COUNT(DISTINCT TRANS_NUM) AS SoChungTu
  FROM DLVTRANS
  GROUP BY OSTK_ID, CAST(TRAN_DATE AS DATE);
  ```
- EntityCode = `OSTK_ID` (chi nhánh nhận) — Domain RIÊNG với mục f)
  (`nhapkho_noibo_chinhanh` ≠ `xuatkho_chinhanh`) dù cùng 1 bảng nguồn, vì
  1 chứng từ điều chuyển ĐỒNG THỜI là "xuất" của chi nhánh A và "nhập" của
  chi nhánh B — gộp chung 1 Domain sẽ cộng nhầm 2 chiều vào cùng 1 chi
  nhánh nếu chi nhánh đó vừa xuất vừa nhận trong cùng ngày.
- Measures: `SoLuongNhap`, `SoChungTu`. Watermark: `TRAN_DATE`.

**h) Nhập hàng từ nhà cung cấp (`nhaphang_nhacc`)**

- Nguồn: **VIEW gộp** từ `RV_ORDER` (chứng từ nhập hàng từ NCC — khác
  `DLVTRANS` là điều chuyển NỘI BỘ giữa các chi nhánh, bảng này có `SUPP_ID`
  = mã nhà cung cấp):
  ```sql
  CREATE VIEW V_HCRC_NHAPHANG_NHACC AS
  SELECT STK_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
         SUM(QTY) AS SoLuongNhap, SUM(AMOUNT) AS GiaTriNhap,
         SUM(VAT_AMT) AS TienVAT, COUNT(DISTINCT TRANS_NUM) AS SoChungTu,
         COUNT(DISTINCT SUPP_ID) AS SoNhaCungCap
  FROM RV_ORDER
  WHERE STATUS <> 'X' -- loại chứng từ huỷ, đối chiếu đúng mã STATUS thật với DBA
  GROUP BY STK_ID, CAST(TRAN_DATE AS DATE);
  ```
- EntityCode = `STK_ID` (chi nhánh nhận hàng), EventDate = `TRAN_DATE`.
- Measures: `SoLuongNhap`, `GiaTriNhap`, `TienVAT`, `SoChungTu`,
  `SoNhaCungCap`.
- **Watermark**: `RV_ORDER` CÓ cột `UPDATED` (thấy trong file schema) —
  ưu tiên dùng cột này thay vì `TRAN_DATE` nếu đúng là kiểu ngày/giờ cập
  nhật thật (chưa xác nhận kiểu dữ liệu chính xác) — cho phép đồng bộ
  ĐÚNG các đơn được sửa/duyệt sau khi tạo, không chỉ đơn mới tạo trong
  ngày (khác `TRAN_DATE` — vốn là ngày phát sinh, không đổi dù đơn được
  sửa sau đó).
- Muốn báo cáo theo TỪNG nhà cung cấp (không chỉ gộp theo chi nhánh) — đổi
  `GROUP BY` thêm `SUPP_ID`, và EntityCode ghép `<STK_ID>_<SUPP_ID>` (cùng
  kiểu ghép mã đã dùng ở mục 5 "Chỉ tiêu theo ngành hàng").

### Domain nâng cao — chưa dựng, cân nhắc khi cần

`STARGETS`/`STARGETS_ARC` (đã thấy trong schema, có cả `TRG_AMT` chỉ tiêu
VÀ `ACT_AMT` thực đạt trong CÙNG 1 bảng) khả năng thay thế được quy trình
nhập tay "Nhập chỉ tiêu" (mục 5) nếu DSMART16 đã tự tính chỉ tiêu/thực đạt
đáng tin cậy — CHƯA dựng domain này vì chưa xác nhận được `PRD_CODE`/
`RPS_CODE`/`GDS_CODE` trong bảng đó có khớp đúng quy ước mã chi nhánh/ngành
hàng đang dùng hay không. Cân nhắc dựng sau khi đối chiếu với DBA DSMART16,
nếu đáng tin cậy sẽ thay được bước nhập Excel thủ công hàng tháng.

### File mẫu Nguồn dữ liệu (điền tài khoản SQL rồi nhập luôn, không cần gõ form)

etl-admin đã có sẵn tính năng **Nguồn dữ liệu → Nhập từ Excel** (mục B
trong lịch sử phát triển) — chỉ cần điền `Server`/`DatabaseName`/`Username`/
`Password` thật vào file mẫu (đã dựng sẵn 2 dòng `DSMART16 - Live` và
`DSMART16 - Lich su`, còn lại điền là xong) rồi tải lên, KHÔNG cần bấm form
từng nguồn. File gốc không lưu lại phía máy chủ (đọc thẳng vào bộ nhớ, xem
`etl/lib/dataSourcesImport.js`) — chỉ cần xoá file trên máy sau khi tải
lên.
