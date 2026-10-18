# Hướng dẫn triển khai gộp — bản 9.59 đến 9.66 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 9.59 tới bản 9.66 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 9.58 và cần bắt
kịp bản mới nhất — KHÔNG lặp lại toàn bộ lịch sử trước đó (xem `deploy/Hướng
dẫn triển khai gộp — bản 8.91 đến 8.98.md` và `deploy/Hướng dẫn triển khai
gộp — bản 8.29 đến 8.90.md` nếu cần dựng server hoàn toàn mới từ đầu; các
bản 8.99 → 9.58 được coi là ĐÃ triển khai xong trên server này).

Gồm 4 phần ĐỘC LẬP, làm phần nào cũng được, không phụ thuộc nhau (riêng
Phần 4 chỉ có ý nghĩa SAU KHI đã làm Phần 3 — sửa lỗi 1 công thức trong
chính báo cáo Phần 3 dựng ra):

- **Phần 1 (mục B-C)** — bản 9.59/9.60/9.61: Voucher redeem gọi được
  NHIỀU máy chủ DSMART (vd thêm chi nhánh "Fuji") — 2 bản sau (9.60/9.61)
  CHỈ sửa lại hướng dẫn/bỏ hẳn cách làm qua script của bản 9.59, bên dưới
  đã viết THEO ĐÚNG cách làm CUỐI CÙNG (chỉ qua giao diện), không cần làm
  lại theo cách cũ rồi sửa tiếp.
- **Phần 2 (mục D-E)** — bản 9.62: API tra cứu voucher ĐÃ DÙNG cho đối
  tác ngoài (qua Endpoint realtime) + sửa lỗi khoá `BARCODE` còn sót ở
  endpoint nội bộ "voucher-check".
- **Phần 3 (mục F-G)** — bản 9.63: Báo cáo "Doanh thu, lãi gộp theo ngành
  hàng" (BRGMART) theo mẫu Excel mới + trang khai báo "Siêu thị NSO".
- **Phần 4 (mục H-I)** — bản 9.64: sửa lỗi công thức "Tỷ lệ" lãi gộp của
  báo cáo BRGMART (Phần 3) — PHẢI chia cho Doanh thu cuối, không phải
  Thực đạt thô.

**Bản 9.65/9.66 — KHÔNG có bước triển khai riêng** (chỉ sửa tài liệu
`.md`, không đụng code/schema/migration nào) — `git pull origin main` ở
mục A dưới đây là ĐỦ, tự động có luôn, không cần làm gì thêm:

- **9.65**: thêm quy ước "mỗi báo cáo phải có 1 tài liệu hướng dẫn riêng"
  (`CLAUDE.md`) + mục "Danh mục báo cáo" tổng hợp toàn bộ 21 báo cáo
  (`hướng_dẫn_báo_cáo.md` mục 17) + viết bù 4 file tài liệu riêng còn
  thiếu (gồm cả tài liệu báo cáo BRGMART ở Phần 3).
- **9.66**: xác nhận với người dùng rằng DSMART **CHƯA có nguồn dữ liệu
  hàng hỏng hủy** (view `V_HCRC_HANGHONGHUY_NGANHHANG` ở Phần 3 KHÔNG
  tồn tại) — cập nhật lại tài liệu BRGMART cho đúng thực tế, báo cáo vẫn
  chạy bình thường, chỉ "Giá trị hàng hỏng hủy" ra `0` cho tới khi có
  nguồn dữ liệu thật (xem Phần 3 mục G bên dưới).

---

## Tóm tắt những gì thay đổi (9.59 → 9.66)

| Bản | Nội dung |
|---|---|
| 9.59 | Voucher redeem gọi được NHIỀU máy chủ DSMART khác nhau (`api.VoucherSettings` từ 1 dòng → danh sách, mỗi dòng 1 `ConfigKey`) — bản đầu còn hướng dẫn thêm máy chủ mới qua script `.env` |
| 9.60 | SỬA LẠI hướng dẫn bản 9.59: BỎ cách qua script, chỉ dùng giao diện ("Nguồn dữ liệu" + "Cấu hình Voucher") |
| 9.61 | BỎ HẲN script `seed:voucher-datasource` khỏi code (không chỉ đổi hướng dẫn) — dữ liệu đã lưu trước đó GIỮ NGUYÊN |
| 9.62 | Thêm API cho đối tác NGOÀI tự tra voucher ĐÃ DÙNG (endpoint `voucher-redeemed`, qua cơ chế Endpoint realtime có sẵn) + sửa lỗi THẬT: endpoint nội bộ "voucher-check" vẫn khoá sai theo cột `BARCODE` (thường rỗng) thay vì `CARD_ID` — cùng lỗi đã sửa ở `/check`/`/redeem` từ bản 9.19 nhưng chưa áp dụng sang endpoint này |
| 9.63 | Báo cáo mới "Doanh thu, lãi gộp theo ngành hàng (BRGMART)" đúng mẫu Excel: 3 khối "Toàn hệ thống BRG"/"LFL"/"NSO" × 12 ngành hàng, thêm cụm Lãi gộp + "Giá trị hàng hỏng hủy"/"Doanh thu cuối" (chỉ ở khối BRG) + trang khai báo MỚI "Siêu thị NSO" |
| 9.64 | SỬA LỖI THẬT: cột "Tỷ lệ" lãi gộp (báo cáo Phần 3) phải chia cho Doanh thu CUỐI (= Thực đạt − hàng hỏng hủy), không phải Thực đạt thô — người dùng phát hiện lúc xem demo |
| 9.65 | CHỈ tài liệu — quy ước bắt buộc "mỗi báo cáo 1 file hướng dẫn riêng" + mục "Danh mục báo cáo" tổng hợp 21 báo cáo + viết bù 4 file còn thiếu |
| 9.66 | CHỈ tài liệu — xác nhận DSMART CHƯA có nguồn dữ liệu hàng hỏng hủy, cập nhật lại tài liệu BRGMART cho đúng thực tế |

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

# PHẦN 1 — Voucher redeem nhiều máy chủ DSMART (bản 9.59-9.61)

## B. Các bước triển khai (theo đúng cách làm CUỐI CÙNG, bỏ hẳn script)

1. `git pull origin main` (đã làm ở mục A).
2. DBA chạy lại NGUYÊN VĂN `api-db/schema.sql` trên CSDL API (an toàn
   chạy lại nhiều lần — tự chuyển `api.VoucherSettings` từ 1 dòng sang
   danh sách, GIỮ NGUYÊN cấu hình cũ vào dòng `default`, không mất gì).
3. Khởi động lại `api-server` và `api-admin`.
4. Cấu hình máy chủ DSMART (kể cả `default` nếu server này lần đầu dùng
   tính năng voucher, hoặc muốn kiểm tra lại cấu hình sẵn có) làm ĐÚNG 1
   CÁCH DUY NHẤT — qua giao diện api-admin (lệnh `npm run
   seed:voucher-datasource` ở hướng dẫn bản 9.59 KHÔNG còn tồn tại từ bản
   9.61, bỏ qua, không cần chạy):
   - Vào trang **"Nguồn dữ liệu"** → "+ Tạo mới" (hoặc dùng lại dòng đã
     khai từ trước nếu server đã chạy báo cáo/tồn kho đọc DSMART16 Live
     rồi) → gõ server/port/database/username/password của máy chủ
     DSMART16 đó (tài khoản SQL chỉ cần quyền SELECT + UPDATE trên
     `dbo.PMCRDINF` — chạy `api-db/grants-dsmart16-voucher.sql` trên
     chính DSMART16 nếu cần tạo tài khoản mới, nhớ đổi mật khẩu mẫu
     trước khi chạy thật).
   - Vào trang **"Cấu hình Voucher"** (menu mới từ bản 9.59, mặc định
     KHÔNG vai trò nào tự có quyền xem — gán ở "Vai trò" nếu cần) → dòng
     `default` LUÔN có sẵn (không xoá được, ứng với API
     `/vouchers/check`,`/vouchers/redeem` không kèm mã) → bấm "Sửa" →
     chọn đúng "Nguồn dữ liệu" vừa tạo/dùng ở bước trên.
   - Thêm máy chủ DSMART khác (vd "Fuji"): bấm "+ Tạo cấu hình mới" →
     đặt mã (`ConfigKey`, vd `fuji`, dùng THẲNG trên URL, KHÔNG đổi được
     sau khi tạo) + tên (vd "Voucher redeem Fuji") → chọn đúng "Nguồn dữ
     liệu" của máy chủ đó (tạo ở "Nguồn dữ liệu" trước nếu chưa có).
5. **Chỉ khi có đối tác cần gọi 1 máy chủ KHÁC `default`** (vd
   `/vouchers/fuji/check`) — vào "Đối tác" → chọn đúng đối tác → nút
   **"Cấu hình Voucher được gọi"** → tick đúng mã (vd `fuji`) → Lưu.
   Thiếu bước này, đối tác gọi `/vouchers/fuji/check|redeem` sẽ bị `403`
   (gọi `/vouchers/check`,`/vouchers/redeem` hay `/vouchers/default/...`
   không kèm mã thì KHÔNG cần bước này, luôn cho qua như trước).
6. Báo đội app voucher: khi người dùng chọn máy chủ khác (vd "Fuji"),
   gọi `/api/v1/vouchers/fuji/check` và `/api/v1/vouchers/fuji/redeem`
   (thay vì `/check`,`/redeem`) — request/response giữ nguyên như tài
   liệu cũ (`api-voucher-check-redeem.md`).
7. (Dọn dẹp, không bắt buộc) Nếu `.env` của `api-server` có các biến
   `VOUCHER_DSMART16_SERVER/PORT/DATABASE/USER/PASSWORD/ENCRYPT/
   TRUST_CERT` từ trước (dùng cho script cũ đã bỏ) — có thể xoá, để lại
   cũng không ảnh hưởng gì (không còn gì đọc các biến này).

## C. Kiểm tra Phần 1 sau khi triển khai

- [ ] api-admin → "Cấu hình Voucher" → dòng `default` hiện đúng "Nguồn
  dữ liệu" đã chọn (không còn trống/lỗi "Chưa cấu hình").
- [ ] Gọi thử `GET /api/v1/vouchers/check/<mã thật>` (không kèm mã máy
  chủ) → vẫn ra đúng kết quả như trước (xác nhận tương thích ngược, dòng
  `default` hoạt động đúng).
- [ ] (Nếu có thêm máy chủ thứ 2, vd "Fuji") — gọi thử
  `GET /api/v1/vouchers/fuji/check/<mã thật bên Fuji>` → ra đúng dữ liệu
  của ĐÚNG máy chủ Fuji (không lẫn với `default`).
- [ ] Đối tác CHƯA được cấp "Cấu hình Voucher được gọi" cho mã mới → gọi
  `/vouchers/fuji/check` → nhận lỗi `403` rõ ràng (đúng hành vi chặn mặc
  định, không phải lỗi hệ thống).

Không có bước nào ở Phần 1 làm mất dữ liệu đã có — migration CSDL chỉ
chuyển ĐÚNG 1 dòng cấu hình cũ sang dòng `default` của danh sách mới,
không xoá/đổi gì khác.

---

# PHẦN 2 — API tra cứu voucher ĐÃ DÙNG cho đối tác ngoài + sửa lỗi khoá BARCODE (bản 9.62)

## D. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A).
2. DBA chạy lại NGUYÊN VĂN `api-db/schema.sql` (thêm 4 cột NULLABLE vào
   `api.RealtimeEndpointDefs`: `KeyStripLeadingChar`/`FilterColumn`/
   `FilterOperator`/`FilterValue` — an toàn chạy lại nhiều lần, KHÔNG
   ảnh hưởng Endpoint realtime nào đã tạo trước đó).
3. Khởi động lại `api-server` và `api-admin`.
4. **SỬA LỖI quan trọng, BẮT BUỘC** — endpoint nội bộ "voucher-check"
   (nhân viên tra thủ công) đã khoá SAI theo cột `BARCODE` từ trước tới
   nay (hầu như luôn "không tìm thấy" trên dữ liệu thật vì cột này
   thường rỗng) — chạy lại:
   ```bash
   cd api-server
   npm run seed:voucher-check-endpoint
   ```
5. **(Chỉ nếu cần cấp cho đối tác NGOÀI tự lấy voucher đã dùng)** — tạo
   endpoint mới:
   ```bash
   cd api-server
   npm run seed:voucher-redeemed-endpoint
   ```
   Sau đó vào api-admin → "Đối tác" → chọn đối tác → "Realtime được gọi"
   → tick `voucher-redeemed` → Lưu. Gửi đối tác file
   `api-voucher-redeemed-gui-doi-tac.md` (tài liệu riêng, đã viết sẵn
   trong repo).
6. **(Nếu server này đã tạo báo cáo nội bộ "Tra cứu voucher" trên rp-user
   bằng `rp-server/scripts/seedVoucherCheckReport.js` từ trước)** — chạy
   lại script đó để cập nhật đúng cột/field mới (`BARCODE`→`CARD_ID`):
   ```bash
   cd rp-server
   node scripts/seedVoucherCheckReport.js
   ```
   (Nếu chưa từng tạo báo cáo này thì bỏ qua bước 6, không bắt buộc phải
   có.)
7. Gọi thử `GET /api/v1/realtime/voucher-check/<mã quét>` (nội bộ) và/
   hoặc `GET /api/v1/realtime/voucher-redeemed/<mã quét>` (đối tác, nếu
   đã cấp ở bước 5) với 1 mã ĐÃ DÙNG thật để xác nhận ra đúng dữ liệu.

## E. Kiểm tra Phần 2 sau khi triển khai

- [ ] **(Sửa lỗi BARCODE)** Gọi `GET /api/v1/realtime/voucher-check/<mã
  thật đã quét được trước đây>` → ra đúng kết quả (TRƯỚC bản 9.62 endpoint
  này gần như luôn báo "không tìm thấy" dù mã đúng).
- [ ] **(voucher-redeemed, nếu đã cấp cho đối tác)** Đối tác gọi `GET
  /api/v1/realtime/voucher-redeemed/<mã>` với voucher CHƯA dùng → nhận
  "không tìm thấy" (đúng hành vi lọc `STATUS=0`); với voucher ĐÃ dùng →
  ra đúng dữ liệu.
- [ ] Đối tác CHƯA được tick `voucher-redeemed` ở "Realtime được gọi" →
  gọi endpoint này → nhận lỗi `403` rõ ràng.
- [ ] 2 route cố định `/vouchers/check`/`/vouchers/redeem` (Phần 1 ở
  trên) hoạt động Y HỆT trước — bản 9.62 KHÔNG đụng/đổi gì 2 route này.

Không có bước nào ở Phần 2 làm mất dữ liệu đã có — 4 cột mới ở
`api.RealtimeEndpointDefs` đều NULLABLE, Endpoint realtime nào không khai
2 trường `KeyStripLeadingChar`/`Filter*` thì hành vi giữ nguyên như cũ.

---

# PHẦN 3 — Báo cáo "Doanh thu, lãi gộp theo ngành hàng" (BRGMART) + "Siêu thị NSO" (bản 9.63)

## F. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A).
2. DBA chạy lại NGUYÊN VĂN `etl-db/schema.sql` (tạo bảng mới
   `etl.NsoStores` — an toàn chạy lại nhiều lần, `IF OBJECT_ID(...) IS
   NULL`) và `etl-db/grants.sql` (thêm GRANT SELECT cho
   `etl_diem_stk_reader` trên bảng mới — **PHẢI chạy lại**, thiếu bước
   này trang "Siêu thị NSO" tạo được nhưng `rp-server` không đọc được dữ
   liệu, báo cáo sẽ coi MỌI siêu thị là LFL).
3. **CẦN DBA tạo trước** view `V_HCRC_HANGHONGHUY_NGANHHANG` trên
   DSMART16 (cột `GiaTriHongHuy`/`NganhHang`/`NgayGhiNhan`) — `NganhHang`
   là TÊN ngành hàng, PHẢI khớp (sau khi bỏ khoảng trắng 2 đầu) đúng 1
   trong 12 tên ngành hàng hardcode trong
   `rp-server/lib/nganhHangBrgRunner.js` (UltraFresh/Fresh/Bánh kẹo sữa
   thạch/Đồ uống, thuốc lá/Thực phẩm công nghệ/Nông sản, bột các loại/Mỹ
   phẩm (Cosmetic)/Hóa phẩm (Chemical)/Giấy và bông (Tissue and diaper)/
   Quần áo, giày dép, bông vải sợi/Gia dụng, VPP, đồ chơi/Other Nonfood)
   — tên không khớp sẽ ra "Giá trị hàng hỏng hủy" = 0 cho ngành hàng đó
   mà KHÔNG báo lỗi gì (kiểm tra kỹ ở bước G).
4. Khởi động lại `etl`, `etl-admin`, `rp-server` (3 service có đổi code
   — `api-server`/`api-admin` KHÔNG liên quan Phần 3, không cần restart
   lại nếu đã restart ở Phần 2).
5. Chạy job đồng bộ "Hàng hỏng hủy":
   ```bash
   cd etl
   node scripts/seedHangHongHuySync.js
   ```
   Tạo Sync Job mới, cron 15 phút — vào etl-admin → "Đồng bộ" → có thể
   bấm "Chạy thử" ngay nếu không muốn chờ tới chu kỳ đầu.
6. Tạo báo cáo mới trong danh mục:
   ```bash
   cd rp-server
   node scripts/seedNganhHangBrgReport.js
   ```
7. Vào etl-admin → **"Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng
   (BRGMART)"** → nhập `ChiTieuDoanhThu`/`ChiTieuLaiGop` theo từng ngành
   hàng (để trống Mã siêu thị — Chỉ tiêu nhập THEO TOÀN CÔNG TY, không
   tách chi nhánh, giống 2 trang Chỉ tiêu ngành hàng đã có).
8. **(Chỉ nếu có siêu thị mới mở trong kỳ)** — vào etl-admin →
   **"Siêu thị NSO"** → nhập/khai Mã Điểm siêu thị đó (trang này đủ bộ
   nút như "Ánh xạ Điểm - STK_ID": tải file mẫu, nhập Excel, sửa/thêm 1
   dòng, khoá/kích hoạt, xuất, chọn nhiều + xoá hàng loạt). Mã Điểm
   KHÔNG khai ở đây MẶC ĐỊNH tính là LFL — không cần khai danh sách LFL
   riêng.
9. Vào **Hệ thống → Phân quyền**, gán quyền XEM báo cáo mới
   (`bc-doanh-thu-nganhhang-brgmart`, "Báo cáo doanh thu, lãi gộp theo
   ngành hàng (BRGMART)") cho đúng vai trò, và gán quyền SỬA 2 trang
   admin mới (menu `nso-stores` "Siêu thị NSO" và
   `sales-targets-nganhhang-dt-brgmart` "Chỉ tiêu Doanh thu/Lãi gộp theo
   ngành hàng (BRGMART)") cho đúng nhóm quản lý — 2 script ở bước 5/6
   KHÔNG tự gán quyền, mặc định không vai trò nào thấy ngoài vai trò hệ
   thống.

## G. Kiểm tra Phần 3 sau khi triển khai

- [ ] rp-user → menu "Báo cáo Mua hàng" → mở báo cáo "Doanh thu, lãi gộp
  theo ngành hàng (BRGMART)" → đủ 3 khối "Toàn hệ thống BRG"/"LFL"/"NSO"
  (thể hiện qua cột "Khối", KHÔNG phải dòng tiêu đề gộp ngang — xem demo
  đã gửi) × 12 ngành hàng, mỗi khối có 1 dòng "Tổng cộng" tô đậm riêng.
- [ ] **(cột hàng hỏng hủy)** "Giá trị hàng hỏng hủy"/"Doanh thu cuối"
  CHỈ hiện số ở khối "Toàn hệ thống BRG" — khối "LFL"/"NSO" để trống
  "—" (ĐÚNG THIẾT KẾ, không phải lỗi).
- [ ] **(khớp tên ngành hàng — CHỈ áp dụng SAU KHI đã có view thật, xem
  lưu ý dưới)** Nếu TOÀN BỘ 12 dòng ở khối "Toàn hệ thống BRG" đều ra
  "Giá trị hàng hỏng hủy" = 0 dù `V_HCRC_HANGHONGHUY_NGANHHANG` chắc
  chắn có dữ liệu → kiểm tra lại cột `NganhHang` trong view có khớp (kể
  cả khoảng trắng, dấu câu) đúng 12 tên hardcode ở bước F.3 chưa —
  `SELECT DISTINCT NganhHang FROM V_HCRC_HANGHONGHUY_NGANHHANG` để so
  sánh trực tiếp.

**⚠️ Lưu ý (bản 9.66, ĐÃ XÁC NHẬN với người dùng)**: view
`V_HCRC_HANGHONGHUY_NGANHHANG` HIỆN **KHÔNG tồn tại** — DSMART chưa lưu
dữ liệu hàng hỏng hủy ở bất kỳ đâu (không phải chỉ thiếu VIEW gộp). Bước
F.3/F.5 (`seedHangHongHuySync.js`) sẽ KHÔNG chạy được/không có dữ liệu
cho tới khi xác định được bảng gốc — xem bộ SQL dò bảng gốc trong
`báo cáo doanh thu-lãi gộp theo ngành hàng BRGMART.md` mục 2. Trong lúc
chờ: báo cáo BRGMART vẫn chạy ĐÚNG với mọi cột khác, "Giá trị hàng hỏng
hủy" tự ra `0` (không phải lỗi) — có thể BỎ QUA bước F.3/F.5 và dòng
checklist "khớp tên ngành hàng" ở trên cho tới khi có view thật.

- [ ] **(phân loại NSO)** Siêu thị vừa khai ở "Siêu thị NSO" → xuất hiện
  Ở ĐÚNG khối "NSO" (không còn tính vào "LFL") sau khi job đồng bộ
  doanh thu chạy lại ít nhất 1 lần.
- [ ] etl-admin → "Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng (BRGMART)"
  → nhập thử 1 giá trị → báo cáo cập nhật đúng cột "Chỉ tiêu"/"% so chỉ
  tiêu" (cả 2 cụm Doanh thu và Lãi gộp).
- [ ] 2 báo cáo ngành hàng gốc/LDTD đã có từ trước (`bc-doanh-thu-nganhhang`,
  `bc-doanh-thu-nganhhang-ldtd`) hoạt động Y HỆT trước — bản 9.63 KHÔNG
  đụng/đổi gì 2 báo cáo đó (báo cáo mới hoàn toàn độc lập).

Không có bước nào ở Phần 3 làm mất dữ liệu đã có — bảng `etl.NsoStores`
là bảng MỚI, báo cáo `bc-doanh-thu-nganhhang-brgmart` và 2 trang admin
mới hoàn toàn ĐỘC LẬP với mọi báo cáo/trang đã có.

---

# PHẦN 4 — Sửa lỗi Tỷ lệ lãi gộp báo cáo BRGMART (bản 9.64)

**Điều kiện**: đã làm xong Phần 3 (báo cáo BRGMART đã seed) — nếu chưa,
làm Phần 3 trước, Phần 4 chỉ sửa lại 1 công thức tính của CHÍNH báo cáo
đó, không tạo gì mới.

## H. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A — bản 9.64 nằm CÙNG nhánh
   `main`, không cần lấy riêng).
2. `pm2 restart hcrc-rp-server` (đổi
   `rp-server/lib/nganhHangBrgRunner.js`).
3. KHÔNG cần đổi gì ở CSDL, KHÔNG cần chạy lại script seed nào.

## I. Kiểm tra Phần 4 sau khi triển khai

- [ ] Mở báo cáo "Doanh thu, lãi gộp theo ngành hàng (BRGMART)" → cột
  "Tỷ lệ" (cụm Lãi gộp) ở khối "Toàn hệ thống BRG" PHẢI = Giá trị lãi
  gộp ÷ **Doanh thu cuối** × 100 (CAO HƠN 1 chút so với chia cho Thực
  đạt — đúng nếu có hàng hỏng hủy > 0; NẾU hàng hỏng hủy đang ra `0`
  theo lưu ý ở Phần 3 mục G thì Doanh thu cuối = Thực đạt, 2 cách tính
  cho RA CÙNG 1 SỐ — không phân biệt được bằng mắt cho tới khi có dữ
  liệu hàng hỏng hủy thật, đây là hành vi ĐÚNG).
- [ ] Khối "LFL"/"NSO" — cột "Tỷ lệ" lãi gộp vẫn chia cho Thực đạt như
  cũ, KHÔNG đổi.
- [ ] "Giá trị" lãi gộp tuyệt đối và 2 cột "% so chỉ tiêu"/"% so cùng kỳ
  năm trước" của Lãi gộp — giữ nguyên số như trước bản 9.64 (không liên
  quan tới Doanh thu cuối).

Không có bước nào ở Phần 4 làm mất dữ liệu đã có — chỉ sửa 1 công thức
tính tại chỗ trong code, không đổi schema/domain/báo cáo catalog.
