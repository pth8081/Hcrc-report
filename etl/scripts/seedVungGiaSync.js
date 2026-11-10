// scripts/seedVungGiaSync.js — Tạo/CẬP NHẬT idempotent 1 job đồng bộ nhỏ
// "Vùng giá theo siêu thị" (bản 10.71+, theo yêu cầu người dùng — API
// "Giá bán" cần biết mỗi siêu thị (STK_ID) thuộc vùng giá nào (ZONE_CODE,
// xem dbo.RTPRICE/dbo.STOCK) để tra đúng giá, KHÔNG được chạm DSMART16
// trực tiếp mỗi lần đối tác gọi API — xem "api-gia-ban-cho-doi-tac.md").
//
// Đồng bộ TRỰC TIẾP từ dbo.STOCK (bảng gốc đã dùng ở VIEW Tồn kho —
// STK_NAME_U), KHÔNG cần tạo VIEW riêng (chỉ cần đúng 2 cột STK_ID,
// ZONE_CODE, không JOIN gì thêm). Bảng nhỏ (~34 dòng, xem hội thoại điều
// tra), đồng bộ NHANH mỗi lượt.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1
// lần (cần sẵn Nguồn dữ liệu "DSMART16 - Live").
//
// Cách dùng:
//   node scripts/seedVungGiaSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const TABLE_NAME = 'STOCK';
const DOMAIN = 'vung_gia_stk';

async function findDataSourceId(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!result.recordset.length) {
    console.error(`⛔ Chưa có Nguồn dữ liệu "${name}" — chạy "node scripts/seedLdtdHcrcSync.js" trước (tạo sẵn Nguồn dữ liệu DSMART16 Live).`);
    process.exit(1);
  }
  return result.recordset[0].Id;
}

async function assertTableReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`Không tìm thấy bảng "dbo.${tableName}" trên nguồn "${sourceName}".`);
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`Bảng "dbo.${tableName}" trên nguồn "${sourceName}" thiếu cột: ${missing.join(', ')}.`);
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
    name: 'Vùng giá theo siêu thị - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
    sourceTable: TABLE_NAME, keyColumn: 'STK_ID', dateColumn: 'MODI_DATE',
    dimensionColumns: ['ZONE_CODE'],
    measureColumns: [],
    targetDomain: DOMAIN, cronExpression: '*/15 * * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns];
  try {
    await assertTableReady(job.dataSourceId, job.sourceName, job.sourceTable, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, job);

  console.log('');
  console.log('✅ Xong — job đồng bộ "Vùng giá theo siêu thị" đã sẵn sàng.');
  console.log('   Tiếp theo: node ../etl/scripts/seedGiaBanSync.js (cần Nguồn dữ liệu đã có sẵn)');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
