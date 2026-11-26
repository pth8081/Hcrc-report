// scripts/seedTonKhoGtriNganhHangSync.js — Tạo/CẬP NHẬT idempotent 1 job
// đồng bộ (Tồn kho Giá trị theo Ngành hàng, Live DSMART16) cho báo cáo mới
// "DIO theo ngành hàng" (nhóm Báo cáo vận hành, bản 11.32, theo yêu cầu
// người dùng — xem phương án 4 báo cáo vận hành đã gửi, ưu tiên 1). Tái
// dùng NGUYÊN VẸN "Nguồn dữ liệu" đã có sẵn từ seedLdtdHcrcSync.js
// ("DSMART16 - Live"), KHÔNG tạo nguồn dữ liệu mới. Domain MỚI hoàn toàn
// (`tonkho_gtri_nganhhang`), độc lập với `tonkho_sku`/`tonkho_chitiet_sku`
// đã có (không đụng tới báo cáo nào khác).
//
// KeepHistory = 0 (GHI ĐÈ, không giữ lịch sử) — ĐÚNG nghiệp vụ "tồn kho
// tính tại thời điểm" (giống domain `tonkho_chitiet_sku`, xem lý do đầy đủ
// ở bc-ton-kho-chi-tiet.md mục 6) — KHÔNG lặp lại lỗi "giữ lịch sử mỗi
// ngày" đã gặp ở domain đó trước bản 10.61 (phình lên hàng triệu dòng).
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần (cần sẵn Nguồn dữ
//      liệu "DSMART16 - Live" — script này DỪNG LẠI báo lỗi rõ ràng nếu
//      chưa có).
//   2. Đã tạo xong VIEW `V_HCRC_TONKHO_NGANHHANG` trên CSDL `DSMART16` —
//      xem "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Tồn kho Giá
//      trị theo Ngành hàng (DSMART16).sql".
//
// Cách dùng:
//   node scripts/seedTonKhoGtriNganhHangSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'V_HCRC_TONKHO_NGANHHANG';
const DOMAIN = 'tonkho_gtri_nganhhang';

async function findDataSourceId(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!result.recordset.length) {
    console.error(`⛔ Chưa có Nguồn dữ liệu "${name}" — chạy "node scripts/seedLdtdHcrcSync.js" trước (tạo sẵn Nguồn dữ liệu DSMART16 Live).`);
    process.exit(1);
  }
  return result.recordset[0].Id;
}

// Đối chiếu VIEW + cột cần dùng với schema THẬT của nguồn — mirror
// seedLdtdHcrcSync.js:assertViewReady().
async function assertViewReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${sourceName}" — tạo VIEW này trước rồi chạy lại script.`);
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${tableName}" trên nguồn "${sourceName}" thiếu cột: ${missing.join(', ')} — đối chiếu lại câu CREATE VIEW.`);
  }
}

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
          TargetDomain = @targetDomain, CronExpression = @cronExpression, KeepHistory = 0,
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
        @dimensionColumnsJson, @measureColumnsJson, @targetDomain, @cronExpression, 0
      )
    `);
  const id = result.recordset[0].Id;
  console.log(`✅ Đã tạo job "${job.name}" (Id ${id}) — scheduler nạp lại trong tối đa 60 giây, không cần khởi động lại ETL.`);
  return id;
}

async function main() {
  const pool = await getPool('ADMIN');
  const liveId = await findDataSourceId(pool, 'DSMART16 - Live');

  const job = {
    name: 'Tồn kho Giá trị theo Ngành hàng - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
    sourceTable: VIEW_NAME, keyColumn: 'MaThucThe', dateColumn: 'EventDate',
    dimensionColumns: ['STK_ID', 'DEPT_ID', 'TenNganhHang'],
    measureColumns: ['GiaTriTon'],
    targetDomain: DOMAIN, cronExpression: '0 */4 * * *' // 4 giờ/lần — tồn kho giá trị không cần cập nhật theo phút như doanh thu, giảm tải nguồn.
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
  try {
    await assertViewReady(job.dataSourceId, job.sourceName, job.sourceTable, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, job);

  console.log('');
  console.log('✅ Xong — job đồng bộ (tonkho_gtri_nganhhang) đã sẵn sàng.');
  console.log('   Bước tiếp theo: node rp-server/scripts/seedDioNganhHangReport.js để đăng ký báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
