# Cập nhật bản 10.1 đến 10.7 — Chỉ tiêu ngành hàng theo ngày, Đơn đặt hàng theo ngành, NCC tự động Core stock=0, vá bảo mật proxy-addr, Giám sát Log CSDL, Chỉ 1 phiên đăng nhập, Feed voucher đối tác

**Mục đích**: gộp 7 bản liên tiếp thành 1 lượt làm — 3 bản đầu đi CHUNG
1 lần pull (cùng 1 commit, liên quan tới nhau qua domain `don_dat_hang`
dùng chung), bản 10.4 là vá bảo mật độc lập ở `api-server`, bản 10.5 là
tính năng giám sát mới ở `etl`/`etl-admin`, bản 10.6 là tính năng "chỉ 1
phiên đăng nhập" áp dụng cho CẢ 3 app, bản 10.7 là feed voucher đã thu
hồi cho đối tác (chỉ `api-server`/`api-admin`) — 4 bản sau
(10.4/10.5/10.6/10.7) đều ĐỘC LẬP với 3 bản đầu VÀ với nhau (khác file/
tiến trình, làm trước/sau/song song đều được):

- **Bản 10.1** — Chỉ tiêu ngành hàng (báo cáo "Doanh thu/Nhập hàng theo
  ngành hàng" HCRC + LDTĐ) giờ CHIA THEO TỶ LỆ SỐ NGÀY đã chọn trong
  từng tháng, khi người dùng chọn 1 ngày/vài ngày KHÔNG phải nguyên 1
  tháng — trước đây vẫn lấy NGUYÊN chỉ tiêu cả tháng, sai khi so sánh với
  doanh thu thực tế của đúng số ngày đã chọn.
- **Bản 10.2** — VIEW `don_dat_hang` (nguồn của 6 báo cáo "Đơn đặt hàng"/
  "Đơn nhập hàng"/"So sánh đặt–nhận") thêm cột Mã/Tên ngành hàng, và 6
  báo cáo đó thêm bộ lọc "Ngành hàng" (đã có sẵn lọc NCC/Siêu thị/Kênh
  mua, chỉ thiếu Ngành hàng).
- **Bản 10.3** — Báo cáo "Core stock = 0" (Mart/Minimart) TỰ ĐỘNG lấy Mã
  NCC/Tên NCC từ domain `don_dat_hang` khi dòng Core đó CHƯA khai tay
  trong "Danh sách hàng Core" (khai tay vẫn LUÔN ưu tiên hơn).
- **Bản 10.4** — Vá lỗ hổng bảo mật **CRITICAL** `proxy-addr` (giả mạo
  IP qua IPv4-mapped IPv6) ở `api-server`, phát hiện qua rà soát bảo mật
  hệ thống API theo yêu cầu người dùng — kèm vá luôn 5 lỗ hổng dependency
  khác không cần breaking change (`qs`/`compression`/`multer`/
  `ip-address`/`brace-expansion`).
- **Bản 10.5** — Tính năng mới **"Giám sát Log CSDL"**: tự động kiểm tra
  mỗi 15 phút dung lượng transaction log của MỌI CSDL hệ thống kết nối
  tới (CSDL lõi DWH/ETL/RP/API + mọi "Nguồn dữ liệu" đã khai) — vượt
  ngưỡng (mặc định 20GB hoặc 90% log đã dùng) thì gửi email cảnh báo.
  Theo yêu cầu người dùng, SAU sự cố thật: transaction log `HCRC_DWH`
  phình to ~329GB chiếm gần hết ổ đĩa, làm mọi job ETL lỗi đồng loạt mà
  không ai biết tới khi admin tình cờ phát hiện (xem mục D bên dưới cho
  cách xử lý THỦ CÔNG sự cố tương tự nếu gặp lại trước khi email cảnh báo
  kịp gửi).
- **Bản 10.6** — Tính năng mới **"Chỉ 1 phiên đăng nhập"**: đăng nhập ở
  thiết bị/trình duyệt MỚI sẽ tự động vô hiệu MỌI phiên CŨ của cùng tài
  khoản đó, áp dụng cho CẢ 3 app (`rp-user`/`etl-admin`/`api-admin`).
  Theo yêu cầu người dùng — trước bản này 1 tài khoản đăng nhập được
  đồng thời nhiều nơi không giới hạn.
- **Bản 10.7** — Tính năng mới **"Feed voucher đã thu hồi cho đối tác"**:
  thêm endpoint `GET /api/v1/vouchers/[:configKey/]redeemed/since` kiểu
  "con trỏ" (`sinceId`/`nextSinceId`/`hasMore`) để đối tác tự chạy job
  định kỳ lấy ĐÚNG phần voucher MỚI thu hồi từ lần gọi trước, KHÔNG cần
  tự đối soát toàn bộ danh sách như endpoint `list` cũ. Admin tự cấu
  hình trường dữ liệu trả về cho từng đối tác (`api-admin` → Đối tác →
  "Trường dữ liệu voucher đã thu hồi"). Theo yêu cầu người dùng.

(Tách riêng từ nhật ký gộp `deploy/Nhật ký triển khai (từ bản 8.31).md`
mục 10.1-10.7 để tiện gửi/làm theo mà không cần mở file gộp đầy đủ lịch
sử. Lưu ý số bản 10.1/10.2/10.3 đã được SỬA LẠI từ "9.101/9.102/9.103" —
xem `VERSION.md` mục "SỬA SỐ bản 9.100-9.103 → 10.0-10.3" nếu thấy nhầm
với bản cũ đã nói tới ở đâu đó — nội dung và các bước dưới đây KHÔNG đổi,
chỉ đổi tên gọi số.)

---

## A. Code — lấy về

```bash
git pull origin main
```

## B. Các bước triển khai (theo đúng thứ tự)

### B.1 — DBA: chạy lại 2 VIEW `don_dat_hang` (bắt buộc cho bản 10.2)

Chạy lại NGUYÊN VĂN 2 file sau trên ĐÚNG server tương ứng (AN TOÀN chạy
lại nhiều lần — `CREATE OR ALTER VIEW`/thủ tục, không mất dữ liệu):

- `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung tâm).sql`
  — chạy trên **DSMART16 trung tâm** (job Live).
- `deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql` — chạy
  trên **DSMART16_EOM** (job Lịch sử).

Cả 2 file đều thêm 2 cột MỚI `MaNganhHang`/`TenNganhHang` (JOIN
`DEPTLIST` qua `SKU_DEF.DEPT_ID`) — thuần thêm cột, không đổi cột cũ nào,
6 báo cáo "Đơn đặt hàng" hiện có KHÔNG bị ảnh hưởng.

### B.2 — IT/Dev: chạy lại các script seed + resync (bắt buộc cho cả 10.2 và 10.3)

```bash
cd etl
node scripts/seedDonDatHangSync.js            # cập nhật DimensionColumnsJson job Live — thêm MaNganhHang/TenNganhHang
node scripts/seedDonDatHangHistorySync.js      # tương tự cho job Lịch sử
node scripts/resyncDonDatHangLiveForSkuCode.js --confirm   # ÉP job Live kéo lại dữ liệu CŨ với cột mới
```

> Lệnh `resyncDonDatHangLiveForSkuCode.js --confirm` dùng CHUNG cho CẢ
> bản 10.2 (lấp Ngành hàng cho dữ liệu đã đồng bộ trước đó) VÀ bản 10.3
> (job Live cần đã có đủ `MaHangHienThi` để tra NCC tự động) — **chỉ cần
> chạy 1 LẦN**, không cần chạy lại riêng cho từng bản. Script này CHỈ xoá
> + kéo lại job **Live** (dữ liệu gần đây, nhanh) — job **Lịch sử**
> KHÔNG cần resync (tự kéo dần theo lịch, dữ liệu cũ chỉ thiếu 2 cột mới,
> không sai dữ liệu đã có).
>
> Nếu server này đã từng chạy resync này ở bản 9.95 RỒI (trước khi có
> bản 10.2) — vẫn CẦN chạy lại 1 lần nữa ở đây, vì lần trước chưa có cột
> Ngành hàng để kéo.

```bash
cd ../rp-server
node scripts/seedPurchaseOrderReports.js       # thêm bộ lọc "Ngành hàng" vào 6 báo cáo mua hàng (bản 10.2)
node scripts/seedCoreZeroStockReports.js       # bật useDonDatHangForNcc cho 2 báo cáo Core stock=0 (bản 10.3)
```

Cả 2 script đều AN TOÀN chạy lại nhiều lần (chỉ UPDATE `DefinitionJson`
theo đúng `ReportId`, không tạo trùng).

### B.3 — Khởi động lại rp-server (bắt buộc cho cả 10.1, 10.2, 10.3)

```bash
pm2 restart hcrc-rp-server
```

(`hcrc-etl` KHÔNG cần restart — bước B.2 chạy script trực tiếp bằng
`node`, không qua tiến trình PM2 của etl.)

### B.4 — Vá bảo mật `api-server` (bản 10.4, ĐỘC LẬP với B.1-B.3 ở trên)

Chỉ đụng tới `api-server` (khác hẳn `rp-server`/`etl` ở trên) — làm
trước/sau/song song với B.1-B.3 đều được, không phụ thuộc nhau:

```bash
cd api-server
npm ci          # KHÔNG dùng npm install — npm ci cài CHÍNH XÁC đúng
                 # version đã vá trong package-lock.json, tránh lệch
                 # version giữa máy dev và server
pm2 restart hcrc-api-server
```

Bản này CHỈ đổi `package-lock.json` (nâng version dependency), KHÔNG đổi
code/`package.json` — không cần build lại gì khác, không cần sửa `.env`.

### B.5 — "Giám sát Log CSDL" (bản 10.5, ĐỘC LẬP với B.1-B.4 ở trên)

Chỉ đụng tới `etl`/`etl-admin` — làm trước/sau/song song với B.1-B.4 đều
được:

1. DBA/IT chạy lại NGUYÊN VĂN `etl-db/schema.sql` trên `HCRC_ETL` (AN
   TOÀN chạy lại nhiều lần — chỉ THÊM bảng mới `etl.LogSpaceStatus` nếu
   chưa có, không đụng dữ liệu/bảng khác).
2. `pm2 restart hcrc-etl` (đã `git pull` ở mục A — code mới bao gồm
   `lib/logSpaceMonitor.js` + job nền mỗi 15 phút + route mới).
3. Build lại giao diện quản trị và khởi động lại tiến trình phục vụ web
   tĩnh của `etl-admin`:
   ```bash
   cd etl-admin
   npm run build
   ```
4. Vào etl-admin → **"Vai trò"**, gán quyền xem trang **"Giám sát Log
   CSDL"** (menu `log-space-status`) cho vai trò admin cần theo dõi —
   mặc định KHÔNG vai trò nào tự có quyền xem.
5. **(Tuỳ chọn)** nếu muốn giám sát LUÔN cả `HCRC_RP` (Report Server)/
   `HCRC_API` (API Server) — không bắt buộc, mặc định chỉ giám sát
   `HCRC_DWH`/`HCRC_ETL` — thêm vào `.env` của `etl` (xem khối mẫu đầy đủ
   + chú thích trong `etl/.env.example`, phần "Giám sát Log CSDL"):
   ```
   RP_SERVER=...
   RP_DATABASE=HCRC_RP
   RP_USER=...
   RP_PASSWORD=...
   API_SERVER=...
   API_DATABASE=HCRC_API
   API_USER=...
   API_PASSWORD=...
   ```
   Khuyến nghị tạo RIÊNG 1 login SQL Server chỉ có quyền `VIEW DATABASE
   STATE` cho mục đích giám sát này (không cần sysadmin, không dùng
   chung tài khoản ghi dữ liệu thật của rp-server/api-server). Thêm xong
   nhớ `pm2 restart hcrc-etl` lại lần nữa.
6. **(Tuỳ chọn)** đổi ngưỡng cảnh báo mặc định (20GB hoặc 90% log đã
   dùng) hoặc thời gian chống gửi email lặp lại (mặc định 6 tiếng) — sửa
   `LOG_SPACE_ALERT_SIZE_MB`/`LOG_SPACE_ALERT_PERCENT`/
   `LOG_SPACE_ALERT_COOLDOWN_MINUTES` trong `.env` rồi `pm2 restart
   hcrc-etl`. Email cảnh báo dùng CHUNG kênh `SMTP_HOST`/`ALERT_EMAIL_TO`
   đã cấu hình sẵn cho cảnh báo lỗi ETL — CHƯA cấu hình 2 biến đó thì
   tính năng vẫn chạy (vẫn xem được trên trang "Giám sát Log CSDL"), chỉ
   là KHÔNG gửi được email.

### B.6 — "Chỉ 1 phiên đăng nhập" (bản 10.6, ĐỘC LẬP với B.1-B.5 ở trên)

Tác động CẢ 3 app cùng lúc (`rp-server`, `etl`, `api-server`) — làm đủ cả
2 bước dưới đây, không được bỏ sót app nào:

1. DBA/IT chạy lại NGUYÊN VĂN 3 file sau trên ĐÚNG 3 CSDL tương ứng (AN
   TOÀN chạy lại nhiều lần — chỉ THÊM 1 cột mới `CurrentSessionId`,
   không đụng dữ liệu/bảng khác, không ép đăng xuất ai ngay lúc chạy):
   - `rp-db/schema.sql` → trên **HCRC_RP**.
   - `etl-db/schema.sql` → trên **HCRC_ETL**.
   - `api-db/schema.sql` → trên **HCRC_API**.
2. `pm2 restart hcrc-rp-server hcrc-etl hcrc-api-server` (cả 3 — KHÔNG
   cần build lại frontend nào, thuần backend).

Không có bước cấu hình `.env` nào, không có trang quản trị nào cần bật/
tắt (tính năng LUÔN BẬT, không tuỳ chọn).

### B.7 — "Feed voucher đã thu hồi cho đối tác" (bản 10.7, ĐỘC LẬP với B.1-B.6 ở trên)

Chỉ đụng tới `api-server`/`api-admin` — làm trước/sau/song song với
B.1-B.6 đều được:

1. DBA/IT chạy lại NGUYÊN VĂN `api-db/schema.sql` trên `HCRC_API` (AN
   TOÀN chạy lại nhiều lần — chỉ THÊM 1 cột mới
   `VoucherRedeemedFeedFieldsJson`, không đụng dữ liệu/bảng khác).
2. ```bash
   cd api-admin
   npm install && npm run build
   ```
   (có sửa UI — thêm modal "Trường dữ liệu voucher đã thu hồi").
3. `pm2 restart hcrc-api-server` (KHÔNG cần restart `rp-server`/`etl`).
4. Vào `api-admin` → **Đối tác** → với từng đối tác cần dùng tính năng
   này: mở modal gán quyền (scope) → tick thêm `voucherRedeemedFeed`
   (quyền RIÊNG, KHÔNG tự động có qua `voucherCheck`/`voucherRedeem` cũ
   đã cấp trước đó); sau đó bấm nút "Trường dữ liệu voucher đã thu hồi"
   → tick đúng những trường muốn cho đối tác đó thấy (bỏ trống/tick đủ
   cả 5 = trả về đủ cả 5, mặc định không cần cấu hình gì).
5. Gửi file `api-voucher-redeemed-gui-doi-tac.md` (đã cập nhật mục 3)
   cho đối tác — đối tác tự đọc mục 3 để tích hợp job định kỳ, không
   cần hỏi lại HCRC về cách dùng.

## C. Kiểm tra sau khi triển khai

- [ ] **Bản 10.1** — mở "Doanh thu theo ngành hàng" hoặc "(LDTD)", chọn
  khoảng ngày KHÔNG phải nguyên 1 tháng (vd 5 ngày lẻ cuối tháng) — cột
  "Chỉ tiêu" (Doanh thu/Lãi gộp, Total/Bán lẻ/Bán buôn) phải ra số theo
  ĐÚNG tỷ lệ ngày đã chọn, không còn bằng nguyên số chỉ tiêu cả tháng.
  Chọn lại ĐÚNG nguyên 1 tháng — số phải GIỐNG như trước khi có bản này
  (không đổi hành vi trường hợp chọn nguyên tháng).
- [ ] **Bản 10.2** — mở 1 trong 6 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/
  "So sánh đặt–nhận" — bộ lọc "Ngành hàng" phải xuất hiện (cạnh NCC/Siêu
  thị/Kênh mua), chọn 1 ngành hàng → kết quả chỉ còn đúng mã hàng thuộc
  ngành đó.
- [ ] **Bản 10.3** — mở "Core stock = 0 (Mart)"/"(Minimart)" — cột "Mã
  NCC"/"Nhà cung cấp" phải có số liệu cho dòng CHƯA khai tay trong "Danh
  sách hàng Core" (miễn mã hàng đó đã TỪNG được nhập qua NCC qua domain
  `don_dat_hang`). Dòng ĐÃ khai tay trong "Danh sách hàng Core" phải GIỮ
  NGUYÊN giá trị khai tay (không bị ghi đè bởi giá trị tự động).
- [ ] **Bản 10.4** — `pm2 logs hcrc-api-server --lines 50` sau khi
  restart KHÔNG có lỗi khởi động (module not found/syntax error — có lỗi
  này nghĩa là `npm ci` ở B.4 chưa cài đúng, chạy lại). Gọi thử 1 API
  thật (vd endpoint realtime tồn kho) từ 1 đối tác đã cấu hình
  `allowedIps`/HMAC — vẫn chạy bình thường, không đổi hành vi.
- [ ] **Bản 10.5** — mở etl-admin → **"Giám sát Log CSDL"** — phải thấy
  danh sách kết nối (ít nhất `HCRC_DWH (Data Warehouse)`/`HCRC_ETL (Quản
  trị ETL)` + mọi "Nguồn dữ liệu" đã khai), cột "Kiểm tra lần cuối" có
  thời điểm gần đây (không phải "Chưa kiểm tra lần nào" — nếu vậy bấm
  "Kiểm tra lại ngay" để ép chạy thử). Thử hạ tạm `LOG_SPACE_ALERT_SIZE_MB`
  xuống rất thấp (vd `1`) rồi `pm2 restart hcrc-etl` + bấm "Kiểm tra lại
  ngay" — phải thấy dòng tương ứng chuyển "⚠️ Vượt ngưỡng" VÀ nhận được
  email cảnh báo (nếu đã cấu hình SMTP) — xong nhớ ĐỔI LẠI đúng ngưỡng
  thật (vd `20000`) rồi restart lại.
- [ ] **Bản 10.6** — đăng nhập 1 tài khoản trên Trình duyệt A, giữ phiên
  đó đang mở. Đăng nhập LẠI CHÍNH tài khoản đó trên Trình duyệt B (hoặc
  cửa sổ ẩn danh) — phải vào được bình thường. Quay lại Trình duyệt A,
  bấm bất kỳ thao tác nào gọi API — phải bị đăng xuất, hiện thông báo
  "...hoặc đã đăng nhập ở nơi khác". Lặp lại cho CẢ 3 app (mỗi app giới
  hạn phiên ĐỘC LẬP với 2 app kia).
- [ ] **Bản 10.7** — gọi `GET /api/v1/vouchers/redeemed/since?sinceId=0`
  với đúng `X-API-Key` của 1 đối tác ĐÃ gán quyền `voucherRedeemedFeed`
  — phải trả `200` kèm `rows`/`nextSinceId`/`hasMore` hợp lý; gọi lại
  với `sinceId=<nextSinceId vừa nhận>` — KHÔNG được trả lại các dòng đã
  lấy ở lượt trước. Gọi bằng API key CHƯA gán quyền — phải trả `403`.
  Thu hồi 1 voucher mới qua luồng bình thường rồi gọi lại — voucher đó
  phải xuất hiện NGAY (không cần chờ chu kỳ đối soát 15 phút).

Nếu mục nào vẫn trống/sai sau khi làm đủ các bước trên — xem phần "Hỏi &
đáp" tương ứng:
- Bản 10.1: `VERSION.md` mục 10.1 (không có mục Hỏi&đáp riêng — logic
  thuần tính toán, không phụ thuộc dữ liệu ngoài).
- Bản 10.2: 6 file `bc-don-dat-hang*.md` tương ứng từng báo cáo.
- Bản 10.3: `bc-core-ton-kho-0.md` mục **"Bản 10.3"**.
- Bản 10.4: `VERSION.md` mục 10.4 (gồm danh sách đầy đủ lỗ hổng đã vá +
  2 lỗ hổng CHƯA vá, cần breaking change).
- Bản 10.5: `VERSION.md` mục 10.5; nguồn nào báo "🔴 Lỗi kiểm tra" trên
  trang "Giám sát Log CSDL" — xem cột "Lỗi" của đúng dòng đó (thường là
  thiếu quyền `VIEW DATABASE STATE` hoặc sai thông tin kết nối).
- Bản 10.6: `VERSION.md` mục 10.6; file riêng
  `deploy/Cập nhật bản 10.6 — Chỉ 1 phiên đăng nhập.md` (gồm phần "Lưu ý
  vận hành" — không có ngoại lệ cho tài khoản dùng chung nhiều người,
  2FA/WebAuthn đều tính là "đăng nhập").
- Bản 10.7: `VERSION.md` mục 10.7; tài liệu gửi đối tác
  `api-voucher-redeemed-gui-doi-tac.md` mục 3 (cách tích hợp vòng lặp
  `sinceId`/`nextSinceId`/`hasMore`).

Không có bước nào ở trên làm mất dữ liệu đã có — mọi thay đổi CSDL chỉ
THÊM cột/cấu hình/bảng mới, không xoá/đổi dữ liệu cũ; bản 10.4 chỉ đổi
version dependency, không đổi dữ liệu/cấu hình gì.

---

## D. Thao tác thủ công trên CSDL — xử lý/phòng ngừa log đầy (nếu gặp lại trước khi kịp nhận cảnh báo)

Đây KHÔNG phải bước deploy code — là script SQL chạy TRỰC TIẾP trên SQL
Server (qua SSMS), áp dụng ĐÚNG cho sự cố thật đã xảy ra với `HCRC_DWH`
(transaction log phình to do CSDL ở chế độ `FULL` recovery mà không có
job sao lưu log định kỳ). Bản 10.5 ở trên giúp PHÁT HIỆN sớm sự cố này
qua email, nhưng KHÔNG tự động xử lý — vẫn cần chạy tay 3 bước dưới đây.

**D.1 — Xử lý ngay khi log đã đầy** (gộp cả xoá dữ liệu cũ của log lẫn
đổi chế độ để không tái diễn):

```sql
USE master;
GO
ALTER DATABASE HCRC_DWH SET RECOVERY SIMPLE WITH NO_WAIT;
GO
USE HCRC_DWH;
GO
DECLARE @logname nvarchar(256);
SELECT @logname = name FROM sys.database_files WHERE type_desc = 'LOG';
DBCC SHRINKFILE (@logname, 1024);
GO
```

Chuyển sang `SIMPLE` là xử lý **TRIỆT ĐỂ** (không phải tạm) — SQL Server
tự giải phóng vùng log cũ sau mỗi checkpoint, không cần sao lưu log định
kỳ nữa, log sẽ không phình to kiểu "không bao giờ được dọn" như sự cố đã
xảy ra. Cài đặt này GHI VĨNH VIỄN vào CSDL, không mất khi khởi động lại
server.

**D.2 — Kiểm tra lại đã áp dụng đúng chưa:**

```sql
SELECT name, recovery_model_desc FROM sys.databases WHERE name = 'HCRC_DWH';
-- recovery_model_desc phải ra SIMPLE
EXEC xp_fixeddrives;
-- xem dung lượng trống đã tăng lại chưa
```

**D.3 — Đặt TRẦN tối đa cho file log** (khuyến nghị thêm, phòng trường
hợp hiếm gặp khác — vd 1 lệnh xử lý dữ liệu rất lớn chạy 1 lúc — vẫn làm
log tăng đột biến; đặt trần để KHÔNG BAO GIỜ ăn hết sạch ổ đĩa lần nữa,
chạm trần sẽ báo lỗi rõ ràng thay vì làm treo cả server). Số `MAXSIZE`
dưới đây (20GB) là ví dụ cho trường hợp ổ đĩa CHỈ còn ~100GB trống — tự
điều chỉnh theo dung lượng trống THẬT của server (xem `xp_fixeddrives`
ở D.2), nguyên tắc: luôn để dư ít nhất 70-80% dung lượng trống hiện tại
cho `.mdf`/tempdb/CSDL khác, trần log chỉ chiếm phần còn lại:

```sql
USE master;
GO
ALTER DATABASE HCRC_DWH 
MODIFY FILE (NAME = N'HCRC_DWH_log', FILEGROWTH = 512MB, MAXSIZE = 20480MB);
GO
-- Kiểm tra lại:
SELECT name, size/128 AS SizeMB_HienTai, max_size * 8 / 1024 AS MaxSizeMB, growth AS GrowthStep
FROM sys.master_files 
WHERE database_id = DB_ID('HCRC_DWH') AND type_desc = 'LOG';
```

Nếu server có NHIỀU CSDL khác cũng đang ở chế độ `FULL` mà không có job
sao lưu log (xem cột "Trạng thái" ở etl-admin → "Giám sát Log CSDL" khi
đã lên bản 10.5 — hoặc chạy `SELECT name, recovery_model_desc FROM
sys.databases;` để xem toàn bộ) — áp dụng tương tự D.1/D.3 cho từng CSDL
đó (đổi tên `HCRC_DWH`/`HCRC_DWH_log` thành đúng tên CSDL/file log tương
ứng).

---

## E. Kiến trúc mạng — domain nào BẮT BUỘC public ra Internet, domain nào KHÔNG cần

Không phải bước deploy code — là phần giải đáp về cấu hình mạng/Nginx,
áp dụng cho server THỰC TẾ đang chạy cả 3 hệ thống (API, ETL, Report)
TRÊN CÙNG 1 MÁY CHỦ (đúng mô hình server của hệ thống này).

**4 domain đang có, 2 nhóm hoàn toàn khác mục đích**:

| Domain | Vai trò | Có BẮT BUỘC public ra Internet không? |
|---|---|---|
| `report.hcrc.vn` | Trang tĩnh `rp-user` + Nginx proxy `/api/` sang `rp-server` | **CÓ** (nếu muốn xem báo cáo từ ngoài văn phòng/VPN) |
| `etl-admin.hcrc.vn` | Trang tĩnh `etl-admin` + Nginx proxy `/admin/` sang `etl` | **CÓ** (nếu muốn quản trị ETL từ ngoài văn phòng/VPN) |
| `api.hcrc.vn` | Public API (`/api/v1/*`) cho ĐỐI TÁC bên ngoài gọi (voucher, tồn kho realtime...) | CÓ — CHỈ KHI còn đối tác cần gọi; không còn đối tác nào thì tắt luôn cũng được |
| `rp.hcrc.vn` / `etl.hcrc.vn` | Domain "service" — KHÔNG phải nơi trình duyệt/đối tác gọi trực tiếp | **KHÔNG CẦN**, nên khoá khỏi Internet |

**Vì sao `rp.hcrc.vn`/`etl.hcrc.vn` không cần public** (đã xác nhận với
người dùng qua Q&A, server dùng CHUNG 1 máy cho cả 3 hệ thống):
- Nginx của `report.hcrc.vn` kết nối backend `rp-server` qua
  `127.0.0.1:4001` (xem `upstream hcrc_rp_server` trong
  `deploy/nginx.conf`) — LOOPBACK NỘI BỘ, không tra DNS/đi ra Internet.
  Tương tự `etl-admin.hcrc.vn` → `127.0.0.1:4003` (`hcrc_etl_server`).
- Nếu triển khai dùng TÊN MIỀN `rp.hcrc.vn`/`etl.hcrc.vn` thay vì thẳng
  `127.0.0.1` trong `proxy_pass` — vẫn AN TOÀN khoá khỏi DNS public,
  MIỄN LÀ có khai trong file `/etc/hosts` của CHÍNH server đó trỏ về
  `127.0.0.1` (hoặc IP nội bộ) — hệ thống đọc file hosts cục bộ TRƯỚC,
  không bao giờ cần hỏi DNS công khai. Đây ĐÚNG cách server thật của hệ
  thống này đang làm.
- Lợi ích: giảm bề mặt tấn công — không ai ngoài Internet biết/kết nối
  trực tiếp được vào cổng backend thô (bỏ qua hẳn lớp Nginx/đăng nhập).

**Về `api.hcrc.vn` (public API cho đối tác) — tắt có ảnh hưởng gì khác
không?** KHÔNG — các cuộc gọi NỘI BỘ giữa `rp-server`↔`api-server` (vd
"Upload cảnh báo hàng tồn", tra cứu voucher) dùng biến riêng
`INTERNAL_API_SERVER_URL`/`API_SERVER_BASE_URL` trong `.env` của
`rp-server`, trỏ `http://localhost:4002` (hoặc IP nội bộ) — HOÀN TOÀN
TÁCH BIỆT khỏi domain `api.hcrc.vn` công khai. Tắt `api.hcrc.vn` khỏi
Internet CHỈ ảnh hưởng đối tác bên ngoài gọi `/api/v1/*`, không ảnh
hưởng bất kỳ tính năng nội bộ nào của hệ thống.

**Điều kiện áp dụng kết luận trên**: `rp-server`/`etl`/`api-server` và
Nginx của `report.hcrc.vn`/`etl-admin.hcrc.vn`/`api.hcrc.vn` phải chạy
**CÙNG 1 máy chủ** (đúng mô hình server hiện tại). Nếu sau này TÁCH
backend sang máy KHÁC với máy chạy Nginx, cần đảm bảo 2 máy đó có đường
mạng riêng (VPN nội bộ/mạng private) tới nhau — lúc đó domain
`rp.hcrc.vn`/`etl.hcrc.vn` (hoặc IP tương ứng) vẫn KHÔNG cần public ra
Internet rộng, chỉ cần máy Nginx tới được qua đường mạng riêng đó.
