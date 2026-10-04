// scripts/seedThanhVienLiveSync.js — Tạo/CẬP NHẬT idempotent 34 "Nguồn dữ
// liệu" (1/cửa hàng "Thành viên") + 68 Sync Job Live (2/cửa hàng: Doanh thu
// + Giao dịch) — bản 8.15, xem đầy đủ kiến trúc ở "báo cáo doanh thu thành
// viên.md". Danh sách STORES bên dưới điền ĐÚNG 34 cửa hàng thật (tên +
// Server/IP lấy từ file Excel "Nguồn dữ liệu" người dùng gửi,
// mau-nguon-du-lieu-1.xlsx) — CHUNG 1 Port cố định DEFAULT_PORT (người
// dùng xác nhận chỉ dùng 1 port duy nhất cho mọi siêu thị, KHÔNG dùng port
// riêng từng dòng như trong file Excel gốc), cùng chung Username/Password/
// DatabaseName/Encrypt/TrustServerCert (xem DEFAULT_* bên dưới).
//
// CHẠY FILE NÀY THAY CHO CÁCH NHẬP EXCEL 2 LẦN (Nguồn dữ liệu rồi Sync Job)
// Ở ETL-ADMIN — làm đúng cả 2 việc trong 1 lệnh. VẪN PHẢI hoàn tất "Bước 1"
// ("báo cáo doanh thu thành viên.md" — chạy file
// `deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành
// viên.sql` tại CẢ 34 máy chủ SQL Server của từng siêu thị) TRƯỚC khi chạy
// file này — thiếu VIEW thì Nguồn dữ liệu vẫn được tạo nhưng Sync Job của
// đúng siêu thị đó sẽ bị BỎ QUA (xem log khi chạy), tự chạy lại file này
// sau khi tạo xong VIEW (an toàn chạy lại nhiều lần, không tạo trùng).
//
// LƯU Ý BẢO MẬT: file này chứa mật khẩu CSDL thật dạng chữ thường — KHÔNG
// lưu vào Git, KHÔNG gửi qua kênh không an toàn (đúng quy ước đã áp dụng
// cho 2 file Excel nguồn, xem "báo cáo doanh thu thành viên.md").
const DEFAULT_PORT = 1433; // CHUNG cho mọi siêu thị (người dùng xác nhận chỉ dùng 1 port cố định)
const DEFAULT_DATABASE = 'DSMART16';
const DEFAULT_USERNAME = 'etl_reader';
const DEFAULT_PASSWORD = 'Brg@123456a@';
const DEFAULT_ENCRYPT = false;
const DEFAULT_TRUST_SERVER_CERT = false;

// 34 siêu thị thật — tên/IP lấy ĐÚNG nguyên văn từ file Excel "Nguồn dữ
// liệu" người dùng gửi (sheet "Nguon du lieu"). Port/Password/Username/
// DatabaseName dùng chung DEFAULT_* ở trên (CHUNG 1 port cố định theo
// người dùng xác nhận, không dùng cột Port riêng từng dòng trong file
// Excel gốc — nếu sau này có cửa hàng khác port/mật khẩu/username, thêm
// field port/password/username riêng vào object dòng đó, xem
// upsertDataSource()).
const STORES = [
  { name: 'BRGMart 120 Hàng Trống', server: '172.16.74.11' },
  { name: 'BRGMart Nguyễn Văn Cừ', server: '172.16.74.12' },
  { name: 'BRGMart Hải Dương', server: '172.16.74.14' },
  { name: 'BRGMart Phố Nối', server: '172.16.74.16' },
  { name: 'BRGMart Hải Phòng', server: '172.16.74.20' },
  { name: 'BRGMart C12 Thanh Xuân', server: '172.16.74.24' },
  { name: 'BRGMart 13 Thành Công', server: '172.16.74.28' },
  { name: 'HaproFood 135 Lương Định Của', server: '172.16.74.30' },
  { name: 'HaproFood G3 Vĩnh Phúc', server: '172.16.74.29' },
  { name: 'BRGMart 5 Hàm Tử Quan', server: '172.16.74.42' },
  { name: 'HaproFood 198 Lò Đúc', server: '172.16.74.45' },
  { name: 'HaproFood N4C Trung Hoà', server: '172.16.74.48' },
  { name: 'HaproFood Chợ Bưởi', server: '172.16.74.49' },
  { name: 'HaproFood 160-162 Ngõ Thái Thịnh I', server: '172.16.74.58' },
  { name: 'BRGMart Moonlight', server: '172.16.74.59' },
  { name: 'HaproFood 83 Nguyễn An Ninh', server: '172.16.74.60' },
  { name: 'BRGMart 63 Hàng Trống', server: '172.16.74.73' },
  { name: 'HaproFood 105 Lê Duẩn', server: '172.16.74.80' },
  { name: 'BRGMart Mạo Khê', server: '172.16.74.82' },
  { name: 'HaproFood 362 Ngọc Lâm', server: '172.16.74.91' },
  { name: 'HaproFood Ecohome3', server: '172.16.74.92' },
  { name: 'BRGMart N16 Sài đồng', server: '172.16.74.93' },
  { name: 'BRGMart Intracom Đông Anh', server: '172.16.74.94' },
  { name: 'HaproFood 9-11 Thổ Quan', server: '172.16.74.98' },
  { name: 'HaproFood 9 Lê Quý Đôn', server: '172.16.74.99' },
  { name: 'HaproFood 24 Trần Nhật Duật', server: '172.16.74.100' },
  { name: 'BRGMart L4 Sài Đồng', server: '172.16.74.103' },
  { name: 'BRGMart 53D Hàng Bài', server: '172.16.74.104' },
  { name: 'BrgMart Đồ Sơn Hải Phòng', server: '172.16.74.105' },
  { name: 'BRGMart 8 Phạm Ngọc Thạch', server: '172.16.74.33' },
  { name: 'BRGMart 1 Lý Nam Đế', server: '172.16.74.35' },
  { name: 'BRGMart 275 Nguyễn Trãi', server: '172.16.74.36' },
  { name: 'HaproFood 96 Tô Ngọc Vân', server: '172.16.74.37' },
  { name: 'HaproFood 98 Tô Ngọc Vân', server: '172.16.74.38' }
];
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
  const passwordEncrypted = encrypt(cfg.password || DEFAULT_PASSWORD);
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
    console.log(`⚠️ ${skipped.length} job BỊ BỎ QUA (chưa kết nối được/chưa có VIEW — sửa xong rồi chạy lại file này, an toàn chạy lại nhiều lần):`);
    skipped.forEach(s => console.log(`   - ${s}`));
  }
  console.log('Nhớ chạy tiếp (nếu chưa chạy lần nào): node ../rp-server/scripts/seedLdtdHcrcReports.js và');
  console.log('node ../rp-server/scripts/seedThanhVienReportPermissions.js.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
