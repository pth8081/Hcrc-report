# Hướng dẫn triển khai gộp — bản 10.46 đến 10.52 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 10.46 tới bản 10.52 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 10.45 hoặc cũ hơn
và cần bắt kịp bản mới nhất. Theo yêu cầu người dùng (gộp hướng dẫn thay
vì làm riêng từng bản).

⚠️ **Khác với các bản trước trong file này** — bản 10.52 KHÔNG thuộc tính
năng "Tồn kho toàn hệ thống" (API cho đối tác ngoài) như 10.46-10.51, mà
là 1 SỬA LỖI THẬT RIÊNG, không liên quan, ở báo cáo khác ("Doanh thu theo
ngành hàng - theo mã hàng", `rp-user`). Gộp chung vào ĐÚNG 1 file này chỉ
vì cùng là "các bản CHƯA triển khai, cần bắt kịp" tính tới thời điểm viết
— xem mục B2 (riêng) bên dưới, KHÔNG liên quan tới mục B1 (API Tồn kho).

Bản 10.46-10.50 đều thuộc CÙNG 1 tính năng: API "Tồn kho toàn hệ thống"
cung cấp cho 1 đối tác ngoài (bản 10.46 — xây API thật; bản 10.47/10.48/
10.49 — CHỈ sửa tài liệu, không đổi code/API; bản 10.50 — thêm trường mã
vạch thật, có đổi code/VIEW). Bản 10.51 — mở rộng chính file hướng dẫn
này (tài liệu). Bản 10.52 — sửa lỗi dropdown "Siêu thị" ở báo cáo khác
(xem trên). Xem đầy đủ chi tiết kỹ thuật ở `VERSION.md`,
`deploy/Nhật ký triển khai (từ bản 8.31).md`, và `api-ton-kho-cho-doi-tac.md`.

---

## Tóm tắt những gì thay đổi (10.46 → 10.52)

| Bản | Nội dung | Có cần triển khai trên server? |
|---|---|---|
| 10.46 | API mới `GET /api/v1/reports/ton-kho/run` (api-server) — tồn kho LIVE toàn hệ thống (mọi siêu thị, 1 lần gọi) cho đối tác ngoài. Thêm cột `NgayNhapGanNhat` vào VIEW tồn kho (dùng chung domain `tonkho_chitiet_sku`). `api-server` có thêm kết nối đọc riêng tới "Ánh xạ Điểm - STK_ID" để dịch mã kho → Mã Điểm/Tên siêu thị. `reportEngine.js` (cả rp-server và api-server) đọc thêm được cột `syncedAt`. | **CÓ** — xem mục B1 |
| 10.47 | Chốt dùng TẠM `maHang` (mã 10 số) thay cho mã vạch trong API trên — chỉ sửa chữ trong `api-ton-kho-cho-doi-tac.md`, không đổi code/API. (Quyết định này đã bị THAY THẾ bởi bản 10.50 — mã vạch thật đã có, không cần dùng tạm nữa.) | KHÔNG — chỉ cần `git pull` |
| 10.48 | Bổ sung dòng báo cáo `ton-kho` vào bảng "Danh mục báo cáo" trong `hướng_dẫn_báo_cáo.md` (thiếu sót khi làm bản 10.46, theo quy ước bắt buộc ở `CLAUDE.md`) — chỉ sửa tài liệu. | KHÔNG — chỉ cần `git pull` |
| 10.49 | Thêm file hướng dẫn triển khai gộp này (gộp 10.46-10.48) — chỉ sửa tài liệu. File này chính là bản ĐÃ MỞ RỘNG thêm bản 10.50-10.52. | KHÔNG — chỉ cần `git pull` |
| 10.50 | Thêm trường **mã vạch thật** `maVach` vào API trên — xác nhận bằng dữ liệu thật (DBA chạy `SELECT TOP 5 * FROM dbo.SKU_DEF`): cột `SKU_DEF.BARCODE` là mã EAN-13 thật, `SKU_DEF.UPC_CODE` rỗng nên không dùng. Thêm cột `MaVach` vào VIEW tồn kho (dùng lại `SKU_DEF` đã JOIN sẵn, không JOIN thêm bảng). | **CÓ** — đã GỘP CHUNG vào đúng 3 bước B1.1/B1.2/B1.6 bên dưới (cùng file/script với bản 10.46, không có bước riêng) |
| 10.51 | Đổi tên + mở rộng file hướng dẫn triển khai gộp này (10.46→10.48 thành 10.46→10.50) — chỉ sửa tài liệu. | KHÔNG — chỉ cần `git pull` |
| 10.52 | **SỬA LỖI THẬT, KHÔNG liên quan API Tồn kho** — dropdown "Siêu thị" ở báo cáo "Doanh thu theo ngành hàng (HCRC/LDTD) - theo mã hàng" (`rp-user`, menu "Báo cáo Mua hàng") hiện `"<mã> (chưa khai tên)"` cho MỌI mã dù "Ánh xạ Điểm - STK_ID" đã khai đủ — do `STK_ID` đọc ra dính khoảng trắng đệm cuối (CHAR cố định độ dài), không khớp tuyệt đối khi so sánh trong JS. | **CÓ** — xem mục B2 (RIÊNG, không chung với mục B1) |

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

## B1. API "Tồn kho toàn hệ thống" (bản 10.46 + 10.50 — theo ĐÚNG THỨ TỰ)

### B1.1. DSMART16 — chạy lại VIEW tồn kho

```sql
-- Chạy trên CSDL DSMART16
-- File: deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql
```
File này ở bản 10.50 đã gộp SẴN cả 2 cột mới: `NgayNhapGanNhat` (bản
10.46 — OUTER APPLY riêng, chỉ `TRANS_CODE` `133`/`333`, đúng "nhập hàng"
không lẫn "đặt hàng") và `MaVach` (bản 10.50 — `NULLIF(RTRIM(k.BARCODE),
'')`, dùng lại `SKU_DEF` đã JOIN sẵn). Chạy 1 LẦN DUY NHẤT là đủ cho cả
2 bản. An toàn chạy lại nhiều lần, không ảnh hưởng báo cáo "Tồn kho chi
tiết" nội bộ đang dùng VIEW này.

### B1.2. Đồng bộ lại cột mới (thư mục `etl/`)

```bash
node scripts/seedTonKhoChiTietSync.js
```
Script này ở bản 10.50 đã gộp SẴN cả 2 cột — cập nhật job "Tồn kho Chi
tiết theo SKU - Live (DSMART16)", thêm `NgayNhapGanNhat` và `MaVach` vào
danh sách cột đồng bộ. Chạy 1 LẦN DUY NHẤT là đủ cho cả 2 bản.

### B1.3. Cấp quyền đọc "Ánh xạ Điểm - STK_ID" cho `api-server` (nếu cần)

Nếu `api-server` kết nối CÙNG 1 SQL Server instance với `rp-server` (nơi
đang chứa `etl.DiemStkMapping`) thì **BỎ QUA bước này** — login
`etl_diem_stk_reader` đã có sẵn, dùng CHUNG được (chỉ đọc).

Nếu `api-server` chạy trên server/instance SQL Server KHÁC, chạy lại:
```sql
-- etl-db/grants.sql
```
để tạo login `etl_diem_stk_reader` (chỉ đọc) trên instance đó.

### B1.4. Điền `.env` cho `api-server`

Thêm block `ETL_DIEM_STK_*` vào `.env` của `api-server` (xem
`api-server/.env.example` để biết đủ tên biến) — trỏ ĐÚNG server/database
đang chứa `etl.DiemStkMapping`. **Thiếu bước này không lỗi 500** — cột
`tenSieuThi` sẽ chỉ hiện `"<mã kho> (chưa khai tên)"` cho mọi dòng.

### B1.5. Khởi động lại `api-server`

```bash
pm2 restart api-server   # đúng tên tiến trình thật trên server
```

### B1.6. Tạo báo cáo `ton-kho` trong `api.ReportCatalog`

```bash
# thư mục api-server/
node scripts/seedTonKhoReport.js
```
Idempotent — chạy lại nhiều lần an toàn (UPDATE nếu đã có, INSERT nếu chưa).
Script này ở bản 10.50 đã thêm SẴN cột `maVach` vào định nghĩa báo cáo —
**BẮT BUỘC chạy lại bước này sau B1.1/B1.2**, nếu không `maVach` sẽ luôn
trả về `null` dù VIEW/ETL đã có dữ liệu.

### B1.7. Gán quyền gọi báo cáo cho đúng đối tác

Vào **api-admin** → "Đối tác" → đúng đối tác cần dùng → "Báo cáo được
gọi" → tick **"Tồn kho toàn hệ thống"**. Mặc định KHÔNG đối tác nào gọi
được, dù API key có scope `reports` hợp lệ.

Không cần động tới `rp-server`/`rp-user`/`etl-admin` ở nhóm bản 10.46-10.50
(bản 10.46 chỉ đổi file `lib/reportEngine.js` của rp-server để DÙNG CHUNG
code với api-server — thêm khả năng đọc cột `syncedAt`, nhưng KHÔNG có
báo cáo nội bộ nào dùng tới cột này ở nhóm bản này, nên không bắt buộc
restart rp-server ngay; restart lần tới khi rp-server đổi vì lý do khác
là đủ — ĐÚNG lúc restart cho B2 bên dưới). Bản 10.50 KHÔNG cần restart
`api-server` — chỉ đổi định nghĩa cột đọc (`DimensionColumnsJson`/
`DefinitionJson`), 2 job/báo cáo tự đọc lại ở lượt chạy/gọi API kế tiếp
sau B1.2/B1.6.

---

## B2. Sửa dropdown "Siêu thị" (bản 10.52 — RIÊNG, không liên quan API Tồn kho)

Chỉ 1 bước — không cần đổi CSDL/ETL gì:

```bash
pm2 restart rp-server   # đúng tên tiến trình thật trên server
```

(`git pull` đã lấy code mới ở mục A — chỉ cần restart `rp-server` để nạp
bản vá, KHÔNG cần động tới `rp-user`/`etl-admin`/`api-server`/`etl`.)

---

## C. Kiểm tra sau khi triển khai

- [ ] **(10.46/10.50)** Gọi thử API:
  ```bash
  curl "http://localhost:<port>/api/v1/reports/ton-kho/run?pageSize=5" \
    -H "X-API-Key: <api key thật của đối tác đã gán quyền ở B1.7>"
  ```
  Phải thấy đủ 12 cột (`maNganhHang`, `tenNganhHang`, `maHang`, `tenHang`,
  `maVach`, `soLuongTon`, `maKho`, `maDiem`, `tenSieuThi`, `ngay`,
  `ngayNhapGanNhat`, `capNhatLuc`).
- [ ] **(10.46)** `tenSieuThi` hiện TÊN THẬT, không phải mã kho trần hay
  "(chưa khai tên)" ở MỌI dòng — nếu hiện "(chưa khai tên)" cho mọi dòng,
  kiểm tra lại bước B1.3-B1.4 (`.env`/quyền đọc `etl.DiemStkMapping`).
- [ ] **(10.46)** `ngayNhapGanNhat` có giá trị (không `null` toàn bộ) cho
  các mã hàng có lịch sử nhập hàng gần đây — `null` là bình thường với
  mã hàng chưa từng nhập (hàng tồn từ trước khi hệ thống theo dõi được).
- [ ] **(10.50)** `maVach` có giá trị (mã 13 số, chuẩn EAN-13) ở các mặt
  hàng đã khai mã vạch — `null` là bình thường với mặt hàng chưa khai.
  Nếu `maVach` trả về `null` cho MỌI dòng dù VIEW/SQL Server đã có dữ
  liệu, kiểm tra lại đã chạy B1.6 (`seedTonKhoReport.js`) SAU B1.1/B1.2 chưa.
- [ ] **(10.48)** Mở `hướng_dẫn_báo_cáo.md` mục 17 "Danh mục báo cáo" —
  phải thấy dòng `ton-kho` trỏ sang `api-ton-kho-cho-doi-tac.md`.
- [ ] **(10.50)** Mở `api-ton-kho-cho-doi-tac.md` — mục 4 có trường
  `maVach` riêng (mã vạch thật), `maHang` không còn ghi "tạm thay mã
  vạch" nữa (quyết định bản 10.47 đã được thay thế).
- [ ] **(10.52)** Mở báo cáo "Doanh thu theo ngành hàng (HCRC/LDTD) - theo
  mã hàng" (`rp-user` → "Báo cáo Mua hàng") → bộ lọc "Siêu thị" → PHẢI
  hiện tên thật (không còn `"(chưa khai tên)"` cho các mã đã khai tên
  trong "Ánh xạ Điểm - STK_ID"). Nếu vẫn thấy kết quả cũ, đợi tối đa 2
  giờ (cache) hoặc xác nhận đã restart `rp-server` ở B2 chưa.

  ⚠️ Lưu ý — bản 10.52 CHỈ sửa đúng lỗi dropdown nêu trên. Vấn đề KHÁC
  "báo cáo ra 'Không có dữ liệu'" (đã báo cáo riêng, xem `VERSION.md` bản
  10.52) **CHƯA được sửa ở đây** — cần kiểm tra job đồng bộ
  `doanhthu_sku_nganhhang` trên etl-admin trước (xem
  `bc-doanh-thu-sku-nganhhang.md`), KHÔNG liên quan tới bước B2.

Không có bước nào ở các bản này làm mất dữ liệu đã có — bản 10.46/10.50
thuần THÊM cột/kết nối/báo cáo mới (không đổi/xoá gì đang có), bản
10.47/10.48/10.49/10.51 thuần sửa tài liệu, bản 10.52 chỉ sửa lại cách
so khớp tên (không đổi dữ liệu nào đã lưu).
