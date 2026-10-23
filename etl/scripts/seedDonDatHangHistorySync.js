// scripts/seedDonDatHangHistorySync.js — Tạo/CẬP NHẬT idempotent "Nguồn dữ
// liệu" DSMART16_EOM (dùng lại nếu đã có, vd do seedLdtdHcrcSync.js tạo
// trước) + job đồng bộ "Lịch sử" (domain `don_dat_hang`, CÙNG TargetDomain
// với job "Live" của scripts/seedDonDatHangSync.js) — bản 9.21, theo báo
// cáo người dùng: 6 báo cáo Mua hàng chỉ lấy được dữ liệu trong tháng hiện
// tại, không lấy được lịch sử nhiều năm (giống hệt lỗi đã gặp + đã sửa ở
// báo cáo doanh thu — xem "báo cáo doanh thu cuối ngày.md" Script B).
//
// NGUYÊN NHÂN: job "Live" (seedDonDatHangSync.js) chỉ đọc VIEW trên CSDL
// DSMART16 — bảng STRANS ở đó CHỈ giữ giao dịch gần đây, dữ liệu cũ hơn đã
// chuyển sang CSDL RIÊNG DSMART16_EOM. Script này tạo job THỨ 2 đọc VIEW
// CÙNG TÊN (vw_DonDatHangChiNhanh) nhưng trên DSMART16_EOM (UNION ALL toàn
// bộ bảng STRANS_YYYYMM/STRANS_EOM — xem
// "deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql").
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã chạy xong file SQL trên để tạo VIEW trên
// DSMART16_EOM. Script TỰ KIỂM TRA lại bằng cách duyệt schema thật, báo lỗi
// rõ ràng và DỪNG LẠI nếu thiếu VIEW/cột, không tạo job nửa vời.
//
// Cách dùng — điền .env (DÙNG CHUNG tên biến với seedLdtdHcrcSync.js —
// script này tự dùng lại "Nguồn dữ liệu" tên "DSMART16 - Lịch sử" đã có nếu
// trước đó đã chạy seedLdtdHcrcSync.js, không hỏi lại/không tạo trùng), rồi:
//   node scripts/seedDonDatHangHistorySync.js
//
// Bắt buộc (nếu CHƯA từng chạy seedLdtdHcrcSync.js — script này tự tạo mới
// "Nguồn dữ liệu" DSMART16_EOM nếu chưa có):
//   DSMART16_SERVER    Địa chỉ máy chủ SQL Server (dùng mặc định cho EOM nếu không khai riêng)
//   DSMART16_USER      Tài khoản CHỈ ĐỌC
//   DSMART16_PASSWORD  Mật khẩu tài khoản trên
// Tuỳ chọn (ghi đè riêng cho CSDL Lịch sử, mặc định = giá trị DSMART16_* ở trên):
//   DSMART16_EOM_SERVER / DSMART16_EOM_PORT / DSMART16_EOM_DB (mặc định "DSMART16_EOM")
//   DSMART16_EOM_USER / DSMART16_EOM_PASSWORD
//   DSMART16_ENCRYPT / DSMART16_TRUST_CERT
require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'vw_DonDatHangChiNhanh';
const EOM_DATASOURCE_NAME = 'DSMART16 - Lịch sử'; // ĐÚNG tên dùng ở seedLdtdHcrcSync.js — khớp để dùng lại, không tạo trùng.
const JOB_NAME = 'Đơn đặt hàng - nhập hàng - Lịch sử (DSMART16_EOM)';
const TARGET_DOMAIN = 'don_dat_hang'; // CÙNG domain với job "Live" — 2 job cùng ghi dwh.ReportFacts, phân biệt theo SourceSystem (khác DataSourceId), không đè lên nhau.

function readConfig() {
  const server = process.env.DSMART16_SERVER;
  const user = process.env.DSMART16_USER;
  const password = process.env.DSMART16_PASSWORD;
  if (!server || !user || !password) {
    console.error('⛔ Thiếu DSMART16_SERVER/DSMART16_USER/DSMART16_PASSWORD trong .env — xem hướng dẫn ở đầu file này.');
    process.exit(1);
  }
  return {
    name: EOM_DATASOURCE_NAME,
    server: process.env.DSMART16_EOM_SERVER || server,
    port: parseInt(process.env.DSMART16_EOM_PORT || process.env.DSMART16_PORT || '1433', 10),
    databaseName: process.env.DSMART16_EOM_DB || 'DSMART16_EOM',
    username: process.env.DSMART16_EOM_USER || user,
    password: process.env.DSMART16_EOM_PASSWORD || password,
    encryptConn: process.env.DSMART16_ENCRYPT !== 'false',
    trustServerCert: process.env.DSMART16_TRUST_CERT === 'true'
  };
}

// Khớp theo Name trước — có rồi (vd do seedLdtdHcrcSync.js tạo) thì DÙNG
// LẠI NGUYÊN VẸN, không tạo trùng kết nối tới cùng 1 CSDL.
async function resolveDataSourceId(pool, cfg) {
  const existing = await pool.request().input('name', sql.NVarChar(200), cfg.name)
    .query('SELECT Id, Server, Port, DatabaseName FROM etl.DataSources WHERE Name = @name');
  if (existing.recordset.length) {
    const row = existing.recordset[0];
    console.log(`↻ Dùng lại Nguồn dữ liệu "${cfg.name}" đã có (Id ${row.Id}) — đang trỏ tới Server="${row.Server}" Port=${row.Port} DatabaseName="${row.DatabaseName}".`);
    if (row.Server !== cfg.server || String(row.Port) !== String(cfg.port) || row.DatabaseName !== cfg.databaseName) {
      console.warn(`⚠️  Nguồn dữ liệu đã có KHÔNG khớp với .env hiện tại (.env đang khai Server="${cfg.server}" Port=${cfg.port} DatabaseName="${cfg.databaseName}") — script KHÔNG tự sửa bản ghi cũ để tránh ảnh hưởng báo cáo doanh thu đang dùng chung nguồn này.`);
    }
    return row.Id;
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

async function assertViewReady(dataSourceId, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some((t) => t.schemaName === 'dbo' && t.tableName === VIEW_NAME);
  if (!exists) {
    throw new Error(
      `Không tìm thấy VIEW "dbo.${VIEW_NAME}" trên nguồn "${EOM_DATASOURCE_NAME}" — chạy file ` +
      `"deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql" trước rồi chạy lại script này.`
    );
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', VIEW_NAME);
  const colNames = new Set(cols.map((c) => c.columnName));
  const missing = requiredColumns.filter((c) => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${VIEW_NAME}" trên nguồn "${EOM_DATASOURCE_NAME}" thiếu cột: ${missing.join(', ')} — đối chiếu lại câu CREATE VIEW ở file .sql nói trên.`);
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

  // CÙNG dimensionColumns/measureColumns với job "Live" (seedDonDatHangSync.js)
  // — VIEW Lịch sử (DSMART16_EOM) trả về ĐÚNG khuôn cột/alias y hệt VIEW Live.
  // MaHangHienThi (bản 9.95), MaNganhHang/TenNganhHang (bản 10.2) — xem
  // seedDonDatHangSync.js.
  const dimensionColumns = ['MaDiem', 'TenDiem', 'SoDon', 'LoaiGiaoDich', 'NgayGiao', 'MaNCC', 'TenNCC', 'NguoiDat', 'MaHang', 'TenHang', 'MaHangHienThi', 'MaNganhHang', 'TenNganhHang', 'DVT', 'TrangThai', 'TrangThaiLabel'];
  const measureColumns = ['SoLuong', 'DonGia', 'ThanhTien'];
  const job = {
    name: JOB_NAME, sourceTable: VIEW_NAME,
    keyColumn: 'MaThucThe', dateColumn: 'EventDate', updatedAtColumn: 'EventDate',
    dimensionColumns, measureColumns, targetDomain: TARGET_DOMAIN,
    // Job "Lịch sử" quét ~93 tháng dữ liệu mỗi lượt đầy đủ, KHÔNG cần chạy
    // mỗi 15 phút như job "Live" — 1 lần/ngày lúc 3h sáng là đủ (dữ liệu
    // lịch sử gần như không đổi, trừ khi DBA sửa/thêm dữ liệu cũ).
    cronExpression: '0 3 * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, job.updatedAtColumn, ...job.dimensionColumns, ...job.measureColumns];
  try {
    await assertViewReady(dataSourceId, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, { ...job, dataSourceId });

  console.log('');
  console.log('✅ Xong — job đồng bộ "Lịch sử" cho domain "don_dat_hang" đã sẵn sàng.');
  console.log('   Lần chạy ĐẦU TIÊN sẽ quét TOÀN BỘ ~93 tháng dữ liệu — có thể mất VÀI GIỜ');
  console.log('   (khác job "Live" chỉ vài phút). Theo dõi tiến độ ở etl-admin → Sync Jobs → "Lịch sử".');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
