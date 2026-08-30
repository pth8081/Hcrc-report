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
    { "key": "tyLeLFL", "label": "Tỷ lệ % LFL", "formula": "ROUND((current.measures.doanhThu - lastYear.measures.doanhThu) / lastYear.measures.doanhThu * 100, 1)" }
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
