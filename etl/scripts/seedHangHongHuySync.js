// scripts/seedHangHongHuySync.js — Tạo/CẬP NHẬT idempotent job đồng bộ
// "Hàng hỏng hủy theo ngành hàng" (Live DSMART16) cho báo cáo "Doanh thu,
// lãi gộp theo ngành hàng" (BRGMART) — bản 9.63, theo yêu cầu người dùng.
// Tái dùng NGUYÊN VẸN "Nguồn dữ liệu" đã có sẵn từ seedLdtdHcrcSync.js
// ("DSMART16 - Live"), KHÔNG tạo nguồn dữ liệu mới. Domain MỚI hoàn toàn
// (`hanghonghuy_nganhhang`), độc lập với `doanhthu_nganhhang` đã có.
//
// NGUỒN (người dùng cung cấp trực tiếp): VIEW `V_HCRC_HANGHONGHUY_NGANHHANG`
// trên CSDL `DSMART16` (Live) — cột `NganhHang` (TÊN ngành hàng, KHÔNG phải
// mã — khớp theo TÊN với TenNganhHang của domain doanhthu_nganhhang, xem
// lib/nganhHangBrgRunner.js phía rp-server), `GiaTriHongHuy`, `NgayGhiNhan`.
// KHÔNG có cột kho/siêu thị nào — giá trị hỏng hủy CHỈ có ở mức TOÀN HỆ
// THỐNG, không tách được riêng theo từng siêu thị/khối LFL/NSO (đã xác
// nhận với người dùng).
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần (cần sẵn "Nguồn dữ
//      liệu" "DSMART16 - Live" — script này DỪNG LẠI báo lỗi rõ ràng nếu
//      chưa có).
//   2. VIEW `V_HCRC_HANGHONGHUY_NGANHHANG` đã tồn tại trên CSDL DSMART16
//      (Live) — theo thông tin người dùng cung cấp.
//
// Cách dùng:
//   node scripts/seedHangHongHuySync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'V_HCRC_HANGHONGHUY_NGANHHANG';

async function findDataSourceId(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!result.recordset.length) {
    console.error(`⛔ Chưa có Nguồn dữ liệu "${name}" — chạy "node scripts/seedLdtdHcrcSync.js" trước (tạo sẵn Nguồn dữ liệu DSMART16 Live).`);
    process.exit(1);
  }
  return result.recordset[0].Id;
}

// Đối chiếu VIEW + cột cần dùng với schema THẬT của nguồn — xem chú thích
// đầy đủ ở seedLdtdHcrcSync.js:assertViewReady() (mirror y hệt).
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
  const pool = await getPool('ADMIN');
  const liveId = await findDataSourceId(pool, 'DSMART16 - Live');

  const job = {
    name: 'Hàng hỏng hủy theo ngành hàng - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
    sourceTable: VIEW_NAME, keyColumn: 'NganhHang', dateColumn: 'NgayGhiNhan',
    dimensionColumns: [], measureColumns: ['GiaTriHongHuy'],
    targetDomain: 'hanghonghuy_nganhhang', cronExpression: '*/15 * * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, ...job.measureColumns];
  try {
    await assertViewReady(job.dataSourceId, job.sourceName, job.sourceTable, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, job);

  console.log('');
  console.log('✅ Xong — job đồng bộ "Hàng hỏng hủy theo ngành hàng" đã sẵn sàng.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
