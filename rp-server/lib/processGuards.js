// lib/processGuards.js — Bảo vệ tiến trình ở tầng Node, BỔ SUNG cho PM2 (PM2
// tự khởi động lại khi tiến trình CHẾT — nhưng không giúp gì khi tiến trình
// gặp lỗi mà VẪN "sống" ở trạng thái hỏng, hoặc khi PM2 restart giữa lúc
// đang xử lý request/transaction dở). Bản sao CÙNG NỘI DUNG cũng có ở
// etl/lib/processGuards.js, api-server/lib/processGuards.js — cố ý trùng
// lặp, cùng lý do với reportEngine.js/db.js (xem tài liệu kiến trúc, mục 08).
//
// 1) uncaughtException/unhandledRejection — Node KHÔNG tự thoát khi có lỗi
//    kiểu này (chỉ log ra stderr rồi tiếp tục chạy) — tiến trình có thể tiếp
//    tục phục vụ request ở trạng thái không còn đáng tin (state nửa vời,
//    handle bị rò rỉ...). Chủ động thoát NGAY (process.exit(1)) để PM2 khởi
//    động lại SẠCH, thay vì để tiến trình "sống dở chết dở" âm thầm.
// 2) SIGTERM/SIGINT (PM2 gửi lúc `pm2 reload`/`pm2 stop`, hoặc Ctrl+C lúc
//    dev) — ĐÓNG DẦN thay vì bị giết ngay: ngừng nhận request mới
//    (server.close()), đợi request đang xử lý xong, đóng hết pool CSDL
//    (closeAll() — xem db.js) rồi mới thoát. Có hạn mức thời gian (10s) —
//    quá hạn thì buộc thoát, không treo vô thời hạn nếu có request "chờ mãi"
//    không tự kết thúc.
function installProcessGuards({ server, closeAll, serviceName }) {
  process.on('uncaughtException', (err) => {
    console.error(`⛔ [${serviceName}] Lỗi không bắt được (uncaughtException) — dừng tiến trình để PM2 khởi động lại sạch:`, err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error(`⛔ [${serviceName}] Promise bị từ chối không ai bắt (unhandledRejection) — dừng tiến trình để PM2 khởi động lại sạch:`, reason);
    process.exit(1);
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return; // 2 tín hiệu liên tiếp (vd double Ctrl+C) không chạy 2 lần
    shuttingDown = true;
    console.log(`\n${signal} — đóng dần [${serviceName}]: ngừng nhận request mới, đợi request đang xử lý xong, đóng pool CSDL...`);

    const forceExitTimer = setTimeout(() => {
      console.error(`⛔ [${serviceName}] Đóng dần quá 10s — buộc thoát`);
      process.exit(1);
    }, 10000);
    forceExitTimer.unref(); // không giữ tiến trình sống chỉ vì timer này

    server.close(async () => {
      try {
        await closeAll();
      } catch (err) {
        console.error(`⛔ [${serviceName}] Lỗi đóng pool CSDL lúc tắt:`, err.message);
      }
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { installProcessGuards };
