// lib/systemLog.js — Ghi nhật ký VẬN HÀNH chung (kết nối thành công/thất
// bại, cảnh báo cấu hình...) vào etl.SystemLog (CSDL HCRC_ETL, pool
// 'ADMIN') để xem lại được qua trang "Log" (etl-admin), thay vì CHỈ in ra
// console/pm2 log (phải SSH vào server mới xem được, đã gây khó khi debug
// thực tế). VẪN GIỮ console.log/console.warn/console.error như trước —
// hàm này CHỈ THÊM bước ghi CSDL, không thay thế đường log cũ.
//
// BẮT BUỘC không được throw ra ngoài — đây là tiện ích PHỤ TRỢ cho việc
// xem log, không phải luồng nghiệp vụ chính; nếu CSDL etl đang lỗi/chưa
// kết nối được (vd chính lúc đang ghi log lỗi kết nối!) thì im lặng bỏ qua
// bước ghi CSDL, KHÔNG được làm hỏng luồng gọi nó (vd interceptor kết nối
// pool khác). Cố ý KHÔNG await ở lời gọi — "bắn và quên" (fire-and-forget),
// tránh làm chậm đường code chính chỉ vì 1 câu INSERT phụ trợ.
const { sql, getPool } = require('../db');

async function writeToDb(level, message) {
  try {
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('level', sql.VarChar(10), level)
      .input('message', sql.NVarChar(1000), String(message).slice(0, 1000))
      .query('INSERT INTO etl.SystemLog (Level, Message) VALUES (@level, @message)');
  } catch {
    // Không log lỗi ở đây — tránh vòng lặp lỗi-ghi-lỗi nếu chính CSDL etl
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
