# Hướng dẫn triển khai gộp — bản 10.46 đến 10.48 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 10.46 tới bản 10.48 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 10.45 hoặc cũ hơn
và cần bắt kịp bản mới nhất. Theo yêu cầu người dùng (gộp hướng dẫn thay
vì làm riêng từng bản).

Cả 3 bản đều thuộc CÙNG 1 tính năng: API "Tồn kho toàn hệ thống" cung cấp
cho 1 đối tác ngoài (bản 10.46 — xây API thật; bản 10.47/10.48 — CHỈ sửa
tài liệu, không đổi code/API). Xem đầy đủ chi tiết kỹ thuật ở `VERSION.md`,
`deploy/Nhật ký triển khai (từ bản 8.31).md`, và `api-ton-kho-cho-doi-tac.md`.

---

## Tóm tắt những gì thay đổi (10.46 → 10.48)

| Bản | Nội dung | Có cần triển khai trên server? |
|---|---|---|
| 10.46 | API mới `GET /api/v1/reports/ton-kho/run` (api-server) — tồn kho LIVE toàn hệ thống (mọi siêu thị, 1 lần gọi) cho đối tác ngoài. Thêm cột `NgayNhapGanNhat` vào VIEW tồn kho (dùng chung domain `tonkho_chitiet_sku`). `api-server` có thêm kết nối đọc riêng tới "Ánh xạ Điểm - STK_ID" để dịch mã kho → Mã Điểm/Tên siêu thị. `reportEngine.js` (cả rp-server và api-server) đọc thêm được cột `syncedAt`. | **CÓ** — xem mục B |
| 10.47 | Chốt dùng TẠM `maHang` (mã 10 số) thay cho mã vạch (mã 12 số) trong API trên — chỉ sửa chữ trong `api-ton-kho-cho-doi-tac.md`, không đổi code/API. | KHÔNG — chỉ cần `git pull` |
| 10.48 | Bổ sung dòng báo cáo `ton-kho` vào bảng "Danh mục báo cáo" trong `hướng_dẫn_báo_cáo.md` (thiếu sót khi làm bản 10.46, theo quy ước bắt buộc ở `CLAUDE.md`) — chỉ sửa tài liệu. | KHÔNG — chỉ cần `git pull` |

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

## B. Các bước triển khai (chỉ bản 10.46 cần — theo ĐÚNG THỨ TỰ)

### B1. DSMART16 — chạy lại VIEW tồn kho

```sql
-- Chạy trên CSDL DSMART16
-- File: deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql
```
Thêm cột `NgayNhapGanNhat` (OUTER APPLY riêng, chỉ `TRANS_CODE` `133`/`333`
— đúng "nhập hàng", không lẫn "đặt hàng"). An toàn chạy lại nhiều lần,
không ảnh hưởng báo cáo "Tồn kho chi tiết" nội bộ đang dùng VIEW này.

### B2. Đồng bộ lại cột mới (thư mục `etl/`)

```bash
node scripts/seedTonKhoChiTietSync.js
```
Cập nhật job "Tồn kho Chi tiết theo SKU - Live (DSMART16)" — thêm
`NgayNhapGanNhat` vào danh sách cột đồng bộ.

### B3. Cấp quyền đọc "Ánh xạ Điểm - STK_ID" cho `api-server` (nếu cần)

Nếu `api-server` kết nối CÙNG 1 SQL Server instance với `rp-server` (nơi
đang chứa `etl.DiemStkMapping`) thì **BỎ QUA bước này** — login
`etl_diem_stk_reader` đã có sẵn, dùng CHUNG được (chỉ đọc).

Nếu `api-server` chạy trên server/instance SQL Server KHÁC, chạy lại:
```sql
-- etl-db/grants.sql
```
để tạo login `etl_diem_stk_reader` (chỉ đọc) trên instance đó.

### B4. Điền `.env` cho `api-server`

Thêm block `ETL_DIEM_STK_*` vào `.env` của `api-server` (xem
`api-server/.env.example` để biết đủ tên biến) — trỏ ĐÚNG server/database
đang chứa `etl.DiemStkMapping`. **Thiếu bước này không lỗi 500** — cột
`tenSieuThi` sẽ chỉ hiện `"<mã kho> (chưa khai tên)"` cho mọi dòng.

### B5. Khởi động lại `api-server`

```bash
pm2 restart api-server   # đúng tên tiến trình thật trên server
```

### B6. Tạo báo cáo `ton-kho` trong `api.ReportCatalog`

```bash
# thư mục api-server/
node scripts/seedTonKhoReport.js
```
Idempotent — chạy lại nhiều lần an toàn (UPDATE nếu đã có, INSERT nếu chưa).

### B7. Gán quyền gọi báo cáo cho đúng đối tác

Vào **api-admin** → "Đối tác" → đúng đối tác cần dùng → "Báo cáo được
gọi" → tick **"Tồn kho toàn hệ thống"**. Mặc định KHÔNG đối tác nào gọi
được, dù API key có scope `reports` hợp lệ.

Không cần động tới `rp-server`/`rp-user`/`etl-admin` ở cả 3 bản này (bản
10.46 chỉ đổi file `lib/reportEngine.js` của rp-server để DÙNG CHUNG code
với api-server — thêm khả năng đọc cột `syncedAt`, nhưng KHÔNG có báo cáo
nội bộ nào dùng tới cột này ở bản này, nên không bắt buộc restart
rp-server ngay; restart lần tới khi rp-server đổi vì lý do khác là đủ).

---

## C. Kiểm tra sau khi triển khai

- [ ] **(10.46)** Gọi thử API:
  ```bash
  curl "http://localhost:<port>/api/v1/reports/ton-kho/run?pageSize=5" \
    -H "X-API-Key: <api key thật của đối tác đã gán quyền ở B7>"
  ```
  Phải thấy đủ 11 cột (`maNganhHang`, `tenNganhHang`, `maHang`, `tenHang`,
  `soLuongTon`, `maKho`, `maDiem`, `tenSieuThi`, `ngay`, `ngayNhapGanNhat`,
  `capNhatLuc`).
- [ ] **(10.46)** `tenSieuThi` hiện TÊN THẬT, không phải mã kho trần hay
  "(chưa khai tên)" ở MỌI dòng — nếu hiện "(chưa khai tên)" cho mọi dòng,
  kiểm tra lại bước B3-B4 (`.env`/quyền đọc `etl.DiemStkMapping`).
- [ ] **(10.46)** `ngayNhapGanNhat` có giá trị (không `null` toàn bộ) cho
  các mã hàng có lịch sử nhập hàng gần đây — `null` là bình thường với
  mã hàng chưa từng nhập (hàng tồn từ trước khi hệ thống theo dõi được).
- [ ] **(10.47)** Mở `api-ton-kho-cho-doi-tac.md` — mục 4 ghi rõ `maHang`
  "dùng làm mã định danh chính, tạm thay cho mã vạch (đã xác nhận với đối
  tác)", không còn ghi "chưa có, sẽ cập nhật sau".
- [ ] **(10.48)** Mở `hướng_dẫn_báo_cáo.md` mục 17 "Danh mục báo cáo" —
  phải thấy dòng `ton-kho` trỏ sang `api-ton-kho-cho-doi-tac.md`.

Không có bước nào ở 3 bản này làm mất dữ liệu đã có — bản 10.46 thuần
THÊM cột/kết nối/báo cáo mới (không đổi/xoá gì đang có), bản 10.47/10.48
thuần sửa tài liệu.
