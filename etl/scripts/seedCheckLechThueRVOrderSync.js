// scripts/seedCheckLechThueRVOrderSync.js — Tạo/CẬP NHẬT idempotent job
// đồng bộ cho báo cáo MỚI "Check lệch thuế RV_ORDER" (bản 10.80, theo yêu
// cầu người dùng, dựa trên file mẫu thật "Check_RV_ORDER...xlsx") — xem
// "bc-check-lech-thue-rvorder.md".
//
// updatedAtColumn = EventDate (KHÔNG dùng STOPED_DT) — theo ĐÚNG tiền lệ
// đã gặp ở domain `don_dat_hang` (cùng nguồn RV_ORDER/STRANS) — xem
// "etl/scripts/seedDonDatHangSync.js": `STOPED_DT` ra NULL HẾT khi test
// thật, dùng làm watermark sẽ khiến job không bao giờ đồng bộ được gì.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần.
//   2. Đã tạo xong VIEW `vw_CheckLechThueRVOrder` trên CSDL `DSMART16` —
//      xem "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Check lệch
//      thuế RV_ORDER (DSMART16 trung tâm).sql".
//
// Cách dùng:
//   node scripts/seedCheckLechThueRVOrderSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'vw_CheckLechThueRVOrder';
const DOMAIN = 'check_lech_thue_rvorder';

async function findDataSourceId(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!result.recordset.length) {
    console.error(`⛔ Chưa có Nguồn dữ liệu "${name}" — chạy "node scripts/seedLdtdHcrcSync.js" trước.`);
    process.exit(1);
  }
  return result.recordset[0].Id;
}

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
  const pool = await getPool('ADMIN');
  const liveId = await findDataSourceId(pool, 'DSMART16 - Live');

  const job = {
    name: 'Check lệch thuế RV_ORDER - Live (DSMART16)', dataSourceId: liveId,
    sourceTable: VIEW_NAME, keyColumn: 'MaThucThe', dateColumn: 'EventDate',
    dimensionColumns: ['SoChungTu', 'MaHang', 'MaHangHienThi', 'TenHang', 'MaNccNoiBo', 'TenNccNoiBo', 'MaNccThucGiao', 'TenNccThucGiao', 'MaThue'],
    measureColumns: ['TongGiaTri', 'GiaTriThue'],
    targetDomain: DOMAIN, cronExpression: '*/15 * * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
  try {
    await assertViewReady(job.dataSourceId, 'DSMART16 - Live', job.sourceTable, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, job);

  console.log('');
  console.log('✅ Xong — job đồng bộ "Check lệch thuế RV_ORDER" đã sẵn sàng.');
  console.log('   Chạy tiếp "node scripts/seedCheckLechThueRVOrderReport.js" (thư mục rp-server/) để tạo báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
