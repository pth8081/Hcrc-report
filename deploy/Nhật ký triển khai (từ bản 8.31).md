# Nhật ký triển khai — từ bản 8.31 trở đi

**TỰ ĐỘNG, không cần nhắc**: kể từ khi người dùng yêu cầu (03/10/2026),
MỌI lần merge vào `main` từ bản 8.31 trở đi PHẢI kèm thêm 1 mục MỚI ở
đầu file này (mới nhất lên trên, giống quy ước `VERSION.md`), tóm tắt
đúng CÁC BƯỚC triển khai thật trên server (lệnh chạy, file cần sửa tay,
thứ tự làm) — không chỉ mô tả tính năng. Việc này KHÔNG thay thế từng file
riêng `deploy/Cập nhật bản X.Y — ....md` (vẫn tạo như cũ, tiện khi chỉ cần
đưa đúng 1 bản cho IT) — file NÀY là bản gộp MỘT NƠI DUY NHẤT để xem lại
toàn bộ lịch sử triển khai liên tục, không phải mở nhiều file. TIẾP TỤC
cập nhật file này ở mọi bản sau, cho tới khi người dùng bảo dừng. (File
tạo lần đầu ở bản 8.36 — ghi sẵn 8.34/8.35; sau đó lùi mốc bắt đầu về đúng
bản 8.31 theo yêu cầu người dùng, bổ sung đủ 3 mục 8.31/8.32/8.33.)

---

## 9.70 — Sửa lỗi "mã Điểm không ra tên" khi siêu thị chưa có doanh thu trong ngày

**Thay đổi**: xem chi tiết đầy đủ ở `VERSION.md`. Tóm tắt: sửa
`rp-server/lib/diemStkMapping.js` — cột "Siêu thị/Cửa hàng" ở báo cáo
`bc-doanh-thu-ldtd`/`bc-doanh-thu-hcrc`/`bc-top5-chi-nhanh` giờ hiện đúng
TÊN siêu thị dù siêu thị đó CHƯA có dòng doanh thu trong ngày (vd đang
kiểm kê, chưa bắt đầu bán). KHÔNG đổi schema CSDL, KHÔNG đổi file cấu
hình/biến môi trường.

**Các bước**:

1. Chỉ cần build/restart lại `rp-server` (file sửa chỉ ở
   `rp-server/lib/diemStkMapping.js`, không động tới `etl`/`etl-admin`/
   `api-server`/`rp-user`):
   ```
   cd rp-server
   npm run build   # nếu có bước build riêng, theo đúng quy trình hiện tại
   # restart tiến trình rp-server (pm2/systemd/... theo cách đang chạy)
   ```
2. **Không cần** mở internet (không thêm/đổi gói npm nào ở bản này).
3. Kiểm tra: mở lại báo cáo "Doanh thu LĐTĐ"/"Doanh thu HCRC" (rp-user)
   đúng ngày có siêu thị đang kiểm kê/chưa mở bán — cột "Siêu thị/Cửa
   hàng" phải hiện TÊN đúng (không còn hiện mã số thô) cho các mã Điểm
   đó, trong khi các cột doanh thu/tỷ lệ đạt của đúng dòng đó vẫn hiện
   trống (không phải số 0) — đúng hành vi "chưa có dữ liệu" như trước.

---

## 9.69 — Đổi phông chữ báo cáo sang Inter (web + Excel + PDF)

**Thay đổi**: xem chi tiết đầy đủ ở `VERSION.md`. Tóm tắt: đổi phông chữ
báo cáo từ `system-ui`/Calibri/Noto Sans Vietnamese (không đồng nhất giữa
web/Excel/PDF) sang **Inter** ở CẢ 3 nơi — theo yêu cầu người dùng, đã
demo 4 lựa chọn qua Artifact trước khi chọn.

**Các bước**:

**LƯU Ý server KHÔNG có internet** (theo người dùng xác nhận — cách làm
hiện tại: MỞ internet tạm thời trên máy chủ, cài gói xong rồi ĐÓNG lại)
— bước 2 dưới đây là bước DUY NHẤT ở bản này cần internet (tải gói npm
mới), mọi bước còn lại (build/restart/kiểm tra) không cần mạng ngoài.
Font Inter TỰ ĐÓNG GÓI vào bundle/file xuất (không gọi ra ngoài lúc
chạy) — xem `VERSION.md` — nên sau khi cài xong gói + build/restart,
ĐÓNG internet lại bình thường, không ảnh hưởng gì tới việc hiển thị
font sau đó.

1. `git pull origin main`.
2. **MỞ internet tạm thời trên máy chủ**, rồi `npm install` ở CẢ
   `rp-user` (thêm `@fontsource/inter`) VÀ `rp-server` (đổi
   `@openfonts/noto-sans_vietnamese` sang `@openfonts/inter_vietnamese`
   — `package-lock.json` đã cập nhật, `npm install` tự xử lý đúng). Cài
   xong là **ĐÓNG internet lại** như thường lệ — không bước nào sau đây
   cần mạng ngoài nữa.
3. `cd rp-user && npm run build` (bundle tĩnh phục vụ qua pm2/nginx PHẢI
   build lại — font + `styles.css`/`main.jsx` đổi).
4. `pm2 restart hcrc-rp-server` (export Excel/PDF đổi font nhúng).
5. Mở lại 1 báo cáo bất kỳ (web, qua điện thoại/máy tính trong mạng nội
   bộ, KHÔNG cần mạng ngoài) — chữ đổi sang Inter, dấu tiếng Việt vẫn
   hiển thị đúng (kiểm bằng mắt 1-2 dòng có dấu, vd tên ngành hàng).
6. Xuất thử **Excel** VÀ **PDF** của 1 báo cáo — mở file, kiểm font tên
   ô là "Inter" (Excel: bôi đen 1 ô, xem ô "Font" trên thanh công cụ).
   **LƯU Ý**: Excel chỉ hiện đúng Inter nếu MÁY MỞ FILE có cài font này
   — máy chưa cài vẫn mở được bình thường, chỉ tự thay bằng font mặc
   định của máy đó (không lỗi, không mất dữ liệu).

Không có bước nào ở bản này làm mất dữ liệu — chỉ đổi font hiển thị/xuất,
không đụng CSDL/schema/API nào. KHÔNG có dependency nào gọi ra internet
LÚC CHẠY — chỉ bước 2 (cài gói) cần mạng, 1 LẦN DUY NHẤT lúc deploy.

---

## 9.68 — Bán lẻ/Bán buôn + Giá trị hàng hỏng hủy cho 2 báo cáo doanh thu theo ngành hàng

**Thay đổi**: xem chi tiết đầy đủ ở `VERSION.md` + `báo cáo doanh thu-nhập
hàng theo ngành hàng.md` (mục 1/2/3/5/8 viết lại). Tóm tắt: VIEW
`V_HCRC_DOANHTHU_NGANHHANG` thêm 5 cột (Bán lẻ/Bán buôn + Giá trị hàng
hỏng hủy); runner viết lại hoàn toàn (30 cột, dòng tiêu đề ngang mỗi
khối thay cho cột "Khối"); XOÁ hẳn job/domain hàng hỏng hủy riêng cũ.

**Các bước** (áp dụng cho CẢ 2 trường hợp — server CHƯA deploy gì từ bản
9.63 trở đi, HOẶC đã deploy tới bản 9.67 — không có bước dọn dẹp đặc biệt,
mọi thay đổi THÊM cột/measure, không xoá/đổi tên cột cũ nào):

1. `git pull origin main`.
2. Chạy LẠI file `deploy/Thiết lập VIEW Doanh thu-Nhập hàng theo Ngành
   hàng Lịch sử (DSMART16_EOM).sql` trên `DSMART16_EOM` NẾU server đã có
   job Lịch sử (`--with-history`) — file này tự `CREATE OR ALTER`, an
   toàn chạy lại nhiều lần. Đồng thời chạy lại VIEW Live
   `V_HCRC_DOANHTHU_NGANHHANG` trên `DSMART16` (xem SQL đầy đủ ở mục 2
   `báo cáo doanh thu-nhập hàng theo ngành hàng.md`) — DBA tự chạy trực
   tiếp trên server CSDL, không qua ứng dụng.
3. `node etl/scripts/seedNganhHangSync.js` (thêm `--with-history` nếu
   bước 2 có làm VIEW Lịch sử) — CẬP NHẬT (không tạo mới) 2 job "Doanh
   thu theo ngành hàng" đã có, thêm 5 measureColumns mới vào
   `MeasureColumnsJson`.
4. KHÔNG cần chạy `node etl/scripts/seedHangHongHuySync.js` nữa (file đã
   XOÁ khỏi repo) — nếu server trước đó NGẪU NHIÊN có tạo job/domain
   `hanghonghuy_nganhhang` (thực tế không có, domain này luôn rỗng vì
   chưa từng xác định được nguồn) thì không cần dọn gì, job đó (nếu có)
   chỉ đơn giản không còn script nào cập nhật — có thể xoá tay job đó
   trong etl-admin → Đồng bộ nếu muốn dọn cho sạch (KHÔNG BẮT BUỘC).
5. `node rp-server/scripts/seedNganhHangReports.js` — chạy lại cho chắc
   (idempotent, `DefinitionJson` của 2 báo cáo doanh thu không đổi ở bản
   này, chỉ runner code đổi — bước này không bắt buộc nhưng an toàn).
6. `pm2 restart hcrc-rp-server` (runner/export Excel/PDF đổi) +
   `cd rp-user && npm run build` (DataTable.jsx đổi, cần build lại bundle
   tĩnh phục vụ qua pm2/nginx).
7. Vào etl-admin → Đồng bộ → "Chạy thử" 2 job "Doanh thu theo ngành
   hàng - Live" — xác nhận đồng bộ xong không lỗi (lỗi "thiếu cột" nghĩa
   là bước 2 chưa chạy xong trên đúng CSDL).
8. Mở lại 2 báo cáo "Doanh thu theo ngành hàng"/"(LDTD)" (web + xuất
   Excel/PDF) — kiểm tra: dòng tiêu đề ngang "Toàn hệ thống BRG"/"LFL"/
   "NSO" hiện đúng (merge hết cột), 24 cột Total/Bán lẻ/Bán buôn có số
   hợp lý, nhóm "Giá trị hàng hỏng hủy" (đỏ) có số (có thể = 0 nếu kỳ đó
   không phát sinh mã 318), "Tỷ lệ" lãi gộp mọi khối chia theo Doanh thu
   cuối (không còn chỉ riêng khối BRG).

---

## 9.67 — SỬA LẠI bản 9.63: gộp định dạng ngành hàng mới vào 2 báo cáo đã có

**Thay đổi**: xem chi tiết đầy đủ ở `VERSION.md` + `báo cáo doanh thu-nhập
hàng theo ngành hàng.md` (viết lại toàn bộ). Tóm tắt: KHÔNG còn báo cáo
thứ 3 "(BRGMART)" — định dạng mới (3 khối + Lãi gộp + hàng hỏng hủy) nay
áp dụng TRỰC TIẾP cho `bc-doanh-thu-nganhhang`/`bc-doanh-thu-nganhhang-ldtd`.

**Các bước (THAY THẾ hoàn toàn Phần 3/4 trong `deploy/Hướng dẫn triển khai
gộp — bản 9.59 đến 9.66.md` cũ — dùng file MỚI `...đến 9.67.md`):**

Xem đầy đủ ở Phần 3 (mục F-G) của `deploy/Hướng dẫn triển khai gộp — bản
9.59 đến 9.67.md`. Tóm tắt nhanh nếu server ĐÃ LỠ chạy theo hướng dẫn
"đến 9.66" cũ (tạo báo cáo `bc-doanh-thu-nganhhang-brgmart` + trang Chỉ
tiêu BRGMART riêng):

1. `git pull origin main`.
2. `node rp-server/scripts/seedNganhHangReports.js` — tự động cập nhật
   lại `bc-doanh-thu-nganhhang`/`bc-doanh-thu-nganhhang-ldtd` sang định
   dạng mới (ghi đè `DefinitionJson`, không mất Chỉ tiêu đã nhập).
3. Báo cáo `bc-doanh-thu-nganhhang-brgmart` (nếu đã lỡ tạo) giờ không
   còn script nào cập nhật nữa (đã xoá `seedNganhHangBrgReport.js`) — vào
   Hệ thống → Biểu mẫu → tab "Báo cáo", XOÁ TAY báo cáo này (không có số
   liệu khác biệt với báo cáo gốc nữa, trùng lặp).
4. Trang Chỉ tiêu "sales-targets-nganhhang-dt-brgmart" (nếu đã lỡ nhập
   dữ liệu) — dữ liệu đó GIỮ NGUYÊN trong CSDL (không bị xoá), nhưng
   KHÔNG còn trang nào đọc/ghi domain này nữa (route đã gỡ khỏi
   `etl/server.js`) — nếu có nhập `ChiTieuLaiGop` ở đó, nhập LẠI vào 1
   trong 2 trang Chỉ tiêu ĐÃ CÓ (`sales-targets-nganhhang-dt`/`-ldtd`).
5. `pm2 restart hcrc-rp-server hcrc-etl` + `cd etl-admin && npm run
   build` (route/trang Chỉ tiêu BRGMART đã gỡ khỏi menu).

## 9.66 — Xác nhận: DSMART CHƯA có nguồn dữ liệu hàng hỏng hủy (BRGMART)

**Thay đổi**: CHỈ sửa tài liệu (`báo cáo doanh thu-lãi gộp theo ngành
hàng BRGMART.md`) — KHÔNG đổi code, KHÔNG có migration CSDL.

**Các bước:** `git pull origin main` — không cần restart service nào,
không cần chạy script nào. Báo cáo BRGMART (nếu đã seed ở bản 9.63) tiếp
tục chạy bình thường, chỉ "Giá trị hàng hỏng hủy" ra `0` thay vì số thật
cho tới khi xác định được nguồn dữ liệu — xem file tài liệu mục 2 để biết
bộ SQL dò bảng gốc đã gửi người dùng/DBA.

## 9.65 — Quy ước bắt buộc: mỗi báo cáo 1 file hướng dẫn riêng + danh mục tổng hợp

**Thay đổi**: CHỈ tài liệu (`.md`) — KHÔNG đụng code/schema/migration nào,
KHÔNG cần restart service nào.

**Các bước:**
1. `git pull origin main`.
2. Không có gì khác để làm trên server — đây là tài liệu tham khảo, xem
   mục 17 `hướng_dẫn_báo_cáo.md` ("Danh mục báo cáo") để tra cứu file
   hướng dẫn riêng của từng báo cáo khi cần dựng lại/di chuyển server.

## 9.64 — Sửa lỗi THẬT: "Tỷ lệ" lãi gộp (BRGMART) phải tính trên Doanh thu CUỐI, không phải Thực đạt thô

**Thay đổi**: chỉ sửa công thức trong `rp-server/lib/nganhHangBrgRunner.js`
— KHÔNG có migration CSDL mới, KHÔNG cần chạy lại script seed nào. Báo
cáo `bc-doanh-thu-nganhhang-brgmart` CHƯA từng có số liệu thật (chờ view
`V_HCRC_HANGHONGHUY_NGANHHANG` — xem bản 9.63) nên bản này KHÔNG ảnh
hưởng số liệu đã xem/gửi cho ai.

**Các bước:**
1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server`.
3. Nếu đang triển khai GỘP CHUNG với bản 9.63 (xem `deploy/Hướng dẫn
   triển khai gộp — bản 9.59 đến 9.63.md`) — chỉ cần `git pull` 1 lần là
   đã có luôn fix này (commit sau nằm trên CÙNG nhánh `main`), không cần
   làm thêm bước riêng nào khác ngoài Phần 3 của hướng dẫn gộp đó.
4. Kiểm tra: mở báo cáo "Doanh thu, lãi gộp theo ngành hàng (BRGMART)" →
   cột "Tỷ lệ" (cụm Lãi gộp) ở khối "Toàn hệ thống BRG" PHẢI = Giá trị
   lãi gộp ÷ Doanh thu cuối × 100 (cao hơn 1 chút so với chia cho Thực
   đạt) — khối "LFL"/"NSO" vẫn chia cho Thực đạt như cũ (không đổi).

## 9.63 — Báo cáo "Doanh thu, lãi gộp theo ngành hàng" (BRGMART) theo mẫu Excel mới + "Siêu thị NSO"

**Thay đổi**: thêm bảng mới `etl.NsoStores` (an toàn — `IF OBJECT_ID(...) IS NULL`,
không ảnh hưởng bảng cũ), 1 GRANT mới, báo cáo mới RIÊNG (không đụng báo
cáo ngành hàng gốc/LDTD), 1 job đồng bộ mới, 1 trang Chỉ tiêu mới.

**Các bước:**
1. `git pull origin main`.
2. DBA chạy lại `etl-db/schema.sql` (tạo bảng `etl.NsoStores`, an toàn
   chạy lại nhiều lần) và `etl-db/grants.sql` (thêm GRANT SELECT cho
   `etl_diem_stk_reader` trên bảng mới — PHẢI chạy lại, nếu không trang
   "Siêu thị NSO" sẽ không đọc được từ `rp-server`).
3. **CẦN DBA tạo trước** view `V_HCRC_HANGHONGHUY_NGANHHANG` trên
   DSMART16 (cột `GiaTriHongHuy`/`NganhHang`/`NgayGhiNhan`, `NganhHang`
   là TÊN ngành hàng — PHẢI khớp (sau khi bỏ khoảng trắng 2 đầu) đúng 1
   trong 12 tên ngành hàng hardcode trong
   `rp-server/lib/nganhHangBrgRunner.js` — tên không khớp sẽ ra "Giá trị
   hàng hỏng hủy" = 0 cho ngành hàng đó mà không báo lỗi gì).
4. Khởi động lại `etl`, `etl-admin`, `rp-server` (3 service có đổi code).
5. Chạy job đồng bộ "Hàng hỏng hủy":
   ```
   cd etl
   node scripts/seedHangHongHuySync.js
   ```
   (tạo Sync Job mới, cron 15 phút — vào etl-admin → "Đồng bộ" bật/kiểm
   tra chạy thử nếu cần ngay không chờ tới chu kỳ).
6. Tạo báo cáo mới trong danh mục:
   ```
   cd rp-server
   node scripts/seedNganhHangBrgReport.js
   ```
7. Vào etl-admin → "Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng (BRGMART)"
   nhập `ChiTieuDoanhThu`/`ChiTieuLaiGop` theo từng ngành hàng (để trống
   Mã siêu thị — Chỉ tiêu nhập THEO TOÀN CÔNG TY, không tách chi nhánh).
8. (Nếu có siêu thị mới mở trong kỳ) — vào etl-admin → "Siêu thị NSO" →
   nhập/khai Mã Điểm siêu thị đó (mirror đúng bộ nút "Ánh xạ Điểm - STK_ID"
   — tải file mẫu, nhập Excel, sửa/thêm 1 dòng, khoá/kích hoạt, xuất,
   chọn nhiều + xoá hàng loạt). Mã Điểm KHÔNG khai ở đây MẶC ĐỊNH tính
   là LFL.
9. Vào Hệ thống → Phân quyền, gán quyền XEM báo cáo mới
   (`bc-doanh-thu-nganhhang-brgmart`) cho đúng vai trò, và gán quyền SỬA
   2 trang admin mới ("Siêu thị NSO", "Chỉ tiêu Doanh thu/Lãi gộp theo
   ngành hàng (BRGMART)") cho đúng nhóm quản lý — chưa gán sẵn, mặc định
   không ai thấy ngoài vai trò hệ thống.
10. Mở báo cáo trên rp-user, kiểm tra: đủ 3 khối "Toàn hệ thống BRG"/
    "LFL"/"NSO" × 12 ngành hàng, "Giá trị hàng hỏng hủy"/"Doanh thu cuối"
    CHỈ hiện số ở khối "Toàn hệ thống BRG" (LFL/NSO để trống "—" theo
    thiết kế, KHÔNG phải lỗi).

## 9.62 — API tra cứu voucher ĐÃ DÙNG cho đối tác ngoài (qua Endpoint realtime) + sửa lỗi khoá BARCODE còn sót

**Thay đổi**: `api-db/schema.sql` thêm 4 cột NULLABLE (an toàn chạy lại
nhiều lần, không ảnh hưởng endpoint cũ), `api-server`/`api-admin` (engine +
route + UI), 1 script mới. KHÔNG đụng gì tới 2 route `/vouchers/check`/
`redeem` cố định.

**Các bước:**
1. `git pull origin main`.
2. DBA chạy lại `api-db/schema.sql` (an toàn chạy lại nhiều lần).
3. Khởi động lại `api-server` và `api-admin`.
4. **SỬA LỖI quan trọng** — endpoint nội bộ "voucher-check" (nhân viên tra
   thủ công) đã khoá SAI theo `BARCODE` từ trước tới nay (hầu như luôn
   "không tìm thấy" trên dữ liệu thật) — chạy lại:
   ```
   cd api-server
   npm run seed:voucher-check-endpoint
   ```
5. (Nếu cần cấp cho đối tác NGOÀI tự lấy voucher đã dùng) — tạo endpoint
   mới:
   ```
   cd api-server
   npm run seed:voucher-redeemed-endpoint
   ```
   Sau đó vào api-admin → "Đối tác" → chọn đối tác → "Realtime được gọi"
   → tick `voucher-redeemed` → Lưu. Gửi đối tác file
   `api-voucher-redeemed-gui-doi-tac.md` (tài liệu riêng, đã viết sẵn).
6. (Nếu có báo cáo "Tra cứu voucher" nội bộ trên rp-user đã tạo trước đó
   bằng `rp-server/scripts/seedVoucherCheckReport.js`) — chạy lại script
   đó để cập nhật đúng cột/field mới (`BARCODE`→`CARD_ID`):
   ```
   cd rp-server
   node scripts/seedVoucherCheckReport.js
   ```
7. Gọi thử `GET /api/v1/realtime/voucher-check/<mã-quét>` (nội bộ) và/hoặc
   `GET /api/v1/realtime/voucher-redeemed/<mã-quét>` (đối tác, nếu đã cấp)
   với 1 mã ĐÃ dùng thật để xác nhận ra đúng dữ liệu.

## 9.61 — Bỏ hẳn script seed:voucher-datasource (chỉ dùng giao diện cho "Nguồn dữ liệu")

**Thay đổi**: chỉ sửa code/doc, KHÔNG có migration CSDL mới. Nếu máy chủ
đã từng chạy `npm run seed:voucher-datasource` trước đây (bản 9.59/9.60)
thì dữ liệu đã lưu trong "Nguồn dữ liệu"/"Cấu hình Voucher" GIỮ NGUYÊN,
không mất gì — chỉ bỏ hẳn CÁCH chạy script, không xoá dữ liệu.

**Các bước:**
1. `git pull origin main` → khởi động lại `api-server`.
2. Lệnh `npm run seed:voucher-datasource` KHÔNG còn tồn tại — từ nay
   dùng DUY NHẤT giao diện: "Nguồn dữ liệu" (tạo/sửa dòng DSMART16) →
   "Cấu hình Voucher" (chọn đúng dòng đó cho `default` hoặc máy chủ mới).
3. Có thể xoá các biến `VOUCHER_DSMART16_SERVER/PORT/DATABASE/USER/
   PASSWORD/ENCRYPT/TRUST_CERT` khỏi `.env` nếu đã từng điền (không còn
   gì đọc các biến này) — không bắt buộc, để lại cũng không ảnh hưởng gì.

## 9.60 — Sửa hướng dẫn thêm máy chủ DSMART mới (bản 9.59): BỎ cách qua script, CHỈ dùng giao diện

**Thay đổi**: chỉ sửa code/doc, KHÔNG có migration CSDL mới (schema bản
9.59 giữ nguyên).

**Các bước:**
1. `git pull origin main` → khởi động lại `api-server`.
2. Nếu đã LỠ chạy `seed:voucher-datasource` với
   `VOUCHER_DSMART16_CONFIG_KEY` khác `default` theo hướng dẫn bản 9.59
   (SỬA các biến `VOUCHER_DSMART16_SERVER/USER/PASSWORD` trong `.env`
   thành thông tin máy chủ khác) — kiểm tra lại `.env` đã được trả về
   ĐÚNG thông tin máy chủ `default` chưa, chạy lại
   `npm run seed:voucher-datasource` (không kèm biến CONFIG_KEY) nếu cần.
3. Thêm máy chủ DSMART mới từ nay CHỈ làm qua giao diện (xem
   `api-voucher-check-redeem.md` mục "Bước 4"): "Nguồn dữ liệu" → tạo
   dòng mới cho máy chủ đó → "Cấu hình Voucher" → "+ Tạo cấu hình mới" →
   chọn đúng dòng vừa tạo.

## 9.59 — Voucher redeem nhiều máy chủ DSMART (vd thêm chi nhánh "Fuji")

**Thay đổi**: `api-db/schema.sql` (migration tự chạy, an toàn chạy lại
nhiều lần), `api-server` (route/service/script), `api-admin` (2 trang
UI). KHÔNG ảnh hưởng app voucher/đối tác hiện tại — API `/check`,`/redeem`
cũ giữ nguyên hành vi.

**Các bước:**
1. `git pull origin main`.
2. DBA chạy lại `api-db/schema.sql` (an toàn chạy lại nhiều lần — tự
   chuyển `api.VoucherSettings` từ 1 dòng sang danh sách, giữ nguyên cấu
   hình cũ vào dòng `default`).
3. Khởi động lại `api-server` và `api-admin`.
4. (Chỉ khi cần thêm máy chủ DSMART mới, vd "Fuji") — 2 cách:
   - Script: `cd api-server`, điền `.env` các biến `VOUCHER_DSMART16_*` +
     thêm `VOUCHER_DSMART16_CONFIG_KEY=fuji` (và đổi
     `VOUCHER_DSMART16_NAME`), chạy `npm run seed:voucher-datasource`.
   - Hoặc thủ công: api-admin → "Cấu hình Voucher" → "+ Tạo cấu hình
     mới" → đặt mã (vd `fuji`) + tên (vd "Voucher redeem Fuji") + chọn
     "Nguồn dữ liệu" (đã khai trước ở trang "Nguồn dữ liệu", trỏ đúng
     DSMART16 của Fuji).
5. Vào "Đối tác" → chọn đối tác sẽ gọi server mới → nút "Cấu hình Voucher
   được gọi" → tick đúng mã (vd `fuji`) → Lưu. Thiếu bước này, đối tác
   gọi `/vouchers/fuji/check|redeem` sẽ bị `403`.
6. Báo đội app voucher: khi người dùng chọn "Fuji" trong app, gọi
   `/api/v1/vouchers/fuji/check` và `/api/v1/vouchers/fuji/redeem` (thay
   vì `/check`,`/redeem`) — request/response giữ nguyên như tài liệu cũ.
7. Gọi thử `/vouchers/fuji/check` với 1 mã thật bên server Fuji để xác
   nhận.

## 9.58 — XÁC ĐỊNH NGUYÊN NHÂN THẬT: khoảng trắng thừa trong mã kho (CHAR cố định độ dài từ DSMART)

**Thay đổi**: `rp-server/lib/reportFactsHelpers.js` — chỉ sửa code, KHÔNG
cần chạy SQL/script gì thêm. Đây nhiều khả năng là bản sửa CUỐI CÙNG cho
chuỗi lỗi "Core stock = 0 trống" — áp dụng cho MỌI domain, không riêng
`tonkho_sku`.

**Các bước:**
1. `git pull origin main` → khởi động lại `rp-server`.
2. Chạy lại báo cáo "Core stock = 0 (Mart)"/"(Minimart)" cho đúng chi
   nhánh đã test trước đó ("HP Hàm Tử Quan", "HP Lương Đình Của"...) — kỳ
   vọng ra DỮ LIỆU THẬT (nếu tồn kho ước tính hôm nay <= ngưỡng).

## 9.57 — "Core stock = 0": chẩn đoán sâu hơn khi domain tồn kho "trống" dù CSDL xác nhận có dữ liệu

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — chỉ sửa code, KHÔNG
cần chạy lại script seed.

**Các bước:**
1. `git pull origin main` → khởi động lại `rp-server`.
2. Chạy lại báo cáo "Core stock = 0 (Mart)", chọn ĐÚNG 1 kho đã xác nhận
   có dữ liệu thật (vd "HP Hàm Tử Quan") — đọc kỹ nội dung cảnh báo mới,
   gửi lại cho IT/Claude để xác định chính xác bước tiếp theo (server/CSDL
   sai, hay lệch định dạng mã kho).

## 9.56 — "Core stock = 0": dropdown "Chi nhánh" chỉ dùng "Ánh xạ Điểm - STK_ID" cho tên

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — chỉ sửa code, KHÔNG
cần chạy lại script seed.

**Các bước:**
1. `git pull origin main` → khởi động lại `rp-server`.
2. Mở lại dropdown "Chi nhánh" — tên hiện ra giờ CHỈ theo đúng `TenSieuThi`
   đã khai trong "Ánh xạ Điểm - STK_ID". Nếu thấy mã kho thô (chưa ra tên)
   hoặc tên trùng lặp 2 dòng — vào etl-admin → "Ánh xạ Điểm - STK_ID" bổ
   sung/rà soát lại dòng tương ứng (không phải lỗi code).

## 9.55 — "Core stock = 0": sửa lỗi dropdown "Chi nhánh" hiện mã kho thay vì tên

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — chỉ sửa code, KHÔNG
cần chạy lại script seed (khác bản 9.54).

**Các bước:**
1. `git pull origin main` → khởi động lại `rp-server`.
2. Mở lại dropdown "Chi nhánh" ở báo cáo "Core stock = 0 (Mart)"/"(Minimart)"
   — các dòng trước đây hiện mã kho (vd "12511") phải đổi sang tên siêu
   thị thật (nếu kho đó đã có `TenChiNhanh` ở domain `banhang_sku`).

## 9.54 — "Core stock = 0": dropdown "Chi nhánh" tự lọc đúng Mart/Minimart

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js`,
`rp-server/routes/reports.js`, `rp-server/scripts/seedCoreZeroStockReports.js`.

**⚠️ BẮT BUỘC chạy lại script seed sau khi deploy code** (khác các bản vá
code thuần trước đó — lần này DefinitionJson cũ đã lưu trong CSDL cần ghi
đè lại optionsSource mới):

**Các bước:**
1. `git pull origin main` → khởi động lại `rp-server`.
2. Chạy LẠI script seed (an toàn chạy lại nhiều lần, khớp theo ReportId để
   UPDATE):
   ```
   cd rp-server && node scripts/seedCoreZeroStockReports.js
   ```
3. Vào báo cáo "Core stock = 0 (Mart)"/"(Minimart)" trên rp-user, mở
   dropdown "Chi nhánh" — kiểm tra chỉ còn hiện đúng chi nhánh thuộc loại
   điểm tương ứng (không còn lẫn Mart/Minimart).

## 9.53 — "Core stock = 0": cột "Tên kho" cũng ưu tiên lấy từ "Ánh xạ Điểm - STK_ID"

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — chỉ sửa code, KHÔNG
cần chạy SQL/VIEW/job gì mới (dùng lại đúng dữ liệu "Ánh xạ Điểm - STK_ID"
đã khai ở bản 9.52).

**Các bước:**
1. `git pull origin main` → khởi động lại `rp-server`.
2. Không cần làm gì thêm nếu đã khai `TenSieuThi` sẵn trong "Ánh xạ Điểm -
   STK_ID" cho các mã Điểm liên quan — cột "Tên kho" tự động hiện tên đó.

## 9.52 — "Core stock = 0": dùng LẠI "Ánh xạ Điểm - STK_ID" (LoaiChuoi) khi domain chain chưa đồng bộ kho

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — chỉ sửa code, KHÔNG
cần chạy SQL/VIEW/job gì mới.

**Các bước:**
1. `git pull origin main` (hoặc kéo lại bản deploy mới) → khởi động lại
   `rp-server`.
2. Vào etl-admin → **"Ánh xạ Điểm - STK_ID"** → với mỗi siêu thị đang bị
   báo "KHÔNG có kho nào thuộc loại điểm MART/MINIMART" (vd các "Cửa hàng
   HaproFood..."), tìm đúng dòng mã Điểm của siêu thị đó (tạo mới nếu
   chưa có, điền `MaStkMoi` = đúng mã kho/STK_ID) → khai cột **LoaiChuoi**
   = `MART` hoặc `MINIMART` cho đúng → Lưu.
3. Chạy lại báo cáo "Core stock = 0 (Mart)"/"(Minimart)" cho đúng siêu thị
   vừa khai — cảnh báo "chain" phải hết, báo cáo đi tiếp sang bước kiểm
   tra dữ liệu tồn kho (nếu `tonkho_sku` cũng đã có dữ liệu cho đúng kho
   đó thì ra báo cáo bình thường).

## 9.51 — KHẨN: Cấp quyền CSDL còn thiếu cho "Core stock = 0"/"Cảnh báo hàng tồn"

**Thay đổi**: `etl-db/grants.sql` (thêm dòng GRANT còn thiếu cho
`etl.StockAlertThresholds` — dòng của `etl.CoreItemList` đã có sẵn từ
trước, chỉ chưa được chạy lại trên CSDL thật).

**⚠️ KHÔNG PHẢI deploy code bình thường — đây là việc DBA/người quản trị
SQL Server cần chạy TRỰC TIẾP trên CSDL `HCRC_ETL`:**
```sql
USE HCRC_ETL;
GRANT SELECT ON etl.CoreItemList TO etl_diem_stk_reader;
GRANT SELECT ON etl.StockAlertThresholds TO etl_diem_stk_reader;
```

**Các bước:**
1. Chạy 2 dòng SQL trên trực tiếp trên CSDL `HCRC_ETL` (dùng tài khoản có
   quyền GRANT, vd `sa`/tài khoản quản trị).
2. (Tuỳ chọn, để chắc chắn ngay lập tức) khởi động lại `rp-server`.
3. Chạy lại báo cáo "Core stock = 0" — cảnh báo lỗi kết nối phải biến mất.
4. `git pull origin main` để lấy bản cập nhật `etl-db/grants.sql` (ghi lại
   đúng hiện trạng quyền, không bắt buộc chạy gì thêm vì đã chạy tay ở
   bước 1).

## 9.50 — Danh sách hàng Core: phân trang (sửa treo trình duyệt)

**Thay đổi**: `etl-admin/src/pages/CoreItemListPage.jsx` (phân trang phía
client, 200 dòng/trang — KHÔNG đổi API/backend).

**Các bước triển khai:**
1. `git pull origin main`.
2. Build lại `etl-admin` (`npm run build`).
3. Kiểm tra: trang "Danh sách hàng Core" mở mượt, có nút "Trang trước"/
   "Trang sau" khi danh sách trên 200 dòng.

## 9.49 — Core stock = 0: phát hiện lỗi kết nối riêng cho báo cáo này

**Thay đổi**: `rp-server/lib/coreItemList.js` (ghi lỗi qua `logWarn` +
`getLastLoadError()`), `rp-server/lib/coreZeroStockRunner.js` (tách rõ
cảnh báo "lỗi kết nối" khác "chưa upload").

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server`.
3. Chạy lại báo cáo "Core stock = 0 (Mart)" — đọc dòng ⚠️ mới:
   - Nếu báo **lỗi kết nối** → **KIỂM TRA NGAY** `.env` của `rp-server`:
     `ETL_DIEM_STK_SERVER`/`ETL_DIEM_STK_PORT`/`ETL_DIEM_STK_DATABASE` có
     trỏ ĐÚNG server/database (HCRC_ETL) nơi chạy `etl-db/schema.sql` bản
     9.46 và nơi admin upload file Core không — sửa `.env` cho khớp rồi
     khởi động lại `rp-server`.
   - Nếu vẫn báo "chưa có danh sách Core" (không phải lỗi kết nối) → quay
     lại kiểm tra domain `chainDomain`/mã kho như hướng dẫn bản 9.48.

## 9.48 — Báo cáo "Core stock = 0": giải thích rõ lý do khi trống

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` (thêm `warnings` giải
thích đang chặn ở bước nào trong 6 bước lọc — KHÔNG cần sửa frontend, trang
báo cáo đã tự hiện `result.warnings` sẵn có từ trước).

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server`.
3. Chạy lại báo cáo "Core stock = 0 (Minimart)" đang trống — đọc dòng ⚠️
   hiện ra ngay trên trang để biết chính xác nguyên nhân.

## 9.47 — "Top bán chạy đang tồn kho = 0": chọn Top 50/Top 100/Tất cả khi gửi email

**Thay đổi**: `rp-server/scripts/seedTopZeroStockReport.js` (thêm option
"Tất cả"), `rp-server/lib/topSellingZeroStockRunner.js` (xử lý `topLimit
==='all'`), `rp-user/.../EmailSchedulesPage.jsx` (dropdown thật cho filter
`select` có `options`, thay ô nhập chữ tự do).

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server`.
3. Trên server rp-server, chạy:
   ```
   node rp-server/scripts/seedTopZeroStockReport.js
   ```
   (cập nhật `DefinitionJson` — thêm lựa chọn "Tất cả" vào filter "Số lượng
   hiển thị").
4. Build lại `rp-user` (`npm run build`).
5. Kiểm tra: Hệ thống → Lịch gửi email báo cáo → chọn báo cáo "Top bán chạy
   đang tồn kho = 0" → ô "Số lượng hiển thị (mỗi chi nhánh)" hiện dropdown
   thật với 3 lựa chọn Top 50/Top 100/Tất cả.

## 9.46 — Danh sách hàng Core: khai theo từng kho (Mã kho/Mã điểm)

**Thay đổi**: `etl-db/schema.sql` (ĐỔI cấu trúc `etl.CoreItemList`, XOÁ
dữ liệu Core cũ khi migrate), `rp-server/lib/coreItemList.js` +
`lib/coreZeroStockRunner.js` (so khớp theo kho), `etl/lib/coreItemListImport.js`
(nhận cả tên cột/sheet tiếng Anh cũ VÀ tiếng Việt trong file thật người
dùng, nâng giới hạn dòng/sheet), `etl/routes/admin/coreItemList.js` +
`etl-admin/src/pages/CoreItemListPage.jsx` (cột mới).

**⚠️ CẢNH BÁO QUAN TRỌNG** — bước 1 dưới đây XOÁ SẠCH toàn bộ danh sách
Core hiện có (cấu trúc cũ không có Mã kho, không map được sang cấu trúc
mới) — BẮT BUỘC có sẵn file Core mới (có cột Mã kho/Mã hàng, vd file thật
người dùng đang dùng) TRƯỚC khi chạy bước 1, và upload lại NGAY ở bước 4,
nếu không báo cáo "Core stock = 0" sẽ tạm trống cho tới khi upload lại.

**Các bước triển khai:**
1. Trên CSDL HCRC_ETL, chạy lại `etl-db/schema.sql` (hoặc riêng đoạn
   migrate `etl.CoreItemList` — tìm `IF COL_LENGTH('etl.CoreItemList',
   'MaKho') IS NULL`) — XOÁ SẠCH dữ liệu Core cũ, đổi cấu trúc bảng.
2. `git pull origin main`.
3. Khởi động lại `rp-server` + `etl` (áp dụng code mới).
4. Vào etl-admin → "Danh sách hàng Core" → upload LẠI file Core đầy đủ
   (có thể dùng NGUYÊN file thật đang dùng hàng tháng — hệ thống giờ nhận
   cả tên cột tiếng Việt "Mã hàng"/"Mã kho"/... và tên sheet ngắn
   "Mart"/"Mini", không cần đổi tên cột/sheet trước khi upload).
5. Build lại `etl-admin` (`npm run build`) — cột mới (Mã kho/Mã điểm/Mã
   NCC/Nhà cung cấp/Luồng giao hàng) + ô lọc theo Mã kho.
6. Kiểm tra: báo cáo "Core stock = 0" (cả Mart/Minimart) chạy ra đúng số
   liệu theo từng kho (1 mã hàng là Core ở kho A nhưng KHÔNG hiện ở kho B
   cùng loại điểm nếu kho B không khai Core cho mã đó).

## 9.45 — KHẨN: sửa lỗi 500 báo cáo tồn kho khi lọc "Tất cả" chi nhánh

**Thay đổi**: `rp-server/lib/reportFactsHelpers.js` (CHIA NHỎ `entityCodes`
thành nhiều lượt query ≤1900 mã/lượt, gộp kết quả — tránh vượt giới hạn
2100 tham số/câu lệnh của SQL Server). KHÔNG đổi file nào khác — các
runner gọi 4 hàm này (`topSellingZeroStockRunner.js`/
`coreZeroStockRunner.js`/`stockThresholdRunner.js`/`stockAlertRunner.js`)
giữ nguyên, không cần sửa.

**Các bước triển khai (làm NGAY, đang lỗi 500 trên server):**
1. `git pull origin main`.
2. Khởi động lại `rp-server` (áp dụng `reportFactsHelpers.js` mới) —
   KHÔNG cần build lại frontend nào, KHÔNG cần chạy script seed nào (chỉ
   sửa cách query, không đổi DefinitionJson/schema).
3. Kiểm tra lại: báo cáo "Top bán chạy đang tồn kho = 0" lọc "Tất cả" chi
   nhánh + Top 100 chạy được bình thường, không còn lỗi 500.

## 9.44 — Cột STT + căn giữa toàn hệ thống + sắp xếp mã ngành hàng tăng dần

**Thay đổi**: `rp-server/lib/exportExcel.js` (căn giữa cột TT, trước đây
canh phải theo mọi cột số), `rp-user/src/components/DataTable.jsx` (căn
giữa cột TT trên web, trước đây không xử lý gì), `rp-server/lib/reportCellFormat.js`
(hàm `assignSttIfPresent()` MỚI dùng chung, rút từ `compositeReportRunner.js`),
`rp-server/lib/reportRunner.js` + `lib/purchaseOrderRunner.js` (gọi hàm trên
cho nhánh `directDb`/`purchaseOrder`, trước đây 2 nhánh này không đánh số
TT), `rp-server/lib/compositeReportRunner.js` (thêm `definition.sortBy` cho
nhánh phẳng không `groupBy`), `rp-server/lib/coreZeroStockRunner.js` +
`stockThresholdRunner.js` + `stockAlertRunner.js` + `topSellingZeroStockRunner.js`
(thêm cột TT cố định), `rp-server/scripts/seedPurchaseOrderReports.js` +
`seedTonKhoChiTietReport.js` + `seedNganhHangReports.js` (khai cột
`{key:'stt'}` + `sortBy` trong `DefinitionJson`).

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server` (áp dụng toàn bộ thay đổi lib/ ở trên).
3. Build lại `rp-user` (`npm run build`) — DataTable.jsx căn giữa cột TT.
4. Trên server rp-server, chạy lại 3 script seed (cập nhật `DefinitionJson`
   — thêm cột TT + sắp xếp mã ngành hàng, KHÔNG cần đồng bộ lại dữ liệu):
   ```
   node rp-server/scripts/seedPurchaseOrderReports.js
   node rp-server/scripts/seedTonKhoChiTietReport.js
   node rp-server/scripts/seedNganhHangReports.js
   ```
5. Kiểm tra: mọi báo cáo nhóm "Mua hàng" + 3 báo cáo ngành hàng + 4 báo
   cáo tồn kho (Core tồn=0/Tồn kho theo ngưỡng/Cảnh báo hàng tồn/Top bán
   chạy đang tồn kho=0) đều có cột "TT" căn giữa trên web/Excel/PDF; báo
   cáo "Doanh thu theo ngành hàng"/"Nhập hàng theo ngành hàng"/"(LDTD)"
   sắp xếp đúng mã ngành hàng từ thấp đến cao.

## 9.43 — Chuyển nhóm ngành hàng + báo cáo LDTD + Top 50/100 + Báo cáo Tồn kho mới

**Thay đổi**: `rp-server/scripts/seedNganhHangReports.js` (menuCode mặc
định + báo cáo LDTD mới), `etl/server.js`/`roles.js`/`etl-admin` (trang
Chỉ tiêu LDTD mới), `rp-server/lib/topSellingZeroStockRunner.js` +
`scripts/seedTopZeroStockReport.js` (filter Top 50/100), `rp-server/lib/reportEngine.js`
(2 cơ chế filter mới dùng chung mọi báo cáo `directDb`), 3 file MỚI:
`deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql`,
`etl/scripts/seedTonKhoChiTietSync.js`, `rp-server/scripts/seedTonKhoChiTietReport.js`.

**Các bước triển khai:**
1. Trên DSMART16, DBA chạy `deploy/Thiết lập VIEW Tồn kho Chi tiết theo
   SKU (DSMART16).sql` — kiểm tra 2 câu `SELECT TOP 20` cuối file (đặc
   biệt chú ý thời gian chạy — VIEW dùng `OUTER APPLY`, có thể chậm nếu
   danh mục hàng lớn).
2. `git pull origin main`.
3. Trên server ETL, chạy:
   ```
   node etl/scripts/seedTonKhoChiTietSync.js
   ```
4. Khởi động lại `etl` (2 router Chỉ tiêu LDTD mới) và `rp-server` (áp
   dụng `topSellingZeroStockRunner.js`/`reportEngine.js` mới).
5. Build lại `etl-admin` (`npm run build`) — trang "Chỉ tiêu Doanh thu
   theo ngành hàng (LDTD)" mới.
6. Trên server rp-server, chạy:
   ```
   node rp-server/scripts/seedNganhHangReports.js     (chuyển 2 báo cáo ngành
                                                        hàng cũ sang Mua hàng +
                                                        tạo báo cáo LDTD mới)
   node rp-server/scripts/seedTopZeroStockReport.js    (thêm filter Top 50/100)
   node rp-server/scripts/seedTonKhoChiTietReport.js   (tạo báo cáo Tồn kho mới)
   ```
7. Build lại `rp-user` (`npm run build`) — ô nhập số cho filter "điều kiện
   lớn hơn/nhỏ hơn" mới.
8. Vào etl-admin → "Chỉ tiêu Doanh thu theo ngành hàng (LDTD)" nhập Chỉ
   tiêu (để trống MaSieuThi, điền MaNganhHang).
9. Vào rp-user (Hệ thống → Phân quyền) gán quyền xem báo cáo LDTD mới +
   báo cáo "Tồn kho" mới.
10. Kiểm tra: 2 báo cáo ngành hàng cũ đã chuyển sang menu "Mua hàng"; báo
    cáo LDTD mới hiện đúng Chỉ tiêu riêng; "Top bán chạy đang tồn kho = 0"
    có filter Top 50/100 hoạt động đúng; báo cáo "Tồn kho" mới lọc đúng
    ngành hàng/siêu thị/NCC/kênh mua + điều kiện lớn hơn/nhỏ hơn.

## 9.42 — Màu header bản 9.40 cho mọi báo cáo phẳng

**Thay đổi**: `rp-server/lib/exportExcel.js` + `rp-server/lib/exportPdf.js`
(header fill cho báo cáo không `columnGroups`) + `rp-server/scripts/seedLdtdHcrcReports.js`
(cờ `legacyPdfColors: true` cho 4 báo cáo LDTD/HCRC) +
`rp-user/src/components/DataTable.jsx` + `rp-user/src/components/ReportBody.jsx`
(prop `isReport`).

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server` (áp dụng Excel/PDF mới + cờ `legacyPdfColors`).
3. Chạy `node rp-server/scripts/seedLdtdHcrcReports.js` — BẮT BUỘC, để ghi
   cờ `legacyPdfColors: true` mới vào `DefinitionJson` đã lưu của 4 báo cáo
   LDTD/HCRC (nếu bỏ qua bước này, PDF 4 báo cáo đó sẽ đổi SANG màu mới
   ngoài ý muốn, vì mặc định `exportPdf.js` đã đảo thành bảng corporate).
4. Build lại `rp-user` (`npm run build`) — áp dụng màu header web mới.
5. Kiểm tra: mở 1 báo cáo phẳng bất kỳ (vd Mua hàng/báo cáo theo ngành
   hàng) trên web → header navy nhạt; xuất Excel/PDF → cùng màu. Mở báo
   cáo "Doanh thu cuối ngày LDTD/HCRC" (gốc + Thành viên) → web/Excel VẪN
   màu corporate bản 9.40 (không đổi); xuất PDF → VẪN màu cũ (xanh
   lá/vàng gold, CHƯA đổi).

## 9.41 — Báo cáo Doanh thu/Nhập hàng theo ngành hàng + Chỉ tiêu toàn công ty

**Thay đổi**: `rp-server/lib/compositeReportRunner.js` (thêm `preFilter`/
`block.remapEntityCode`, opt-in), `rp-server/scripts/seedNganhHangReports.js`
(mới, 2 định nghĩa báo cáo), `etl/lib/salesTargetsImport.js` (shape
"generic" hỗ trợ chỉ tiêu toàn công ty), `etl/routes/admin/salesTargets.js`
+ `etl/server.js` (2 router mới), `etl-admin` (2 trang + nav + quyền),
`etl/scripts/seedNganhHangSync.js` (mới, job đồng bộ — đã có từ trước),
2 VIEW mới trên `DSMART16`/`DSMART16_EOM` (xem file SQL riêng).

**Các bước triển khai:**
1. Đã chạy xong trên server DSMART16 thật (DBA/IT, người dùng xác nhận):
   - VIEW Live: `V_HCRC_DOANHTHU_NGANHHANG`/`V_HCRC_NHAPHANG_NGANHHANG`
     trên `DSMART16` (xem `bc-don-dat-hang.md`/báo cáo ngành hàng.md mục 2).
   - VIEW Lịch sử: `deploy/Thiết lập VIEW Doanh thu-Nhập hàng theo Ngành
     hàng Lịch sử (DSMART16_EOM).sql` trên `DSMART16_EOM` — ĐÃ XÁC NHẬN
     chạy đúng (kết quả SELECT TOP 20 hợp lý, tên ngành hàng Unicode đúng).
2. `git pull origin main`.
3. Trên server ETL, chạy:
   ```
   node etl/scripts/seedNganhHangSync.js --with-history
   ```
   (tạo 2 job Live + 2 job Lịch sử — script tự kiểm tra VIEW/cột trước khi
   ghi, dừng báo lỗi rõ nếu thiếu điều kiện).
4. Khởi động lại `etl` (áp dụng 2 router/2 MenuCode mới
   `sales-targets-nganhhang-dt`/`-nh`) và `rp-server` (áp dụng
   `compositeReportRunner.js` mới).
5. Build lại `etl-admin` (`npm run build`) — 2 trang "Chỉ tiêu Doanh
   thu/Nhập hàng theo ngành hàng" mới trong menu.
6. Trên server rp-server, chạy:
   ```
   node rp-server/scripts/seedNganhHangReports.js
   ```
   (tạo 2 báo cáo `bc-doanh-thu-nganhhang`/`bc-nhap-hang-nganhhang` vào
   menu `reports-kinh-doanh`).
7. Vào etl-admin → Đồng bộ → "Chạy thử" 4 job vừa tạo, xác nhận không lỗi.
8. Vào etl-admin → "Chỉ tiêu Doanh thu/Nhập hàng theo ngành hàng" → nhập
   chỉ tiêu (để TRỐNG MaSieuThi, điền MaNganhHang = đúng DEPT_ID).
9. Vào rp-user (Hệ thống → Phân quyền) gán quyền xem 2 báo cáo mới cho
   đúng vai trò.
10. Kiểm tra: mở 2 báo cáo mới trên web — mỗi dòng 1 ngành hàng, bộ lọc
    "Chi nhánh" hoạt động (không chọn = tổng hệ thống), cột Chỉ tiêu
    không đổi khi lọc chi nhánh (đúng ý "toàn công ty"), cột Cùng kỳ năm
    trước có số liệu sau khi đồng bộ job Lịch sử.

## 9.40 — Đổi màu báo cáo (Excel/web/email) sang bảng "kiểu báo cáo tài chính quốc tế"

**Thay đổi**: `rp-server/lib/reportCellFormat.js` (thêm bảng màu mới song
song bảng cũ) + `rp-server/lib/exportExcel.js` + `rp-server/lib/emailBodyRenderer.js`
(dùng bảng mới) + `rp-user/src/lib/reportGroupColors.js` (web). **KHÔNG
đổi** `rp-server/lib/exportPdf.js` — PDF vẫn giữ nguyên màu cũ.

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server` (áp dụng Excel/email mới).
3. Build lại `rp-user` (`npm run build`) — áp dụng màu mới trên web.
4. Kiểm tra: mở báo cáo "Doanh thu Realtime..."/báo cáo cuối ngày trên
   web → màu navy/vàng đồng/xám mới; xuất Excel → cùng màu mới; xuất PDF
   → VẪN màu cũ (xanh lá/vàng/cam/tím, chưa đổi); gửi thử email báo cáo
   (nếu có lịch gửi) → body email màu mới.

## 9.39 — Sửa cột "TT" trống trên web (báo cáo doanh thu + Dashboard)

**Thay đổi**: chỉ sửa `rp-server/lib/compositeReportRunner.js` (backend),
không đổi CSDL/Excel/PDF.

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server` (`pm2 restart hcrc-rp-server` hoặc tương
   đương).
3. Kiểm tra: mở báo cáo "Doanh thu Realtime HCRC (Thành viên)" (hoặc bất
   kỳ báo cáo/tile Dashboard nào có cột "TT") trên web — cột "TT" phải
   hiện số 1,2,3... theo từng nhóm, trống đúng ở dòng "Tổng cộng", khớp
   với bản Excel/PDF đã xuất trước đó.

## 9.38 — Nút "Khoá"/"Kích hoạt" cho "Ánh xạ Điểm - STK_ID" (etl-admin)

**Thay đổi**: `etl-db/schema.sql` (thêm cột `IsActive`, tự ALTER an toàn
chạy lại) + `etl/routes/admin/diemStkMapping.js` (route mới) +
`rp-server/lib/diemStkMapping.js` (lọc `WHERE IsActive = 1`) +
`etl-admin/src/pages/DiemStkMappingPage.jsx` (nút + cột trạng thái).

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` trên CSDL `HCRC_ETL` (tự thêm cột
   `IsActive`, an toàn chạy lại nhiều lần — mọi dòng cũ mặc định
   `IsActive=1`, không đổi hành vi báo cáo hiện có).
3. Khởi động lại `etl` VÀ `rp-server` (cả 2 đều đọc/ghi bảng này).
4. Build lại `etl-admin` (`npm run build`).
5. Kiểm tra: trang "Ánh xạ Điểm - STK_ID" → mỗi dòng có thêm nút
   "Khoá"/"Kích hoạt" — bấm "Khoá" 1 dòng rồi kiểm tra báo cáo liên quan
   (vd composite LDTD/HCRC, Core stock=0) không còn lấy dữ liệu của mã
   Điểm đó; bấm "Kích hoạt" lại thì có dữ liệu trở lại ngay, không mất
   cấu hình MaStkCu/MaStkMoi/BuId.

## 9.37 — Thêm ô tìm kiếm người dùng ở trang Phân quyền (rp-user)

**Thay đổi**: chỉ sửa `rp-user/src/modules/system/permissions/UsersPage.jsx`
(giao diện, không đổi API/CSDL).

**Các bước triển khai:**
1. `git pull origin main`.
2. Build lại `rp-user` (`npm run build`).

## 9.36 — Báo cáo bc-ton-kho-0: thêm cột "Tồn kho hôm qua" + "Bán hôm nay"

**Thay đổi**: `rp-server/lib/topSellingZeroStockRunner.js` (backend —
chỉ thêm 2 cột hiển thị, không đổi công thức/CSDL) + tài liệu
`bc-ton-kho-0.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `rp-server` (`pm2 restart hcrc-rp-server` hoặc tương
   đương — route/logic chạy trong tiến trình Node, cần nạp lại code).
3. Kiểm tra: mở lại báo cáo "Top bán chạy đang tồn kho = 0" → phải thấy
   thêm 2 cột "Tồn kho hôm qua" và "Bán hôm nay" trước cột "Tồn kho hiện
   tại", đúng công thức `Tồn kho hiện tại = Tồn kho hôm qua − Bán hôm
   nay`.

## 9.35 — Sửa tài liệu bc-ton-kho-0.md: VIEW tồn kho dùng đúng bảng STK_INFO

**Thay đổi**: chỉ sửa `bc-ton-kho-0.md` — không có bước triển khai server
nào, chỉ `git pull`.

## 9.34 — Sửa tài liệu bc-ton-kho-0.md

**Thay đổi**: chỉ sửa `bc-ton-kho-0.md` (tài liệu), không đổi code —
không cần bước triển khai nào trên server, chỉ `git pull` để có bản tài
liệu mới nhất.

## 9.33 — Sửa lỗi thật: mobile không thấy "Tài khoản của tôi" khi menu dài

**Thay đổi**: `etl-admin/src/styles.css` + `api-admin/src/styles.css` +
`rp-user/src/styles.css` (chỉ CSS, không đổi JS/schema CSDL).

**Các bước triển khai:**
1. `git pull origin main`.
2. Build lại CẢ 3 frontend (`npm run build` ở `etl-admin`, `api-admin`,
   `rp-user`).

## 9.32 — Thêm "Xuất Excel" danh sách job đồng bộ

**Thay đổi**: `etl/lib/syncJobsImport.js` + `etl/routes/admin/syncJobs.js`
(backend) + `etl-admin/src/pages/SyncJobsPage.jsx` (giao diện).

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `etl` (nạp route mới).
3. Build lại `etl-admin` (`npm run build`).

## 9.31 — Sửa cách dùng `addThanhVienStore.js`: gõ thông tin trong file, không qua tham số dòng lệnh

**Thay đổi**: sửa `etl/scripts/addThanhVienStore.js` (KHÔNG đổi file nào
khác, KHÔNG đổi schema CSDL).

**Cách dùng MỚI (thay bản 9.30):**
1. `git pull origin main`.
2. Mở `etl/scripts/addThanhVienStore.js`, sửa object `STORE` ở đầu file
   (name/server — xem mẫu comment sẵn trong file).
3. Chạy: `cd etl && node scripts/addThanhVienStore.js` (không còn tham số
   dòng lệnh).

## 9.30 — Script thêm 1 siêu thị Thành viên mới

**Thay đổi**: thêm mới `etl/scripts/addThanhVienStore.js` (KHÔNG sửa file
nào khác, KHÔNG đổi schema CSDL).

**Các bước triển khai:**
1. `git pull origin main`.
2. KHÔNG cần restart gì (script chạy tay khi cần, không phải code chạy
   nền) — dùng ngay khi có siêu thị mới: `cd etl && node
   scripts/addThanhVienStore.js "Tên siêu thị" "IP server"` (sau khi đã
   chạy VIEW+etl_reader tại máy chủ đó, xem VERSION.md bản 9.30).

## 9.29 — Sửa lỗi thật: job Lịch sử (DSMART16_EOM) kẹt lại do "trùng khoá UNIQUE" lặp lại

**Thay đổi**: `etl/lib/upsert.js` + `etl/lib/tableSyncEngine.js` (sửa lỗi
dữ liệu/logic, KHÔNG đổi schema CSDL, KHÔNG cần DBA chạy lại VIEW).

**Các bước triển khai:**
1. `git pull origin main`.
2. Restart `etl` (data-fix, nạp code mới) — `pm2 restart hcrc-etl`.
3. KHÔNG cần làm gì thêm — job "Đơn đặt hàng - nhập hàng - Lịch sử
   (DSMART16_EOM)" sẽ TỰ chạy tiếp từ watermark hiện tại ở lượt cron kế
   tiếp (hàng ngày 3h sáng), hoặc bấm "Chạy thử" ngay trong etl-admin →
   Đồng bộ nếu muốn thấy tiến độ sớm hơn. Theo dõi qua etl-admin → Log,
   hoặc chạy lại 2 câu SQL so sánh theo năm (đã gửi người dùng trong lúc
   debug) để xem tiến độ.

**Bối cảnh lỗi (để tham khảo nếu gặp lại)**: nguồn `STRANS_YYYYMM` có
dòng trùng `(TRANS_NUM, IDX)` thật (QTY/AMOUNT khác nhau — giao dịch bị
sửa ghi thêm dòng mới) — job lỗi "Violation of UNIQUE KEY constraint
UX_ReportFacts_Source_Domain_Entity_Date" lặp lại vô thời hạn do 2 dòng
trùng khoá rơi vào 2 lô trích xuất khác nhau. Nay MERGE tự phục hồi bằng
cách chia đôi lô + thử lại khi gặp lỗi này, không còn chặn tiến độ job.

## 9.28 — Sửa bước 6 của bản 9.27: "Chạy thử" KHÔNG đủ để bù dữ liệu 130/330 cũ

**Người dùng báo cáo**: sau khi làm đủ 6 bước deploy bản 9.27 (kể cả bấm
"Chạy thử" lại 2 job `don_dat_hang`), báo cáo lọc kênh mua theo mã
`130`/`330` VẪN CHƯA RA DỮ LIỆU CŨ. Nguyên nhân: "Chạy thử" chỉ gọi
`run-now` → chạy ĐÚNG job như cron, vẫn lọc `WHERE UpdatedAt >= watermark`
— watermark (`etl.SyncState.LastSyncedAt`) của 2 job này đã chạy qua các
mốc QUÁ KHỨ từ lâu, bấm "Chạy thử" không tự lùi watermark lại.

**Thay đổi**: thêm `etl/scripts/resyncDonDatHangWatermark.js` — reset
`LastSyncedAt` về EPOCH cho 2 job domain `don_dat_hang`, KHÔNG xoá dữ liệu
cũ (dữ liệu `133`/`333` đã đồng bộ vẫn đúng).

**Các bước làm bù (chỉ cần làm 1 lần, SAU khi đã làm đủ 6 bước bản 9.27 —
không cần làm lại 6 bước đó):**
1. `git pull origin main`.
2. `cd etl && node scripts/resyncDonDatHangWatermark.js` (xem trước, không
   đổi gì) — kiểm tra đúng tên 2 job hiện ra.
3. `node scripts/resyncDonDatHangWatermark.js --confirm` (thực sự reset
   watermark). **LƯU Ý — phải đứng đúng trong thư mục `etl/` khi chạy**
   (script đọc `.env` theo thư mục hiện tại, KHÔNG theo đường dẫn truyền
   vào `node`) — xem thêm bài học dotenv/cwd đã gặp khi chạy
   `seedPurchaseOrderReports.js`.
4. Vào etl-admin → Đồng bộ → bấm "Chạy thử" lại CẢ 2 job domain
   `don_dat_hang` (hoặc chờ job tự chạy theo lịch) — lần này job sẽ quét
   lại TOÀN BỘ nguồn, bù đúng các đơn `130`/`330` còn thiếu. Job "Lịch sử"
   quét lại toàn bộ có thể mất VÀI GIỜ — theo dõi qua etl-admin → Log.

## 9.27 — Thêm mã giao dịch 130/330 + bộ lọc "Kênh mua" cho 6 báo cáo Mua hàng

**Thay đổi**: `rp-server/lib/purchaseOrderRunner.js` +
`rp-server/scripts/seedPurchaseOrderReports.js` +
`rp-user/src/components/FilterForm.jsx` (code) + 2 file VIEW SQL ở
`deploy/` (CẦN DBA CHẠY LẠI — xem bước 2 dưới đây, KHÁC các bản trước chỉ
cần `git pull`).

**Các bước triển khai (làm 1 lần, THEO ĐÚNG THỨ TỰ):**
1. `git pull origin main`.
2. **DBA chạy lại NGUYÊN VĂN** 2 file sau (an toàn chạy lại nhiều lần,
   dùng `CREATE OR ALTER`):
   - `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung
     tâm).sql` trên CSDL `DSMART16`.
   - `deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql` trên
     CSDL `DSMART16_EOM`.
3. Khởi động lại `rp-server` để nạp code mới.
4. Chạy `node rp-server/scripts/seedPurchaseOrderReports.js` (có `.env`
   kết nối đúng CSDL RP) để cập nhật bộ lọc "Kênh mua" + `transCode` mới
   cho 6 báo cáo trong `app.ReportCatalog` (script AN TOÀN chạy lại nhiều
   lần, khớp theo ReportId để UPDATE, không tạo trùng).
5. Build lại `rp-user` (`npm run build`) để nạp giao diện bộ lọc mới +
   ghi chú giải thích.
6. **QUAN TRỌNG — bù dữ liệu cũ bị bỏ sót**: vào etl-admin → Đồng bộ →
   "Chạy thử" lại CẢ 2 job domain `don_dat_hang` ("Đơn đặt hàng - nhập
   hàng (DSMART16)" và "...Lịch sử (DSMART16_EOM)") — dữ liệu mang mã
   `130`/`330` TRƯỚC ĐÂY chưa từng được đồng bộ (VIEW cũ loại bỏ hẳn,
   không phải lỗi job), job cần chạy lại mới quét ra được.

**Lưu ý khi dùng**: không chọn gì ở bộ lọc "Kênh mua" mới = hiện CẢ 2 kênh
gộp chung như hành vi cũ, không ảnh hưởng số liệu đã quen dùng.

## 9.26 — Sửa lỗi job Lịch sử lặp lại vô thời hạn + thu gọn đăng nhập + sửa bấm mở lịch

**Thay đổi**: `etl/lib/upsert.js` + `etl/jobs/runSync.js` (sửa lỗi dữ
liệu, KHÔNG đổi schema CSDL) + 3×`LoginPage.jsx`/`styles.css` (giao diện
đăng nhập) + 3×`DateInput.jsx` (sửa bấm mở lịch). KHÔNG đổi biến môi
trường.

**Các bước triển khai:**
1. `git pull origin main`.
2. Khởi động lại `etl` để nạp code sửa lỗi ghi dữ liệu + watermark tạm
   (QUAN TRỌNG — đây là phần sửa lỗi dữ liệu thật, nên làm SỚM).
3. Build lại 3 frontend: `npm run build` ở `etl-admin`, `api-admin`,
   `rp-user` (cho cả giao diện đăng nhập mới lẫn sửa ô ngày).
4. Sau khi khởi động lại `etl`, vào etl-admin → Sync Jobs → bấm lại
   "Chạy thử" cho job "Đơn đặt hàng - nhập hàng - Lịch sử
   (DSMART16_EOM)" — lần này sẽ KHÔNG còn lỗi trùng khoá nữa, và nếu bị
   ngắt giữa chừng (vd deploy bản sau) thì lần sau tự tiếp tục từ chỗ dở
   dang thay vì quét lại từ đầu.

**Lưu ý khi dùng**:
- Giao diện đăng nhập 3 app đổi sang 1 thẻ bo tròn căn giữa trang (trước
  đây trải hết màn hình) — không ảnh hưởng tài khoản/mật khẩu/2FA, chỉ
  đổi hình thức.
- Ô ngày dd/mm/yyyy (bản 9.25) giờ bấm vào BẤT KỲ đâu trong ô đều mở lịch
  ngay, không cần nhắm đúng icon 📅 nữa.

## 9.25 — Đổi mọi ô nhập ngày sang hiện dd/mm/yyyy (3 app)

**Thay đổi**: thêm `components/DateInput.jsx` + CSS ở cả 3 app, thay 22 ô
`<input type="date">` bằng `<DateInput>` ở 12 file. KHÔNG đổi schema CSDL,
KHÔNG đổi API/giá trị gửi lên server (vẫn chuỗi ISO yyyy-mm-dd y hệt
trước), KHÔNG đổi biến môi trường, KHÔNG thêm thư viện npm mới.

**Các bước triển khai (làm 1 lần cho CẢ 3 app, CHỈ `git pull` + build lại
frontend, KHÔNG cần backend/DBA):**
1. `git pull origin main`.
2. Build lại CẢ 3 frontend: `cd etl-admin && npm run build`,
   `cd api-admin && npm run build`, `cd rp-user && npm run build`.
3. Khuyên người dùng F5 cứng (Ctrl+Shift+R) ở cả 3 app sau khi deploy để
   chắc nạp bundle JS/CSS mới.

**Lưu ý khi dùng**: ô ngày vẫn bấm mở được lịch chọn của trình duyệt/điện
thoại như cũ (click vào bất kỳ đâu trong ô) — chỉ đổi DÒNG CHỮ hiển thị
sang LUÔN LUÔN dd/mm/yyyy, không còn phụ thuộc ngôn ngữ máy người dùng.

## 9.24 — Sửa lỗi dropdown "Nhà cung cấp" chậm ở 6 báo cáo Mua hàng

**Thay đổi**: `rp-server/lib/reportResultCache.js` (thêm tham số TTL tuỳ
chọn, KHÔNG đổi hành vi mặc định) + `rp-server/routes/reports.js` (cache
10 phút cho danh sách lựa chọn động của bộ lọc). KHÔNG đổi schema CSDL,
KHÔNG đổi biến môi trường bắt buộc (có biến môi trường TUỲ CHỌN mới
`REPORT_FILTER_OPTIONS_CACHE_TTL_MS` nếu muốn đổi 10 phút mặc định).

**Các bước triển khai (làm 1 lần, CHỈ `git pull` + khởi động lại
`rp-server`, KHÔNG cần DBA):**
1. `git pull origin main`.
2. Khởi động lại `rp-server` để nạp code mới.

**Lưu ý khi dùng**: lần mở dropdown "Nhà cung cấp" (hoặc bộ lọc động khác
dùng `optionsSource`) ĐẦU TIÊN sau khi cache hết hạn (10 phút) vẫn mất
thời gian như trước — bản này chỉ giúp các lần mở LẠI trong vòng 10 phút
sau đó nhanh ngay. Muốn nhanh ngay cả lần đầu cần bàn thêm với DBA về việc
đánh index/cột tính toán trên `dwh.ReportFacts`, CHƯA làm ở bản này.

## 9.23 — Sửa lỗi treo trình duyệt khi xem báo cáo Mua hàng có nhiều dữ liệu lịch sử

**Thay đổi**: `rp-server/lib/purchaseOrderRunner.js` (6 báo cáo nhóm Mua
hàng) + `rp-server/routes/reports.js` — chỉ sửa cách TRẢ KẾT QUẢ, KHÔNG
đổi schema CSDL, KHÔNG đổi biến môi trường, KHÔNG cần chạy lại ETL.

**Các bước triển khai (làm 1 lần, CHỈ `git pull` + khởi động lại
`rp-server`, KHÔNG cần DBA, KHÔNG cần rebuild frontend):**
1. `git pull origin main`.
2. Khởi động lại `rp-server` để nạp code mới.
3. Không cần đổi gì ở `rp-user` (frontend) — trang "Báo cáo" đã sẵn có cơ
   chế hiện cảnh báo (`result.warnings`), không cần build lại.

**Lưu ý khi dùng**: 6 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh..."
giờ chỉ hiện tối đa 200 dòng đầu trên web (giống mọi báo cáo khác) khi bộ
lọc trả về nhiều dữ liệu — kèm dòng cảnh báo nhắc bấm "Xuất Excel"/"Xuất
PDF" để xem đầy đủ (2 nút đó KHÔNG bị giới hạn, luôn xuất đủ). Dòng "Tổng
cộng" vẫn tính đúng trên toàn bộ dữ liệu đã lọc, không chỉ 200 dòng hiện
ra.

## 9.22 — Nút "Nhân bản" cho Nguồn dữ liệu/Đối tác API/Job đồng bộ

**Thay đổi**: thêm route `POST /:id/duplicate` ở 7 router backend (ETL,
api-server, rp-server) + nút "Nhân bản" + modal ở 7 trang frontend tương
ứng (etl-admin, api-admin, rp-user). KHÔNG đổi schema CSDL, KHÔNG đổi
biến môi trường.

**Các bước triển khai (làm 1 lần, CHỈ `git pull` + rebuild/khởi động lại,
KHÔNG cần DBA):**
1. `git pull origin main`.
2. Build lại 3 frontend (nếu deploy build tĩnh, không qua `npm run dev`):
   `cd etl-admin && npm run build`, `cd api-admin && npm run build`,
   `cd rp-user && npm run build`.
3. Khởi động lại 3 backend để nạp route mới: `etl` (API routes
   `etl/routes/admin/dataSources.js`, `etl/routes/admin/syncJobs.js`),
   `api-server` (`api-server/routes/admin/dataSources.js`,
   `api-server/routes/admin/consumers.js`), `rp-server`
   (`rp-server/routes/apiConnections.js`, `rp-server/routes/dataSources.js`,
   `rp-server/routes/externalConnections.js`).
4. Không cần xoá cache trình duyệt bắt buộc — nhưng khuyên F5 cứng
   (Ctrl+Shift+R) ở etl-admin/api-admin/rp-user để chắc nạp bundle JS mới.

**Lưu ý khi dùng**: nút "Nhân bản" tạo bản ghi giống hệt bản gốc (kể cả
mật khẩu/API key, đã mã hoá, copy nguyên vẹn ở server — không hiện ra
trình duyệt) — CHỈ RIÊNG trang "Đối tác API" (api-admin) sẽ LUÔN cấp bí
mật MỚI khi nhân bản (không copy bí mật cũ), hiện ra đúng 1 lần ngay sau
khi tạo — nhớ sao chép lại trước khi đóng banner. Job đồng bộ nhân bản ra
sẽ ở trạng thái TẮT — vào "Sửa" để chỉnh (vd đổi nguồn dữ liệu) rồi tự bật
lại.

## 9.21 — Thêm nguồn Lịch sử (DSMART16_EOM) cho 6 báo cáo Mua hàng

**Thay đổi**: domain `don_dat_hang` (6 báo cáo mua hàng) trước chỉ đồng bộ
từ `DSMART16` (Live, chỉ giữ dữ liệu gần đây) — thêm nguồn "Lịch sử" THỨ 2
đọc `DSMART16_EOM` (lưu trữ nhiều năm), mirror đúng kiến trúc đã dùng cho
báo cáo doanh thu cuối ngày.

**Các bước triển khai (làm 1 lần, CẦN DBA — có bước chạy SQL trên
`DSMART16_EOM`, khác mọi bản trước chỉ cần `git pull`):**
1. `git pull origin main`.
2. DBA chạy NGUYÊN VĂN file
   `deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql` trên
   CSDL `DSMART16_EOM` (tạo VIEW `vw_DonDatHangChiNhanh` + stored procedure
   `sp_HCRC_RebuildDonDatHangView` + tuỳ chọn Job SQL Server Agent chạy lại
   hàng tháng). Nếu lỗi "Invalid column name"/"Invalid object name", gửi
   lại nguyên văn lỗi — cần sửa lại câu lệnh theo đúng schema thật.
3. `cd etl && node scripts/seedDonDatHangHistorySync.js` — tạo "Nguồn dữ
   liệu" "DSMART16 - Lịch sử" (dùng lại nếu đã có) + job đồng bộ "Đơn đặt
   hàng - nhập hàng - Lịch sử (DSMART16_EOM)".
4. Theo dõi etl-admin → Sync Jobs → job vừa tạo — lần chạy ĐẦU TIÊN quét
   ~93 tháng dữ liệu, có thể mất VÀI GIỜ, không phải bị treo.

**Kiểm tra:**
- [ ] Job "Lịch sử" chạy xong, không lỗi, số dòng xử lý lớn (nhiều tháng/
  năm dữ liệu).
- [ ] Mở bất kỳ báo cáo nào trong 6 báo cáo Mua hàng, chọn khoảng ngày
  nhiều tháng/năm trước (không chỉ tháng hiện tại) — đã thấy dữ liệu cũ.
- [ ] Cột "Nhà cung cấp" của dữ liệu cũ vẫn hiện tên (không trống) — nếu
  trống, khả năng JOIN chéo sang `DSMART16.dbo.SUPPLIER` không hoạt động
  (2 CSDL khác server) — báo lại để xử lý tiếp.

## 9.20 — Sửa lỗi 500 trang "Cấu hình Voucher" (api-admin) — thiếu requireAdminAuth

**Thay đổi**: `api-server/routes/admin/voucherSettings.js` — thêm
middleware `requireAdminAuth` bị thiếu từ đầu, khiến `GET`/`PUT
/admin/voucher-settings` luôn lỗi 500 (`Cannot read properties of
undefined (reading 'sub')`). Chỉ sửa code, không đổi CSDL.

**Các bước triển khai (làm 1 lần):**
1. `git pull origin main`.
2. `pm2 restart hcrc-api-server`.

**Kiểm tra:**
- [ ] Vào api-admin → "Cấu hình Voucher" — KHÔNG còn báo "Lỗi máy chủ",
  dropdown hiện đúng Nguồn dữ liệu đã chọn trước đó.
- [ ] Chọn lại 1 Nguồn dữ liệu, bấm "Lưu" — báo thành công, không lỗi.

## 9.19 — KHẨN: Sửa API check/redeem voucher tra sai cột (BARCODE → CARD_ID)

**Thay đổi**: `api-server/lib/voucherRedeemService.js` — đổi cột khoá tra/
ghi `PMCRDINF` từ `BARCODE` (thường rỗng, khiến mọi voucher hợp lệ báo sai
"không tồn tại") sang `CARD_ID`, LUÔN tự bỏ ký tự `C` đầu mã quét trước khi
tra (app gửi `voucherCode` luôn thừa 1 ký tự `C` so với `CARD_ID` thật).
KHÔNG đổi gì phía đối tác (app quét mã) — chỉ sửa code `api-server`.

**Các bước triển khai (làm 1 lần):**
1. `git pull origin main`.
2. `pm2 restart hcrc-api-server` — KHÔNG cần chạy script seed nào, KHÔNG
   đổi schema CSDL (chỉ sửa logic code).

**Kiểm tra:**
- [ ] Quét/nhập 1 mã voucher ĐÃ BIẾT đã dùng trước đó — app phải báo đúng
  "Voucher này đã được sử dụng" (KHÔNG còn báo "không hợp lệ/không tồn
  tại" như trước).
- [ ] Quét/nhập 1 mã voucher còn hạn, chưa dùng — app phải tra ra đúng
  thông tin (giá trị/ngày hết hạn) và cho phép thu hồi bình thường.
- [ ] Thu hồi xong — kiểm tra lại CSDL: `PMCRDINF.STATUS` của đúng
  `CARD_ID` đó đã đổi sang `0`.

## 9.18 — KHẨN: Sửa lỗi 500 toàn bộ báo cáo mua hàng (lỗi tự gây ra ở bản 9.17)

**Thay đổi**: bản 9.17 đổi tên cột tiếng Việt cho 6 báo cáo mua hàng,
nhưng một số cột tham chiếu field thô bị thiếu `formula` khiến
`projectColumns()` lỗi `col.startsWith is not a function` → báo cáo nào
cũng trả về HTTP 500 khi bấm "Lọc"/chạy. Bản này sửa đúng lỗi đó, KHÔNG
đổi logic/giao diện gì khác so với 9.17.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự — GIỐNG bước 1-3 của
bản 9.17, BẮT BUỘC làm lại vì `DefinitionJson` cũ trong DB vẫn đang lỗi):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — BẮT BUỘC
   chạy lại để ghi đè `DefinitionJson` đã sửa vào DB (chỉ sửa file code
   không đủ, báo cáo đọc định nghĩa cột từ DB).
3. `pm2 restart hcrc-rp-server`.

**Kiểm tra:**
- [ ] Mở từng báo cáo trong 6 báo cáo mua hàng (Đơn đặt hàng/Đơn nhập
  hàng/So sánh đặt–nhận/Giá trị đặt theo đơn/Giá trị nhập theo đơn/So
  sánh giá trị theo NCC), bấm "Lọc" — KHÔNG còn báo lỗi "Lỗi máy chủ"/500
  trên console F12.
- [ ] Tên cột vẫn hiện tiếng Việt đúng như bản 9.17 (không bị quay lại
  "eventDate"/"measures...").

## 9.17 — Sửa 3 lỗi + đổi tên cột tiếng Việt cho báo cáo mua hàng

**Thay đổi**: 6 báo cáo domain `don_dat_hang` — sửa lỗi thiếu dữ liệu
khoảng ngày rộng, sửa lỗi lọc Trạng thái làm sai số liệu "So sánh
đặt–nhận", đổi toàn bộ tên cột sang tiếng Việt. Bộ lọc Siêu thị (bản 9.14)
nếu server bạn vẫn chưa thấy thì cần làm bước 2 dưới đây.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — BẮT BUỘC
   chạy lại (ghi đè `DefinitionJson` — cả tên cột tiếng Việt lẫn bộ lọc
   Siêu thị nếu server bạn còn thiếu từ bản 9.14).
3. `pm2 restart hcrc-rp-server` (đổi `lib/purchaseOrderRunner.js`).

**Kiểm tra:**
- [ ] Mở "So sánh đặt–nhận" — có đủ 4 bộ lọc (Ngày đặt/Nhà cung cấp/Siêu
  thị/Trạng thái).
- [ ] Chọn khoảng ngày RỘNG (vd cả năm 2026) — không bị trống/thiếu dữ
  liệu bất thường so với trước (nếu trước đó nghi thiếu).
- [ ] Lọc Trạng thái = "Đã nhập 1 phần" — các đơn hiện ra có SL thực nhận
  > 0 (khác 0 như lỗi cũ) nếu đơn đó thật sự đã nhận hàng.
- [ ] Mọi tiêu đề cột trên cả 6 báo cáo hiện tiếng Việt có nghĩa (không
  còn "eventDate"/"measures.ThanhTien"...).

---

## 9.16 — Tìm kiếm không phân biệt dấu tiếng Việt ở mọi ô lọc multi-select

**Thay đổi**: mọi ô lọc multi-select (Nhà cung cấp, Siêu thị, Trạng
thái...) trên toàn hệ thống giờ tìm được dù gõ có dấu hay không dấu.

**Các bước triển khai (làm 1 lần):**
1. `git pull origin main`.
2. `cd rp-user && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục vụ
   tĩnh rp-user.
3. KHÔNG cần restart backend (chỉ đổi frontend thuần tuý).

**Kiểm tra:**
- [ ] Mở 1 báo cáo bất kỳ có bộ lọc "Nhà cung cấp" → bấm vào ô đó → gõ
  KHÔNG dấu (vd "cong ty") vào ô "Tìm kiếm..." → vẫn lọc đúng ra các NCC
  có "Công ty" trong tên.
- [ ] Gõ CÓ dấu (vd "Công ty") → vẫn lọc đúng như trước (không bị hỏng
  hành vi cũ).

---

## 9.15 — Thêm dòng Tổng cộng cho 3 báo cáo giá trị đặt/nhập

**Thay đổi**: 3 báo cáo "Giá trị đặt hàng theo đơn"/"Giá trị nhập hàng
theo đơn"/"So sánh giá trị đặt–nhập theo NCC" có thêm dòng "Tổng cộng" ở
cuối bảng (tô màu xanh đậm), cộng dồn đúng cột giá trị.

**Các bước triển khai (làm 1 lần):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — BẮT BUỘC
   chạy lại (ghi đè `DefinitionJson` thêm `showGrandTotal`).
3. `pm2 restart hcrc-rp-server` (đổi `lib/purchaseOrderRunner.js`).

**Kiểm tra:**
- [ ] Mở "Giá trị đặt hàng theo đơn" — cuối bảng có 1 dòng "Tổng cộng" tô
  màu xanh, cộng đúng tổng cột "Tổng giá trị" của mọi dòng phía trên.
- [ ] Mở "So sánh giá trị đặt–nhập theo NCC" — dòng "Tổng cộng" có cả 2
  cột Giá trị đặt/Giá trị nhập cộng đúng, "Tỷ lệ giao hàng (%)" tính lại
  đúng theo tổng (không phải trung bình cộng % từng NCC).
- [ ] Mở "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận" — xác nhận
  KHÔNG có dòng Tổng cộng (giữ nguyên như cũ, tránh cộng nhầm Đơn giá).
- [ ] Lọc ra kết quả RỖNG (vd chọn NCC không có đơn nào trong khoảng ngày)
  — xác nhận KHÔNG hiện dòng "Tổng cộng" với toàn số 0.

---

## 9.14 — Mở rộng bộ lọc Siêu thị ra cả 6 báo cáo + sửa lỗi chọn nhãn cũ ở dropdown lọc + đồng bộ lại toàn bộ dữ liệu đơn hàng

**Thay đổi**: cả 6 báo cáo domain `don_dat_hang` có bộ lọc "Siêu thị". Sửa
lỗi dropdown "Nhà cung cấp" chọn nhầm nhãn cũ (lỗi font) thay vì nhãn mới.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự, BẮT BUỘC đủ bước 4 —
nếu bỏ qua, dữ liệu lịch sử vẫn còn lỗi font vĩnh viễn):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — ghi đè
   `DefinitionJson` thêm bộ lọc Siêu thị cho đủ 6 báo cáo.
3. `pm2 restart hcrc-rp-server` (đổi `routes/reports.js`).
4. **Đồng bộ lại TOÀN BỘ dữ liệu cũ** (chỉ cần làm 1 LẦN DUY NHẤT, để hết
   hẳn lỗi font tên NCC/chi nhánh ở dữ liệu lịch sử — "Chạy thử" bình
   thường KHÔNG tự làm việc này vì chỉ đồng bộ tăng dần theo watermark).
   Chạy câu lệnh sau trên CSDL ETL (sửa tên CSDL nếu khác `HCRC_ETL`):
   ```sql
   USE HCRC_ETL; -- hoặc đúng tên CSDL ETL thật của bạn
   DELETE FROM etl.SyncState
   WHERE SyncJobId = (SELECT Id FROM etl.SyncJobs WHERE Name = N'Đơn đặt hàng - nhập hàng (DSMART16)');
   ```
   Xong câu lệnh trên, vào etl-admin → Đồng bộ → tìm job
   "Đơn đặt hàng - nhập hàng (DSMART16)" → bấm "Chạy thử" — lần này sẽ
   đồng bộ lại TOÀN BỘ lịch sử (vì watermark đã xoá, hệ thống coi như
   chưa từng đồng bộ), lấy đúng tên NCC/chi nhánh mới (đã qua
   `SUPP_NAME_U`/`STK_NAME_U`). Có thể mất lâu hơn 1 lượt "Chạy thử" bình
   thường tuỳ khối lượng dữ liệu lịch sử.

**Kiểm tra:**
- [ ] Mở báo cáo "Giá trị đặt hàng theo đơn" (hoặc bất kỳ báo cáo nào
  trong 6 báo cáo) — thấy thêm ô lọc "Siêu thị".
- [ ] Mở dropdown "Nhà cung cấp" — tên NCC hiện đúng chữ Việt có dấu, hết
  hẳn ký tự lạ (kể cả đơn hàng CŨ, không chỉ đơn mới).
- [ ] Mở 1 báo cáo bất kỳ, chọn khoảng ngày có cả đơn hàng CŨ (vd đầu
  năm) — cột "NCC" hiện đúng chữ Việt (xác nhận đồng bộ lại toàn bộ đã
  chạy xong, không chỉ đơn mới).

---

## 9.13 — Thêm bộ lọc "Siêu thị" cho báo cáo So sánh giá trị đặt–nhập theo NCC

**Thay đổi**: báo cáo "So sánh giá trị đặt–nhập theo NCC" có thêm bộ lọc
"Siêu thị" — không chọn gì = gộp toàn bộ hệ thống như trước, chọn 1/nhiều
siêu thị = chỉ so sánh đúng (các) siêu thị đó.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — BẮT BUỘC
   chạy lại (ghi đè `DefinitionJson` thêm bộ lọc mới), an toàn chạy lại
   nhiều lần.
3. `pm2 restart hcrc-rp-server` (đổi `routes/reports.js` +
   `lib/purchaseOrderRunner.js`).

**Kiểm tra:**
- [ ] Mở báo cáo "So sánh giá trị đặt–nhập theo NCC" — thấy thêm ô lọc
  "Siêu thị" (dropdown tìm kiếm được, đúng tên siêu thị thật).
- [ ] Không chọn gì → chạy báo cáo → số liệu giống hệt trước khi có bộ lọc
  này (gộp toàn hệ thống).
- [ ] Chọn đúng 1 siêu thị quen thuộc → đối chiếu tổng giá trị đặt/nhập
  của 1 NCC bất kỳ với báo cáo "Đơn đặt hàng"/"Đơn nhập hàng" đã lọc riêng
  đúng siêu thị + NCC đó — phải khớp nhau.

---

## 9.12 — Sửa dứt điểm lỗi font TenNCC/TenChiNhanh (SUPP_NAME_U, STK_NAME_U)

**Thay đổi**: VIEW "Đơn đặt hàng" đổi `SUPP_NAME` → `SUPP_NAME_U`, VIEW tồn
kho đổi `STK_NAME` → `STK_NAME_U` — hết lỗi font tên NCC/tên chi nhánh.

**Các bước triển khai (làm 1 lần, BẮT BUỘC đủ các bước, không chỉ git pull):**
1. `git pull origin main`.
2. Chạy LẠI NGUYÊN VĂN file `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập
   hàng-So sánh (DSMART16 trung tâm).sql` trên CSDL DSMART16 trung tâm (an
   toàn, `CREATE OR ALTER VIEW`).
3. Nếu đã deploy báo cáo tồn kho (bản 8.68) — chạy lại VIEW tồn kho theo
   `bc-ton-kho-0.md`/`deploy/Cập nhật bản 8.68 ...md` (bản mới nhất, đã có
   `STK_NAME_U`).
4. etl-admin → Đồng bộ → tìm job domain `don_dat_hang` (và job tồn kho nếu
   có) → "Chạy thử" lại — BẮT BUỘC, vì job đồng bộ KHÔNG tự sửa dữ liệu CŨ
   đã lưu lỗi font, chỉ đúng dòng đồng bộ MỚI sau khi VIEW đã sửa.
5. KHÔNG cần restart `pm2` (chỉ đổi VIEW phía CSDL nguồn, không đổi code).

**Kiểm tra:**
- [ ] Mở báo cáo "Đơn đặt hàng" — cột "NCC" hiện đúng chữ Việt có dấu
  (không còn ký tự lạ như "s¶n", "n«ng").
- [ ] Nếu có báo cáo tồn kho — cột "Chi nhánh" cũng hiện đúng chữ Việt.

---

## 9.11 — Thêm nút Sửa cho 3 panel rp-user + sửa lỗi validate PUT kết nối đối tác

**Thay đổi**: "Nguồn dữ liệu"/"Kết nối API"/"Kết nối đối tác" (Hệ thống →
Biểu mẫu, rp-user) có nút "Sửa". Sửa luôn 1 lỗi thật: trước đây sửa "Kết
nối đối tác" bắt buộc phải gõ lại API key/mật khẩu dù chỉ muốn đổi tên.

**Các bước triển khai (làm 1 lần):**
1. `git pull origin main`.
2. `cd rp-user && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục vụ
   tĩnh rp-user.
3. `pm2 restart hcrc-rp-server` (đổi `routes/externalConnections.js`).

**Kiểm tra:**
- [ ] Hệ thống → Biểu mẫu → "Nguồn dữ liệu"/"Kết nối API" → bấm "Sửa" 1
  dòng → đổi 1 trường không phải mật khẩu → Lưu → không bị mất mật khẩu cũ.
- [ ] "Kết nối đối tác" → Sửa 1 kết nối đã có bí mật (vd Basic Auth) → chỉ
  đổi Tên, để trống Password → Lưu → KHÔNG còn báo lỗi bắt buộc nhập mật
  khẩu (lỗi cũ) — kiểm tra kết nối vẫn chạy được (mật khẩu cũ còn nguyên).

---

## 9.10 — Thêm nút Sửa cho 3 trang api-admin (Endpoint realtime/ghi, Báo cáo)

**Thay đổi**: "Endpoint realtime"/"Endpoint ghi"/"Báo cáo" (api-admin) có
nút "Sửa".

**Các bước triển khai (làm 1 lần):**
1. `git pull origin main`.
2. `cd api-admin && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục
   vụ tĩnh api-admin.
3. KHÔNG cần restart backend (route PUT đã có sẵn từ trước).

**Kiểm tra:**
- [ ] "Endpoint realtime" → Sửa 1 endpoint đã có bảng liên kết (JOIN) →
  xác nhận form tự nạp đúng bảng/cột cũ, lưu lại không mất cấu hình JOIN.
- [ ] "Báo cáo" → Sửa 1 báo cáo → đổi `definitionJson` → Lưu → báo cáo
  chạy lại đúng theo định nghĩa mới.

---

## 9.09 — Sửa lỗi font tài liệu VIEW báo cáo tồn kho (FULL_NAME → FULL_NAME_U)

**Thay đổi**: tài liệu VIEW báo cáo tồn kho (`bc-ton-kho-0.md`,
`deploy/Cập nhật bản 8.68 ...md`) sửa `SKU_DEF.FULL_NAME` →
`FULL_NAME_U` (lỗi font tên hàng, đã xác nhận ở tài liệu "giá vốn
dsmart.md").

**Các bước triển khai**: CHỈ áp dụng nếu đã từng deploy VIEW báo cáo tồn
kho (bản 8.68) dùng bản SQL CŨ (có `FULL_NAME` không `_U`):
1. `git pull origin main`.
2. Chạy lại VIEW tồn kho theo bản SQL MỚI trong `bc-ton-kho-0.md` trên
   DSMART16 (an toàn, `CREATE OR ALTER VIEW`).
3. Đồng bộ lại job tồn kho liên quan.

Nếu CHƯA từng deploy VIEW này, không cần làm gì — tài liệu chỉ sửa để lần
deploy sau (nếu có) không bị dính lỗi font ngay từ đầu.

---

## 9.08 — Thêm 3 báo cáo giá trị đặt/nhập theo đơn + theo NCC

**Thay đổi**: 3 báo cáo mới trong "Báo cáo Mua hàng": "Giá trị đặt hàng
theo đơn", "Giá trị nhập hàng theo đơn" (1 dòng/1 đơn hàng), "So sánh giá
trị đặt–nhập theo NCC" (1 dòng/1 NCC, gộp cả hệ thống).

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — BẮT BUỘC
   chạy lại script này (không chỉ restart) — đây là nơi tạo 3 báo cáo mới
   trong `app.ReportCatalog`. An toàn chạy lại nhiều lần.
3. `pm2 restart hcrc-rp-server`.
4. Vào rp-user → Hệ thống → Phân quyền, gán quyền xem 3 `ReportId` mới
   (`bc-gia-tri-dat-theo-don`/`bc-gia-tri-nhap-theo-don`/
   `bc-so-sanh-gia-tri-ncc`) cho đúng vai trò cần dùng — script KHÔNG tự
   gán quyền.
5. KHÔNG cần tạo VIEW/job đồng bộ mới (dùng chung dữ liệu đã có từ bản
   8.92/8.95) — nếu 3 báo cáo cũ (Đơn đặt hàng/Đơn nhập hàng/So sánh
   đặt–nhận) đang có số liệu bình thường thì 3 báo cáo mới cũng có ngay.

**Kiểm tra:**
- [ ] 3 báo cáo mới xuất hiện trong menu "Báo cáo Mua hàng" sau khi gán
  quyền.
- [ ] Mở "Giá trị đặt hàng theo đơn" — xác nhận mỗi dòng là 1 đơn (không
  lặp lại nhiều dòng cùng Số đơn như báo cáo "Đơn đặt hàng" cũ).
- [ ] Mở "So sánh giá trị đặt–nhập theo NCC" — chọn 1 NCC quen thuộc, đối
  chiếu tổng giá trị đặt/nhập với vài đơn thật (tra trong "Đơn đặt hàng"/
  "Đơn nhập hàng") để xác nhận cộng dồn đúng.

---

## 9.07 — Thêm nút "Sửa" cho trang "Nguồn dữ liệu" (api-admin)

**Thay đổi**: trang "Nguồn dữ liệu" (api-admin) có thêm nút "Sửa" để cập
nhật Server/Database/Username/Password mà không cần xoá tạo lại từ đầu.

**Các bước triển khai (làm 1 lần):**
1. `git pull origin main`.
2. `cd api-admin && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục
   vụ tĩnh api-admin.
3. KHÔNG cần restart backend (route `PUT /:id` đã có sẵn từ trước, chỉ
   thêm frontend gọi tới).

**Kiểm tra:**
- [ ] api-admin → "Nguồn dữ liệu" → bấm "Sửa" 1 dòng bất kỳ → đổi 1 trường
  (vd Server) → Lưu → danh sách cập nhật đúng, không tạo trùng dòng mới.
- [ ] Để trống ô Mật khẩu khi sửa → xác nhận endpoint realtime đang dùng
  nguồn đó vẫn kết nối bình thường (không bị mất mật khẩu cũ).

---

## 9.06 — Tách 2 API độc lập ở trang "Cấu hình Voucher" (api-admin)

**Thay đổi**: trang "Cấu hình Voucher" (api-admin) hết bị trống dropdown
"Nguồn dữ liệu" khi API `/voucher-settings` lỗi — tách riêng 2 lệnh gọi độc
lập thay vì gọi chung `Promise.all`.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. **QUAN TRỌNG — chạy TRƯỚC khi build**: chạy lại `api-db/schema.sql`
   trên đúng CSDL `HCRC_API` (an toàn chạy lại nhiều lần) — khả năng cao
   bảng `api.VoucherSettings` đang CHƯA tồn tại trên CSDL thật (nguyên
   nhân gốc gây "Lỗi máy chủ"), script này tạo bù nếu thiếu, không đổi gì
   nếu đã có.
3. `cd api-admin && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục
   vụ tĩnh api-admin.
4. KHÔNG cần restart `pm2` (route backend không đổi, chỉ sửa frontend).

**Kiểm tra:**
- [ ] Chạy `SELECT * FROM api.VoucherSettings;` trên CSDL `HCRC_API` —
  không còn báo lỗi "Invalid object name".
- [ ] Mở api-admin → "Cấu hình Voucher" — dropdown "Nguồn dữ liệu" liệt kê
  đủ (không còn "Lỗi máy chủ"), chọn được nguồn rồi bấm "Lưu" thành công.

---

## 9.05 — Ghim cố định cột "Sửa/Bật-Tắt/Xoá" bên phải khi cuộn ngang (3 app)

**Thay đổi**: bảng quản trị (Nguồn dữ liệu, Người dùng, Vai trò...) ở cả 3
app — cột nút thao tác (Sửa/Bật-Tắt/Xoá) giờ ghim cố định bên phải khi cuộn
ngang trên màn hình hẹp, không cần cuộn hết cỡ mới thấy nút.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. `cd etl-admin && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục
   vụ tĩnh etl-admin như mọi lần trước.
3. `cd api-admin && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục
   vụ tĩnh api-admin.
4. `cd rp-user && npm run build` — copy TOÀN BỘ `dist/` lên vị trí phục vụ
   tĩnh rp-user.
5. KHÔNG cần restart backend (`pm2 restart ...`), KHÔNG cần đổi gì ở CSDL —
   chỉ đổi 2 file JS/CSS thuần frontend mỗi app.

**Kiểm tra:**
- [ ] Mở trang có bảng nhiều cột (vd etl-admin → "Nguồn dữ liệu") trên
  điện thoại/màn hình hẹp — 3 nút Sửa/Bật/Xoá luôn hiện ở mép phải, không
  cần cuộn ngang mới thấy.
- [ ] Mở 1 báo cáo doanh thu (bảng columnGroups, rp-user) — vẫn hiển thị
  bình thường, không có cột nào bị ghim nhầm.

---

## 9.04 — Script tạo API key cho đối tác App Voucher ngoài

**Thay đổi**: thêm `api-server/scripts/seedVoucherAppConsumer.js` — tạo
API key cho app voucher ngoài bằng script, không cần vào api-admin.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-api-server` (chỉ thêm script mới, không đổi route
   đang chạy — restart để nhận biến `.env` mới nếu có dùng
   `VOUCHER_APP_CONSUMER_NAME`).
3. `cd api-server && npm run seed:voucher-app-consumer` — copy API key in
   ra, gửi cho đội phát triển app voucher qua kênh an toàn.

**Kiểm tra:**
- [ ] Chạy script, API key hiện rõ trong khung kèm ví dụ `curl`.
- [ ] Gọi thử `curl` ví dụ đó với 1 mã voucher thật — ra đúng
  `UNUSED`/`USED`.

---

## 9.03 — Tự động hoá Đối tác nội bộ + Kết nối API Server cho voucher-check

**Thay đổi**: thêm 2 script nối chuỗi tạo "Đối tác" nội bộ (rp-server) +
"Kết nối API Server", không cần dán API key qua web.

**Các bước triển khai (YÊU CẦU đã làm bản 9.02 trước — có endpoint
`voucher-check`):**
1. `git pull origin main` (cả api-server lẫn rp-server).
2. `pm2 restart hcrc-api-server && pm2 restart hcrc-rp-server`.
3. Điền `API_SERVER_BASE_URL` vào `rp-server/.env` (địa chỉ api-server mà
   MÁY CHỦ rp-server gọi tới được).
4. Trên máy chủ api-server:
   ```
   cd api-server
   APIKEY=$(node scripts/seedVoucherCheckConsumer.js) && \
     (cd ../rp-server && node scripts/seedVoucherApiConnection.js "$APIKEY")
   ```

**Kiểm tra:**
- [ ] Lệnh chạy xong không lỗi, in "Đã TẠO MỚI/CẬP NHẬT Kết nối API
  Server".
- [ ] `GET /api/v1/realtime/voucher-check/<barcode>` gọi được với key vừa
  tạo.

---

## 9.02 — Script tự động tạo Endpoint realtime + báo cáo tra cứu voucher

**Thay đổi**: thêm Endpoint realtime `voucher-check` (api-server) + báo
cáo "Tra cứu voucher" (rp-server) bằng script, thay cho thao tác tay qua
UI.

**Các bước triển khai (YÊU CẦU đã làm Bước 4 `api-voucher-check-redeem.md`
— đã có "Nguồn dữ liệu" voucher):**
1. `git pull origin main` (api-server + rp-server).
2. `pm2 restart hcrc-api-server && pm2 restart hcrc-rp-server`.
3. `cd api-server && npm run seed:voucher-check-endpoint`.
4. Vào rp-user → Hệ thống → Kết nối API Server, tạo kết nối tay (dán API
   key của 1 đối tác có scope `realtime` + tick endpoint `voucher-check`
   — xem bản 9.03 nếu muốn bước này cũng bằng script).
5. `cd rp-server && node scripts/seedVoucherCheckReport.js`.
6. Vào Hệ thống → Phân quyền, gán quyền xem báo cáo "Tra cứu voucher" cho
   vai trò cần dùng (bước thủ công cố ý).

**Kiểm tra:**
- [ ] `GET /api/v1/realtime/voucher-check/<barcode>` (kèm `X-API-Key`) ra
  đúng dữ liệu `PMCRDINF`.
- [ ] rp-user → báo cáo "Tra cứu voucher" → gõ thử 1 mã → ra đúng kết
  quả.

---

## 9.01 — Giảm dãn dòng PDF báo cáo doanh thu từ +12 xuống +10

**Thay đổi**: chỉ đổi 1 hằng số `rowH` trong `rp-server/lib/exportPdf.js`
(chế độ `compactSinglePage`) — không đổi schema/dữ liệu.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server`.

**Kiểm tra:**
- [ ] Xuất PDF 1 trong 4 báo cáo doanh thu → dòng dãn vừa phải hơn bản
  trước, cỡ chữ không đổi, vẫn đúng 1 trang A4 dọc.

---

## 9.00 — Tách domain current/currentGD theo ngày cho 2 báo cáo "(Thành viên)"

**Thay đổi**: `rp-server/lib/compositeReportRunner.js` (logic chạy) +
`rp-server/scripts/seedLdtdHcrcReports.js` (đổi `DefinitionJson` của 2
báo cáo "(Thành viên)").

**Các bước triển khai (BẮT BUỘC chạy lại script seed — đổi DefinitionJson
lưu trong CSDL, không chỉ code):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedLdtdHcrcReports.js`.
3. `pm2 restart hcrc-rp-server`.

**Kiểm tra:**
- [ ] Mở 1 trong 2 báo cáo "(Thành viên)", chọn khoảng ngày có cả quá khứ
  xa (vd đầu năm tới hôm nay) → không còn khoảng trống dữ liệu bất
  thường, số khớp hợp lý so với báo cáo gốc cùng khoảng ngày.

---

## 8.99 — Sửa 3 lỗi số liệu + chữ báo cáo doanh thu cuối ngày (4 báo cáo)

**Thay đổi**: `rp-server/scripts/seedLdtdHcrcReports.js` (đổi
`requireTargetMatch` trong `DefinitionJson`), `rp-server/lib/
compositeReportRunner.js` (phân trang lấy đủ dữ liệu), `rp-server/lib/
exportExcel.js` + `rp-server/lib/exportPdf.js` (dãn dòng/căn giữa).

**Các bước triển khai (BẮT BUỘC chạy lại script seed — đổi
`DefinitionJson` lưu trong CSDL):**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedLdtdHcrcReports.js`.
3. `pm2 restart hcrc-rp-server`.

**Kiểm tra:**
- [ ] Mở 1 trong 4 báo cáo, chọn 1 kỳ CHƯA nhập Chỉ tiêu → vẫn hiện danh
  sách siêu thị với Thực đạt đầy đủ, chỉ cột Chỉ tiêu/Tỷ lệ đạt trống
  (không còn trắng toàn bộ bảng).
- [ ] Chọn khoảng ngày rộng (vd cả năm trước) → đối chiếu tổng Thực đạt
  với 1 nguồn khác để xác nhận không còn bị thiếu.
- [ ] Xuất Excel/PDF 1 báo cáo bất kỳ trong 4 báo cáo → dòng dãn rõ ràng
  hơn, cột TT (PDF) căn giữa.

Không có bước nào làm mất dữ liệu đã có — không đổi schema CSDL, chỉ đổi
logic đọc/hiển thị.

---

## 8.98 — Viền đen + màu gốc file mẫu BRGMART + dãn dòng tiêu đề

**Thay đổi**: báo cáo doanh thu (4 báo cáo "Doanh thu cuối ngày") đổi
viền từ xám nhạt sang ĐEN, màu nhóm cột đổi lại đúng màu GỐC file mẫu
BRGMART (đậm/tươi hơn bản trước), tiêu đề 2-3 dòng dãn cách rõ hơn — áp
dụng đồng bộ cả 4 nơi: web, Excel, PDF, email.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. `cd rp-user && npm run build` (đổi `styles.css` + `lib/reportGroupColors.js`).
   Copy TOÀN BỘ `dist/` lên vị trí phục vụ tĩnh như mọi lần trước.
3. `pm2 restart hcrc-rp-server` (đổi `lib/reportCellFormat.js` +
   `lib/exportExcel.js` + `lib/exportPdf.js` + `lib/emailBodyRenderer.js`).
4. KHÔNG cần đổi gì ở CSDL.

**Kiểm tra:**
- [ ] rp-user → "Báo cáo" → mở 1 trong 4 báo cáo "Doanh thu cuối ngày" →
  bảng có viền ĐEN (không còn xám nhạt), màu nhóm cột đậm/tươi hơn trước
  (xanh lá/cam/vàng gold/tím), xen kẽ dòng màu xanh cyan.
- [ ] Xuất Excel/PDF báo cáo đó → viền đen + màu khớp đúng web.
- [ ] Lịch gửi email báo cáo doanh thu (DeliveryMode='body') → bấm "Gửi
  ngay" → kiểm tra hộp thư: viền đen + màu khớp đúng web/Excel/PDF.
- [ ] Mở 1 báo cáo KHÔNG có nhóm cột màu (vd "Đơn đặt hàng") → xuất
  Excel/PDF/gửi email → viền VẪN nhạt như cũ (không bị đổi đen nhầm) —
  xác nhận không ảnh hưởng báo cáo khác.

Không có bước nào làm mất dữ liệu đã có — không đổi schema CSDL, chỉ đổi
màu/viền hiển thị.

---

## 8.97 — Khung kẻ mảnh (web/Excel/PDF/email) + ẩn/chọn cột báo cáo doanh thu

**Thay đổi**: bảng web báo cáo doanh thu có thêm khung kẻ mảnh (đã có sẵn
ở Excel/PDF/email từ trước — nay khớp cả 4 nơi); xác nhận làm tròn số
body email khớp Excel/PDF (không cần sửa gì, đã đúng từ bản 8.96); thêm
ô "Cột hiển thị" MỚI ở trang xem báo cáo — cho chọn/ẩn cột khi xem trên
web VÀ khi xuất Excel/PDF (khác ô "Cột hiển thị trong bảng" ở bản 8.96 —
ô đó chỉ áp dụng cho LỊCH GỬI EMAIL).

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. `cd rp-user && npm run build` (đổi `styles.css` + thêm ô "Cột hiển
   thị" ở `ReportsPage.jsx`). Copy TOÀN BỘ `dist/` lên vị trí phục vụ
   tĩnh như mọi lần trước.
3. `pm2 restart hcrc-rp-server` (đổi `lib/reportCellFormat.js` +
   `lib/emailBodyRenderer.js` + `routes/reports.js`).
4. KHÔNG cần đổi gì ở CSDL (không có bảng/cột mới).

**Kiểm tra:**
- [ ] rp-user → "Báo cáo" → mở 1 trong 4 báo cáo "Doanh thu cuối ngày" →
  bảng có khung kẻ mảnh quanh từng ô (trước đây chỉ có gạch ngang dưới
  mỗi dòng).
- [ ] Cùng báo cáo đó → thấy ô "Cột hiển thị (không chọn = hiện đủ cột)"
  ngay dưới nút "Xuất Excel"/"Xuất PDF" → chọn vài cột → bảng web chỉ còn
  đúng các cột đã chọn, nhóm màu nào hết cột tự ẩn khỏi tiêu đề.
- [ ] Bấm "Xuất Excel"/"Xuất PDF" ngay sau khi chọn cột → file tải về
  CHỈ có đúng các cột đang hiện trên web (không phải luôn đủ cột như
  trước).
- [ ] Đổi sang báo cáo khác (không phải 4 báo cáo doanh thu) → KHÔNG thấy
  ô "Cột hiển thị" (chỉ 4 báo cáo doanh thu có, không ảnh hưởng báo cáo
  khác).
- [ ] Email báo cáo doanh thu gửi theo lịch (DeliveryMode='body') → số
  lẻ vẫn làm tròn ĐÚNG như Excel/PDF (vd 950000.6 → "950,001").

Không có bước nào làm mất dữ liệu đã có — không đổi schema CSDL.

---

## 8.96 — Email báo cáo giống màu PDF/Excel + chọn cột gửi + bảng doanh thu dãn dòng/nét hơn

**Thay đổi**: email gửi báo cáo doanh thu (DeliveryMode='body') nay chọn
được cột đưa vào nội dung, màu sắc giống hệt PDF/Excel; bảng kết quả báo
cáo doanh thu (web) giãn dòng + font nét hơn.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. Chạy lại NGUYÊN VĂN `rp-db/schema.sql` trên CSDL report (an toàn chạy
   lại nhiều lần — chỉ thêm cột `BodyColumnKeysJson` mới vào
   `app.ReportEmailSchedules` nếu CHƯA có, không đụng lịch gửi cũ).
3. `cd rp-user && npm run build` (đổi `styles.css` + thêm ô chọn cột ở
   `EmailSchedulesPage.jsx`). Copy TOÀN BỘ `dist/` lên vị trí phục vụ tĩnh
   như mọi lần trước.
4. `pm2 restart hcrc-rp-server` (đổi `emailBodyRenderer.js` +
   `routes/reportEmailSchedules.js` + `jobs/reportEmailScheduler.js`).

**Kiểm tra:**
- [ ] rp-user → "Báo cáo" → mở báo cáo "Doanh thu cuối ngày HCRC/LĐTĐ"
  (hoặc bản Thành viên) → bảng giãn dòng rõ hơn, chữ nét hơn; cuộn dọc →
  2 dòng tiêu đề nhóm màu vẫn dính đúng, KHÔNG dòng nào đè lên dòng nào.
- [ ] "Lịch gửi email báo cáo" → chọn 1 trong 4 báo cáo doanh thu → "Cách
  gửi" = "Bảng ngay trong nội dung email" → thấy ô "Cột hiển thị trong
  bảng" mới → chọn vài cột → "Tạo lịch"/"Lưu" → bấm "Gửi ngay" → kiểm tra
  hộp thư: chỉ đúng các cột đã chọn, màu nhóm/tổng cộng/xen kẽ GIỐNG HỆT
  file Excel/PDF xuất từ chính báo cáo đó.
- [ ] Lịch gửi email CŨ (tạo trước bản này, chưa từng đụng tới ô chọn
  cột) → vẫn gửi ĐỦ TOÀN BỘ cột như trước (không bị mất cột nào) — tương
  thích ngược.

Không có bước nào làm mất dữ liệu đã có — cột `BodyColumnKeysJson` mới chỉ
THÊM, mặc định NULL cho lịch gửi cũ.

---

## 8.95 — Hiện tên nhà cung cấp thật + bộ lọc NCC cho báo cáo Đơn đặt/Nhập hàng

**Thay đổi**: cột "Nhà cung cấp" (3 báo cáo Đơn đặt/Nhập hàng/So sánh)
trước đây luôn TRỐNG — nay JOIN đúng tên thật từ bảng `SUPPLIER`
(DSMART16), thêm cột mã NCC, thêm bộ lọc "Nhà cung cấp" (dropdown tìm
kiếm được, dữ liệu thật).

**Các bước triển khai (CHỈ áp dụng nếu đã triển khai bản 8.91-8.93 — nếu
chưa, làm theo "Hướng dẫn triển khai gộp" trước, bản này chỉ bổ sung):**
1. `git pull origin main`.
2. Chạy lại NGUYÊN VĂN `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So
   sánh (DSMART16 trung tâm).sql` trên DSMART16 trung tâm (an toàn,
   `CREATE OR ALTER VIEW`) — thêm JOIN bảng `SUPPLIER`.
3. Trên máy chủ report:
   ```bash
   cd rp-server
   node scripts/seedPurchaseOrderReports.js
   ```
   (cập nhật lại định nghĩa 3 báo cáo — thêm cột mã NCC + bộ lọc.)
4. KHÔNG cần chạy lại `seedDonDatHangSync.js` (etl/) — cột `MaNCC` đã
   đồng bộ sẵn từ trước, chỉ thiếu hiển thị ở tầng báo cáo.
5. Không cần restart `hcrc-rp-server` (script seed chỉ ghi catalog).

**Kiểm tra:** rp-user → "Đơn đặt hàng"/"Đơn nhập hàng" → cột "Nhà cung
cấp" hiện tên thật (không còn trống) + có thêm cột mã NCC; bộ lọc "Nhà
cung cấp" mở ra danh sách NCC thật (gõ tìm được), chọn 1 NCC → bảng chỉ
còn đúng đơn hàng của NCC đó.

---

## 8.94 — Vân tay/Face ID cho mọi user + Ma trận phân quyền báo cáo + Nút Sửa người dùng (cả 3 app)

**Thay đổi**: (1) mục "Vân tay/Face ID" ở trang "Tài khoản của tôi" nay
hiện cho MỌI user (trước chỉ Admin hệ thống); (2) thêm tab "Ma trận" ở
trang "Phân quyền" (`rp-user`) — xem/sửa quyền báo cáo dạng bảng lưới;
(3) nút "Sửa" người dùng sửa được Email ở cả 3 app (`rp-user` đã hỗ trợ
sẵn; `etl-admin`/`api-admin` cần thêm cột CSDL).

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` trên CSDL ETL và `api-db/schema.sql` trên
   CSDL API (an toàn chạy lại nhiều lần — script tự kiểm tra `COL_LENGTH`,
   CHỈ thêm cột `Email` mới vào `admin.AdminUsers` nếu CHƯA có, không đụng
   dữ liệu cũ). BỎ QUA bước này nếu không cần sửa Email cho etl-admin/
   api-admin — `rp-user` không cần đổi CSDL gì (cột Email đã có sẵn từ
   trước ở `app.Users`).
3. `cd rp-user && npm run build` (đổi `AccountPage.jsx`, thêm trang Ma
   trận, thêm modal Sửa ở `UsersPage.jsx`).
4. `cd etl-admin && npm run build` / `cd api-admin && npm run build` (đổi
   `AccountPage.jsx` + modal Sửa thêm Email).
5. `pm2 restart hcrc-rp-server` (thêm 3 route đọc ma trận mới + route
   PUT /system/users/:id không đổi logic, đã sẵn từ trước).
6. `pm2 restart hcrc-etl hcrc-api-server` (route GET/PUT users đổi, thêm
   Email) — BỎ QUA nếu bỏ qua bước 2.
7. Copy TOÀN BỘ `dist/` của cả 3 frontend lên đúng vị trí phục vụ tĩnh như
   mọi lần build trước (PM2-only hoặc Nginx tuỳ cách triển khai hiện có).

**Kiểm tra sau khi triển khai:**
- [ ] Đăng nhập bằng 1 tài khoản KHÔNG phải Admin hệ thống → "Tài khoản
  của tôi" → thấy mục "Bảo mật — Vân tay / Face ID", KHÔNG thấy mục "Xác
  thực hai yếu tố" → đăng ký 1 thiết bị → đăng xuất → màn hình đăng nhập
  → nút "Dùng vân tay/Face ID" vào thẳng, không hỏi mật khẩu.
- [ ] `rp-user` → "Phân quyền" → tab "Ma trận" → 3 tab con đều tải được
  dữ liệu, bấm 1 ô đổi đúng trạng thái NGAY (không cần F5), mở lại tab
  "Vai trò"/"Người dùng" cũ → quyền vừa đổi ở ma trận PHẢN ÁNH đúng.
- [ ] `rp-user` → "Phân quyền" → "Người dùng" → nút "Sửa" → đổi Email →
  Lưu → cột Email trong bảng cập nhật đúng.
- [ ] (Nếu đã chạy bước 2) `etl-admin`/`api-admin` → "Phân quyền" → nút
  "Sửa" → modal nay có thêm ô Email → sửa được, lưu đúng.

---

## 8.91-8.93 — Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận (nguồn STRANS, DSMART16)

**Thay đổi**: hoàn thiện thiết kế + sửa 2 lỗi phát hiện khi chạy thật 3
báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận" (bắt đầu từ bản
8.75, qua nhiều vòng xác nhận với DBA) — nguồn dữ liệu chốt là `STRANS`
(TRANS_CODE 133=đặt/333=nhập), mã siêu thị dùng `BU_ID` (không phải
`STK_ID`), `DonGia` tính từ `AMOUNT/QTY` (STRANS không có cột `PRICE`
riêng), watermark đồng bộ dùng `EventDate` (cột `STOPED_DT` dự định ban
đầu luôn NULL). Chi tiết đầy đủ xem `bc-don-dat-hang.md` (tài liệu tham
chiếu chính của 3 báo cáo này) và mục 8.91/8.92/8.93 trong `VERSION.md`.

**Các bước triển khai (làm 1 lần, theo đúng thứ tự):**
1. `git pull origin main`.
2. Chạy NGUYÊN VĂN `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh
   (DSMART16 trung tâm).sql` trên CSDL DSMART16 **trung tâm** — CHỈ 1 LẦN
   DUY NHẤT (không phải từng siêu thị) — an toàn chạy lại nhiều lần
   (`CREATE OR ALTER VIEW`).
3. (Tuỳ chọn) Kiểm tra VIEW có dữ liệu thật: `SELECT TOP 20 * FROM
   dbo.vw_DonDatHangChiNhanh ORDER BY EventDate DESC;`.
4. Trên máy chủ ETL — cần sẵn `DSMART16_SERVER`/`DSMART16_USER`/
   `DSMART16_PASSWORD` trong `etl/.env` (dùng lại được nếu đã có cho báo
   cáo doanh thu cuối ngày/tồn kho):
   ```bash
   cd etl
   node scripts/seedDonDatHangSync.js
   ```
   Script tự kiểm tra VIEW đủ cột, dừng lại báo lỗi rõ ràng nếu thiếu —
   không cần khởi động lại ETL, scheduler tự nạp job trong tối đa 60 giây.
5. Trên máy chủ report:
   ```bash
   cd rp-server
   node scripts/seedPurchaseOrderReports.js
   ```
   (menu "reports-mua-hang" đã có sẵn trong `rp-db/schema.sql`, không cần
   tạo thêm.)
6. Vào **Hệ thống → Phân quyền**, gán quyền xem 3 báo cáo
   (`bc-don-dat-hang`/`bc-don-nhap-hang`/`bc-so-sanh-dat-nhan`) cho đúng
   vai trò/người dùng cần xem — 2 script trên KHÔNG tự gán quyền.
7. Kiểm tra: siêu thị nào KHÔNG hiện trong báo cáo dù có đơn hàng thật →
   kiểm tra đã khai đủ cột `BuId` (tường minh) trong bảng "Ánh xạ Điểm -
   STK_ID" cho đúng mã `BU_ID` đó chưa.
8. Chờ job chạy (mỗi 15 phút) rồi mở rp-user → menu "Báo cáo Mua hàng" →
   kiểm tra cả 3 báo cáo có số liệu đúng, đặc biệt báo cáo "So sánh
   đặt–nhận" cộng dồn đúng khi 1 đơn được nhận nhiều lần.

**Chưa xác nhận, không chặn triển khai**: mã trạng thái mới `TrangThai =
'N'` (ngoài C/P/F/M/D/E đã biết) hiện tạm nhãn mã thô; công thức
`DonGia = AMOUNT/QTY` nên đối chiếu thêm với cách người dùng hiểu "đơn
giá" trên 2 loại giao dịch 133/333.

---

## 8.90 — Sửa proxy nội bộ không theo kịp khi backend chuyển sang HTTPS (PM2-only, cả 3 app)

**Thay đổi**: deployment PM2-only (không Nginx, dùng
`deploy/serve-static.js`) — upload "Chứng chỉ TLS" cho backend nào xong,
proxy nội bộ của tiến trình giao diện tương ứng giờ TỰ BIẾT gọi HTTPS
thay vì vẫn gọi HTTP (trước đây gây lỗi "Không kết nối được backend"/mất
captcha ngay cả khi không dùng Nginx).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-rp-user hcrc-api-admin hcrc-etl-admin hcrc-rp-server hcrc-api-server hcrc-etl`
   (BẮT BUỘC — đổi logic proxy ở `serve-static.js` + cách nối CA/chain ở
   `lib/tlsServer.js` cả 3 backend).
3. **CHỈ áp dụng cho ai ĐÃ upload "Chứng chỉ TLS" cho 1 backend nào đó
   (PM2-only, không Nginx)**: thêm dòng `TLS_CERT_DIR: '../<thư mục
   backend>/certs'` vào mục `env` của tiến trình giao diện TƯƠNG ỨNG
   trong `deploy/ecosystem.config.js` nếu CHƯA có — vd backend ETL thì
   thêm `TLS_CERT_DIR: '../etl/certs'` vào `hcrc-etl-admin` (ánh xạ đủ 3
   cặp: `hcrc-rp-user`↔`../rp-server/certs`,
   `hcrc-api-admin`↔`../api-server/certs`,
   `hcrc-etl-admin`↔`../etl/certs`) — rồi `pm2 restart` đúng tiến trình đó
   lần nữa. Thiếu bước này, proxy vẫn gọi HTTP dù đã deploy code ở bước 2
   (code chỉ TỰ BIẾT đổi sang HTTPS khi biết đúng thư mục chứng chỉ của
   backend qua biến này).
4. Kiểm tra: mở trang đăng nhập (etl-admin/api-admin/rp-user tuỳ đã upload
   chứng chỉ cho backend nào) → mã xác nhận hiện ảnh bình thường, đăng
   nhập được — không còn "Không kết nối được backend".

**Nếu KHÔNG cần backend chạy HTTPS** (đa số trường hợp — Nginx hoặc
reverse proxy khác đã lo TLS từ bên ngoài, hoặc chỉ dùng nội bộ): đơn giản
nhất là XOÁ chứng chỉ đã upload nhầm để quay lại HTTP như cũ:
```bash
rm etl/certs/*.pem       # hoặc rp-server/certs/*.pem, api-server/certs/*.pem
pm2 restart hcrc-etl     # hoặc hcrc-rp-server, hcrc-api-server
```

---

## 8.89 — Đăng nhập bằng vân tay/Face ID THAY THẾ HOÀN TOÀN mật khẩu + nhớ tên đăng nhập (cả 3 app)

**Thay đổi**: ai đã đăng ký vân tay/Face ID ở "Tài khoản của tôi" giờ bấm
nút vân tay NGAY Ở màn hình đăng nhập là vào thẳng, KHÔNG cần gõ mật
khẩu/captcha/mã 2FA nữa (áp dụng cả rp-user, etl-admin, api-admin); người
chưa đăng ký vẫn gõ mật khẩu như cũ. Trang đăng nhập cũng tự nhớ sẵn
username của lần trước (lưu ở máy, không phải phiên đăng nhập).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server hcrc-etl hcrc-api-server` (BẮT BUỘC — thêm
   route `/webauthn/login-by-username/options|verify` ở cả 3 backend).
3. `cd rp-user && npm run build`, `cd etl-admin && npm run build`,
   `cd api-admin && npm run build` — copy `dist/` mới cho cả 3.
4. Kiểm tra: mở trang đăng nhập (ẩn danh hoặc xoá cookie) → đăng nhập
   bằng mật khẩu 1 lần → đăng xuất → mở lại trang đăng nhập → username
   hiện sẵn (không cần gõ lại) + nút "Đăng nhập bằng vân tay / Face ID"
   xuất hiện (nếu tài khoản đó đã đăng ký thiết bị ở "Tài khoản của tôi")
   → bấm vào, xác thực vân tay/Face ID → vào thẳng hệ thống, không hỏi
   gì thêm.

---

## 8.88 — Sửa gửi email cổng 465 không gửi được khi máy chủ không bật TLS (rp-user/rp-server)

**Thay đổi**: "Thiết lập email" cổng 465 giờ gửi ĐÚNG theo checkbox
"Secure" admin đã tick/bỏ tick — trước đây bị ép cứng `secure=true` mỗi
khi port=465, khiến Postfix nội bộ KHÔNG bật TLS ở cổng đó không cách
nào gửi được (lỗi OpenSSL "wrong version number").

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi logic gửi email
   `rp-server/lib/mailer.js`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. Kiểm tra: "Thiết lập email" → cổng 465 → BỎ tick "Secure" nếu máy chủ
   thật không bật TLS ở cổng đó → "Gửi thử" → gửi thành công (trước đây
   luôn lỗi "wrong version number" dù đã bỏ tick).

---

## 8.87 — Chặn bớt số job chạy đồng thời + không bỏ sót lỗi xin khoá (ETL)

**Thay đổi**: tối đa 4 job đồng bộ chạy THỰC SỰ cùng lúc (trước đây không
giới hạn — 68 job "(TV)" cùng lịch 2 phút/lần tranh pool 'ADMIN' gây lỗi
hàng loạt "operation timed out"); lỗi xin khoá sp_getapplock giờ ghi
FAILED + gửi cảnh báo như mọi lỗi khác (trước đây chỉ in pm2 log, không
lên trang "Đồng bộ").

**Các bước triển khai:**
1. `git pull origin main`.
2. (Tuỳ chọn) Thêm `ETL_MAX_CONCURRENT_JOBS=4` vào `etl/.env` nếu muốn
   đổi khác mặc định — bỏ qua vẫn dùng được.
3. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi logic chạy job/xin khoá).
4. Kiểm tra: `pm2 logs hcrc-etl` sau vài chu kỳ cron — không còn hàng
   loạt lỗi "operation timed out" đồng thời; nếu còn lỗi xin khoá, giờ
   thấy đúng dòng đó XUẤT HIỆN TRÊN trang etl-admin → "Đồng bộ" → "Job
   lỗi trong 24h qua" (trước đây không hiện).

---

## 8.86 — Thử lại + rút ngắn thời gian chờ khi VPN chi nhánh chập chờn giữa chừng đồng bộ (ETL)

**Thay đổi**: job đồng bộ "(TV)"/định kỳ giờ thất bại NHANH hơn (90 giây
thay vì 10 phút) khi VPN chi nhánh làm treo giữa chừng câu truy vấn, VÀ
được thử lại NGAY (tối đa 3 lần, làm mới kết nối trước mỗi lần) trước khi
báo lỗi hẳn — không đổi gì cho job "Lịch sử"/lần chạy đầu tiên.

**Các bước triển khai:**
1. `git pull origin main`.
2. (Tuỳ chọn) Thêm `DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS=90000` vào
   `etl/.env` nếu muốn đổi khác mặc định 90 giây — KHÔNG bắt buộc, có sẵn
   giá trị mặc định nếu bỏ qua bước này.
3. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi logic lấy kết nối/trích xuất).
4. Kiểm tra: etl-admin → "Đồng bộ" → theo dõi "Job lỗi trong 24h qua" sau
   vài giờ — số lượt lỗi "operation timed out..." giảm rõ rệt so với
   trước; `pm2 logs hcrc-etl` thấy dòng "⏳ [...] Lỗi mạng khi trích xuất
   lô dữ liệu (lần N/2): ... — làm mới kết nối, thử lại sau 5s..." khi có
   VPN chập chờn (bình thường, không phải lỗi cần xử lý tay).

---

## 8.85 — Sửa màn hình trắng khi vào URL không khớp route nào (rp-user)

**Thay đổi**: thêm route "bắt đáy" (`path="*"` → về trang chủ) cho
rp-user — trước đây 1 URL không khớp route nào (vd gõ tay `/system`)
làm mất luôn cả sidebar/topbar, chỉ còn trang trắng.

**Các bước triển khai (chỉ frontend, KHÔNG cần restart backend nào):**
1. `git pull origin main`.
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: gõ thẳng URL `.../system` (hoặc URL bất kỳ không có trang) →
   về trang chủ, sidebar/topbar hiện bình thường (không còn trang trắng).

---

## 8.84 — Dropdown "Chọn nhóm" thay thẻ lưới ở trang Dashboard (rp-user)

**Thay đổi**: trang Dashboard (rp-user) chọn nhóm bằng dropdown (cùng
kiểu "Chọn báo cáo" ở trang Báo cáo) thay thẻ lưới cũ — chỉ đổi giao
diện, không đổi dữ liệu/quyền xem.

**Các bước triển khai (chỉ frontend, KHÔNG cần restart backend nào):**
1. `git pull origin main`.
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: trang Dashboard (có ≥ 2 nhóm) → thấy dropdown "Chọn nhóm"
   thay thẻ lưới cũ → chọn nhóm khác → danh sách ô đổi đúng theo nhóm.

---

## 8.83 — PWA thật cho etl-admin + api-admin (đồng bộ ngang rp-user)

**Thay đổi**: etl-admin + api-admin giờ là PWA thật (manifest + service
worker qua `vite-plugin-pwa`), cài được "Thêm vào màn hình chính" trên
điện thoại như rp-user đã có từ bản 6.18. Kiểm tra lại responsive cả 3
app ở khung điện thoại — không phát hiện lỗi mới.

**Các bước triển khai (giống bản 6.18 — có gói npm MỚI + sửa Nginx):**
1. `git pull origin main`.
2. `cd etl-admin && npm install && cd ../api-admin && npm install` (gói
   mới `vite-plugin-pwa`).
3. `cd etl-admin && npm run build && cd ../api-admin && npm run build`,
   copy `dist/` mới (giờ có thêm `manifest.webmanifest`, `sw.js`,
   `registerSW.js`, `workbox-*.js` — copy TOÀN BỘ `dist/`, không thiếu
   file nào).
4. **Sửa tay Nginx** (nếu dùng mô hình Nginx đọc thẳng file, không phải
   PM2-only): thêm khối `location = /manifest.webmanifest {
   default_type application/manifest+json; add_header Cache-Control
   "no-cache" always; }` vào server block `api-admin.hcrc.vidu.vn` VÀ
   `etl-admin.hcrc.vidu.vn` — xem `deploy/nginx.conf` mục tương ứng.
   `nginx -t` rồi `systemctl reload nginx`. (Mô hình PM2-only/
   `serve-static.js` KHÔNG cần sửa gì — đã tự nhận `manifest.webmanifest`
   dùng chung cho cả 3 app từ trước.)
5. Kiểm tra: mở etl-admin/api-admin bằng điện thoại thật → Android Chrome
   (menu ⋮ → "Cài đặt ứng dụng") hoặc iOS Safari (Chia sẻ → "Thêm vào màn
   hình chính") → icon riêng từng app hiện trên màn hình chính, mở toàn
   màn hình (không thanh địa chỉ trình duyệt).

---

## 8.81 — Xoá kèm job đồng bộ khi Nguồn dữ liệu còn job tham chiếu (ETL)

**Thay đổi**: xoá 1 Nguồn dữ liệu bị chặn (còn Sync Job tham chiếu) giờ
hỏi thêm "Xoá CẢ N job này CÙNG LÚC với nguồn?" — đồng ý thì xoá job
trước rồi xoá nguồn, trong 1 thao tác, không cần tự qua trang "Đồng bộ"
xoá job trước. `DELETE /data-sources/:id` nhận thêm `cascadeJobs: true`.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — route DELETE đổi logic).
3. `cd etl-admin && npm run build`, copy `dist/` mới.
4. Kiểm tra: xoá 1 nguồn còn job tham chiếu → thấy hộp thoại hỏi RIÊNG
   "Xoá CẢ N job này..." nêu đúng tên job → đồng ý → nguồn VÀ các job đó
   đều mất; bấm "Huỷ" ở bước 2 → không mất gì cả, giữ nguyên lỗi chặn.

---

## 8.80 — Bật/Tắt hàng loạt + sửa xoá hàng loạt dừng cả loạt (ETL)

**Thay đổi**: thêm nút "Bật N đã chọn"/"Tắt N đã chọn" cho trang "Nguồn
dữ liệu" và "Đồng bộ" (etl-admin). Sửa vòng lặp xoá hàng loạt (2 trang
này) để lỗi 1 mục (vd nguồn còn job tham chiếu) KHÔNG còn chặn các mục
khác — trước đây dừng im lặng ngay mục đầu tiên bị lỗi.

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd etl-admin && npm run build`, copy `dist/` mới (sửa thuần frontend
   — KHÔNG cần `pm2 restart` backend).
3. Kiểm tra: Nguồn dữ liệu/Đồng bộ → tick nhiều dòng → thấy đủ 3 nút
   "Bật N"/"Tắt N"/"Xoá N đã chọn" → bấm "Bật"/"Tắt" đổi đúng trạng thái
   TOÀN BỘ dòng đã chọn; thử xoá hàng loạt khi 1 nguồn còn job tham
   chiếu → các nguồn KHÁC vẫn xoá được, trang báo rõ tên nguồn bị chặn.

---

## 8.79 — KHẨN: Sửa crash rp-server trên Node < 22.4

**Thay đổi**: `rp-server/lib/trustedCa.js` (bản 8.72) gọi API chỉ có từ
Node >= 22.4 ngay lúc nạp module — crash TOÀN BỘ `hcrc-rp-server` trên
server chạy Node cũ hơn (mọi API kể cả captcha/`/api/me` đều 502). Sửa
tự nhận diện Node không hỗ trợ → tắt gọn tính năng "CA tin cậy" thay vì
crash cả tiến trình.

**Các bước triển khai (KHẨN — làm ngay):**
1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — sửa thuần code, không đổi
   CSDL, không cần `npm install`/build frontend).
3. Kiểm tra NGAY: `pm2 status hcrc-rp-server` → cả 2 worker `online`
   (không còn `errored`); `pm2 logs hcrc-rp-server` → không còn dòng
   `TypeError: tls.getCACertificates is not a function`; mở lại trang
   đăng nhập report.hcrc.vn → captcha hiện ảnh bình thường, đăng nhập
   được. Nếu server này có dùng tính năng "CA tin cậy" (trang "Chứng chỉ
   TLS" → mục CA tin cậy) và Node hiện tại < 22.4: mục đó trống, thêm CA
   mới báo lỗi rõ "cần Node.js >= 22.4" — cần nâng cấp Node.js trên server
   rồi `pm2 restart hcrc-rp-server` lại để dùng được tính năng này (không
   ảnh hưởng gì khác nếu chưa nâng cấp).

---

## 8.78 — Đồng bộ 2FA đổi/thêm thiết bị + vân tay/Face ID (WebAuthn) — ETL, API

**Thay đổi**: đồng bộ đầy đủ ngang rp-user (bản 8.40/8.41) cho CẢ
etl-admin lẫn api-admin — "Đặt lại mã 2FA" (đổi thiết bị Authenticator) +
đăng ký vân tay/Face ID (WebAuthn), lúc đăng nhập có thêm nút "Dùng vân
tay/Face ID" thay HẲN bước nhập mã 2FA. Có bảng CSDL mới + gói npm mới +
BẮT BUỘC khai domain thật cho CẢ 2 app.

**Các bước triển khai (giống bản 8.41, nhân đôi cho etl-admin VÀ
api-admin):**
1. `git pull origin main`
2. Chạy lại `etl-db/schema.sql` (thêm bảng `admin.AdminWebAuthnCredentials`,
   an toàn chạy lại nhiều lần) VÀ `api-db/schema.sql` (bảng cùng tên, CSDL
   riêng `HCRC_API`).
3. **Thêm vào `etl/.env`**: `WEBAUTHN_RP_ID=<domain thật etl-admin, không
   có https://>` và `WEBAUTHN_RP_ORIGIN=https://<domain thật etl-admin>`.
4. **Thêm vào `api-server/.env`**: `WEBAUTHN_RP_ID=<domain thật api-admin>`
   và `WEBAUTHN_RP_ORIGIN=https://<domain thật api-admin>`. THIẾU 1 trong 2
   biến ở mỗi app thì tính năng vân tay tự tắt ở ĐÚNG app đó (không crash,
   "Đặt lại mã 2FA" vẫn dùng được bình thường).
5. `cd etl && npm install` VÀ `cd api-server && npm install` (gói mới
   `@simplewebauthn/server`).
6. `cd etl-admin && npm run build`, copy `dist/` mới VÀ `cd api-admin &&
   npm run build`, copy `dist/` mới (gói mới `@simplewebauthn/browser`).
7. `pm2 restart hcrc-etl` VÀ `pm2 restart hcrc-api-server` (BẮT BUỘC —
   route mới `/admin/webauthn/*`).
8. Kiểm tra bằng THIẾT BỊ THẬT (điện thoại/laptop có vân tay/Face ID,
   không mô phỏng được), LÀM Ở CẢ 2 APP: "Tài khoản của tôi" (tài khoản
   Admin hệ thống) có thêm mục "Bảo mật — Xác thực hai yếu tố" (thử "Đặt
   lại mã 2FA" 1 lần, mã cũ ngừng dùng được) và "Bảo mật — Vân tay / Face
   ID" (đăng ký 1 thiết bị, đăng xuất/đăng nhập lại, bấm "Dùng vân tay/Face
   ID" vào thẳng hệ thống không cần gõ mã 6 số).

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.78 — 2FA đổi thiết bị + WebAuthn
cho ETL, API.md`.

---

## 8.77 — Xuất Excel chưa mã hoá cho Nguồn dữ liệu

**Thay đổi**: thêm nút "Xuất Excel (danh sách hiện có, chưa mã hoá)" ở
trang Nguồn dữ liệu — cột Password luôn để trống (an toàn), nộp lại qua
Nhập hàng loạt với Password để trống = giữ nguyên mật khẩu cũ. Sửa kèm
backend để chấp nhận Password trống khi "Name" đã tồn tại. Chi tiết:
`deploy/Cập nhật bản 8.77 — Xuất Excel chưa mã hoá cho Nguồn dữ liệu.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — route mới + sửa logic nhập hàng
   loạt).
3. `cd etl-admin && npm run build`, copy `dist/` mới (nút mới ở trang
   Nguồn dữ liệu).
4. Kiểm tra: vào Nguồn dữ liệu → "Xuất Excel (danh sách hiện có, chưa mã
   hoá)" → mở file → cột Password trống, các cột khác đúng dữ liệu thật →
   sửa 1 dòng (vd đổi Server) → nộp lại qua "Nhập hàng loạt" (để nguyên
   Password trống) → dòng đó cập nhật đúng Server mới, mật khẩu KHÔNG đổi
   (vẫn kết nối được như trước).

---

## 8.76 — Sửa treo khi xoá hàng loạt Nguồn dữ liệu (ETL)

**Thay đổi**: sửa `etl/lib/dataSourcePool.js` (timeout 5s khi đóng kết nối
cũ, trước đây có thể treo vĩnh viễn nếu nguồn DSmart16 rớt mạng kiểu
"zombie") + `etl/routes/admin/dataSources.js` (báo lỗi rõ ràng khi xoá
nguồn còn Sync Job tham chiếu, thay vì lỗi SQL thô). Sửa thuần backend,
không đổi CSDL.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — nạp code mới).
3. Kiểm tra: chọn nhiều "Nguồn dữ liệu"/"Đồng bộ" → xoá hàng loạt — không
   còn bị treo (kể cả khi 1 nguồn trong đó đang mất kết nối mạng thật).

---

## 8.75 — Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận

**Thay đổi**: thêm 3 báo cáo mới dựa trên dữ liệu đơn hàng DSmart16
(`ST_ORDER`/`ST_ORDER_ARC`). Chi tiết đầy đủ: `bc-don-dat-hang.md`,
`deploy/Cập nhật bản 8.75 — Báo cáo Đơn đặt hàng-Nhập hàng-So sánh.md`.

**Các bước triển khai (CHƯA xong bước DBA — xem bước 1):**
1. **[DBA]** Đối chiếu VIEW mẫu ở `bc-don-dat-hang.md` mục 2 với tên cột
   THẬT của `ST_ORDER`/`ST_ORDER_ARC` (hiện chỉ là VÍ DỤ, chưa xác nhận) —
   tạo `CREATE VIEW dbo.vw_DonDatHangChiNhanh` trên DSMART16 với tên cột
   ĐÃ SỬA ĐÚNG.
2. `git pull origin main`.
3. Chạy `rp-db/schema.sql` (BẮT BUỘC — sửa `CK_ReportCatalog_SourceType`,
   kèm fix 2 giá trị thiếu từ bản 8.68).
4. `cd etl && node scripts/seedDonDatHangSync.js` (cần
   `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` trong `.env`, xem
   đầu file script) — tạo Sync Job domain `don_dat_hang`.
5. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — tạo 3
   `ReportCatalog`.
6. Vào rp-user → Hệ thống → Phân quyền — gán quyền xem 3 `ReportId`
   (`bc-don-dat-hang`/`bc-don-nhap-hang`/`bc-so-sanh-dat-nhan`) cho đúng
   vai trò.
7. `pm2 restart hcrc-etl hcrc-rp-server` (nạp code mới —
   `purchaseOrderRunner.js`/route `SourceType='purchaseOrder'`).
8. Kiểm tra: đợi tối đa 15 phút (chu kỳ đồng bộ) rồi mở 1 trong 3 báo cáo
   — có dữ liệu đúng siêu thị đã khai "Ánh xạ Điểm - STK_ID"; siêu thị
   CHƯA khai ánh xạ sẽ KHÔNG xuất hiện (không phải lỗi — bổ sung ánh xạ để
   hiện ra).

---

## 8.74 — Sửa lỗi captcha đăng nhập hiện rỗng không log (KHẨN)

**Thay đổi**: sửa `src/lib/api.js` (cả 3 app) để KHÔNG còn âm thầm coi
response không phải JSON (dù status 200) là thành công — trước đây khiến
captcha (và bất kỳ API nào khác gặp tình huống tương tự) hiện rỗng mà
không log lỗi ở đâu cả. Chi tiết đầy đủ + cách chẩn đoán nguyên nhân gốc
(có thể là thiếu `PROXY_PREFIX`/`PROXY_TARGET_PORT` ở triển khai PM2-only):
`deploy/Cập nhật bản 8.74 — Sửa lỗi captcha đăng nhập hiện rỗng không
log.md`.

**Các bước triển khai (BẮT BUỘC — ảnh hưởng toàn bộ 3 trang đăng nhập):**
1. `git pull origin main`.
2. `cd rp-user && npm run build`, `cd ../etl-admin && npm run build`,
   `cd ../api-admin && npm run build` — copy `dist/` mới cho cả 3 giao
   diện (sửa thuần frontend, KHÔNG cần restart backend/PM2 nào).
3. **Kiểm tra NGAY xem captcha đã hiện ảnh chưa** ở cả 3 trang đăng nhập
   (report/etl-admin/api-admin). Nếu VẪN trống:
   a. Mở DevTools (F12) → tab Console lúc tải lại trang đăng nhập — giờ
      PHẢI thấy dòng lỗi rõ ràng "Không tải được captcha: ...".
   b. Nếu lỗi là "Phản hồi không phải JSON" → chạy
      `curl -i https://<domain>/api/auth/captcha` (đổi `/api` thành
      `/admin` cho etl-admin/api-admin) — nếu trả về HTML thay vì JSON,
      server đang chạy theo mô hình "PM2-only" (không Nginx) và THIẾU 2
      biến môi trường `PROXY_PREFIX`/`PROXY_TARGET_PORT` ở tiến trình
      giao diện tương ứng trong `deploy/ecosystem.config.js` — thêm đúng
      2 biến này (xem chú thích đầu `deploy/serve-static.js`) rồi
      `pm2 restart hcrc-rp-user`/`hcrc-etl-admin`/`hcrc-api-admin`. Đây là
      SỬA CẤU HÌNH, không phải chạy lại bước nào ở trên.

---

## 8.73 — Thu hẹp "CA tin cậy": chỉ còn report server

**Thay đổi**: gỡ bỏ phần "CA tin cậy" (bản 8.72) khỏi etl và api-server
(backend + UI etl-admin/api-admin) theo yêu cầu người dùng — tính năng
này CHỈ còn ở rp-server/rp-user. Không ảnh hưởng gì nếu chưa từng thêm CA
nào ở etl/api-server (file `.pem` cũ trong `certs/trusted-ca/` của 2 hệ
thống này, nếu có, không còn được đọc nữa — có thể xoá thủ công, không
bắt buộc). Chi tiết đầy đủ: `deploy/Cập nhật bản 8.73 — Thu hẹp CA tin
cậy chỉ còn report server.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server` (BẮT BUỘC — bỏ route
   `/admin/trusted-ca`; `hcrc-rp-server` KHÔNG cần restart, không đổi).
3. `cd etl-admin && npm run build`, `cd ../api-admin && npm run build`,
   copy `dist/` mới cho 2 giao diện này (trang "Chứng chỉ TLS" bỏ phần
   "CA tin cậy", trở lại đúng bản 8.71) — rp-user KHÔNG cần build lại.
4. Không có bước kiểm tra riêng — nếu etl-admin/api-admin đã từng thêm CA
   tin cậy, admin sẽ không còn thấy phần đó nữa (bình thường, đúng ý).

---

## 8.72 — "CA tin cậy": nhận diện HTTPS của hệ thống khác khi PM2 tự gọi ra ngoài

**Thay đổi**: thêm phần "CA tin cậy" vào CÙNG trang "Chứng chỉ TLS" (bản
8.71) ở cả 3 giao diện — chiều NGƯỢC LẠI: khi etl/api-server/rp-server tự
GỌI RA sang hệ thống khác dùng HTTPS ký bởi CA nội bộ/tự tạo (vd rp-server
gọi api-server, bản 8.70), admin thêm đúng CA đó để Node tin tưởng, áp
dụng NGAY không cần restart. Tính năng TỰ CHỌN, không ảnh hưởng gì nếu
chưa dùng. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.72 — CA tin cậy cho
cuộc gọi HTTPS ra ngoài.md`.

**Các bước triển khai (CHỈ cần nếu 2 service nội bộ/bên ngoài gọi nhau
qua HTTPS bằng CA không phải CA công khai — bỏ qua nếu không gặp lỗi
"self signed certificate" khi gọi ra):**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server hcrc-rp-server` (BẮT BUỘC — thêm
   route/lib mới, KHÔNG đổi hành vi nếu chưa thêm CA nào).
3. Build + copy `dist/` mới cho cả 3 giao diện (trang "Chứng chỉ TLS" có
   thêm phần "CA tin cậy").
4. Vào trang "Chứng chỉ TLS" của ĐÚNG hệ thống đang GỌI RA bị lỗi (vd
   rp-server gọi api-server lỗi thì vào rp-user) → phần "CA tin cậy" →
   thêm nhãn gợi nhớ + file CA của hệ thống BÊN KIA → áp dụng ngay, không
   cần restart.
5. Kiểm tra lại: cuộc gọi trước đó bị lỗi "self signed certificate" nay
   thành công.

---

## 8.71 — Upload chứng chỉ TLS qua giao diện web cho cả 3 hệ thống (PM2 tự chạy HTTPS)

**Thay đổi**: thêm trang "Chứng chỉ TLS" ở cả 3 giao diện quản trị
(etl-admin/api-admin/rp-user) — admin upload CA/private key/public cert,
tiến trình backend tương ứng (etl/api-server/rp-server) VÀ giao diện tĩnh
song sinh tự chạy HTTPS trực tiếp, không cần Nginx. Tính năng TỰ CHỌN
(opt-in), mặc định tắt — không ảnh hưởng gì hệ thống đang dùng Nginx.
Chi tiết đầy đủ + hướng dẫn CA nội bộ giữa các service: `deploy/Cập nhật
bản 8.71 — Upload chứng chỉ TLS qua giao diện web.md`.

**Các bước triển khai (CHỈ cần nếu muốn dùng tính năng này — bỏ qua hoàn
toàn nếu hệ thống đang dùng Nginx để lo TLS):**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server hcrc-rp-server` (BẮT BUỘC — thêm
   route/lib mới, KHÔNG đổi hành vi nếu chưa upload chứng chỉ nào).
3. `cd etl-admin && npm run build`, `cd ../api-admin && npm run build`,
   `cd ../rp-user && npm run build`, copy `dist/` mới cả 3 (trang "Chứng
   chỉ TLS" mới).
4. Vào từng trang (etl-admin/api-admin/rp-user, chỉ tài khoản vai trò hệ
   thống thấy mục "Chứng chỉ TLS") → upload private key + public cert
   (+ CA/chain nếu có) → trang báo "Lần upload ĐẦU TIÊN — cần restart" →
   chạy đúng lệnh `pm2 restart` được hiện ra.
5. (Tuỳ chọn, nếu muốn giao diện tĩnh — rp-user/api-admin/etl-admin — CŨNG
   chạy HTTPS, không chỉ backend) Thêm biến `TLS_CERT_DIR` vào
   `deploy/ecosystem.config.js` của ĐÚNG tiến trình giao diện tĩnh, trỏ
   tới thư mục `certs/` của backend song sinh (vd `TLS_CERT_DIR:
   '../etl/certs'` cho `hcrc-etl-admin`) rồi `pm2 restart` tiến trình đó.
6. (Nếu 2 service NỘI BỘ gọi lẫn nhau qua HTTPS bằng CA tự tạo/nội bộ —
   vd rp-server gọi api-server, bản 8.70) Copy file CA.pem sang máy/máy
   chủ bên GỌI, đặt `NODE_EXTRA_CA_CERTS=/đường-dẫn/ca.pem` trong `.env`
   của service đó rồi restart — xem chi tiết lý do + ví dụ ở file deploy
   riêng.
7. Kiểm tra lại: `curl -k https://<ip-máy-chủ>:<cổng>/` (etl 4003/api-server
   4002/rp-server 4001, và 3 giao diện nếu làm bước 5) trả về đúng dữ liệu;
   lần upload SAU (gia hạn) không cần restart, áp dụng ngay.

---

## 8.70 — Upload cảnh báo hàng tồn NGAY trên rp-user (siêu thị tự upload)

**Thay đổi**: thêm đường upload MỚI cho file ngưỡng cảnh báo hàng tồn —
siêu thị tự upload NGAY trên rp-user (trang mới "Upload cảnh báo hàng
tồn"), rp-server tự chặn đúng theo "Phạm vi dữ liệu" của người đăng nhập
rồi gọi API NỘI BỘ sang api-server để ghi thẳng vào CSDL ETL (api-server
dùng lại tài khoản SQL etl_admin đã có sẵn, KHÔNG đụng gì etl/etl-admin).
Đường upload cũ qua etl-admin (admin HO, bản 8.68/8.69) vẫn giữ nguyên,
chạy song song, cùng ghi 1 bảng. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.70 — Upload cảnh báo hàng tồn từ rp-user.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — thêm menu mới
   `stock-alert-upload`).
3. Khai biến môi trường MỚI ở **CẢ 2** `.env`:
   - `rp-server/.env`: `INTERNAL_API_SERVER_URL` (URL gốc api-server, vd
     `http://localhost:4002`) và `INTERNAL_API_SECRET` (chuỗi bí mật tự
     chọn).
   - `api-server/.env`: `ETL_DB_SERVER`/`ETL_DB_DATABASE`/`ETL_DB_USER`/
     `ETL_DB_PASSWORD` (**COPY Y NGUYÊN** giá trị `ADMIN_*` đang có trong
     `etl/.env` — dùng lại đúng tài khoản `etl_admin`, KHÔNG tạo tài khoản
     SQL mới) và `INTERNAL_API_SECRET` (**PHẢI khớp y hệt** giá trị vừa
     đặt ở rp-server/.env). Tuỳ chọn: `INTERNAL_ALLOWED_IPS` (IP máy chủ
     rp-server, nếu muốn thêm lớp chặn IP).
4. `pm2 restart hcrc-rp-server` và `pm2 restart hcrc-api-server` (BẮT
   BUỘC — KHÔNG cần restart `hcrc-etl`, bản này không đụng etl).
5. `cd rp-user && npm run build`, copy `dist/` mới (trang "Upload cảnh báo
   hàng tồn" mới).
6. rp-user → "Vai trò" → cấp quyền menu "Upload cảnh báo hàng tồn" cho vai
   trò "Siêu thị"/vai trò cần dùng (mặc định CHƯA ai có quyền này).
7. Kiểm tra lại: đăng nhập 1 tài khoản đã gán "Phạm vi dữ liệu" 1 siêu thị
   (bản 8.50) → vào "Upload cảnh báo hàng tồn" → thấy đúng tên siêu thị
   mình → upload file đúng phạm vi → thành công; thử file có dòng thuộc
   siêu thị khác → bị từ chối rõ ràng (400), không ghi gì. Vào etl-admin →
   "Cảnh báo hàng tồn" → thấy đúng dữ liệu vừa upload từ rp-user.

---

## 8.69 — Sửa THIẾU SÓT bản 8.68: chặn đúng theo siêu thị + sửa lỗi import xoá nhầm dữ liệu siêu thị khác

**Thay đổi**: 2 lỗi của bản 8.68 ở trang etl-admin "Cảnh báo hàng tồn" —
(1) upload file của 1 siêu thị trước đây XOÁ SẠCH ngưỡng của MỌI siêu thị
khác (nay chỉ thay đúng (các) siêu thị có trong file); (2) etl-admin
TRƯỚC GIỜ không có khái niệm "tài khoản chỉ thấy 1 siêu thị" (nay thêm
bảng `admin.AdminUserStoreAccess` + gán qua trang "Phân quyền" → nút "Gán
siêu thị", áp dụng cho GET/DELETE/import của trang "Cảnh báo hàng tồn").
Chi tiết đầy đủ: `deploy/Cập nhật bản 8.69 — Chặn đúng theo siêu thị cho
Cảnh báo hàng tồn.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (BẮT BUỘC — bảng mới
   `admin.AdminUserStoreAccess`).
3. `pm2 restart hcrc-etl` (BẮT BUỘC — sửa cả `lib/adminPermissions.js` và
   các route `/admin/users`, `/admin/stock-alert-thresholds`).
4. `cd etl-admin && npm run build`, copy `dist/` mới (trang "Phân quyền"
   có cột + nút mới).
5. Vào "Phân quyền" → với mỗi tài khoản chỉ quản lý 1 (vài) siêu thị cụ
   thể, bấm "Gán siêu thị" → chọn đúng (các) siêu thị đó → Lưu. Tài khoản
   KHÔNG gán gì (mặc định) = xem/sửa được TOÀN BỘ (giữ nguyên hành vi cũ
   — an toàn ngược, không tự ý giới hạn tài khoản nào chưa được gán rõ).
6. Kiểm tra lại: đăng nhập thử 1 tài khoản đã gán siêu thị → vào "Cảnh
   báo hàng tồn" → chỉ thấy đúng dòng của siêu thị đó; thử upload file có
   dòng thuộc siêu thị khác → phải bị từ chối rõ ràng (400), không ghi gì.

---

## 8.68 — Báo cáo tồn kho theo ngưỡng + Cảnh báo hàng tồn

**Thay đổi**: 2 báo cáo tồn kho mới — "Tồn kho theo ngưỡng" (tự chọn chiều
trên/dưới + mức lọc ngay trên bộ lọc) và "Cảnh báo hàng tồn" (ngưỡng riêng
từng cặp Mã hàng/Siêu thị, upload qua etl-admin). Dùng lại đúng domain
`banhang_sku`/`tonkho_sku` đã có — KHÔNG CẦN VIEW MỚI nếu báo cáo
"bc-ton-kho-0" đã chạy ổn. Áp "Phạm vi dữ liệu" (bản 8.50/8.51) theo siêu
thị cho cả 2. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.68 — Báo cáo tồn
kho theo ngưỡng + Cảnh báo hàng tồn.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. (Nếu CHƯA làm báo cáo "bc-ton-kho-0") DBA tạo 2 VIEW + chạy
   `node scripts/seedZeroStockSkuSync.js` — xem file chi tiết ở trên.
3. Chạy lại `etl-db/schema.sql` (BẮT BUỘC — bảng mới
   `etl.StockAlertThresholds`).
4. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC).
5. `cd etl-admin && npm run build`, `cd rp-user && npm run build`, copy
   `dist/` mới cả 2.
6. `cd rp-server && node scripts/seedStockThresholdReport.js && node
   scripts/seedStockAlertReport.js`.
7. Gán quyền menu "Cảnh báo hàng tồn" (etl-admin) + quyền xem 2 báo cáo
   mới (rp-user → Phân quyền).
8. etl-admin → "Cảnh báo hàng tồn" → upload danh sách ngưỡng (nếu dùng).

## 8.67 — Sửa THIẾU SÓT: SMTP (Postfix/Exchange/Gmail) chưa hỗ trợ chứng chỉ TLS tự ký

**Thay đổi**: nhánh SMTP (Postfix/Exchange qua SMTP/Gmail) thiếu cờ bỏ
qua kiểm tra chứng chỉ TLS tương đương EWS — chứng chỉ TỰ KÝ (phổ biến ở
Postfix nội bộ) bị từ chối thẳng, gửi thất bại dù host/port/mật khẩu
đúng. `app.EmailSettings` thêm cột `SmtpInsecureTls`; `rp-server/lib/
mailer.js` + `etl/lib/mailer.js` (biến `.env` mới `SMTP_INSECURE_TLS`)
truyền `tls.rejectUnauthorized` theo cờ này. Đã kiểm chứng bằng test thật
(máy chủ SMTPS giả, chứng chỉ tự ký) — lỗi "self-signed certificate"
trước khi sửa, gửi được sau khi sửa.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — thêm cột `SmtpInsecureTls` vào
   `app.EmailSettings`, an toàn chạy lại nhiều lần, mặc định `0`, không
   đổi cấu hình đang chạy).
3. `pm2 restart hcrc-rp-server` và `pm2 restart hcrc-etl` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
4. `cd rp-user && npm run build`, copy `dist/` mới (checkbox mới ở "Thiết
   lập email").
5. Nếu Postfix/SMTP dùng chứng chỉ TỰ KÝ: rp-user → "Thiết lập email" →
   tick "Bỏ qua kiểm tra chứng chỉ TLS" → Lưu → "Gửi thử" xác nhận gửi
   được; ETL (nếu alert email cũng qua Postfix này): thêm
   `SMTP_INSECURE_TLS=true` vào `etl/.env` → `pm2 restart hcrc-etl`.

Không ảnh hưởng gateway dùng chứng chỉ CA công khai hợp lệ (mặc định vẫn
kiểm tra chứng chỉ như trước).

## 8.66 — Thêm preset Gmail, giữ đủ 4 phương thức SMTP/EWS trong "Thiết lập email"

**Thay đổi**: thêm preset "Gmail — đăng nhập qua SMTP (cổng 587)" vào
dropdown "Loại email gateway" (`smtp.gmail.com`, port 587, kèm hướng dẫn
bật "Xác minh 2 bước" + tạo "Mật khẩu ứng dụng"). Thuần frontend, không
đổi backend/CSDL.

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Không cần restart backend, không cần chạy lại CSDL.
4. Kiểm tra: "Thiết lập email" → dropdown có đủ 5 lựa chọn, chọn "Gmail"
   tự điền `smtp.gmail.com`/587.

## 8.65 — Gửi email qua Exchange bằng EWS (API riêng, không qua SMTP)

**Thay đổi**: thêm `rp-server/lib/ewsMailer.js` — gửi email qua Exchange
Web Services (EWS, HTTPS riêng của Exchange, Basic Auth username/password)
cho Exchange CÀI TẠI CHỖ (KHÔNG dùng được cho Exchange Online/Office 365).
`app.EmailSettings` thêm cột `Protocol`/`EwsUrl`/`EwsInsecureTls`;
`lib/mailer.js` rẽ nhánh theo `Protocol`, mọi nơi gọi `sendMail()` tự hoạt
động với cả 2 giao thức. "Thiết lập email" có thêm lựa chọn "Exchange tại
chỗ — API EWS" trong dropdown gateway.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — thêm cột `Protocol`/`EwsUrl`/
   `EwsInsecureTls` vào `app.EmailSettings`, an toàn chạy lại nhiều lần,
   cấu hình SMTP đang có tự chuyển `Protocol='smtp'`, không đổi gì).
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/mailer.js`, file mới
   `lib/ewsMailer.js`, route `routes/emailSettings.js`).
4. `cd rp-user && npm run build`, copy `dist/` mới (dropdown "Thiết lập
   email" có thêm lựa chọn EWS).
5. Nếu dùng Exchange qua EWS: rp-user → "Thiết lập email" → chọn "Exchange
   tại chỗ — API EWS" → điền EWS URL đầy đủ (hỏi IT quản trị Exchange nếu
   không rõ, thường dạng `https://<máy chủ>/EWS/Exchange.asmx`) + Username/
   Password đăng nhập mailbox + "Địa chỉ gửi (From)" → tick "Bỏ qua kiểm
   tra chứng chỉ TLS" NẾU máy chủ dùng chứng chỉ tự ký → Lưu → "Gửi thử"
   xác nhận gửi được.

Không đổi CSDL/cấu hình khác đang chạy ổn (mặc định vẫn `Protocol='smtp'`
cho tới khi admin tự đổi).

---

## 8.64 — Gợi ý cấu hình theo loại email gateway (Postfix/Exchange) + tương thích Exchange

**Thay đổi**: thêm dropdown "Loại email gateway" ở "Thiết lập email"
(rp-user) — chọn Postfix/Exchange Online/Exchange tại chỗ tự điền sẵn
host/port/Secure, vẫn sửa tay được. `rp-server/lib/mailer.js` và
`etl/lib/mailer.js` thêm `requireTLS` khi dùng cổng không mã hoá ngay từ
đầu (587/25) + có xác thực username/mật khẩu — bắt buộc STARTTLS trước
khi gửi thông tin đăng nhập.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
3. `cd rp-user && npm run build`, copy `dist/` mới (dropdown mới ở "Thiết
   lập email").
4. Kiểm tra: rp-user → "Thiết lập email" → chọn "Exchange Online / Office
   365" → tự điền `smtp.office365.com`/587/bỏ Secure → điền Username =
   email đăng nhập đầy đủ + mật khẩu (mật khẩu ứng dụng nếu tài khoản bật
   MFA) → "Gửi thử" nhận được email.

Không đổi CSDL, không ảnh hưởng cấu hình Postfix/SMTP khác đang chạy ổn.

---

## 8.63 — Sửa gửi email tương thích cổng 465 (Postfix)

**Thay đổi**: cổng 465 (SMTPS, vd Postfix của người dùng) bắt buộc TLS
ngay từ đầu kết nối — thiếu `secure:true` đúng cho cổng này là lý do email
gửi thất bại dù host/port/mật khẩu đúng. `etl/lib/mailer.js` tự nhận
`secure=true` theo cổng 465 khi `.env` chưa khai `SMTP_SECURE` rõ ràng;
`rp-server/lib/mailer.js` ép `secure=true` khi `SmtpPort=465` bất kể
checkbox đã lưu. `api-server` không có tính năng gửi email nên không áp
dụng (theo đúng yêu cầu người dùng).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
3. `cd rp-user && npm run build`, copy `dist/` mới (đổi
   `EmailSettingsPage.jsx` — chỉ thêm gợi ý tick "Secure", không bắt buộc
   phải build ngay để backend hoạt động đúng).
4. Nếu dùng cổng 465: etl → sửa `.env` thành `SMTP_PORT=465` (xoá hoặc để
   nguyên `SMTP_SECURE`, không bắt buộc đổi — hệ thống tự nhận đúng theo
   cổng); rp-user → "Thiết lập email" → đổi "SMTP port" thành `465` → Lưu
   → "Gửi thử" để xác nhận gửi được qua Postfix.
5. Kiểm tra: etl — tạm làm 1 job lỗi kết nối để xem email cảnh báo có tới
   không (hoặc đợi lần lỗi thật); rp-user — "Thiết lập email" → "Gửi thử"
   nhận được email tại hộp thư đã nhập.

Không đổi CSDL, không ảnh hưởng cấu hình SMTP cổng 587/25 đang chạy ổn.

---

## 8.62 — Chọn nhiều dòng + xoá hàng loạt (toàn hệ thống)

**Thay đổi**: thêm checkbox chọn nhiều dòng + nút "Xoá N mục đã chọn" cho
21 trang danh sách dạng bảng ở cả 3 giao diện (etl-admin, api-admin,
rp-user) — chỉ sửa frontend (React), KHÔNG đổi API/CSDL, KHÔNG có migration
hay script cần chạy tay. Quy tắc mới đã ghi vào `CLAUDE.md` cho mọi bảng
làm thêm sau này.

**Các bước triển khai:**
1. `git pull origin main`.
2. Build lại và deploy cả 3 giao diện như quy trình thường dùng (`npm run
   build` ở từng app, copy `dist/` lên server tĩnh) — không có bước gì
   khác ngoài build/deploy thông thường.
3. Kiểm tra nhanh: mở 1 trang bất kỳ trong 21 trang (vd etl-admin → Đồng
   bộ), tick vài checkbox ở cột đầu bảng, thấy nút "Xoá N mục đã chọn"
   hiện ra dưới bảng, bấm thử xoá 1 dòng rác để xác nhận hoạt động đúng.

## 8.61 — Điền đủ 34 siêu thị thật vào script tạo Nguồn dữ liệu + Sync Job (Thành viên)

**Thay đổi**: theo yêu cầu người dùng — điền đủ 34 siêu thị thật (tên +
Server/IP, từ file Excel người dùng gửi) vào `etl/scripts/seedThanhVienLiveSync.js`,
dùng chung 1 port cố định 1433 cho mọi siêu thị (theo yêu cầu riêng, khác
port từng dòng trong file Excel gốc). **File này CHỨA MẬT KHẨU CSDL THẬT
— người dùng đã được cảnh báo và xác nhận rõ ràng muốn commit nguyên văn
vào Git** (khác quy ước thông thường không lưu file có mật khẩu thật).
Khuyến nghị đổi lại mật khẩu thật sau khi triển khai xong.

**Các bước triển khai:**
1. `git pull origin main`.
2. **Bắt buộc làm trước** (nếu chưa làm): chạy file
   `deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành
   viên.sql` tại CẢ 34 máy chủ SQL Server của từng siêu thị.
3. `cd etl && node scripts/seedThanhVienLiveSync.js` — tạo/cập nhật 34
   Nguồn dữ liệu + 68 Sync Job Live (an toàn chạy lại nhiều lần).
4. Nếu chưa chạy lần nào: `cd rp-server && node scripts/seedLdtdHcrcReports.js`
   và `node scripts/seedThanhVienReportPermissions.js`.
5. Kiểm tra: etl-admin → Nguồn dữ liệu (đủ 34 dòng) → Đồng bộ (đủ 68 job
   Live, "Bật") → Log (job đã chạy thành công sau vài phút).
6. **Đổi lại mật khẩu CSDL thật ở cả 34 máy chủ** sau khi hoàn tất (mật
   khẩu hiện đã nằm trong lịch sử Git).

---

## 8.60 — Khoá nút + đổi màu lúc đang gửi dữ liệu lên server (toàn hệ thống)

**Thay đổi**: theo yêu cầu người dùng — mọi nút bấm gửi dữ liệu lên server
ở cả 3 giao diện (rp-user/etl-admin/api-admin) giờ tự khoá + đổi màu xám
rõ rệt trong lúc đang xử lý, tránh bấm lại nhiều lần gây gửi trùng yêu
cầu. Thuần sửa frontend, không đổi backend. Quy tắc này ghi vào
`CLAUDE.md` — bắt buộc áp dụng cho mọi nút làm thêm sau này.

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd etl-admin && npm run build`, copy `dist/` mới.
3. `cd api-admin && npm run build`, copy `dist/` mới.
4. `cd rp-user && npm run build`, copy `dist/` mới.
5. Không cần restart backend nào (`hcrc-etl`/`hcrc-api-server`/`hcrc-rp-server`
   không đổi).
6. Kiểm tra: vào etl-admin → Đồng bộ, bấm "Chạy thử" 1 job → nút chuyển
   xám + hiện "Đang chạy..." ngay, không bấm lại được tới khi xong.

---

## 8.59 — Tự thử lại khi mất kết nối nguồn lúc đồng bộ

**Thay đổi**: theo yêu cầu người dùng sau sự cố thật (vài chi nhánh mất
mạng, job Live báo lỗi liên tục) — job đồng bộ chạy nền giờ tự thử lại
(backoff 15s→30s→60s→120s, tối đa 10 phút) khi lỗi KẾT NỐI tới nguồn,
trước khi thật sự ghi nhận thất bại. Nút "Chạy thử" tương tác không đổi
(vẫn báo lỗi ngay).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi `jobs/runSync.js`, `jobs/scheduler.js`,
   `routes/admin/syncJobs.js`).
3. Không cần build lại giao diện nào (không đổi etl-admin).
4. Kiểm tra: theo dõi etl-admin → Log — khi 1 job đang lỗi kết nối, thấy
   dòng "Lỗi kết nối nguồn (lần N): ... — thử lại sau Xs..." thay vì chỉ 1
   dòng lỗi rồi im lặng tới chu kỳ sau; nếu nguồn phục hồi trong 10 phút sẽ
   thấy job chạy thành công mà không cần đợi hết chu kỳ cron.

Không đổi cấu trúc CSDL, không ảnh hưởng job đang chạy ổn định.

---

## 8.58 — Đổi màu 4 báo cáo doanh thu cuối ngày LDTD/HCRC theo mẫu BRGMART

**Thay đổi**: theo yêu cầu người dùng (demo ảnh đã gửi, đã xác nhận "màu
đẹp rồi") — đổi màu nhóm cột (web+Excel+PDF) của 4 báo cáo "Doanh thu cuối
ngày LDTD/HCRC" (gốc + Thành viên) đúng theo file mẫu BRGMART người dùng
gửi, thêm xen kẽ màu dòng + viền nhạt hơn cho "mỏng, chuyên nghiệp hơn".

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedLdtdHcrcReports.js` (BẮT BUỘC — ghi
   đè `DefinitionJson` đã lưu trong CSDL, code mới không tự áp dụng nếu
   không chạy lại; dùng đúng `menuCode` đã seed lần đầu nếu khác mặc định
   `reports-kinh-doanh`: `node scripts/seedLdtdHcrcReports.js <menuCode>`).
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/exportExcel.js`/
   `lib/exportPdf.js`/`lib/reportCellFormat.js`/`lib/reportRunner.js`/
   `lib/compositeReportRunner.js`).
4. `cd rp-user && npm run build`, copy `dist/` mới (đổi
   `components/DataTable.jsx`/`lib/reportGroupColors.js`).
5. Kiểm tra: mở 1 trong 4 báo cáo "Doanh thu cuối ngày ..." → màu nhóm cột
   mới (xanh lá/cam/vàng/tím), dòng "Tổng cộng" tô theo từng nhóm, xen kẽ
   màu dòng nhẹ; xuất Excel/PDF cũng đúng màu mới.

Không đổi CSDL, không ảnh hưởng báo cáo khác (chỉ 4 báo cáo khai
`columnGroups` mới bị ảnh hưởng).

---

## 8.57 — Trạng thái kết nối + Giám sát cấu trúc CSDL

**Thay đổi**: theo yêu cầu người dùng (demo đã gửi, đã xác nhận) — thêm
trang "Trạng thái kết nối" (`etl-admin` + `api-admin`, job nền kiểm tra
mỗi 15 phút) và trang "Giám sát cấu trúc CSDL" (chỉ `etl-admin`, job nền
chạy 6h sáng, phát hiện cả đổi kiểu dữ liệu cột, gửi email cảnh báo).

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (bảng mới `etl.DataSourceConnectionStatus`,
   `etl.SchemaSnapshots`, `etl.SchemaChangeLog`) VÀ `api-db/schema.sql`
   (bảng mới `api.DataSourceConnectionStatus`).
3. `pm2 restart hcrc-etl` và `pm2 restart hcrc-api-server` (BẮT BUỘC —
   route API mới + 2 job `cron.schedule` mới trong `server.js`).
4. Build lại 2 giao diện: `cd etl-admin && npm run build`, copy `dist/`
   mới; `cd api-admin && npm run build`, copy `dist/` mới.
5. Vào trang "Vai trò" (mỗi giao diện) → cấp quyền xem menu mới
   ("Trạng thái kết nối" ở cả 2; "Giám sát cấu trúc CSDL" chỉ ở
   `etl-admin`) cho vai trò cần dùng — **KHÔNG tự động cấp**, phải cấp
   tay sau khi triển khai.
6. Kiểm tra `.env` (etl, api-server) có đủ `SMTP_HOST`/`ALERT_EMAIL_TO`
   (dùng chung cấu hình mailer đã có) để job "Giám sát cấu trúc CSDL" gửi
   được email cảnh báo — nếu chưa cấu hình, job vẫn chạy/ghi lịch sử bình
   thường, chỉ không gửi được email (giống job đồng bộ ETL hiện tại).
7. Kiểm tra: mở trang "Trạng thái kết nối" → thấy danh sách nguồn dữ liệu
   + trạng thái (bấm "Kiểm tra lại ngay" để test ngay không cần đợi job
   nền); mở trang "Giám sát cấu trúc CSDL" (`etl-admin`) → thấy "Chưa
   kiểm tra lần nào" cho tới 6h sáng hôm sau (hoặc đổi tạm
   `SCHEMA_MONITOR_CRON` trong `.env` để test sớm hơn).

Không đổi cấu trúc bảng/CSDL nguồn dữ liệu hiện có, không ảnh hưởng job
đồng bộ đang chạy.

---

## 8.56 — Thêm cột "Trung bình giao dịch" vào 8 báo cáo Top 5 chi nhánh

**Thay đổi**: theo yêu cầu người dùng, thêm cột "Trung bình giao dịch"
(Doanh thu / Số giao dịch) vào cả 8 báo cáo "Top 5 chi nhánh" — cùng
công thức đã dùng ở báo cáo LDTD/HCRC, tự hiện rỗng khi chia cho 0 (đã
test bằng `formulaEngine.js` thật).

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   ghi đè DefinitionJson trong CSDL).
3. `pm2 restart hcrc-rp-server`.
4. Kiểm tra: báo cáo/Dashboard "Top 5 chi nhánh" hiện thêm cột "Trung
   bình giao dịch".

Không đổi CSDL/biểu đồ.

---

## 8.55 — Script tạo tự động 2 job đồng bộ cho 3 báo cáo "hết hàng"

**Thay đổi**: theo yêu cầu người dùng — DBA đã tạo xong 2 VIEW
`vw_BanHangTheoSKU`/`vw_TonKhoTheoSKU` (đúng `bc-ton-kho-0.md`), nay thêm
`etl/scripts/seedZeroStockSkuSync.js` để tạo 2 job đồng bộ bắt buộc bằng
1 lệnh thay vì bấm tay qua etl-admin — dùng chung cho cả 3 báo cáo "hết
hàng" (Top bán chạy tồn kho=0, Core=0 Mart/Minimart). Phần còn lại (đăng
ký báo cáo, upload danh sách Core, gán quyền) vẫn làm theo đúng 2 file
hướng dẫn đã có từ trước, không đổi.

**Các bước triển khai:**
1. `git pull origin main`
2. Khai `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` vào `.env`
   của `etl`.
3. `cd etl && node scripts/seedZeroStockSkuSync.js`.
4. Theo dõi etl-admin → Log tới khi 2 job chạy thành công.
5. `cd rp-server && node scripts/seedTopZeroStockReport.js && node scripts/seedCoreZeroStockReports.js`.
6. Upload danh sách hàng Core, gán quyền xem 3 báo cáo — xem chi tiết ở
   `bc-ton-kho-0.md`/`bc-core-ton-kho-0.md`.

Không đổi CSDL `rp`/`rp-server`/`rp-user`.

---

## 8.54 — Rà soát bản 8.31→8.53 + vá 1 lỗ hổng lý thuyết

**Thay đổi**: theo yêu cầu rà soát lại của người dùng sau bản 8.53 — phát
hiện `entityIsMaDiem` (kiểm tra "báo cáo composite có an toàn để lọc theo
siêu thị không", bản 8.51) dùng `.every()` trên mảng có thể RỖNG (báo cáo
composite không có khối dữ liệu nào, chỉ toàn `isTarget`), vacuous truth
khiến BẬT lọc nhầm. Chưa có báo cáo thật nào rơi vào trường hợp này — vá
phòng ngừa, giữ đúng nguyên tắc "không chắc chắn thì KHÔNG lọc".

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC).

Không đổi CSDL/giao diện/hành vi báo cáo đang chạy.

---

## 8.53 — Tiêu đề nhóm cột có màu + tô đậm dòng Tổng cộng trên bảng web báo cáo

**Thay đổi**: bảng báo cáo xem trên web trước đây chỉ vẽ phẳng, không
màu — khác hẳn file Excel/PDF xuất ra (đã có tiêu đề gộp 2 dòng tô màu
theo nhóm cột + tô đậm dòng Tổng cộng từ lâu). Giờ web dùng ĐÚNG dữ liệu
`columnGroups` sẵn có (API `/run` trả thêm, trước đây chưa gửi) để vẽ
khớp hệt Excel/PDF, áp dụng tự động cho mọi báo cáo đã khai nhóm cột, ở
cả trang Báo cáo lẫn Dashboard. Đã demo (mock server + Playwright) trước
khi gộp vào `main`.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (đổi cấu trúc JSON trả về của `/run`).
4. Kiểm tra: báo cáo có `columnGroups` → tiêu đề 2 dòng tô màu, dòng Tổng
   cộng tô tím đậm; trang không liên quan → không đổi gì.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.53 — Tiêu đề nhóm cột có màu trên
bảng web báo cáo.md`.

---

## 8.52 — Rà soát bản 8.31→8.51 + vá 3 lỗi phát hiện được

**Thay đổi**: theo yêu cầu rà soát của người dùng — phát hiện và vá 3 lỗi.
QUAN TRỌNG NHẤT: "Lịch gửi email báo cáo" và "Cảnh báo bất thường" KHÔNG
áp dụng giới hạn "Phạm vi dữ liệu" (bản 8.51) — người bị giới hạn 1 siêu
thị nhưng có menu 2 trang đó vẫn nhận được email ĐỦ mọi siêu thị. Đã vá cả
2 + 1 lỗi "Sửa" tạo dòng rác ở Ánh xạ Phòng ban (bản 8.49) + 1 ghi chú lỗi
thời ở trang Người dùng.

**Các bước triển khai (ƯU TIÊN CAO — vá lỗ rò rỉ dữ liệu):**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC).
4. Kiểm tra: tài khoản bị giới hạn 1 siêu thị + có menu "Lịch gửi email
   báo cáo" → tạo lịch trên báo cáo Top 5/Realtime Thành viên → "Gửi ngay"
   → email CHỈ có đúng siêu thị đã giới hạn.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.52 — Rà soát và vá lỗi
8.31-8.51.md`.

---

## 8.51 — Áp lọc dữ liệu THẬT theo siêu thị (báo cáo composite)

**Thay đổi**: LẦN ĐẦU áp dụng lọc thật — người được gán "Phạm vi dữ liệu"
ở bản 8.50 giờ CHỈ thấy đúng dữ liệu siêu thị đã gán, trong báo cáo Top 5
chi nhánh + Realtime "Thành viên" (báo cáo khác chưa áp dụng được, KHÔNG
phải lỗ hổng — chưa quy entityCode về Mã Điểm chuẩn). Server tự gắn phạm
vi, không tin client. Đã viết test riêng xác nhận đúng trước khi gộp.

**Các bước triển khai (KHÁC các bản trước — chỉ đổi backend, không đổi
CSDL/giao diện):**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC).
3. Kiểm tra: tài khoản đã gán 1 siêu thị (bản 8.50) → Dashboard Top 5/
   Realtime → chỉ thấy đúng siêu thị đó, kể cả lúc xuất Excel/PDF; tài
   khoản "Toàn bộ" không bị ảnh hưởng.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.51 — Áp lọc dữ liệu theo siêu
thị.md`.

---

## 8.50 — Gán phạm vi dữ liệu theo siêu thị cho từng người dùng

**Thay đổi**: trang "Người dùng" có nút "Phạm vi dữ liệu" — gán (các) siêu
thị 1 người CHỈ ĐƯỢC THẤY (trống = "Toàn bộ", mặc định an toàn), có gợi ý
tự động theo Department+WorkLocation. **CHƯA lọc dữ liệu báo cáo thật** —
chỉ lưu lựa chọn, chờ bản sau áp dụng vào tầng chạy báo cáo.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.UserStoreAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Kiểm tra: "Người dùng" → "Phạm vi dữ liệu" → gợi ý/tick chọn → Lưu →
   cột cập nhật đúng; chưa ảnh hưởng gì tới trang Báo cáo/Dashboard.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.50 — Gán phạm vi dữ liệu theo siêu
thị.md`.

---

## 8.49 — Ánh xạ Phòng ban (vpdt) → Siêu thị

**Thay đổi**: trang mới "Ánh xạ Phòng ban → Siêu thị" — ánh xạ Department
(vpdt) sang MaDiem chuẩn (tái dùng khoá của "Ánh xạ Điểm - STK_ID"), CHỈ
cần khai khi tên không khớp thẳng. Bước 1/nhiều bước hướng tới phân quyền
dữ liệu theo đúng siêu thị — CHƯA áp dụng giới hạn xem dữ liệu nào ở bản
này.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.DepartmentStoreMapping` +
   menu mới).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Cấp quyền menu "Ánh xạ Phòng ban → Siêu thị" cho vai trò cần dùng.
6. Kiểm tra: tải file mẫu → nhập 1 dòng thật → hiện đúng danh sách.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.49 — Ánh xạ Phòng ban sang Siêu
thị.md`.

---

## 8.48 — Phân quyền báo cáo/Dashboard riêng theo từng người dùng

**Thay đổi**: trang "Người dùng" có thêm nút "Gán quyền riêng" — cấp thêm
báo cáo/nhóm Dashboard cho ĐÚNG 1 người, CỘNG DỒN vào quyền theo vai trò
(không thay thế). Dùng cho trường hợp cấp lẻ, không đáng tạo hẳn 1 vai trò
riêng; cấp cho cả 1 nhóm người vẫn nên tạo Vai trò như trước giờ.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.UserReportAccess`/
   `app.UserDashboardGroupAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Kiểm tra: "Người dùng" → "Gán quyền riêng" → tick thêm 1 báo cáo cho 1
   người không có qua vai trò nào → người đó thấy thêm đúng báo cáo đó.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.48 — Phân quyền theo từng người
dùng.md`.

---

## 8.47 — Mật khẩu dự phòng cục bộ khi HCRC Workspace lỗi

**Thay đổi**: tài khoản xác thực qua HCRC Workspace giờ tự cache mật khẩu
(băm bcrypt) mỗi lần đăng nhập ONLINE thành công — dùng làm dự phòng khi
dịch vụ đó báo lỗi (mạng/timeout/5xx), trong hạn `FallbackMaxAgeDays`
(mặc định 14 ngày). Trang "Người dùng" có cột "Mật khẩu dự phòng" + nút
xoá tay.

**Các bước triển khai (KHÁC các bản trước — đổi logic đăng nhập):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (cột mới `CachedPasswordHash`/
   `CachedPasswordHashAt` ở `app.Users`, `FallbackMaxAgeDays` ở
   `app.HcrcWorkspaceSettings`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/auth.js`).
5. Kiểm tra: đăng nhập 1 tài khoản HCRC Workspace bình thường → tắt thử
   "Bật xác thực HCRC Workspace" → đăng nhập lại ĐÚNG mật khẩu cũ vẫn vào
   được (Audit Log ghi "dùng mật khẩu dự phòng"); bật lại cấu hình sau khi
   kiểm tra.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.47 — Mật khẩu dự phòng HCRC
Workspace.md`.

---

## 8.46 — Sửa nút "Lên"/"Xuống" trắng trơn trong khung Tuỳ chỉnh Dashboard

**Thay đổi**: phát hiện lúc demo bản 8.45 bằng ảnh chụp trình duyệt thật —
2 nút đổi thứ tự Ô trong khung "Tuỳ chỉnh" hiện trắng trơn không thấy chữ
(chữ trắng trên nền trắng, do CSS quên đổi màu chữ). Đã sửa + đổi ký hiệu
▲▼ thành chữ "Lên"/"Xuống" rõ nghĩa hơn.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: Dashboard → "⚙️ Tuỳ chỉnh" → thấy rõ chữ "Lên"/"Xuống" ở mỗi Ô.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.46 — Sửa nút Lên Xuống trắng trong khung Tuỳ chỉnh.md`.

---

## 8.45 — Cá nhân hoá báo cáo Dashboard

**Thay đổi**: trang Dashboard có nút "⚙️ Tuỳ chỉnh" — mỗi người tự ẩn/hiện
Ô, sắp xếp lại thứ tự Ô, nhớ nhóm/tab đã xem lần trước, đặt số ngày mặc
định khi mở lại (Hôm nay/7 ngày/30 ngày gần nhất). Lưu trên server theo
tài khoản (bảng mới `app.UserDashboardPreferences`), không ảnh hưởng
người khác, không đổi quyền xem (`app.RoleDashboardGroupAccess`).

**Các bước triển khai (KHÁC các bản trước — có bảng CSDL mới + route API
mới):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserDashboardPreferences`,
   an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — có route API mới `GET`/`PUT
   /dashboards/:id/preferences`).
5. Kiểm tra: bấm "⚙️ Tuỳ chỉnh" → ẩn 1 Ô, đổi thứ tự, đổi số ngày mặc
   định → tải lại trang (hoặc đăng nhập máy khác) vẫn giữ đúng; "Khôi
   phục mặc định" → về lại như trước bản 8.45.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.45 — Cá nhân hoá Dashboard.md`.

---

## 8.44 — Bộ lọc/nhóm theo siêu thị trong danh sách Đồng bộ

**Thay đổi**: trang "Đồng bộ" (ETL) thêm ô tìm kiếm (theo tên job/tên
siêu thị) + tuỳ chọn "Nhóm theo siêu thị" (gộp job cùng nguồn dữ liệu
vào 1 khối thu/mở được). Trả lời câu hỏi "gộp hết VIEW vào 1 job có được
không" — **KHÔNG làm theo hướng gộp** (mất lịch chạy/mốc đồng bộ/log lỗi
riêng từng loại dữ liệu), giữ nguyên 1 job/1 loại dữ liệu, chỉ gọn cách
XEM.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd etl-admin && npm run build`, copy `dist/` mới.
3. Không cần restart backend, không cần chạy lại CSDL.
4. Kiểm tra: trang Đồng bộ hiện ô tìm kiếm + nhóm theo siêu thị; gõ tên
   siêu thị → đúng khối đó tự mở; tắt "Nhóm theo siêu thị" → bảng phẳng
   có thêm cột "Nguồn dữ liệu".

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.44 — Bộ lọc nhóm theo siêu thị Sync Jobs.md`.

---

## 8.43 — Phân quyền Dashboard theo nhóm

**Thay đổi**: tách 2 quyền riêng cho mỗi nhóm Dashboard — "Xem dashboard"
và "Xem chi tiết" (xuất Excel/PDF). **CẢNH BÁO**: sau khi deploy, MỌI vai
trò (trừ Admin hệ thống) mất quyền xem 2 nhóm hiện có cho tới khi được cấp
lại thủ công (mặc định từ chối, giống RoleReportAccess).

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.RoleDashboardGroupAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. **BẮT BUỘC**: "Hệ thống → Phân quyền" → cấp lại quyền nhóm Dashboard
   cho TỪNG vai trò đang dùng Dashboard (trước đây không cần làm gì, giờ
   phải tick lại).
6. Kiểm tra: vai trò chưa cấp quyền → không thấy nhóm; cấp "Xem dashboard"
   không cấp "Xem chi tiết" → thấy nhưng không xuất được; cấp đủ 2 → xuất
   được.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.43 — Phân quyền Dashboard theo
nhóm.md`.

---

## 8.42 — Nhóm Dashboard

**Thay đổi**: trang Dashboard có thêm bộ chọn nhóm (🏆 Top 5 chi nhánh /
⚡ Realtime) ở đầu trang — chọn nhóm mới hiện Ô bên dưới.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   ghi đè DefinitionJson, giống bản 8.34).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. Kiểm tra: Dashboard hiện 2 thẻ nhóm, chọn đúng nhóm hiện đúng Ô/tab
   tương ứng, xuất Excel/PDF vẫn hoạt động.

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.42 — Nhóm
Dashboard.md`.

---

## 8.41 — WebAuthn vân tay/Face ID — rp-user, thay bước 2FA

**Thay đổi**: đăng ký vân tay/Face ID ở "Tài khoản của tôi" (Admin hệ
thống) → lúc đăng nhập có thêm nút "Dùng vân tay/Face ID" thay HẲN bước
nhập mã 2FA. Chỉ áp dụng `rp-user` đợt này.

**Các bước triển khai (KHÁC các bản trước — có bảng CSDL mới + BẮT BUỘC
khai domain thật):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserWebAuthnCredentials`,
   an toàn chạy lại nhiều lần).
3. **Thêm vào `rp-server/.env`**: `WEBAUTHN_RP_ID=<domain thật, không có
   https://>` và `WEBAUTHN_RP_ORIGIN=https://<domain thật>` — THIẾU bước
   này tính năng tự tắt (không crash, nhưng không dùng được).
4. `cd rp-server && npm install` (gói mới `@simplewebauthn/server`).
5. `cd rp-user && npm run build`, copy `dist/` mới (gói mới
   `@simplewebauthn/browser`).
6. `pm2 restart hcrc-rp-server`.
7. Kiểm tra bằng THIẾT BỊ THẬT (điện thoại/laptop có vân tay/Face ID,
   không mô phỏng được) — đăng ký 1 thiết bị, đăng xuất/đăng nhập lại,
   xác nhận bấm "Dùng vân tay/Face ID" vào thẳng hệ thống không cần gõ mã.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.41 — WebAuthn vân tay Face ID.md`.

---

## 8.40 — Tự đặt lại mã 2FA (đổi thiết bị) — rp-user

**Thay đổi**: trang "Tài khoản của tôi" (rp-user) có thêm nút "Đặt lại mã
2FA" cho tài khoản Admin hệ thống — tự quét QR mới trên thiết bị khác,
không cần nhờ admin khác. Backend đã có sẵn từ trước, chỉ thêm giao diện.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: "Tài khoản của tôi" (tài khoản Admin hệ thống) có mục "Bảo
   mật — Xác thực hai yếu tố"; đặt lại thử 1 lần, 2FA cũ ngừng dùng được.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.40 — Tự đặt lại 2FA Report.md`.

---

## 8.39 — Captcha đăng nhập (4 chữ số, cả 3 app)

**Thay đổi**: thêm ô "Mã xác nhận" (captcha 4 chữ số, tự sinh trên server
bằng `svg-captcha`, không cần Internet lúc chạy) vào form đăng nhập
ETL/API/Report, kiểm tra TRƯỚC khi tra mật khẩu.

**Các bước triển khai (KHÁC các bản trước — có gói npm MỚI):**
1. `git pull origin main`
2. Cài gói mới cho CẢ 3 backend: `cd rp-server && npm install`, tương tự
   `etl`, `api-server`.
3. Build lại CẢ 3 giao diện (`npm run build` ở `rp-user`/`etl-admin`/
   `api-admin`), copy `dist/` mới.
4. Restart CẢ 3 backend: `pm2 restart hcrc-rp-server`, `hcrc-etl`,
   `hcrc-api-server`.
5. Kiểm tra: ô "Mã xác nhận" hiện ở cả 3 màn hình đăng nhập; nhập sai →
   báo lỗi + tự đổi ảnh mới; nhập đúng → đăng nhập bình thường.

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.39 — Captcha đăng
nhập.md`.

---

## 8.37-8.38 — Báo cáo tràn màn hình + giao diện đăng nhập mới

**Thay đổi**: bảng báo cáo (rp-user) dùng hết chiều rộng màn hình desktop
(bỏ khung hẹp 1040px cho riêng 2 trang Báo cáo); màn hình Đăng nhập cả 3
app (ETL/API/Report) bớt chữ, thêm hình minh hoạ riêng từng app.

**Các bước triển khai:**
1. `git pull origin main`
2. Build lại CẢ 3 giao diện: `cd rp-user && npm run build`, tương tự
   `etl-admin`, `api-admin`.
3. Copy `dist/` mới của từng app vào đúng chỗ Nginx/`serve-static.js`
   đang trỏ tới.
4. Kiểm tra: trang Báo cáo hiện đủ cột không cần kéo ngang; màn hình Đăng
   nhập 3 app hiện hình minh hoạ thay vì đoạn văn dài.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.37-8.38 — Báo cáo tràn màn hình + giao diện đăng nhập mới.md`.

---

## 8.35 — Sửa nguyên nhân THẬT của "Failed to fetch"/"Không kết nối được backend"

**Vấn đề**: Nhập hàng loạt Sync Job (68 dòng/34 siêu thị Thành viên) báo
lỗi mạng giữa chừng — bản 8.33 (tăng timeout Nginx) chưa đủ vì
`etl/server.js` tự đặt `server.timeout = 120s` cho MỌI route ở tầng Node,
đóng socket trước khi tới được Nginx/serve-static.js.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: Nhập hàng loạt file nhiều dòng phải chạy hết (có thể mất vài
   phút), không còn "Failed to fetch"/"Không kết nối được backend".

Không đổi CSDL, không đổi Nginx lần này. Chi tiết đầy đủ: `deploy/Cập nhật
bản 8.35 — Sửa gốc Failed to fetch backend timeout.md`.

---

## 8.34 — Dashboard Top 5 đọc Doanh thu/Giao dịch từ domain "Thành viên"

**Thay đổi**: 8 báo cáo "Top 5 chi nhánh" (MART/MINIMART x Doanh thu/Giao
dịch x Cao/Thấp) đổi từ domain gốc (phủ toàn hệ thống, đồng bộ 15 phút)
sang domain "Thành viên" (Live 2 phút, hiện có 34 site) — **đánh đổi đã
xác nhận với người dùng**: Top 5 tạm thời CHỈ còn 34 site đó cho tới khi
khai Live hết toàn bộ siêu thị còn lại.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   không tự áp dụng qua merge code, dùng đúng `menuCode` đã seed lần đầu
   nếu khác mặc định `reports-kinh-doanh`)
3. `pm2 restart rp-server`
4. Kiểm tra: Dashboard "Top 5 chi nhánh" (cả 16 Ô) chỉ còn hiện 34 siêu
   thị Thành viên; số liệu khớp với Ô "Realtime" cùng ngày/siêu thị.

Không đổi cấu trúc CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.34 — Top
5 đọc domain Thành viên.md`.

---

## 8.33 — Sửa "Failed to fetch" khi Nhập hàng loạt Sync Job nhiều dòng

**Thay đổi**: Nhập hàng loạt 68 dòng Sync Job (34 siêu thị Thành viên) báo
lỗi trình duyệt "Failed to fetch" — nguyên nhân là Nginx, không phải code
Node: `proxy_read_timeout 65s` chung cho `/admin/` quá ngắn so với thời
gian đối chiếu schema THẬT từng dòng qua mạng (chạy tuần tự).

**QUAN TRỌNG — sửa `deploy/nginx.conf`, KHÔNG phải code Node** — `git
pull` + `pm2 restart` KHÔNG đủ, phải tự tay áp dụng cấu hình Nginx mới.

**Các bước triển khai:**
1. `git pull origin main`
2. Mở file Nginx thật đang dùng cho domain etl-admin, thêm 1 `location`
   RIÊNG khớp đúng 2 route Nhập hàng loạt (`/admin/sync-jobs/import`,
   `/admin/data-sources/import`), nâng `proxy_read_timeout`/
   `proxy_send_timeout` lên 600s — xem nguyên văn khối cấu hình ở
   `deploy/nginx.conf` bản mới nhất. Khối `/admin/` cũ giữ nguyên 65s.
3. `nginx -t` (phải báo "syntax is ok") rồi `systemctl reload nginx`.
4. Kiểm tra: Nhập hàng loạt file nhiều dòng (vd 68 dòng) chạy xong, không
   còn "Failed to fetch"; các route `/admin/` khác không bị ảnh hưởng.

Không đổi CSDL, không đổi code Node. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.33 — Sửa Failed to fetch Nhập hàng loạt.md`.

---

## 8.32 — Sửa lỗi tương tự ở "File mẫu" Sync Job

**Thay đổi**: rà lại toàn bộ sau bug 8.31, phát hiện `buildSyncJobsTemplate()`
(`etl/lib/syncJobsImport.js`) bị ĐÚNG lỗi tương tự (bỏ sót khi sửa 8.31 —
lần đó chỉ soát `dataSourcesImport.js`) — file mẫu Sync Job cũng có 1 dòng
câu hướng dẫn trước header, trong khi `parseSyncJobsFile()` đọc header
cứng ở dòng 1.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: etl-admin → Đồng bộ → "Tải file mẫu" → dòng 1 phải là header,
   dòng 2-3 là 2 dòng ví dụ, không còn câu hướng dẫn phía trên header;
   nhập thử lại file Sync Job 68 dòng (34 siêu thị Thành viên) phải nhập
   đủ, không báo "không tìm thấy Nguồn dữ liệu".

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.31-8.32 — Sửa lỗi
file mẫu Nguồn dữ liệu + Sync Job.md`.

---

## 8.31 — Sửa lỗi "File mẫu" Nguồn dữ liệu (header lệch dòng 2)

**Thay đổi**: phát hiện khi triển khai thật 34 siêu thị Thành viên (bản
8.30) — file mẫu "Nguồn dữ liệu" (`buildDataSourcesTemplate()`,
`etl/lib/dataSourcesImport.js`) tạo ra với dòng 1 là câu hướng dẫn, dòng 2
mới là header thật, nhưng `parseDataSourcesFile()` đọc header CỨNG ở dòng
1 — ai tải file mẫu, xoá CHỮ ở dòng 1 (không xoá nguyên dòng) rồi điền dữ
liệu sẽ bị báo "File thiếu cột bắt buộc 'Name'" dù đã điền đủ cột.

**Đã XÁC NHẬN không đổi cấu trúc CSDL** — chỉ sửa 2 file backend
(`etl/lib/dataSourcesImport.js`, `etl/lib/syncJobsImport.js` — xem bản
8.32 ngay trên), KHÔNG cần build lại giao diện nào.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: etl-admin → Nguồn dữ liệu → "Tải file mẫu" → dòng 1 phải là
   header (`Name, Server, DatabaseName, Username, Password, Engine, Port,
   Encrypt, TrustServerCert`), dòng 2 là dòng ví dụ; nhập thử lại file
   "Nguồn dữ liệu" 34 siêu thị Thành viên phải nhập được, không còn báo
   "File thiếu cột bắt buộc 'Name'".

Chi tiết đầy đủ (gộp chung 8.31+8.32): `deploy/Cập nhật bản 8.31-8.32 —
Sửa lỗi file mẫu Nguồn dữ liệu + Sync Job.md`.
