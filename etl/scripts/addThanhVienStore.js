// scripts/addThanhVienStore.js — Thêm ĐÚNG 1 siêu thị Thành viên mới (không
// đụng tới 34 siêu thị đã có trong scripts/seedThanhVienLiveSync.js) — theo
// yêu cầu người dùng, khi có thêm 1 cửa hàng mới muốn đồng bộ ngay mà không
// phải sửa mảng STORES rồi chạy lại cả file cũ (dù file đó VẪN AN TOÀN chạy
// lại nhiều lần — idempotent theo Name, không tạo trùng/không ảnh hưởng 34
// siêu thị cũ). Script này làm ĐÚNG 2 việc giống hệt 1 phần tử của STORES
// trong file kia (tạo/cập nhật 1 Nguồn dữ liệu + 2 Sync Job Live Doanh
// thu+Giao dịch) — cùng DEFAULT_*/DOANHTHU_VIEW/GIAODICH_VIEW/LIVE_CRON,
// KHÔNG lệch cấu hình so với 34 siêu thị đã tạo trước.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY (giống hệt 34 siêu thị cũ — xem "báo cáo doanh
// thu thành viên.md" Bước 1): đã chạy file
// `deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành
// viên.sql` TRÊN ĐÚNG MÁY CHỦ SQL Server của siêu thị mới này — thiếu VIEW
// thì Nguồn dữ liệu vẫn được tạo nhưng 2 Sync Job sẽ bị BỎ QUA (báo lỗi rõ
// trong log), chạy lại script này sau khi tạo xong VIEW là được (an toàn
// chạy lại nhiều lần, không tạo trùng).
//
// Cách dùng:
//   node scripts/addThanhVienStore.js "Tên siêu thị" "IP hoặc tên server"
// Vd:
//   node scripts/addThanhVienStore.js "BRGMart Núi Trúc" "172.16.74.110"
//
// Tuỳ chọn (CHỈ cần khi siêu thị này khác mặc định — port/username/password/
// database/encrypt/trustServerCert — xem DEFAULT_* trong
// seedThanhVienLiveSync.js, mọi siêu thị cũ đều dùng chung mặc định đó):
//   node scripts/addThanhVienStore.js "Tên siêu thị" "IP" --port=1434 --username=etl_reader2 --password="Mật khẩu riêng" --database=DSMART16_B --encrypt=true --trustServerCert=true
//
// SAU KHI script này chạy xong, NHỚ thêm thủ công đúng 1 dòng
// `{ name: '...', server: '...' }` vào mảng STORES trong
// scripts/seedThanhVienLiveSync.js (commit vào git) — để nếu sau này có ai
// chạy lại file đó (vd set up môi trường mới), siêu thị này vẫn được tạo
// đầy đủ, không chỉ tồn tại ở CSDL hiện tại mà "biến mất" khỏi code.
require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const schemaBrowser = require('../lib/schemaBrowser');

const DEFAULT_PORT = 1433;
const DEFAULT_DATABASE = 'DSMART16';
const DEFAULT_USERNAME = 'etl_reader';
const DEFAULT_PASSWORD = 'Brg@123456a@';
const DEFAULT_ENCRYPT = false;
const DEFAULT_TRUST_SERVER_CERT = false;

const DOANHTHU_VIEW = 'V_HCRC_DOANHTHU_CHINHANH';
const GIAODICH_VIEW = 'V_HCRC_GIAODICH_CHINHANH';
const LIVE_CRON = '*/2 * * * *';

function parseArgs(argv) {
  const positional = argv.filter(a => !a.startsWith('--'));
  if (positional.length < 2) {
    console.error('⛔ Thiếu tham số. Cách dùng: node scripts/addThanhVienStore.js "Tên siêu thị" "IP hoặc tên server" [--port=1433] [--username=etl_reader] [--password="..."] [--database=DSMART16] [--encrypt=true] [--trustServerCert=true]');
    process.exit(1);
  }
  const [name, server] = positional;
  const opt = {};
  for (const a of argv) {
    const m = a.match(/^--([a-zA-Z]+)=(.*)$/);
    if (m) opt[m[1]] = m[2];
  }
  return {
    name,
    server,
    port: opt.port ? parseInt(opt.port, 10) : DEFAULT_PORT,
    database: opt.database || DEFAULT_DATABASE,
    username: opt.username || DEFAULT_USERNAME,
    password: opt.password || DEFAULT_PASSWORD,
    encrypt: opt.encrypt !== undefined ? opt.encrypt === 'true' : DEFAULT_ENCRYPT,
    trustServerCert: opt.trustServerCert !== undefined ? opt.trustServerCert === 'true' : DEFAULT_TRUST_SERVER_CERT
  };
}

function dataSourceName(store) {
  return `DSMART16 - ${store.name}`;
}

// Mirror y hệt upsertDataSource() ở seedThanhVienLiveSync.js.
async function upsertDataSource(pool, cfg) {
  const name = dataSourceName(cfg);
  const existing = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  const passwordEncrypted = encrypt(cfg.password);
  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, id)
      .input('server', sql.NVarChar(200), cfg.server)
      .input('port', sql.Int, cfg.port)
      .input('databaseName', sql.NVarChar(100), cfg.database)
      .input('username', sql.NVarChar(100), cfg.username)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('encryptConn', sql.Bit, cfg.encrypt ? 1 : 0)
      .input('trustServerCert', sql.Bit, cfg.trustServerCert ? 1 : 0)
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
    .input('port', sql.Int, cfg.port)
    .input('databaseName', sql.NVarChar(100), cfg.database)
    .input('username', sql.NVarChar(100), cfg.username)
    .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
    .input('encryptConn', sql.Bit, cfg.encrypt ? 1 : 0)
    .input('trustServerCert', sql.Bit, cfg.trustServerCert ? 1 : 0)
    .query(`
      INSERT INTO etl.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert)
      OUTPUT INSERTED.Id
      VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert)
    `);
  return { id: result.recordset[0].Id, created: true };
}

async function assertViewReady(dataSourceId, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`không tìm thấy VIEW "dbo.${tableName}" — chạy "deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành viên.sql" tại cửa hàng này trước.`);
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${tableName}" thiếu cột: ${missing.join(', ')}.`);
  }
}

// Mirror y hệt upsertSyncJob() ở seedThanhVienLiveSync.js.
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
  const store = parseArgs(process.argv.slice(2));
  const pool = await getPool('ADMIN');

  const { id: dataSourceId, created } = await upsertDataSource(pool, store);
  console.log(`${created ? '✅ Tạo' : '↻ Cập nhật'} Nguồn dữ liệu "${dataSourceName(store)}" (Id ${dataSourceId}).`);

  const jobs = buildJobsForStore(store, dataSourceId);
  const skipped = [];
  for (const job of jobs) {
    const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
    try {
      await assertViewReady(dataSourceId, job.sourceTable, requiredColumns);
    } catch (err) {
      console.warn(`  ⚠️ Bỏ qua job "${job.name}": ${err.message}`);
      skipped.push(`${job.name}: ${err.message}`);
      continue;
    }
    const { id: jobId, created: jobCreated } = await upsertSyncJob(pool, job);
    console.log(`  ${jobCreated ? '✅ Tạo' : '↻ Cập nhật'} job "${job.name}" (Id ${jobId}).`);
  }

  console.log('');
  if (skipped.length) {
    console.log('⚠️ Có job bị bỏ qua — tạo xong VIEW tại siêu thị này rồi chạy lại ĐÚNG LỆNH NÀY (an toàn chạy lại nhiều lần):');
    skipped.forEach(s => console.log(`   - ${s}`));
  } else {
    console.log('✅ Xong — nhớ thêm siêu thị này vào mảng STORES trong scripts/seedThanhVienLiveSync.js (commit git) để không bị "quên" nếu sau này setup lại môi trường.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
