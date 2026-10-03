// scripts/seedZeroStockSkuSync.js — Tạo/CẬP NHẬT idempotent 2 job đồng bộ
// BẮT BUỘC (domain `banhang_sku`/`tonkho_sku`) — dùng CHUNG cho cả 3 báo
// cáo "hết hàng": "Top bán chạy đang tồn kho = 0" (`bc-ton-kho-0.md`) và
// "Core stock = 0" Mart/Minimart (`bc-core-ton-kho-0.md`) — thay cho việc
// bấm tay qua etl-admin (Bước 1+2 ở `bc-ton-kho-0.md`). Chạy LẠI file này
// an toàn — khớp theo "Name" để UPDATE thay vì tạo trùng.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã tạo xong 2 VIEW `dbo.vw_BanHangTheoSKU` và
// `dbo.vw_TonKhoTheoSKU` trên CSDL nguồn DSMART16 (Bước 1, `bc-ton-kho-0.md`)
// — ĐÚNG TÊN CỘT như trong tài liệu đó (MaThucThe/MaChiNhanh/TenChiNhanh/
// MaHangHienThi/TenHang/EventDate/SoLuongBan hoặc SoLuongTon/UpdatedAt).
// Script TỰ KIỂM TRA lại bằng cách duyệt schema thật của nguồn (giống hệt
// route POST /admin/sync-jobs khi tạo qua giao diện), báo lỗi rõ ràng và
// DỪNG LẠI nếu thiếu VIEW/cột, không tạo job nửa vời.
//
// KHÔNG tạo/đụng tới: job "doanhthu_chinhanh" (dimension "chain" MART/
// MINIMART dùng cho 2 báo cáo Core — DÙNG LẠI job đã có sẵn từ
// scripts/seedLdtdHcrcSync.js, xem bc-core-ton-kho-0.md Bước 1+2), 4 domain
// "Chờ nhập"/"Đã nhập" (Bước 2b, TUỲ CHỌN — VIEW mẫu trong tài liệu còn ghi
// rõ "CHỈ VÍ DỤ", cần DBA đối chiếu bảng/cột thật trước khi tạo), và 4
// domain Core "Khoá All"/"Khoá theo kho"/"SL đang đặt"/"Ngày nhập cuối"
// (Bước 4 ở bc-core-ton-kho-0.md, cũng TUỲ CHỌN + "CHỈ VÍ DỤ" y hệt) — DBA/
// admin etl-admin tự làm riêng khi cần, không nằm trong phạm vi script này.
//
// Cách dùng — điền các biến môi trường sau vào .env (hoặc export trước khi
// chạy), rồi:
//   node scripts/seedZeroStockSkuSync.js
//
// Bắt buộc:
//   DSMART16_SERVER    Địa chỉ máy chủ SQL Server (vd 192.168.10.20)
//   DSMART16_USER      Tài khoản CHỈ ĐỌC dùng chung cho CSDL DSMART16
//   DSMART16_PASSWORD  Mật khẩu tài khoản trên
// Tuỳ chọn (mặc định hợp lý):
//   DSMART16_PORT      mặc định 1433
//   DSMART16_LIVE_DB   mặc định "DSMART16"
//   DSMART16_ENCRYPT       "false" để tắt mã hoá kết nối (mặc định bật)
//   DSMART16_TRUST_CERT    "true" để tin chứng chỉ tự ký (mặc định tắt)
//
// LƯU Ý: dùng CHUNG tên biến môi trường + CHUNG tên "Nguồn dữ liệu" ("DSMART16
// - Live") với scripts/seedLdtdHcrcSync.js — nếu báo cáo LDTD/HCRC đã chạy
// script đó trước, script này TỰ DÙNG LẠI đúng Nguồn dữ liệu đã có (khớp
// theo Name), KHÔNG tạo kết nối trùng tới cùng 1 CSDL. Chạy script này
// TRƯỚC cũng được — nó tự tạo Nguồn dữ liệu nếu chưa có.
require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const schemaBrowser = require('../lib/schemaBrowser');

const BANHANG_VIEW = 'vw_BanHangTheoSKU';
const TONKHO_VIEW = 'vw_TonKhoTheoSKU';
const LIVE_DATASOURCE_NAME = 'DSMART16 - Live'; // ĐÚNG tên dùng ở seedLdtdHcrcSync.js — khớp để dùng lại, không tạo trùng.

function readConfig() {
  const server = process.env.DSMART16_SERVER;
  const user = process.env.DSMART16_USER;
  const password = process.env.DSMART16_PASSWORD;
  if (!server || !user || !password) {
    console.error('⛔ Thiếu DSMART16_SERVER/DSMART16_USER/DSMART16_PASSWORD trong .env — xem hướng dẫn ở đầu file này.');
    process.exit(1);
  }
  return {
    name: LIVE_DATASOURCE_NAME,
    server,
    port: parseInt(process.env.DSMART16_PORT || '1433', 10),
    databaseName: process.env.DSMART16_LIVE_DB || 'DSMART16',
    username: user,
    password,
    encryptConn: process.env.DSMART16_ENCRYPT !== 'false',
    trustServerCert: process.env.DSMART16_TRUST_CERT === 'true'
  };
}

// Khớp theo Name trước — có rồi thì DÙNG LẠI NGUYÊN VẸN (không ghi đè mật
// khẩu/kết nối đã lưu, có thể do script seedLdtdHcrcSync.js tạo từ trước
// với thông tin đã đúng) — chỉ tạo mới khi THẬT SỰ chưa có.
async function resolveDataSourceId(pool, cfg) {
  const existing = await pool.request().input('name', sql.NVarChar(200), cfg.name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    console.log(`↻ Dùng lại Nguồn dữ liệu "${cfg.name}" đã có (Id ${id}).`);
    return id;
  }
  const passwordEncrypted = encrypt(cfg.password);
  const result = await pool.request()
    .input('name', sql.NVarChar(200), cfg.name)
    .input('server', sql.NVarChar(200), cfg.server)
    .input('port', sql.Int, cfg.port)
    .input('databaseName', sql.NVarChar(100), cfg.databaseName)
    .input('username', sql.NVarChar(100), cfg.username)
    .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
    .input('encryptConn', sql.Bit, cfg.encryptConn ? 1 : 0)
    .input('trustServerCert', sql.Bit, cfg.trustServerCert ? 1 : 0)
    .query(`
      INSERT INTO etl.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert)
      OUTPUT INSERTED.Id
      VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert)
    `);
  const id = result.recordset[0].Id;
  console.log(`✅ Đã tạo Nguồn dữ liệu "${cfg.name}" (Id ${id}).`);
  return id;
}

// Đối chiếu VIEW + cột cần dùng với schema THẬT của nguồn — DỪNG LẠI ngay
// (không tạo job) nếu thiếu, để không lưu job cấu hình sai âm thầm chờ tới
// lúc chạy thật mới lộ lỗi. Mirror assertViewReady ở seedLdtdHcrcSync.js.
async function assertViewReady(dataSourceId, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(
      `Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${LIVE_DATASOURCE_NAME}" — tạo VIEW này trước ` +
      `(xem Bước 1, "bc-ton-kho-0.md") rồi chạy lại script.`
    );
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${tableName}" trên nguồn "${LIVE_DATASOURCE_NAME}" thiếu cột: ${missing.join(', ')} — đối chiếu lại câu CREATE VIEW ở "bc-ton-kho-0.md".`);
  }
}

async function upsertSyncJob(pool, job) {
  const existing = await pool.request().input('name', sql.NVarChar(200), job.name)
    .query('SELECT Id FROM etl.SyncJobs WHERE Name = @name');
  const dimensionColumnsJson = JSON.stringify(job.dimensionColumns);
  const measureColumnsJson = JSON.stringify(job.measureColumns);
  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, id)
      .input('dataSourceId', sql.Int, job.dataSourceId)
      .input('sourceSchema', sql.NVarChar(100), 'dbo')
      .input('sourceTable', sql.NVarChar(100), job.sourceTable)
      .input('keyColumn', sql.NVarChar(100), job.keyColumn)
      .input('dateColumn', sql.NVarChar(100), job.dateColumn)
      .input('updatedAtColumn', sql.NVarChar(100), job.updatedAtColumn)
      .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), dimensionColumnsJson)
      .input('measureColumnsJson', sql.NVarChar(sql.MAX), measureColumnsJson)
      .input('targetDomain', sql.VarChar(50), job.targetDomain)
      .input('cronExpression', sql.VarChar(50), job.cronExpression)
      .query(`
        UPDATE etl.SyncJobs SET
          Type = 'table', DataSourceId = @dataSourceId, SourceSchema = @sourceSchema, SourceTable = @sourceTable,
          KeyColumn = @keyColumn, DateColumn = @dateColumn, UpdatedAtColumn = @updatedAtColumn,
          DimensionColumnsJson = @dimensionColumnsJson, MeasureColumnsJson = @measureColumnsJson,
          JoinSchema = NULL, JoinTable = NULL, JoinType = NULL, MainJoinColumn = NULL, LookupJoinColumn = NULL,
          TargetDomain = @targetDomain, CronExpression = @cronExpression, KeepHistory = 1,
          BranchCodeMapType = NULL, IsActive = 1
        WHERE Id = @id
      `);
    console.log(`↻ Đã cập nhật job "${job.name}" (Id ${id}).`);
    return id;
  }
  const result = await pool.request()
    .input('name', sql.NVarChar(200), job.name)
    .input('dataSourceId', sql.Int, job.dataSourceId)
    .input('sourceSchema', sql.NVarChar(100), 'dbo')
    .input('sourceTable', sql.NVarChar(100), job.sourceTable)
    .input('keyColumn', sql.NVarChar(100), job.keyColumn)
    .input('dateColumn', sql.NVarChar(100), job.dateColumn)
    .input('updatedAtColumn', sql.NVarChar(100), job.updatedAtColumn)
    .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), dimensionColumnsJson)
    .input('measureColumnsJson', sql.NVarChar(sql.MAX), measureColumnsJson)
    .input('targetDomain', sql.VarChar(50), job.targetDomain)
    .input('cronExpression', sql.VarChar(50), job.cronExpression)
    .query(`
      INSERT INTO etl.SyncJobs (
        Name, Type, DataSourceId, SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn,
        DimensionColumnsJson, MeasureColumnsJson, TargetDomain, CronExpression, KeepHistory
      )
      OUTPUT INSERTED.Id
      VALUES (
        @name, 'table', @dataSourceId, @sourceSchema, @sourceTable, @keyColumn, @dateColumn, @updatedAtColumn,
        @dimensionColumnsJson, @measureColumnsJson, @targetDomain, @cronExpression, 1
      )
    `);
  const id = result.recordset[0].Id;
  console.log(`✅ Đã tạo job "${job.name}" (Id ${id}) — scheduler nạp lại trong tối đa 60 giây, không cần khởi động lại ETL.`);
  return id;
}

async function main() {
  const config = readConfig();
  const pool = await getPool('ADMIN');
  const dataSourceId = await resolveDataSourceId(pool, config);

  // Dimensions/Measures ĐÚNG TÊN CỘT trong 2 VIEW mẫu ở bc-ton-kho-0.md
  // (Bước 1) — KeepHistory=1 BẮT BUỘC cho cả 2 (xem Bước 2, lý do: báo cáo
  // cần cộng dồn "7 ngày"/"30 ngày" VÀ cần lùi lại đúng dòng tồn kho "hôm
  // qua").
  const jobs = [
    {
      name: 'Bán hàng theo SKU (DSMART16)', sourceTable: BANHANG_VIEW,
      keyColumn: 'MaThucThe', dateColumn: 'EventDate', updatedAtColumn: 'UpdatedAt',
      dimensionColumns: ['MaChiNhanh', 'TenChiNhanh', 'MaHangHienThi', 'TenHang'],
      measureColumns: ['SoLuongBan'], targetDomain: 'banhang_sku',
      // Cùng tần suất job "Doanh thu chi nhánh - Live" (seedLdtdHcrcSync.js)
      // — domain này CŨNG phục vụ lựa chọn "Trong ngày" (daily), cần số liệu
      // cập nhật trong ngày, không chỉ 1 lần/ngày.
      cronExpression: '*/15 * * * *'
    },
    {
      name: 'Tồn kho theo SKU (DSMART16)', sourceTable: TONKHO_VIEW,
      keyColumn: 'MaThucThe', dateColumn: 'EventDate', updatedAtColumn: 'UpdatedAt',
      dimensionColumns: ['MaChiNhanh', 'TenChiNhanh', 'MaHangHienThi', 'TenHang'],
      measureColumns: ['SoLuongTon'], targetDomain: 'tonkho_sku',
      cronExpression: '*/15 * * * *'
    }
  ];

  // Kiểm tra ĐỦ CẢ 2 job trước khi ghi bất kỳ job nào — không tạo nửa vời.
  for (const job of jobs) {
    const requiredColumns = [job.keyColumn, job.dateColumn, job.updatedAtColumn, ...job.dimensionColumns, ...job.measureColumns];
    try {
      await assertViewReady(dataSourceId, job.sourceTable, requiredColumns);
    } catch (err) {
      console.error(`⛔ ${err.message}`);
      process.exit(1);
      return;
    }
  }
  for (const job of jobs) {
    await upsertSyncJob(pool, { ...job, dataSourceId });
  }

  console.log('');
  console.log('✅ Xong — 2 job đồng bộ (banhang_sku/tonkho_sku) đã sẵn sàng, dùng chung');
  console.log('   cho cả 3 báo cáo "hết hàng" (Top bán chạy tồn kho=0, Core=0 Mart/Minimart).');
  console.log('   Bước tiếp theo: node scripts/seedTopZeroStockReport.js và');
  console.log('   node scripts/seedCoreZeroStockReports.js (trong thư mục rp-server) để đăng ký báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
