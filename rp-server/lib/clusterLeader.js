// lib/clusterLeader.js — Dưới PM2 cluster mode (deploy/ecosystem.config.js,
// nhiều tiến trình Node CÙNG service), PM2 tự gán
// process.env.NODE_APP_INSTANCE = "0".."N-1" cho từng worker khi khởi động.
// CHỈ instance "0" được coi là "leader" — dùng để chặn N worker cùng đăng
// ký/chạy cron (jobs/reportEmailScheduler.js, jobs/anomalyAlertScheduler.js,
// dọn log định kỳ trong server.js): nếu KHÔNG chặn, N worker cùng
// cron.schedule() N lần cho CÙNG 1 lịch, tới giờ N worker cùng gửi — người
// nhận thấy N EMAIL TRÙNG LẶP cho 1 lần gửi. Khác các lớp khoá cấp CSDL
// (vd sp_getapplock ở etl/jobs/runSync.js) — đó chặn GHI DỮ LIỆU chồng lấn
// (đã đúng bất kể clustering), còn đây chặn ĐĂNG KÝ cron TRÙNG LẶP ngay từ
// đầu, cần thiết cho các job không có khoá CSDL tương đương (gửi email không
// "ghi đè" được, gửi rồi là gửi rồi).
//
// Chạy KHÔNG qua PM2 cluster (dev, hoặc PM2 fork mode/instances:1) ->
// NODE_APP_INSTANCE undefined -> vẫn coi là leader, giữ đúng hành vi cũ
// (cron chạy bình thường, không cần cấu hình gì thêm).
//
// Bản sao CÙNG NỘI DUNG cũng có ở api-server/lib/ và etl/lib/ — cố ý trùng
// lặp, theo đúng nguyên tắc "mỗi server tự chứa đủ code" đã áp dụng xuyên
// suốt dự án (không dùng thư mục shared/).
function isSchedulerLeader() {
  return process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0';
}

module.exports = { isSchedulerLeader };
