// scripts/seedLdtdHcrcSync.js — Tạo/CẬP NHẬT idempotent 2 "Nguồn dữ liệu"
// (DSMART16 Live + Lịch sử) và 4 job đồng bộ (Doanh thu/Giao dịch × Live/
// Lịch sử) cho báo cáo "Báo cáo nhanh doanh thu - LDTD/HCRC" — thay cho
// việc bấm tay qua etl-admin, xem đầy đủ giải thích kiến trúc ở
// "báo cáo doanh thu cuối ngày.md" (Bước 1-2) và hướng_dẫn_báo_cáo.md mục
// 11/15. Chạy LẠI file này an toàn — khớp theo "Name" để UPDATE thay vì tạo
// trùng (đổi Server/mật khẩu/domain thì sửa .env rồi chạy lại là đủ).
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã tạo xong 2 VIEW `V_HCRC_DOANHTHU_CHINHANH`
// và `V_HCRC_GIAODICH_CHINHANH` trên CẢ 2 CSDL DSMART16 (Bước 1 trong file
// hướng dẫn) — script này TỰ KIỂM TRA lại bằng cách duyệt schema thật của
// nguồn (giống hệt route POST /admin/sync-jobs khi tạo qua giao diện), báo
// lỗi rõ ràng và DỪNG LẠI nếu thiếu VIEW/cột, không tạo job nửa vời.
//
// Cách dùng — điền các biến môi trường sau vào .env (hoặc export trước khi
// chạy), rồi:
//   node scripts/seedLdtdHcrcSync.js
//
// Bắt buộc:
//   DSMART16_SERVER    Địa chỉ máy chủ SQL Server (vd 192.168.10.20)
//   DSMART16_USER      Tài khoản CHỈ ĐỌC dùng chung cho cả 2 CSDL
//   DSMART16_PASSWORD  Mật khẩu tài khoản trên
// Tuỳ chọn (mặc định hợp lý cho trường hợp phổ biến — 2 CSDL CÙNG 1 máy
// chủ, cùng 1 tài khoản):
//   DSMART16_PORT          mặc định 1433
//   DSMART16_LIVE_DB       mặc định "DSMART16"
//   DSMART16_EOM_DB        mặc định "DSMART16_EOM"
//   DSMART16_EOM_SERVER    mặc định = DSMART16_SERVER (khác máy chủ thì đổi)
//   DSMART16_EOM_PORT      mặc định = DSMART16_PORT
//   DSMART16_EOM_USER      mặc định = DSMART16_USER
//   DSMART16_EOM_PASSWORD  mặc định = DSMART16_PASSWORD
//   DSMART16_ENCRYPT       "false" để tắt mã hoá kết nối (mặc định bật)
//   DSMART16_TRUST_CERT    "true" để tin chứng chỉ tự ký (mặc định tắt)
require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const schemaBrowser = require('../lib/schemaBrowser');

const DOANHTHU_VIEW = 'V_HCRC_DOANHTHU_CHINHANH';
const GIAODICH_VIEW = 'V_HCRC_GIAODICH_CHINHANH';

function readConfig() {
  const server = process.env.DSMART16_SERVER;
  const user = process.env.DSMART16_USER;
  const password = process.env.DSMART16_PASSWORD;
  if (!server || !user || !password) {
    console.error('⛔ Thiếu DSMART16_SERVER/DSMART16_USER/DSMART16_PASSWORD trong .env — xem hướng dẫn ở đầu file này.');
    process.exit(1);
  }
  const port = parseInt(process.env.DSMART16_PORT || '1433', 10);
  const encryptConn = process.env.DSMART16_ENCRYPT !== 'false';
  const trustServerCert = process.env.DSMART16_TRUST_CERT === 'true';
  return {
    live: {
      name: 'DSMART16 - Live',
      server, port, databaseName: process.env.DSMART16_LIVE_DB || 'DSMART16',
      username: user, password, encryptConn, trustServerCert
    },
    eom: {
      name: 'DSMART16 - Lịch sử',
      server: process.env.DSMART16_EOM_SERVER || server,
      port: parseInt(process.env.DSMART16_EOM_PORT || String(port), 10),
      databaseName: process.env.DSMART16_EOM_DB || 'DSMART16_EOM',
      username: process.env.DSMART16_EOM_USER || user,
      password: process.env.DSMART16_EOM_PASSWORD || password,
      encryptConn, trustServerCert
    }
  };
}

// Tạo mới hoặc cập nhật 1 etl.DataSources theo Name — trả về Id. Mật khẩu
// LUÔN mã hoá lại (đơn giản hơn giữ nguyên mật khẩu cũ khi sửa — script này
// chỉ chạy tay, không phải form người dùng gõ dở).
async function upsertDataSource(pool, cfg) {
  const existing = await pool.request().input('name', sql.NVarChar(200), cfg.name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  const passwordEncrypted = encrypt(cfg.password);
  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, id)
      .input('server', sql.NVarChar(200), cfg.server)
      .input('port', sql.Int, cfg.port)
      .input('databaseName', sql.NVarChar(100), cfg.databaseName)
      .input('username', sql.NVarChar(100), cfg.username)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('encryptConn', sql.Bit, cfg.encryptConn ? 1 : 0)
      .input('trustServerCert', sql.Bit, cfg.trustServerCert ? 1 : 0)
      .query(`
        UPDATE etl.DataSources SET
          Server = @server, Port = @port, DatabaseName = @databaseName, Username = @username,
          PasswordEncrypted = @passwordEncrypted, Encrypt = @encryptConn, TrustServerCert = @trustServerCert,
          IsActive = 1
        WHERE Id = @id
      `);
    console.log(`↻ Đã cập nhật Nguồn dữ liệu "${cfg.name}" (Id ${id}).`);
    return id;
  }
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
// lúc chạy thật mới lộ lỗi. Mirror assertTableConfigMatchesSchema trong
// routes/admin/syncJobs.js (không import lại route vì hàm đó không export).
async function assertViewReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(
      `Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${sourceName}" — tạo VIEW này trước ` +
      `(xem Bước 1, "báo cáo doanh thu cuối ngày.md") rồi chạy lại script.`
    );
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${tableName}" trên nguồn "${sourceName}" thiếu cột: ${missing.join(', ')} — đối chiếu lại câu CREATE VIEW.`);
  }
}

// Tạo mới hoặc cập nhật 1 etl.SyncJobs theo Name.
async function upsertSyncJob(pool, job) {
  const existing = await pool.request().input('name', sql.NVarChar(200), job.name)
    .query('SELECT Id FROM etl.SyncJobs WHERE Name = @name');
  const dimensionColumnsJson = JSON.stringify(job.dimensionColumns || []);
  const measureColumnsJson = JSON.stringify(job.measureColumns || []);
  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, id)
      .input('dataSourceId', sql.Int, job.dataSourceId)
      .input('sourceSchema', sql.NVarChar(100), 'dbo')
      .input('sourceTable', sql.NVarChar(100), job.sourceTable)
      .input('keyColumn', sql.NVarChar(100), job.keyColumn)
      .input('dateColumn', sql.NVarChar(100), job.dateColumn)
      .input('updatedAtColumn', sql.NVarChar(100), job.dateColumn)
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
    .input('updatedAtColumn', sql.NVarChar(100), job.dateColumn)
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

  const liveId = await upsertDataSource(pool, config.live);
  const eomId = await upsertDataSource(pool, config.eom);

  const jobs = [
    {
      name: 'Doanh thu chi nhánh - Live (DSMART16)', dataSourceId: liveId, sourceName: config.live.name,
      sourceTable: DOANHTHU_VIEW, keyColumn: 'STK_ID', dateColumn: 'WORK_DATE',
      dimensionColumns: ['dienTich', 'chain'], measureColumns: ['doanhThu', 'laiGop'],
      targetDomain: 'doanhthu_chinhanh', cronExpression: '*/15 * * * *'
    },
    {
      name: 'Doanh thu chi nhánh - Lịch sử (DSMART16_EOM)', dataSourceId: eomId, sourceName: config.eom.name,
      sourceTable: DOANHTHU_VIEW, keyColumn: 'STK_ID', dateColumn: 'WORK_DATE',
      dimensionColumns: ['dienTich', 'chain'], measureColumns: ['doanhThu', 'laiGop'],
      targetDomain: 'doanhthu_chinhanh', cronExpression: '0 3 * * *'
    },
    // keyColumn: 'BU_ID' — GIỮ NGUYÊN làm entityCode, KHÔNG dịch qua
    // etl.BranchCodeMap nữa (bỏ hẳn tính năng đó — xem VERSION.md): BU_ID
    // không đổi qua thời gian và CHÍNH LÀ mã "Điểm" (etl.DiemStkMapping.MaDiem).
    {
      name: 'Giao dịch chi nhánh - Live (DSMART16)', dataSourceId: liveId, sourceName: config.live.name,
      sourceTable: GIAODICH_VIEW, keyColumn: 'BU_ID', dateColumn: 'TRAN_DATE',
      dimensionColumns: [], measureColumns: ['SoGiaoDich'],
      targetDomain: 'giaodich_chinhanh', cronExpression: '*/15 * * * *'
    },
    {
      name: 'Giao dịch chi nhánh - Lịch sử (DSMART16_EOM)', dataSourceId: eomId, sourceName: config.eom.name,
      sourceTable: GIAODICH_VIEW, keyColumn: 'BU_ID', dateColumn: 'TRAN_DATE',
      dimensionColumns: [], measureColumns: ['SoGiaoDich'],
      targetDomain: 'giaodich_chinhanh', cronExpression: '0 3 * * *'
    }
  ];

  // Kiểm tra ĐỦ CẢ 4 job trước khi ghi bất kỳ job nào — "return" ngay sau
  // process.exit(1) (không chỉ gọi rồi đi tiếp) để không lỡ tạo nửa vời
  // nếu process.exit từng bị thay thế (test) hoặc hành vi runtime khác đi.
  for (const job of jobs) {
    const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
    try {
      await assertViewReady(job.dataSourceId, job.sourceName, job.sourceTable, requiredColumns);
    } catch (err) {
      console.error(`⛔ ${err.message}`);
      process.exit(1);
      return;
    }
  }
  for (const job of jobs) {
    await upsertSyncJob(pool, job);
  }

  console.log('');
  console.log('✅ Xong — 2 Nguồn dữ liệu + 4 job đồng bộ đã sẵn sàng.');
  console.log('   Nhớ khai bảng "Ánh xạ mã chi nhánh" (Loại mã "BU_ID") TRƯỚC khi 2 job Giao dịch chạy thật —');
  console.log('   xem etl-admin → menu "Ánh xạ mã chi nhánh" — thiếu vẫn chạy được, chỉ ghi cảnh báo ở Log.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
