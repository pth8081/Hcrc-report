// scripts/seedHoaDonKhoangGiaSync.js — Tạo/CẬP NHẬT idempotent job đồng bộ
// (Hoá đơn theo khoảng giá trị, Live DSMART16) cho "Báo cáo khách hàng
// theo tuần" (bc-khach-hang-theo-tuan) — bản 11.47, theo yêu cầu đội MKT,
// bổ sung thêm 2 nhóm 14 khoảng x 2 cột (Số lượng/Giá trị) đếm hoá đơn
// (bill) theo khoảng giá trị, 1 nhóm TẤT CẢ giao dịch + 1 nhóm CHỈ giao
// dịch qua thẻ BRG Elite/app BRGMart.
//
// Tái dùng NGUYÊN VẸN "Nguồn dữ liệu" "DSMART16 - Live" đã có sẵn từ
// seedLdtdHcrcSync.js — KHÔNG tạo nguồn dữ liệu mới.
//
// ⚠️ CHỈ "Live" (DSMART16 trung tâm) — KHÔNG làm "Lịch sử" (DSMART16_EOM):
// 2 nhóm cột này trong file mẫu CHỈ có 1 cột "W" (tuần này), không có
// W-1/LFL như các nhóm chỉ số khác của báo cáo này — không cần dữ liệu
// lịch sử năm trước.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần (cần sẵn Nguồn dữ
//      liệu "DSMART16 - Live" — script này DỪNG LẠI báo lỗi rõ ràng nếu
//      chưa có).
//   2. Đã tạo xong VIEW `V_HCRC_HOADON_KHOANGGIA_CHINHANH` trên CSDL
//      `DSMART16` — xem "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW
//      Hoá đơn theo khoảng giá trị (Script A, DSMART16).sql".
//
// Cách dùng:
//   node scripts/seedHoaDonKhoangGiaSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'V_HCRC_HOADON_KHOANGGIA_CHINHANH';
const TARGET_DOMAIN = 'hoadon_khoanggia_chinhanh';

// BUCKETS (bản 11.47) — mirror ĐÚNG 14 khoảng trong VIEW SQL (xem file
// .sql ở trên) — CHỈ dùng ở đây để sinh danh sách tên cột measure, KHÔNG
// lặp lại ngưỡng số (ngưỡng THẬT nằm trong VIEW, sửa 1 chỗ duy nhất nếu
// cần đổi — sửa cả đây lẫn VIEW nếu đổi TÊN cột).
const BUCKET_IDS = [
  'B50K', 'B100K', 'B150K', 'B200K', 'B250K', 'B300K', 'B350K', 'B400K',
  'B500K', 'B1Tr', 'B1Tr5', 'B2Tr', 'B3Tr', 'BTren3Tr'
];
const MEASURE_COLUMNS = BUCKET_IDS.flatMap((id) => [
  `${id}TotalSL`, `${id}TotalGT`, `${id}TheSL`, `${id}TheGT`
]);

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
// seedDoanhThuSkuNganhHangSync.js:assertViewReady().
async function assertViewReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${sourceName}" — tạo VIEW này trước (xem "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Hoá đơn theo khoảng giá trị (Script A, DSMART16).sql") rồi chạy lại script.`);
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
    name: 'Hoá đơn theo khoảng giá trị - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
    sourceTable: VIEW_NAME, keyColumn: 'STK_ID', dateColumn: 'WORK_DATE',
    dimensionColumns: [],
    measureColumns: MEASURE_COLUMNS,
    targetDomain: TARGET_DOMAIN, cronExpression: '*/15 * * * *'
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
  console.log('✅ Xong — job đồng bộ "Hoá đơn theo khoảng giá trị" đã sẵn sàng.');
  console.log('   KHÔNG cần tạo báo cáo riêng — domain này được "Báo cáo khách hàng theo tuần"');
  console.log('   (rp-server/lib/khachHangTuanRunner.js) tự đọc thêm, không cần seed báo cáo mới.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
