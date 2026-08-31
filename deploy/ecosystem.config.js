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
module.exports = {
  apps: [
    {
      name: 'hcrc-etl',
      cwd: '../etl',
      script: 'server.js', // chạy nền theo lịch + phục vụ /admin/* cho etl-admin/
      env: { NODE_ENV: 'production' },
      min_uptime: '10s',
      max_restarts: 10
    },
    {
      name: 'hcrc-rp-server',
      cwd: '../rp-server',
      script: 'server.js',
      env: { NODE_ENV: 'production' },
      min_uptime: '10s',
      max_restarts: 10
    },
    {
      name: 'hcrc-api-server',
      cwd: '../api-server',
      script: 'server.js',
      env: { NODE_ENV: 'production' },
      min_uptime: '10s',
      max_restarts: 10
    }
  ]
};
