// scripts/seedVoucherApiConnection.js — Tạo/cập nhật "Kết nối API Server"
// (app.ApiConnections) trỏ về api-server, dùng cho mọi báo cáo apiReport/
// apiRealtime — THAY THẾ việc vào rp-user tự tay dán API key qua web, theo
// đúng yêu cầu người dùng (bản 9.03): chạy script, không cấu hình qua web.
//
// Nhận API key qua THAM SỐ DÒNG LỆNH (KHÔNG qua .env/file) — đúng key vừa
// in ra từ api-server/scripts/seedVoucherCheckConsumer.js — dùng NGAY trong
// 1 lệnh nối chuỗi, giữ nguyên nguyên tắc "key chỉ hiện đúng 1 lần":
//
//   cd api-server
//   APIKEY=$(node scripts/seedVoucherCheckConsumer.js) && \
//     (cd ../rp-server && node scripts/seedVoucherApiConnection.js "$APIKEY")
//
// Cách dùng:
//   node scripts/seedVoucherApiConnection.js <apiKey> [tenKetNoi] [baseUrl]
// tenKetNoi mặc định "API Server" (đổi nếu muốn đặt tên khác/đã có kết nối
// tên khác cho mục đích khác). baseUrl mặc định đọc biến môi trường
// API_SERVER_BASE_URL (.env) nếu không truyền tham số thứ 3 — PHẢI khai 1
// trong 2 nơi, đúng URL api-server mà MÁY CHỦ rp-server gọi tới được (vd
// địa chỉ nội bộ, không nhất thiết là domain public).
//
// AN TOÀN: kiểm tra api-server có phản hồi /api/v1/health TRƯỚC khi ghi
// (cùng tinh thần seedVoucherDataSource.js) — sai baseUrl thì DỪNG NGAY.
//
// IDEMPOTENT — khớp theo Name: lần đầu TẠO MỚI, các lần sau (đổi key do
// luân chuyển, đổi baseUrl) CẬP NHẬT tại chỗ.
require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const { testConnection, invalidate } = require('../lib/apiConnectionPool');

async function main() {
  const apiKey = process.argv[2];
  const name = process.argv[3] || 'API Server';
  const baseUrl = process.argv[4] || process.env.API_SERVER_BASE_URL;

  if (!apiKey) {
    console.error('⛔ Thiếu apiKey — truyền làm tham số đầu tiên.');
    console.error('   Dùng: node scripts/seedVoucherApiConnection.js <apiKey> [tenKetNoi] [baseUrl]');
    process.exit(1);
  }
  if (!baseUrl) {
    console.error('⛔ Thiếu baseUrl — truyền làm tham số thứ 3, hoặc khai API_SERVER_BASE_URL trong .env.');
    process.exit(1);
  }

  console.log(`Đang kiểm tra api-server tại ${baseUrl}...`);
  try {
    await testConnection({ baseUrl });
  } catch (err) {
    console.error(`⛔ Không kết nối được tới "${baseUrl}" — KHÔNG lưu gì cả: ${err.message}`);
    process.exit(1);
  }
  console.log('✅ api-server phản hồi OK.');

  const pool = await getPool('RP');
  const apiKeyEncrypted = encrypt(apiKey);

  const existing = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM app.ApiConnections WHERE Name = @name');

  let id;
  if (existing.recordset.length) {
    id = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, id)
      .input('baseUrl', sql.NVarChar(300), baseUrl)
      .input('apiKeyEncrypted', sql.NVarChar(500), apiKeyEncrypted)
      .query('UPDATE app.ApiConnections SET BaseUrl = @baseUrl, ApiKeyEncrypted = @apiKeyEncrypted WHERE Id = @id');
    invalidate(id);
    console.log(`✅ Đã CẬP NHẬT "Kết nối API Server" #${id} "${name}".`);
  } else {
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('baseUrl', sql.NVarChar(300), baseUrl)
      .input('apiKeyEncrypted', sql.NVarChar(500), apiKeyEncrypted)
      .query(`
        INSERT INTO app.ApiConnections (Name, BaseUrl, ApiKeyEncrypted)
        OUTPUT INSERTED.Id
        VALUES (@name, @baseUrl, @apiKeyEncrypted)
      `);
    id = result.recordset[0].Id;
    console.log(`✅ Đã TẠO MỚI "Kết nối API Server" #${id} "${name}".`);
  }

  console.log('');
  console.log(`Chạy tiếp: node scripts/seedVoucherCheckReport.js "${name}" để tạo báo cáo "Tra cứu voucher".`);
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
