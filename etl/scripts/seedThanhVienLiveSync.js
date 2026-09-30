// scripts/seedThanhVienLiveSync.js — Tạo/CẬP NHẬT idempotent 35 "Nguồn dữ
// liệu" (1/cửa hàng "Thành viên") + tối đa 70 Sync Job Live (2/cửa hàng:
// Doanh thu + Giao dịch) — bản 8.15, xem đầy đủ kiến trúc ở "báo cáo doanh
// thu thành viên.md". Thay cho việc bấm tay 35 lần qua etl-admin.
//
// ============================================================================
// SỬA DANH SÁCH `STORES` NGAY DƯỚI ĐÂY TRƯỚC KHI CHẠY — điền đúng:
//   name     Tên cửa hàng THẬT (dùng để đặt tên Nguồn dữ liệu/Sync Job, KHÔNG
//            ảnh hưởng dữ liệu báo cáo — VIEW tại mỗi cửa hàng tự trả đúng
//            STK_ID/BU_ID của nó, xem "báo cáo doanh thu thành viên.md").
//   server   Địa chỉ SQL Server tại cửa hàng đó (IP hoặc tên máy chủ).
//   password Mật khẩu tài khoản `etl_reader` tại cửa hàng đó.
// Username CỐ ĐỊNH "etl_reader" cho cả 35 dòng (theo đúng yêu cầu người
// dùng — tài khoản CHỈ ĐỌC dùng chung quy ước, không phải sudo/admin CSDL).
// port/database/encrypt/trustServerCert dùng chung mặc định bên dưới —
// sửa riêng từng dòng nếu có cửa hàng khác cổng/tên CSDL.
// ============================================================================
const DEFAULT_PORT = 1433;
const DEFAULT_DATABASE = 'DSMART16';
const DEFAULT_USERNAME = 'etl_reader';
const DEFAULT_ENCRYPT = true;
const DEFAULT_TRUST_SERVER_CERT = false;

const STORES = Array.from({ length: 35 }, (_, i) => ({
  name: `CHANGE_ME - Cửa hàng ${String(i + 1).padStart(2, '0')}`, // TODO: đổi tên thật
  server: 'CHANGE_ME_IP',                                          // TODO: đổi IP/tên máy chủ thật
  password: 'CHANGE_ME_PASSWORD'                                   // TODO: đổi mật khẩu thật
  // port, database, username, encrypt, trustServerCert: để trống dùng mặc
  // định ở trên — thêm field riêng vào object này nếu 1 cửa hàng cần khác.
}));
// ============================================================================

require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const schemaBrowser = require('../lib/schemaBrowser');

const DOANHTHU_VIEW = 'V_HCRC_DOANHTHU_CHINHANH';
const GIAODICH_VIEW = 'V_HCRC_GIAODICH_CHINHANH';
const LIVE_CRON = '*/2 * * * *'; // rút ngắn hơn mặc định 15 phút — xem "báo cáo doanh thu thành viên.md" Bước 3

function dataSourceName(store) {
  return `DSMART16 - ${store.name}`;
}

// Mirror upsertDataSource() ở scripts/seedLdtdHcrcSync.js — mật khẩu LUÔN
// mã hoá lại (script chạy tay, không phải form người dùng gõ dở nên không
// cần giữ nguyên mật khẩu cũ khi sửa).
async function upsertDataSource(pool, cfg) {
  const name = dataSourceName(cfg);
  const existing = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  const passwordEncrypted = encrypt(cfg.password);
  const port = cfg.port || DEFAULT_PORT;
  const databaseName = cfg.database || DEFAULT_DATABASE;
  const username = cfg.username || DEFAULT_USERNAME;
  const encryptConn = cfg.encrypt !== undefined ? cfg.encrypt : DEFAULT_ENCRYPT;
  const trustServerCert = cfg.trustServerCert !== undefined ? cfg.trustServerCert : DEFAULT_TRUST_SERVER_CERT;

  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, id)
      .input('server', sql.NVarChar(200), cfg.server)
      .input('port', sql.Int, port)
      .input('databaseName', sql.NVarChar(100), databaseName)
      .input('username', sql.NVarChar(100), username)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('encryptConn', sql.Bit, encryptConn ? 1 : 0)
      .input('trustServerCert', sql.Bit, trustServerCert ? 1 : 0)
      .query(`
        UPDATE etl.DataSources SET
          Server = @server, Port = @port, DatabaseName = @databaseName, Username = @username,
          PasswordEncrypted = @passwordEncrypted, Encrypt = @encryptConn, TrustServerCert = @trustServerCert,
          IsActive = 1
        WHERE Id = @id
      `);
    return { id, created: false };
  }
  const result = await pool.request()
    .input('name', sql.NVarChar(200), name)
    .input('server', sql.NVarChar(200), cfg.server)
    .input('port', sql.Int, port)
    .input('databaseName', sql.NVarChar(100), databaseName)
    .input('username', sql.NVarChar(100), username)
    .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
    .input('encryptConn', sql.Bit, encryptConn ? 1 : 0)
    .input('trustServerCert', sql.Bit, trustServerCert ? 1 : 0)
    .query(`
      INSERT INTO etl.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert)
      OUTPUT INSERTED.Id
      VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert)
    `);
  return { id: result.recordset[0].Id, created: true };
}

// Mirror assertViewReady ở scripts/seedLdtdHcrcSync.js.
async function assertViewReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`không tìm thấy VIEW "dbo.${tableName}" — chạy Bước 1 ("báo cáo doanh thu thành viên.md") tại cửa hàng này trước.`);
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${tableName}" thiếu cột: ${missing.join(', ')}.`);
  }
}

// Mirror upsertSyncJob ở scripts/seedLdtdHcrcSync.js/seedThanhVienHistorySync.js.
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
          TargetDomain = @targetDomain, CronExpression = @cronExpression, KeepHistory = 1, IsActive = 1
        WHERE Id = @id
      `);
    return { id, created: false };
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
  return { id: result.recordset[0].Id, created: true };
}

function buildJobsForStore(store, dataSourceId) {
  return [
    {
      name: `Doanh thu (TV) - ${store.name}`, dataSourceId,
      sourceTable: DOANHTHU_VIEW, keyColumn: 'STK_ID', dateColumn: 'WORK_DATE',
      dimensionColumns: ['dienTich', 'chain'], measureColumns: ['doanhThu', 'laiGop'],
      targetDomain: 'doanhthu_chinhanh_thanhvien', cronExpression: LIVE_CRON
    },
    {
      name: `Giao dịch (TV) - ${store.name}`, dataSourceId,
      sourceTable: GIAODICH_VIEW, keyColumn: 'BU_ID', dateColumn: 'TRAN_DATE',
      dimensionColumns: [], measureColumns: ['SoGiaoDich'],
      targetDomain: 'giaodich_chinhanh_thanhvien', cronExpression: LIVE_CRON
    }
  ];
}

async function main() {
  const placeholderCount = STORES.filter(s => s.server === 'CHANGE_ME_IP' || s.password === 'CHANGE_ME_PASSWORD' || s.name.startsWith('CHANGE_ME')).length;
  if (placeholderCount === STORES.length) {
    console.error('⛔ Danh sách STORES ở đầu file vẫn còn nguyên giá trị CHANGE_ME — sửa tên/IP/mật khẩu thật cho từng cửa hàng rồi chạy lại.');
    process.exit(1);
    return;
  }
  if (placeholderCount > 0) {
    console.warn(`⚠️ Còn ${placeholderCount}/${STORES.length} cửa hàng chưa sửa (vẫn CHANGE_ME) — các cửa hàng này sẽ tạo Nguồn dữ liệu nhưng BỎ QUA tạo Sync Job (không kết nối được), tự chạy lại script sau khi sửa.`);
  }

  const pool = await getPool('ADMIN');

  let sourcesCreated = 0, sourcesUpdated = 0, jobsCreated = 0, jobsUpdated = 0;
  const skipped = [];

  for (const store of STORES) {
    const { id: dataSourceId, created } = await upsertDataSource(pool, store);
    if (created) sourcesCreated++; else sourcesUpdated++;
    console.log(`${created ? '✅ Tạo' : '↻ Cập nhật'} Nguồn dữ liệu "${dataSourceName(store)}" (Id ${dataSourceId}).`);

    const jobs = buildJobsForStore(store, dataSourceId);
    for (const job of jobs) {
      const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
      try {
        await assertViewReady(dataSourceId, dataSourceName(store), job.sourceTable, requiredColumns);
      } catch (err) {
        console.warn(`  ⚠️ Bỏ qua job "${job.name}": ${err.message}`);
        skipped.push(`${job.name}: ${err.message}`);
        continue;
      }
      const { id: jobId, created: jobCreated } = await upsertSyncJob(pool, job);
      if (jobCreated) jobsCreated++; else jobsUpdated++;
      console.log(`  ${jobCreated ? '✅ Tạo' : '↻ Cập nhật'} job "${job.name}" (Id ${jobId}).`);
    }
  }

  console.log('');
  console.log(`✅ Xong — Nguồn dữ liệu: ${sourcesCreated} tạo mới, ${sourcesUpdated} cập nhật.`);
  console.log(`   Sync Job: ${jobsCreated} tạo mới, ${jobsUpdated} cập nhật.`);
  if (skipped.length) {
    console.log(`⚠️ ${skipped.length} job BỊ BỎ QUA (chưa kết nối được — sửa lại danh sách STORES rồi chạy lại file này, an toàn chạy lại nhiều lần):`);
    skipped.forEach(s => console.log(`   - ${s}`));
  }
  console.log('Nhớ chạy tiếp: node ../rp-server/scripts/seedLdtdHcrcReports.js và');
  console.log('node ../rp-server/scripts/seedThanhVienReportPermissions.js nếu chưa chạy.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
