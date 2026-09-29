// scripts/seedVoucherDataSource.js — Tạo/cập nhật "Nguồn dữ liệu" trỏ
// DSMART16 (Live) cho API check/redeem voucher (đích api.VoucherSettings.
// DataSourceId, đọc bởi api-server/lib/voucherRedeemService.js) — THAY THẾ
// việc thao tác tay qua api-admin (trang "Nguồn dữ liệu" + "Cấu hình
// Voucher") bằng CHẠY SCRIPT 1 LẦN, đọc thông tin kết nối từ .env trên
// CHÍNH máy chủ đang chạy api-server — mật khẩu KHÔNG BAO GIỜ đi qua trình
// duyệt/log/chat, chỉ nằm trong .env (đã .gitignore, không commit).
//
// Cách dùng: điền các biến VOUCHER_DSMART16_* vào .env (xem
// api-server/.env.example mục "Voucher — kết nối DSMART16"), rồi chạy:
//   npm run seed:voucher-datasource
// hoặc:
//   node scripts/seedVoucherDataSource.js
//
// IDEMPOTENT — chạy lại nhiều lần AN TOÀN, khớp theo VOUCHER_DSMART16_NAME
// (mặc định "DSMART16 (Live) - Voucher"): lần đầu TẠO MỚI, các lần sau
// (vd đổi mật khẩu DSMART16, đổi server) chỉ CẬP NHẬT ĐÚNG dòng đó tại
// chỗ — không tạo trùng, không cần vào api-admin xoá dòng cũ trước.
//
// AN TOÀN: kiểm tra kết nối THẬT tới DSMART16 TRƯỚC — nếu sai thông tin
// (sai server/mật khẩu/tường lửa chặn) thì DỪNG NGAY, KHÔNG ghi gì vào
// CSDL cả, tránh lưu 1 cấu hình hỏng khiến API voucher báo lỗi mơ hồ hơn
// (503 rõ ràng "chưa cấu hình" còn dễ chẩn đoán hơn 1 nguồn có tồn tại
// nhưng kết nối luôn lỗi).
require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const { testConnection, invalidate } = require('../lib/dataSourcePool');

async function main() {
  const name = process.env.VOUCHER_DSMART16_NAME || 'DSMART16 (Live) - Voucher';
  const server = process.env.VOUCHER_DSMART16_SERVER;
  const port = Number(process.env.VOUCHER_DSMART16_PORT || 1433);
  const database = process.env.VOUCHER_DSMART16_DATABASE || 'DSMART16';
  const username = process.env.VOUCHER_DSMART16_USER;
  const password = process.env.VOUCHER_DSMART16_PASSWORD;
  const doEncrypt = process.env.VOUCHER_DSMART16_ENCRYPT !== 'false'; // mặc định true
  const trustCert = process.env.VOUCHER_DSMART16_TRUST_CERT === 'true'; // mặc định false

  if (!server || !username || !password) {
    console.error('⛔ Thiếu biến .env bắt buộc: VOUCHER_DSMART16_SERVER, VOUCHER_DSMART16_USER, VOUCHER_DSMART16_PASSWORD');
    console.error('   Xem api-server/.env.example mục "Voucher — kết nối DSMART16" để biết đầy đủ các biến.');
    process.exit(1);
  }

  console.log(`Đang kiểm tra kết nối tới ${server}:${port}/${database}...`);
  try {
    await testConnection({ server, port, database, user: username, password, encrypt: doEncrypt, trustServerCert: trustCert });
  } catch (err) {
    console.error(`⛔ Kết nối THẤT BẠI — KHÔNG lưu gì cả (tránh lưu cấu hình sai): ${err.message}`);
    console.error('   Kiểm tra lại VOUCHER_DSMART16_SERVER/PORT/DATABASE/USER/PASSWORD, quyền SQL (SELECT+UPDATE trên PMCRDINF) và tường lửa/mạng tới SQL Server.');
    process.exit(1);
  }
  console.log('✅ Kết nối thành công.');

  const pool = await getPool('ADMIN');
  const passwordEncrypted = encrypt(password);

  const existing = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM api.DataSources WHERE Name = @name');

  let dataSourceId;
  if (existing.recordset.length) {
    dataSourceId = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, dataSourceId)
      .input('server', sql.NVarChar(200), server)
      .input('port', sql.Int, port)
      .input('database', sql.NVarChar(100), database)
      .input('username', sql.NVarChar(100), username)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('encryptFlag', sql.Bit, doEncrypt)
      .input('trustCert', sql.Bit, trustCert)
      .query(`
        UPDATE api.DataSources SET
          Server = @server, Port = @port, DatabaseName = @database,
          Username = @username, PasswordEncrypted = @passwordEncrypted,
          Encrypt = @encryptFlag, TrustServerCert = @trustCert, IsActive = 1
        WHERE Id = @id
      `);
    await invalidate(dataSourceId); // đổi thông tin -> đóng pool cache cũ, ép mở lại đúng cấu hình mới ngay lần gọi kế tiếp
    console.log(`✅ Đã CẬP NHẬT "Nguồn dữ liệu" #${dataSourceId} "${name}".`);
  } else {
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('server', sql.NVarChar(200), server)
      .input('port', sql.Int, port)
      .input('database', sql.NVarChar(100), database)
      .input('username', sql.NVarChar(100), username)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('encryptFlag', sql.Bit, doEncrypt)
      .input('trustCert', sql.Bit, trustCert)
      .query(`
        INSERT INTO api.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert, IsActive)
        OUTPUT INSERTED.Id
        VALUES (@name, @server, @port, @database, @username, @passwordEncrypted, @encryptFlag, @trustCert, 1)
      `);
    dataSourceId = result.recordset[0].Id;
    console.log(`✅ Đã TẠO MỚI "Nguồn dữ liệu" #${dataSourceId} "${name}".`);
  }

  // api.VoucherSettings luôn đúng 1 dòng (Id=1, CHECK constraint — xem
  // api-db/schema.sql) — MERGE để chạy đúng cả lần đầu (chưa có dòng nào)
  // lẫn các lần sau (đã có, chỉ cần đổi DataSourceId).
  await pool.request().input('dataSourceId', sql.Int, dataSourceId).query(`
    MERGE api.VoucherSettings AS target
    USING (SELECT 1 AS Id) AS src ON target.Id = src.Id
    WHEN MATCHED THEN UPDATE SET DataSourceId = @dataSourceId
    WHEN NOT MATCHED THEN INSERT (Id, DataSourceId) VALUES (1, @dataSourceId);
  `);
  console.log(`✅ Đã trỏ api.VoucherSettings -> Nguồn dữ liệu #${dataSourceId}.`);
  console.log('Hoàn tất — thử gọi POST /api/v1/vouchers/check với 1 mã thật để xác nhận (xem api-voucher-check-redeem.md).');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
