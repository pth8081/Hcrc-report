// scripts/seedGiaBanSync.js — Tạo/CẬP NHẬT idempotent job đồng bộ "Giá bán
// theo SKU" (bản 10.71+, theo yêu cầu người dùng — API tra giá thường +
// giá khuyến mại theo mã hàng cho nhiều app đối tác, vd BRG Scan and
// Checkout) — đọc VIEW `vw_GiaBanTheoSKU` (xem "deploy/VIEW DSMART16
// (trung tâm)/Thiết lập VIEW Giá bán theo SKU (DSMART16).sql"), ghi vào
// domain MỚI `giaban_zone_sku`.
//
// UpdatedAtColumn = CapNhatNguon (p.MODI_DATE thật của dbo.RTPRICE, CÓ GIỜ
// PHÚT GIÂY — khác EventDate chỉ có ngày) — cho đồng bộ TĂNG DẦN thật sự
// (chỉ lấy giá VỪA ĐỔI, không quét lại nguyên domain ~1 triệu dòng mỗi lần
// như "Tồn kho" phải làm, vì STK_INFO không có cột đổi mịn hơn ngày — xem
// "bc-ton-kho-chi-tiet.md"). Lần chạy ĐẦU TIÊN (watermark = EPOCH) vẫn quét
// hết toàn bộ RTPRICE 1 lần (backfill), các lần sau chỉ lấy đúng phần mới
// đổi trong ngày.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần.
//   2. Đã tạo xong VIEW `vw_GiaBanTheoSKU` trên CSDL `DSMART16` — xem
//      "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Giá bán theo SKU (DSMART16).sql".
//
// Cách dùng:
//   node scripts/seedGiaBanSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'vw_GiaBanTheoSKU';
const DOMAIN = 'giaban_zone_sku';

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
    throw new Error(`Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${sourceName}" — tạo VIEW này trước rồi chạy lại script (xem "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Giá bán theo SKU (DSMART16).sql").`);
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
    name: 'Giá bán theo SKU - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
    sourceTable: VIEW_NAME, keyColumn: 'MaThucThe', dateColumn: 'EventDate', updatedAtColumn: 'CapNhatNguon',
    dimensionColumns: ['MaVungGia', 'MaHangHienThi', 'TenHang', 'MaVach', 'CoKhuyenMai'],
    measureColumns: ['GiaThuong', 'GiaKhuyenMai'],
    targetDomain: DOMAIN, cronExpression: '*/15 * * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, job.updatedAtColumn, ...job.dimensionColumns, ...job.measureColumns];
  try {
    await assertViewReady(job.dataSourceId, job.sourceName, job.sourceTable, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, job);

  console.log('');
  console.log('✅ Xong — job đồng bộ "Giá bán theo SKU" đã sẵn sàng.');
  console.log('   LƯU Ý: lượt chạy ĐẦU TIÊN quét toàn bộ RTPRICE (~1 triệu dòng, lọc theo');
  console.log('   vùng hợp lệ) — có thể mất vài phút, các lượt sau chỉ lấy giá VỪA ĐỔI.');
  console.log('   Tiếp theo: node api-server/scripts/seedGiaBanReport.js');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
