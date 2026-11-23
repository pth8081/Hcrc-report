// scripts/seedThayDoiGiaSync.js — Tạo/CẬP NHẬT idempotent 2 job đồng bộ cho
// báo cáo MỚI "Thay đổi giá bán tức thời"/"Thay đổi giá từ thời điểm" (bản
// 10.79, theo yêu cầu người dùng — dựa trên file mẫu thật "Price_Changes...
// xlsx", ghi chú ngay trong file chỉ rõ nguồn `HISRTPR`/`RTPRPRG").
//
// 2 domain HOÀN TOÀN TÁCH BIỆT (nguồn khác nhau, ý nghĩa nghiệp vụ khác
// nhau — "tức thời" = log thay đổi NGAY LÚC xảy ra; "từ thời điểm" = đợt
// thay đổi ĐƯỢC LÊN LỊCH TRƯỚC, áp dụng vào 1 ngày tương lai) — xem
// "bc-thay-doi-gia.md".
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần.
//   2. Đã tạo xong CẢ 2 VIEW `vw_ThayDoiGiaTucThoi`/`vw_ThayDoiGiaTuThoiDiem`
//      trên CSDL `DSMART16` — xem 2 file .sql tương ứng trong
//      "deploy/VIEW DSMART16 (trung tâm)/".
//
// Cách dùng:
//   node scripts/seedThayDoiGiaSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

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

const JOBS = [
  {
    name: 'Thay đổi giá bán tức thời - Live (DSMART16)', sourceTable: 'vw_ThayDoiGiaTucThoi',
    keyColumn: 'MaThucThe', dateColumn: 'EventDate', updatedAtColumn: 'ThoiDiemThayDoi',
    // MaNhomHang/DonVi thêm bản 10.84 (theo yêu cầu người dùng).
    // SỬA LỖI THẬT bản 11.21 (theo báo cáo người dùng — cột "Thời điểm
    // thay đổi" trên báo cáo LUÔN trống/hiện sai, chưa từng hoạt động từ
    // bản 10.79) — `ThoiDiemThayDoi` TRƯỚC ĐÂY chỉ khai làm updatedAtColumn
    // (mốc đồng bộ tăng dần, xem tableSyncEngine.js dòng 175: CHỈ cột nằm
    // trong dimensionColumns mới được ghi vào Dimensions JSON) — 1 cột HOÀN
    // TOÀN CÓ THỂ vừa làm updatedAtColumn VỪA nằm trong dimensionColumns
    // (2 mục đích đọc riêng biệt, không xung đột) — thêm vào đây để báo
    // cáo đọc được giá trị thật. Dữ liệu đã đồng bộ TRƯỚC bản này cần
    // resync lại mới có — xem scripts/resyncThayDoiGiaWatermark.js.
    dimensionColumns: ['MaVungGia', 'MaHangHienThi', 'TenHang', 'MaNganhHang', 'TenNganhHang', 'MaNhomHang', 'DonVi', 'ThoiDiemThayDoi'],
    measureColumns: ['GiaCu', 'GiaMoi'],
    targetDomain: 'thaydoigia_tucthoi', cronExpression: '*/15 * * * *'
  },
  {
    name: 'Thay đổi giá từ thời điểm - Live (DSMART16)', sourceTable: 'vw_ThayDoiGiaTuThoiDiem',
    keyColumn: 'MaThucThe', dateColumn: 'EventDate', updatedAtColumn: 'CapNhatLuc',
    // SỬA LỖI THẬT bản 11.21 — cùng lý do với `ThoiDiemThayDoi` ở job trên
    // (xem chú thích đầy đủ ở đó): `CapNhatLuc` ("Lên lịch lúc") trước đây
    // CHỈ làm updatedAtColumn, chưa từng được ghi vào Dimensions JSON.
    dimensionColumns: ['MaVungGia', 'MaHangHienThi', 'TenHang', 'MaNganhHang', 'TenNganhHang', 'NgayApDung', 'MaDotThayDoi', 'MoTaDot', 'CapNhatLuc'],
    measureColumns: ['GiaCu', 'GiaMoi'],
    targetDomain: 'thaydoigia_tuthoidiem', cronExpression: '*/15 * * * *'
  }
];

async function main() {
  const pool = await getPool('ADMIN');
  const liveId = await findDataSourceId(pool, 'DSMART16 - Live');

  for (const job of JOBS) {
    job.dataSourceId = liveId;
    const requiredColumns = [job.keyColumn, job.dateColumn, job.updatedAtColumn, ...job.dimensionColumns, ...job.measureColumns];
    try {
      await assertViewReady(job.dataSourceId, 'DSMART16 - Live', job.sourceTable, requiredColumns);
    } catch (err) {
      console.error(`⛔ ${err.message}`);
      process.exit(1);
      return;
    }
    await upsertSyncJob(pool, job);
  }

  console.log('');
  console.log('✅ Xong — cả 2 job đồng bộ "Thay đổi giá" đã sẵn sàng.');
  console.log('   Chạy tiếp "node scripts/seedThayDoiGiaReports.js" (thư mục rp-server/) để tạo 2 báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
