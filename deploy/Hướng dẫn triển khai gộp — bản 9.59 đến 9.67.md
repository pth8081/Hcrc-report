# Hướng dẫn triển khai gộp — bản 9.59 đến 9.67 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 9.59 tới bản 9.67 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 9.58 và cần bắt
kịp bản mới nhất — KHÔNG lặp lại toàn bộ lịch sử trước đó (xem `deploy/Hướng
dẫn triển khai gộp — bản 8.91 đến 8.98.md` và `deploy/Hướng dẫn triển khai
gộp — bản 8.29 đến 8.90.md` nếu cần dựng server hoàn toàn mới từ đầu; các
bản 8.99 → 9.58 được coi là ĐÃ triển khai xong trên server này).

Gồm 3 phần ĐỘC LẬP, làm phần nào cũng được, không phụ thuộc nhau:

- **Phần 1 (mục B-C)** — bản 9.59/9.60/9.61: Voucher redeem gọi được
  NHIỀU máy chủ DSMART (vd thêm chi nhánh "Fuji") — 2 bản sau (9.60/9.61)
  CHỈ sửa lại hướng dẫn/bỏ hẳn cách làm qua script của bản 9.59, bên dưới
  đã viết THEO ĐÚNG cách làm CUỐI CÙNG (chỉ qua giao diện), không cần làm
  lại theo cách cũ rồi sửa tiếp.
- **Phần 2 (mục D-E)** — bản 9.62: API tra cứu voucher ĐÃ DÙNG cho đối
  tác ngoài (qua Endpoint realtime) + sửa lỗi khoá `BARCODE` còn sót ở
  endpoint nội bộ "voucher-check".
- **Phần 3 (mục F-G)** — bản 9.63/9.64/9.67: cập nhật 2 báo cáo "Doanh
  thu theo ngành hàng"/"(LDTD)" ĐÃ CÓ sang định dạng mới (3 khối "Toàn hệ
  thống BRG"/"LFL"/"NSO" + cụm Lãi gộp + "Giá trị hàng hỏng hủy") + trang
  khai báo MỚI "Siêu thị NSO" — viết THEO ĐÚNG bản CUỐI CÙNG (bản 9.63 ban
  đầu lỡ tạo 1 báo cáo thứ 3 riêng rồi bản 9.67 sửa lại gộp vào 2 báo cáo
  đã có, bản 9.64 sửa 1 công thức tính — bên dưới làm LUÔN đúng, không cần
  trải qua từng bước sửa).

**Bản 9.65/9.66 — KHÔNG có bước triển khai riêng** (chỉ sửa tài liệu
`.md`, không đụng code/schema/migration nào) — `git pull origin main` ở
mục A dưới đây là ĐỦ, tự động có luôn, không cần làm gì thêm:

- **9.65**: thêm quy ước "mỗi báo cáo phải có 1 tài liệu hướng dẫn riêng"
  (`CLAUDE.md`) + mục "Danh mục báo cáo" tổng hợp toàn bộ báo cáo
  (`hướng_dẫn_báo_cáo.md` mục 17).
- **9.66**: xác nhận với người dùng rằng DSMART **CHƯA có nguồn dữ liệu
  hàng hỏng hủy** — xem lưu ý ở Phần 3 mục G bên dưới.

---

## Tóm tắt những gì thay đổi (9.59 → 9.67)

| Bản | Nội dung |
|---|---|
| 9.59 | Voucher redeem gọi được NHIỀU máy chủ DSMART khác nhau (`api.VoucherSettings` từ 1 dòng → danh sách, mỗi dòng 1 `ConfigKey`) — bản đầu còn hướng dẫn thêm máy chủ mới qua script `.env` |
| 9.60 | SỬA LẠI hướng dẫn bản 9.59: BỎ cách qua script, chỉ dùng giao diện ("Nguồn dữ liệu" + "Cấu hình Voucher") |
| 9.61 | BỎ HẲN script `seed:voucher-datasource` khỏi code (không chỉ đổi hướng dẫn) — dữ liệu đã lưu trước đó GIỮ NGUYÊN |
| 9.62 | Thêm API cho đối tác NGOÀI tự tra voucher ĐÃ DÙNG (endpoint `voucher-redeemed`, qua cơ chế Endpoint realtime có sẵn) + sửa lỗi THẬT: endpoint nội bộ "voucher-check" vẫn khoá sai theo cột `BARCODE` (thường rỗng) thay vì `CARD_ID` — cùng lỗi đã sửa ở `/check`/`/redeem` từ bản 9.19 nhưng chưa áp dụng sang endpoint này |
| 9.63 | Thêm định dạng mới (3 khối + Lãi gộp + hàng hỏng hủy) cho báo cáo ngành hàng + trang "Siêu thị NSO" — BẢN ĐẦU lỡ tách thành 1 báo cáo thứ 3 riêng (đã sửa lại ở 9.67) |
| 9.64 | SỬA LỖI THẬT: cột "Tỷ lệ" lãi gộp phải chia cho Doanh thu CUỐI (= Thực đạt − hàng hỏng hủy), không phải Thực đạt thô |
| 9.65 | CHỈ tài liệu — quy ước bắt buộc "mỗi báo cáo 1 file hướng dẫn riêng" + mục "Danh mục báo cáo" tổng hợp |
| 9.66 | CHỈ tài liệu — xác nhận DSMART CHƯA có nguồn dữ liệu hàng hỏng hủy |
| 9.67 | SỬA LẠI bản 9.63 theo đúng yêu cầu người dùng ("đừng tách bc"): BỎ báo cáo thứ 3 riêng, áp dụng định dạng mới TRỰC TIẾP vào 2 báo cáo "Doanh thu theo ngành hàng"/"(LDTD)" ĐÃ CÓ, mỗi báo cáo giữ nguyên domain Chỉ tiêu riêng (không gộp chung) |

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

# PHẦN 3 — Định dạng mới cho báo cáo "Doanh thu theo ngành hàng"/"(LDTD)" + "Siêu thị NSO" (bản 9.63/9.64/9.67)

**KHÔNG tạo báo cáo mới** — cập nhật TRỰC TIẾP 2 báo cáo ĐÃ CÓ
(`bc-doanh-thu-nganhhang`, `bc-doanh-thu-nganhhang-ldtd`), mỗi báo cáo
GIỮ NGUYÊN domain Chỉ tiêu riêng đã có từ trước (KHÔNG tạo domain Chỉ
tiêu mới nào khác). Xem đầy đủ: `báo cáo doanh thu-nhập hàng theo ngành
hàng.md` (tài liệu riêng theo quy ước CLAUDE.md).

## F. Các bước triển khai

1. `git pull origin main` (đã làm ở mục A).
2. DBA chạy lại NGUYÊN VĂN `etl-db/schema.sql` (tạo bảng mới
   `etl.NsoStores` — an toàn chạy lại nhiều lần, `IF OBJECT_ID(...) IS
   NULL`) và `etl-db/grants.sql` (thêm GRANT SELECT cho
   `etl_diem_stk_reader` trên bảng mới — **PHẢI chạy lại**, thiếu bước
   này trang "Siêu thị NSO" tạo được nhưng `rp-server` không đọc được dữ
   liệu, báo cáo sẽ coi MỌI siêu thị là LFL).
3. Khởi động lại `etl`, `etl-admin`, `rp-server` (3 service có đổi code
   — `api-server`/`api-admin` KHÔNG liên quan Phần 3, không cần restart
   lại nếu đã restart ở Phần 2).
4. Cập nhật lại định nghĩa 3 báo cáo ngành hàng (2 báo cáo doanh thu
   chuyển sang định dạng mới, báo cáo nhập hàng GIỮ NGUYÊN không đổi):
   ```bash
   cd rp-server
   node scripts/seedNganhHangReports.js
   ```
5. Vào etl-admin → **"Chỉ tiêu Doanh thu theo ngành hàng"** VÀ **"Chỉ
   tiêu Doanh thu theo ngành hàng (LDTD)"** (2 trang ĐÃ CÓ, không phải
   trang mới) → có thể thêm cột `ChiTieuLaiGop` vào file Excel nhập Chỉ
   tiêu (ngoài `ChiTieuDoanhThu` đã có) nếu muốn có cột "% so chỉ tiêu"
   của cụm Lãi gộp — để trống MaSieuThi, điền MaNganhHang.
6. **(Chỉ nếu có siêu thị mới mở trong kỳ)** — vào etl-admin →
   **"Siêu thị NSO"** (trang mới) → nhập/khai Mã Điểm siêu thị đó (đủ bộ
   nút như "Ánh xạ Điểm - STK_ID": tải file mẫu, nhập Excel, sửa/thêm 1
   dòng, khoá/kích hoạt, xuất, chọn nhiều + xoá hàng loạt). Mã Điểm
   KHÔNG khai ở đây MẶC ĐỊNH tính là LFL — danh sách này DÙNG CHUNG cho
   CẢ 2 báo cáo doanh thu, không khai riêng theo từng báo cáo.
7. Vào **Hệ thống → Phân quyền**, gán quyền SỬA trang admin mới ("Siêu
   thị NSO", menu `nso-stores`) cho đúng nhóm quản lý — bước 4 KHÔNG tự
   gán quyền trang này (quyền XEM 2 báo cáo doanh thu nếu server đã gán
   từ trước thì GIỮ NGUYÊN, không cần gán lại).

## G. Kiểm tra Phần 3 sau khi triển khai

- [ ] rp-user → menu "Báo cáo Mua hàng" → mở **"Báo cáo doanh thu theo
  ngành hàng"** → đủ 3 khối "Toàn hệ thống BRG"/"LFL"/"NSO" (thể hiện qua
  cột "Khối", KHÔNG phải dòng tiêu đề gộp ngang) × 12 ngành hàng, mỗi
  khối có 1 dòng "Tổng cộng" tô đậm riêng — khác hẳn bố cục cũ (phẳng,
  thiếu cột "Mã ngành hàng"/"entityCode" không có nhãn).
- [ ] Mở **"Báo cáo doanh thu theo ngành hàng (LDTD)"** → CÙNG bố cục,
  CÙNG dữ liệu Thực đạt, nhưng cột "Chỉ tiêu" ĐỘC LẬP với báo cáo gốc
  (đọc từ domain `sales-targets-nganhhang-dt-ldtd` riêng).
- [ ] **(cột hàng hỏng hủy)** "Giá trị hàng hỏng hủy"/"Doanh thu cuối"
  CHỈ hiện số ở khối "Toàn hệ thống BRG" — khối "LFL"/"NSO" để trống
  "—" (ĐÚNG THIẾT KẾ, không phải lỗi).
- [ ] **(Tỷ lệ lãi gộp, bản 9.64)** Cột "Tỷ lệ" (cụm Lãi gộp) ở khối
  "Toàn hệ thống BRG" PHẢI = Giá trị lãi gộp ÷ **Doanh thu cuối** × 100.
  Khối "LFL"/"NSO" vẫn chia cho Thực đạt.
- [ ] **(hàng hỏng hủy = 0, bản 9.66)** View `V_HCRC_HANGHONGHUY_NGANHHANG`
  **HIỆN CHƯA TỒN TẠI** (DSMART chưa lưu dữ liệu hàng hỏng hủy ở đâu —
  đã xác nhận với người dùng 18/10/2026) — "Giá trị hàng hỏng hủy" sẽ ra
  `0` ở MỌI ngành hàng cho tới khi có nguồn dữ liệu thật, đây là hành vi
  AN TOÀN, KHÔNG phải lỗi; "Doanh thu cuối" = Thực đạt, Tỷ lệ lãi gộp tự
  dùng đúng Thực đạt làm mẫu số lúc này. Xem bộ SQL dò bảng gốc trong
  `báo cáo doanh thu-nhập hàng theo ngành hàng.md` mục 8 khi cần tìm
  nguồn dữ liệu thật.
- [ ] **(phân loại NSO)** Siêu thị vừa khai ở "Siêu thị NSO" → xuất hiện
  Ở ĐÚNG khối "NSO" (không còn tính vào "LFL") sau khi job đồng bộ
  doanh thu chạy lại ít nhất 1 lần — ở CẢ 2 báo cáo doanh thu (danh sách
  NSO dùng chung).
- [ ] Báo cáo **"Nhập hàng theo ngành hàng"** hoạt động Y HỆT trước (bố
  cục phẳng cũ, không có khối/Lãi gộp) — Phần 3 KHÔNG đụng/đổi gì báo
  cáo này.

Không có bước nào ở Phần 3 làm mất dữ liệu đã có — bảng `etl.NsoStores`
là bảng MỚI; `DefinitionJson` của 2 báo cáo doanh thu được GHI ĐÈ sang
định dạng mới (không mất Chỉ tiêu đã nhập, vẫn đọc từ domain Chỉ tiêu cũ
y nguyên).
