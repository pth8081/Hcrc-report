// lib/systemLog.js — Ghi nhật ký VẬN HÀNH chung (kết nối CSDL thành công/
// thất bại, lỗi request không bắt được ở route cụ thể, lịch gửi email báo
// cáo/cảnh báo bất thường bắt đầu/thành công/lỗi...) vào app.SystemLog (CSDL
// HCRC_RP, pool 'RP') để xem lại được qua trang "Log" (rp-user), thay vì CHỈ
// in ra console/pm2 log (phải SSH vào server mới xem được). Khác
// lib/auditLog.js (app.AuditLog — AI làm gì, thao tác chủ động qua giao
// diện). Cùng khuôn etl/lib/systemLog.js.
//
// BẮT BUỘC không được throw ra ngoài — tiện ích PHỤ TRỢ cho việc xem log,
// không phải luồng nghiệp vụ chính; CSDL RP đang lỗi (vd chính lúc đang ghi
// log lỗi kết nối!) thì im lặng bỏ qua bước ghi CSDL, KHÔNG được làm hỏng
// luồng gọi nó. Cố ý KHÔNG await ở lời gọi — "bắn và quên".
async function writeToDb(level, message) {
  try {
    // require() TRỄ (trong hàm) — db.js cũng require('./lib/systemLog') để
    // ghi log kết nối, require() ở đầu file 2 bên sẽ vòng lặp lẫn nhau lúc
    // NẠP MODULE (module.exports của bên kia chưa kịp gán xong).
    const { sql, getPool } = require('../db');
    const pool = await getPool('RP');
    await pool.request()
      .input('level', sql.VarChar(10), level)
      .input('message', sql.NVarChar(1000), String(message).slice(0, 1000))
      .query('INSERT INTO app.SystemLog (Level, Message) VALUES (@level, @message)');
  } catch {
    // Không log lỗi ở đây — tránh vòng lặp lỗi-ghi-lỗi nếu chính CSDL RP
    // đang là nguồn gây lỗi ban đầu.
  }
}

function logInfo(message) {
  console.log(message);
  writeToDb('INFO', message);
}

function logWarn(message) {
  console.warn(message);
  writeToDb('WARN', message);
}

function logError(message) {
  console.error(message);
  writeToDb('ERROR', message);
}

module.exports = { logInfo, logWarn, logError };
