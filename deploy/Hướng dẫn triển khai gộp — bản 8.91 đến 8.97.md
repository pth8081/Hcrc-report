# Hướng dẫn triển khai gộp — bản 8.91 đến 8.97 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 8.91 tới bản 8.97 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 8.90 và cần bắt
kịp bản mới nhất — KHÔNG lặp lại toàn bộ lịch sử từ bản 8.29 (xem
`deploy/Hướng dẫn triển khai gộp — bản 8.29 đến 8.90.md` nếu cần dựng
server hoàn toàn mới từ đầu).

Gồm 5 phần ĐỘC LẬP, làm phần nào cũng được, không phụ thuộc nhau (riêng
Phần 3 chỉ có ý nghĩa SAU KHI đã làm Phần 1):
- **Phần 1 (mục B-F)** — bản 8.91/8.92/8.93: kích hoạt LẦN ĐẦU 3 báo cáo
  "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận" (gồm cả bước tạo VIEW
  trên DSMART16) — tài liệu đầy đủ: `bc-don-dat-hang.md` (gốc repo).
- **Phần 2 (mục G-H)** — bản 8.94: Vân tay/Face ID cho mọi user + Ma trận
  phân quyền báo cáo + nút "Sửa" người dùng sửa được Email (3 app).
- **Phần 3 (mục I-J)** — bản 8.95: hiện tên nhà cung cấp thật (JOIN bảng
  `SUPPLIER`) + bộ lọc "Nhà cung cấp" cho 3 báo cáo ở Phần 1.
- **Phần 4 (mục K-L)** — bản 8.96: email báo cáo doanh thu chọn được cột
  + màu giống hệt PDF/Excel, bảng báo cáo doanh thu dãn dòng/nét hơn.
- **Phần 5 (mục M-N)** — bản 8.97: khung kẻ mảnh bảng web (khớp Excel/
  PDF/email) + ô "Cột hiển thị" MỚI cho xem/xuất báo cáo doanh thu.

---

## Tóm tắt những gì thay đổi (8.91 → 8.97)

| Bản | Nội dung |
|---|---|
| 8.91 | Sửa thiết kế dùng SAI mã `STK_ID` → đổi đúng sang `BU_ID` (đối chiếu "quy tắc mã BU_ID và STK_ID.md") |
| 8.92 | Chốt nguồn dữ liệu THẬT là `STRANS` (thay giả định ban đầu `ST_ORDER`) — `TRANS_CODE` 133=đặt hàng/333=nhập hàng, mỗi loại 1 dòng riêng, cột `REF`=mã đơn hàng gốc dùng gộp nhiều lần nhận hàng |
| 8.93 | Sửa 2 lỗi lộ ra khi chạy VIEW thật lần đầu: `STRANS` không có cột `PRICE` (tính `DonGia` từ `AMOUNT/QTY`), watermark `STOPED_DT` NULL hết (đổi dùng `EventDate`) |
| 8.94 | Vân tay/Face ID cho MỌI user (trước chỉ Admin hệ thống) + tab "Ma trận phân quyền báo cáo" (rp-user) + nút "Sửa" người dùng sửa được Email (3 app) |
| 8.95 | Hiện tên nhà cung cấp thật (JOIN bảng `SUPPLIER`, trước để trống) + thêm cột mã NCC + bộ lọc "Nhà cung cấp" cho 3 báo cáo Đơn đặt/Nhập hàng/So sánh |
| 8.96 | Email báo cáo doanh thu chọn được cột đưa vào nội dung + màu giống hệt PDF/Excel (dùng chung bộ màu bản 8.58); bảng web báo cáo doanh thu dãn dòng + font nét hơn |
| 8.97 | Khung kẻ mảnh cho bảng web báo cáo doanh thu (khớp Excel/PDF/email, đã có sẵn từ trước); xác nhận làm tròn số body email khớp Excel/PDF; ô "Cột hiển thị" MỚI ở trang xem báo cáo — ẩn/chọn cột khi xem web hoặc xuất Excel/PDF |

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

# PHẦN 1 — Báo cáo Đơn đặt/Nhập hàng (bản 8.91-8.93)

## B. Tạo VIEW trên DSMART16 (BẮT BUỘC, làm TRƯỚC — 1 LẦN DUY NHẤT, TRUNG TÂM)

Chạy NGUYÊN VĂN file `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So
sánh (DSMART16 trung tâm).sql` trên CSDL DSMART16 **trung tâm** (KHÁC
VIEW đồng bộ dữ liệu thành viên — VIEW này chạy **1 LẦN DUY NHẤT**, không
phải mỗi siêu thị 1 lần, vì đơn đặt/nhập hàng đã nằm chung 1 CSDL trung
tâm, phân biệt bằng cột `BU_ID`).

An toàn chạy lại nhiều lần (`CREATE OR ALTER VIEW`) — nếu server đã chạy
bản VIEW cũ (trước bản 8.93, còn dùng cột `PRICE`), chạy lại file MỚI
NHẤT này để thay thế, không cần xoá VIEW cũ trước.

(Tuỳ chọn) Kiểm tra có dữ liệu thật trước khi qua bước C:
```sql
SELECT TOP 20 * FROM dbo.vw_DonDatHangChiNhanh ORDER BY EventDate DESC;
```

## C. Tạo job đồng bộ (BẮT BUỘC, chạy trên máy chủ ETL)

Cần sẵn 3 biến môi trường trong `etl/.env` (dùng LẠI được nếu máy chủ đã
chạy báo cáo doanh thu cuối ngày/tồn kho từ DSMART16 — không cần khai
thêm):
```
DSMART16_SERVER=...
DSMART16_USER=...
DSMART16_PASSWORD=...
```

Rồi chạy:
```bash
cd etl
node scripts/seedDonDatHangSync.js
```

Script tự đối chiếu VIEW với schema thật, DỪNG LẠI và báo lỗi rõ ràng nếu
thiếu cột (không tạo job cấu hình sai âm thầm) — không cần khởi động lại
`hcrc-etl`, scheduler tự nạp job mới trong tối đa 60 giây.

## D. Đăng ký 3 báo cáo (BẮT BUỘC, chạy trên máy chủ report)

```bash
cd rp-server
node scripts/seedPurchaseOrderReports.js
```

Menu "Báo cáo Mua hàng" (`reports-mua-hang`) đã có sẵn trong
`rp-db/schema.sql`, script tự dùng đúng menu này — không cần tạo thêm.
Không cần restart `hcrc-rp-server` (script chỉ ghi dữ liệu catalog, không
đổi code đang chạy).

## E. Gán quyền xem (BẮT BUỘC, làm tay — 2 script trên KHÔNG tự gán)

Vào **Hệ thống → Phân quyền** (etl-admin hoặc rp-user, tuỳ nơi quản lý
phân quyền báo cáo), gán quyền xem 3 `ReportId` sau cho đúng vai trò/
người dùng cần xem (từ bản 8.94 có thể dùng tab "Ma trận" để gán nhanh
nhiều vai trò cùng lúc, xem mục H):

- `bc-don-dat-hang` ("Đơn đặt hàng")
- `bc-don-nhap-hang` ("Đơn nhập hàng")
- `bc-so-sanh-dat-nhan` ("So sánh đặt–nhận")

## F. Kiểm tra Phần 1 sau khi triển khai

- [ ] **(8.91/8.92, mã siêu thị)** Siêu thị nào KHÔNG hiện trong báo cáo
  dù có đơn hàng thật → kiểm tra đã khai đủ cột `BuId` (tường minh, KHÔNG
  tự suy "+00") trong bảng "Ánh xạ Điểm - STK_ID" cho đúng mã `BU_ID` đó
  chưa.
- [ ] **(8.93, cột PRICE)** `SELECT TOP 20 * FROM
  dbo.vw_DonDatHangChiNhanh` → cột `DonGia` ra số hợp lý (không phải
  NULL/0 toàn bộ) — nếu VIEW chưa chạy lại bản mới (còn bản cũ dùng
  `PRICE`), câu `SELECT` sẽ báo lỗi `Invalid column name 'PRICE'`, quay
  lại bước B.
- [ ] **(8.93, watermark)** Sau khi job đồng bộ chạy ít nhất 1 lần (chờ
  tối đa 15 phút) — vào etl-admin → "Đồng bộ" → job "Đơn đặt hàng - nhập
  hàng (DSMART16)" → số dòng đồng bộ > 0 (KHÔNG phải "0 dòng" lặp lại mãi
  — đó là dấu hiệu watermark vẫn còn dùng cột NULL).
- [ ] **(chung)** rp-user → menu "Báo cáo Mua hàng" → mở cả 3 báo cáo →
  có số liệu, đúng tên siêu thị; báo cáo "So sánh đặt–nhận" → 1 đơn được
  nhận NHIỀU LẦN → cột "SL thực nhận" CỘNG DỒN đúng tổng các lần nhận
  (không chỉ lấy lần nhận gần nhất).

**Còn CHƯA xác nhận, KHÔNG chặn việc triển khai**: mã trạng thái mới
`TrangThai = 'N'` (ngoài C/P/F/M/D/E đã biết) hiện tạm nhãn mã thô;
`DonGia` tính từ `AMOUNT/QTY` nên đối chiếu thêm với cách hiểu "đơn giá"
thực tế trên phiếu giấy cho 2 loại giao dịch 133/333.

---

# PHẦN 2 — Vân tay mọi user + Ma trận phân quyền + Sửa Email (bản 8.94)

## G. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A).
2. **CHỈ nếu muốn etl-admin/api-admin cũng sửa được Email** (rp-user
   KHÔNG cần bước này — cột Email đã có sẵn từ trước ở `app.Users`): chạy
   lại NGUYÊN VĂN `etl-db/schema.sql` trên CSDL ETL và `api-db/schema.sql`
   trên CSDL API — an toàn chạy lại nhiều lần, script tự kiểm tra
   `COL_LENGTH('admin.AdminUsers', 'Email')`, CHỈ thêm cột mới nếu CHƯA
   có, KHÔNG đụng dữ liệu tài khoản cũ (Email mặc định NULL cho tài khoản
   có sẵn).
3. Build lại cả 3 frontend:
   ```bash
   cd rp-user && npm run build && cd ..
   cd etl-admin && npm run build && cd ..
   cd api-admin && npm run build && cd ..
   ```
   Copy TOÀN BỘ `dist/` lên đúng vị trí phục vụ tĩnh như mọi lần trước.
4. Restart backend:
   ```bash
   pm2 restart hcrc-rp-server
   pm2 restart hcrc-etl hcrc-api-server
   ```
   `hcrc-rp-server` — thêm 3 route đọc ma trận mới. `hcrc-etl`/
   `hcrc-api-server` — route GET/PUT users đổi, thêm Email (bỏ qua nếu đã
   bỏ qua bước 2 ở trên).

## H. Kiểm tra Phần 2 sau khi triển khai

- [ ] **(Vân tay mọi user)** Đăng nhập bằng 1 tài khoản KHÔNG phải Admin
  hệ thống → "Tài khoản của tôi" → thấy mục "Bảo mật — Vân tay / Face ID"
  (TRƯỚC ĐÂY không thấy), KHÔNG thấy mục "Xác thực hai yếu tố" (vẫn chỉ
  dành cho Admin hệ thống) → đăng ký 1 thiết bị → đăng xuất → màn hình
  đăng nhập → nút "Dùng vân tay/Face ID" vào thẳng, không hỏi mật khẩu.
- [ ] **(Ma trận phân quyền)** rp-user → "Phân quyền" → tab "Ma trận" →
  cả 3 tab con ("Theo Nhóm"/"Theo Người dùng"/"Ma trận Dashboard") tải
  được dữ liệu → bấm 1 ô đổi đúng trạng thái NGAY (không cần F5, không
  cần bấm "Lưu" riêng) → mở lại tab "Vai trò"/"Người dùng" cũ → quyền vừa
  đổi ở ma trận PHẢN ÁNH đúng (2 nơi dùng CHUNG 1 dữ liệu).
- [ ] **(Sửa Email, rp-user)** "Phân quyền" → "Người dùng" → nút "Sửa" →
  đổi Email → Lưu → cột Email trong bảng cập nhật đúng.
- [ ] **(Sửa Email, etl-admin/api-admin — CHỈ nếu đã làm bước 2)**
  "Phân quyền" → nút "Sửa" → modal nay có thêm ô Email → sửa được, lưu
  đúng, cột Email hiện trong bảng danh sách.

Không có bước nào ở Phần 2 làm mất dữ liệu đã có hoặc ảnh hưởng báo cáo/
job đồng bộ khác đang chạy ổn định — cột `Email` mới ở `etl-db`/`api-db`
chỉ THÊM, không đổi/xoá cột nào có sẵn.

---

# PHẦN 3 — Tên nhà cung cấp thật + bộ lọc NCC (bản 8.95)

**Điều kiện**: đã làm xong Phần 1 (3 báo cáo đã kích hoạt, có số liệu) —
nếu chưa, làm Phần 1 trước, Phần 3 chỉ bổ sung thêm cho 3 báo cáo đó.

## I. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A).
2. Chạy lại NGUYÊN VĂN `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So
   sánh (DSMART16 trung tâm).sql` trên DSMART16 trung tâm (an toàn chạy
   lại nhiều lần, `CREATE OR ALTER VIEW`) — thêm `LEFT JOIN` bảng
   `SUPPLIER` lấy tên NCC thật.
3. Trên máy chủ report:
   ```bash
   cd rp-server
   node scripts/seedPurchaseOrderReports.js
   ```
   Script cập nhật lại định nghĩa 3 báo cáo (thêm cột mã NCC + bộ lọc
   "Nhà cung cấp") — KHÔNG cần restart `hcrc-rp-server` (chỉ ghi catalog).
4. KHÔNG cần chạy lại `node scripts/seedDonDatHangSync.js` (etl/) — cột
   `MaNCC` đã đồng bộ sẵn từ bản 8.92, chỉ thiếu hiển thị ở tầng báo cáo.

## J. Kiểm tra Phần 3 sau khi triển khai

- [ ] rp-user → "Đơn đặt hàng"/"Đơn nhập hàng" → cột "Nhà cung cấp" hiện
  TÊN THẬT (không còn trống như trước) + có thêm cột mã NCC.
- [ ] Mở bộ lọc "Nhà cung cấp" → dropdown hiện danh sách NCC THẬT (gõ tìm
  được, không phải danh sách cố định) → chọn 1 NCC → bảng chỉ còn đúng
  đơn hàng của NCC đó.
- [ ] Nếu cột "Nhà cung cấp" VẪN trống sau khi làm xong bước I.2-I.3 →
  kiểm tra VIEW đã chạy lại bản MỚI NHẤT chưa (`SELECT TOP 5 MaNCC,
  TenNCC FROM dbo.vw_DonDatHangChiNhanh WHERE TenNCC IS NOT NULL` phải ra
  kết quả) — nếu vẫn trống hết, có thể mã `SUPP_ID` trong `STRANS` không
  khớp được dòng nào trong `SUPPLIER` (dữ liệu cũ/NCC đã xoá), báo lại để
  kiểm tra thêm.

Không có bước nào ở Phần 3 làm mất dữ liệu đã có — chỉ JOIN THÊM thông
tin, không đổi cấu trúc bảng nguồn nào.

---

# PHẦN 4 — Email báo cáo chọn cột + màu PDF/Excel, bảng doanh thu dãn dòng (bản 8.96)

## K. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A).
2. Chạy lại NGUYÊN VĂN `rp-db/schema.sql` trên CSDL report (an toàn chạy
   lại nhiều lần — chỉ thêm cột `BodyColumnKeysJson` mới vào
   `app.ReportEmailSchedules` nếu CHƯA có, không đụng lịch gửi cũ).
3. `cd rp-user && npm run build`. Copy TOÀN BỘ `dist/` lên vị trí phục vụ
   tĩnh như mọi lần trước.
4. `pm2 restart hcrc-rp-server`.

## L. Kiểm tra Phần 4 sau khi triển khai

- [ ] rp-user → "Báo cáo" → mở 1 trong 4 báo cáo "Doanh thu cuối ngày"
  (HCRC/LĐTĐ, cả bản Thành viên) → bảng giãn dòng rõ hơn, chữ nét hơn so
  với trước → cuộn dọc trong khối bảng → 2 dòng tiêu đề nhóm màu (vd
  "Doanh thu"/"Lãi gộp"/"Giao dịch") vẫn dính đúng khi cuộn, KHÔNG dòng
  nào đè lên dòng nào.
- [ ] "Lịch gửi email báo cáo" → chọn 1 trong 4 báo cáo doanh thu → "Cách
  gửi" = "Bảng ngay trong nội dung email" → thấy ô MỚI "Cột hiển thị
  trong bảng" → chọn vài cột (bỏ bớt 1 vài cột, kể cả bỏ HẾT cột của 1
  nhóm màu như "Lãi gộp") → "Tạo lịch" (hoặc "Lưu" nếu sửa lịch có sẵn) →
  bấm "Gửi ngay" → kiểm tra hộp thư người nhận: CHỈ đúng các cột đã chọn,
  nhóm bị bỏ hết cột tự ẩn khỏi tiêu đề, màu nhóm/dòng Tổng cộng/xen kẽ
  GIỐNG HỆT file Excel/PDF xuất từ chính báo cáo đó (so trực tiếp 2 file
  cạnh nhau nếu cần chắc chắn).
- [ ] Lịch gửi email báo cáo doanh thu CŨ (tạo trước bản 8.96, chưa từng
  đụng ô chọn cột) → bấm "Gửi ngay" → vẫn gửi ĐỦ TOÀN BỘ cột như trước
  (không mất cột nào) — xác nhận tương thích ngược.

Không có bước nào ở Phần 4 làm mất dữ liệu đã có — cột `BodyColumnKeysJson`
mới chỉ THÊM, mặc định NULL cho lịch gửi cũ; CSS mới chỉ áp cho 4 báo cáo
Doanh thu cuối ngày, không ảnh hưởng bảng nào khác trong hệ thống.

---

# PHẦN 5 — Khung kẻ mảnh + ẩn/chọn cột báo cáo doanh thu (bản 8.97)

## M. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A).
2. `cd rp-user && npm run build` (đổi `styles.css` + thêm ô "Cột hiển
   thị" ở `ReportsPage.jsx`). Copy TOÀN BỘ `dist/` lên vị trí phục vụ
   tĩnh như mọi lần trước.
3. `pm2 restart hcrc-rp-server` (đổi `lib/reportCellFormat.js` +
   `lib/emailBodyRenderer.js` + `routes/reports.js`).
4. KHÔNG cần đổi gì ở CSDL (không có bảng/cột mới).

## N. Kiểm tra Phần 5 sau khi triển khai

- [ ] rp-user → "Báo cáo" → mở 1 trong 4 báo cáo "Doanh thu cuối ngày" →
  bảng có khung kẻ mảnh quanh từng ô (trước bản 8.97 chỉ có gạch ngang
  dưới mỗi dòng) — khớp đúng kiểu viền đã có sẵn ở file Excel/PDF/email.
- [ ] Cùng báo cáo đó → thấy ô "Cột hiển thị (không chọn = hiện đủ cột)"
  ngay dưới nút "Xuất Excel"/"Xuất PDF" → chọn vài cột → bảng web chỉ còn
  đúng các cột đã chọn, nhóm màu nào hết cột (vd bỏ hết cột "Lãi gộp") tự
  ẩn khỏi tiêu đề, colSpan các nhóm còn lại tính lại đúng.
- [ ] Bấm "Xuất Excel"/"Xuất PDF" ngay sau khi chọn cột → file tải về
  CHỈ có đúng các cột đang hiện trên web lúc đó (không phải luôn đủ cột
  như trước bản 8.97).
- [ ] Không chọn cột nào (để trống ô "Cột hiển thị") → bảng/file xuất vẫn
  ĐỦ TOÀN BỘ cột như trước — xác nhận tương thích ngược.
- [ ] Đổi sang báo cáo khác KHÔNG có nhóm cột màu (vd "Đơn đặt hàng") →
  KHÔNG thấy ô "Cột hiển thị" — tính năng chỉ áp dụng 4 báo cáo Doanh thu
  cuối ngày, không ảnh hưởng báo cáo khác.
- [ ] Email báo cáo doanh thu gửi theo lịch (`DeliveryMode='body'`) với
  số liệu có phần lẻ → vẫn làm tròn ĐÚNG như Excel/PDF (vd số 950000.6
  hiện "950,001", tỷ lệ 94.6% hiện "95%") — xác nhận không lệch.

Không có bước nào ở Phần 5 làm mất dữ liệu đã có — không đổi schema CSDL;
ô "Cột hiển thị" là lựa chọn THEO PHIÊN XEM hiện tại (không lưu lại),
không ảnh hưởng tới lịch gửi email hay dữ liệu báo cáo gốc.
