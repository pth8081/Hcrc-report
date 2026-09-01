// deploy/ecosystem.config.js — Chạy 3 tiến trình bằng PM2, độc lập với nhau
// (một app lỗi không kéo sập app còn lại): pm2 start deploy/ecosystem.config.js
// rp-user/, api-admin/, etl-admin/ là build tĩnh (npm run build -> dist/),
// phục vụ qua Nginx — không phải tiến trình PM2.
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
    }
  ]
};
