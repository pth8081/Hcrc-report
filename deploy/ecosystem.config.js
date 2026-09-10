// deploy/ecosystem.config.js — Chạy bằng PM2, độc lập với nhau (một app lỗi
// không kéo sập app còn lại): pm2 start deploy/ecosystem.config.js
//
// MẶC ĐỊNH: chỉ 3 app (3 service backend, exec_mode 'cluster').
//
// Đặt biến môi trường HCRC_STATIC_VIA_PM2=1 TRƯỚC khi `pm2 start` để bật
// thêm 3 app phục vụ giao diện tĩnh (rp-user/api-admin/etl-admin) —
// BẮT BUỘC nếu triển khai theo "Hướng dẫn triển khai PM2.md" (không dùng
// Nginx, không có ai khác đọc file tĩnh thay); TUỲ CHỌN nếu triển khai theo
// "Hướng dẫn triển khai sử dụng PM2 + Nginx.md" (mặc định file đó vẫn để
// Nginx đọc thẳng file — chỉ bật cờ này nếu muốn `pm2 status` thấy đủ cả 6
// tiến trình, và nhớ đổi tương ứng khối `location /` trong deploy/nginx.conf
// sang `proxy_pass`, xem hướng dẫn Nginx mục "Bước 2"). `HCRC_STATIC_VIA_PM2=1
// pm2 start deploy/ecosystem.config.js` — PM2 LƯU LẠI giá trị đã dùng lúc
// `pm2 start`, không cần đặt lại mỗi lần `pm2 restart/reload` sau đó, CHỈ
// cần đặt lại nếu `pm2 delete` rồi `pm2 start` lại từ đầu.
//
// min_uptime/max_restarts — PM2 MẶC ĐỊNH khởi động lại VÔ HẠN lần mỗi khi
// tiến trình thoát (đúng ý khi lỗi thật hiếm gặp) — nhưng nếu tiến trình
// thoát NGAY (vd cấu hình sai/DB không kết nối được, xem khối kiểm tra cấu
// hình lúc khởi động trong từng server.js), PM2 sẽ restart-loop LIÊN TỤC
// hàng trăm lần/phút, chiếm CPU vô ích và làm log khó đọc. min_uptime: tiến
// trình phải sống ÍT NHẤT chừng này mới tính là "khởi động thành công"; nếu
// thoát sớm hơn thì tính là "lỗi khởi động", đếm vào max_restarts (đạt tới
// đó thì PM2 NGỪNG thử, chuyển trạng thái "errored" — dừng vòng lặp, không
// tự thử mãi). Sau khi sửa cấu hình xong, chạy `pm2 restart <tên>` để PM2
// thử lại từ đầu (đặt lại bộ đếm).
//
// ===== exec_mode: 'cluster' =====
// Cả 3 app chạy NHIỀU worker/service (Node's cluster module qua PM2 — mỗi
// worker 1 tiến trình, chia sẻ CHUNG 1 cổng lắng nghe, PM2/OS tự cân bằng
// round-robin), tận dụng nhiều lõi CPU thay vì 1 tiến trình đơn (mặc định
// cũ) chỉ dùng được 1 lõi kể cả khi tải cao đồng thời. PM2 tự gán
// process.env.NODE_APP_INSTANCE = "0".."N-1" cho từng worker — code app
// dùng biến này để chỉ 1 worker ("leader", #0) chạy cron (gửi email báo
// cáo/cảnh báo/dọn log định kỳ) — xem lib/clusterLeader.js ở cả 3 service,
// KHÔNG SỬA GIẢM instances xuống mà không hiểu tại sao (tránh mất song
// song), và KHÔNG XOÁ file lib/clusterLeader.js hay bỏ cách gọi nó trong
// jobs/*.js/server.js nếu vẫn còn chạy cluster (mất gate đó = gửi email
// trùng lặp N lần khi tới giờ).
//
// instances — mặc định 2 mỗi app (6 tiến trình Node TỔNG CỘNG trên CÙNG 1
// máy, cùng máy còn chạy Nginx + có thể cả SQL Server nếu không tách riêng
// — xem deploy/nginx.conf đầu file). ĐIỂM KHỞI ĐẦU HỢP LÝ, KHÔNG PHẢI SỐ
// CUỐI CÙNG — chỉnh theo số lõi CPU thật của máy chủ (vd máy 8 lõi có thể
// nâng lên instances: 3-4 cho rp-server/api-server, giữ etl thấp hơn vì ít
// traffic đồng thời, chủ yếu chạy nền + trang quản trị nội bộ). Đổi số này
// PHẢI đi kèm chỉnh lại *_POOL_MAX trong .env của từng service (xem chú
// thích ở đó) — mỗi worker tự mở pool CSDL RIÊNG (không dùng chung), tổng
// kết nối tới SQL Server = instances × tổng pool.max của 1 worker.
const STATIC_VIA_PM2 = process.env.HCRC_STATIC_VIA_PM2 === '1';

// 3 tiến trình phục vụ TĨNH cho rp-user/api-admin/etl-admin (build sẵn bằng
// `npm run build` -> dist/), dùng deploy/serve-static.js — CHỈ đưa vào danh
// sách "apps" khi bật HCRC_STATIC_VIA_PM2=1 (xem chú thích đầu file). 1 tiến
// trình/giao diện là đủ (không cần cluster: chỉ đọc file tĩnh, không có
// công việc nặng CPU nào). Cổng trùng với cổng dev (`npm run dev`) của từng
// giao diện — dễ nhớ, không đụng dải cổng 4001-4033 của 3 service backend.
//
// PROXY_PREFIX/PROXY_TARGET_PORT — BẮT BUỘC ở đây (chế độ PM2-only): mỗi
// frontend gọi API bằng đường dẫn tương đối cùng domain/port với chính nó
// (`/api/...` cho rp-user, `/admin/...` cho api-admin/etl-admin — xem
// src/lib/api.js), nên chính serve-static.js phải tự chuyển tiếp sang đúng
// backend (4001/4002/4003, xem PORT mặc định trong .env.example từng
// service) — thiếu 2 biến này, request "biến mất" vào nhánh SPA fallback,
// bấm Đăng nhập không báo lỗi gì và pm2 logs backend không hề có dòng nào
// (lỗi thật đã gặp, xem chú thích đầu deploy/serve-static.js). Bản có Nginx
// không cần (Nginx tự định tuyến /api, /admin trước khi tới tiến trình
// này — xem deploy/nginx.conf).
const staticApps = STATIC_VIA_PM2 ? [
  {
    name: 'hcrc-rp-user',
    script: 'serve-static.js',
    env: {
      STATIC_DIST_DIR: '../rp-user/dist', PORT: 5173, NODE_ENV: 'production',
      PROXY_PREFIX: '/api', PROXY_TARGET_PORT: 4001
    },
    min_uptime: '5s',
    max_restarts: 10
  },
  {
    name: 'hcrc-api-admin',
    script: 'serve-static.js',
    env: {
      STATIC_DIST_DIR: '../api-admin/dist', PORT: 5174, NODE_ENV: 'production',
      PROXY_PREFIX: '/admin', PROXY_TARGET_PORT: 4002
    },
    min_uptime: '5s',
    max_restarts: 10
  },
  {
    name: 'hcrc-etl-admin',
    script: 'serve-static.js',
    env: {
      STATIC_DIST_DIR: '../etl-admin/dist', PORT: 5175, NODE_ENV: 'production',
      PROXY_PREFIX: '/admin', PROXY_TARGET_PORT: 4003
    },
    min_uptime: '5s',
    max_restarts: 10
  }
] : [];

module.exports = {
  apps: [
    {
      name: 'hcrc-etl',
      cwd: '../etl',
      script: 'server.js', // chạy nền theo lịch (chỉ worker #0) + phục vụ /admin/* cho etl-admin/
      exec_mode: 'cluster',
      instances: parseInt(process.env.PM2_INSTANCES_ETL || '2', 10),
      env: { NODE_ENV: 'production' },
      min_uptime: '10s',
      max_restarts: 10
    },
    {
      name: 'hcrc-rp-server',
      cwd: '../rp-server',
      script: 'server.js',
      exec_mode: 'cluster',
      instances: parseInt(process.env.PM2_INSTANCES_RP || '2', 10),
      env: { NODE_ENV: 'production' },
      min_uptime: '10s',
      max_restarts: 10
    },
    {
      name: 'hcrc-api-server',
      cwd: '../api-server',
      script: 'server.js',
      exec_mode: 'cluster',
      instances: parseInt(process.env.PM2_INSTANCES_API || '2', 10),
      env: { NODE_ENV: 'production' },
      min_uptime: '10s',
      max_restarts: 10
    },
    ...staticApps
  ]
};
