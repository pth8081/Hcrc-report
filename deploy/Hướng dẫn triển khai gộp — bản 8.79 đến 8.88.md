# Hướng dẫn triển khai gộp — bản 8.79 đến 8.88 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 8.79 tới bản 8.88 hiện tại
thành **1 lượt làm duy nhất**, cho server đã deploy tới khoảng bản 8.78
và cần bắt kịp bản mới nhất — KHÔNG lặp lại toàn bộ lịch sử từ bản 8.29
(xem `deploy/Hướng dẫn triển khai gộp — bản 8.29 đến 8.88.md` nếu cần
dựng server hoàn toàn mới từ đầu).

**Không gồm bản 8.82** (`scripts/deleteThanhVienLiveSync.js`) — đây là
script ad-hoc, chỉ chạy khi cần xoá lại 34 Nguồn dữ liệu/Sync Job "Thành
viên" để tạo lại từ đầu (vd đồng bộ không về đúng), KHÔNG phải bước
triển khai thường trực. Xem mục F bên dưới nếu cần dùng.

File gộp "Nhật ký triển khai (từ bản 8.31)" và từng file riêng
`deploy/Cập nhật bản X.Y — ....md` VẪN giữ nguyên, dùng để tra lại lý do/
chi tiết kỹ thuật của từng bản khi cần — file này chỉ gộp phần "làm gì".

---

## Tóm tắt những gì thay đổi (8.79 → 8.88)

| Bản | Nội dung |
|---|---|
| 8.79 (KHẨN) | Sửa `rp-server` crash trên Node < 22.4 (lỗi `tls.getCACertificates`) |
| 8.80 | Nút "Bật/Tắt hàng loạt" + sửa xoá hàng loạt dừng cả loạt khi 1 mục bị chặn (Nguồn dữ liệu, Đồng bộ) |
| 8.81 | Xoá kèm job đồng bộ khi Nguồn dữ liệu còn job tham chiếu (hỏi riêng, không âm thầm) |
| 8.82 | (Không gồm — script ad-hoc, xem mục F) |
| 8.83 | PWA thật cho etl-admin + api-admin (rp-user đã có từ bản 6.18) |
| 8.84 | Dropdown "Chọn nhóm" thay thẻ lưới ở trang Dashboard (rp-user) |
| 8.85 | Sửa màn hình trắng khi vào URL không khớp route nào (rp-user) |
| 8.86 | Thử lại + rút ngắn thời gian chờ khi VPN chi nhánh chập chờn giữa chừng đồng bộ (ETL) |
| 8.87 | Chặn bớt số job chạy đồng thời + không bỏ sót lỗi xin khoá (ETL) |
| 8.88 | Sửa gửi email cổng 465 không gửi được khi máy chủ không bật TLS (rp-user/rp-server) |

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

Lệnh này lấy về ĐỦ cả 9 bản (8.79/8.80/8.81/8.83/8.84/8.85/8.86/8.87/8.88)
cùng lúc — không cần chạy lại cho từng bản.

---

## B. Cài gói npm mới (bản 8.83 — PWA)

```bash
cd etl-admin && npm install
cd ../api-admin && npm install
```

Gói mới: `vite-plugin-pwa` (devDependency, chỉ dùng lúc build, không ảnh
hưởng runtime). Các bản 8.79-8.81 KHÔNG cần gói npm nào mới.

---

## C. Build lại frontend

```bash
cd etl-admin && npm run build && cd ..
cd api-admin && npm run build && cd ..
cd rp-user && npm run build && cd ..
```

Cả 2 app etl-admin/api-admin giờ có thêm `manifest.webmanifest`, `sw.js`,
`registerSW.js`, `workbox-*.js` trong `dist/` (bản 8.83) — **copy TOÀN BỘ
`dist/`**, đừng chỉ copy `index.html`/`assets/` như trước, thiếu các file
này PWA sẽ không hoạt động (không cài được "Thêm vào màn hình chính").

`rp-user` **PHẢI build lại** (bản 8.84 — dropdown "Chọn nhóm" ở trang
Dashboard; bản 8.85 — sửa màn hình trắng khi vào URL không khớp route
nào; bản 8.88 — sửa "Thiết lập email" cổng 465 — cả 3 chỉ đổi frontend,
không có gói npm mới).

---

## D. Restart backend

```bash
pm2 restart hcrc-rp-server    # BẮT BUỘC — bản 8.79 (KHẨN, Node<22.4), bản 8.88 (sửa gửi email cổng 465)
pm2 restart hcrc-etl          # BẮT BUỘC — bản 8.81/8.86/8.87 (route DELETE, lấy kết nối/trích xuất, giới hạn job đồng thời)
```

(Tuỳ chọn, bản 8.86/8.87) Thêm vào `etl/.env` nếu muốn đổi khác mặc định
— bỏ qua vẫn dùng được (có sẵn mặc định trong code):
```
DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS=90000
ETL_MAX_CONCURRENT_JOBS=4
```

`hcrc-api-server` KHÔNG cần restart — bản 8.83 (PWA) chỉ đổi frontend,
không đụng backend của api-server. Bản 8.84/8.85 (rp-user) cũng chỉ đổi
frontend — không cần restart `hcrc-rp-server` riêng cho 2 bản này (chỉ
cần restart vì lý do 8.79 ở trên).

---

## E. Sửa Nginx (CHỈ nếu dùng Nginx đọc thẳng file — bỏ qua nếu PM2-only)

Thêm khối sau vào server block `api-admin.hcrc.vidu.vn` VÀ
`etl-admin.hcrc.vidu.vn` (copy nguyên văn từ `deploy/nginx.conf`, domain
`report.hcrc.vidu.vn` đã có sẵn khối tương tự):

```nginx
location = /manifest.webmanifest {
    default_type application/manifest+json;
    add_header Cache-Control "no-cache" always;
}
```

Đặt **TRƯỚC** khối `location /` hiện có (cùng cấp, trong cùng server
block). Sau đó:

```bash
nginx -t
systemctl reload nginx
```

**Mô hình PM2-only** (`deploy/serve-static.js`) KHÔNG cần sửa gì —
`manifest.webmanifest` đã nằm trong `NO_CACHE_FILES` dùng chung cho cả 3
app từ trước.

---

## F. (Tuỳ chọn, CHỈ khi cần) Xoá lại 34 Nguồn dữ liệu/Sync Job "Thành viên" — bản 8.82

Dùng khi đồng bộ Live "Thành viên" không về đúng dù đã cấu hình, muốn
xoá sạch để tạo lại từ đầu bằng `scripts/seedThanhVienLiveSync.js`:

```bash
cd etl
node scripts/deleteThanhVienLiveSync.js            # xem trước — KHÔNG xoá gì
node scripts/deleteThanhVienLiveSync.js --confirm  # xoá thật
node scripts/seedThanhVienLiveSync.js               # tạo lại từ đầu
```

Chi tiết đầy đủ xem mục "8.82" trong `VERSION.md`.

---

## G. Kiểm tra sau khi triển khai

- [ ] **(8.79, KHẨN)** `pm2 status hcrc-rp-server` → cả 2 worker
  `online` (không `errored`); `pm2 logs hcrc-rp-server` → hết dòng
  `TypeError: tls.getCACertificates...`; trang đăng nhập report.hcrc.vn
  → captcha hiện ảnh, đăng nhập được.
- [ ] **(8.80)** etl-admin → "Nguồn dữ liệu"/"Đồng bộ" → tick nhiều dòng
  → thấy đủ 3 nút "Bật N"/"Tắt N"/"Xoá N đã chọn" → bấm "Bật"/"Tắt" đổi
  đúng trạng thái TOÀN BỘ dòng đã chọn; thử xoá hàng loạt khi 1 nguồn
  còn job tham chiếu → các nguồn KHÁC vẫn xoá được, trang báo rõ tên
  nguồn bị chặn (không dừng cả loạt như trước).
- [ ] **(8.81)** etl-admin → xoá 1 nguồn còn job tham chiếu → hộp thoại
  thứ 2 hỏi riêng "Xoá CẢ N job này...?" nêu đúng tên job đang chặn →
  đồng ý → cả nguồn lẫn các job đó đều mất; bấm "Huỷ" ở bước 2 → không
  mất gì.
- [ ] **(8.83)** Mở etl-admin/api-admin bằng điện thoại thật → Android
  Chrome (menu ⋮ → "Cài đặt ứng dụng") hoặc iOS Safari (Chia sẻ → "Thêm
  vào màn hình chính") → icon riêng từng app hiện ra (etl-admin: vòng
  tròn tím 2 mũi tên đồng bộ; api-admin: vuông xanh ngọc `</>`), mở toàn
  màn hình không thanh địa chỉ.
- [ ] **(8.84)** rp-user → Dashboard (dashboard có ≥ 2 nhóm) → thấy
  dropdown "Chọn nhóm" thay thẻ lưới cũ 🏆/⚡ → chọn nhóm khác → danh
  sách ô đổi đúng theo nhóm vừa chọn.
- [ ] **(8.85)** Gõ thẳng URL `report.hcrc.vn/system` (hoặc URL bất kỳ
  không có trang thật) → tự chuyển về trang chủ, sidebar/topbar hiện
  bình thường (không còn trang trắng).
- [ ] **(8.86)** etl-admin → "Đồng bộ" → theo dõi "Job lỗi trong 24h qua"
  sau vài giờ — số lượt lỗi "operation timed out..." giảm rõ rệt;
  `pm2 logs hcrc-etl` thấy dòng "⏳ [...] Lỗi mạng khi trích xuất lô dữ
  liệu..." khi VPN chập chờn (bình thường), và phần lớn các lượt đó tự
  phục hồi (SUCCESS) thay vì thất bại hẳn.
- [ ] **(8.87)** `pm2 logs hcrc-etl` sau vài chu kỳ cron (10-15 phút) —
  không còn hàng loạt lỗi "operation timed out" đồng thời (nhiều job
  khác chi nhánh cùng lúc); nếu thỉnh thoảng vẫn còn lỗi xin khoá, giờ
  thấy đúng dòng đó xuất hiện trên etl-admin → "Đồng bộ" → "Job lỗi
  trong 24h qua" (trước đây hoàn toàn không hiện ở đó).
- [ ] **(8.88)** rp-user → "Thiết lập email" → cổng 465 → bỏ tick
  "Secure" (nếu máy chủ SMTP thật không bật TLS ở cổng đó) → "Gửi thử"
  → gửi thành công (trước đây luôn báo lỗi "wrong version number" dù đã
  bỏ tick).

Không có bước nào ở trên làm mất dữ liệu đã có hoặc ảnh hưởng job/báo
cáo đang chạy ổn định — mọi thay đổi CSDL (nếu có) đều là CREATE/ALTER
thêm mới (bản 8.79-8.88 thực tế KHÔNG đổi schema CSDL nào).
