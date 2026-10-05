# Cập nhật bản 8.83 — PWA thật cho etl-admin + api-admin

## Yêu cầu của người dùng

> "Bạn triển khai PWA cho API và ETL luôn nhé, nhớ kiểm tra và responsive
> cả 3 trang đảm bảo giao diện mobile chuẩn rồi nhé"

`rp-user` đã là PWA thật từ bản 6.18 — lúc đó cố ý CHỈ làm rp-user theo
đúng yêu cầu gốc, ghi rõ "api-admin/etl-admin để sau". Bản này làm nốt 2
app còn lại, đồng bộ đầy đủ ngang rp-user, kèm kiểm tra lại responsive cả
3 app.

## Đã làm — PWA cho etl-admin + api-admin

Mirror chính xác cấu hình `rp-user/vite.config.js` (bản 6.18), chỉ đổi
tên/màu/icon cho đúng từng app:

| | rp-user (đã có) | etl-admin (mới) | api-admin (mới) |
|---|---|---|---|
| Tên hiển thị | "Báo cáo HCRC" | "HCRC — Quản trị ETL" | "HCRC — Quản trị API" |
| `theme_color` | `#b5551f` | `#7a4f9e` (đúng `--accent` tím đang dùng) | `#1c7566` (đúng `--accent` xanh ngọc đang dùng) |
| Icon glyph | biểu đồ cột | 2 mũi tên vòng tròn ("đồng bộ") | `</>` ("API/code") |

- **`vite.config.js`** (cả 2 app) — thêm `VitePWA({registerType:
  'autoUpdate', workbox: {cleanupOutdatedCaches: true}, manifest: {...}})`
  — y hệt cấu trúc rp-user, `registerType: 'autoUpdate'` để bản mới tự
  kích hoạt ở lần tải trang kế tiếp, không cần người dùng tự xoá cache.
- **`public/icons/`** (mới, cả 2 app) — 4 file `icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, cùng
  phong cách bo góc + glyph trắng như rp-user đã có, glyph RIÊNG từng app
  để phân biệt khi cài song song nhiều app HCRC trên cùng điện thoại.
- **`index.html`** (cả 2 app) — thêm `theme-color`, `apple-touch-icon`,
  `apple-mobile-web-app-capable`/`status-bar-style`/`title`, mirror
  rp-user.
- **`package.json`** (cả 2 app) — thêm `vite-plugin-pwa: ^1.3.0` (đúng
  phiên bản rp-user đang dùng).
- **`deploy/nginx.conf`** — thêm khối `location = /manifest.webmanifest`
  (khai đúng `Content-Type: application/manifest+json`, `Cache-Control:
  no-cache`) cho domain `api-admin.hcrc.vidu.vn` VÀ
  `etl-admin.hcrc.vidu.vn`, mirror domain `report.hcrc.vidu.vn` đã có —
  thiếu khối này, nhiều bản Nginx đóng gói sẵn không nhận diện đúng
  `.webmanifest` trong `mime.types` mặc định, trình duyệt có thể từ chối
  coi là manifest hợp lệ.
- **`deploy/serve-static.js`** (mô hình PM2-only) — KHÔNG cần sửa gì.
  `NO_CACHE_FILES` (`manifest.webmanifest`/`sw.js`/`registerSW.js`) đã
  dùng CHUNG cho cả 3 app từ trước, không phân biệt theo tên app.

## Đã kiểm tra responsive cả 3 app (theo yêu cầu)

Dùng Playwright chụp màn hình thật ở khung điện thoại phổ biến (390×844,
kiểu iPhone 12/13) cho các trang quan trọng nhất của CẢ 3 app:

- Trang đăng nhập (cả 3 app) — hero + form đăng nhập xếp dọc đúng, không
  tràn ngang.
- Bảng dữ liệu chính (Nguồn dữ liệu) kèm 3 nút "Bật/Tắt/Xoá N đã chọn"
  (bản 8.80, khu vực vừa thêm gần nhất — ưu tiên kiểm tra kỹ) — 3 nút
  xếp cột gọn gàng ở màn hẹp, chữ không bị cắt.
- Menu drawer mobile (bấm ☰) — danh sách menu đầy đủ, cuộn được, không
  tràn.
- Trang "Tài khoản của tôi" với 2 mục "Xác thực hai yếu tố"/"Vân tay —
  Face ID" (bản 8.78, mới thêm gần đây) — card thiết bị + nút "Gỡ thiết
  bị" xếp đúng, không chồng chéo.

**Kết quả**: kiểm tra tự động `document.documentElement.scrollWidth >
clientWidth` (dấu hiệu tràn ngang phổ biến nhất) ở TẤT CẢ các trang trên,
CẢ 3 app — **không phát hiện tràn ngang nào**. Hạ tầng responsive đã có
sẵn từ trước hoạt động đúng:
- Sidebar chuyển sang drawer off-canvas dưới 880px (`.mobile-topbar`,
  `.mobile-menu-toggle`).
- Trang đăng nhập xếp dọc dưới 860px (`.login-page {flex-direction:
  column}`).
- Bảng dữ liệu cuộn ngang khi quá nhiều cột (`.table-scroll {overflow-x:
  auto}`) — đây là hành vi CHỦ ĐÍCH (không phải lỗi), tránh bóp méo dữ
  liệu bảng trên màn hẹp.

**Không cần sửa CSS gì thêm** — hạ tầng mobile hiện có đã đủ chuẩn cho cả
giao diện cũ lẫn các khu vực mới thêm gần đây (bulk action, WebAuthn).

## Cách cài trên điện thoại (gửi người dùng cuối, sau khi deploy)

- **Android (Chrome)**: mở trang → menu ⋮ (góc trên phải) → "Cài đặt ứng
  dụng" / "Thêm vào màn hình chính".
- **iOS (Safari)**: mở trang → nút Chia sẻ (hình vuông mũi tên lên) →
  "Thêm vào màn hình chính".

Sau khi cài, icon riêng từng app (etl-admin: vòng tròn tím với 2 mũi tên
đồng bộ; api-admin: vuông xanh ngọc với `</>`) hiện trên màn hình chính,
mở app KHÔNG còn thanh địa chỉ trình duyệt — y hệt rp-user.

## Các bước triển khai

1. `git pull origin main`.
2. `cd etl-admin && npm install && cd ../api-admin && npm install` (gói
   mới `vite-plugin-pwa`).
3. `cd etl-admin && npm run build && cd ../api-admin && npm run build`,
   copy TOÀN BỘ `dist/` mới (giờ có thêm `manifest.webmanifest`, `sw.js`,
   `registerSW.js`, `workbox-*.js`).
4. **Sửa tay Nginx** (nếu dùng mô hình Nginx đọc thẳng file): thêm khối
   `location = /manifest.webmanifest {...}` vào server block
   `api-admin.hcrc.vidu.vn` VÀ `etl-admin.hcrc.vidu.vn` (copy nguyên văn
   từ `deploy/nginx.conf`) → `nginx -t` → `systemctl reload nginx`. Mô
   hình PM2-only (`serve-static.js`) KHÔNG cần sửa gì.
5. Kiểm tra bằng điện thoại thật: mở etl-admin/api-admin → cài "Thêm vào
   màn hình chính" như hướng dẫn trên → icon riêng hiện ra, mở toàn màn
   hình.

## File thay đổi

- `etl-admin/vite.config.js`, `api-admin/vite.config.js` — thêm
  `VitePWA(...)`.
- `etl-admin/index.html`, `api-admin/index.html` — thêm thẻ PWA/
  apple-mobile-web-app-*.
- `etl-admin/package.json`, `api-admin/package.json` — thêm
  `vite-plugin-pwa`.
- `etl-admin/public/icons/*.png`, `api-admin/public/icons/*.png` (mới) —
  4 icon mỗi app.
- `deploy/nginx.conf` — thêm `location = /manifest.webmanifest` cho 2
  domain admin.
